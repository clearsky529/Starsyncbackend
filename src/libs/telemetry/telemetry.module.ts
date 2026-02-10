/*
  Telemetry Module
  Module for OpenTelemetry integration
*/

import { Module, Global } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { LatencyLoggerService } from './latency-logger.service';

@Global()
@Module({
  providers: [TelemetryService, LatencyLoggerService],
  exports: [TelemetryService, LatencyLoggerService],
})
export class TelemetryModule {}
