import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

// Encrypts EnvironmentVariable.value at rest for kind: 'secret'. The key
// comes from ENCRYPTION_KEY (env var, never stored in the DB, never
// logged) — hashed to a fixed 32-byte key so operators can set any string,
// not just a hex-encoded 32-byte value.
@Injectable()
export class SecretCipherService {
  private readonly logger = new Logger(SecretCipherService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const rawKey = this.config.get<string>('ENCRYPTION_KEY');
    if (!rawKey) {
      this.logger.warn(
        'ENCRYPTION_KEY is not set — falling back to an insecure ' +
          'development-only key. Secrets will NOT be safe at rest. Set ' +
          'ENCRYPTION_KEY before storing any real secret.',
      );
    }
    this.key = createHash('sha256')
      .update(rawKey || 'insecure-dev-only-encryption-key')
      .digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, ciphertext].map((b) => b.toString('hex')).join(':');
  }

  decrypt(payload: string): string {
    const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
