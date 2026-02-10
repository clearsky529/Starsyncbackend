import {
  Controller,
  Get,
  Post,
  Delete,
  Req,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectInvitationService } from './project-invitation.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CollaboratorRole } from '@app/entities/collaborator.entity';

@Controller('project')
export class ProjectController {
  constructor(
    private projectService: ProjectService,
    private invitationService: ProjectInvitationService,
  ) {}

  // Project Invitation Endpoints - MUST come before parameterized routes
  @Get('invitations')
  async getInvitations(@Req() request: any) {
    return await this.invitationService.getInvitations(request.user.user_id);
  }

  @Get('')
  async list(@Req() request: any) {
    return await this.projectService.getProjects(request.user.user_id);
  }

  @Get(':projectId/collaborators')
  async getCollaborators(@Req() request: any, @Param('projectId') projectId: string) {
    return await this.projectService.getCollaborators(request.user.user_id, projectId);
  }

  @Get(':id')
  async load(@Req() request: any, @Param() { id }: { id: string }) {
    return await this.projectService.getProject(request.user.user_id, id);
  }

  @Post('')
  async create(@Req() request: any, @Body() { name }: CreateProjectDto) {
    return await this.projectService.createProject(request.user.user_id, name);
  }

  @Delete(':id')
  async delete(@Req() request: any, @Param() id: string) {
    return await this.projectService.deleteProject(request.user.user_id, id);
  }

  @Post('collaborator/add/:projectId')
  async addCollaborator(
    @Req() request: any,
    @Param() projectId: string,
    @Body() { userId }: { userId: string },
  ) {
    return await this.projectService.addCollaborator(
      request.user.user_id,
      projectId,
      userId,
    );
  }

  @Post('collaborator/remove')
  async removeCollaborator(
    @Req() request: any,
    @Param() projectId: string,
    @Body() { userId }: { userId: string },
  ) {
    return await this.projectService.removeCollaborator(
      request.user.user_id,
      projectId,
      userId,
    );
  }

  // Project Invitation Endpoints
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  async sendInvitation(
    @Req() request: any,
    @Body()
    {
      projectId,
      inviteeId,
      role,
    }: {
      projectId: string;
      inviteeId: string;
      role?: CollaboratorRole;
    },
  ) {
    return await this.invitationService.sendInvitation(
      request.user.user_id,
      projectId,
      inviteeId,
      role || CollaboratorRole.EDITOR,
    );
  }

  @Post('invitation/:id/accept')
  async acceptInvitation(@Req() request: any, @Param('id') id: string) {
    return await this.invitationService.acceptInvitation(
      request.user.user_id,
      id,
    );
  }

  @Post('invitation/:id/reject')
  async rejectInvitation(@Req() request: any, @Param('id') id: string) {
    return await this.invitationService.rejectInvitation(
      request.user.user_id,
      id,
    );
  }

  @Delete('invitation/:id')
  async cancelInvitation(@Req() request: any, @Param('id') id: string) {
    return await this.invitationService.cancelInvitation(
      request.user.user_id,
      id,
    );
  }

  // Project Snapshot Endpoints
  @Post(':projectId/snapshot')
  @HttpCode(HttpStatus.CREATED)
  async createSnapshot(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Body() { description }: { description?: string },
  ) {
    return await this.projectService.createSnapshot(
      request.user.user_id,
      projectId,
      description,
    );
  }

  @Get(':projectId/snapshots')
  async getSnapshots(@Req() request: any, @Param('projectId') projectId: string) {
    return await this.projectService.getSnapshots(request.user.user_id, projectId);
  }

  @Post(':projectId/restore/:snapshotId')
  async restoreSnapshot(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return await this.projectService.restoreSnapshot(
      request.user.user_id,
      projectId,
      snapshotId,
    );
  }

  @Get(':projectId/activity')
  async getActivityFeed(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Query('limit') limit: string = '50',
  ) {
    return await this.projectService.getActivityFeed(
      request.user.user_id,
      projectId,
      parseInt(limit, 10),
    );
  }

  @Post(':projectId/activity')
  @HttpCode(HttpStatus.CREATED)
  async logActivity(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Body() body: { actionType: string; description?: string; metadata?: any },
  ) {
    return await this.projectService.logActivity(
      request.user.user_id,
      projectId,
      body.actionType,
      body.description || null,
      body.metadata || null,
    );
  }

  // Version History Endpoints
  @Get(':projectId/versions')
  async getVersionHistory(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Query('limit') limit: string = '50',
  ) {
    return await this.projectService.getVersionHistory(
      request.user.user_id,
      projectId,
      parseInt(limit, 10),
    );
  }

  @Get(':projectId/version/:versionId')
  async getVersion(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ) {
    return await this.projectService.getVersion(
      request.user.user_id,
      projectId,
      versionId,
    );
  }

  @Post(':projectId/restore-version/:versionId')
  async restoreToVersion(
    @Req() request: any,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ) {
    return await this.projectService.restoreToVersion(
      request.user.user_id,
      projectId,
      versionId,
    );
  }
}
