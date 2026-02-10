import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ProjectInvitation, InvitationStatus } from '@app/entities/project-invitation.entity';
import { Project as ProjectEntity } from '@app/entities/project.entity';
import { Collaborator, CollaboratorRole } from '@app/entities/collaborator.entity';
import { User as UserEntity } from '@app/entities/user.entity';
import { PermissionService } from '@app/services/permission.service';
import { NotificationGateway } from '@app/socket/notification.gateway';

@Injectable()
export class ProjectInvitationService {
  private readonly logger = new Logger(ProjectInvitationService.name);

  constructor(
    @InjectRepository(ProjectInvitation)
    private invitationRepo: Repository<ProjectInvitation>,
    @InjectRepository(ProjectEntity)
    private projectRepo: Repository<ProjectEntity>,
    @InjectRepository(Collaborator)
    private collaboratorRepo: Repository<Collaborator>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    private permissionService: PermissionService,
    @Inject(forwardRef(() => NotificationGateway))
    private notificationGateway: NotificationGateway,
  ) {}

  async sendInvitation(
    inviterId: string,
    projectId: string,
    inviteeId: string,
    role: CollaboratorRole = CollaboratorRole.EDITOR,
  ) {
    try {
      this.logger.log(
        `Attempting to send invitation: inviterId=${inviterId}, projectId=${projectId}, inviteeId=${inviteeId}, role=${role}`,
      );

      // Check if inviter has permission to invite
      let canInvite: boolean;
      try {
        canInvite = await this.permissionService.canInvite(inviterId, projectId);
      } catch (error) {
        this.logger.error(
          `Error checking permission: inviterId=${inviterId}, projectId=${projectId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new ForbiddenException('You do not have permission to invite users to this project');
      }

      if (!canInvite) {
        this.logger.warn(
          `Permission denied: inviterId=${inviterId}, projectId=${projectId}`,
        );
        throw new ForbiddenException('You do not have permission to invite users to this project');
      }

      // Check if project exists
      let project: ProjectEntity | null;
      try {
        project = await this.projectRepo.findOneBy({ id: projectId });
      } catch (error) {
        this.logger.error(
          `Database error while finding project: projectId=${projectId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (!project) {
        this.logger.warn(`Project not found: projectId=${projectId}`);
        throw new NotFoundException('Project not found');
      }

      // Check if invitee exists
      let invitee: UserEntity | null;
      try {
        invitee = await this.userRepo.findOneBy({ id: inviteeId });
      } catch (error) {
        this.logger.error(
          `Database error while finding invitee: inviteeId=${inviteeId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (!invitee) {
        this.logger.warn(`User not found: inviteeId=${inviteeId}`);
        throw new NotFoundException('User not found');
      }

      if (inviterId === inviteeId) {
        this.logger.warn(
          `Self-invitation attempt: inviterId=${inviterId}, inviteeId=${inviteeId}`,
        );
        throw new BadRequestException('You cannot invite yourself');
      }

      // Check if already a collaborator
      let existingCollaborator: Collaborator | null;
      try {
        existingCollaborator = await this.collaboratorRepo.findOneBy({
          projectId,
          userId: inviteeId,
        });
      } catch (error) {
        this.logger.error(
          `Database error while checking collaborator: projectId=${projectId}, userId=${inviteeId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (existingCollaborator) {
        this.logger.warn(
          `User already collaborator: projectId=${projectId}, userId=${inviteeId}`,
        );
        throw new BadRequestException('User is already a collaborator');
      }

      // Check if invitation already exists
      let existingInvitation: ProjectInvitation | null;
      try {
        existingInvitation = await this.invitationRepo.findOne({
          where: {
            projectId,
            inviteeId,
            status: InvitationStatus.PENDING,
          },
        });
      } catch (error) {
        this.logger.error(
          `Database error while checking existing invitation: projectId=${projectId}, inviteeId=${inviteeId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (existingInvitation) {
        this.logger.warn(
          `Invitation already exists: projectId=${projectId}, inviteeId=${inviteeId}`,
        );
        throw new BadRequestException('Invitation already sent');
      }

      // Create invitation
      const invitation = new ProjectInvitation();
      invitation.projectId = projectId;
      invitation.inviterId = inviterId;
      invitation.inviteeId = inviteeId;
      invitation.role = role;
      invitation.status = InvitationStatus.PENDING;

      let saved: ProjectInvitation;
      try {
        saved = await this.invitationRepo.save(invitation);
        this.logger.log(
          `Invitation saved successfully: invitationId=${saved.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Database error while saving invitation: projectId=${projectId}, inviterId=${inviterId}, inviteeId=${inviteeId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      // Get inviter details
      let inviter: UserEntity | null = null;
      try {
        inviter = await this.userRepo.findOneBy({ id: inviterId });
      } catch (error) {
        this.logger.error(
          `Database error while finding inviter: inviterId=${inviterId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Don't throw here, we can still return response without inviter details
      }

      this.logger.log(
        `Invitation sent successfully: invitationId=${saved.id}, projectId=${projectId}, inviteeId=${inviteeId}`,
      );

      const result = {
        id: saved.id,
        projectId: saved.projectId,
        projectName: project.name,
        inviterId: saved.inviterId,
        inviter: {
          id: inviter?.id || null,
          username: inviter?.username || null,
          email: inviter?.email || null,
          first_name: inviter?.first_name || null,
          last_name: inviter?.last_name || null,
        },
        inviteeId: saved.inviteeId,
        invitee: {
          id: invitee.id,
          username: invitee.username,
          email: invitee.email,
          first_name: invitee.first_name,
          last_name: invitee.last_name,
        },
        role: saved.role,
        status: saved.status,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
      };

      // Send WebSocket notification to invitee
      try {
        this.notificationGateway.sendProjectInvitationReceived(inviteeId, result);
      } catch (error) {
        this.logger.warn('Failed to send project invitation notification', error);
      }

      return result;
    } catch (error) {
      // If it's already an HTTP exception, re-throw it
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Log unexpected errors with full details
      this.logger.error(
        `Unexpected error in sendInvitation: inviterId=${inviterId}, projectId=${projectId}, inviteeId=${inviteeId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : typeof error,
          inviterId,
          projectId,
          inviteeId,
          role,
        },
      );

      // Re-throw the error so NestJS can handle it
      throw error;
    }
  }

  async getInvitations(userId: string) {
    try {
      this.logger.log(`Getting invitations for user: userId=${userId}`);

      let sentInvitations: ProjectInvitation[];
      let receivedInvitations: ProjectInvitation[];

      try {
        sentInvitations = await this.invitationRepo.find({
          where: { inviterId: userId },
          order: { created_at: 'DESC' },
        });
      } catch (error) {
        this.logger.error(
          `Database error while fetching sent invitations: userId=${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      try {
        // Return ALL received invitations (pending, accepted, rejected) to show full history
        // This matches the behavior of sent invitations and friend requests
        receivedInvitations = await this.invitationRepo.find({
          where: { inviteeId: userId },
          order: { created_at: 'DESC' },
        });
      } catch (error) {
        this.logger.error(
          `Database error while fetching received invitations: userId=${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

    // Get details for sent invitations
    const sentWithDetails = await Promise.all(
      sentInvitations.map(async (inv) => {
        const project = await this.projectRepo.findOneBy({ id: inv.projectId });
        const invitee = await this.userRepo.findOneBy({ id: inv.inviteeId });
        return {
          id: inv.id,
          projectId: inv.projectId,
          projectName: project?.name,
          inviteeId: inv.inviteeId,
          invitee: {
            id: invitee?.id,
            username: invitee?.username,
            email: invitee?.email,
            first_name: invitee?.first_name,
            last_name: invitee?.last_name,
          },
          role: inv.role,
          status: inv.status,
          created_at: inv.created_at,
        };
      }),
    );

    // Get details for received invitations
    const receivedWithDetails = await Promise.all(
      receivedInvitations.map(async (inv) => {
        const project = await this.projectRepo.findOneBy({ id: inv.projectId });
        const inviter = await this.userRepo.findOneBy({ id: inv.inviterId });
        return {
          id: inv.id,
          projectId: inv.projectId,
          projectName: project?.name,
          inviterId: inv.inviterId,
          inviter: {
            id: inviter?.id,
            username: inviter?.username,
            email: inviter?.email,
            first_name: inviter?.first_name,
            last_name: inviter?.last_name,
          },
          role: inv.role,
          status: inv.status,
          created_at: inv.created_at,
        };
      }),
    );

      this.logger.log(
        `Invitations retrieved: userId=${userId}, sent=${sentWithDetails.length}, received=${receivedWithDetails.length}`,
      );

      return {
        sent: sentWithDetails,
        received: receivedWithDetails,
      };
    } catch (error) {
      this.logger.error(
        `Unexpected error in getInvitations: userId=${userId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : typeof error,
          userId,
        },
      );
      throw error;
    }
  }

  async acceptInvitation(userId: string, invitationId: string) {
    try {
      this.logger.log(
        `Accepting invitation: userId=${userId}, invitationId=${invitationId}`,
      );

      let invitation: ProjectInvitation | null;
      try {
        invitation = await this.invitationRepo.findOne({
          where: {
            id: invitationId,
            inviteeId: userId,
            status: InvitationStatus.PENDING,
          },
        });
      } catch (error) {
        this.logger.error(
          `Database error while finding invitation: invitationId=${invitationId}, userId=${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (!invitation) {
        this.logger.warn(
          `Invitation not found: invitationId=${invitationId}, userId=${userId}`,
        );
        throw new NotFoundException('Invitation not found');
      }

      // Check if already a collaborator (race condition check)
      let existingCollaborator: Collaborator | null;
      try {
        existingCollaborator = await this.collaboratorRepo.findOneBy({
          projectId: invitation.projectId,
          userId: invitation.inviteeId,
        });
      } catch (error) {
        this.logger.error(
          `Database error while checking collaborator: projectId=${invitation.projectId}, userId=${invitation.inviteeId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (existingCollaborator) {
        this.logger.warn(
          `Already a collaborator: projectId=${invitation.projectId}, userId=${invitation.inviteeId}`,
        );
        throw new BadRequestException('Already a collaborator');
      }

      // CRITICAL: Create collaborator record in database
      // This is required for the user to have permission to comment on the project
      const collaborator = new Collaborator();
      collaborator.projectId = invitation.projectId;
      collaborator.userId = invitation.inviteeId;
      collaborator.role = invitation.role;

      this.logger.log(
        `Creating Collaborator record: projectId=${invitation.projectId}, userId=${invitation.inviteeId}, role=${invitation.role}`,
      );

      try {
        await this.collaboratorRepo.save(collaborator);
        this.logger.log(
          `✅ Collaborator created successfully: collaboratorId=${collaborator.id}, projectId=${invitation.projectId}, userId=${invitation.inviteeId}, role=${invitation.role}`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Database error while saving collaborator: projectId=${invitation.projectId}, userId=${invitation.inviteeId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      // CRITICAL: Update invitation status to ACCEPTED in database
      // This marks the invitation as accepted in the project_invitation table
      invitation.status = InvitationStatus.ACCEPTED;
      this.logger.log(
        `Updating invitation status to ACCEPTED: invitationId=${invitationId}`,
      );

      try {
        await this.invitationRepo.save(invitation);
        this.logger.log(
          `✅ Invitation status updated successfully: invitationId=${invitationId}, status=ACCEPTED`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Database error while updating invitation status: invitationId=${invitationId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      let project: ProjectEntity | null = null;
      try {
        project = await this.projectRepo.findOneBy({ id: invitation.projectId });
      } catch (error) {
        this.logger.error(
          `Database error while finding project: projectId=${invitation.projectId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Don't throw, we can return without project name
      }

      this.logger.log(
        `Invitation accepted successfully: invitationId=${invitationId}, collaboratorId=${collaborator.id}`,
      );

      const inviter = await this.userRepo.findOneBy({ id: invitation.inviterId });
      const invitee = await this.userRepo.findOneBy({ id: invitation.inviteeId });

      const statusChangeData = {
        id: invitation.id,
        projectId: invitation.projectId,
        projectName: project?.name || '',
        inviter: {
          id: inviter?.id || '',
          username: inviter?.username || '',
        },
        invitee: {
          id: invitee?.id || '',
          username: invitee?.username || '',
        },
        role: invitation.role,
        status: 'accepted',
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      };

      // Send WebSocket notification to both users
      try {
        this.notificationGateway.sendProjectInvitationStatusChanged(
          invitation.inviterId,
          statusChangeData,
        );
        this.notificationGateway.sendProjectInvitationStatusChanged(
          invitation.inviteeId,
          statusChangeData,
        );
      } catch (error) {
        this.logger.warn('Failed to send project invitation status change notification', error);
      }

      return {
        id: collaborator.id,
        projectId: collaborator.projectId,
        projectName: project?.name || null,
        userId: collaborator.userId,
        role: collaborator.role,
        created_at: collaborator.created_at,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `Unexpected error in acceptInvitation: userId=${userId}, invitationId=${invitationId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : typeof error,
          userId,
          invitationId,
        },
      );
      throw error;
    }
  }

  async rejectInvitation(userId: string, invitationId: string) {
    try {
      this.logger.log(
        `Rejecting invitation: userId=${userId}, invitationId=${invitationId}`,
      );

      let invitation: ProjectInvitation | null;
      try {
        invitation = await this.invitationRepo.findOne({
          where: {
            id: invitationId,
            inviteeId: userId,
            status: InvitationStatus.PENDING,
          },
        });
      } catch (error) {
        this.logger.error(
          `Database error while finding invitation: invitationId=${invitationId}, userId=${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (!invitation) {
        this.logger.warn(
          `Invitation not found: invitationId=${invitationId}, userId=${userId}`,
        );
        throw new NotFoundException('Invitation not found');
      }

      invitation.status = InvitationStatus.REJECTED;
      try {
        await this.invitationRepo.save(invitation);
        this.logger.log(
          `Invitation rejected successfully: invitationId=${invitationId}`,
        );
      } catch (error) {
        this.logger.error(
          `Database error while saving rejected invitation: invitationId=${invitationId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      const project = await this.projectRepo.findOneBy({ id: invitation.projectId });
      const inviter = await this.userRepo.findOneBy({ id: invitation.inviterId });
      const invitee = await this.userRepo.findOneBy({ id: invitation.inviteeId });

      const statusChangeData = {
        id: invitation.id,
        projectId: invitation.projectId,
        projectName: project?.name || '',
        inviter: {
          id: inviter?.id || '',
          username: inviter?.username || '',
        },
        invitee: {
          id: invitee?.id || '',
          username: invitee?.username || '',
        },
        role: invitation.role,
        status: 'rejected',
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      };

      // Send WebSocket notification to both users
      try {
        this.notificationGateway.sendProjectInvitationStatusChanged(
          invitation.inviterId,
          statusChangeData,
        );
        this.notificationGateway.sendProjectInvitationStatusChanged(
          invitation.inviteeId,
          statusChangeData,
        );
      } catch (error) {
        this.logger.warn('Failed to send project invitation status change notification', error);
      }

      return { msg: 'Invitation rejected' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Unexpected error in rejectInvitation: userId=${userId}, invitationId=${invitationId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : typeof error,
          userId,
          invitationId,
        },
      );
      throw error;
    }
  }

  async cancelInvitation(userId: string, invitationId: string) {
    try {
      this.logger.log(
        `Cancelling invitation: userId=${userId}, invitationId=${invitationId}`,
      );

      let invitation: ProjectInvitation | null;
      try {
        invitation = await this.invitationRepo.findOne({
          where: {
            id: invitationId,
            inviterId: userId,
            status: InvitationStatus.PENDING,
          },
        });
      } catch (error) {
        this.logger.error(
          `Database error while finding invitation: invitationId=${invitationId}, userId=${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      if (!invitation) {
        this.logger.warn(
          `Invitation not found: invitationId=${invitationId}, userId=${userId}`,
        );
        throw new NotFoundException('Invitation not found');
      }

      const project = await this.projectRepo.findOneBy({ id: invitation.projectId });
      const inviter = await this.userRepo.findOneBy({ id: invitation.inviterId });
      const invitee = await this.userRepo.findOneBy({ id: invitation.inviteeId });

      try {
        await this.invitationRepo.delete(invitationId);
        this.logger.log(
          `Invitation cancelled successfully: invitationId=${invitationId}`,
        );
      } catch (error) {
        this.logger.error(
          `Database error while deleting invitation: invitationId=${invitationId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      const statusChangeData = {
        id: invitation.id,
        projectId: invitation.projectId,
        projectName: project?.name || '',
        inviter: {
          id: inviter?.id || '',
          username: inviter?.username || '',
        },
        invitee: {
          id: invitee?.id || '',
          username: invitee?.username || '',
        },
        role: invitation.role,
        status: 'cancelled',
        created_at: invitation.created_at,
        updated_at: new Date(),
      };

      // Send WebSocket notification to both users
      try {
        this.notificationGateway.sendProjectInvitationStatusChanged(
          invitation.inviterId,
          statusChangeData,
        );
        this.notificationGateway.sendProjectInvitationStatusChanged(
          invitation.inviteeId,
          statusChangeData,
        );
      } catch (error) {
        this.logger.warn('Failed to send project invitation status change notification', error);
      }

      return { msg: 'Invitation cancelled' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Unexpected error in cancelInvitation: userId=${userId}, invitationId=${invitationId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : typeof error,
          userId,
          invitationId,
        },
      );
      throw error;
    }
  }
}

