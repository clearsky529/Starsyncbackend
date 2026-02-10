import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PatternCommentService } from './pattern-comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentPositionDto } from './dto/update-comment-position.dto';

@Controller('project/:projectId/pattern-comments')
export class PatternCommentController {
  constructor(private commentService: PatternCommentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() dto: CreateCommentDto,
  ) {
    const userId = req.user.user_id;
    const comment = await this.commentService.createComment(
      userId,
      projectId,
      dto.patternName,
      dto.commentText,
      dto.track,
      dto.startBar,
    );

    // Load user for response
    const user = (comment as any).user;
    const username =
      user?.username ||
      `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
      'Unknown';

    return {
      id: comment.id,
      projectId: comment.projectId,
      patternName: comment.patternName,
      userId: comment.userId,
      username: username,
      commentText: comment.commentText,
      track: comment.track,
      startBar: comment.startBar,
      createdAt: comment.created_at,
    };
  }

  @Get()
  async getComments(@Param('projectId') projectId: string) {
    const comments = await this.commentService.getComments(projectId);
    return comments.map((c) => {
      const user = c.user;
      const username =
        user?.username ||
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
        'Unknown';
      return {
        id: c.id,
        projectId: c.projectId,
        patternName: c.patternName,
        userId: c.userId,
        username: username,
        commentText: c.commentText,
        track: c.track,
        startBar: c.startBar,
        createdAt: c.created_at,
      };
    });
  }

  @Get(':patternName')
  async getPatternComments(
    @Param('projectId') projectId: string,
    @Param('patternName') patternName: string,
  ) {
    const comments = await this.commentService.getComments(
      projectId,
      patternName,
    );
    return comments.map((c) => {
      const user = c.user;
      const username =
        user?.username ||
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
        'Unknown';
      return {
        id: c.id,
        projectId: c.projectId,
        patternName: c.patternName,
        userId: c.userId,
        username: username,
        commentText: c.commentText,
        track: c.track,
        startBar: c.startBar,
        createdAt: c.created_at,
      };
    });
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.OK)
  async deleteComment(@Req() req: any, @Param('commentId') commentId: string) {
    const userId = req.user.user_id;
    return await this.commentService.deleteComment(userId, commentId);
  }

  @Patch(':commentId/position')
  @HttpCode(HttpStatus.OK)
  async updateCommentPosition(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentPositionDto,
  ) {
    const userId = req.user.user_id;
    const comment = await this.commentService.updateCommentPosition(
      userId,
      projectId,
      commentId,
      dto.track,
      dto.startBar,
    );

    // Load user for response
    const user = (comment as any).user;
    const username =
      user?.username ||
      `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
      'Unknown';

    return {
      id: comment.id,
      projectId: comment.projectId,
      patternName: comment.patternName,
      userId: comment.userId,
      username: username,
      commentText: comment.commentText,
      track: comment.track,
      startBar: comment.startBar,
      createdAt: comment.created_at,
    };
  }

  // POST alternative for clients that don't support PATCH (e.g., JUCE)
  @Post(':commentId/position')
  @HttpCode(HttpStatus.OK)
  async updateCommentPositionPost(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentPositionDto,
  ) {
    // Reuse the same logic as PATCH
    return this.updateCommentPosition(req, projectId, commentId, dto);
  }
}

