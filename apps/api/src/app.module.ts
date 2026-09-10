import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { MembersModule } from './modules/members/members.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ServicesModule } from './modules/services/services.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { SopsModule } from './modules/sops/sops.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { ActionsModule } from './modules/actions/actions.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { VaultModule } from './modules/vault/vault.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    HealthModule,
    AuthModule,
    OrganizationsModule,
    MembersModule,
    InvitationsModule,
    ServicesModule,
    IntegrationsModule,
    IncidentsModule,
    SopsModule,
    CopilotModule,
    ActionsModule,
    TelemetryModule,
    VaultModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}