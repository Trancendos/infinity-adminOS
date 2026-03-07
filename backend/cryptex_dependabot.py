"""
The Cryptex — Dependabot Vulnerability Ingestion Pipeline
═══════════════════════════════════════════════════════════

Norman AI's vulnerability management arm. Ingests GitHub Dependabot alerts
via the GitHub API, maps them to the Three-Lane Mesh architecture, assigns
SLA deadlines, and generates remediation plans.

This is a CROSS-LANE service — vulnerabilities can affect any lane:
  • Lane 1 (AI / Nexus):    Python deps used by AI agents
  • Lane 2 (User / Infinity): Next.js, frontend deps
  • Lane 3 (Data / Hive):    aiohttp, data pipeline deps

Architecture:
  GitHub Dependabot → Cryptex Ingestion → Norman Analysis → Kernel Event Bus
                                                          → Observatory Metrics
                                                          → Lighthouse Alerts
"""

import json
import hashlib
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
from dataclasses import dataclass, field
import uuid

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from vulnerability_scanner import (
    VulnerabilitySeverity, RemediationStatus, SLA_DAYS,
)


# ════════════════════════════════════════════════════════════
# THREE-LANE MESH MAPPING
# ════════════════════════════════════════════════════════════

class MeshLane(str, Enum):
    """Three-Lane Mesh traffic classification."""
    AI_NEXUS = "ai_nexus"           # Lane 1: AI agents communicate via The Nexus
    USER_INFINITY = "user_infinity"  # Lane 2: Users travel through Infinity One
    DATA_HIVE = "data_hive"         # Lane 3: Data flows through The Hive
    CROSS_LANE = "cross_lane"       # Platform services spanning all lanes


# Package → Lane mapping based on where the dependency is consumed
PACKAGE_LANE_MAP: Dict[str, MeshLane] = {
    # Lane 1 — AI / Nexus (Python AI agent dependencies)
    "python-jose": MeshLane.AI_NEXUS,       # JWT auth for AI agent tokens
    "opentelemetry-api": MeshLane.CROSS_LANE,
    "opentelemetry-sdk": MeshLane.CROSS_LANE,
    "c2pa-python": MeshLane.AI_NEXUS,       # AI content provenance

    # Lane 2 — User / Infinity (Frontend, user-facing)
    "next": MeshLane.USER_INFINITY,          # Next.js — user-facing apps
    "react": MeshLane.USER_INFINITY,
    "react-dom": MeshLane.USER_INFINITY,

    # Lane 3 — Data / Hive (Data transport, APIs)
    "aiohttp": MeshLane.DATA_HIVE,           # Async HTTP for data pipelines
    "httpx": MeshLane.DATA_HIVE,             # HTTP client for data fetching
    "requests": MeshLane.DATA_HIVE,          # HTTP requests for data sync
    "orjson": MeshLane.DATA_HIVE,            # Fast JSON for data serialisation
    "sqlalchemy": MeshLane.DATA_HIVE,        # Database ORM — data layer
    "asyncpg": MeshLane.DATA_HIVE,           # PostgreSQL driver — data layer

    # Cross-Lane (platform infrastructure)
    "hono": MeshLane.CROSS_LANE,             # Cloudflare Workers — edge routing
    "fastapi": MeshLane.CROSS_LANE,          # API framework — all lanes
    "uvicorn": MeshLane.CROSS_LANE,          # ASGI server — all lanes
    "gunicorn": MeshLane.CROSS_LANE,         # WSGI server — all lanes
    "python-multipart": MeshLane.CROSS_LANE, # Form parsing — all lanes
    "bcrypt": MeshLane.CROSS_LANE,           # Password hashing — auth
    "pydantic": MeshLane.CROSS_LANE,         # Validation — all lanes
    "black": MeshLane.CROSS_LANE,            # Code formatter — dev tooling
    "alembic": MeshLane.DATA_HIVE,           # DB migrations — data layer
}


def classify_lane(package_name: str, ecosystem: str) -> MeshLane:
    """Classify a package into its Three-Lane Mesh lane."""
    # Direct mapping
    if package_name in PACKAGE_LANE_MAP:
        return PACKAGE_LANE_MAP[package_name]

    # Heuristic: npm frontend packages → User/Infinity lane
    if ecosystem == "npm":
        if any(kw in package_name.lower() for kw in ["react", "next", "vue", "angular", "svelte", "ui", "css"]):
            return MeshLane.USER_INFINITY
        if any(kw in package_name.lower() for kw in ["worker", "edge", "wrangler", "cloudflare"]):
            return MeshLane.CROSS_LANE
        return MeshLane.USER_INFINITY  # Default npm → user lane

    # Heuristic: pip AI/ML packages → AI/Nexus lane
    if ecosystem == "pip":
        if any(kw in package_name.lower() for kw in ["torch", "tensorflow", "transformers", "openai", "langchain", "llm"]):
            return MeshLane.AI_NEXUS
        if any(kw in package_name.lower() for kw in ["sql", "db", "redis", "postgres", "mongo", "data"]):
            return MeshLane.DATA_HIVE
        return MeshLane.CROSS_LANE  # Default pip → cross-lane

    return MeshLane.CROSS_LANE


# ════════════════════════════════════════════════════════════
# DEPENDABOT ALERT MODEL
# ════════════════════════════════════════════════════════════

@dataclass
class DependabotAlert:
    """A GitHub Dependabot security alert mapped to the Cryptex model."""
    number: int
    severity: VulnerabilitySeverity
    package_name: str
    ecosystem: str
    summary: str
    patched_version: Optional[str]
    created_at: str
    mesh_lane: MeshLane
    sla_deadline: Optional[str] = None
    sla_breached: bool = False
    remediation_status: RemediationStatus = RemediationStatus.PENDING
    remediation_action: Optional[str] = None
    blast_radius: Optional[str] = None

    def __post_init__(self):
        # Calculate SLA deadline
        days = SLA_DAYS.get(self.severity, 180)
        try:
            created = datetime.fromisoformat(self.created_at.replace("Z", "+00:00"))
            deadline = created + timedelta(days=days)
            self.sla_deadline = deadline.isoformat()
            self.sla_breached = datetime.now(timezone.utc) > deadline
        except Exception:
            pass

        # Generate remediation action
        if self.patched_version:
            self.remediation_action = f"Update {self.package_name} to >={self.patched_version}"
        else:
            self.remediation_action = f"No patch available — monitor {self.package_name} for updates or find alternative"

        # Assess blast radius based on lane
        if self.mesh_lane == MeshLane.CROSS_LANE:
            self.blast_radius = "ALL_LANES — affects entire platform"
        elif self.mesh_lane == MeshLane.AI_NEXUS:
            self.blast_radius = "LANE_1 — AI agent communication compromised"
        elif self.mesh_lane == MeshLane.USER_INFINITY:
            self.blast_radius = "LANE_2 — User-facing services exposed"
        elif self.mesh_lane == MeshLane.DATA_HIVE:
            self.blast_radius = "LANE_3 — Data pipeline integrity at risk"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "number": self.number,
            "severity": self.severity.value,
            "package": self.package_name,
            "ecosystem": self.ecosystem,
            "summary": self.summary,
            "patched_version": self.patched_version,
            "mesh_lane": self.mesh_lane.value,
            "blast_radius": self.blast_radius,
            "sla_deadline": self.sla_deadline,
            "sla_breached": self.sla_breached,
            "remediation_status": self.remediation_status.value,
            "remediation_action": self.remediation_action,
            "created_at": self.created_at,
        }


# ════════════════════════════════════════════════════════════
# GITHUB DEPENDABOT API CLIENT
# ════════════════════════════════════════════════════════════

class CryptexDependabotClient:
    """
    The Cryptex's GitHub Dependabot integration.
    Fetches, classifies, and manages vulnerability alerts.
    """

    def __init__(self, github_token: str, owner: str = "Trancendos", repo: str = "infinity-portal"):
        self.github_token = github_token
        self.owner = owner
        self.repo = repo
        self.base_url = f"https://api.github.com/repos/{owner}/{repo}"
        self._alerts_cache: List[DependabotAlert] = []
        self._last_fetch: Optional[datetime] = None

    async def fetch_alerts(self, state: str = "open") -> List[DependabotAlert]:
        """Fetch Dependabot alerts from GitHub and classify by mesh lane."""
        if not HTTPX_AVAILABLE:
            raise RuntimeError("httpx required for GitHub API calls")

        headers = {
            "Authorization": f"token {self.github_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        alerts: List[DependabotAlert] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            page = 1
            while True:
                resp = await client.get(
                    f"{self.base_url}/dependabot/alerts",
                    headers=headers,
                    params={"state": state, "per_page": 100, "page": page},
                )
                if resp.status_code != 200:
                    raise RuntimeError(f"GitHub API error {resp.status_code}: {resp.text[:200]}")

                data = resp.json()
                if not data:
                    break

                for item in data:
                    advisory = item.get("security_advisory", {})
                    vuln = item.get("security_vulnerability", {})
                    pkg = vuln.get("package", {})

                    severity_str = advisory.get("severity", "unknown").lower()
                    severity_map = {
                        "critical": VulnerabilitySeverity.CRITICAL,
                        "high": VulnerabilitySeverity.HIGH,
                        "medium": VulnerabilitySeverity.MEDIUM,
                        "moderate": VulnerabilitySeverity.MEDIUM,
                        "low": VulnerabilitySeverity.LOW,
                    }
                    severity = severity_map.get(severity_str, VulnerabilitySeverity.UNKNOWN)

                    package_name = pkg.get("name", "unknown")
                    ecosystem = pkg.get("ecosystem", "unknown")
                    patched = vuln.get("first_patched_version", {})
                    patched_version = patched.get("identifier") if patched else None

                    alert = DependabotAlert(
                        number=item.get("number", 0),
                        severity=severity,
                        package_name=package_name,
                        ecosystem=ecosystem,
                        summary=advisory.get("summary", "No summary"),
                        patched_version=patched_version,
                        created_at=item.get("created_at", datetime.now(timezone.utc).isoformat()),
                        mesh_lane=classify_lane(package_name, ecosystem),
                    )
                    alerts.append(alert)

                page += 1
                if len(data) < 100:
                    break

        self._alerts_cache = alerts
        self._last_fetch = datetime.now(timezone.utc)
        return alerts

    def get_lane_report(self) -> Dict[str, Any]:
        """Generate a Three-Lane Mesh vulnerability report."""
        if not self._alerts_cache:
            return {"error": "No alerts cached. Call fetch_alerts() first."}

        lanes = {
            MeshLane.AI_NEXUS: [],
            MeshLane.USER_INFINITY: [],
            MeshLane.DATA_HIVE: [],
            MeshLane.CROSS_LANE: [],
        }

        for alert in self._alerts_cache:
            lanes[alert.mesh_lane].append(alert)

        def lane_summary(lane_alerts: List[DependabotAlert]) -> Dict:
            return {
                "total": len(lane_alerts),
                "critical": sum(1 for a in lane_alerts if a.severity == VulnerabilitySeverity.CRITICAL),
                "high": sum(1 for a in lane_alerts if a.severity == VulnerabilitySeverity.HIGH),
                "medium": sum(1 for a in lane_alerts if a.severity == VulnerabilitySeverity.MEDIUM),
                "low": sum(1 for a in lane_alerts if a.severity == VulnerabilitySeverity.LOW),
                "sla_breached": sum(1 for a in lane_alerts if a.sla_breached),
                "fix_available": sum(1 for a in lane_alerts if a.patched_version),
                "alerts": [a.to_dict() for a in lane_alerts],
            }

        total_breached = sum(1 for a in self._alerts_cache if a.sla_breached)
        total_critical = sum(1 for a in self._alerts_cache if a.severity == VulnerabilitySeverity.CRITICAL)

        return {
            "report_id": str(uuid.uuid4())[:12],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "last_fetch": self._last_fetch.isoformat() if self._last_fetch else None,
            "total_alerts": len(self._alerts_cache),
            "total_sla_breached": total_breached,
            "risk_level": (
                "CRITICAL" if total_critical > 0
                else "HIGH" if any(a.severity == VulnerabilitySeverity.HIGH for a in self._alerts_cache)
                else "MEDIUM" if any(a.severity == VulnerabilitySeverity.MEDIUM for a in self._alerts_cache)
                else "LOW"
            ),
            "lanes": {
                "lane_1_ai_nexus": lane_summary(lanes[MeshLane.AI_NEXUS]),
                "lane_2_user_infinity": lane_summary(lanes[MeshLane.USER_INFINITY]),
                "lane_3_data_hive": lane_summary(lanes[MeshLane.DATA_HIVE]),
                "cross_lane_platform": lane_summary(lanes[MeshLane.CROSS_LANE]),
            },
        }

    def get_remediation_plan(self) -> Dict[str, Any]:
        """Generate a prioritised remediation plan grouped by action."""
        if not self._alerts_cache:
            return {"error": "No alerts cached. Call fetch_alerts() first."}

        # Group by package for batch remediation
        package_groups: Dict[str, List[DependabotAlert]] = {}
        for alert in self._alerts_cache:
            key = f"{alert.package_name}@{alert.ecosystem}"
            if key not in package_groups:
                package_groups[key] = []
            package_groups[key].append(alert)

        # Sort by highest severity in group
        severity_order = {
            VulnerabilitySeverity.CRITICAL: 0,
            VulnerabilitySeverity.HIGH: 1,
            VulnerabilitySeverity.MEDIUM: 2,
            VulnerabilitySeverity.LOW: 3,
            VulnerabilitySeverity.UNKNOWN: 4,
        }

        remediation_items = []
        for key, alerts in sorted(
            package_groups.items(),
            key=lambda x: min(severity_order.get(a.severity, 99) for a in x[1])
        ):
            highest_severity = min(alerts, key=lambda a: severity_order.get(a.severity, 99)).severity
            any_breached = any(a.sla_breached for a in alerts)
            patched = alerts[0].patched_version  # All alerts for same package share fix
            lane = alerts[0].mesh_lane

            remediation_items.append({
                "package": alerts[0].package_name,
                "ecosystem": alerts[0].ecosystem,
                "alert_count": len(alerts),
                "alert_numbers": [a.number for a in alerts],
                "highest_severity": highest_severity.value,
                "sla_breached": any_breached,
                "mesh_lane": lane.value,
                "blast_radius": alerts[0].blast_radius,
                "fix_available": patched is not None,
                "target_version": patched,
                "action": f"Update {alerts[0].package_name} to >={patched}" if patched else f"Monitor — no fix available for {alerts[0].package_name}",
                "summaries": list(set(a.summary for a in alerts)),
            })

        return {
            "plan_id": str(uuid.uuid4())[:12],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_packages": len(remediation_items),
            "total_alerts": len(self._alerts_cache),
            "sla_breached_packages": sum(1 for r in remediation_items if r["sla_breached"]),
            "remediation_items": remediation_items,
        }


# ════════════════════════════════════════════════════════════
# KERNEL EVENT BUS INTEGRATION
# ════════════════════════════════════════════════════════════

def generate_kernel_events(alerts: List[DependabotAlert]) -> List[Dict[str, Any]]:
    """
    Generate Kernel Event Bus events for vulnerability alerts.
    These events are consumed by:
      - The Observatory (metrics/dashboards)
      - Lighthouse (user notifications)
      - Norman AI (threat intelligence correlation)
    """
    events = []

    # Summary event
    events.append({
        "event_type": "cryptex.vulnerability.scan_complete",
        "source": "the_cryptex",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "total_alerts": len(alerts),
            "critical": sum(1 for a in alerts if a.severity == VulnerabilitySeverity.CRITICAL),
            "high": sum(1 for a in alerts if a.severity == VulnerabilitySeverity.HIGH),
            "medium": sum(1 for a in alerts if a.severity == VulnerabilitySeverity.MEDIUM),
            "low": sum(1 for a in alerts if a.severity == VulnerabilitySeverity.LOW),
            "sla_breached": sum(1 for a in alerts if a.sla_breached),
            "lanes_affected": list(set(a.mesh_lane.value for a in alerts)),
        },
        "routing": {
            "targets": ["observatory", "lighthouse", "norman"],
            "priority": "high" if any(a.severity == VulnerabilitySeverity.CRITICAL for a in alerts) else "normal",
        },
    })

    # Individual critical/high alert events (for immediate action)
    for alert in alerts:
        if alert.severity in [VulnerabilitySeverity.CRITICAL, VulnerabilitySeverity.HIGH]:
            events.append({
                "event_type": "cryptex.vulnerability.alert",
                "source": "the_cryptex",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": alert.to_dict(),
                "routing": {
                    "targets": ["norman", "lighthouse"],
                    "priority": "critical" if alert.severity == VulnerabilitySeverity.CRITICAL else "high",
                    "lane": alert.mesh_lane.value,
                },
            })

    # SLA breach events
    breached = [a for a in alerts if a.sla_breached]
    if breached:
        events.append({
            "event_type": "cryptex.vulnerability.sla_breach",
            "source": "the_cryptex",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "breached_count": len(breached),
                "breached_alerts": [a.to_dict() for a in breached],
            },
            "routing": {
                "targets": ["norman", "lighthouse", "observatory"],
                "priority": "critical",
                "escalation": True,
            },
        })

    return events


# ════════════════════════════════════════════════════════════
# AUTOMATED REMEDIATION ENGINE
# ════════════════════════════════════════════════════════════

def generate_remediation_commands(alerts: List[DependabotAlert]) -> Dict[str, List[str]]:
    """
    Generate shell commands to fix vulnerabilities.
    Grouped by ecosystem for batch execution.
    """
    pip_updates: Dict[str, str] = {}
    npm_updates: Dict[str, str] = {}

    for alert in alerts:
        if not alert.patched_version:
            continue

        if alert.ecosystem == "pip":
            # Track highest required version per package
            current = pip_updates.get(alert.package_name)
            if not current or alert.patched_version > current:
                pip_updates[alert.package_name] = alert.patched_version
        elif alert.ecosystem == "npm":
            current = npm_updates.get(alert.package_name)
            if not current or alert.patched_version > current:
                npm_updates[alert.package_name] = alert.patched_version

    commands = {
        "pip": [],
        "npm": [],
        "requirements_txt_updates": [],
        "package_json_updates": [],
    }

    # Python remediation
    for pkg, version in sorted(pip_updates.items()):
        commands["pip"].append(f"pip install '{pkg}>={version}'")
        commands["requirements_txt_updates"].append(f"{pkg}>={version}")

    # npm remediation
    for pkg, version in sorted(npm_updates.items()):
        commands["npm"].append(f"npm install {pkg}@{version}")
        commands["package_json_updates"].append(f'"{pkg}": "^{version}"')

    return commands