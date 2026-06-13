import { z } from 'zod';
import { NextResponse } from 'next/server';
import { errorResponse, GatewayError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { share } from '@/lib/service/policy';
import type { ShareRequest } from '@/lib/types';

const Body = z.object({
  subject: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canShare: z.boolean(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const body: ShareRequest = Body.parse(await req.json());
    const auth = requireAuth(req.headers, 'POST', `/v1/spaces/${spaceId}/share`, JSON.stringify(body));
    const pol = await share({
      spaceId,
      caller: auth.address,
      subject: body.subject,
      canRead: body.canRead,
      canWrite: body.canWrite,
      canShare: body.canShare,
    });
    return NextResponse.json(pol, { status: 201 });
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
