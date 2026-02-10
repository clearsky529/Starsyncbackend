import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User as UserEntity } from '@app/entities/user.entity';
import { Friend as FriendEntity } from '@app/entities/friend.entity';
import { Project as ProjectEntity } from '@app/entities/project.entity';
import { Collaborator as CollaboratorEntity } from '@app/entities/collaborator.entity';
import { ProjectInvitation } from '@app/entities/project-invitation.entity';
import { PatternComment } from '@app/entities/pattern-comment.entity';
import { ProjectSnapshot } from '@app/entities/project-snapshot.entity';
import { ProjectActivity } from '@app/entities/project-activity.entity';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectInvitationService } from './project-invitation.service';
import { PatternCommentService } from './pattern-comment.service';
import { PatternCommentController } from './pattern-comment.controller';
import { PermissionService } from '@app/services/permission.service';
import { RedisService } from '@app/redis/redis.service';
import { NotificationModule } from '@app/socket/notification.module';
import { VersionTrackerService } from './version-tracker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      FriendEntity,
      ProjectEntity,
      CollaboratorEntity,
      ProjectInvitation,
      PatternComment,
      ProjectSnapshot,
      ProjectActivity,
    ]),
    forwardRef(() => NotificationModule),
  ],
  providers: [
    ProjectService,
    ProjectInvitationService,
    PatternCommentService,
    PermissionService,
    RedisService,
    VersionTrackerService,
  ],
  controllers: [ProjectController, PatternCommentController],
  exports: [PermissionService, VersionTrackerService],
})
export class ProjectModule {}
