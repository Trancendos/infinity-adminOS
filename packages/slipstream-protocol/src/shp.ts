/**
 * Slipstream Handshake Protocol (SHP) — Core Implementation
 * DPID: DPID-SEN-SHP-001
 *
 * Protocol flow:
 *   HELLO → CHALLENGE → RESPONSE → OPA_VALIDATE → WARP_TUNNEL_OPEN → TRANSIT → SHP_CLOSE
 */

import { SHPStage, SlipstreamClass, TransitStatus } from './enums';
import { SHPMessage, SlipstreamTunnel, TransitRequest, TransitResult } from './types';
// Use native crypto.randomUUID() — no external uuid dependency needed

/** SLA targets in milliseconds per Slipstream Class */
export const SLA_TARGETS_MS: Record<SlipstreamClass, number> = {
  [SlipstreamClass.A_AGENT]:      100,   // 100ms for agent-to-agent gRPC
  [SlipstreamClass.B_DATA]:       500,   // 500ms for data transfer
  [SlipstreamClass.C_EVENT]:       50,   // 50ms for event streaming
  [SlipstreamClass.D_EMERGENCY]:    5,   // 5ms for emergency (HIGHEST PRIORITY)
};

/** Create a new SHP message */
export function createSHPMessage(
  tunnelId: string,
  stage: SHPStage,
  payload?: unknown,
  signature = 'placeholder-hmac'
): SHPMessage {
  return {
    messageId: crypto.randomUUID(),
    tunnelId,
    stage,
    timestamp: new Date(),
    encryptedPayload: payload ? JSON.stringify(payload) : undefined,
    signature,
    metadata: { protocol: 'SHP/1.0', standard: '2060' },
  };
}

/** Create a new Slipstream Tunnel */
export function createTunnel(request: TransitRequest, pqcKeyId: string): SlipstreamTunnel {
  return {
    tunnelId: crypto.randomUUID(),
    slipstreamClass: request.slipstreamClass,
    sourceEcosystem: request.passport.homeEcosystem,
    destinationEcosystem: request.destinationEcosystem,
    passport: request.passport,
    stage: SHPStage.HELLO,
    status: TransitStatus.HANDSHAKING,
    slaSms: SLA_TARGETS_MS[request.slipstreamClass],
    pqcKeyId,
  };
}

/** Validate SLA compliance */
export function checkSLACompliance(
  slipstreamClass: SlipstreamClass,
  durationMs: number
): boolean {
  return durationMs <= SLA_TARGETS_MS[slipstreamClass];
}

/** Build a HELLO message for initiating SHP */
export function buildHello(request: TransitRequest): SHPMessage {
  const tunnelId = crypto.randomUUID();
  return createSHPMessage(tunnelId, SHPStage.HELLO, {
    passportId: request.passport.passportId,
    agentDpid: request.passport.agentDpid,
    homeEcosystem: request.passport.homeEcosystem,
    destinationEcosystem: request.destinationEcosystem,
    slipstreamClass: request.slipstreamClass,
    requestedAt: request.requestedAt,
  });
}

/** Protocol stage transition validator */
export function isValidTransition(from: SHPStage, to: SHPStage): boolean {
  const transitions: Record<SHPStage, SHPStage[]> = {
    [SHPStage.HELLO]:            [SHPStage.CHALLENGE],
    [SHPStage.CHALLENGE]:        [SHPStage.RESPONSE],
    [SHPStage.RESPONSE]:         [SHPStage.OPA_VALIDATE, SHPStage.ERROR],
    [SHPStage.OPA_VALIDATE]:     [SHPStage.WARP_TUNNEL_OPEN, SHPStage.ERROR],
    [SHPStage.WARP_TUNNEL_OPEN]: [SHPStage.TRANSIT],
    [SHPStage.TRANSIT]:          [SHPStage.CLOSE, SHPStage.ERROR],
    [SHPStage.CLOSE]:            [],
    [SHPStage.ERROR]:            [],
  };
  return transitions[from]?.includes(to) ?? false;
}
