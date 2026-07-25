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

  export interface SignKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  export const sign: {
    (msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
    open(signedMsg: Uint8Array, publicKey: Uint8Array): Uint8Array | null;
    detached(msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
    detached: {
      (msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
      verify(msg: Uint8Array, sig: Uint8Array, publicKey: Uint8Array): boolean;
    };
    keyPair: {
      (): SignKeyPair;
      fromSecretKey(secretKey: Uint8Array): SignKeyPair;
      fromSeed(seed: Uint8Array): SignKeyPair;
    };
    publicKeyLength: number;
    secretKeyLength: number;
    seedLength: number;
    signatureLength: number;
  };
}
