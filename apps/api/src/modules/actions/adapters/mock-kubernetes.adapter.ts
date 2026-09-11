import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  K8sDeploymentStatus,
  K8sRestartResult,
  K8sRollbackResult,
  K8sScaleResult,
  KubernetesAdapter,
} from './kubernetes-adapter.interface';

interface DeploymentState {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  image: string;
  status: string;
  revision: string;
  previousRevision?: string;
  previousReplicas?: number;
  restartedAt?: string;
}

@Injectable()
export class MockKubernetesAdapter implements KubernetesAdapter {
  private readonly deployments = new Map<string, DeploymentState>();
  private readonly verificationFailureMap = new Map<string, boolean>();

  constructor() {
    // Seed default mock cluster deployments
    this.seedDeployment('production', 'payment-checkout-api', 2);
    this.seedDeployment('production', 'payment-gateway', 2);
    this.seedDeployment('staging', 'payment-checkout-api', 1);
  }

  seedDeployment(namespace: string, deploymentName: string, replicas = 2) {
    const key = this.getKey(namespace, deploymentName);
    this.deployments.set(key, {
      name: deploymentName,
      namespace,
      replicas,
      readyReplicas: replicas,
      availableReplicas: replicas,
      image: `registry.company.internal/${deploymentName}:v1.4.2`,
      status: 'AVAILABLE',
      revision: '1',
    });
  }

  setVerificationFailureFlag(namespace: string, deploymentName: string, shouldFail: boolean) {
    this.verificationFailureMap.set(this.getKey(namespace, deploymentName), shouldFail);
  }

  async getDeployment(
    namespace: string,
    deploymentName: string,
    credentials?: Record<string, unknown>,
  ): Promise<K8sDeploymentStatus> {
    this.validateCredentials(credentials);
    const state = this.getOrSeedState(namespace, deploymentName);
    return { ...state };
  }

  async scaleDeployment(
    namespace: string,
    deploymentName: string,
    targetReplicas: number,
    credentials?: Record<string, unknown>,
  ): Promise<K8sScaleResult> {
    this.validateCredentials(credentials);

    if (targetReplicas < 1 || targetReplicas > 20) {
      throw new BadRequestException({
        code: 'BLAST_RADIUS_VIOLATION',
        message: `Target replica count ${targetReplicas} exceeds allowed bounds (1 to 20)`,
      });
    }

    const state = this.getOrSeedState(namespace, deploymentName);
    const previous = state.replicas;

    state.previousReplicas = previous;
    state.replicas = targetReplicas;
    state.readyReplicas = targetReplicas;
    state.availableReplicas = targetReplicas;

    const scaledAt = new Date().toISOString();

    return {
      previousReplicas: previous,
      currentReplicas: targetReplicas,
      namespace,
      deploymentName,
      scaledAt,
    };
  }

  async restartDeployment(
    namespace: string,
    deploymentName: string,
    credentials?: Record<string, unknown>,
  ): Promise<K8sRestartResult> {
    this.validateCredentials(credentials);
    const state = this.getOrSeedState(namespace, deploymentName);

    const oldRev = parseInt(state.revision, 10) || 1;
    state.previousRevision = state.revision;
    state.revision = String(oldRev + 1);
    state.restartedAt = new Date().toISOString();

    return {
      restartTriggered: true,
      restartedAt: state.restartedAt,
      namespace,
      deploymentName,
      revision: state.revision,
    };
  }

  async rollbackDeployment(
    namespace: string,
    deploymentName: string,
    targetRevision?: string,
    credentials?: Record<string, unknown>,
  ): Promise<K8sRollbackResult> {
    this.validateCredentials(credentials);
    const state = this.getOrSeedState(namespace, deploymentName);

    const rollbackToRev = targetRevision || state.previousRevision || '1';
    state.revision = rollbackToRev;
    if (state.previousReplicas !== undefined) {
      state.replicas = state.previousReplicas;
      state.readyReplicas = state.previousReplicas;
    }

    return {
      rolledBack: true,
      restoredRevision: rollbackToRev,
      namespace,
      deploymentName,
      rolledBackAt: new Date().toISOString(),
    };
  }

  private validateCredentials(credentials?: Record<string, unknown>) {
    if (credentials && credentials.invalid) {
      throw new UnauthorizedException({
        code: 'KUBERNETES_AUTH_FAILED',
        message: 'Kubernetes cluster authentication failed: invalid token or expired certificate',
      });
    }
  }

  private getOrSeedState(namespace: string, deploymentName: string): DeploymentState {
    const key = this.getKey(namespace, deploymentName);
    let state = this.deployments.get(key);
    if (!state) {
      // For testing dynamically created services
      state = {
        name: deploymentName,
        namespace,
        replicas: 2,
        readyReplicas: 2,
        availableReplicas: 2,
        image: `registry.company.internal/${deploymentName}:latest`,
        status: 'AVAILABLE',
        revision: '1',
      };
      this.deployments.set(key, state);
    }
    return state;
  }

  private getKey(namespace: string, deploymentName: string): string {
    return `${namespace.toLowerCase()}:${deploymentName.toLowerCase()}`;
  }
}
