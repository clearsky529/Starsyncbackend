import { Controller, Get, Post, Query, Param, Req, Body, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * GET /chat/history/between/:userId1/:userId2?page=1&limit=100
   * Get chat history between two users with pagination
   * Room name is automatically normalized
   * NOTE: This must come BEFORE the /history/:room route
   * Security: Validates that authenticated user is one of the two participants
   */
  @Get('history/between/:userId1/:userId2')
  async getChatHistoryBetweenUsers(
    @Req() req: any,
    @Param('userId1') userId1: string,
    @Param('userId2') userId2: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '100',
  ) {
    // Get authenticated user from JWT (set by AuthMiddleware)
    const authenticatedUserId = req.user?.user_id;
    
    if (!authenticatedUserId) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Security check: User must be one of the two participants
    if (authenticatedUserId !== userId1 && authenticatedUserId !== userId2) {
      throw new ForbiddenException('You can only access your own chat history');
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return {
        error: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100',
      };
    }

    return await this.chatService.getChatHistoryBetweenUsers(
      userId1,
      userId2,
      pageNum,
      limitNum,
    );
  }

  /**
   * GET /chat/history/:room?page=1&limit=100
   * Get chat history for a specific room with pagination
   * Security: Validates that authenticated user is in the room
   */
  @Get('history/:room')
  async getChatHistory(
    @Req() req: any,
    @Param('room') room: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '100',
  ) {
    // Get authenticated user from JWT
    const authenticatedUserId = req.user?.user_id;
    
    if (!authenticatedUserId) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Security check: User must be part of the room
    // Room format is: userId1_userId2 (normalized/sorted)
    const roomParts = room.split('_');
    if (roomParts.length !== 2) {
      return { error: 'Invalid room format' };
    }

    if (!roomParts.includes(authenticatedUserId)) {
      throw new ForbiddenException('You can only access rooms you are part of');
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return {
        error: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100',
      };
    }

    return await this.chatService.getChatHistory(room, pageNum, limitNum);
  }

  /**
   * POST /chat/markAsRead
   * Mark a message or multiple messages as read
   * Body: { messageId?: string, messageIds?: string[], room?: string }
   * - If messageId is provided, mark that single message as read
   * - If messageIds is provided, mark all those messages as read
   * - If room is provided, mark all unread messages in that room as read
   */
  @Post('markAsRead')
  async markAsRead(@Req() req: any, @Body() body: { messageId?: string; messageIds?: string[]; room?: string }) {
    const authenticatedUserId = req.user?.user_id;

    if (!authenticatedUserId) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (body.room) {
      // Mark all messages in room as read
      const markedCount = await this.chatService.markRoomAsRead(body.room, authenticatedUserId);
      return {
        success: true,
        markedCount,
        message: `Marked ${markedCount} messages as read in room ${body.room}`,
      };
    } else if (body.messageIds && body.messageIds.length > 0) {
      // Mark multiple messages as read
      const markedCount = await this.chatService.markMessagesAsRead(body.messageIds, authenticatedUserId);
      return {
        success: true,
        markedCount,
        message: `Marked ${markedCount} messages as read`,
      };
    } else if (body.messageId) {
      // Mark single message as read
      await this.chatService.markMessageAsRead(body.messageId, authenticatedUserId);
      return {
        success: true,
        message: 'Message marked as read',
      };
    } else {
      return {
        success: false,
        error: 'Please provide either messageId, messageIds, or room',
      };
    }
  }
}

