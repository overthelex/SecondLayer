declare module 'tweetnacl' {
  export interface BoxKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  export const box: {
    keyPair(): BoxKeyPair;
    (msg: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
    open(box: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array | null;
    before(theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
    after(msg: Uint8Array, nonce: Uint8Array, sharedKey: Uint8Array): Uint8Array;
    open_after(box: Uint8Array, nonce: Uint8Array, sharedKey: Uint8Array): Uint8Array | null;
    keyPair: {
      (): BoxKeyPair;
      fromSecretKey(secretKey: Uint8Array): BoxKeyPair;
    };
    nonceLength: number;
    publicKeyLength: number;
    secretKeyLength: number;
    sharedKeyLength: number;
    overheadLength: number;
  };

  export function scalarMult(n: Uint8Array, p: Uint8Array): Uint8Array;

  export const scalarMult: {
    (n: Uint8Array, p: Uint8Array): Uint8Array;
    base(n: Uint8Array): Uint8Array;
    scalarLength: number;
    groupElementLength: number;
  };
}
