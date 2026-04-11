/**
 * Slipstream Protocol Types
 * Core data structures for SHP inter-ecosystem transit
 */

import { SlipstreamClass, SHPStage, TransitStatus, Ecosystem } from './enums';

/** Agent Passport — identity document for cross-ecosystem agents */
export interface AgentPassport {
  /** Unique passport identifier */
  passportId: string;
  /** Agent's canonical DPID */
  agentDpid: string;
  /** Agent display name */
  agentName: string;
  /** Home ecosystem */
  homeEcosystem: Ecosystem;
  /** Permitted destination ecosystems */
  permittedDestinations: Ecosystem[];
  /** Passport issue timestamp */
  issuedAt: Date;
  /** Passport expiry (default: 24h) */
  expiresAt: Date;
  /** OPA policy approval signature */
  opaSignature: string;
  /** PQC-encrypted identity token (ML-KEM-768) */
  pqcToken: string;
}

/** Slipstream Tunnel configuration */
export interface SlipstreamTunnel {
  /** Unique tunnel ID */
  tunnelId: string;
  /** Slipstream class determining protocol and SLA */
  slipstreamClass: SlipstreamClass;
  /** Source ecosystem */
  sourceEcosystem: Ecosystem;
  /** Destination ecosystem */
  destinationEcosystem: Ecosystem;
  /** Agent passport for identity validation */
  passport: AgentPassport;
  /** Current SHP stage */
  stage: SHPStage;
  /** Transit status */
  status: TransitStatus;
  /** Tunnel open timestamp */
  openedAt?: Date;
  /** Expected SLA in milliseconds */
  slaSms: number;
  /** PQC key pair for this tunnel (ML-KEM-768) */
  pqcKeyId: string;
}

/** SHP Message envelope */
export interface SHPMessage {
  /** Message ID */
  messageId: string;
  /** Tunnel this message belongs to */
  tunnelId: string;
  /** Current protocol stage */
  stage: SHPStage;
  /** Message timestamp */
  timestamp: Date;
  /** Encrypted payload (PQC-protected) */
  encryptedPayload?: string;
  /** HMAC signature */
  signature: string;
  /** Message metadata */
  metadata: Record<string, unknown>;
}

/** Transit Request — initiates a new slipstream transit */
export interface TransitRequest {
  /** Requesting agent's passport */
  passport: AgentPassport;
  /** Desired slipstream class */
  slipstreamClass: SlipstreamClass;
  /** Target ecosystem */
  destinationEcosystem: Ecosystem;
  /** Target service/location DPID */
  destinationDpid: string;
  /** Payload to transit */
  payload: unknown;
  /** Request timestamp */
  requestedAt: Date;
  /** Emergency recall token (required for Class D) */
  recallToken?: string;
}

/** Transit Result */
export interface TransitResult {
  /** Tunnel ID used */
  tunnelId: string;
  /** Transit status */
  status: TransitStatus;
  /** Response payload from destination */
  responsePayload?: unknown;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Slipstream class used */
  slipstreamClass: SlipstreamClass;
  /** Completion timestamp */
  completedAt: Date;
  /** Error if failed */
  error?: string;
}

/** Slipstream metrics */
export interface SlipstreamMetrics {
  /** Total transits attempted */
  totalTransits: number;
  /** Successful transits */
  successfulTransits: number;
  /** Failed transits */
  failedTransits: number;
  /** Average duration by class (ms) */
  avgDurationByClass: Record<SlipstreamClass, number>;
  /** SLA compliance rate (0-1) */
  slaComplianceRate: number;
  /** Active tunnels */
  activeTunnels: number;
}
