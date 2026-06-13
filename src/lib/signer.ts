/**
 * Server-side Sui signer for the gateway.
 *
 * In the MVP the gateway holds the wallet key and signs PTBs on
 * behalf of the agent flow. The production wiring decodes a bech32
 * private key (suiprivkey1...) via @mysten/sui's decodeSuiPrivateKey,
 * which returns { scheme, secretKey } — NOT a Keypair instance.
 * We then construct the concrete subclass (Ed25519Keypair /
 * Secp256k1Keypair / Secp256r1Keypair) via the appropriate
 * fromSecretKey() factory.
 *
 * In test/dev a stub signer is supplied that signs nothing (PTBs fail
 * to execute), so the rest of the gateway can be exercised without
 * a real key.
 */
import {
  decodeSuiPrivateKey,
  Keypair,
  type Signer,
  type PublicKey,
} from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { config } from './config';

export interface SuiWalletSigner {
  /** Sui 0x + 64 hex address. */
  readonly address: string;
  /** Signer compatible with @mysten/sui SuiGrpcClient.signAndExecuteTransaction. */
  readonly signer: Signer;
  /** "env" for real key, "stub" for test/dev. */
  readonly label: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Minimal stub Keypair used when no SUI_PRIVATE_KEY is set. */
class StubKeypair extends Keypair {
  override getSecretKey(): string {
    return 'suiprivkey1stub';
  }
  override getKeyScheme() {
    return 'ED25519' as const;
  }
  override getPublicKey(): PublicKey {
    // The address is unused because PTB submission will fail before any
    // signature check. We just need a real PublicKey to satisfy the type.
    return Ed25519Keypair.generate().getPublicKey();
  }
  override sign(_bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return Promise.resolve(new Uint8Array(new ArrayBuffer(64)));
  }
}

class StubSigner implements SuiWalletSigner {
  readonly address = ZERO_ADDRESS;
  readonly signer: Signer = new StubKeypair();
  readonly label = 'stub';
}

function keypairFromParsed(parsed: { scheme: string; secretKey: Uint8Array }): Keypair {
  switch (parsed.scheme) {
    case 'ED25519':
      return Ed25519Keypair.fromSecretKey(parsed.secretKey);
    case 'Secp256k1':
      return Secp256k1Keypair.fromSecretKey(parsed.secretKey);
    case 'Secp256r1':
      return Secp256r1Keypair.fromSecretKey(parsed.secretKey);
    default:
      // MultiSig / ZkLogin / Passkey are not supported in this MVP.
      throw new Error(`unsupported key scheme: ${parsed.scheme}`);
  }
}

class EnvKeypairSigner implements SuiWalletSigner {
  readonly label: string;
  readonly kp: Keypair;
  constructor(bech32: string, tag = 'env') {
    this.kp = keypairFromParsed(decodeSuiPrivateKey(bech32));
    this.label = tag;
  }
  get address(): string {
    return this.kp.getPublicKey().toSuiAddress();
  }
  get signer(): Signer {
    return this.kp;
  }
}

let current: SuiWalletSigner | null = null;

export function getSigner(): SuiWalletSigner {
  if (current) return current;
  const bech32 = config().suiPrivateKey;
  if (bech32 && bech32.length > 0) {
    current = new EnvKeypairSigner(bech32);
  } else {
    current = new StubSigner();
  }
  return current;
}

export function setSigner(s: SuiWalletSigner | null): void {
  current = s;
}

export function resetSignerForTest(): void {
  current = null;
}
