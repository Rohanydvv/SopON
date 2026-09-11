import { KubernetesAdapter } from '../adapters/kubernetes-adapter.interface';
import { VaultService } from '../../vault/vault.service';

export interface ActionPreconditionCheck {
  check: string;
  passed: boolean;
  reason?: string;
}

export interface ActionRunnerResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
  verificationProbes: Array<{ probe: string; passed: boolean; message: string }>;
}

export interface ActionExecutionContext {
  orgId?: string;
  service?: any;
  vaultService?: VaultService;
  kubernetesAdapter?: KubernetesAdapter;
  credentials?: Record<string, unknown>;
  failVerificationProbe?: boolean;
}

export abstract class BaseActionRunner {
  abstract validateParams(params: unknown): Record<string, unknown>;
  abstract checkPreconditions(
    params: Record<string, unknown>,
    service?: any,
    context?: ActionExecutionContext,
  ): Promise<ActionPreconditionCheck[]>;
  abstract dryRun(
    params: Record<string, unknown>,
    service?: any,
    context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult>;
  abstract execute(
    params: Record<string, unknown>,
    service?: any,
    context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult>;
  abstract rollback(
    params: Record<string, unknown>,
    previousOutput?: Record<string, unknown> | null,
    service?: any,
    context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult>;
}