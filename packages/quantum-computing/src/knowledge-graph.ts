/**
 * Federated Knowledge Graph Schema
 * Part of Web 4.0 Data/Knowledge Layer
 * 
 * This module provides a schema-based knowledge graph implementation
 * supporting federated queries across distributed nodes.
 */

// ============================================================================
// Core Types
// ============================================================================

export interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
  metadata: NodeMetadata;
  source: NodeSource;
}

export interface KnowledgeEdge {
  id: string;
  type: EdgeType;
  source: string;
  target: string;
  properties: Record<string, unknown>;
  weight?: number;
  confidence?: number;
  validFrom?: Date;
  validTo?: Date;
}

export interface NodeMetadata {
  createdAt: Date;
  updatedAt: Date;
  version: number;
  author?: string;
  provenance: string[];
  trustScore: number;
}

export interface NodeSource {
  origin: string;
  federationId?: string;
  syncStatus: SyncStatus;
  lastSync?: Date;
}

export type SyncStatus = 'local' | 'synced' | 'pending' | 'conflict';

// ============================================================================
// Node Types - Web 4.0 Semantic Classification
// ============================================================================

export enum NodeType {
  // Core Entities
  ENTITY = 'entity',
  CONCEPT = 'concept',
  EVENT = 'event',
  AGENT = 'agent',
  RESOURCE = 'resource',
  
  // AI/ML Specific
  MODEL = 'model',
  DATASET = 'dataset',
  PROMPT = 'prompt',
  CAPABILITY = 'capability',
  
  // Infrastructure
  SERVICE = 'service',
  ENDPOINT = 'endpoint',
  WORKFLOW = 'workflow',
  POLICY = 'policy',
  
  // Quantum
  QUBIT = 'qubit',
  CIRCUIT = 'circuit',
  ALGORITHM = 'algorithm',
  
  // Business
  USER = 'user',
  ORGANIZATION = 'organization',
  PRODUCT = 'product',
  TRANSACTION = 'transaction',
}

// ============================================================================
// Edge Types - Semantic Relationships
// ============================================================================

export enum EdgeType {
  // Hierarchical
  IS_A = 'is_a',
  HAS_A = 'has_a',
  PART_OF = 'part_of',
  INSTANCE_OF = 'instance_of',
  
  // Associative
  RELATES_TO = 'relates_to',
  SIMILAR_TO = 'similar_to',
  DIFFERENT_FROM = 'different_from',
  
  // Causal
  CAUSES = 'causes',
  ENABLES = 'enables',
  PREVENTS = 'prevents',
  
  // Temporal
  PRECEDES = 'precedes',
  FOLLOWS = 'follows',
  CONCURRENT_WITH = 'concurrent_with',
  
  // Dependency
  DEPENDS_ON = 'depends_on',
  REQUIRES = 'requires',
  PRODUCES = 'produces',
  CONSUMES = 'consumes',
  
  // AI/ML Specific
  TRAINED_ON = 'trained_on',
  FINE_TUNED_FROM = 'fine_tuned_from',
  EMBEDS = 'embeds',
  PREDICTS = 'predicts',
  
  // Social
  OWNS = 'owns',
  CREATED_BY = 'created_by',
  ACCESSED_BY = 'accessed_by',
  
  // Trust
  TRUSTS = 'trusts',
  VERIFIED_BY = 'verified_by',
  ATTESTED_BY = 'attested_by',
}

// ============================================================================
// Knowledge Graph Schema Definition
// ============================================================================

export interface KnowledgeGraphSchema {
  version: string;
  namespace: string;
  nodeSchemas: Map<NodeType, NodeSchemaDefinition>;
  edgeSchemas: Map<EdgeType, EdgeSchemaDefinition>;
  constraints: SchemaConstraint[];
  indexes: IndexDefinition[];
}

export interface NodeSchemaDefinition {
  type: NodeType;
  requiredProperties: string[];
  optionalProperties: string[];
  propertyTypes: Record<string, PropertyType>;
  validationRules: ValidationRule[];
}

export interface EdgeSchemaDefinition {
  type: EdgeType;
  allowedSourceTypes: NodeType[];
  allowedTargetTypes: NodeType[];
  requiredProperties: string[];
  optionalProperties: string[];
  isDirected: boolean;
  maxCardinality?: number;
}

export interface PropertyType {
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'reference';
  format?: string;
  enum?: string[];
  pattern?: string;
  min?: number;
  max?: number;
}

export interface ValidationRule {
  name: string;
  rule: string;
  errorMessage: string;
}

export interface SchemaConstraint {
  name: string;
  type: 'uniqueness' | 'existence' | 'custom';
  definition: string;
}

export interface IndexDefinition {
  name: string;
  properties: string[];
  type: 'btree' | 'hash' | 'fulltext' | 'vector';
}

// ============================================================================
// Federated Query Support
// ============================================================================

export interface FederatedQuery {
  id: string;
  query: GraphQuery;
  targetNodes: string[];
  timeout: number;
  mergeStrategy: MergeStrategy;
}

export interface GraphQuery {
  match: QueryPattern[];
  where?: QueryCondition[];
  return: string[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  skip?: number;
}

export interface QueryPattern {
  node: string;
  type?: NodeType | NodeType[];
  edges?: QueryEdgePattern[];
}

export interface QueryEdgePattern {
  edge: string;
  type?: EdgeType | EdgeType[];
  direction: 'outgoing' | 'incoming' | 'both';
  target: string;
  targetType?: NodeType | NodeType[];
}

export interface QueryCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';
  value: unknown;
}

export interface QueryOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export type MergeStrategy = 'union' | 'intersection' | 'latest' | 'highest_trust';

// ============================================================================
// Knowledge Graph Client
// ============================================================================

export class KnowledgeGraphClient {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();
  private schema: KnowledgeGraphSchema;
  private federationNodes: Map<string, FederationNode> = new Map();

  constructor(schema?: Partial<KnowledgeGraphSchema>) {
    this.schema = this.createDefaultSchema(schema);
  }

  // --------------------------------------------------------------------------
  // Node Operations
  // --------------------------------------------------------------------------

  async createNode(
    type: NodeType,
    label: string,
    properties: Record<string, unknown>,
    source?: Partial<NodeSource>
  ): Promise<KnowledgeNode> {
    const id = this.generateId();
    const now = new Date();

    const node: KnowledgeNode = {
      id,
      type,
      label,
      properties,
      metadata: {
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [],
        trustScore: 1.0,
      },
      source: {
        origin: 'local',
        syncStatus: 'local',
        ...source,
      },
    };

    await this.validateNode(node);
    this.nodes.set(id, node);
    return node;
  }

  async getNode(id: string): Promise<KnowledgeNode | null> {
    return this.nodes.get(id) || null;
  }

  async updateNode(
    id: string,
    properties: Record<string, unknown>
  ): Promise<KnowledgeNode | null> {
    const node = this.nodes.get(id);
    if (!node) return null;

    node.properties = { ...node.properties, ...properties };
    node.metadata.updatedAt = new Date();
    node.metadata.version++;
    node.source.syncStatus = 'pending';

    return node;
  }

  async deleteNode(id: string): Promise<boolean> {
    // Delete associated edges first
    for (const [edgeId, edge] of this.edges) {
      if (edge.source === id || edge.target === id) {
        this.edges.delete(edgeId);
      }
    }
    return this.nodes.delete(id);
  }

  // --------------------------------------------------------------------------
  // Edge Operations
  // --------------------------------------------------------------------------

  async createEdge(
    type: EdgeType,
    source: string,
    target: string,
    properties?: Record<string, unknown>,
    weight?: number,
    confidence?: number
  ): Promise<KnowledgeEdge> {
    const id = this.generateId();

    // Validate source and target exist
    if (!this.nodes.has(source) || !this.nodes.has(target)) {
      throw new Error('Source or target node does not exist');
    }

    const edge: KnowledgeEdge = {
      id,
      type,
      source,
      target,
      properties: properties || {},
      weight,
      confidence,
    };

    await this.validateEdge(edge);
    this.edges.set(id, edge);
    return edge;
  }

  async getEdge(id: string): Promise<KnowledgeEdge | null> {
    return this.edges.get(id) || null;
  }

  async getOutgoingEdges(nodeId: string): Promise<KnowledgeEdge[]> {
    return Array.from(this.edges.values()).filter((e) => e.source === nodeId);
  }

  async getIncomingEdges(nodeId: string): Promise<KnowledgeEdge[]> {
    return Array.from(this.edges.values()).filter((e) => e.target === nodeId);
  }

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  async query(query: GraphQuery): Promise<KnowledgeNode[]> {
    let results = Array.from(this.nodes.values());

    // Filter by type
    if (query.match.length > 0) {
      const types = query.match[0].type;
      if (types) {
        const typeArray = Array.isArray(types) ? types : [types];
        results = results.filter((n) => typeArray.includes(n.type));
      }
    }

    // Apply where conditions
    if (query.where) {
      for (const condition of query.where) {
        results = results.filter((n) =>
          this.evaluateCondition(n, condition)
        );
      }
    }

    // Apply ordering
    if (query.orderBy) {
      for (const order of query.orderBy.reverse()) {
        results.sort((a, b) => {
          const aVal = a.properties[order.field];
          const bVal = b.properties[order.field];
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return order.direction === 'desc' ? -cmp : cmp;
        });
      }
    }

    // Apply pagination
    if (query.skip) {
      results = results.slice(query.skip);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Federation Operations
  // --------------------------------------------------------------------------

  async registerFederationNode(node: FederationNode): Promise<void> {
    this.federationNodes.set(node.id, node);
  }

  async federatedQuery(query: FederatedQuery): Promise<FederatedQueryResult> {
    const localResults = await this.query(query.query);
    const remoteResults: Map<string, KnowledgeNode[]> = new Map();

    // Query federation nodes in parallel
    const promises = query.targetNodes.map(async (nodeId) => {
      const node = this.federationNodes.get(nodeId);
      if (node && node.status === 'online') {
        try {
          const results = await this.queryRemoteNode(node, query.query);
          remoteResults.set(nodeId, results);
        } catch (error) {
          console.error(`Failed to query federation node ${nodeId}:`, error);
        }
      }
    });

    await Promise.all(promises);

    // Merge results
    const mergedResults = this.mergeResults(
      localResults,
      remoteResults,
      query.mergeStrategy
    );

    return {
      queryId: query.id,
      localResults,
      remoteResults,
      mergedResults,
      timestamp: new Date(),
    };
  }

  private async queryRemoteNode(
    node: FederationNode,
    query: GraphQuery
  ): Promise<KnowledgeNode[]> {
    // In a real implementation, this would make an HTTP request
    // to the federation node's query endpoint
    console.log(`Querying remote node ${node.id}:`, query);
    return [];
  }

  private mergeResults(
    local: KnowledgeNode[],
    remote: Map<string, KnowledgeNode[]>,
    strategy: MergeStrategy
  ): KnowledgeNode[] {
    const allNodes = [local, ...Array.from(remote.values())].flat();

    switch (strategy) {
      case 'union':
        return this.deduplicateNodes(allNodes);

      case 'intersection':
        return this.findCommonNodes(allNodes);

      case 'latest':
        return this.selectLatestVersions(allNodes);

      case 'highest_trust':
        return this.selectHighestTrust(allNodes);

      default:
        return this.deduplicateNodes(allNodes);
    }
  }

  private deduplicateNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
    const seen = new Set<string>();
    return nodes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }

  private findCommonNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
    const countById = new Map<string, number>();
    for (const node of nodes) {
      countById.set(node.id, (countById.get(node.id) || 0) + 1);
    }
    return nodes.filter((n) => countById.get(n.id)! > 1);
  }

  private selectLatestVersions(nodes: KnowledgeNode[]): KnowledgeNode[] {
    const byId = new Map<string, KnowledgeNode>();
    for (const node of nodes) {
      const existing = byId.get(node.id);
      if (!existing || node.metadata.updatedAt > existing.metadata.updatedAt) {
        byId.set(node.id, node);
      }
    }
    return Array.from(byId.values());
  }

  private selectHighestTrust(nodes: KnowledgeNode[]): KnowledgeNode[] {
    const byId = new Map<string, KnowledgeNode>();
    for (const node of nodes) {
      const existing = byId.get(node.id);
      if (!existing || node.metadata.trustScore > existing.metadata.trustScore) {
        byId.set(node.id, node);
      }
    }
    return Array.from(byId.values());
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  private generateId(): string {
    return `kg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async validateNode(node: KnowledgeNode): Promise<void> {
    const schema = this.schema.nodeSchemas.get(node.type);
    if (!schema) {
      throw new Error(`Unknown node type: ${node.type}`);
    }

    // Check required properties
    for (const prop of schema.requiredProperties) {
      if (!(prop in node.properties)) {
        throw new Error(`Missing required property: ${prop}`);
      }
    }
  }

  private async validateEdge(edge: KnowledgeEdge): Promise<void> {
    const schema = this.schema.edgeSchemas.get(edge.type);
    if (!schema) {
      throw new Error(`Unknown edge type: ${edge.type}`);
    }

    const sourceNode = this.nodes.get(edge.source);
    const targetNode = this.nodes.get(edge.target);

    if (!sourceNode || !schema.allowedSourceTypes.includes(sourceNode.type)) {
      throw new Error(`Invalid source node type for edge: ${edge.type}`);
    }

    if (!targetNode || !schema.allowedTargetTypes.includes(targetNode.type)) {
      throw new Error(`Invalid target node type for edge: ${edge.type}`);
    }
  }

  private evaluateCondition(
    node: KnowledgeNode,
    condition: QueryCondition
  ): boolean {
    const value = node.properties[condition.field];

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gt':
        return value > condition.value;
      case 'gte':
        return value >= condition.value;
      case 'lt':
        return value < condition.value;
      case 'lte':
        return value <= condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value as string);
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'matches':
        return new RegExp(condition.value as string).test(String(value));
      default:
        return false;
    }
  }

  private createDefaultSchema(
    partial?: Partial<KnowledgeGraphSchema>
  ): KnowledgeGraphSchema {
    const nodeSchemas = new Map<NodeType, NodeSchemaDefinition>();
    const edgeSchemas = new Map<EdgeType, EdgeSchemaDefinition>();

    // Default node schemas
    for (const type of Object.values(NodeType)) {
      nodeSchemas.set(type, {
        type,
        requiredProperties: [],
        optionalProperties: ['name', 'description'],
        propertyTypes: {},
        validationRules: [],
      });
    }

    // Default edge schemas
    for (const type of Object.values(EdgeType)) {
      edgeSchemas.set(type, {
        type,
        allowedSourceTypes: Object.values(NodeType),
        allowedTargetTypes: Object.values(NodeType),
        requiredProperties: [],
        optionalProperties: [],
        isDirected: true,
      });
    }

    return {
      version: '1.0.0',
      namespace: 'trancendos/infinity-portal',
      nodeSchemas,
      edgeSchemas,
      constraints: [],
      indexes: [],
      ...partial,
    };
  }
}

// ============================================================================
// Federation Support
// ============================================================================

export interface FederationNode {
  id: string;
  name: string;
  endpoint: string;
  publicKey?: string;
  status: 'online' | 'offline' | 'degraded';
  lastHeartbeat?: Date;
  capabilities: string[];
  trustLevel: number;
}

export interface FederatedQueryResult {
  queryId: string;
  localResults: KnowledgeNode[];
  remoteResults: Map<string, KnowledgeNode[]>;
  mergedResults: KnowledgeNode[];
  timestamp: Date;
}

// ============================================================================
// Graph Serialization
// ============================================================================

export interface SerializedGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  schema: {
    version: string;
    namespace: string;
  };
  metadata: {
    exportedAt: Date;
    nodeCount: number;
    edgeCount: number;
  };
}

export function serializeGraph(
  nodes: Map<string, KnowledgeNode>,
  edges: Map<string, KnowledgeEdge>,
  schema: KnowledgeGraphSchema
): SerializedGraph {
  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    schema: {
      version: schema.version,
      namespace: schema.namespace,
    },
    metadata: {
      exportedAt: new Date(),
      nodeCount: nodes.size,
      edgeCount: edges.size,
    },
  };
}

export function deserializeGraph(
  serialized: SerializedGraph
): { nodes: Map<string, KnowledgeNode>; edges: Map<string, KnowledgeEdge> } {
  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();

  for (const node of serialized.nodes) {
    nodes.set(node.id, node);
  }

  for (const edge of serialized.edges) {
    edges.set(edge.id, edge);
  }

  return { nodes, edges };
}

// ============================================================================
// Export Default Instance
// ============================================================================

export const defaultKnowledgeGraph = new KnowledgeGraphClient();