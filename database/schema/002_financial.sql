-- ============================================================
-- Arcadia Financial Systems Database Schema
-- Royal Bank of Arcadia + Arcadian Exchange
-- Version: 1.0.0
-- Compliance: GDPR, PCI DSS Level 4, SOC 2 Type II
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SECTION 1: COST MANAGEMENT (Royal Bank of Arcadia)
-- ============================================================

CREATE TABLE IF NOT EXISTS cost_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      TEXT NOT NULL UNIQUE,
    service_name    TEXT NOT NULL,
    service_category TEXT NOT NULL DEFAULT 'infrastructure',
    total_monthly_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    approval_status TEXT NOT NULL DEFAULT 'zero_cost'
                    CHECK (approval_status IN ('approved','pending','rejected','zero_cost')),
    last_audit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_audit_date TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    zero_alternative_url TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_dimensions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id      UUID NOT NULL REFERENCES cost_profiles(id) ON DELETE CASCADE,
    dimension       TEXT NOT NULL
                    CHECK (dimension IN (
                        'development','delivery','discovery','design','maintenance',
                        'strategy','functions','hosting','provisioning','upkeep',
                        'licensing','compliance'
                    )),
    amount          DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    justification   TEXT NOT NULL DEFAULT '',
    alternative_found BOOLEAN NOT NULL DEFAULT FALSE,
    alternative_description TEXT,
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    flagged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(profile_id, dimension)
);

CREATE TABLE IF NOT EXISTS cost_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      TEXT NOT NULL,
    service_name    TEXT NOT NULL,
    dimension       TEXT NOT NULL,
    amount          DECIMAL(12,4) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','under_review','approved','rejected','resolved')),
    assigned_to     TEXT,
    resolution_notes TEXT,
    resolved_at     TIMESTAMPTZ,
    alternatives    JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS free_tier_usage (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      TEXT NOT NULL UNIQUE,
    service_name    TEXT NOT NULL,
    provider        TEXT NOT NULL,
    metric          TEXT NOT NULL,
    tier_limit      BIGINT NOT NULL,
    current_usage   BIGINT NOT NULL DEFAULT 0,
    unit            TEXT NOT NULL,
    alert_threshold DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    reset_date      TIMESTAMPTZ,
    projected_exceed_date TIMESTAMPTZ,
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 2: REVENUE MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS revenue_streams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_key      TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'researching'
                    CHECK (status IN ('active','paused','researching','pending_approval','deprecated')),
    monthly_revenue DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    monthly_target  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    monthly_growth_rate DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    risk_score      INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    automation_level TEXT NOT NULL DEFAULT 'manual'
                    CHECK (automation_level IN ('full','semi','manual')),
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    last_review_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_optimisation_date TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    approved_by     TEXT NOT NULL DEFAULT 'system',
    approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT NOT NULL DEFAULT '',
    metrics         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_id       UUID REFERENCES revenue_streams(id),
    stream_key      TEXT NOT NULL,
    amount          DECIMAL(12,4) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    amount_usd      DECIMAL(12,4) NOT NULL,
    transaction_type TEXT NOT NULL,
    reference_id    TEXT,
    user_id         UUID,
    metadata        JSONB NOT NULL DEFAULT '{}',
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filing_period   TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-"Q"Q')
);

CREATE TABLE IF NOT EXISTS profit_margins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      TEXT NOT NULL,
    period          TEXT NOT NULL CHECK (period IN ('monthly','quarterly','annual')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    gross_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    transaction_costs DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    infrastructure_costs DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    support_costs   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    compliance_costs DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    marketing_costs DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    development_costs DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    legal_costs     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    gross_profit    DECIMAL(12,2) GENERATED ALWAYS AS (
        gross_revenue - transaction_costs - infrastructure_costs - support_costs - compliance_costs
    ) STORED,
    net_profit      DECIMAL(12,2) GENERATED ALWAYS AS (
        gross_revenue - transaction_costs - infrastructure_costs - support_costs -
        compliance_costs - marketing_costs - development_costs - legal_costs
    ) STORED,
    gross_margin_pct DECIMAL(8,4) GENERATED ALWAYS AS (
        CASE WHEN gross_revenue > 0
        THEN ((gross_revenue - transaction_costs - infrastructure_costs - support_costs - compliance_costs) / gross_revenue) * 100
        ELSE 0 END
    ) STORED,
    industry_benchmark_gross DECIMAL(8,4) NOT NULL DEFAULT 75.00,
    industry_benchmark_net  DECIMAL(8,4) NOT NULL DEFAULT 25.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(service_id, period, period_start)
);

-- ============================================================
-- SECTION 3: TAX ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_jurisdictions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            CHAR(2) NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    country         TEXT NOT NULL,
    tax_type        TEXT NOT NULL CHECK (tax_type IN ('VAT','GST','Sales','DigitalServices','Corporate','CapitalGains')),
    rate            DECIMAL(6,4) NOT NULL,
    reduced_rate    DECIMAL(6,4),
    threshold       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    registration_required BOOLEAN NOT NULL DEFAULT FALSE,
    registration_status TEXT NOT NULL DEFAULT 'not_required'
                    CHECK (registration_status IN ('not_required','pending','registered','exempt')),
    filing_frequency TEXT NOT NULL DEFAULT 'quarterly'
                    CHECK (filing_frequency IN ('monthly','quarterly','annual')),
    next_filing_date DATE,
    estimated_liability DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_calculations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  TEXT NOT NULL,
    user_id         UUID,
    user_jurisdiction CHAR(2) NOT NULL,
    platform_jurisdiction CHAR(2) NOT NULL DEFAULT 'GB',
    gross_amount    DECIMAL(12,4) NOT NULL,
    taxable_amount  DECIMAL(12,4) NOT NULL,
    tax_rate        DECIMAL(6,4) NOT NULL,
    tax_amount      DECIMAL(12,4) NOT NULL,
    net_amount      DECIMAL(12,4) NOT NULL,
    tax_type        TEXT NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filing_period   TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-"Q"Q'),
    filed           BOOLEAN NOT NULL DEFAULT FALSE,
    filed_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tax_filing_periods (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurisdiction_code CHAR(2) NOT NULL REFERENCES tax_jurisdictions(code),
    period          TEXT NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    due_date        DATE NOT NULL,
    total_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_tax       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','calculated','filed','paid','overdue')),
    filed_at        TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    reference_number TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(jurisdiction_code, period)
);

-- ============================================================
-- SECTION 4: APPROVAL WORKFLOW
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            TEXT NOT NULL
                    CHECK (type IN ('cost_approval','investment_approval','strategy_approval','risk_approval')),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    requested_by    TEXT NOT NULL,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tier            TEXT NOT NULL
                    CHECK (tier IN ('platform_admin','org_admin','super_admin','board')),
    sla_hours       INTEGER NOT NULL DEFAULT 24,
    due_by          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','deferred','expired')),
    amount          DECIMAL(12,2),
    currency        CHAR(3),
    risk_score      INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    decision        TEXT,
    conditions      TEXT[],
    attachments     TEXT[],
    related_service_id TEXT,
    related_stream_id UUID REFERENCES revenue_streams(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 5: MARKETPLACE (Arcadian Exchange - Front Layer)
-- ============================================================

CREATE TABLE IF NOT EXISTS marketplace_assets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    type            TEXT NOT NULL,
    seller_id       UUID NOT NULL,
    seller_name     TEXT NOT NULL,
    seller_verified BOOLEAN NOT NULL DEFAULT FALSE,
    price           DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    currency        CHAR(3) NOT NULL DEFAULT 'ARC',
    pricing_model   TEXT NOT NULL DEFAULT 'one_time'
                    CHECK (pricing_model IN ('one_time','monthly','annual','per_seat','usage_based','freemium','revenue_share')),
    category        TEXT NOT NULL,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    version         TEXT NOT NULL DEFAULT '1.0.0',
    downloads       INTEGER NOT NULL DEFAULT 0,
    rating          DECIMAL(3,2) NOT NULL DEFAULT 0.00 CHECK (rating BETWEEN 0 AND 5),
    review_count    INTEGER NOT NULL DEFAULT 0,
    license_type    TEXT NOT NULL DEFAULT 'MIT',
    compatible_with TEXT[] NOT NULL DEFAULT '{}',
    screenshots     TEXT[] NOT NULL DEFAULT '{}',
    demo_url        TEXT,
    documentation_url TEXT,
    source_url      TEXT,
    status          TEXT NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN ('draft','pending_review','active','suspended','deprecated')),
    commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.1500,
    featured        BOOLEAN NOT NULL DEFAULT FALSE,
    featured_until  TIMESTAMPTZ,
    total_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_purchases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        UUID NOT NULL REFERENCES marketplace_assets(id),
    buyer_id        UUID NOT NULL,
    seller_id       UUID NOT NULL,
    amount          DECIMAL(12,4) NOT NULL,
    commission      DECIMAL(12,4) NOT NULL,
    seller_amount   DECIMAL(12,4) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'ARC',
    payment_method  TEXT NOT NULL DEFAULT 'arc_token',
    status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('pending','completed','refunded','disputed')),
    license_key     TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        UUID NOT NULL REFERENCES marketplace_assets(id),
    reviewer_id     UUID NOT NULL,
    purchase_id     UUID REFERENCES marketplace_purchases(id),
    rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    helpful_count   INTEGER NOT NULL DEFAULT 0,
    verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(asset_id, reviewer_id)
);

-- ============================================================
-- SECTION 6: TRADING ENGINE (Arcadian Exchange)
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            TEXT NOT NULL CHECK (type IN ('market','limit','stop','auction')),
    side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
    asset_id        UUID REFERENCES marketplace_assets(id),
    asset_type      TEXT NOT NULL,
    quantity        DECIMAL(18,8) NOT NULL,
    price           DECIMAL(18,8),
    stop_price      DECIMAL(18,8),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','filled','cancelled','expired')),
    user_id         UUID NOT NULL,
    expires_at      TIMESTAMPTZ,
    filled_at       TIMESTAMPTZ,
    filled_quantity DECIMAL(18,8) NOT NULL DEFAULT 0,
    total_value     DECIMAL(18,8) NOT NULL DEFAULT 0,
    fee             DECIMAL(18,8) NOT NULL DEFAULT 0,
    fee_currency    CHAR(3) NOT NULL DEFAULT 'ARC',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buy_order_id    UUID NOT NULL REFERENCES orders(id),
    sell_order_id   UUID NOT NULL REFERENCES orders(id),
    asset_id        UUID REFERENCES marketplace_assets(id),
    quantity        DECIMAL(18,8) NOT NULL,
    price           DECIMAL(18,8) NOT NULL,
    total_value     DECIMAL(18,8) NOT NULL,
    buyer_fee       DECIMAL(18,8) NOT NULL DEFAULT 0,
    seller_fee      DECIMAL(18,8) NOT NULL DEFAULT 0,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 7: ARC TOKEN & WALLETS
-- ============================================================

CREATE TABLE IF NOT EXISTS arc_wallets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE,
    arc_balance     DECIMAL(18,8) NOT NULL DEFAULT 0,
    staked_arc      DECIMAL(18,8) NOT NULL DEFAULT 0,
    pending_rewards DECIMAL(18,8) NOT NULL DEFAULT 0,
    usd_balance     DECIMAL(12,4) NOT NULL DEFAULT 0,
    eur_balance     DECIMAL(12,4) NOT NULL DEFAULT 0,
    gbp_balance     DECIMAL(12,4) NOT NULL DEFAULT 0,
    total_value_usd DECIMAL(12,4) NOT NULL DEFAULT 0,
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arc_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id    UUID,
    to_user_id      UUID,
    type            TEXT NOT NULL
                    CHECK (type IN ('transfer','stake','unstake','reward','burn','mint','purchase','sale','fee')),
    amount          DECIMAL(18,8) NOT NULL,
    fee             DECIMAL(18,8) NOT NULL DEFAULT 0,
    reference_id    TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arc_staking_positions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL,
    amount          DECIMAL(18,8) NOT NULL,
    apy             DECIMAL(8,4) NOT NULL DEFAULT 12.5000,
    staked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlock_at       TIMESTAMPTZ,
    rewards_earned  DECIMAL(18,8) NOT NULL DEFAULT 0,
    last_reward_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','unlocking','unlocked','withdrawn'))
);

CREATE TABLE IF NOT EXISTS arc_token_metrics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_supply    DECIMAL(18,0) NOT NULL DEFAULT 1000000000,
    circulating_supply DECIMAL(18,0) NOT NULL DEFAULT 250000000,
    burned_supply   DECIMAL(18,0) NOT NULL DEFAULT 0,
    staked_supply   DECIMAL(18,0) NOT NULL DEFAULT 0,
    price_usd       DECIMAL(18,8) NOT NULL DEFAULT 0.001,
    price_change_24h DECIMAL(8,4) NOT NULL DEFAULT 0,
    market_cap_usd  DECIMAL(18,2) NOT NULL DEFAULT 0,
    volume_24h_usd  DECIMAL(18,2) NOT NULL DEFAULT 0,
    holders         INTEGER NOT NULL DEFAULT 0,
    transactions_24h INTEGER NOT NULL DEFAULT 0,
    apy             DECIMAL(8,4) NOT NULL DEFAULT 12.5000,
    next_burn_date  DATE,
    next_burn_amount DECIMAL(18,0),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 8: INVESTMENT ENGINE (Back Layer)
-- ============================================================

CREATE TABLE IF NOT EXISTS investment_strategies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_key    TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    description     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'paused'
                    CHECK (status IN ('active','paused','backtesting','pending_approval','deprecated')),
    risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    max_allocation  DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    current_allocation DECIMAL(5,4) NOT NULL DEFAULT 0,
    target_monthly_return DECIMAL(8,4) NOT NULL DEFAULT 0,
    actual_monthly_return DECIMAL(8,4) NOT NULL DEFAULT 0,
    sharpe_ratio    DECIMAL(8,4) NOT NULL DEFAULT 0,
    max_drawdown    DECIMAL(8,4) NOT NULL DEFAULT 0,
    win_rate        DECIMAL(5,4) NOT NULL DEFAULT 0,
    approved_by     TEXT NOT NULL DEFAULT 'system',
    approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_executed_at TIMESTAMPTZ,
    next_execution_at TIMESTAMPTZ,
    total_profit    DECIMAL(12,4) NOT NULL DEFAULT 0,
    total_trades    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_agents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'stopped'
                    CHECK (status IN ('running','stopped','error','paused')),
    strategy_id     UUID REFERENCES investment_strategies(id),
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    total_revenue   DECIMAL(12,4) NOT NULL DEFAULT 0,
    current_position DECIMAL(18,8),
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id          UUID NOT NULL REFERENCES bot_agents(id),
    level           TEXT NOT NULL CHECK (level IN ('info','warn','error','trade')),
    message         TEXT NOT NULL,
    data            JSONB,
    revenue         DECIMAL(12,4),
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_value     DECIMAL(12,4) NOT NULL DEFAULT 0,
    total_cost      DECIMAL(12,4) NOT NULL DEFAULT 0,
    total_return    DECIMAL(12,4) NOT NULL DEFAULT 0,
    total_return_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
    positions       JSONB NOT NULL DEFAULT '[]',
    allocation      JSONB NOT NULL DEFAULT '{}',
    risk_score      INTEGER NOT NULL DEFAULT 0,
    sharpe_ratio    DECIMAL(8,4) NOT NULL DEFAULT 0,
    snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 9: FINANCIAL AUDIT LEDGER (Immutable)
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      TEXT NOT NULL,
    user_id         UUID,
    service_id      TEXT,
    amount          DECIMAL(12,4),
    currency        CHAR(3),
    description     TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    hash            CHAR(64) NOT NULL,
    previous_hash   CHAR(64) NOT NULL,
    signature       TEXT NOT NULL DEFAULT 'pending',
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Make audit log append-only via RLS
ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert_only ON financial_audit_log
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY audit_log_select_authenticated ON financial_audit_log
    FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- Prevent updates and deletes on audit log
CREATE RULE no_update_audit AS ON UPDATE TO financial_audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO financial_audit_log DO INSTEAD NOTHING;

-- ============================================================
-- SECTION 10: RESEARCH ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS research_reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           TEXT NOT NULL,
    category        TEXT NOT NULL
                    CHECK (category IN ('cost_reduction','revenue_opportunity','market_intelligence','risk_assessment','compliance')),
    summary         TEXT NOT NULL,
    findings        JSONB NOT NULL DEFAULT '[]',
    recommendations JSONB NOT NULL DEFAULT '[]',
    opportunity_score INTEGER NOT NULL DEFAULT 0 CHECK (opportunity_score BETWEEN 0 AND 100),
    risk_score      INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    estimated_impact DECIMAL(12,2) NOT NULL DEFAULT 0,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by    TEXT NOT NULL DEFAULT 'ai_engine'
                    CHECK (generated_by IN ('ai_engine','human_analyst')),
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','actioned','archived')),
    sources         TEXT[] NOT NULL DEFAULT '{}',
    actioned_at     TIMESTAMPTZ,
    actioned_by     TEXT
);

-- ============================================================
-- SECTION 11: ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all financial tables
ALTER TABLE cost_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_margins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_agents ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY service_role_all ON cost_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON cost_alerts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON revenue_streams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON revenue_transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON profit_margins FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON tax_calculations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON approval_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON investment_strategies FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON bot_agents FOR ALL USING (auth.role() = 'service_role');

-- Users can see their own marketplace purchases and wallets
CREATE POLICY user_own_purchases ON marketplace_purchases
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY user_own_wallet ON arc_wallets
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_own_transactions ON arc_transactions
    FOR SELECT USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Marketplace assets are publicly readable when active
CREATE POLICY public_active_assets ON marketplace_assets
    FOR SELECT USING (status = 'active');

-- ============================================================
-- SECTION 12: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cost_alerts_status ON cost_alerts(status);
CREATE INDEX IF NOT EXISTS idx_cost_alerts_detected ON cost_alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_transactions_stream ON revenue_transactions(stream_id);
CREATE INDEX IF NOT EXISTS idx_revenue_transactions_period ON revenue_transactions(filing_period);
CREATE INDEX IF NOT EXISTS idx_tax_calculations_period ON tax_calculations(filing_period);
CREATE INDEX IF NOT EXISTS idx_tax_calculations_jurisdiction ON tax_calculations(user_jurisdiction);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_due ON approval_requests(due_by);
CREATE INDEX IF NOT EXISTS idx_marketplace_assets_status ON marketplace_assets(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_assets_category ON marketplace_assets(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_assets_type ON marketplace_assets(type);
CREATE INDEX IF NOT EXISTS idx_marketplace_assets_rating ON marketplace_assets(rating DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_buyer ON marketplace_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_seller ON marketplace_purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_asset ON orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_arc_transactions_from ON arc_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_arc_transactions_to ON arc_transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_arc_transactions_type ON arc_transactions(type);
CREATE INDEX IF NOT EXISTS idx_bot_logs_bot ON bot_logs(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(level);
CREATE INDEX IF NOT EXISTS idx_bot_logs_logged ON bot_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_audit_event ON financial_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_financial_audit_logged ON financial_audit_log(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_reports_category ON research_reports(category);
CREATE INDEX IF NOT EXISTS idx_research_reports_status ON research_reports(status);

-- ============================================================
-- SECTION 13: SEED DATA
-- ============================================================

-- Seed tax jurisdictions
INSERT INTO tax_jurisdictions (code, name, country, tax_type, rate, threshold, filing_frequency, currency)
VALUES
    ('GB', 'United Kingdom', 'UK', 'VAT', 20.00, 85000, 'quarterly', 'GBP'),
    ('DE', 'Germany', 'Germany', 'VAT', 19.00, 0, 'quarterly', 'EUR'),
    ('FR', 'France', 'France', 'VAT', 20.00, 0, 'quarterly', 'EUR'),
    ('NL', 'Netherlands', 'Netherlands', 'VAT', 21.00, 0, 'quarterly', 'EUR'),
    ('ES', 'Spain', 'Spain', 'VAT', 21.00, 0, 'quarterly', 'EUR'),
    ('IT', 'Italy', 'Italy', 'VAT', 22.00, 0, 'quarterly', 'EUR'),
    ('SE', 'Sweden', 'Sweden', 'VAT', 25.00, 0, 'quarterly', 'SEK'),
    ('US', 'United States', 'USA', 'Sales', 0.00, 100000, 'quarterly', 'USD'),
    ('AU', 'Australia', 'Australia', 'GST', 10.00, 75000, 'quarterly', 'AUD'),
    ('CA', 'Canada', 'Canada', 'GST', 5.00, 30000, 'quarterly', 'CAD'),
    ('SG', 'Singapore', 'Singapore', 'GST', 9.00, 1000000, 'quarterly', 'SGD'),
    ('JP', 'Japan', 'Japan', 'VAT', 10.00, 10000000, 'quarterly', 'JPY')
ON CONFLICT (code) DO NOTHING;

-- Seed revenue streams
INSERT INTO revenue_streams (stream_key, name, type, status, monthly_target, risk_score, automation_level, notes)
VALUES
    ('marketplace_commission', 'Marketplace Commission', 'marketplace_commission', 'active', 1000.00, 5, 'full', '5-15% commission on all marketplace sales'),
    ('api_access_tiers', 'API Access Tiers', 'api_access', 'researching', 500.00, 5, 'full', 'Freemium API with paid tiers'),
    ('arc_token_staking', 'ARC Token Staking Rewards', 'staking', 'active', 300.00, 20, 'full', 'Platform earns 10% of staking yield pool'),
    ('affiliate_program', 'Affiliate Program', 'affiliate', 'active', 200.00, 5, 'full', 'Referral commissions from partner services'),
    ('data_insights', 'Anonymised Data Insights', 'data_insights', 'researching', 200.00, 10, 'full', 'GDPR-compliant aggregate data licensing'),
    ('white_label', 'White-Label Licensing', 'white_label', 'researching', 2000.00, 5, 'semi', 'License Infinity OS to other organisations'),
    ('defi_yield', 'DeFi Yield Farming', 'defi_yield', 'pending_approval', 500.00, 40, 'semi', 'Deploy treasury to approved DeFi protocols'),
    ('trading_fees', 'Exchange Trading Fees', 'trading_fees', 'active', 500.00, 5, 'full', '0.1-0.5% per trade on AEX'),
    ('listing_fees', 'Marketplace Listing Fees', 'listing_fees', 'active', 200.00, 5, 'full', 'One-time listing fee for premium placement')
ON CONFLICT (stream_key) DO NOTHING;

-- Seed investment strategies
INSERT INTO investment_strategies (strategy_key, name, type, description, status, risk_score, max_allocation, target_monthly_return, win_rate, sharpe_ratio)
VALUES
    ('arbitrage', 'Arbitrage Agent', 'arbitrage', 'Monitors price differences and executes risk-free arbitrage', 'active', 20, 0.15, 0.5, 0.94, 2.1),
    ('market_making', 'Market Maker Agent', 'market_making', 'Provides liquidity and earns bid-ask spread', 'active', 25, 0.20, 1.0, 0.87, 1.8),
    ('defi_yield', 'DeFi Yield Optimizer', 'defi_yield', 'Moves funds to highest-yield DeFi protocols', 'paused', 40, 0.20, 8.0, 0.78, 1.2),
    ('affiliate', 'Affiliate & Referral Agent', 'affiliate', 'Manages affiliate registrations and referral conversions', 'active', 5, 0.05, 3.0, 0.99, 3.5),
    ('sentiment_trading', 'Sentiment Analysis Trader', 'sentiment_trading', 'Trades based on news and social media sentiment', 'paused', 55, 0.10, 5.0, 0.65, 0.9)
ON CONFLICT (strategy_key) DO NOTHING;

-- Seed initial ARC token metrics
INSERT INTO arc_token_metrics (total_supply, circulating_supply, burned_supply, staked_supply, price_usd, market_cap_usd, apy)
VALUES (1000000000, 250000000, 0, 50000000, 0.001, 250000, 12.5);

-- ============================================================
-- SECTION 14: FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cost_profiles_updated_at BEFORE UPDATE ON cost_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_cost_alerts_updated_at BEFORE UPDATE ON cost_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_revenue_streams_updated_at BEFORE UPDATE ON revenue_streams FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_marketplace_assets_updated_at BEFORE UPDATE ON marketplace_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_approval_requests_updated_at BEFORE UPDATE ON approval_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function: Calculate marketplace asset average rating
CREATE OR REPLACE FUNCTION update_asset_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE marketplace_assets
    SET rating = (
        SELECT AVG(rating)::DECIMAL(3,2)
        FROM marketplace_reviews
        WHERE asset_id = NEW.asset_id
    ),
    review_count = (
        SELECT COUNT(*)
        FROM marketplace_reviews
        WHERE asset_id = NEW.asset_id
    )
    WHERE id = NEW.asset_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rating_on_review
AFTER INSERT OR UPDATE ON marketplace_reviews
FOR EACH ROW EXECUTE FUNCTION update_asset_rating();

-- Function: Update download count on purchase
CREATE OR REPLACE FUNCTION increment_asset_downloads()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE marketplace_assets
    SET downloads = downloads + 1,
        total_revenue = total_revenue + NEW.amount
    WHERE id = NEW.asset_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_downloads_on_purchase
AFTER INSERT ON marketplace_purchases
FOR EACH ROW EXECUTE FUNCTION increment_asset_downloads();

-- Function: Check zero-cost mandate compliance
CREATE OR REPLACE FUNCTION check_zero_cost_mandate()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.amount > 0 THEN
        INSERT INTO financial_audit_log (
            event_type, service_id, amount, currency, description,
            metadata, hash, previous_hash
        ) VALUES (
            'ZERO_COST_VIOLATION',
            NEW.service_id,
            NEW.amount,
            NEW.currency,
            'Zero-cost mandate violation detected: ' || NEW.service_name || ' - ' || NEW.dimension,
            jsonb_build_object('alert_id', NEW.id, 'dimension', NEW.dimension),
            encode(digest(NEW.id::text || NOW()::text, 'sha256'), 'hex'),
            '0000000000000000000000000000000000000000000000000000000000000000'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_zero_cost_mandate
AFTER INSERT ON cost_alerts
FOR EACH ROW EXECUTE FUNCTION check_zero_cost_mandate();

-- View: Financial Dashboard Summary
CREATE OR REPLACE VIEW financial_dashboard AS
SELECT
    (SELECT COALESCE(SUM(monthly_revenue), 0) FROM revenue_streams WHERE status = 'active') AS total_monthly_revenue,
    (SELECT COALESCE(SUM(monthly_target), 0) FROM revenue_streams WHERE status = 'active') AS total_monthly_target,
    (SELECT COUNT(*) FROM cost_alerts WHERE status = 'open') AS open_cost_alerts,
    (SELECT COALESCE(SUM(amount), 0) FROM cost_alerts WHERE status = 'open') AS total_flagged_costs,
    (SELECT COUNT(*) FROM approval_requests WHERE status = 'pending') AS pending_approvals,
    (SELECT COUNT(*) FROM marketplace_assets WHERE status = 'active') AS active_listings,
    (SELECT COALESCE(SUM(total_revenue), 0) FROM marketplace_assets) AS total_marketplace_revenue,
    (SELECT COUNT(*) FROM bot_agents WHERE status = 'running') AS active_bots,
    (SELECT price_usd FROM arc_token_metrics ORDER BY recorded_at DESC LIMIT 1) AS arc_price_usd,
    (SELECT circulating_supply FROM arc_token_metrics ORDER BY recorded_at DESC LIMIT 1) AS arc_circulating_supply,
    NOW() AS generated_at;