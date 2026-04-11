"""Phase 20: Domain document tables for in-memory router migration

Revision ID: f6a7b8c9d0e1
Revises: c4f8e2a1b9d3
Create Date: 2025-03-07

Creates 3 generic tables:
- domain_documents: Flexible JSON document store for all 22 routers
- domain_audit_entries: Unified audit trail
- domain_counters: Metrics and counters
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "f6a7b8c9d0e1"
down_revision = "c4f8e2a1b9d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── domain_documents ──────────────────────────────────────
    op.create_table(
        "domain_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("domain", sa.String(64), nullable=False, index=True),
        sa.Column("entity_type", sa.String(64), nullable=False, index=True),
        sa.Column("entity_id", sa.String(128), nullable=False, index=True),
        sa.Column("owner_id", sa.String(36), nullable=False, index=True, server_default="system"),
        sa.Column("org_id", sa.String(36), nullable=True, index=True),
        sa.Column("content", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active", index=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default="0", index=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.Column("title", sa.String(512), nullable=True, index=True),
        sa.Column("tags", sa.String(1024), nullable=True),
        sa.UniqueConstraint("domain", "entity_type", "entity_id", name="uq_domain_entity"),
    )
    op.create_index("ix_domain_entity_owner", "domain_documents",
                    ["domain", "entity_type", "owner_id"])
    op.create_index("ix_domain_status", "domain_documents",
                    ["domain", "status", "is_deleted"])
    op.create_index("ix_domain_created", "domain_documents",
                    ["domain", "created_at"])

    # ── domain_audit_entries ──────────────────────────────────
    op.create_table(
        "domain_audit_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("domain", sa.String(64), nullable=False, index=True),
        sa.Column("entity_type", sa.String(64), nullable=False, index=True),
        sa.Column("entity_id", sa.String(128), nullable=False, index=True),
        sa.Column("action", sa.String(32), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True, server_default="system"),
        sa.Column("changes", sa.JSON, nullable=True),
        sa.Column("snapshot", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("correlation_id", sa.String(64), nullable=True, index=True),
    )
    op.create_index("ix_audit_domain_entity", "domain_audit_entries",
                    ["domain", "entity_type", "entity_id"])
    op.create_index("ix_audit_domain_action", "domain_audit_entries",
                    ["domain", "action", "created_at"])
    op.create_index("ix_audit_user", "domain_audit_entries",
                    ["user_id", "created_at"])

    # ── domain_counters ───────────────────────────────────────
    op.create_table(
        "domain_counters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("domain", sa.String(64), nullable=False, index=True),
        sa.Column("counter_name", sa.String(128), nullable=False, index=True),
        sa.Column("entity_id", sa.String(128), nullable=True, index=True),
        sa.Column("value", sa.Float, nullable=False, server_default="0"),
        sa.Column("extra_data", sa.JSON, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("domain", "counter_name", "entity_id", name="uq_domain_counter"),
    )
    op.create_index("ix_counter_domain_name", "domain_counters",
                    ["domain", "counter_name"])


def downgrade() -> None:
    op.drop_table("domain_counters")
    op.drop_table("domain_audit_entries")
    op.drop_table("domain_documents")