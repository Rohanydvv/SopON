import { Module } from '@nestjs/common';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { DevelopmentKmsProvider } from './development-kms.provider';

@Module({
  controllers: [VaultController],
  providers: [
    VaultService,
    {
      provide: 'KmsProvider',
      useClass: DevelopmentKmsProvider,
    },
  ],
  exports: [VaultService, 'KmsProvider'],
})
export class VaultModule {}
