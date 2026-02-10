import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatternComment } from '@app/entities/pattern-comment.entity';
import { Project } from '@app/entities/project.entity';
import { Collaborator } from '@app/entities/collaborator.entity';
import { PermissionService } from '@app/services/permission.service';
import { User } from '@app/entities/user.entity';
import { NotificationGateway } from '@app/socket/notification.gateway';

@Injectable()
export class PatternCommentService {
  private readonly logger = new Logger(PatternCommentService.name);

  constructor(
    @InjectRepository(PatternComment)
    private commentRepo: Repository<PatternComment>,
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Collaborator)
    private collaboratorRepo: Repository<Collaborator>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private permissionService: PermissionService,
    @Inject(forwardRef(() => NotificationGateway))
    private notificationGateway: NotificationGateway,
  ) {}

  async createComment(
    userId: string,
    projectId: string,
    patternName: string,
    commentText: string,
    track?: number,
    startBar?: number,
  ) {
    // Check if user has permission to comment (Viewer, Commenter, Editor, Owner)
    const canComment = await this.permissionService.canComment(
      userId,
      projectId,
    );
    if (!canComment) {
      throw new ForbiddenException(
        'You do not have permission to comment on this project',
      );
    }

    // Verify project exists
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const comment = new PatternComment();
    comment.projectId = projectId;
    comment.patternName = patternName;
    comment.userId = userId;
    comment.commentText = commentText;
    // Save position information if provided
    comment.track = track !== undefined && track >= 0 ? track : null;
    comment.startBar = startBar !== undefined && startBar >= 0 ? startBar : null;

    const savedComment = await this.commentRepo.save(comment);

    // Load user relation for response
    const commentWithUser = await this.commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.id = :id', { id: savedComment.id })
      .getOne();

    // Emit WebSocket event for real-time sync
    const user = commentWithUser?.user;
    const username =
      user?.username ||
      `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
      'Unknown';

    const commentData = {
      id: savedComment.id,
      projectId: savedComment.projectId,
      patternName: savedComment.patternName,
      userId: savedComment.userId,
      username: username,
      commentText: savedComment.commentText,
      track: savedComment.track,
      startBar: savedComment.startBar,
      createdAt: savedComment.created_at,
    };

    // Get all collaborators for this project to notify them
    const collaborators = await this.collaboratorRepo.find({
      where: { projectId: projectId },
    });

    // Also include project owner
    const ownerId = project.ownerId;
    const allUserIds = [
      ownerId,
      ...collaborators.map((c) => c.userId),
    ].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

    // Emit to all project members
    allUserIds.forEach((uid) => {
      this.notificationGateway.emitPatternCommentCreated(projectId, commentData);
    });

    return commentWithUser || savedComment;
  }

  async getComments(projectId: string, patternName?: string) {
    const query = this.commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.projectId = :projectId', { projectId });

    if (patternName) {
      query.andWhere('comment.patternName = :patternName', { patternName });
    }

    query.orderBy('comment.created_at', 'DESC');

    return await query.getMany();
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user', 'project'],
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Only comment owner or project owner can delete
    const isOwner = comment.userId === userId;
    const isProjectOwner = comment.project.ownerId === userId;

    if (!isOwner && !isProjectOwner) {
      throw new ForbiddenException(
        'You do not have permission to delete this comment',
      );
    }

    const projectId = comment.projectId;
    await this.commentRepo.remove(comment);

    // Emit WebSocket event
    this.notificationGateway.emitPatternCommentDeleted(projectId, commentId);

    return { success: true };
  }

  async updateCommentPosition(
    userId: string,
    projectId: string,
    commentId: string,
    track?: number,
    startBar?: number,
  ) {
    // Check if user has permission to comment (Viewer, Commenter, Editor, Owner)
    const canComment = await this.permissionService.canComment(
      userId,
      projectId,
    );
    if (!canComment) {
      throw new ForbiddenException(
        'You do not have permission to update comments on this project',
      );
    }

    // Find the comment
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user', 'project'],
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Verify comment belongs to the project
    if (comment.projectId !== projectId) {
      throw new ForbiddenException(
        'Comment does not belong to this project',
      );
    }

    // Update position if provided
    if (track !== undefined) {
      comment.track = track >= 0 ? track : null;
    }
    if (startBar !== undefined) {
      comment.startBar = startBar >= 0 ? startBar : null;
    }

    const savedComment = await this.commentRepo.save(comment);

    // Load user relation for response
    const commentWithUser = await this.commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.id = :id', { id: savedComment.id })
      .getOne();

    // Emit WebSocket event for real-time sync
    const user = commentWithUser?.user;
    const username =
      user?.username ||
      `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
      'Unknown';

    const commentData = {
      id: savedComment.id,
      projectId: savedComment.projectId,
      patternName: savedComment.patternName,
      userId: savedComment.userId,
      username: username,
      commentText: savedComment.commentText,
      track: savedComment.track,
      startBar: savedComment.startBar,
      createdAt: savedComment.created_at,
    };

    // Get all collaborators for this project to notify them
    const collaborators = await this.collaboratorRepo.find({
      where: { projectId: projectId },
    });

    // Also include project owner
    const project = await this.projectRepo.findOneBy({ id: projectId });
    const ownerId = project?.ownerId;
    const allUserIds = [
      ownerId,
      ...collaborators.map((c) => c.userId),
    ].filter((id, index, self) => id && self.indexOf(id) === index); // Remove duplicates and nulls

    // Emit to all project members
    allUserIds.forEach((uid) => {
      this.notificationGateway.emitPatternCommentUpdated(projectId, commentData);
    });

    return commentWithUser || savedComment;
  }
}

