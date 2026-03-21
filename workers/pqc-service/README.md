# PQC Service

**DPID:** DPID-DIM-SEC-PQC-001  
**Port:** 3079  
**Ecosystem:** GUARDIAN

Post-Quantum Cryptography service for the Trancendos Universe. Provides ML-KEM-768 (CRYSTALS-Kyber) key management, quantum-safe tunnel establishment, and key rotation for all Slipstream warp tunnels.

## NIST PQC Standards

| Standard | Algorithm | Purpose |
|----------|-----------|---------|
| FIPS 203 | ML-KEM (Kyber) | Key Encapsulation Mechanism |
| FIPS 204 | ML-DSA (Dilithium) | Digital Signature |
| FIPS 205 | SLH-DSA (SPHINCS+) | Stateless Hash-Based Signatures |

## Quantum Threat Model

**Current Threat Level:** HARVEST_NOW_DECRYPT_LATER

Adversaries may be collecting encrypted traffic today to decrypt once cryptographically-relevant quantum computers exist (~2029-2035). ML-KEM-768 provides NIST Security Level 3 protection against this threat.

### Key Lengths (ML-KEM-768)
- Public key: 1,184 bytes
- Ciphertext: 1,088 bytes  
- Shared secret: 32 bytes

## Migration Progress

73% of Slipstream warp tunnels have been migrated from classical cryptography to ML-KEM-768. Target: 100% by Q2 2025.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + migration progress |
| POST | `/keys/generate` | Generate new PQC key pair |
| GET | `/keys` | List all keys (filtered) |
| GET | `/keys/:keyId` | Get key details (no private material) |
| POST | `/keys/:keyId/rotate` | Rotate a key pair |
| GET | `/threat-assessment` | Quantum threat assessment |
| POST | `/kem/encapsulate` | Simulate KEM encapsulation |
| GET | `/rotation-history` | Key rotation audit log |
| GET | `/migration-status` | PQC migration progress per ecosystem |
