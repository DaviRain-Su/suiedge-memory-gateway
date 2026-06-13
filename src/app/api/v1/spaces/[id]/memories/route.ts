import { z } from 'zod';
import { NextResponse } from 'next/server';
import { errorResponse, GatewayError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { writeMemory, listMemories } from '@/lib/service/memories';
import type { WriteMemoryRequest } from '@/lib/types';

const WriteBody = z.object({
  kind: z.enum(['summary', 'decision', 'context', 'note']),
  payload: z.string().min(1).max(1_000_000),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const body: WriteMemoryRequest = WriteBody.parse(await req.json());
    const auth = await requireAuth(req.headers, 'POST', `/v1/spaces/${spaceId}/memories`, JSON.stringify(body));
    const rec = await writeMemory({ spaceId, caller: auth.address, kind: body.kind, payload: body.payload });
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
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const path = `/v1/spaces/${spaceId}/memories?limit=${limit}`;
    const auth = await requireAuth(req.headers, 'GET', path, '');
    const recs = listMemories({ spaceId, caller: auth.address, limit });
    return NextResponse.json(recs);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
