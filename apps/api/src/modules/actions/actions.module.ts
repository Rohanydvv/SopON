import { Module } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { ActionsController } from './actions.controller';
import { VaultModule } from '../vault/vault.module';
import { MockKubernetesAdapter } from './adapters/mock-kubernetes.adapter';

@Module({
  imports: [VaultModule],
  controllers: [ActionsController],
  providers: [
    ActionsService,
    MockKubernetesAdapter,
    {
      provide: 'KubernetesAdapter',
      useExisting: MockKubernetesAdapter,
    },
  ],
  exports: [ActionsService, MockKubernetesAdapter, 'KubernetesAdapter'],
})
export class ActionsModule {}