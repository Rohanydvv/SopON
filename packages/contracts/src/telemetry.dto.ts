import { z } from 'zod';

export const TelemetryMetricTypeSchema = z.enum([
  'ERROR_RATE_5XX',
  'P95_LATENCY_MS',
  'CPU_USAGE_PCT',
  'MEMORY_USAGE_PCT',
  'ACTIVE_CONNECTIONS',
  'QUEUE_DEPTH',
]);

export type TelemetryMetricType = z.infer<typeof TelemetryMetricTypeSchema>;

export const TelemetryQueryRequestSchema = z.object({
  serviceId: z.string().optional(),
  serviceSlug: z.string().optional(),
  timeWindowMinutes: z.number().min(1).max(1440).default(15),
  metricTypes: z.array(TelemetryMetricTypeSchema).optional(),
});

export type TelemetryQueryRequest = z.infer<typeof TelemetryQueryRequestSchema>;

export interface TelemetryDataPoint {
  timestamp: string;
  value: number;
}

export interface MetricSeries {
  metricType: TelemetryMetricType;
  unit: string;
  currentValue: number;
  samplePoints: TelemetryDataPoint[];
}

export interface TelemetrySummary {
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  currentErrorRatePct: number;
  p95LatencyMs: number;
  cpuPct: number;
  memoryPct: number;
  activeConnections: number;
  anomaliesDetected: string[];
}

export interface ServiceTelemetryResponse {
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  environment: string;
  timeWindowMinutes: number;
  queriedAt: string;
  summary: TelemetrySummary;
  metrics: Record<string, MetricSeries>;
}
