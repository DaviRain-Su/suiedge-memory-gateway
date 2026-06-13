import { z } from 'zod';
import { NextResponse } from 'next/server';
import { errorResponse, GatewayError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { writeProofLog, listProofLogs } from '@/lib/service/proofLogs';
import type { WriteProofLogRequest } from '@/lib/types';

const Body = z.object({
  runId: z.string().min(1).max(128),
  agentId: z.string().min(1).max(128),
  input: z.string().min(1).max(1_000_000),
  output: z.string().min(1).max(1_000_000),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const body: WriteProofLogRequest = Body.parse(await req.json());
    const auth = requireAuth(req.headers, 'POST', `/v1/spaces/${spaceId}/proof-logs`, JSON.stringify(body));
    const rec = await writeProofLog({
      spaceId,
      caller: auth.address,
      runId: body.runId,
      agentId: body.agentId,
      input: body.input,
      output: body.output,
    });
    return NextResponse.json(rec, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const ge = new GatewayError('BAD_REQUEST', 'invalid body', { issues: err.issues });
      const { status, body } = errorResponse(ge);
      return NextResponse.json(body, { status });
    }
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const path = `/v1/spaces/${spaceId}/proof-logs`;
    const auth = requireAuth(req.headers, 'GET', path, '');
    const recs = listProofLogs({ spaceId, caller: auth.address });
    return NextResponse.json(recs);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
