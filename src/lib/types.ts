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
