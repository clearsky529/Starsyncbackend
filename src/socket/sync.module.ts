// sync.module.ts
import { Module } from '@nestjs/common';
import { SyncGateway } from './sync.gateway';
import { RedisService } from '@app/redis/redis.service';
import { LockQueueService } from './lock-queue.service';
import { TelemetryModule } from '../libs/telemetry/telemetry.module';

@Module({
  imports: [TelemetryModule],
  providers: [SyncGateway, RedisService, LockQueueService],
  exports: [LockQueueService],
})
export class SyncModule {}
