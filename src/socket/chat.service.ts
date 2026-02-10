import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '@app/entities/chat-message.entity';
import { ChatReadReceipt } from '@app/entities/chat-read-receipt.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatReadReceipt)
    private readReceiptRepository: Repository<ChatReadReceipt>,
  ) {}

  /**
   * Normalize room name so users always use the same room regardless of order
   * Example: normalizeRoom('user2', 'user1') === normalizeRoom('user1', 'user2')
   * Both return: 'user1_user2'
   */
  normalizeRoom(userId1: string, userId2: string): string {
    const sorted = [userId1, userId2].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  /**
   * Save a chat message to the database
   */
  async saveMessage(
    room: string,
    senderId: string,
    message: string,
  ): Promise<ChatMessage> {
    const chatMessage = this.chatMessageRepository.create({
      room,
      sender_id: senderId,
      message,
    });
    return await this.chatMessageRepository.save(chatMessage);
  }

  /**
   * Get a message with sender information for real-time broadcasting
   */
  async getMessageWithSender(messageId: string): Promise<ChatMessage | null> {
    return await this.chatMessageRepository.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });
  }

  /**
   * Get chat history for a room with pagination
   * Returns messages in DESC order (newest first)
   * Page 1 = most recent messages, Page 2 = older messages, etc.
   */
  async getChatHistory(
    room: string,
    page: number = 1,
    limit: number = 100,
  ): Promise<{
    messages: ChatMessage[];
    total: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const skip = (page - 1) * limit;

    const [messages, total] = await this.chatMessageRepository.findAndCount({
      where: { room },
      relations: ['sender'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      messages, // Keep in DESC order (newest first)
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + messages.length < total,
    };
  }

  /**
   * Get chat history between two users with pagination
   */
  async getChatHistoryBetweenUsers(
    userId1: string,
    userId2: string,
    page: number = 1,
    limit: number = 100,
  ): Promise<{
    messages: ChatMessage[];
    total: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const room = this.normalizeRoom(userId1, userId2);
    return this.getChatHistory(room, page, limit);
  }

  /**
   * Mark a message as read by a user
   */
  async markMessageAsRead(messageId: string, userId: string): Promise<ChatReadReceipt> {
    // Check if read receipt already exists
    const existingReceipt = await this.readReceiptRepository.findOne({
      where: { message_id: messageId, user_id: userId },
    });

    if (existingReceipt) {
      return existingReceipt; // Already marked as read
    }

    // Create new read receipt
    const readReceipt = this.readReceiptRepository.create({
      message_id: messageId,
      user_id: userId,
    });

    return await this.readReceiptRepository.save(readReceipt);
  }

  /**
   * Mark multiple messages as read by a user
   */
  async markMessagesAsRead(messageIds: string[], userId: string): Promise<number> {
    if (!messageIds || messageIds.length === 0) {
      return 0;
    }

    let markedCount = 0;
    for (const messageId of messageIds) {
      // Check if already read
      const existing = await this.readReceiptRepository.findOne({
        where: { message_id: messageId, user_id: userId },
      });

      if (!existing) {
        const readReceipt = this.readReceiptRepository.create({
          message_id: messageId,
          user_id: userId,
        });
        await this.readReceiptRepository.save(readReceipt);
        markedCount++;
      }
    }

    return markedCount;
  }

  /**
   * Mark all messages in a room as read by a user
   */
  async markRoomAsRead(room: string, userId: string): Promise<number> {
    // Get all unread messages in the room that were not sent by the user
    const unreadMessages = await this.chatMessageRepository
      .createQueryBuilder('message')
      .leftJoin(
        'chat_read_receipts',
        'receipt',
        'receipt.message_id = message.id AND receipt.user_id = :userId',
        { userId },
      )
      .where('message.room = :room', { room })
      .andWhere('message.sender_id != :userId', { userId })
      .andWhere('receipt.id IS NULL') // Not yet read
      .getMany();

    if (unreadMessages.length === 0) {
      return 0;
    }

    // Create read receipts for all unread messages
    const readReceipts = unreadMessages.map((message) =>
      this.readReceiptRepository.create({
        message_id: message.id,
        user_id: userId,
      }),
    );

    await this.readReceiptRepository.save(readReceipts);
    return readReceipts.length;
  }

  /**
   * Get read status for messages (which messages a user has read)
   */
  async getReadStatus(messageIds: string[], userId: string): Promise<Set<string>> {
    if (!messageIds || messageIds.length === 0) {
      return new Set();
    }

    const readReceipts = await this.readReceiptRepository
      .createQueryBuilder('receipt')
      .where('receipt.message_id IN (:...messageIds)', { messageIds })
      .andWhere('receipt.user_id = :userId', { userId })
      .getMany();

    return new Set(readReceipts.map((receipt) => receipt.message_id));
  }
}

