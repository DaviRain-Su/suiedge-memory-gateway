/**
 * Aggregate all MCP tool definitions.
 */
import { McpTool } from './types';
import { spaceTools } from './space';
import { memoryTools } from './memory';
import { contextTools } from './context';
import { artifactTools } from './artifact';
import { traceTools } from './trace';
import { policyTools } from './policy';

export const toolDefinitions: McpTool[] = [
  ...spaceTools,
  ...memoryTools,
  ...contextTools,
  ...artifactTools,
  ...traceTools,
  ...policyTools,
];
