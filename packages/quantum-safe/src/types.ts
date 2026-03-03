/**
 * Post-Quantum Cryptography Types
 * NIST PQC Standards for 2060 future-proof security
 */

// ============================================================================
// NIST PQC Algorithm Types
// ============================================================================

export enum PQCAlgorithm {
  // NIST Selected Algorithms (2024)
  ML_DSA_44 = 'ML-DSA-44',     // Dilithium2 equivalent
  ML_DSA_65 = 'ML-DSA-65',     // Dilithium3 equivalent
  ML_DSA_87 = 'ML-DSA-87',     // Dilithium5 equivalent
  ML_KEM_512 = 'ML-KEM-512',   // Kyber-512 equivalent
  ML_KEM_768 = 'ML-KEM-768',   // Kyber-768 equivalent
  ML_KEM_1024 = 'ML-KEM-1024', // Kyber-1024 equivalent
  SLH_DSA_SHAKE_128F = 'SLH-DSA-SHAKE-128F',  // SPHINCS+
  SLH_DSA_SHAKE_128S = 'SLH-DSA-SHAKE-128S',
  SLH_DSA_SHAKE_192F = 'SLH-DSA-SHAKE-192F',
  SLH_DSA_SHAKE_256F = 'SLH-DSA-SHAKE-256F',
  // Legacy/Transitional
  CRYSTALS_KYBER_512 = 'CRYSTALS-Kyber-512',
  CRYSTALS_KYBER_768 = 'CRYSTALS-Kyber-768',
  CRYSTALS_KYBER_1024 = 'CRYSTALS-Kyber-1024',
  CRYSTALS_DILITHIUM_2 = 'CRYSTALS-Dilithium-2',
  CRYSTALS_DILITHIUM_3 = 'CRYSTALS-Dilithium-3',
  CRYSTALS_DILITHIUM_5 = 'CRYSTALS-Dilithium-5',
  FALCON_512 = 'Falcon-512',
  FALCON_1024 = 'Falcon-1024'
}

export enum PQCAlgorithmType {
  SIGNATURE = 'signature',
  KEY_ENCAPSULATION = 'key_encapsulation',
  HYBRID = 'hybrid'
}

export interface PQCAlgorithmInfo {
  algorithm: PQCAlgorithm;
  type: PQCAlgorithmType;
  securityLevel: number; // NIST levels 1-5
  publicKeySize: number; // bytes
  privateKeySize: number; // bytes
  signatureSize?: number; // bytes (for signature algorithms)
  ciphertextSize?: number; // bytes (for KEM algorithms)
  securityEstimate: SecurityEstimate;
  performance: PerformanceCharacteristics;
}

export interface SecurityEstimate {
  classical: number; // bits of classical security
  quantum: number; // bits of quantum security (Grover/Bernstein-Vazirani)
  nistLevel: number; // 1-5 as per NIST categories
  bestAttack: string;
  securityProof: 'provably_secure' | 'reductionist' | 'heuristic';
  standardizedYear: number;
}

export interface PerformanceCharacteristics {
  keyGenTime: number; // microseconds
  signTime: number; // microseconds
  verifyTime: number; // microseconds
  encapTime?: number; // microseconds
  decapTime?: number; // microseconds
  memoryUsage: number; // KB
}

// ============================================================================
// Key Types
// ============================================================================

export interface PQCKeyPair {
  id: string;
  algorithm: PQCAlgorithm;
  publicKey: PQCKey;
  privateKey: PQCKey;
  createdAt: Date;
  expiresAt?: Date;
  purpose: KeyPurpose;
  securityLevel: number;
}

export interface PQCKey {
  id: string;
  algorithm: PQCAlgorithm;
  data: Uint8Array;
  size: number;
  fingerprint: string;
  createdAt: Date;
}

export enum KeyPurpose {
  SIGNING = 'signing',
  ENCRYPTION = 'encryption',
  AUTHENTICATION = 'authentication',
  KEY_AGREEMENT = 'key_agreement',
  HYBRID = 'hybrid'
}

export interface HybridKeyPair {
  id: string;
  classical: {
    algorithm: string; // RSA, ECDSA, ECDH
    publicKey: PQCKey;
    privateKey: PQCKey;
  };
  pqc: PQCKeyPair;
  combinedFingerprint: string;
  createdAt: Date;
  migrationStatus: MigrationStatus;
}

// ============================================================================
// Signature Types
// ============================================================================

export interface PQCSignature {
  id: string;
  algorithm: PQCAlgorithm;
  data: Uint8Array;
  signerPublicKeyId: string;
  signedAt: Date;
  expiresAt?: Date;
  detached: boolean;
  signedDataHash: string;
  context?: SignatureContext;
}

export interface SignatureContext {
  userId?: string;
  deviceId?: string;
  purpose: string;
  nonce: string;
  timestamp: Date;
}

export interface HybridSignature {
  id: string;
  classical: PQCSignature;
  pqc: PQCSignature;
  verificationPolicy: HybridVerificationPolicy;
  combined: boolean;
}

export enum HybridVerificationPolicy {
  BOTH_REQUIRED = 'both_required',
  PQC_PRIORITY = 'pqc_priority',
  CLASSICAL_PRIORITY = 'classical_priority',
  EITHER_SUFFICIENT = 'either_sufficient'
}

// ============================================================================
// Encryption Types
// ============================================================================

export interface PQCEncryptedMessage {
  id: string;
  algorithm: PQCAlgorithm;
  ciphertext: Uint8Array;
  encapsulatedKey: Uint8Array;
  recipientPublicKeyId: string;
  encryptedAt: Date;
  senderPublicKeyId?: string;
  metadata: EncryptionMetadata;
}

export interface EncryptionMetadata {
  version: string;
  aad?: Uint8Array; // Additional authenticated data
  nonce?: Uint8Array;
  symmetricAlgorithm: string;
  hashAlgorithm: string;
}

export interface HybridEncryptedMessage {
  id: string;
  classical: {
    ciphertext: Uint8Array;
    encapsulatedKey: Uint8Array;
    algorithm: string;
  };
  pqc: PQCEncryptedMessage;
  combinedKey: Uint8Array; // Derived from both KEM outputs
  derivationMethod: KeyDerivationMethod;
}

export enum KeyDerivationMethod {
  HASH_COMBINATION = 'hash_combination',
  HMAC_KDF = 'hmac_kdf',
  HKDF_SHA384 = 'hkdf_sha384',
  HKDF_SHA512 = 'hkdf_sha512'
}

// ============================================================================
// Migration Types
// ============================================================================

export enum MigrationStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  HYBRID = 'hybrid',
  COMPLETE = 'complete',
  DEPRECATED = 'deprecated'
}

export interface MigrationPlan {
  id: string;
  name: string;
  description: string;
  currentAlgorithms: string[];
  targetAlgorithms: PQCAlgorithm[];
  phases: MigrationPhase[];
  timeline: MigrationTimeline;
  rollbackPlan: RollbackPlan;
  status: MigrationStatus;
}

export interface MigrationPhase {
  order: number;
  name: string;
  description: string;
  actions: MigrationAction[];
  validationCriteria: ValidationCriterion[];
  estimatedDuration: string;
  status: MigrationStatus;
}

export interface MigrationAction {
  type: MigrationActionType;
  description: string;
  parameters: Record<string, unknown>;
  verificationCommand: string;
}

export enum MigrationActionType {
  GENERATE_HYBRID_KEYS = 'generate_hybrid_keys',
  DISTRIBUTE_KEYS = 'distribute_keys',
  UPDATE_PROTOCOLS = 'update_protocols',
  REVOKE_CLASSICAL = 'revoke_classical',
  ENABLE_PQC_ONLY = 'enable_pqc_only',
  UPDATE_CERTIFICATES = 'update_certificates',
  MIGRATE_DATABASE = 'migrate_database',
  UPDATE_API_ENDPOINTS = 'update_api_endpoints'
}

export interface ValidationCriterion {
  metric: string;
  threshold: number;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  current?: number;
  passed?: boolean;
}

export interface MigrationTimeline {
  startDate: Date;
  estimatedEndDate: Date;
  actualEndDate?: Date;
  milestones: Milestone[];
}

export interface Milestone {
  name: string;
  targetDate: Date;
  achievedDate?: Date;
  status: 'pending' | 'achieved' | 'missed';
}

export interface RollbackPlan {
  triggerConditions: string[];
  rollbackSteps: MigrationAction[];
  estimatedRecoveryTime: number; // minutes
}

// ============================================================================
// Certificate Types
// ============================================================================

export interface PQCCertificate {
  id: string;
  version: number;
  serialNumber: string;
  issuer: CertificateIdentity;
  subject: CertificateIdentity;
  publicKey: PQCKey;
  signature: PQCSignature;
  validity: CertificateValidity;
  extensions: CertificateExtension[];
  fingerprint: string;
  pqcReady: boolean;
}

export interface CertificateIdentity {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  email?: string;
}

export interface CertificateValidity {
  notBefore: Date;
  notAfter: Date;
  validityPeriod: number; // days
  isExpired: boolean;
  isNotYetValid: boolean;
}

export interface CertificateExtension {
  oid: string;
  critical: boolean;
  value: unknown;
}

export interface HybridCertificate {
  id: string;
  classical: PQCCertificate; // X.509 with classical algorithm
  pqc: PQCCertificate; // X.509 with PQC algorithm
  combinedValidation: HybridVerificationPolicy;
  crossSigned: boolean;
}

// ============================================================================
// Protocol Types
// ============================================================================

export interface PQCProtocolConfig {
  name: string;
  version: string;
  kexAlgorithms: PQCAlgorithm[];
  signatureAlgorithms: PQCAlgorithm[];
  symmetricCiphers: string[];
  hashFunctions: string[];
  keyExchangeMode: KeyExchangeMode;
  hybridMode: HybridMode;
}

export enum KeyExchangeMode {
  PURE_PQC = 'pure_pqc',
  HYBRID = 'hybrid',
  TRANSITIONAL = 'transitional'
}

export enum HybridMode {
  CONCATENATION = 'concatenation',
  KDF_COMBINATION = 'kdf_combination',
  CASCADE = 'cascade'
}

export interface TLS13PQCConfig extends PQCProtocolConfig {
  name: 'TLS 1.3 PQC';
  cipherSuites: string[];
  signatureSchemes: string[];
  keyShareExtensions: string[];
  supportedGroups: string[];
}

// ============================================================================
// Audit & Compliance Types
// ============================================================================

export interface PQCAuditLog {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  algorithm: PQCAlgorithm;
  operation: string;
  userId?: string;
  deviceId?: string;
  ipAddress?: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  integrityHash: string;
  previousHash: string;
}

export enum AuditEventType {
  KEY_GENERATION = 'key_generation',
  KEY_ROTATION = 'key_rotation',
  KEY_REVOCATION = 'key_revocation',
  SIGNING = 'signing',
  VERIFICATION = 'verification',
  ENCRYPTION = 'encryption',
  DECRYPTION = 'decryption',
  MIGRATION_STARTED = 'migration_started',
  MIGRATION_COMPLETED = 'migration_completed',
  CERTIFICATE_ISSUED = 'certificate_issued',
  CERTIFICATE_REVOKED = 'certificate_revoked',
  SECURITY_INCIDENT = 'security_incident',
  COMPLIANCE_CHECK = 'compliance_check'
}

export interface ComplianceReport {
  id: string;
  generatedAt: Date;
  period: ReportPeriod;
  summary: ComplianceSummary;
  algorithms: AlgorithmCompliance[];
  recommendations: ComplianceRecommendation[];
  certificationStatus: CertificationStatus;
}

export interface ReportPeriod {
  startDate: Date;
  endDate: Date;
}

export interface ComplianceSummary {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  pqcOperations: number;
  hybridOperations: number;
  classicalOperations: number;
  securityIncidents: number;
  complianceScore: number; // 0-100
}

export interface AlgorithmCompliance {
  algorithm: PQCAlgorithm;
  usageCount: number;
  securityLevel: number;
  nistApproved: boolean;
  deprecated: boolean;
  sunsetDate?: Date;
  recommendedAction: string;
}

export interface ComplianceRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedSystems: string[];
  remediationSteps: string[];
  deadline: Date;
}

export interface CertificationStatus {
  fips_140_3: boolean;
  commonCriteria: boolean;
  nist_pqc_approved: boolean;
  quantumReady: boolean;
  lastAuditDate: Date;
  nextAuditDate: Date;
}

// ============================================================================
// Crypto Shredding Types (GDPR Compliance)
// ============================================================================

export interface CryptoShreddingConfig {
  enabled: boolean;
  algorithm: PQCAlgorithm;
  keyManagerEndpoint: string;
  rotationPeriod: number; // days
  retentionPeriod: number; // days
  autoShredOnDeletion: boolean;
  auditEnabled: boolean;
}

export interface ShreddableKey {
  id: string;
  keyId: string;
  dataId: string;
  encryptedData: Uint8Array;
  createdAt: Date;
  shredAfter: Date;
  shreddedAt?: Date;
  shredStatus: ShredStatus;
}

export enum ShredStatus {
  ACTIVE = 'active',
  PENDING_SHRED = 'pending_shred',
  SHREDDED = 'shredded',
  FAILED = 'failed'
}

export interface ShredAuditRecord {
  id: string;
  keyId: string;
  dataId: string;
  shredRequestedAt: Date;
  shredCompletedAt: Date;
  requestedBy: string;
  reason: string;
  verification: ShredVerification;
  integrityHash: string;
}

export interface ShredVerification {
  keyWipeConfirmed: boolean;
  backupWipeConfirmed: boolean;
  auditLogUpdated: boolean;
  complianceRecordCreated: boolean;
}

// ============================================================================
// Future-Proof Types (2060)
// ============================================================================

export interface QuantumResistantIdentity {
  id: string;
  did: string; // Decentralized Identifier
  pqcPublicKey: PQCKey;
  classicalFallback?: PQCKey;
  verifiableCredentials: VerifiableCredential[];
  createdAt: Date;
  updatedAt: Date;
  quantumReadiness: number; // 0-100%
}

export interface VerifiableCredential {
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: Date;
  expirationDate?: Date;
  credentialSubject: Record<string, unknown>;
  proof: PQCSignature;
}

export interface ZeroKnowledgeProof {
  id: string;
  circuit: string;
  publicInputs: unknown[];
  proof: Uint8Array;
  verificationKey: string;
  verifiedAt?: Date;
  verified: boolean;
}

export interface QuantumSafeVault {
  id: string;
  name: string;
  sealAlgorithm: PQCAlgorithm;
  transitEngine: boolean;
  keyRotations: number;
  lastRotation: Date;
  wrappedKeys: WrappedKey[];
}

export interface WrappedKey {
  id: string;
  algorithm: PQCAlgorithm;
  wrappedData: Uint8Array;
  wrappingKeyId: string;
  createdAt: Date;
  expiresAt?: Date;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface PQCKeyStore {
  id: string;
  name: string;
  type: 'memory' | 'filesystem' | 'hsm' | 'cloud' | 'distributed';
  keys: Map<string, PQCKeyPair>;
  certificates: Map<string, PQCCertificate>;
  backedUp: boolean;
  lastBackupDate?: Date;
  encryptionAtRest: boolean;
  accessControl: AccessControlPolicy;
}

export interface AccessControlPolicy {
  readRoles: string[];
  writeRoles: string[];
  deleteRoles: string[];
  auditAll: boolean;
  requireMFA: boolean;
  requireHardwareKey: boolean;
}