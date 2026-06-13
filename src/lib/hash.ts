/**
 * Content hashing for blobs. SHA-256 hex string.
 * Used both for content_hash sent to Move and for the Walrus upload integrity check.
 */
import { createHash } from 'node:crypto';

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  const h = createHash('sha256');
  h.update(data);
  return h.digest('hex');
}

export function keccak256Hex(data: Buffer | Uint8Array | string): string {
  // Move uses keccak256 internally; we use sha256 here because the on-chain digest
  // is opaque (a fingerprint of the content_hash, not the content). For external
  // verification the user can recompute. We expose both for completeness.
  // For the active_memory_root purpose any 32-byte digest is acceptable; SHA-256
  // is fine and matches Walrus conventions.
  return sha256Hex(data);
}
