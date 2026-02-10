import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Project as ProjectEntity } from '@app/entities/project.entity';
import { Collaborator, CollaboratorRole } from '@app/entities/collaborator.entity';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private projectRepo: Repository<ProjectEntity>,
    @InjectRepository(Collaborator)
    private collaboratorRepo: Repository<Collaborator>,
  ) {}

  async getUserRole(userId: string, projectId: string): Promise<CollaboratorRole | null> {
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) {
      return null;
    }

    // Owner has full access
    if (project.ownerId === userId) {
      return CollaboratorRole.OWNER;
    }

    // Check collaborator role
    const collaborator = await this.collaboratorRepo.findOneBy({
      projectId,
      userId,
    });

    return collaborator?.role || null;
  }

  async canView(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);
    return role !== null; // Any role can view
  }

  async canEdit(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);
    return (
      role === CollaboratorRole.OWNER ||
      role === CollaboratorRole.EDITOR
    );
  }

  async canComment(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);
    // Viewer, Commenter, Editor, and Owner can all comment
    return (
      role === CollaboratorRole.OWNER ||
      role === CollaboratorRole.EDITOR ||
      role === CollaboratorRole.COMMENTER ||
      role === CollaboratorRole.VIEWER
    );
  }

  async isProjectOwner(userId: string, projectId: string): Promise<boolean> {
    const project = await this.projectRepo.findOneBy({ id: projectId });
    return project?.ownerId === userId;
  }

  async canInvite(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);
    return (
      role === CollaboratorRole.OWNER ||
      role === CollaboratorRole.EDITOR
    );
  }

  async canDelete(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);
    return role === CollaboratorRole.OWNER; // Only owner can delete
  }

  async canManageCollaborators(userId: string, projectId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, projectId);
    return (
      role === CollaboratorRole.OWNER ||
      role === CollaboratorRole.EDITOR
    );
  }
}

