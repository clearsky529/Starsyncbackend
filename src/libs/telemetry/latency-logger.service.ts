/*
  Latency Logger Service
  Logs latency measurements for various operations
*/

import { Injectable } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import * as opentelemetry from '@opentelemetry/api';

interface LatencyMeasurement {
  operation: string;
  latencyMs: number;
  timestamp: number;
  attributes?: Record<string, string>;
}

@Injectable()
export class LatencyLoggerService {
  private measurements: LatencyMeasurement[] = [];
  private readonly MAX_MEASUREMENTS = 1000; // Keep last 1000 measurements

  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * Log latency for an operation
   */
  logLatency(
    operation: string,
    latencyMs: number,
    attributes?: Record<string, string>,
  ) {
    const measurement: LatencyMeasurement = {
      operation,
      latencyMs,
      timestamp: Date.now(),
      attributes,
    };

    // Add to measurements array
    this.measurements.push(measurement);
    if (this.measurements.length > this.MAX_MEASUREMENTS) {
      this.measurements.shift(); // Remove oldest
    }

    // Record in OpenTelemetry
    this.telemetryService.recordLatency(operation, latencyMs, attributes);

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Latency] ${operation}: ${latencyMs.toFixed(2)}ms`,
        attributes || '',
      );
    }
  }

  /**
   * Measure latency for an async operation
   */
  async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    attributes?: Record<string, string>,
  ): Promise<T> {
    const start = Date.now();
    const span = this.telemetryService.startSpan(operation);

    try {
      const result = await fn();
      const latency = Date.now() - start;
      this.logLatency(operation, latency, { ...attributes, success: 'true' });
      span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
      return result;
    } catch (error) {
      const latency = Date.now() - start;
      this.logLatency(operation, latency, { ...attributes, success: 'false' });
      span.setStatus({
        code: opentelemetry.SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Measure latency for a sync operation
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    attributes?: Record<string, string>,
  ): T {
    const start = Date.now();
    const span = this.telemetryService.startSpan(operation);

    try {
      const result = fn();
      const latency = Date.now() - start;
      this.logLatency(operation, latency, { ...attributes, success: 'true' });
      span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
      return result;
    } catch (error) {
      const latency = Date.now() - start;
      this.logLatency(operation, latency, { ...attributes, success: 'false' });
      span.setStatus({
        code: opentelemetry.SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get latency statistics for an operation
   */
  getLatencyStats(operation: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  } {
    const opMeasurements = this.measurements.filter(
      (m) => m.operation === operation,
    );

    if (opMeasurements.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0,
      };
    }

    const latencies = opMeasurements.map((m) => m.latencyMs).sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);
    const average = sum / latencies.length;
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    return {
      count: latencies.length,
      average,
      min,
      max,
      p95: latencies[p95Index] || 0,
      p99: latencies[p99Index] || 0,
    };
  }

  /**
   * Get all latency measurements
   */
  getAllMeasurements(): LatencyMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Clear all measurements
   */
  clearMeasurements() {
    this.measurements = [];
  }
}
