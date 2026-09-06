import { Module } from '@nestjs/common';
import { SecretCipherService } from './crypto/secret-cipher.service';

@Module({
  providers: [SecretCipherService],
  exports: [SecretCipherService],
})
export class CommonModule {}
