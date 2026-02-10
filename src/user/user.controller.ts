import { Controller, Get, Query, Req } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('search')
  async search(
    @Req() request: any,
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('excludeFriends') excludeFriends: string = 'false',
  ) {
    return await this.userService.searchUsers(
      request.user.user_id,
      query,
      parseInt(page, 10),
      parseInt(limit, 10),
      excludeFriends === 'true',
    );
  }
}

