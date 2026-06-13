'use client';

/**
 * useSignedFetch — drop-in replacement for fetch() that signs the
 * canonical challenge string with the connected wallet before sending.
 *
 * The challenge is `${method}\n${path}\nsha256(body)`, exactly what the
 * gateway's `requireAuth` middleware expects via
 * `verifyPersonalMessageSignature`. The user's connected wallet signs it
 * via dapp-kit's `useSignPersonalMessage`, and we attach the
 * `X-Sui-Address` and `X-Sui-Signature` headers.
 *
 * If no wallet is connected, the request is still made — the gateway
 * will reject it unless AUTH_STUB_PASS=1 (demo mode) or the route is
 * owner-filtered (?owner=0x...). This matches the dashboard's
 * "Connect a wallet or pass ?owner=…" UX.
 */
import { useCallback } from 'react';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { canonicalString } from '@/lib/sui';

export interface SignedFetchInit extends Omit<RequestInit, 'body'> {
  /** String body — we hash this and send. */
  body?: string;
}

export function useSignedFetch() {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  return useCallback(
    async (path: string, init: SignedFetchInit = {}): Promise<Response> => {
      const method = (init.method ?? 'GET').toUpperCase();
      const body = init.body ?? '';
      const url = path.startsWith('http') ? new URL(path) : new URL(path, window.location.origin);
      const pathWithQuery = url.pathname + url.search;

      const headers = new Headers(init.headers);
      if (body && !headers.has('content-type')) headers.set('content-type', 'application/json');

      if (account) {
        const message = canonicalString(method, pathWithQuery, body);
        const { signature } = await signPersonalMessage({ message: new TextEncoder().encode(message) });
        headers.set('X-Sui-Address', account.address);
        headers.set('X-Sui-Signature', signature);
      }

      return fetch(path, { ...init, headers, body: body || undefined });
    },
    [account, signPersonalMessage],
  );
}
