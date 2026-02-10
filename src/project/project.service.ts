import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { User as UserEntity } from '@app/entities/user.entity';
import { Project as ProjectEntity } from '@app/entities/project.entity';
import { Collaborator as CollaboratorEntity } from '@app/entities/collaborator.entity';
import { ProjectSnapshot } from '@app/entities/project-snapshot.entity';
import { ProjectActivity } from '@app/entities/project-activity.entity';
import { RedisService } from '@app/redis/redis.service';
import { PermissionService } from '@app/services/permission.service';
import { VersionTrackerService } from './version-tracker.service';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private projectRepo: Repository<ProjectEntity>,
    @InjectRepository(CollaboratorEntity)
    private collaboratorRepo: Repository<CollaboratorEntity>,
    @InjectRepository(ProjectSnapshot)
    private snapshotRepo: Repository<ProjectSnapshot>,
    @InjectRepository(ProjectActivity)
    private activityRepo: Repository<ProjectActivity>,
    private readonly redisService: RedisService,
    private readonly permissionService: PermissionService,
    private readonly versionTracker: VersionTrackerService,
  ) {}

  async getProject(userId: string, projectId: string) {
    const project = await this.projectRepo.findOneBy({
      id: projectId,
    });

    if (!project) {
      throw new BadRequestException('Project not exist');
    }

    // Check view permission
    const canView = await this.permissionService.canView(userId, projectId);
    if (!canView) {
      throw new ForbiddenException("You don't have permission to view this project");
    }

    // Get user role
    const role = await this.permissionService.getUserRole(userId, projectId);

    const contentKey = this.redisService.getContentKey(projectId);

    const content = (await this.redisService.getItem(contentKey)) || '[]';

    return {
      ...project,
      content: JSON.parse(content),
      role: role || null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getProjects(userId: string) {
    const projects = await this.projectRepo.find();
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.ownerId,
      created_at: p.created_at,
    }));
    // const projects = await this.projectRepo.findBy({ ownerId: userId });
    // const collaborations = await this.collaboratorRepo.find({
    //   where: { userId },
    //   relations: ['project'],
    // });
    // const sideProjects = collaborations.map((c) => c.project);
    // return {
    //   projects: [...projects, ...sideProjects].map((p) => ({
    //     id: p.id,
    //     name: p.name,
    //     ownerId: p.ownerId,
    //     created_at: p.created_at,
    //   })),
    // };
  }

  async createProject(userId: string, projectName: string) {
    const project = await this.projectRepo.findOneBy({ name: projectName });
    if (project) {
      throw new BadRequestException('Project name already exists');
    }

    const newProject = new ProjectEntity();
    newProject.ownerId = userId;
    newProject.name = projectName;
    newProject.notes = '';

    await this.projectRepo.save(newProject);
    return newProject;
  }

  async deleteProject(userId: string, id: string) {
    const project = await this.projectRepo.findOneBy({ id });

    if (!project) {
      throw new BadRequestException('Project not exist');
    }

    // Check delete permission (only owner can delete)
    const canDelete = await this.permissionService.canDelete(userId, id);
    if (!canDelete) {
      throw new ForbiddenException('Only project owner can delete the project');
    }

    await this.projectRepo.delete(id);
  }

  async addCollaborator(ownerId: string, projectId: string, userId: string, role?: string) {
    const project = await this.projectRepo.findOneBy({ id: projectId });

    if (!project) {
      throw new BadRequestException('Project not exist');
    }

    // Check if user has permission to add collaborators
    const canInvite = await this.permissionService.canInvite(ownerId, projectId);
    if (!canInvite) {
      throw new ForbiddenException('You do not have permission to add collaborators');
    }

    const collaborator = await this.collaboratorRepo.findOneBy({
      projectId,
      userId,
    });
    if (collaborator) {
      throw new BadRequestException('Already added');
    }

    const newCollaborator = new CollaboratorEntity();
    newCollaborator.projectId = projectId;
    newCollaborator.userId = userId;
    // Role will be set by invitation system, default to EDITOR if direct add
    if (role) {
      newCollaborator.role = role as any;
    }

    await this.collaboratorRepo.save(newCollaborator);
    return newCollaborator;
  }

  async removeCollaborator(ownerId: string, projectId: string, userId: string) {
    const project = await this.projectRepo.findOneBy({ id: projectId });

    if (!project) {
      throw new BadRequestException('Project not exist');
    }

    if (project.ownerId !== ownerId) {
      throw new ForbiddenException('Not owner');
    }

    await this.collaboratorRepo.delete({ userId });
  }

  async getCollaborators(userId: string, projectId: string) {
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user is owner or collaborator
    const isOwner = project.ownerId === userId;
    const isCollaborator = await this.collaboratorRepo.findOneBy({
      projectId,
      userId,
    });

    if (!isOwner && !isCollaborator) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Get all collaborators
    const collaborators = await this.collaboratorRepo.find({
      where: { projectId },
    });

    // Get user info for each collaborator
    const collaboratorsWithUsers = await Promise.all(
      collaborators.map(async (collab) => {
        const user = await this.userRepo.findOneBy({ id: collab.userId });
        return {
          id: collab.id,
          userId: collab.userId,
          username: user?.username || user?.email || 'Unknown',
          email: user?.email || '',
          role: collab.role,
          createdAt: collab.created_at,
        };
      }),
    );

    // Also include project owner
    const owner = await this.userRepo.findOneBy({ id: project.ownerId });
    if (owner) {
      collaboratorsWithUsers.unshift({
        id: 'owner',
        userId: project.ownerId,
        username: owner.username || owner.email || 'Unknown',
        email: owner.email || '',
        role: 'owner' as any,
        createdAt: project.created_at,
      });
    }

    return collaboratorsWithUsers;
  }

  /**
   * Create a snapshot of the current project state
   */
  async createSnapshot(
    userId: string,
    projectId: string,
    description?: string,
  ): Promise<ProjectSnapshot> {
    // Check view permission
    const canView = await this.permissionService.canView(userId, projectId);
    if (!canView) {
      throw new ForbiddenException("You don't have permission to create snapshots for this project");
    }

    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get current project content from Redis
    const contentKey = this.redisService.getContentKey(projectId);
    const content = (await this.redisService.getItem(contentKey)) || '[]';

    // Create snapshot
    const snapshot = new ProjectSnapshot();
    snapshot.projectId = projectId;
    snapshot.snapshotData = content;
    snapshot.description = description || null;
    snapshot.createdBy = userId;

    return await this.snapshotRepo.save(snapshot);
  }

  /**
   * Get all snapshots for a project
   */
  async getSnapshots(userId: string, projectId: string): Promise<any[]> {
    // Check view permission
    const canView = await this.permissionService.canView(userId, projectId);
    if (!canView) {
      throw new ForbiddenException("You don't have permission to view snapshots for this project");
    }

    const snapshots = await this.snapshotRepo.find({
      where: { projectId },
      order: { created_at: 'DESC' },
    });

    // Fetch usernames for each snapshot creator
    const snapshotsWithUsernames = await Promise.all(
      snapshots.map(async (snapshot) => {
        const creator = await this.userRepo.findOneBy({ id: snapshot.createdBy });
        return {
          id: snapshot.id,
          projectId: snapshot.projectId,
          snapshotData: snapshot.snapshotData,
          description: snapshot.description,
          createdBy: snapshot.createdBy,
          createdByUsername: creator?.username || 'Unknown',
          created_at: snapshot.created_at,
        };
      }),
    );

    return snapshotsWithUsernames;
  }

  /**
   * Restore a project from a snapshot
   */
  async restoreSnapshot(
    userId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Check edit permission (only editors/owners can restore)
    const canEdit = await this.permissionService.canEdit(userId, projectId);
    if (!canEdit) {
      throw new ForbiddenException("You don't have permission to restore snapshots for this project");
    }

    const snapshot = await this.snapshotRepo.findOne({
      where: { id: snapshotId, projectId },
    });

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    // Get current content before restoration (for safety backup)
    const contentKey = this.redisService.getContentKey(projectId);
    const currentContent = (await this.redisService.getItem(contentKey)) || '[]';

    // Create a new snapshot of the current state before restoration (for safety)
    const backupSnapshot = new ProjectSnapshot();
    backupSnapshot.projectId = projectId;
    backupSnapshot.snapshotData = currentContent;
    backupSnapshot.description = `Auto-backup before restore (${new Date().toISOString()})`;
    backupSnapshot.createdBy = userId;
    await this.snapshotRepo.save(backupSnapshot);

    // Now restore the snapshot
    await this.redisService.setItem(contentKey, snapshot.snapshotData);

    this.logger.log(`Project ${projectId} restored from snapshot ${snapshotId} by user ${userId}`);

    return {
      success: true,
      message: 'Project restored successfully',
    };
  }

  /**
   * Log an activity for a project
   */
  async logActivity(
    userId: string,
    projectId: string,
    actionType: string,
    description: string | null = null,
    metadata: any = null,
  ): Promise<ProjectActivity> {
    const activity = this.activityRepo.create({
      projectId,
      userId,
      actionType,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    return await this.activityRepo.save(activity);
  }

  /**
   * Get activity feed for a project
   */
  async getActivityFeed(
    userId: string,
    projectId: string,
    limit: number = 50,
  ): Promise<any[]> {
    // Check view permission
    const canView = await this.permissionService.canView(userId, projectId);
    if (!canView) {
      throw new ForbiddenException("You don't have permission to view activity for this project");
    }

    const activities = await this.activityRepo.find({
      where: { projectId },
      order: { created_at: 'DESC' },
      take: limit,
      relations: ['user'],
    });

    // Format activities with username
    return activities.map((activity) => ({
      id: activity.id,
      projectId: activity.projectId,
      userId: activity.userId,
      username: activity.user?.username || 'Unknown',
      actionType: activity.actionType,
      description: activity.description,
      metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
      created_at: activity.created_at,
    }));
  }

  /**
   * Get version history for a project
   */
  async getVersionHistory(
    userId: string,
    projectId: string,
    limit: number = 50,
  ): Promise<any[]> {
    // Check view permission
    const canView = await this.permissionService.canView(userId, projectId);
    if (!canView) {
      throw new ForbiddenException("You don't have permission to view version history for this project");
    }

    return await this.versionTracker.getVersionHistory(projectId, limit);
  }

  /**
   * Get a specific version by ID
   */
  async getVersion(
    userId: string,
    projectId: string,
    versionId: string,
  ): Promise<any> {
    // Check view permission
    const canView = await this.permissionService.canView(userId, projectId);
    if (!canView) {
      throw new ForbiddenException("You don't have permission to view versions for this project");
    }

    const version = await this.versionTracker.getVersion(projectId, versionId);
    if (!version) {
      throw new NotFoundException('Version not found');
    }

    return version;
  }

  /**
   * Restore project to a specific version
   */
  async restoreToVersion(
    userId: string,
    projectId: string,
    versionId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Check edit permission (only editors/owners can restore)
    const canEdit = await this.permissionService.canEdit(userId, projectId);
    if (!canEdit) {
      throw new ForbiddenException("You don't have permission to restore versions for this project");
    }

    // Get user info for version tracking
    const user = await this.userRepo.findOneBy({ id: userId });
    const username = user?.username || user?.email || 'Unknown';

    return await this.versionTracker.restoreToVersion(
      projectId,
      versionId,
      userId,
      username,
    );
  }
}
