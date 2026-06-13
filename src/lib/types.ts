export type AgentSpace = {
  id: string;
  owner: string;
  name: string;
  activeMemoryRoot?: string;
  policyId?: string;
  version: number;
};

export type MemoryRecord = {
  id: string;
  spaceId: string;
  kind: 'summary' | 'decision' | 'context' | 'note';
  walrusBlobId: string;
  contentHash: string;
  version: number;
  createdAt: string;
};

export type ArtifactRecord = {
  id: string;
  spaceId: string;
  name: string;
  mimeType: string;
  walrusBlobId: string;
  contentHash: string;
  version: number;
};

export type ProofLog = {
  id: string;
  spaceId: string;
  runId: string;
  agentId: string;
  inputHash: string;
  outputHash: string;
  walrusBlobId: string;
  createdAt: string;
};

export type AccessPolicy = {
  id: string;
  spaceId: string;
  subject: string;
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
  revoked: boolean;
};
// -- Extended request/response/error types (DESIGN.detailed §5) --

// Memory kinds (must match Move KIND_*)
export type MemoryKind = 1 | 2 | 3;
export const MEMORY_KIND: Record<'memory' | 'artifact' | 'proofLog', MemoryKind> = {
  memory: 1,
  artifact: 2,
  proofLog: 3,
};

// Request bodies
export interface CreateSpaceRequest {
  name: string;
}
export interface ShareRequest {
  subject: string;
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
}
export interface WriteMemoryRequest {
  kind: 'summary' | 'decision' | 'context' | 'note';
  payload: string;
}
export interface WriteArtifactRequest {
  name: string;
  mimeType: string;
  payload: string; // base64
}
export interface WriteProofLogRequest {
  runId: string;
  agentId: string;
  input: string;
  output: string;
}
export interface RevokeRequest {
  policyId: string;
}

// Responses
export interface ContextBundle {
  spaceId: string;
  items: Array<{
    kind: 'summary' | 'decision' | 'context' | 'note';
    version: number;
    contentHash: string;
    content: string;
  }>;
}

// Error body shape — all non-2xx responses use this
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SUI_TX_FAILED'
  | 'WALRUS_WRITE_FAILED'
  | 'INTERNAL';

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
