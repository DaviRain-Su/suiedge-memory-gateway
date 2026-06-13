/**
 * SuiWalletSigner — server-side signer abstraction.
 *
 * The gateway needs a single signing identity to submit Move PTBs on
 * behalf of the agent flow. The production wiring decodes a bech32
 * private key (suiprivkey1...) via @mysten/sui's decodeSuiPrivateKey.
 *
 * In test/dev a stub signer is supplied that signs nothing (PTBs fail
 * to execute), so the rest of the gateway can be exercised without
 * a wallet.
 */
import { Keypair, decodeSuiPrivateKey, type Signer } from '@mysten/sui/cryptography';
import { config } from './config.js';

export interface SuiWalletSigner {
  /** Sui address of this signer (0x + 64 hex). */
  address(): string;
  /** @mysten/sui Signer (keypair). */
  signer(): Signer;
  /** Free-form label for logs. */
  label(): string;
}

/** Real signer: loaded from SUI_PRIVATE_KEY env (bech32). */
export class EnvKeypairSigner implements SuiWalletSigner {
  private readonly kp: Keypair;
  private readonly tag: string;
  constructor(bech32: string, tag = 'env') {
    const parsed = decodeSuiPrivateKey(bech32);
    if (!(parsed instanceof Keypair)) {
      throw new Error('decoded key is not a Keypair (multi-sig not supported in MVP)');
    }
    this.kp = parsed;
    this.tag = tag;
  }
  address(): string {
    return this.kp.toSuiAddress();
  }
  signer(): Signer {
    return this.kp;
  }
  label(): string {
    return this.tag;
  }
}

/** No-op signer for tests. PTB submit will fail; use the mock client. */
export class StubSigner implements SuiWalletSigner {
  constructor(private readonly addr: string, private readonly tag = 'stub') {}
  address(): string {
    return this.addr;
  }
  signer(): Signer {
    throw new Error('StubSigner has no Signer — wire EnvKeypairSigner for live mode');
  }
  label(): string {
    return this.tag;
  }
}

let _singleton: SuiWalletSigner | null = null;

export function getSigner(): SuiWalletSigner {
  if (_singleton) return _singleton;
  const pk = config().suiPrivateKey;
  if (pk) {
    _singleton = new EnvKeypairSigner(pk);
  } else {
    const stubAddr = '0x' + '0'.repeat(64);
    _singleton = new StubSigner(stubAddr);
  }
  return _singleton;
}

export function setSigner(s: SuiWalletSigner): void {
  _singleton = s;
}

export function resetSignerForTest(): void {
  _singleton = null;
}
