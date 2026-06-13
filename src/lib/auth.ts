/**
 * Auth: every request must carry X-Sui-Address and X-Sui-Signature.
 * The signature is verifyPersonalMessage(METHOD\nPATH\nsha256(BODY)).
 *
 * For live mode the verification goes through the LiveSuiClient which
 * delegates to @mysten/sui's verifyPersonalMessageSignature. For tests
 * and offline dev, AUTH_STUB_PASS=1 accepts the literal signature
 * value "stub".
 */
import { GatewayError } from './errors';
import { getSuiClient } from './sui';

export interface AuthContext {
  /** Verified Sui address (0x + 64 hex). */
  address: string;
}

export async function requireAuth(
  headers: Headers,
  method: string,
  path: string,
  body: string,
): Promise<AuthContext> {
  const addr = headers.get('x-sui-address');
  const sig = headers.get('x-sui-signature');
  if (!addr || !sig) {
    throw new GatewayError('UNAUTHORIZED', 'missing X-Sui-Address or X-Sui-Signature');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(addr)) {
    throw new GatewayError('BAD_REQUEST', 'malformed Sui address');
  }
  if (process.env.AUTH_STUB_PASS === '1' && sig === 'stub') {
    return { address: addr };
  }
  const ok = await getSuiClient().verifySignature({
    address: addr,
    method,
    path,
    body,
    signature: sig,
  });
  if (!ok) {
    throw new GatewayError('UNAUTHORIZED', 'signature verification failed');
  }
  return { address: addr };
}
