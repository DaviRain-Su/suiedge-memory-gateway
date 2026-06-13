/**
 * @suiedge/client-sdk — barrel.
 * Re-exports the HTTP client and shared types.
 */
export { SuiEdgeClient, SuiEdgeError } from './http.ts';
export type { Signer, ClientOptions } from './http.ts';
export type {
  AgentSpace,
  MemoryKind,
  MemoryRecord,
  MemoryWithBody,
  ArtifactRecord,
  ProofLogRecord,
  AccessPolicy,
  ContextLoadResult,
} from './types.ts';
