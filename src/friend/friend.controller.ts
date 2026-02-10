import { Controller, Get, Post, Delete, Req, Body, Param } from '@nestjs/common';
import { FriendService } from './friend.service';

@Controller('friend')
export class FriendController {
  constructor(private friendService: FriendService) {}

  @Get('list')
  async list(@Req() request: any) {
    return await this.friendService.getFriends(request.user.user_id);
  }

  @Post('add')
  async add(@Req() request: any, @Body() { friend }: { friend: string }) {
    return await this.friendService.addFriend(request.user.user_id, friend);
  }

  @Post('remove')
  async remove(
    @Req() request: any,
    @Body() { friendId }: { friendId: string },
  ) {
    return await this.friendService.removeFriend(
      request.user.user_id,
      friendId,
    );
  }

  // Friend Request Endpoints
  @Post('request')
  async sendRequest(
    @Req() request: any,
    @Body() { receiverId }: { receiverId: string },
  ) {
    return await this.friendService.sendFriendRequest(
      request.user.user_id,
      receiverId,
    );
  }

  @Get('requests')
  async getRequests(@Req() request: any) {
    return await this.friendService.getFriendRequests(request.user.user_id);
  }

  @Post('request/:id/accept')
  async acceptRequest(@Req() request: any, @Param('id') id: string) {
    return await this.friendService.acceptFriendRequest(
      request.user.user_id,
      id,
    );
  }

  @Post('request/:id/reject')
  async rejectRequest(@Req() request: any, @Param('id') id: string) {
    return await this.friendService.rejectFriendRequest(
      request.user.user_id,
      id,
    );
  }

  @Delete('request/:id')
  async cancelRequest(@Req() request: any, @Param('id') id: string) {
    return await this.friendService.cancelFriendRequest(
      request.user.user_id,
      id,
    );
  }
}
