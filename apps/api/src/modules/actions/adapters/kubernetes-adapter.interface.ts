export interface K8sDeploymentStatus {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  image: string;
  status: string;
  revision: string;
}

export interface K8sScaleResult {
  previousReplicas: number;
  currentReplicas: number;
  namespace: string;
  deploymentName: string;
  scaledAt: string;
}

export interface K8sRestartResult {
  restartTriggered: boolean;
  restartedAt: string;
  namespace: string;
  deploymentName: string;
  revision: string;
}

export interface K8sRollbackResult {
  rolledBack: boolean;
  restoredRevision: string;
  namespace: string;
  deploymentName: string;
  rolledBackAt: string;
}

export interface KubernetesAdapter {
  getDeployment(
    namespace: string,
    deploymentName: string,
    credentials?: Record<string, unknown>,
  ): Promise<K8sDeploymentStatus>;

  scaleDeployment(
    namespace: string,
    deploymentName: string,
    targetReplicas: number,
    credentials?: Record<string, unknown>,
  ): Promise<K8sScaleResult>;

  restartDeployment(
    namespace: string,
    deploymentName: string,
    credentials?: Record<string, unknown>,
  ): Promise<K8sRestartResult>;

  rollbackDeployment(
    namespace: string,
    deploymentName: string,
    targetRevision?: string,
    credentials?: Record<string, unknown>,
  ): Promise<K8sRollbackResult>;
}
