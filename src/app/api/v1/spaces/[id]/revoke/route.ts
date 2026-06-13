import { z } from 'zod';
import { NextResponse } from 'next/server';
import { errorResponse, GatewayError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { revoke } from '@/lib/service/policy';
import type { RevokeRequest } from '@/lib/types';

const Body = z.object({
  policyId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const body: RevokeRequest = Body.parse(await req.json());
    const auth = requireAuth(req.headers, 'POST', `/v1/spaces/${spaceId}/revoke`, JSON.stringify(body));
    const pol = await revoke({ spaceId, caller: auth.address, policyId: body.policyId });
    return NextResponse.json(pol);
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
