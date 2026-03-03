/**
 * Adaptive Intelligence Types
 * Core types for self-learning AI, autonomous decision-making, and continuous improvement
 */

import { z } from 'zod';

// ============================================================================
// Core Intelligence Types
// ============================================================================

export interface IntelligenceProfile {
  id: string;
  name: string;
  version: string;
  capabilities: Capability[];
  learningMode: LearningMode;
  autonomyLevel: AutonomyLevel;
  confidence: number; // 0-1
  createdAt: Date;
  updatedAt: Date;
  lastLearningAt: Date;
}

export enum LearningMode {
  SUPERVISED = 'supervised',
  REINFORCEMENT = 'reinforcement',
  UNSUPERVISED = 'unsupervised',
  FEDERATED = 'federated',
  TRANSFER = 'transfer',
  CONTINUAL = 'continual',
  META_LEARNING = 'meta_learning'
}

export enum AutonomyLevel {
  MANUAL = 'manual', // Human-only decisions
  ADVISORY = 'advisory', // AI suggests, human decides
  COLLABORATIVE = 'collaborative', // Human and AI co-decide
  SUPERVISED_AUTO = 'supervised_auto', // AI decides with human oversight
  AUTONOMOUS = 'autonomous', // AI decides independently
  SOVEREIGN = 'sovereign' // AI decides with veto override capability
}

export interface Capability {
  id: string;
  name: string;
  type: CapabilityType;
  maturity: number; // 0-1
  performance: PerformanceMetrics;
  resources: ResourceRequirement;
}

export enum CapabilityType {
  ANALYSIS = 'analysis',
  PREDICTION = 'prediction',
  DECISION = 'decision',
  EXECUTION = 'execution',
  LEARNING = 'learning',
  ORCHESTRATION = 'orchestration',
  COMMUNICATION = 'communication',
  CREATIVITY = 'creativity'
}

export interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  latency: number; // ms
  throughput: number; // ops/sec
  errorRate: number;
  satisfactionScore: number; // user feedback 0-1
}

export interface ResourceRequirement {
  compute: ComputeResource;
  memory: MemoryResource;
  storage: StorageResource;
  bandwidth: number; // Mbps
}

export interface ComputeResource {
  cpuCores: number;
  gpuUnits: number;
  tpuUnits: number;
  quantumQubits?: number; // For future quantum compute
}

export interface MemoryResource {
  ram: number; // GB
  vram: number; // GB
  cache: number; // GB
}

export interface StorageResource {
  primary: number; // GB
  cache: number; // GB
  archive: number; // GB
}

// ============================================================================
// Learning & Adaptation Types
// ============================================================================

export interface LearningContext {
  id: string;
  timestamp: Date;
  situation: Situation;
  actions: Action[];
  outcomes: Outcome[];
  observations: Observation[];
  feedback: Feedback[];
  metadata: Record<string, unknown>;
}

export interface Situation {
  id: string;
  type: SituationType;
  severity: Severity;
  context: Record<string, unknown>;
  signals: Signal[];
  patterns: Pattern[];
}

export enum SituationType {
  NORMAL = 'normal',
  ANOMALY = 'anomaly',
  OPPORTUNITY = 'opportunity',
  THREAT = 'threat',
  DEGRADATION = 'degradation',
  EMERGENCY = 'emergency',
  OPTIMIZATION = 'optimization'
}

export enum Severity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface Signal {
  id: string;
  source: string;
  type: string;
  value: unknown;
  confidence: number;
  timestamp: Date;
}

export interface Pattern {
  id: string;
  type: PatternType;
  confidence: number;
  frequency: number;
  lastObserved: Date;
  description: string;
}

export enum PatternType {
  TEMPORAL = 'temporal',
  SPATIAL = 'spatial',
  BEHAVIORAL = 'behavioral',
  CORRELATIONAL = 'correlational',
  CAUSAL = 'causal',
  SEASONAL = 'seasonal'
}

export interface Action {
  id: string;
  type: ActionType;
  intent: Intent;
  parameters: Record<string, unknown>;
  estimatedImpact: Impact;
  actualImpact?: Impact;
  timestamp: Date;
  executedBy: string;
}

export enum ActionType {
  ANALYZE = 'analyze',
  PREDICT = 'predict',
  DECIDE = 'decide',
  EXECUTE = 'execute',
  LEARN = 'learn',
  ORCHESTRATE = 'orchestrate',
  COMMUNICATE = 'communicate',
  ESCALATE = 'escalate',
  MITIGATE = 'mitigate',
  OPTIMIZE = 'optimize'
}

export interface Intent {
  id: string;
  naturalLanguage: string;
  structured: StructuredIntent;
  priority: Priority;
  deadline?: Date;
}

export interface StructuredIntent {
  goal: string;
  constraints: Constraint[];
  preferences: Preference[];
  successCriteria: SuccessCriterion[];
}

export enum Priority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
  CRITICAL = 'critical'
}

export interface Constraint {
  type: string;
  description: string;
  value: unknown;
  strictness: 'soft' | 'hard';
}

export interface Preference {
  type: string;
  value: unknown;
  weight: number; // 0-1
}

export interface SuccessCriterion {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  threshold: number;
  importance: number; // 0-1
}

export interface Impact {
  estimated: ImpactEstimate;
  actual?: ImpactMeasurement;
}

export interface ImpactEstimate {
  positive: number; // 0-1
  negative: number; // 0-1
  uncertainty: number; // 0-1
  affectedSystems: string[];
  riskScore: number; // 0-100
}

export interface ImpactMeasurement {
  positive: number;
  negative: number;
  measuredAt: Date;
  metrics: Record<string, number>;
}

export interface Outcome {
  id: string;
  actionId: string;
  state: OutcomeState;
  results: Record<string, unknown>;
  metrics: PerformanceMetrics;
  timestamp: Date;
}

export enum OutcomeState {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILURE = 'failure',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

export interface Observation {
  id: string;
  type: ObservationType;
  data: unknown;
  confidence: number;
  timestamp: Date;
}

export enum ObservationType {
  SYSTEM_METRIC = 'system_metric',
  USER_BEHAVIOR = 'user_behavior',
  EXTERNAL_EVENT = 'external_event',
  PREDICTION_RESULT = 'prediction_result',
  DECISION_MADE = 'decision_made',
  ERROR_OCCURRED = 'error_occurred'
}

export interface Feedback {
  id: string;
  source: FeedbackSource;
  type: FeedbackType;
  rating: number; // -1 to 1, or 0-1 depending on type
  comment?: string;
  timestamp: Date;
}

export enum FeedbackSource {
  HUMAN = 'human',
  SYSTEM = 'system',
  PEER_AI = 'peer_ai',
  AUTOMATED = 'automated'
}

export enum FeedbackType {
  SATISFACTION = 'satisfaction',
  ACCURACY = 'accuracy',
  USEFULNESS = 'usefulness',
  SAFETY = 'safety',
  EFFICIENCY = 'efficiency',
  CORRECTNESS = 'correctness'
}

// ============================================================================
// Decision Making Types
// ============================================================================

export interface Decision {
  id: string;
  context: Situation;
  options: DecisionOption[];
  selectedOption: string;
  reasoning: DecisionReasoning;
  confidence: number;
  riskLevel: RiskLevel;
  executedBy: string;
  approvedBy?: string;
  timestamp: Date;
}

export interface DecisionOption {
  id: string;
  description: string;
  expectedOutcome: ImpactEstimate;
  requirements: Constraint[];
  probabilityOfSuccess: number;
  riskScore: number; // 0-100
}

export interface DecisionReasoning {
  factors: DecisionFactor[];
  logic: string;
  alternativesConsidered: string[];
  uncertaintySource: string[];
}

export interface DecisionFactor {
  name: string;
  weight: number;
  value: number;
  importance: number;
}

export enum RiskLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  EXTREME = 'extreme'
}

// ============================================================================
// Anomaly Detection Types
// ============================================================================

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: Severity;
  confidence: number;
  description: string;
  affectedSystem: string;
  metrics: AnomalyMetrics;
  detectedAt: Date;
  rootCause?: string;
  mitigation?: string;
  status: AnomalyStatus;
}

export enum AnomalyType {
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  AVAILABILITY = 'availability',
  DATA = 'data',
  BEHAVIOR = 'behavior',
  RESOURCE = 'resource',
  CONFIGURATION = 'configuration'
}

export interface AnomalyMetrics {
  baseline: Record<string, number>;
  observed: Record<string, number>;
  deviation: number;
  threshold: number;
}

export enum AnomalyStatus {
  DETECTED = 'detected',
  ANALYZING = 'analyzing',
  MITIGATING = 'mitigating',
  RESOLVED = 'resolved',
  FALSE_POSITIVE = 'false_positive'
}

// ============================================================================
// Prediction Types
// ============================================================================

export interface Prediction {
  id: string;
  type: PredictionType;
  target: string;
  horizon: PredictionHorizon;
  results: PredictionResult[];
  confidence: number;
  model: string;
  generatedAt: Date;
  expiresAt: Date;
}

export enum PredictionType {
  RESOURCE = 'resource',
  PERFORMANCE = 'performance',
  USER_BEHAVIOR = 'user_behavior',
  SECURITY = 'security',
  BUSINESS = 'business',
  SYSTEM_HEALTH = 'system_health'
}

export interface PredictionHorizon {
  type: 'immediate' | 'short' | 'medium' | 'long';
  duration: string; // ISO 8601 duration
  startTime: Date;
  endTime: Date;
}

export interface PredictionResult {
  timestamp: Date;
  value: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
  factors: string[];
}

// ============================================================================
// Self-Healing Types
// ============================================================================

export interface HealingAction {
  id: string;
  anomalyId: string;
  type: HealingType;
  strategy: HealingStrategy;
  steps: HealingStep[];
  estimatedDuration: number; // seconds
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  status: HealingStatus;
  startedAt?: Date;
  completedAt?: Date;
  results?: HealingResult;
}

export enum HealingType {
  RESTART = 'restart',
  SCALE = 'scale',
  RECONFIGURE = 'reconfigure',
  MIGRATE = 'migrate',
  ROLLBACK = 'rollback',
  PATCH = 'patch',
  ISOLATE = 'isolate',
  REDIRECT = 'redirect'
}

export enum HealingStrategy {
  AUTOMATIC = 'automatic',
  SUPERVISED = 'supervised',
  MANUAL = 'manual'
}

export interface HealingStep {
  order: number;
  description: string;
  command: string;
  expectedDuration: number;
  rollbackCommand?: string;
  verificationCriteria: string[];
}

export enum HealingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  CANCELLED = 'cancelled'
}

export interface HealingResult {
  success: boolean;
  duration: number;
  metrics: Record<string, number>;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Continuous Learning Types
// ============================================================================

export interface LearningCycle {
  id: string;
  epoch: number;
  startedAt: Date;
  completedAt?: Date;
  status: LearningStatus;
  data: LearningData;
  model: ModelUpdate;
  improvement: ImprovementMetrics;
}

export enum LearningStatus {
  COLLECTING = 'collecting',
  TRAINING = 'training',
  VALIDATING = 'validating',
  DEPLOYING = 'deploying',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface LearningData {
  samples: number;
  sources: string[];
  quality: number; // 0-1
  diversity: number; // 0-1
  coverage: string[];
}

export interface ModelUpdate {
  version: string;
  changes: string[];
  performanceDelta: PerformanceMetrics;
  parametersChanged: string[];
}

export interface ImprovementMetrics {
  accuracyDelta: number;
  speedDelta: number;
  resourceDelta: number;
  satisfactionDelta: number;
  overallScore: number; // 0-1
}

// ============================================================================
// Knowledge Transfer Types
// ============================================================================

export interface KnowledgeBase {
  id: string;
  name: string;
  version: string;
  entries: KnowledgeEntry[];
  lastUpdated: Date;
  size: number; // bytes
}

export interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  content: unknown;
  context: string[];
  confidence: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

export enum KnowledgeType {
  FACT = 'fact',
  PATTERN = 'pattern',
  RULE = 'rule',
  EXPERIENCE = 'experience',
  BEST_PRACTICE = 'best_practice',
  ANTI_PATTERN = 'anti_pattern',
  HEURISTIC = 'heuristic',
  SKILL = 'skill'
}

export interface SkillAcquisition {
  id: string;
  skill: string;
  level: number; // 0-1
  source: string;
  learningMethod: LearningMode;
  startedAt: Date;
  masteredAt?: Date;
  practice: number;
  applications: number;
}

// ============================================================================
// Emotion & Context Awareness Types
// ============================================================================

export interface EmotionalState {
  id: string;
  valence: number; // -1 to 1 (negative to positive)
  arousal: number; // 0 to 1 (calm to excited)
  dominance: number; // 0 to 1 (submissive to dominant)
  emotions: Emotion[];
  detectedAt: Date;
  confidence: number;
}

export interface Emotion {
  type: EmotionType;
  intensity: number; // 0-1
}

export enum EmotionType {
  JOY = 'joy',
  TRUST = 'trust',
  FEAR = 'fear',
  SURPRISE = 'surprise',
  SADNESS = 'sadness',
  DISGUST = 'disgust',
  ANGER = 'anger',
  ANTICIPATION = 'anticipation',
  INTEREST = 'interest',
  CONFUSION = 'confusion',
  FRUSTRATION = 'frustration',
  SATISFACTION = 'satisfaction'
}

export interface Context {
  id: string;
  type: ContextType;
  attributes: Record<string, unknown>;
  history: ContextHistory[];
  confidence: number;
  timestamp: Date;
}

export enum ContextType {
  USER = 'user',
  SYSTEM = 'system',
  ENVIRONMENT = 'environment',
  TEMPORAL = 'temporal',
  SPATIAL = 'spatial',
  SOCIAL = 'social',
  BUSINESS = 'business'
}

export interface ContextHistory {
  timestamp: Date;
  state: Record<string, unknown>;
  duration: number;
}

// ============================================================================
// 2060 Future-Proof Types
// ============================================================================

export interface QuantumCapability {
  enabled: boolean;
  qubits: number;
  type: 'superconducting' | 'trapped_ion' | 'photonic' | 'topological';
  coherenceTime: number; // microseconds
  errorRate: number;
}

export interface BCIInterface {
  enabled: boolean;
  type: 'invasive' | 'non_invasive' | 'semi_invasive';
  bandwidth: number; // bits/sec
  latency: number; // ms
  resolution: number;
  supportedSignals: string[];
}

export interface SwarmNode {
  id: string;
  role: SwarmRole;
  capabilities: Capability[];
  state: SwarmState;
  resources: ResourceRequirement;
  lastHeartbeat: Date;
}

export enum SwarmRole {
  LEADER = 'leader',
  WORKER = 'worker',
  SPECIALIST = 'specialist',
  COORDINATOR = 'coordinator',
  OBSERVER = 'observer'
}

export enum SwarmState {
  ACTIVE = 'active',
  IDLE = 'idle',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
  JOINING = 'joining',
  LEAVING = 'leaving'
}

export interface HolographicInterface {
  enabled: boolean;
  resolution: string;
  depth: number; // layers
  frameRate: number;
  interactivity: boolean;
  gestureRecognition: boolean;
  eyeTracking: boolean;
}

export interface PostQuantumCrypto {
  algorithm: 'ML-DSA' | 'ML-KEM' | 'SLH-DSA' | 'CRYSTALS-Kyber' | 'CRYSTALS-Dilithium' | 'Falcon';
  keySize: number;
  securityLevel: number; // 1-5 as per NIST
  migrationStatus: 'planned' | 'in_progress' | 'complete';
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const LearningContextSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  situation: z.any(),
  actions: z.array(z.any()),
  outcomes: z.array(z.any()),
  observations: z.array(z.any()),
  feedback: z.array(z.any()),
  metadata: z.record(z.unknown())
});

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  context: z.any(),
  options: z.array(z.any()),
  selectedOption: z.string(),
  reasoning: z.any(),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(['minimal', 'low', 'moderate', 'high', 'extreme']),
  executedBy: z.string(),
  approvedBy: z.string().optional(),
  timestamp: z.date()
});

export const AnomalySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['performance', 'security', 'availability', 'data', 'behavior', 'resource', 'configuration']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  description: z.string(),
  affectedSystem: z.string(),
  metrics: z.any(),
  detectedAt: z.date(),
  rootCause: z.string().optional(),
  mitigation: z.string().optional(),
  status: z.enum(['detected', 'analyzing', 'mitigating', 'resolved', 'false_positive'])
});

export const PredictionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['resource', 'performance', 'user_behavior', 'security', 'business', 'system_health']),
  target: z.string(),
  horizon: z.any(),
  results: z.array(z.any()),
  confidence: z.number().min(0).max(1),
  model: z.string(),
  generatedAt: z.date(),
  expiresAt: z.date()
});