/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as openpgp from 'openpgp';

export interface GhostHandshake {
  ver: 1;
  name: string;
  pubKey: string;
  fp: string;
  topic: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

export const PGP = {

  async generateIdentity(name: string = 'Ghost'): Promise<KeyPair> {
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ name, email: 'ghost@walls.rip' }],
      format: 'armored'
    });

    const key = await openpgp.readKey({ armoredKey: publicKey });
    const fingerprint = key.getFingerprint().toUpperCase().slice(-8);

    return { publicKey, privateKey, fingerprint };
  },

  async encrypt(text: string, receiverPublicKeyArmored: string): Promise<string> {
    try {
      const publicKey = await openpgp.readKey({ armoredKey: receiverPublicKeyArmored });
      const fingerprint = publicKey.getFingerprint().toUpperCase().slice(-8);

      const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text }),
        encryptionKeys: publicKey,
        config: { preferredCompressionAlgorithm: openpgp.enums.compression.zlib }
      }) as string;

      return `[WALLS.RIP: ${fingerprint}]\n${encrypted}`;
    } catch (e) {
      console.error("Encryption Failed:", e);
      throw new Error("ENCRYPTION_FAILED");
    }
  },

  async decrypt(ciphertext: string, myPrivateKeyArmored: string): Promise<string> {
    let privateKey;
    let myFingerprint;
    try {
      privateKey = await openpgp.readPrivateKey({ armoredKey: myPrivateKeyArmored });
      myFingerprint = privateKey.getFingerprint().toUpperCase().slice(-8);
    } catch (e) {
      throw new Error("INVALID_PRIVATE_KEY");
    }

    const headerMatch = ciphertext.match(/^\[WALLS\.RIP:\s*([A-F0-9]{8})\]/i);
    if (headerMatch) {
      const targetFingerprint = headerMatch[1];
      if (targetFingerprint !== myFingerprint) {
        throw new Error(`WRONG_RECIPIENT:Message is for ${targetFingerprint}, but you are ${myFingerprint}`);
      }
    }

    const beginMarker = '-----BEGIN PGP MESSAGE-----';
    const endMarker = '-----END PGP MESSAGE-----';

    const startIndex = ciphertext.indexOf(beginMarker);
    const endIndex = ciphertext.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error("NO_PGP_BLOCK_FOUND");
    }

    const cleanCiphertext = ciphertext.substring(startIndex, endIndex + endMarker.length);

    try {
      const message = await openpgp.readMessage({ armoredMessage: cleanCiphertext });
      const { data: decrypted } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey
      });
      return decrypted as string;
    } catch (e: any) {
      console.error("OpenPGP Decrypt Error:", e);

      if (e.message.includes('Session key decryption failed')) {
        throw new Error("KEY_MISMATCH: Your private key cannot unlock this message.");
      }
      throw new Error("DECRYPTION_CORE_FAILED");
    }
  },

  async importIdentity(armoredPrivateKey: string, passphrase?: string): Promise<KeyPair> {
    try {
      const privateKey = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey });

      if (!privateKey.isDecrypted()) {
        if (!passphrase) {
          throw new Error("PASSPHRASE_REQUIRED");
        }
        try {
          await openpgp.decryptKey({ privateKey, passphrase: passphrase as string });
        } catch (e) {
          throw new Error("WRONG_PASSPHRASE");
        }
      }

      const publicKey = privateKey.toPublic().armor();
      const fingerprint = privateKey.getFingerprint().toUpperCase().slice(-8);

      return {
        publicKey,
        privateKey: armoredPrivateKey,
        fingerprint
      };
    } catch (e: any) {
      if (e.message === "PASSPHRASE_REQUIRED" || e.message === "WRONG_PASSPHRASE") {
        throw e;
      }
      console.error("Import Error", e);
      throw new Error("INVALID_KEY_FORMAT");
    }
  },

  async getFingerprintFromKey(armoredKey: string): Promise<string> {
    try {
      const key = await openpgp.readKey({ armoredKey });
      return key.getFingerprint().toUpperCase().slice(-8);
    } catch (e) {
      console.error("Failed to parse key fingerprint", e);
      throw new Error("INVALID_KEY");
    }
  },

  isValidPublicKey(text: string): boolean {
    return text.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----');
  },

  isPGPMessage(text: string): boolean {
    return text.includes('-----BEGIN PGP MESSAGE-----');
  },

  isMyOutput(text: string, _myFingerprint?: string): boolean {
    return text.startsWith('[WALLS.RIP:');
  }
};
