/**
 * Type contracts shared by every SuiEdge SDK adapter.
 * The HTTP, MCP, AI-SDK, and LangChain adapters all share these shapes.
 */
export interface SuiAddress {
  /** 0x + 64 hex chars */
  address: string;
}

export interface AgentSpace {
  id: string;
  owner: string;
  name: string;
  version: number;
  activeMemoryRoot: string;
}

export type MemoryKind = 'summary' | 'decision' | 'context' | 'note';

export interface MemoryRecord {
  id: string;
  spaceId: string;
  version: number;
  kind: MemoryKind;
  walrusBlobId: string;
  contentHash: string;
  createdAt: string;
}

export interface MemoryWithBody extends MemoryRecord {
  payload: string;
}

export interface ArtifactRecord {
  id: string;
  spaceId: string;
  version: number;
  name: string;
  mimeType: string;
  walrusBlobId: string;
  contentHash: string;
  createdAt: string;
}

export interface ProofLogRecord {
  id: string;
  spaceId: string;
  runId: string;
  agentId: string;
  inputHash: string;
  outputHash: string;
  walrusBlobId: string;
  createdAt: string;
}

export interface AccessPolicy {
  id: string;
  spaceId: string;
  subject: string;
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
  revokedAt: string | null;
}

export interface ContextLoadResult {
  space: AgentSpace;
  memories: MemoryWithBody[];
}
