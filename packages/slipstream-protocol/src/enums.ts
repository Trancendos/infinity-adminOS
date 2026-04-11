/**
 * Slipstream Protocol Enumerations
 * Defines all classes, states, and protocol stages
 */

/** Slipstream Classes — defines transit channel type and SLA */
export enum SlipstreamClass {
  /** Class A — Agent Transit via gRPC. Standard agent-to-agent communication */
  A_AGENT    = 'CLASS_A_AGENT',
  /** Class B — Data Transfer via HTTPS. Large payload inter-ecosystem sync */
  B_DATA     = 'CLASS_B_DATA',
  /** Class C — Event Stream via MQTT. Lightweight event broadcasting */
  C_EVENT    = 'CLASS_C_EVENT',
  /** Class D — Emergency Transit. 5ms SLA, highest priority, all others yield */
  D_EMERGENCY = 'CLASS_D_EMERGENCY',
}

/** SHP (Slipstream Handshake Protocol) message stages */
export enum SHPStage {
  HELLO           = 'SHP_HELLO',
  CHALLENGE       = 'SHP_CHALLENGE',
  RESPONSE        = 'SHP_RESPONSE',
  OPA_VALIDATE    = 'SHP_OPA_VALIDATE',
  WARP_TUNNEL_OPEN = 'SHP_WARP_TUNNEL_OPEN',
  TRANSIT         = 'SHP_TRANSIT',
  CLOSE           = 'SHP_CLOSE',
  ERROR           = 'SHP_ERROR',
}

/** Transit status codes */
export enum TransitStatus {
  PENDING    = 'PENDING',
  HANDSHAKING = 'HANDSHAKING',
  VALIDATED  = 'VALIDATED',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETE   = 'COMPLETE',
  FAILED     = 'FAILED',
  RECALLED   = 'RECALLED',
}

/** Ecosystem identifiers for all 6 Trancendos ecosystems */
export enum Ecosystem {
  PSYON      = 'PSYON',
  AVALON     = 'AVALON',
  INFINITY   = 'INFINITY',
  IMPERIUM   = 'IMPERIUM',
  PEGASUS    = 'PEGASUS',
  TRANQUILITY = 'TRANQUILITY',
}
