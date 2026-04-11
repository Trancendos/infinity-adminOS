// ============================================================
// TIGA Daisy-Chain Traceability Validator
// Verifies: [External Law] → [FF-CTRL] → [TEF-POL] → [APP-PROC] → [REC-HASH]
// ============================================================

import crypto from 'crypto';

export interface TraceabilityRecord {
  externalLaw: string;       // e.g., "ISO 27001 A.8.2"
  ffControl: string;         // e.g., "FF-CTRL-001"
  tefPolicy: string;         // e.g., "TEF-POL-001"
  appProcedure: string;      // e.g., "APP-PROC-001"
  evidence: string;          // The actual evidence/action taken
  timestamp: string;
  hash?: string;             // SHA-512 of the full chain
}

export interface ValidationResult {
  valid: boolean;
  chain: string;
  hash: string;
  errors: string[];
}

// Known valid FF-CTRL → TEF-POL mappings
const VALID_MAPPINGS: Record<string, string> = {
  'FF-CTRL-001': 'TEF-POL-001',
  'FF-CTRL-002': 'TEF-POL-002',
  'FF-CTRL-003': 'TEF-POL-003',
  'FF-CTRL-004': 'TEF-POL-004',
  'FF-CTRL-005': 'TEF-POL-005',
  'FF-CTRL-006': 'TEF-POL-006',
  'FF-CTRL-007': 'TEF-POL-007',
  'FF-CTRL-008': 'TEF-POL-008',
  'FF-CTRL-009': 'TEF-POL-009',
  'FF-CTRL-010': 'TEF-POL-010',
  'FF-CTRL-011': 'TEF-POL-011',
  'FF-CTRL-012': 'TEF-POL-012',
};

export function validateDaisyChain(record: TraceabilityRecord): ValidationResult {
  const errors: string[] = [];

  // Validate FF-CTRL format
  if (!/^FF-CTRL-\d{3}$/.test(record.ffControl)) {
    errors.push(`Invalid FF-CTRL format: ${record.ffControl}`);
  }

  // Validate TEF-POL format
  if (!/^TEF-POL-\d{3}$/.test(record.tefPolicy)) {
    errors.push(`Invalid TEF-POL format: ${record.tefPolicy}`);
  }

  // Validate APP-PROC format
  if (!/^APP-PROC-\d{3}$/.test(record.appProcedure)) {
    errors.push(`Invalid APP-PROC format: ${record.appProcedure}`);
  }

  // Validate FF-CTRL → TEF-POL mapping
  const expectedTEF = VALID_MAPPINGS[record.ffControl];
  if (expectedTEF && expectedTEF !== record.tefPolicy) {
    errors.push(`FF-CTRL ${record.ffControl} must map to ${expectedTEF}, not ${record.tefPolicy}`);
  }

  // Build chain string
  const chain = `${record.externalLaw} → ${record.ffControl} → ${record.tefPolicy} → ${record.appProcedure}`;

  // Compute SHA-512 hash of the full record
  const hashInput = JSON.stringify({
    ...record,
    chain,
    timestamp: record.timestamp,
  });
  const hash = crypto.createHash('sha512').update(hashInput).digest('hex');

  return {
    valid: errors.length === 0,
    chain,
    hash,
    errors,
  };
}

export function createAuditRecord(
  ffControl: string,
  evidence: string,
  appProcedure: string = 'APP-PROC-001'
): TraceabilityRecord {
  const mapping = VALID_MAPPINGS[ffControl];
  if (!mapping) {
    throw new Error(`Unknown FF-CTRL: ${ffControl}`);
  }

  // Derive external law from FF-CTRL
  const externalLawMap: Record<string, string> = {
    'FF-CTRL-001': 'ISO 27001 A.8.2',
    'FF-CTRL-002': 'NIST AC-1',
    'FF-CTRL-003': 'EU AI Act Art.13',
    'FF-CTRL-004': 'NIST SI-4',
    'FF-CTRL-005': 'ISO 27001 A.16',
    'FF-CTRL-006': 'GDPR Art.25',
    'FF-CTRL-007': 'EU AI Act Art.9',
    'FF-CTRL-008': 'NIST AU-2',
    'FF-CTRL-009': 'NIST SC-13',
    'FF-CTRL-010': 'JSP 936',
    'FF-CTRL-011': 'NIST PQC',
    'FF-CTRL-012': 'EU AI Act Art.5',
  };

  const record: TraceabilityRecord = {
    externalLaw: externalLawMap[ffControl] || 'UNKNOWN',
    ffControl,
    tefPolicy: mapping,
    appProcedure,
    evidence,
    timestamp: new Date().toISOString(),
  };

  const result = validateDaisyChain(record);
  record.hash = result.hash;

  return record;
}
