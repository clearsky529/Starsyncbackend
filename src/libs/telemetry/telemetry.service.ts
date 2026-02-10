/*
  Telemetry Service
  OpenTelemetry integration for backend profiling and monitoring
*/

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as opentelemetry from '@opentelemetry/api';
import {
  NodeSDK,
  tracing,
  metrics,
} from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

interface CachedInstruments {
  latencyHistogram?: ReturnType<opentelemetry.Meter['createHistogram']>;
  messageCounter?: ReturnType<opentelemetry.Meter['createCounter']>;
  connectionGauge?: ReturnType<opentelemetry.Meter['createUpDownCounter']>;
}

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private sdk: NodeSDK | null = null;
  private tracer: opentelemetry.Tracer;
  private meter: opentelemetry.Meter;
  private instruments: CachedInstruments = {};

  onModuleInit() {
    // Initialize OpenTelemetry SDK
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'starsync-backend',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    });

    // Configure trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    });

    // Configure metric exporter
    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics',
    });

    // Initialize SDK
    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10000, // Export every 10 seconds
    });

    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: metricReader as any,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable some instrumentations if needed
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
        }),
      ],
    });

    // Start SDK
    this.sdk.start();

    // Get tracer and meter
    this.tracer = opentelemetry.trace.getTracer('starsync-backend');
    this.meter = opentelemetry.metrics.getMeter('starsync-backend');

    console.log('✅ OpenTelemetry initialized');
  }

  onModuleDestroy() {
    if (this.sdk) {
      this.sdk.shutdown();
      this.sdk = null;
    }
  }

  /**
   * Get tracer for creating spans
   */
  getTracer(): opentelemetry.Tracer {
    return this.tracer;
  }

  /**
   * Get meter for creating metrics
   */
  getMeter(): opentelemetry.Meter {
    return this.meter;
  }

  /**
   * Create a span for an operation
   */
  startSpan(name: string, options?: opentelemetry.SpanOptions): opentelemetry.Span {
    return this.tracer.startSpan(name, options);
  }

  /**
   * Record latency metric
   */
  recordLatency(operation: string, latencyMs: number, attributes?: Record<string, string>) {
    if (!this.instruments.latencyHistogram) {
      this.instruments.latencyHistogram = this.meter.createHistogram(
        'operation_latency_ms',
        { description: 'Operation latency in milliseconds' },
      );
    }
    const attrs: Record<string, string> = { operation, ...attributes };
    this.instruments.latencyHistogram.record(latencyMs, attrs);
  }

  /**
   * Record message count metric
   */
  recordMessageCount(messageType: string, count: number = 1) {
    if (!this.instruments.messageCounter) {
      this.instruments.messageCounter = this.meter.createCounter('messages_total', {
        description: 'Total number of messages processed',
      });
    }
    this.instruments.messageCounter.add(count, { message_type: messageType });
  }

  /**
   * Record WebSocket connection metric
   */
  recordConnection(connected: boolean) {
    if (!this.instruments.connectionGauge) {
      this.instruments.connectionGauge = this.meter.createUpDownCounter(
        'websocket_connections',
        { description: 'Number of active WebSocket connections' },
      );
    }
    this.instruments.connectionGauge.add(connected ? 1 : -1);
  }
}
