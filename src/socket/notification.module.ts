import { Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { JwtService } from '@app/services/jwt.service';

@Module({
  providers: [NotificationGateway, JwtService],
  exports: [NotificationGateway],
})
export class NotificationModule {}

