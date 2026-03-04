"""The TownHall — Governance Hub tables (Platform 21)

Revision ID: e1f2a3b4c5d6
Revises: d5e6f7a8b9c0
Create Date: 2025-01-01T00:00:00.000000

Tables added:
- townhall_policies          (Policy Hub — version-controlled, machine-readable)
- townhall_procedures        (Procedures Library)
- townhall_board_meetings    (Governance Boardroom)
- townhall_board_resolutions (Board Resolutions & Voting)
- townhall_ip_registry       (IP Analysis & Review)
- townhall_legal_contracts   (Legal & Paralegal Support)

2060 Standard: ML-DSA-65 quantum signatures, IPFS CIDs, Arbitrum L2 tx hashes
Zero-Cost: All tables on self-hosted PostgreSQL (Oracle Always Free K3s)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

# revision identifiers
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # ── townhall_policies ──────────────────────────────────────────────────────
    op.create_table(
        'townhall_policies',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('policy_id', sa.String(50), unique=True, nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('category', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('rego_content', sa.Text, nullable=True),
        sa.Column('version', sa.String(20), server_default='1.0.0', nullable=False),
        sa.Column('status', sa.String(50), server_default='draft', nullable=False),
        sa.Column('applicable_frameworks', sa.Text, nullable=True),
        sa.Column('tags', sa.Text, nullable=True),
        # 2060 standard
        sa.Column('quantum_signature', sa.Text, nullable=True),
        sa.Column('ipfs_cid', sa.String(100), nullable=True),
        sa.Column('chain_tx_hash', sa.String(100), nullable=True),
        # Audit
        sa.Column('created_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('approved_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_townhall_policy_category', 'townhall_policies', ['category'])
    op.create_index('idx_townhall_policy_status', 'townhall_policies', ['status'])

    # ── townhall_procedures ────────────────────────────────────────────────────
    op.create_table(
        'townhall_procedures',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('procedure_id', sa.String(50), unique=True, nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('category', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('version', sa.String(20), server_default='1.0.0', nullable=False),
        sa.Column('status', sa.String(50), server_default='active', nullable=False),
        sa.Column('related_policy_ids', sa.Text, nullable=True),
        sa.Column('tags', sa.Text, nullable=True),
        sa.Column('created_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_townhall_proc_category', 'townhall_procedures', ['category'])

    # ── townhall_board_meetings ────────────────────────────────────────────────
    op.create_table(
        'townhall_board_meetings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('meeting_type', sa.String(50), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(50), server_default='scheduled', nullable=False),
        sa.Column('location', sa.String(500), nullable=True),
        sa.Column('agenda', sa.Text, nullable=True),
        sa.Column('attendees', sa.Text, nullable=True),
        sa.Column('minutes', sa.Text, nullable=True),
        sa.Column('quorum_met', sa.Boolean, server_default='false'),
        sa.Column('recording_ipfs_cid', sa.String(100), nullable=True),
        sa.Column('chain_tx_hash', sa.String(100), nullable=True),
        sa.Column('created_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_townhall_meeting_type', 'townhall_board_meetings', ['meeting_type'])
    op.create_index('idx_townhall_meeting_status', 'townhall_board_meetings', ['status'])
    op.create_index('idx_townhall_meeting_scheduled', 'townhall_board_meetings', ['scheduled_at'])

    # ── townhall_board_resolutions ─────────────────────────────────────────────
    op.create_table(
        'townhall_board_resolutions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('meeting_id', UUID(as_uuid=True), sa.ForeignKey('townhall_board_meetings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('resolution_number', sa.String(50), unique=True, nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('resolution_text', sa.Text, nullable=False),
        sa.Column('proposed_by', sa.String, nullable=True),
        sa.Column('status', sa.String(50), server_default='open', nullable=False),
        sa.Column('votes_for', sa.Integer, server_default='0'),
        sa.Column('votes_against', sa.Integer, server_default='0'),
        sa.Column('votes_abstain', sa.Integer, server_default='0'),
        sa.Column('quantum_signature', sa.Text, nullable=True),
        sa.Column('chain_tx_hash', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_townhall_resolution_meeting', 'townhall_board_resolutions', ['meeting_id'])
    op.create_index('idx_townhall_resolution_status', 'townhall_board_resolutions', ['status'])

    # ── townhall_ip_registry ───────────────────────────────────────────────────
    op.create_table(
        'townhall_ip_registry',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('ip_type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('classification', sa.String(50), server_default='INTERNAL', nullable=False),
        sa.Column('status', sa.String(50), server_default='registered', nullable=False),
        sa.Column('creators', sa.Text, nullable=True),
        sa.Column('tags', sa.Text, nullable=True),
        sa.Column('related_platforms', sa.Text, nullable=True),
        sa.Column('c2pa_manifest', sa.Text, nullable=True),
        sa.Column('quantum_signature', sa.Text, nullable=True),
        sa.Column('ipfs_cid', sa.String(100), nullable=True),
        sa.Column('created_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_townhall_ip_type', 'townhall_ip_registry', ['ip_type'])
    op.create_index('idx_townhall_ip_classification', 'townhall_ip_registry', ['classification'])

    # ── townhall_legal_contracts ───────────────────────────────────────────────
    op.create_table(
        'townhall_legal_contracts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('contract_type', sa.String(100), nullable=False),
        sa.Column('parties', sa.Text, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('status', sa.String(50), server_default='draft', nullable=False),
        sa.Column('effective_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expiry_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('value', sa.Float, nullable=True),
        sa.Column('ai_analysis', sa.Text, nullable=True),
        sa.Column('risk_score', sa.Float, nullable=True),
        sa.Column('tags', sa.Text, nullable=True),
        sa.Column('quantum_signature', sa.Text, nullable=True),
        sa.Column('ipfs_cid', sa.String(100), nullable=True),
        sa.Column('created_by', sa.String, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_townhall_contract_type', 'townhall_legal_contracts', ['contract_type'])
    op.create_index('idx_townhall_contract_status', 'townhall_legal_contracts', ['status'])
    op.create_index('idx_townhall_contract_expiry', 'townhall_legal_contracts', ['expiry_date'])


def downgrade() -> None:
    op.drop_table('townhall_legal_contracts')
    op.drop_table('townhall_ip_registry')
    op.drop_table('townhall_board_resolutions')
    op.drop_table('townhall_board_meetings')
    op.drop_table('townhall_procedures')
    op.drop_table('townhall_policies')