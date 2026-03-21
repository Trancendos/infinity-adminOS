/**
 * Agent Passport Control
 * DPID: DPID-SEN-PAC-001
 *
 * Validates and issues Agent Passports for cross-ecosystem transit.
 * Every agent transiting through Sentinel Station must present a valid passport.
 */

import { AgentPassport } from './types';
import { Ecosystem } from './enums';
// Use native crypto.randomUUID() — no external uuid dependency needed

const PASSPORT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Issue a new Agent Passport */
export function issuePassport(
  agentDpid: string,
  agentName: string,
  homeEcosystem: Ecosystem,
  permittedDestinations: Ecosystem[],
  opaSignature: string,
  pqcToken: string
): AgentPassport {
  const now = new Date();
  return {
    passportId: crypto.randomUUID(),
    agentDpid,
    agentName,
    homeEcosystem,
    permittedDestinations,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + PASSPORT_TTL_MS),
    opaSignature,
    pqcToken,
  };
}

/** Validate a passport (non-expired, valid destination) */
export function validatePassport(
  passport: AgentPassport,
  destinationEcosystem: Ecosystem
): { valid: boolean; reason?: string } {
  const now = new Date();

  if (passport.expiresAt < now) {
    return { valid: false, reason: 'Passport expired' };
  }

  if (!passport.permittedDestinations.includes(destinationEcosystem)) {
    return { valid: false, reason: `Destination ${destinationEcosystem} not in permitted destinations` };
  }

  if (!passport.opaSignature || passport.opaSignature.length < 8) {
    return { valid: false, reason: 'Invalid OPA signature' };
  }

  return { valid: true };
}

/** Check if passport grants transit to all ecosystems (universal pass) */
export function isUniversalPassport(passport: AgentPassport): boolean {
  const allEcosystems = Object.values(Ecosystem);
  return allEcosystems.every(e => passport.permittedDestinations.includes(e));
}

/** Revoke a passport (mark as expired immediately) */
export function revokePassport(passport: AgentPassport): AgentPassport {
  return { ...passport, expiresAt: new Date(0) };
}
