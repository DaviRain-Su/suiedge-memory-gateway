import { notImplemented } from '@/lib/routeUtil';

export async function POST(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return notImplemented('POST /v1/spaces/:id/artifacts');
}

export async function GET(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return notImplemented('GET /v1/spaces/:id/artifacts');
}
