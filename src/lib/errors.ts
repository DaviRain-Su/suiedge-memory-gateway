/**
 * Single error shape for the gateway. Every service function throws a
 * GatewayError; route handlers convert it to the JSON ErrorResponse body.
 */
export type GatewayErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SUI_TX_FAILED'
  | 'WALRUS_WRITE_FAILED'
  | 'INTERNAL';

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(
    code: GatewayErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = statusFor(code);
    this.details = details;
    this.name = 'GatewayError';
  }
}

export function statusFor(code: GatewayErrorCode): number {
  switch (code) {
    case 'BAD_REQUEST':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'SUI_TX_FAILED':
    case 'WALRUS_WRITE_FAILED':
    case 'INTERNAL':
      return 500;
  }
}

export function errorResponse(err: unknown): { body: { code: GatewayErrorCode; message: string; details?: Record<string, unknown> }; status: number } {
  if (err instanceof GatewayError) {
    return {
      status: err.status,
      body: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
  }
  return {
    status: 500,
    body: {
      code: 'INTERNAL',
      message: err instanceof Error ? err.message : 'unknown error',
    },
  };
}
