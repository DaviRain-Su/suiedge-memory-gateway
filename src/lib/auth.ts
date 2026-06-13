/**
 * Auth: every request must carry X-Sui-Address and X-Sui-Signature.
 * The signature is verifyPersonalMessage(METHOD\nPATH\nBODY_SHA256_HEX).
 *
 * For Day 1 this is a stub that always returns 401. The real implementation
 * (Day 2) calls @mysten/sui.verifyPersonalMessage.
 */
import { GatewayError } from './errors.js';

export interface AuthContext {
  address: string; // 0x... Sui address
}

export function requireAuth(headers: Headers, method: string, path: string, body: string): AuthContext {
  const addr = headers.get('x-sui-address');
  const sig = headers.get('x-sui-signature');
  if (!addr || !sig) {
    throw new GatewayError('UNAUTHORIZED', 'missing X-Sui-Address or X-Sui-Signature');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(addr)) {
    throw new GatewayError('BAD_REQUEST', 'malformed Sui address');
  }
  // Day 1 stub: reject. Day 2 will verify with @mysten/sui.verifyPersonalMessage.
  if (process.env.AUTH_STUB_PASS === '1' && sig === 'stub') {
    return { address: addr };
  }
  throw new GatewayError('UNAUTHORIZED', 'signature verification not yet implemented (Day 1 stub)');
}
