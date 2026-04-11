#!/usr/bin/env python3
"""
Phase 21 — Automated Router Migration Script
Converts in-memory Dict stores → DomainStore instances across all 47 routers.

Strategy:
  - Dict[str, Dict[str, Any]] = {}  → store_factory(domain, entity_type)
  - Dict[str, List[...]] = {}       → list_store_factory(domain, entity_type)
  - dict[str, dict] = {}            → store_factory(domain, entity_type)
  - Dict[str, Any] = { ... }        → metrics_store_factory(domain, initial)  [SKIP - keep as-is]
  - Dict[str, float/int/bool] = {}  → metrics_store_factory(domain, initial)  [SKIP - keep as-is]
  - defaultdict(...)                 → SKIP (specialized)
  - List[Dict[str, Any]] = []       → audit_log_factory(domain)  [for _access_log patterns]

Non-destructive: Only modifies store declarations, not endpoint logic.
"""

import re
import os
import sys

ROUTERS_DIR = "routers"
DRY_RUN = "--dry-run" in sys.argv

# Stores to SKIP (config dicts with inline values, defaultdicts, specialized)
SKIP_STORES = {
    # Config/metrics dicts with inline initialization
    "admin._platform_config",
    "admin._maintenance_mode",
    "admin._users_store",     # seeded with data
    "admin._orgs_store",      # seeded with data
    "chaos_party._healing_loop_state",
    "chaos_party._resilience_scores",
    "icebox._metrics",
    "multiAI._metrics",
    "norman._vulnerability_cache",
    "observatory._pattern_cache",
    "search._search_stats",
    "self_healing._failure_counters",
    "sync._metrics",
    "the_dr._metrics",
    "the_dr._closed_loop_state",
    "tranquillity._service_registry",  # seeded with service data
    "treasury._cost_data",             # seeded with cost data
    "treasury._revenue_streams",       # seeded with revenue data
    # defaultdict
    "nexus._pheromone_trails",
    "hive._data_lineage",  # defaultdict(list)
    # Feature flags (simple bool dict)
    "adaptive_engine._feature_flag_overrides",
}

# List stores (Dict[str, List[...]]) — need list_store_factory
LIST_STORE_PATTERN = re.compile(r'^(_\w+)\s*:\s*Dict\[str,\s*List')

# Standard entity stores (Dict[str, Dict[str, Any]] = {})
DICT_STORE_PATTERNS = [
    re.compile(r'^(_\w+)\s*:\s*Dict\[str,\s*Dict\[str,\s*Any\]\]\s*=\s*\{\}\s*$'),
    re.compile(r'^(_\w+)\s*:\s*dict\[str,\s*dict\]\s*=\s*\{\}\s*$'),
    re.compile(r'^(_\w+)\s*:\s*dict\[str,\s*dict\[str,\s*\w+\]\]\s*=\s*\{\}\s*$'),
]

# Audit log stores (List[Dict[str, Any]] = [])
AUDIT_LOG_PATTERN = re.compile(r'^(_\w+)\s*:\s*List\[Dict\[str,\s*Any\]\]\s*=\s*\[\]\s*$')

# lille_sc, lunascene, solarscene use Dict[str, dict] = {}
SIMPLE_DICT_PATTERN = re.compile(r'^(_\w+)\s*:\s*Dict\[str,\s*dict\]\s*=\s*\{\}\s*$')


def entity_type_from_varname(varname: str) -> str:
    """Convert _my_store_name → my_store_name (strip leading underscore)."""
    return varname.lstrip("_")


def process_router(filepath: str) -> dict:
    """Process a single router file and return migration info."""
    rname = os.path.basename(filepath).replace(".py", "")
    
    with open(filepath, "r") as f:
        lines = f.readlines()
    
    changes = []
    new_lines = []
    needs_import = False
    has_import = False
    
    # Check if import already exists
    for line in lines:
        if "from router_migration_helper import" in line:
            has_import = True
            break
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.rstrip("\n")
        
        # Check for store declarations
        store_name = None
        store_type = None
        
        # Check standard dict stores
        for pattern in DICT_STORE_PATTERNS:
            m = pattern.match(stripped)
            if m:
                store_name = m.group(1)
                store_type = "dict"
                break
        
        # Check simple dict stores (Dict[str, dict] = {})
        if not store_name:
            m = SIMPLE_DICT_PATTERN.match(stripped)
            if m:
                store_name = m.group(1)
                store_type = "dict"
        
        # Check list stores
        if not store_name:
            m = LIST_STORE_PATTERN.match(stripped)
            if m:
                store_name = m.group(1)
                # Check if it's = {} (empty init)
                if "= {}" in stripped:
                    store_type = "list"
        
        # Check audit log stores
        if not store_name:
            m = AUDIT_LOG_PATTERN.match(stripped)
            if m:
                store_name = m.group(1)
                store_type = "audit_log"
        
        # Should we skip this store?
        skip_key = f"{rname}.{store_name}" if store_name else None
        if skip_key and skip_key in SKIP_STORES:
            new_lines.append(line)
            i += 1
            continue
        
        if store_name and store_type:
            entity = entity_type_from_varname(store_name)
            needs_import = True
            
            if store_type == "dict":
                replacement = f'{store_name} = store_factory("{rname}", "{entity}")\n'
                changes.append(f"  {store_name}: Dict → store_factory(&quot;{rname}&quot;, &quot;{entity}&quot;)")
            elif store_type == "list":
                replacement = f'{store_name} = list_store_factory("{rname}", "{entity}")\n'
                changes.append(f"  {store_name}: Dict[List] → list_store_factory(&quot;{rname}&quot;, &quot;{entity}&quot;)")
            elif store_type == "audit_log":
                replacement = f'{store_name} = audit_log_factory("{rname}", "{entity}")\n'
                changes.append(f"  {store_name}: List → audit_log_factory(&quot;{rname}&quot;, &quot;{entity}&quot;)")
            
            new_lines.append(replacement)
            i += 1
            continue
        
        new_lines.append(line)
        i += 1
    
    # Add import if needed and not already present
    if needs_import and not has_import:
        # Find the right place to insert import (after other imports)
        insert_idx = 0
        for idx, line in enumerate(new_lines):
            if line.startswith("from ") or line.startswith("import "):
                insert_idx = idx + 1
            elif line.startswith("router = "):
                break
        
        import_line = "from router_migration_helper import store_factory, list_store_factory, audit_log_factory\n"
        new_lines.insert(insert_idx, import_line)
        changes.insert(0, f"  + Added import for migration helpers")
    
    result = {
        "router": rname,
        "changes": changes,
        "modified": len(changes) > 0,
    }
    
    if changes and not DRY_RUN:
        with open(filepath, "w") as f:
            f.writelines(new_lines)
    
    return result


def main():
    print(f"Phase 21 Router Migration {'(DRY RUN)' if DRY_RUN else '(LIVE)'}")
    print("=" * 60)
    
    total_changes = 0
    total_routers = 0
    
    for fname in sorted(os.listdir(ROUTERS_DIR)):
        if not fname.endswith(".py") or fname.startswith("__"):
            continue
        
        filepath = os.path.join(ROUTERS_DIR, fname)
        result = process_router(filepath)
        
        if result["modified"]:
            total_routers += 1
            total_changes += len(result["changes"])
            print(f"\n{result['router']}.py ({len(result['changes'])} changes):")
            for change in result["changes"]:
                print(change)
    
    print(f"\n{'=' * 60}")
    print(f"Total: {total_changes} changes across {total_routers} routers")
    if DRY_RUN:
        print("(DRY RUN — no files modified)")


if __name__ == "__main__":
    main()