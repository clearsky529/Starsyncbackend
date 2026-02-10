import { Injectable, Logger } from '@nestjs/common';
import { Repository, Like } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User as UserEntity } from '@app/entities/user.entity';
import { Friend as FriendEntity } from '@app/entities/friend.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(FriendEntity)
    private friendRepo: Repository<FriendEntity>,
  ) {}

  async searchUsers(
    currentUserId: string,
    query: string,
    page: number = 1,
    limit: number = 20,
    excludeFriends: boolean = false,
  ) {
    if (!query || query.trim().length === 0) {
      return {
        users: [],
        total: 0,
        page,
        totalPages: 0,
        hasMore: false,
      };
    }

    const searchTerm = `%${query.trim()}%`;
    const skip = (page - 1) * limit;

    // Build query to search by username, email, first_name, or last_name
    const queryBuilder = this.userRepo
      .createQueryBuilder('user')
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere(
        '(user.username LIKE :searchTerm OR user.email LIKE :searchTerm OR user.first_name LIKE :searchTerm OR user.last_name LIKE :searchTerm)',
        { searchTerm },
      )
      .orderBy('user.username', 'ASC')
      .skip(skip)
      .take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    // Get friend IDs if we need to exclude them
    let friendIds: Set<string> = new Set();
    if (excludeFriends) {
      const friends1 = await this.friendRepo.findBy({ user1: currentUserId });
      const friends2 = await this.friendRepo.findBy({ user2: currentUserId });
      friends1.forEach((f) => friendIds.add(f.user2));
      friends2.forEach((f) => friendIds.add(f.user1));
    }

    // Filter out friends if needed and format response
    const filteredUsers = users
      .filter((user) => !excludeFriends || !friendIds.has(user.id))
      .map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        created_at: user.created_at,
      }));

    return {
      users: filteredUsers,
      total: excludeFriends ? filteredUsers.length : total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + filteredUsers.length < total,
    };
  }
}

