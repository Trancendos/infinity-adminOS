-- Infinity OS - Adaptive Intelligence & 2060 Future-Proof Schema
-- Version: 1.0.0
-- Created: 2024
-- Purpose: AI/ML, adaptive systems, quantum-safe crypto, and swarm intelligence

-- ============================================================================
-- ADAPTIVE INTELLIGENCE TABLES
-- ============================================================================

-- Intelligence Profiles
CREATE TABLE intelligence_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    capabilities JSONB DEFAULT '[]',
    learning_mode VARCHAR(50) DEFAULT 'continual',
    autonomy_level VARCHAR(50) DEFAULT 'supervised_auto',
    confidence DECIMAL(3,2) DEFAULT 0.50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_learning_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning Contexts
CREATE TABLE learning_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES intelligence_profiles(id),
    situation JSONB NOT NULL,
    actions JSONB DEFAULT '[]',
    outcomes JSONB DEFAULT '[]',
    observations JSONB DEFAULT '[]',
    feedback JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_contexts_profile ON learning_contexts(profile_id);
CREATE INDEX idx_learning_contexts_created ON learning_contexts(created_at);

-- Decisions
CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES intelligence_profiles(id),
    context JSONB NOT NULL,
    options JSONB NOT NULL,
    selected_option VARCHAR(255) NOT NULL,
    reasoning JSONB NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    risk_level VARCHAR(50) NOT NULL,
    executed_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decisions_profile ON decisions(profile_id);
CREATE INDEX idx_decisions_risk ON decisions(risk_level);
CREATE INDEX idx_decisions_created ON decisions(created_at);

-- Anomalies
CREATE TABLE anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    description TEXT NOT NULL,
    affected_system VARCHAR(255) NOT NULL,
    metrics JSONB NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    root_cause TEXT,
    mitigation TEXT,
    status VARCHAR(50) DEFAULT 'detected',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_anomalies_type ON anomalies(type);
CREATE INDEX idx_anomalies_severity ON anomalies(severity);
CREATE INDEX idx_anomalies_status ON anomalies(status);
CREATE INDEX idx_anomalies_detected ON anomalies(detected_at);

-- Predictions
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    target VARCHAR(255) NOT NULL,
    horizon_type VARCHAR(50) NOT NULL,
    horizon_duration INTERVAL NOT NULL,
    results JSONB NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    model VARCHAR(255) NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_predictions_type ON predictions(type);
CREATE INDEX idx_predictions_expires ON predictions(expires_at);

-- Healing Actions
CREATE TABLE healing_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id UUID REFERENCES anomalies(id),
    type VARCHAR(100) NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    steps JSONB NOT NULL,
    estimated_duration INTEGER NOT NULL,
    risk_level VARCHAR(50) NOT NULL,
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_healing_anomaly ON healing_actions(anomaly_id);
CREATE INDEX idx_healing_status ON healing_actions(status);

-- Learning Cycles
CREATE TABLE learning_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES intelligence_profiles(id),
    epoch INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'collecting',
    data JSONB NOT NULL,
    model JSONB NOT NULL,
    improvement JSONB NOT NULL
);

CREATE INDEX idx_learning_cycles_profile ON learning_cycles(profile_id);
CREATE INDEX idx_learning_cycles_status ON learning_cycles(status);

-- Knowledge Base
CREATE TABLE knowledge_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    context JSONB DEFAULT '[]',
    confidence DECIMAL(3,2) DEFAULT 0.50,
    source VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_type ON knowledge_entries(type);
CREATE INDEX idx_knowledge_confidence ON knowledge_entries(confidence DESC);

-- Skill Acquisitions
CREATE TABLE skill_acquisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES intelligence_profiles(id),
    skill VARCHAR(255) NOT NULL,
    level DECIMAL(3,2) DEFAULT 0.00,
    source VARCHAR(255) NOT NULL,
    learning_method VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    mastered_at TIMESTAMPTZ,
    practice_count INTEGER DEFAULT 0,
    application_count INTEGER DEFAULT 0
);

CREATE INDEX idx_skills_profile ON skill_acquisitions(profile_id);
CREATE INDEX idx_skills_level ON skill_acquisitions(level DESC);

-- ============================================================================
-- QUANTUM-SAFE CRYPTO TABLES
-- ============================================================================

-- PQC Key Pairs
CREATE TABLE pqc_key_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    algorithm VARCHAR(100) NOT NULL,
    public_key BYTEA NOT NULL,
    private_key_hash VARCHAR(255) NOT NULL, -- Store hash only, key in vault
    purpose VARCHAR(50) NOT NULL,
    security_level INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    rotation_count INTEGER DEFAULT 0
);

CREATE INDEX idx_pqc_keys_algorithm ON pqc_key_pairs(algorithm);
CREATE INDEX idx_pqc_keys_purpose ON pqc_key_pairs(purpose);

-- PQC Signatures
CREATE TABLE pqc_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    algorithm VARCHAR(100) NOT NULL,
    signature_data BYTEA NOT NULL,
    signer_key_id UUID REFERENCES pqc_key_pairs(id),
    signed_data_hash VARCHAR(255) NOT NULL,
    context JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_pqc_sigs_key ON pqc_signatures(signer_key_id);
CREATE INDEX idx_pqc_sigs_created ON pqc_signatures(created_at);

-- Hybrid Key Pairs
CREATE TABLE hybrid_key_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classical_algorithm VARCHAR(100) NOT NULL,
    classical_public_key BYTEA NOT NULL,
    pqc_key_id UUID REFERENCES pqc_key_pairs(id),
    combined_fingerprint VARCHAR(255) NOT NULL,
    migration_status VARCHAR(50) DEFAULT 'not_started',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hybrid_keys_status ON hybrid_key_pairs(migration_status);

-- Migration Plans
CREATE TABLE migration_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    current_algorithms JSONB NOT NULL,
    target_algorithms JSONB NOT NULL,
    phases JSONB NOT NULL,
    timeline JSONB NOT NULL,
    rollback_plan JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'not_started',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_migration_status ON migration_plans(status);

-- PQC Audit Log
CREATE TABLE pqc_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    algorithm VARCHAR(100),
    operation VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    device_id VARCHAR(255),
    ip_address VARCHAR(45),
    success BOOLEAN NOT NULL,
    error_code VARCHAR(100),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pqc_audit_event ON pqc_audit_log(event_type);
CREATE INDEX idx_pqc_audit_created ON pqc_audit_log(created_at);
CREATE INDEX idx_pqc_audit_success ON pqc_audit_log(success);

-- Crypto Shredding Records
CREATE TABLE crypto_shredding_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_id VARCHAR(255) NOT NULL,
    key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    shred_after TIMESTAMPTZ NOT NULL,
    shredded_at TIMESTAMPTZ,
    shred_status VARCHAR(50) DEFAULT 'active',
    requested_by VARCHAR(255),
    reason TEXT,
    verification JSONB
);

CREATE INDEX idx_shredding_status ON crypto_shredding_records(shred_status);
CREATE INDEX idx_shredding_after ON crypto_shredding_records(shred_after);

-- ============================================================================
-- SWARM INTELLIGENCE TABLES
-- ============================================================================

-- Swarms
CREATE TABLE swarms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    topology VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'initializing',
    config JSONB NOT NULL,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_swarms_status ON swarms(status);

-- Swarm Nodes
CREATE TABLE swarm_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID REFERENCES swarms(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    capabilities JSONB NOT NULL,
    state VARCHAR(50) DEFAULT 'initializing',
    resources JSONB NOT NULL,
    specializations JSONB DEFAULT '[]',
    reputation INTEGER DEFAULT 50,
    contribution_score DECIMAL(10,2) DEFAULT 0.00,
    performance JSONB DEFAULT '{}',
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_swarm_nodes_swarm ON swarm_nodes(swarm_id);
CREATE INDEX idx_swarm_nodes_state ON swarm_nodes(state);

-- Swarm Tasks
CREATE TABLE swarm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID REFERENCES swarms(id),
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    requirements JSONB DEFAULT '[]',
    constraints JSONB DEFAULT '[]',
    priority VARCHAR(50) DEFAULT 'normal',
    status VARCHAR(50) DEFAULT 'queued',
    assigned_nodes JSONB DEFAULT '[]',
    decomposition JSONB,
    progress INTEGER DEFAULT 0,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deadline TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_swarm_tasks_swarm ON swarm_tasks(swarm_id);
CREATE INDEX idx_swarm_tasks_status ON swarm_tasks(status);
CREATE INDEX idx_swarm_tasks_priority ON swarm_tasks(priority);

-- Swarm Messages
CREATE TABLE swarm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID REFERENCES swarms(id),
    from_node VARCHAR(255) NOT NULL,
    to_node VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    priority VARCHAR(50) DEFAULT 'normal',
    ttl INTEGER DEFAULT 30000,
    hops INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_swarm_messages_swarm ON swarm_messages(swarm_id);
CREATE INDEX idx_swarm_messages_expires ON swarm_messages(expires_at);

-- Proposals
CREATE TABLE swarm_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID REFERENCES swarms(id),
    type VARCHAR(100) NOT NULL,
    proposer VARCHAR(255) NOT NULL,
    content JSONB NOT NULL,
    votes JSONB DEFAULT '[]',
    state VARCHAR(50) DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deadline TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_proposals_swarm ON swarm_proposals(swarm_id);
CREATE INDEX idx_proposals_state ON swarm_proposals(state);

-- Collective Memory
CREATE TABLE collective_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID REFERENCES swarms(id),
    type VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    embeddings VECTOR(1536), -- OpenAI embedding size
    importance DECIMAL(3,2) DEFAULT 0.50,
    access_count INTEGER DEFAULT 0,
    contributors JSONB DEFAULT '[]',
    signatures JSONB DEFAULT '[]',
    consensus_level DECIMAL(3,2) DEFAULT 0.50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collective_memory_swarm ON collective_memory(swarm_id);
CREATE INDEX idx_collective_memory_type ON collective_memory(type);
CREATE INDEX idx_collective_memory_importance ON collective_memory(importance DESC);

-- Emergent Properties
CREATE TABLE emergent_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID REFERENCES swarms(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    conditions JSONB NOT NULL,
    effects JSONB NOT NULL,
    reproducibility DECIMAL(3,2) DEFAULT 0.50,
    utility DECIMAL(3,2) DEFAULT 0.50,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emergent_swarm ON emergent_properties(swarm_id);
CREATE INDEX idx_emergent_type ON emergent_properties(type);

-- ============================================================================
-- 2060 FUTURE-PROOF TABLES
-- ============================================================================

-- Quantum Resources
CREATE TABLE quantum_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL, -- 'superconducting', 'trapped_ion', 'photonic', 'topological'
    qubits INTEGER NOT NULL,
    coherence_time INTEGER NOT NULL, -- microseconds
    error_rate DECIMAL(6,4) NOT NULL,
    availability VARCHAR(50) DEFAULT 'on_demand',
    endpoint VARCHAR(255),
    status VARCHAR(50) DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quantum_type ON quantum_resources(type);
CREATE INDEX idx_quantum_status ON quantum_resources(status);

-- BCI Sessions
CREATE TABLE bci_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    device_type VARCHAR(100) NOT NULL,
    bandwidth INTEGER NOT NULL, -- bits/sec
    latency INTEGER NOT NULL, -- ms
    resolution INTEGER NOT NULL,
    signals JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'disconnected',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bci_user ON bci_sessions(user_id);
CREATE INDEX idx_bci_status ON bci_sessions(status);

-- Holographic Displays
CREATE TABLE holographic_displays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    resolution VARCHAR(50) NOT NULL,
    depth_layers INTEGER NOT NULL,
    frame_rate INTEGER NOT NULL,
    interactivity BOOLEAN DEFAULT FALSE,
    gesture_recognition BOOLEAN DEFAULT FALSE,
    eye_tracking BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'offline',
    last_calibration TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_holographic_status ON holographic_displays(status);

-- Autonomous Agents Registry
CREATE TABLE autonomous_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    capabilities JSONB NOT NULL,
    autonomy_level VARCHAR(50) NOT NULL,
    constraints JSONB DEFAULT '[]',
    owner_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'idle',
    current_task_id UUID,
    performance_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ
);

CREATE INDEX idx_agents_owner ON autonomous_agents(owner_id);
CREATE INDEX idx_agents_status ON autonomous_agents(status);
CREATE INDEX idx_agents_type ON autonomous_agents(type);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE intelligence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqc_key_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqc_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE hybrid_key_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqc_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_shredding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE collective_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergent_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bci_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE holographic_displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_agents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_intelligence_profiles_updated
    BEFORE UPDATE ON intelligence_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_swarms_updated
    BEFORE UPDATE ON swarms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_knowledge_entries_updated
    BEFORE UPDATE ON knowledge_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Default Intelligence Profile
INSERT INTO intelligence_profiles (name, version, capabilities, learning_mode, autonomy_level, confidence)
VALUES ('Infinity Adaptive Intelligence', '1.0.0', 
    '[{"type": "reasoning", "level": 85}, {"type": "learning", "level": 90}, {"type": "prediction", "level": 80}]',
    'continual', 'supervised_auto', 0.75);

-- Default Swarm
INSERT INTO swarms (name, description, topology, status, config)
VALUES ('Infinity Primary Swarm', 'Main collective intelligence swarm', 'hybrid', 'active',
    '{"consensusType": "weighted_confidence", "communicationType": "gossip", "learningMode": "federated"}');

-- Default Healing Policies (as JSON metadata)
INSERT INTO migration_plans (name, description, current_algorithms, target_algorithms, phases, timeline, rollback_plan, status)
VALUES ('PQC Migration 2025-2030', 'Migrate from classical to post-quantum cryptography',
    '["RSA-2048", "ECDSA-P256", "AES-256"]',
    '["ML-DSA-65", "ML-KEM-768"]',
    '[{"order": 1, "name": "Assessment", "status": "pending"}, {"order": 2, "name": "Hybrid", "status": "pending"}, {"order": 3, "name": "PQC-Only", "status": "pending"}]',
    '{"startDate": "2025-01-01", "endDate": "2030-12-31"}',
    '{"triggers": ["security_incident", "performance_degradation"], "steps": [{"type": "revert_protocol"}]}',
    'not_started');

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active Anomalies View
CREATE VIEW active_anomalies AS
SELECT 
    a.id,
    a.type,
    a.severity,
    a.description,
    a.affected_system,
    a.detected_at,
    a.status,
    ha.id AS healing_action_id,
    ha.status AS healing_status
FROM anomalies a
LEFT JOIN healing_actions ha ON a.id = ha.anomaly_id
WHERE a.status NOT IN ('resolved', 'false_positive');

-- System Health Summary View
CREATE VIEW system_health_summary AS
SELECT 
    affected_system,
    COUNT(*) AS total_anomalies,
    COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
    COUNT(*) FILTER (WHERE severity = 'high') AS high_count,
    COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
    AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at))) FILTER (WHERE status = 'resolved') AS avg_resolution_time_seconds
FROM anomalies
GROUP BY affected_system;

-- Learning Progress View
CREATE VIEW learning_progress AS
SELECT 
    ip.name AS profile_name,
    lc.epoch,
    lc.status,
    lc.improvement->>'overallScore' AS overall_score,
    lc.started_at,
    lc.completed_at
FROM learning_cycles lc
JOIN intelligence_profiles ip ON lc.profile_id = ip.id
ORDER BY lc.started_at DESC;

-- Swarm Metrics View
CREATE VIEW swarm_metrics AS
SELECT 
    s.id AS swarm_id,
    s.name AS swarm_name,
    s.status AS swarm_status,
    COUNT(sn.id) AS total_nodes,
    COUNT(sn.id) FILTER (WHERE sn.state = 'active') AS active_nodes,
    AVG(sn.reputation) AS avg_reputation,
    COUNT(st.id) FILTER (WHERE st.status = 'completed') AS completed_tasks,
    COUNT(ep.id) AS emergent_properties
FROM swarms s
LEFT JOIN swarm_nodes sn ON s.id = sn.swarm_id
LEFT JOIN swarm_tasks st ON s.id = st.swarm_id
LEFT JOIN emergent_properties ep ON s.id = ep.swarm_id
GROUP BY s.id, s.name, s.status;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE intelligence_profiles IS 'AI profiles with adaptive learning capabilities';
COMMENT ON TABLE learning_contexts IS 'Context data for machine learning cycles';
COMMENT ON TABLE anomalies IS 'Detected system anomalies for auto-remediation';
COMMENT ON TABLE pqc_key_pairs IS 'Post-quantum cryptography key storage';
COMMENT ON TABLE swarms IS 'Collective intelligence swarm configurations';
COMMENT ON TABLE collective_memory IS 'Distributed knowledge base for swarm intelligence';
COMMENT ON TABLE emergent_properties IS 'Emergent behaviors detected in swarm systems';
COMMENT ON TABLE autonomous_agents IS 'Registry of autonomous AI agents';