import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { loadContext } from '@/lib/service/context';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: spaceId } = await ctx.params;
    const url = new URL(req.url);
    const maxItems = Number(url.searchParams.get('maxItems') ?? 50);
    const path = `/v1/spaces/${spaceId}/context?maxItems=${maxItems}`;
    const auth = await requireAuth(req.headers, 'GET', path, '');
    const bundle = await loadContext({ spaceId, caller: auth.address, maxItems });
    return NextResponse.json(bundle);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
