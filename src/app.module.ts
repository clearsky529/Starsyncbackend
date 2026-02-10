import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { FriendModule } from './friend/friend.module';
import { ProjectModule } from './project/project.module';
import { UserModule } from './user/user.module';
import { ChatModule } from './socket/chat.module';
import { SyncModule } from './socket/sync.module';
import { NotificationModule } from './socket/notification.module';
import { TelemetryModule } from './libs/telemetry/telemetry.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { JwtService } from '@app/services/jwt.service';
import { RedisService } from '@app/redis/redis.service';
import database from '@app/config/database.config';
import redis from '@app/config/redis.config';

import { User } from '@app/entities/user.entity';
import { Friend } from '@app/entities/friend.entity';
import { FriendRequest } from '@app/entities/friend-request.entity';
import { AuthMiddleware } from './auth/auth.middleware';
import { Project } from '@app/entities/project.entity';
import { Collaborator } from '@app/entities/collaborator.entity';
import { ProjectInvitation } from '@app/entities/project-invitation.entity';
import { ChatMessage } from '@app/entities/chat-message.entity';
import { ChatReadReceipt } from '@app/entities/chat-read-receipt.entity';
import { PatternComment } from '@app/entities/pattern-comment.entity';
import { ProjectSnapshot } from '@app/entities/project-snapshot.entity';
import { ProjectActivity } from '@app/entities/project-activity.entity';

const configs = [database, redis];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configs,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [User, Friend, FriendRequest, Project, Collaborator, ProjectInvitation, ChatMessage, PatternComment, ChatReadReceipt, ProjectSnapshot, ProjectActivity],
    }),
    AuthModule,
    FriendModule,
    ProjectModule,
    UserModule,
    ChatModule,
    SyncModule,
    NotificationModule,
    TelemetryModule,
    TranscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtService, RedisService],
  exports: [RedisService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        {
          path: 'auth/login',
          method: RequestMethod.POST,
        },
        {
          path: 'auth/register',
          method: RequestMethod.POST,
        },
        {
          path: 'health',
          method: RequestMethod.GET,
        },
        {
          path: 'socket-info',
          method: RequestMethod.GET,
        },
        {
          path: 'transcription/transcribe',
          method: RequestMethod.POST,
        },
      )
      .forRoutes('*');
  }
}
