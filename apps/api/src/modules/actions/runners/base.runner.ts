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

export abstract class BaseActionRunner {
  abstract validateParams(params: unknown): Record<string, unknown>;
  abstract checkPreconditions(params: Record<string, unknown>, service?: any): Promise<ActionPreconditionCheck[]>;
  abstract dryRun(params: Record<string, unknown>, service?: any): Promise<ActionRunnerResult>;
  abstract execute(params: Record<string, unknown>, service?: any): Promise<ActionRunnerResult>;
  abstract rollback(params: Record<string, unknown>, previousOutput?: Record<string, unknown> | null, service?: any): Promise<ActionRunnerResult>;
}