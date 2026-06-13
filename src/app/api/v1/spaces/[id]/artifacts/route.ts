import { z } from 'zod';
import { NextResponse } from 'next/server';
import { errorResponse, GatewayError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { writeArtifact, listArtifacts } from '@/lib/service/artifacts';
import type { WriteArtifactRequest } from '@/lib/types';

const Body = z.object({
  name: z.string().min(1).max(128),
  mimeType: z.string().min(1).max(128),
  payload: z.string().min(1).max(10_000_000), // base64
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const body: WriteArtifactRequest = Body.parse(await req.json());
    const auth = requireAuth(req.headers, 'POST', `/v1/spaces/${spaceId}/artifacts`, JSON.stringify(body));
    const rec = await writeArtifact({
      spaceId,
      caller: auth.address,
      name: body.name,
      mimeType: body.mimeType,
      payload: body.payload,
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
    const path = `/v1/spaces/${spaceId}/artifacts`;
    const auth = requireAuth(req.headers, 'GET', path, '');
    const recs = listArtifacts({ spaceId, caller: auth.address });
    return NextResponse.json(recs);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
