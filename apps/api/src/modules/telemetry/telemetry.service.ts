import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  ErrorCodes,
  MetricSeries,
  ServiceTelemetryResponse,
  TelemetryDataPoint,
  TelemetryMetricType,
  TelemetryQueryRequest,
  TelemetrySummary,
} from '@sopon/contracts';

@Injectable()
export class TelemetryService {
  /**
   * Queries live / simulated service telemetry metrics and computes operational health summaries.
   */
  async queryServiceTelemetry(
    orgId: string,
    query: TelemetryQueryRequest,
  ): Promise<ServiceTelemetryResponse> {
    if (!query.serviceId && !query.serviceSlug) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Either serviceId or serviceSlug must be provided for telemetry queries',
      });
    }

    const service = await prisma.service.findFirst({
      where: {
        organizationId: orgId,
        ...(query.serviceId ? { id: query.serviceId } : {}),
        ...(query.serviceSlug ? { slug: query.serviceSlug.toLowerCase().trim() } : {}),
      },
    });

    if (!service) {
      throw new NotFoundException({
        code: ErrorCodes.SERVICE_NOT_FOUND,
        message: 'Service not found in this organization',
      });
    }

    const windowMinutes = query.timeWindowMinutes || 15;
    const requestedTypes: TelemetryMetricType[] = query.metricTypes && query.metricTypes.length > 0
      ? query.metricTypes
      : ['ERROR_RATE_5XX', 'P95_LATENCY_MS', 'CPU_USAGE_PCT', 'MEMORY_USAGE_PCT', 'ACTIVE_CONNECTIONS'];

    const now = Date.now();
    const metrics: Record<string, MetricSeries> = {};
    const anomalies: string[] = [];

    // Derive deterministic baseline variations based on service status and name
    const isDegraded = service.status === 'DEGRADED' || service.status === 'OUTAGE';
    const baseErrorRate = isDegraded ? 14.5 : 0.2;
    const baseLatency = isDegraded ? 620 : 45;
    const baseCpu = isDegraded ? 88.0 : 34.0;
    const baseMemory = isDegraded ? 92.5 : 55.0;
    const baseConnections = isDegraded ? 950 : 120;

    for (const metricType of requestedTypes) {
      const samplePoints: TelemetryDataPoint[] = [];
      const intervalMs = Math.max(60000, (windowMinutes * 60000) / 15);
      let unit = '%';
      let baseline = 0;

      switch (metricType) {
        case 'ERROR_RATE_5XX':
          unit = '%';
          baseline = baseErrorRate;
          break;
        case 'P95_LATENCY_MS':
          unit = 'ms';
          baseline = baseLatency;
          break;
        case 'CPU_USAGE_PCT':
          unit = '%';
          baseline = baseCpu;
          break;
        case 'MEMORY_USAGE_PCT':
          unit = '%';
          baseline = baseMemory;
          break;
        case 'ACTIVE_CONNECTIONS':
          unit = 'conns';
          baseline = baseConnections;
          break;
        case 'QUEUE_DEPTH':
          unit = 'items';
          baseline = isDegraded ? 420 : 5;
          break;
      }

      for (let t = now - windowMinutes * 60000; t <= now; t += intervalMs) {
        const jitter = (Math.sin(t / 100000) * 0.15 + 1.0);
        const value = Math.round((baseline * jitter) * 10) / 10;
        samplePoints.push({
          timestamp: new Date(t).toISOString(),
          value: Math.max(0, value),
        });
      }

      const currentValue = samplePoints[samplePoints.length - 1]?.value ?? baseline;

      metrics[metricType] = {
        metricType,
        unit,
        currentValue,
        samplePoints,
      };

      // Anomaly detection rules
      if (metricType === 'ERROR_RATE_5XX' && currentValue > 5.0) {
        anomalies.push(`Critical HTTP 5xx error rate spike: ${currentValue}%`);
      } else if (metricType === 'ERROR_RATE_5XX' && currentValue > 1.0) {
        anomalies.push(`Elevated HTTP 5xx error rate: ${currentValue}%`);
      }

      if (metricType === 'P95_LATENCY_MS' && currentValue > 500) {
        anomalies.push(`Severe P95 latency degradation: ${currentValue}ms`);
      }

      if (metricType === 'CPU_USAGE_PCT' && currentValue > 85.0) {
        anomalies.push(`High CPU utilization: ${currentValue}%`);
      }

      if (metricType === 'MEMORY_USAGE_PCT' && currentValue > 90.0) {
        anomalies.push(`Critical memory saturation: ${currentValue}%`);
      }

      if (metricType === 'ACTIVE_CONNECTIONS' && currentValue > 800) {
        anomalies.push(`Connection pool near exhaustion: ${currentValue} active conns`);
      }
    }

    const currentErrorRate = metrics['ERROR_RATE_5XX']?.currentValue ?? baseErrorRate;
    const currentLatency = metrics['P95_LATENCY_MS']?.currentValue ?? baseLatency;

    let healthStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (currentErrorRate > 5.0 || currentLatency > 500 || anomalies.length >= 2) {
      healthStatus = 'CRITICAL';
    } else if (currentErrorRate > 1.0 || currentLatency > 200 || anomalies.length === 1) {
      healthStatus = 'DEGRADED';
    }

    const summary: TelemetrySummary = {
      healthStatus,
      currentErrorRatePct: currentErrorRate,
      p95LatencyMs: currentLatency,
      cpuPct: metrics['CPU_USAGE_PCT']?.currentValue ?? baseCpu,
      memoryPct: metrics['MEMORY_USAGE_PCT']?.currentValue ?? baseMemory,
      activeConnections: metrics['ACTIVE_CONNECTIONS']?.currentValue ?? baseConnections,
      anomaliesDetected: anomalies,
    };

    return {
      serviceId: service.id,
      serviceName: service.name,
      serviceSlug: service.slug,
      environment: service.environment,
      timeWindowMinutes: windowMinutes,
      queriedAt: new Date().toISOString(),
      summary,
      metrics,
    };
  }
}
