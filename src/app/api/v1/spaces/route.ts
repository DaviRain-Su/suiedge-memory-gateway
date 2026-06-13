import { z } from 'zod';
import { NextResponse } from 'next/server';
import { errorResponse, GatewayError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { createSpace, listSpaces } from '@/lib/service/spaces';
import type { CreateSpaceRequest } from '@/lib/types';

const CreateBody = z.object({ name: z.string().min(1).max(64) });

export async function POST(req: Request) {
  try {
    const body: CreateSpaceRequest = CreateBody.parse(await req.json());
    const auth = await requireAuth(req.headers, 'POST', '/v1/spaces', JSON.stringify(body));
    const space = await createSpace({ owner: auth.address, name: body.name });
    return NextResponse.json(space, { status: 201 });
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const owner = url.searchParams.get('owner');
    if (!owner || !/^0x[0-9a-fA-F]{64}$/.test(owner)) {
      throw new GatewayError('BAD_REQUEST', 'owner query param required (0x + 64 hex)');
    }
    await requireAuth(req.headers, 'GET', `/v1/spaces?owner=${owner}`, '');
    const spaces = listSpaces({ owner });
    return NextResponse.json(spaces);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
