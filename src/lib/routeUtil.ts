/**
 * Day 1 stub: every unimplemented route returns 501 INTERNAL with a clear message.
 * Replaced by real handlers in Day 2-5.
 */
import { NextResponse } from 'next/server';

export function notImplemented(name: string): NextResponse {
  return NextResponse.json(
    { code: 'INTERNAL', message: `${name} not yet implemented (Day 1 stub)` },
    { status: 501 },
  );
}
