import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSnapshot } from '@app/entities/project-snapshot.entity';
import { RedisService } from '@app/redis/redis.service';

/**
 * Represents a version entry in the version history
 */
interface VersionEntry {
  versionId: string;
  projectId: string;
  versionNumber: number;
  timestamp: number;
  userId: string;
  username?: string;
  actionType: string; // 'edit', 'snapshot', 'restore', etc.
  description?: string;
  changes: any; // Diff or change summary
  fullState?: string; // Optional full project state (for snapshots)
}

/**
 * Automatic version tracking service
 * Tracks all changes to projects and maintains version history
 */
@Injectable()
export class VersionTrackerService {
  // In-memory version history (can be persisted to database)
  private versionHistory: Map<string, VersionEntry[]> = new Map(); // projectId -> versions
  private currentVersionNumbers: Map<string, number> = new Map(); // projectId -> current version number

  // Maximum number of versions to keep per project
  private readonly MAX_VERSIONS_PER_PROJECT = 100;

  constructor(
    @InjectRepository(ProjectSnapshot)
    private snapshotRepo: Repository<ProjectSnapshot>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Track a change to a project
   * @param projectId Project ID
   * @param userId User who made the change
   * @param username Optional username
   * @param actionType Type of action ('note_edit', 'pattern_add', 'marker_add', etc.)
   * @param changes Change data or diff
   * @param description Optional description
   */
  async trackChange(
    projectId: string,
    userId: string,
    username: string,
    actionType: string,
    changes: any,
    description?: string,
  ): Promise<string> {
    // Get or initialize version history for this project
    if (!this.versionHistory.has(projectId)) {
      this.versionHistory.set(projectId, []);
      this.currentVersionNumbers.set(projectId, 0);
    }

    const history = this.versionHistory.get(projectId)!;
    const versionNumber = (this.currentVersionNumbers.get(projectId) || 0) + 1;

    // Create version entry
    const versionEntry: VersionEntry = {
      versionId: this.generateVersionId(),
      projectId,
      versionNumber,
      timestamp: Date.now(),
      userId,
      username,
      actionType,
      description,
      changes,
    };

    // Add to history
    history.push(versionEntry);

    // Limit history size
    if (history.length > this.MAX_VERSIONS_PER_PROJECT) {
      history.shift(); // Remove oldest version
    }

    // Update version number
    this.currentVersionNumbers.set(projectId, versionNumber);

    // Store in Redis for persistence
    await this.storeVersionInRedis(projectId, versionEntry);

    return versionEntry.versionId;
  }

  /**
   * Create a snapshot version (full project state)
   * @param projectId Project ID
   * @param userId User creating snapshot
   * @param username Optional username
   * @param description Optional description
   */
  async createSnapshotVersion(
    projectId: string,
    userId: string,
    username: string,
    description?: string,
  ): Promise<string> {
    // Get current project state from Redis
    const contentKey = this.redisService.getContentKey(projectId);
    const fullState = (await this.redisService.getItem(contentKey)) || '{}';

    // Get or initialize version history
    if (!this.versionHistory.has(projectId)) {
      this.versionHistory.set(projectId, []);
      this.currentVersionNumbers.set(projectId, 0);
    }

    const history = this.versionHistory.get(projectId)!;
    const versionNumber = (this.currentVersionNumbers.get(projectId) || 0) + 1;

    // Create snapshot version entry
    const versionEntry: VersionEntry = {
      versionId: this.generateVersionId(),
      projectId,
      versionNumber,
      timestamp: Date.now(),
      userId,
      username,
      actionType: 'snapshot',
      description: description || 'Manual snapshot',
      changes: {},
      fullState, // Store full state for snapshots
    };

    // Add to history
    history.push(versionEntry);

    // Update version number
    this.currentVersionNumbers.set(projectId, versionNumber);

    // Store in Redis and database
    await this.storeVersionInRedis(projectId, versionEntry);

    // Also create database snapshot
    const snapshot = new ProjectSnapshot();
    snapshot.projectId = projectId;
    snapshot.snapshotData = fullState;
    snapshot.description = description || null;
    snapshot.createdBy = userId;
    await this.snapshotRepo.save(snapshot);

    return versionEntry.versionId;
  }

  /**
   * Get version history for a project
   * @param projectId Project ID
   * @param limit Maximum number of versions to return
   * @returns Array of version entries
   */
  async getVersionHistory(
    projectId: string,
    limit: number = 50,
  ): Promise<VersionEntry[]> {
    // Load from Redis if not in memory
    if (!this.versionHistory.has(projectId)) {
      await this.loadVersionHistoryFromRedis(projectId);
    }

    const history = this.versionHistory.get(projectId) || [];
    
    // Return most recent versions
    return history.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get a specific version by ID
   * @param projectId Project ID
   * @param versionId Version ID
   * @returns Version entry or null
   */
  async getVersion(
    projectId: string,
    versionId: string,
  ): Promise<VersionEntry | null> {
    // Load from Redis if not in memory
    if (!this.versionHistory.has(projectId)) {
      await this.loadVersionHistoryFromRedis(projectId);
    }

    const history = this.versionHistory.get(projectId) || [];
    return history.find((v) => v.versionId === versionId) || null;
  }

  /**
   * Get current version number for a project
   * @param projectId Project ID
   * @returns Current version number
   */
  getCurrentVersionNumber(projectId: string): number {
    return this.currentVersionNumbers.get(projectId) || 0;
  }

  /**
   * Get version diff between two versions
   * @param projectId Project ID
   * @param fromVersionId Source version ID
   * @param toVersionId Target version ID
   * @returns Diff object
   */
  async getVersionDiff(
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<any> {
    const fromVersion = await this.getVersion(projectId, fromVersionId);
    const toVersion = await this.getVersion(projectId, toVersionId);

    if (!fromVersion || !toVersion) {
      return null;
    }

    // Simple diff - in production, you'd want a more sophisticated diff algorithm
    return {
      fromVersion: fromVersion.versionNumber,
      toVersion: toVersion.versionNumber,
      fromTimestamp: fromVersion.timestamp,
      toTimestamp: toVersion.timestamp,
      changes: {
        added: toVersion.changes,
        removed: fromVersion.changes,
      },
    };
  }

  /**
   * Restore project to a specific version
   * @param projectId Project ID
   * @param versionId Version ID to restore to
   * @param userId User performing restore
   * @param username Optional username
   * @returns Success status
   */
  async restoreToVersion(
    projectId: string,
    versionId: string,
    userId: string,
    username: string,
  ): Promise<{ success: boolean; message: string }> {
    const version = await this.getVersion(projectId, versionId);
    if (!version) {
      return { success: false, message: 'Version not found' };
    }

    // If version has full state (snapshot), restore from it
    if (version.fullState) {
      const contentKey = this.redisService.getContentKey(projectId);
      await this.redisService.setItem(contentKey, version.fullState);

      // Track restore action
      await this.trackChange(
        projectId,
        userId,
        username,
        'restore',
        { restoredToVersion: versionId, restoredToVersionNumber: version.versionNumber },
        `Restored to version ${version.versionNumber}`,
      );

      return { success: true, message: `Restored to version ${version.versionNumber}` };
    }

    // For non-snapshot versions, we'd need to replay changes
    // This is more complex and would require implementing change replay logic
    return {
      success: false,
      message: 'Cannot restore to this version - full state not available',
    };
  }

  /**
   * Store version in Redis for persistence
   */
  private async storeVersionInRedis(
    projectId: string,
    version: VersionEntry,
  ): Promise<void> {
    const versionKey = `version:${projectId}:${version.versionId}`;
    await this.redisService.setItem(versionKey, JSON.stringify(version));

    // Also store in version list
    const versionListKey = `version:list:${projectId}`;
    const versionList = (await this.redisService.getItem(versionListKey)) || '[]';
    const list = JSON.parse(versionList);
    list.push(version.versionId);
    await this.redisService.setItem(versionListKey, JSON.stringify(list));
  }

  /**
   * Load version history from Redis
   */
  private async loadVersionHistoryFromRedis(projectId: string): Promise<void> {
    const versionListKey = `version:list:${projectId}`;
    const versionListStr = await this.redisService.getItem(versionListKey);
    
    if (!versionListStr) {
      this.versionHistory.set(projectId, []);
      this.currentVersionNumbers.set(projectId, 0);
      return;
    }

    const versionIds = JSON.parse(versionListStr);
    const history: VersionEntry[] = [];

    for (const versionId of versionIds) {
      const versionKey = `version:${projectId}:${versionId}`;
      const versionStr = await this.redisService.getItem(versionKey);
      if (versionStr) {
        history.push(JSON.parse(versionStr));
      }
    }

    // Sort by version number
    history.sort((a, b) => a.versionNumber - b.versionNumber);

    this.versionHistory.set(projectId, history);
    
    if (history.length > 0) {
      const maxVersion = Math.max(...history.map((v) => v.versionNumber));
      this.currentVersionNumbers.set(projectId, maxVersion);
    } else {
      this.currentVersionNumbers.set(projectId, 0);
    }
  }

  /**
   * Generate unique version ID
   */
  private generateVersionId(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

