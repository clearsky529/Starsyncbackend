import { BadRequestException, Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { User as UserEntity } from '@app/entities/user.entity';
import { Friend as FriendEntity } from '@app/entities/friend.entity';
import { FriendRequest, FriendRequestStatus } from '@app/entities/friend-request.entity';
import { NotificationGateway } from '@app/socket/notification.gateway';

@Injectable()
export class FriendService {
  private readonly logger = new Logger(FriendService.name);

  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(FriendEntity)
    private friendRepo: Repository<FriendEntity>,
    @InjectRepository(FriendRequest)
    private friendRequestRepo: Repository<FriendRequest>,
    @Inject(forwardRef(() => NotificationGateway))
    private notificationGateway: NotificationGateway,
  ) {}

  async getFriends(userId: string) {
    const friends1 = await this.friendRepo.findBy({ user1: userId });
    const friends2 = await this.friendRepo.findBy({ user2: userId });
    const allFriends = friends1.concat(friends2);
    
    // Get user details for each friend
    const friendsWithDetails = await Promise.all(
      allFriends.map(async (friend) => {
        const friendUserId = friend.user1 === userId ? friend.user2 : friend.user1;
        const user = await this.userRepo.findOneBy({ id: friendUserId });
        return {
          id: friend.id,
          user_id: friendUserId,
          username: user?.username || 'Unknown',
          email: user?.email || '',
          first_name: user?.first_name || '',
          last_name: user?.last_name || '',
          created_at: friend.created_at,
        };
      })
    );
    
    return friendsWithDetails;
  }

  async addFriend(userId: string, friendUserName: string) {
    const user = await this.userRepo.findOneBy({ username: friendUserName });
    if (!user) {
      throw new BadRequestException("Username doesn't exist");
    }

    if(userId === user.id) {
      throw new BadRequestException('You cannot add yourself as a friend');
    }
    
    const friendId = user.id;
    let friend = await this.friendRepo.findOneBy({
      user1: userId,
      user2: friendId,
    });

    if (friend) {
      throw new BadRequestException('Already added');
    }

    friend = await this.friendRepo.findOneBy({
      user1: friendId,
      user2: userId,
    });

    if (friend) {
      throw new BadRequestException('Already added');
    }

    const newFriend = new FriendEntity();
    newFriend.user1 = userId;
    newFriend.user2 = friendId;
    const savedFriend = await this.friendRepo.save(newFriend);

    // Return user information instead of friend entity
    return {
      id: savedFriend.id,
      user_id: friendId,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      created_at: savedFriend.created_at,
    };
  }

  async removeFriend(userId: string, friendId: string) {
    await this.friendRepo.delete({ user1: userId, user2: friendId });
    await this.friendRepo.delete({ user1: friendId, user2: userId });

    return { msg: 'Friend is removed' };
  }

  // Friend Request Methods
  async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('You cannot send a friend request to yourself');
    }

    const receiver = await this.userRepo.findOneBy({ id: receiverId });
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    // Check if already friends
    const existingFriend1 = await this.friendRepo.findOneBy({
      user1: senderId,
      user2: receiverId,
    });
    const existingFriend2 = await this.friendRepo.findOneBy({
      user1: receiverId,
      user2: senderId,
    });
    if (existingFriend1 || existingFriend2) {
      throw new BadRequestException('Already friends');
    }

    // Check if request already exists
    const existingRequest = await this.friendRequestRepo.findOne({
      where: [
        { senderId, receiverId, status: FriendRequestStatus.PENDING },
        { senderId: receiverId, receiverId: senderId, status: FriendRequestStatus.PENDING },
      ],
    });
    if (existingRequest) {
      throw new BadRequestException('Friend request already exists');
    }

    const friendRequest = new FriendRequest();
    friendRequest.senderId = senderId;
    friendRequest.receiverId = receiverId;
    friendRequest.status = FriendRequestStatus.PENDING;

    const saved = await this.friendRequestRepo.save(friendRequest);
    const sender = await this.userRepo.findOneBy({ id: senderId });

    const result = {
      id: saved.id,
      senderId: saved.senderId,
      receiverId: saved.receiverId,
      sender: {
        id: sender?.id,
        username: sender?.username,
        email: sender?.email,
        first_name: sender?.first_name,
        last_name: sender?.last_name,
      },
      receiver: {
        id: receiver.id,
        username: receiver.username,
        email: receiver.email,
        first_name: receiver.first_name,
        last_name: receiver.last_name,
      },
      status: saved.status,
      created_at: saved.created_at,
      updated_at: saved.updated_at,
    };

    // Send WebSocket notification to receiver
    try {
      this.notificationGateway.sendFriendRequestReceived(receiverId, result);
    } catch (error) {
      this.logger.warn('Failed to send friend request notification', error);
    }

    return result;
  }

  async getFriendRequests(userId: string) {
    const sentRequests = await this.friendRequestRepo.find({
      where: { senderId: userId, status: FriendRequestStatus.PENDING },
      order: { created_at: 'DESC' },
    });

    const receivedRequests = await this.friendRequestRepo.find({
      where: { receiverId: userId, status: FriendRequestStatus.PENDING },
      order: { created_at: 'DESC' },
    });

    // Get user details for sent requests
    const sentWithDetails = await Promise.all(
      sentRequests.map(async (req) => {
        const receiver = await this.userRepo.findOneBy({ id: req.receiverId });
        return {
          id: req.id,
          receiverId: req.receiverId,
          receiver: {
            id: receiver?.id,
            username: receiver?.username,
            email: receiver?.email,
            first_name: receiver?.first_name,
            last_name: receiver?.last_name,
          },
          status: req.status,
          created_at: req.created_at,
        };
      }),
    );

    // Get user details for received requests
    const receivedWithDetails = await Promise.all(
      receivedRequests.map(async (req) => {
        const sender = await this.userRepo.findOneBy({ id: req.senderId });
        return {
          id: req.id,
          senderId: req.senderId,
          sender: {
            id: sender?.id,
            username: sender?.username,
            email: sender?.email,
            first_name: sender?.first_name,
            last_name: sender?.last_name,
          },
          status: req.status,
          created_at: req.created_at,
        };
      }),
    );

    return {
      sent: sentWithDetails,
      received: receivedWithDetails,
    };
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRequestRepo.findOne({
      where: { id: requestId, receiverId: userId, status: FriendRequestStatus.PENDING },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    // Create friend relationship
    const newFriend = new FriendEntity();
    newFriend.user1 = request.senderId;
    newFriend.user2 = request.receiverId;
    await this.friendRepo.save(newFriend);

    // Update request status
    request.status = FriendRequestStatus.ACCEPTED;
    await this.friendRequestRepo.save(request);

    const sender = await this.userRepo.findOneBy({ id: request.senderId });
    const receiver = await this.userRepo.findOneBy({ id: request.receiverId });

    const statusChangeData = {
      id: request.id,
      sender: {
        id: sender?.id || '',
        username: sender?.username || '',
      },
      receiver: {
        id: receiver?.id || '',
        username: receiver?.username || '',
      },
      status: 'accepted',
      created_at: request.created_at,
      updated_at: request.updated_at,
    };

    // Send WebSocket notification to both users
    try {
      this.notificationGateway.sendFriendRequestStatusChanged(request.senderId, statusChangeData);
      this.notificationGateway.sendFriendRequestStatusChanged(request.receiverId, statusChangeData);
    } catch (error) {
      this.logger.warn('Failed to send friend request status change notification', error);
    }

    return {
      id: newFriend.id,
      user_id: request.senderId,
      username: sender?.username,
      email: sender?.email,
      first_name: sender?.first_name,
      last_name: sender?.last_name,
      created_at: newFriend.created_at,
    };
  }

  async rejectFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRequestRepo.findOne({
      where: { id: requestId, receiverId: userId, status: FriendRequestStatus.PENDING },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    request.status = FriendRequestStatus.REJECTED;
    await this.friendRequestRepo.save(request);

    const sender = await this.userRepo.findOneBy({ id: request.senderId });
    const receiver = await this.userRepo.findOneBy({ id: request.receiverId });

    const statusChangeData = {
      id: request.id,
      sender: {
        id: sender?.id || '',
        username: sender?.username || '',
      },
      receiver: {
        id: receiver?.id || '',
        username: receiver?.username || '',
      },
      status: 'rejected',
      created_at: request.created_at,
      updated_at: request.updated_at,
    };

    // Send WebSocket notification to both users
    try {
      this.notificationGateway.sendFriendRequestStatusChanged(request.senderId, statusChangeData);
      this.notificationGateway.sendFriendRequestStatusChanged(request.receiverId, statusChangeData);
    } catch (error) {
      this.logger.warn('Failed to send friend request status change notification', error);
    }

    return { msg: 'Friend request rejected' };
  }

  async cancelFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRequestRepo.findOne({
      where: { id: requestId, senderId: userId, status: FriendRequestStatus.PENDING },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    const sender = await this.userRepo.findOneBy({ id: request.senderId });
    const receiver = await this.userRepo.findOneBy({ id: request.receiverId });

    await this.friendRequestRepo.delete(requestId);

    const statusChangeData = {
      id: request.id,
      sender: {
        id: sender?.id || '',
        username: sender?.username || '',
      },
      receiver: {
        id: receiver?.id || '',
        username: receiver?.username || '',
      },
      status: 'cancelled',
      created_at: request.created_at,
      updated_at: new Date(),
    };

    // Send WebSocket notification to both users
    try {
      this.notificationGateway.sendFriendRequestStatusChanged(request.senderId, statusChangeData);
      this.notificationGateway.sendFriendRequestStatusChanged(request.receiverId, statusChangeData);
    } catch (error) {
      this.logger.warn('Failed to send friend request status change notification', error);
    }

    return { msg: 'Friend request cancelled' };
  }
}
