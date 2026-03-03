/**
 * Swarm Intelligence Types
 * Types for collective AI, emergent behavior, and distributed intelligence
 */

// ============================================================================
// Swarm Core Types
// ============================================================================

export interface Swarm {
  id: string;
  name: string;
  description: string;
  topology: SwarmTopology;
  nodes: Map<string, SwarmNode>;
  collectiveMemory: CollectiveMemory;
  emergentProperties: EmergentProperty[];
  consensusProtocol: ConsensusProtocol;
  communicationProtocol: CommunicationProtocol;
  status: SwarmStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum SwarmTopology {
  STAR = 'star',           // Central hub with spokes
  MESH = 'mesh',           // Fully connected
  RING = 'ring',           // Circular chain
  TREE = 'tree',           // Hierarchical
  HYBRID = 'hybrid',       // Mixed topology
  DYNAMIC = 'dynamic',     // Self-organizing
  FEDERATED = 'federated'  // Grouped clusters
}

export interface SwarmNode {
  id: string;
  swarmId: string;
  role: NodeRole;
  capabilities: NodeCapability[];
  state: NodeState;
  resources: NodeResources;
  specializations: string[];
  reputation: number; // 0-100
  contributionScore: number;
  lastHeartbeat: Date;
  joinedAt: Date;
  performance: NodePerformance;
}

export enum NodeRole {
  LEADER = 'leader',
  COORDINATOR = 'coordinator',
  WORKER = 'worker',
  SPECIALIST = 'specialist',
  OBSERVER = 'observer',
  SCOUT = 'scout',
  ARCHIVIST = 'archivist',
  GUARDIAN = 'guardian'
}

export enum NodeState {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  BUSY = 'busy',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
  EVICTING = 'evicting',
  HIBERNATING = 'hibernating'
}

export interface NodeCapability {
  type: CapabilityType;
  level: number; // 0-100
  reliability: number; // 0-1
  latency: number; // ms
  throughput: number; // ops/sec
}

export enum CapabilityType {
  REASONING = 'reasoning',
  LEARNING = 'learning',
  PERCEPTION = 'perception',
  ACTION = 'action',
  COMMUNICATION = 'communication',
  MEMORY = 'memory',
  CREATIVITY = 'creativity',
  ANALYSIS = 'analysis',
  PREDICTION = 'prediction',
  ORCHESTRATION = 'orchestration'
}

export interface NodeResources {
  compute: number; // normalized 0-1
  memory: number; // normalized 0-1
  storage: number; // normalized 0-1
  bandwidth: number; // Mbps
  energy: number; // battery level 0-100
}

export interface NodePerformance {
  tasksCompleted: number;
  tasksFailed: number;
  averageLatency: number;
  throughputHistory: number[];
  uptimePercentage: number;
  lastTaskAt: Date;
}

// ============================================================================
// Emergent Behavior Types
// ============================================================================

export interface EmergentProperty {
  id: string;
  name: string;
  description: string;
  type: EmergentType;
  detectedAt: Date;
  confidence: number;
  conditions: EmergenceCondition[];
  effects: EmergenceEffect[];
  reproducibility: number;
  utility: number;
}

export enum EmergentType {
  COORDINATION = 'coordination',
  SPECIALIZATION = 'specialization',
  ADAPTATION = 'adaptation',
  OPTIMIZATION = 'optimization',
  RESILIENCE = 'resilience',
  CREATIVITY = 'creativity',
  LEARNING = 'learning',
  SWARM_WISDOM = 'swarm_wisdom'
}

export interface EmergenceCondition {
  factor: string;
  threshold: number;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  weight: number;
}

export interface EmergenceEffect {
  metric: string;
  improvement: number; // percentage
  significance: number; // statistical significance
  sideEffects: string[];
}

// ============================================================================
// Collective Memory Types
// ============================================================================

export interface CollectiveMemory {
  id: string;
  swarmId: string;
  entries: MemoryEntry[];
  distributedStorage: DistributedStorageConfig;
  retrievalStrategy: RetrievalStrategy;
  consensusThreshold: number;
  size: number; // bytes
  compressionRatio: number;
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: unknown;
  embeddings?: number[];
  importance: number; // 0-1
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  contributors: string[]; // node IDs
  signatures: MemorySignature[];
  consensusLevel: number; // 0-1
}

export enum MemoryType {
  EXPERIENCE = 'experience',
  KNOWLEDGE = 'knowledge',
  PATTERN = 'pattern',
  SKILL = 'skill',
  DECISION = 'decision',
  SOLUTION = 'solution',
  HEURISTIC = 'heuristic',
  WARNING = 'warning'
}

export interface MemorySignature {
  nodeId: string;
  signature: string;
  timestamp: Date;
  weight: number;
}

export interface DistributedStorageConfig {
  replicationFactor: number;
  consistency: ConsistencyLevel;
  partitionStrategy: PartitionStrategy;
  redundancy: number;
}

export enum ConsistencyLevel {
  STRONG = 'strong',
  EVENTUAL = 'eventual',
  CAUSAL = 'causal',
  SESSION = 'session'
}

export enum PartitionStrategy {
  HASH = 'hash',
  RANGE = 'range',
  GEOGRAPHIC = 'geographic',
  CAPABILITY = 'capability',
  ADAPTIVE = 'adaptive'
}

export enum RetrievalStrategy {
  BROADCAST = 'broadcast',
  DIRECTED = 'directed',
  CACHED = 'cached',
  PREDICTIVE = 'predictive',
  HIERARCHICAL = 'hierarchical'
}

// ============================================================================
// Consensus Types
// ============================================================================

export interface ConsensusProtocol {
  type: ConsensusType;
  config: ConsensusConfig;
  pendingProposals: Proposal[];
  votingPower: Map<string, number>;
  decisionHistory: ConsensusDecision[];
}

export enum ConsensusType {
  RAFT = 'raft',
  PBFT = 'pbft',           // Practical Byzantine Fault Tolerance
  POS = 'pos',             // Proof of Stake
  HOTSTUFF = 'hotstuff',
  TENDERMINT = 'tendermint',
  SWARM_VOTE = 'swarm_vote',
  WEIGHTED_CONFIDENCE = 'weighted_confidence',
  EMERGENT = 'emergent'    // Self-organizing consensus
}

export interface ConsensusConfig {
  minParticipants: number;
  timeoutMs: number;
  maxRetries: number;
  quorumThreshold: number; // fraction of total votes
  byzantineThreshold: number; // max faulty nodes tolerated
}

export interface Proposal {
  id: string;
  type: ProposalType;
  proposer: string;
  content: unknown;
  votes: Vote[];
  state: ProposalState;
  createdAt: Date;
  deadline: Date;
  result?: ConsensusResult;
}

export enum ProposalType {
  DECISION = 'decision',
  ACTION = 'action',
  POLICY_CHANGE = 'policy_change',
  NODE_ADMISSION = 'node_admission',
  NODE_EVICTION = 'node_eviction',
  RESOURCE_ALLOCATION = 'resource_allocation',
  KNOWLEDGE_UPDATE = 'knowledge_update'
}

export interface Vote {
  voterId: string;
  decision: VoteDecision;
  weight: number;
  reason?: string;
  timestamp: Date;
  signature: string;
}

export enum VoteDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  ABSTAIN = 'abstain'
}

export enum ProposalState {
  PENDING = 'pending',
  VOTING = 'voting',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTED = 'executed',
  EXPIRED = 'expired'
}

export interface ConsensusDecision {
  id: string;
  proposalId: string;
  outcome: VoteDecision;
  confidence: number;
  totalVotes: number;
  approvalVotes: number;
  rejectionVotes: number;
  abstainVotes: number;
  decisionTime: number; // ms
  participants: string[];
  signature: string;
}

export interface ConsensusResult {
  success: boolean;
  finalDecision: VoteDecision;
  consensusLevel: number;
  executionPlan?: ExecutionPlan;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  estimatedDuration: number;
  resources: ResourceAllocation;
  rollbackPlan: ExecutionStep[];
}

export interface ExecutionStep {
  order: number;
  action: string;
  assignee: string;
  deadline: Date;
  dependencies: string[];
}

export interface ResourceAllocation {
  nodeId: string;
  resources: NodeResources;
  duration: number;
  priority: number;
}

// ============================================================================
// Communication Types
// ============================================================================

export interface CommunicationProtocol {
  type: CommunicationType;
  channels: Channel[];
  messageQueue: SwarmMessage[];
  broadcastStrategy: BroadcastStrategy;
}

export enum CommunicationType {
  DIRECT = 'direct',
  BROADCAST = 'broadcast',
  GOSSIP = 'gossip',
  PUBLISH_SUBSCRIBE = 'publish_subscribe',
  REQUEST_RESPONSE = 'request_response',
  STREAMING = 'streaming'
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  subscribers: string[];
  messageLimit: number;
  retentionMs: number;
}

export enum ChannelType {
  PUBLIC = 'public',
  PRIVATE = 'private',
  BROADCAST = 'broadcast',
  MULTICAST = 'multicast'
}

export interface SwarmMessage {
  id: string;
  from: string;
  to: string | string[] | 'broadcast';
  channel?: string;
  type: MessageType;
  content: unknown;
  priority: MessagePriority;
  ttl: number;
  createdAt: Date;
  expiresAt: Date;
  signature: string;
  hops: number;
  maxHops: number;
}

export enum MessageType {
  HEARTBEAT = 'heartbeat',
  TASK_REQUEST = 'task_request',
  TASK_RESPONSE = 'task_response',
  KNOWLEDGE_SHARE = 'knowledge_share',
  ALERT = 'alert',
  QUERY = 'query',
  REPLY = 'reply',
  PROPOSAL = 'proposal',
  VOTE = 'vote',
  STATE_SYNC = 'state_sync'
}

export enum MessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

export enum BroadcastStrategy {
  FLOOD = 'flood',
  SPANNING_TREE = 'spanning_tree',
  GOSSIP = 'gossip',
  DIRECTED_BROADCAST = 'directed_broadcast',
  SMART_ROUTING = 'smart_routing'
}

// ============================================================================
// Task & Problem Solving Types
// ============================================================================

export interface SwarmTask {
  id: string;
  type: TaskType;
  description: string;
  requirements: TaskRequirement[];
  constraints: TaskConstraint[];
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: string[];
  decomposition?: TaskDecomposition;
  progress: number; // 0-100
  result?: TaskResult;
  createdAt: Date;
  deadline?: Date;
  completedAt?: Date;
}

export enum TaskType {
  ANALYSIS = 'analysis',
  SYNTHESIS = 'synthesis',
  OPTIMIZATION = 'optimization',
  PREDICTION = 'prediction',
  DECISION = 'decision',
  EXECUTION = 'execution',
  MONITORING = 'monitoring',
  LEARNING = 'learning'
}

export interface TaskRequirement {
  capability: CapabilityType;
  minLevel: number;
  minNodes: number;
  maxNodes: number;
  location?: string;
}

export interface TaskConstraint {
  type: string;
  value: unknown;
  hard: boolean;
}

export enum TaskPriority {
  BACKGROUND = 'background',
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
  CRITICAL = 'critical'
}

export enum TaskStatus {
  QUEUED = 'queued',
  DECOMPOSING = 'decomposing',
  ASSIGNING = 'assigning',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface TaskDecomposition {
  strategy: DecompositionStrategy;
  subtasks: SwarmTask[];
  dependencies: Map<string, string[]>;
  parallelization: number;
}

export enum DecompositionStrategy {
  HORIZONTAL = 'horizontal',    // Same task, multiple nodes
  VERTICAL = 'vertical',        // Pipeline of different tasks
  RECURSIVE = 'recursive',      // Break down until atomic
  HYBRID = 'hybrid',            // Mixed approach
  ADAPTIVE = 'adaptive'         // AI-determined decomposition
}

export interface TaskResult {
  success: boolean;
  output: unknown;
  confidence: number;
  executionTime: number;
  nodesContributed: string[];
  quality: number;
  artifacts: TaskArtifact[];
}

export interface TaskArtifact {
  id: string;
  type: string;
  content: unknown;
  nodeId: string;
  timestamp: Date;
}

// ============================================================================
// Learning & Adaptation Types
// ============================================================================

export interface SwarmLearning {
  mode: LearningMode;
  currentEpoch: number;
  globalModel: unknown;
  localModels: Map<string, unknown>;
  aggregationStrategy: AggregationStrategy;
  performance: LearningPerformance;
}

export enum LearningMode {
  FEDERATED = 'federated',
  DISTRIBUTED = 'distributed',
  COLLABORATIVE = 'collaborative',
  ENSEMBLE = 'ensemble',
  TRANSFER = 'transfer',
  META_LEARNING = 'meta_learning'
}

export enum AggregationStrategy {
  FEDERATED_AVERAGING = 'federated_averaging',
  WEIGHTED_AVERAGE = 'weighted_average',
  MEDIAN = 'median',
  TRIMMED_MEAN = 'trimmed_mean',
  ROBUST_AGGREGATION = 'robust_aggregation',
  BYZANTINE_RESISTANT = 'byzantine_resistant'
}

export interface LearningPerformance {
  accuracy: number;
  loss: number;
  convergenceRate: number;
  communicationCost: number;
  privacyBudget: number;
}

// ============================================================================
// Swarm Status Types
// ============================================================================

export enum SwarmStatus {
  INITIALIZING = 'initializing',
  FORMING = 'forming',
  ACTIVE = 'active',
  SCALING = 'scaling',
  REORGANIZING = 'reorganizing',
  DEGRADED = 'degraded',
  HIBERNATING = 'hibernating',
  TERMINATING = 'terminating'
}

export interface SwarmMetrics {
  size: number;
  activeNodes: number;
  averageReputation: number;
  collectiveIntelligence: number; // 0-100
  emergentBehaviors: number;
  tasksCompleted: number;
  consensusRate: number;
  communicationLatency: number;
  resourceUtilization: number;
  resilienceScore: number;
}

// ============================================================================
// Specialized Node Types
// ============================================================================

export interface ScoutNode extends SwarmNode {
  discoveries: Discovery[];
  explorationRange: number;
  curiosity: number; // 0-1
}

export interface Discovery {
  id: string;
  type: 'opportunity' | 'threat' | 'resource' | 'pattern' | 'anomaly';
  description: string;
  location: string;
  confidence: number;
  timestamp: Date;
  reportedBy: string;
}

export interface GuardianNode extends SwarmNode {
  protectedResources: string[];
  threatLevel: number;
  defensesActive: boolean;
  securityPolicies: SecurityPolicy[];
}

export interface SecurityPolicy {
  id: string;
  name: string;
  rules: SecurityRule[];
  enforcement: 'allow' | 'block' | 'monitor';
}

export interface SecurityRule {
  condition: string;
  action: string;
  priority: number;
}

export interface ArchivistNode extends SwarmNode {
  archivedEntries: number;
  storageUsed: number;
  retrievalSpeed: number;
  compressionAlgorithm: string;
}

// ============================================================================
// 2060 Future Types
// ============================================================================

export interface QuantumSwarmNode extends SwarmNode {
  quantumEnabled: boolean;
  entangledWith: string[];
  coherenceTime: number;
  quantumChannels: QuantumChannel[];
}

export interface QuantumChannel {
  id: string;
  targetNodeId: string;
  fidelity: number;
  bandwidth: number;
  latency: number;
}

export interface NeuroSwarmInterface {
  enabled: boolean;
  bandwidth: number;
  latency: number;
  sharedConsciousness: boolean;
  hiveMind: boolean;
}