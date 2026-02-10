import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User as UserEntity } from '@app/entities/user.entity';
import { Friend as FriendEntity } from '@app/entities/friend.entity';
import { FriendRequest } from '@app/entities/friend-request.entity';
import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';
import { NotificationModule } from '@app/socket/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, FriendEntity, FriendRequest]),
    forwardRef(() => NotificationModule),
  ],
  providers: [FriendService],
  controllers: [FriendController],
  exports: [FriendService],
})
export class FriendModule {}
