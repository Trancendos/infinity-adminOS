/**
 * Quantum Computing Package - Phase 8 Exports
 * 
 * This package provides quantum computing capabilities including:
 * - IBM Quantum integration
 * - Quantum random number generation
 * - Web 4.0 Agent Framework
 * - Federated Knowledge Graph
 */

// IBM Quantum Integration
export {
  IBMQuantumClient,
  QuantumCircuit,
  QuantumJobResult,
  IBMQuantumConfig,
} from './ibm-quantum';

// Quantum Random Number Generation
export { QuantumRNG, QuantumRNGConfig } from './ibm-quantum';

// Web 4.0 Agent Framework
export {
  BaseAgent,
  OrchestratorAgent,
  AgentCapability,
  AgentGoal,
  AgentMessage,
  AgentState,
  AgentType,
  AgentContext,
  CollaborativeTask,
} from './web4-agent';

// Knowledge Graph
export {
  KnowledgeGraphClient,
  KnowledgeNode,
  KnowledgeEdge,
  NodeType,
  EdgeType,
  KnowledgeGraphSchema,
  FederatedQuery,
  GraphQuery,
  FederationNode,
  FederatedQueryResult,
  SerializedGraph,
  serializeGraph,
  deserializeGraph,
  defaultKnowledgeGraph,
} from './knowledge-graph';