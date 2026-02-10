import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis/redis.service';
import { LatencyLoggerService } from '../libs/telemetry/latency-logger.service';

/**
 * Represents a lock on an item
 */
interface ItemLock {
  itemId: string;
  itemType: string; // 'note', 'pattern', 'playlist_note', 'marker', etc.
  userId: string;
  username?: string;
  lockedAt: number;
  expiresAt: number;
  projectId: string;
}

/**
 * Represents a queued edit waiting for a lock to be released
 */
interface QueuedEdit {
  itemId: string;
  itemType: string;
  userId: string;
  username?: string;
  editData: any;
  queuedAt: number;
  projectId: string;
  priority: number; // Higher priority edits are processed first
}

/**
 * Server-side locking queue system
 * Manages locks on items and queues edits when items are locked
 */
@Injectable()
export class LockQueueService {
  // In-memory storage (can be moved to Redis for distributed systems)
  private locks: Map<string, ItemLock> = new Map(); // itemId -> lock
  private editQueues: Map<string, QueuedEdit[]> = new Map(); // itemId -> queue of edits
  private userLocks: Map<string, Set<string>> = new Map(); // userId -> set of itemIds

  // Lock expiration time (5 minutes)
  private readonly LOCK_EXPIRATION_MS = 5 * 60 * 1000;

  constructor(
    private readonly redisService: RedisService,
    private readonly latencyLogger: LatencyLoggerService,
  ) {}

  /**
   * Acquire a lock on an item
   * @param itemId Unique identifier for the item
   * @param itemType Type of item ('note', 'pattern', etc.)
   * @param userId User requesting the lock
   * @param username Optional username for display
   * @param projectId Project ID
   * @returns true if lock acquired, false if already locked
   */
  async acquireLock(
    itemId: string,
    itemType: string,
    userId: string,
    username: string,
    projectId: string,
  ): Promise<{ success: boolean; lockedBy?: string; lockExpiresAt?: number }> {
    return this.latencyLogger.measureAsync(
      'lock_acquire',
      () => this.acquireLockImpl(itemId, itemType, userId, username, projectId),
      { itemType, projectId },
    );
  }

  private async acquireLockImpl(
    itemId: string,
    itemType: string,
    userId: string,
    username: string,
    projectId: string,
  ): Promise<{ success: boolean; lockedBy?: string; lockExpiresAt?: number }> {
    const lockKey = this.getLockKey(itemId, projectId);

    // Check if item is already locked
    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      // Check if lock has expired
      if (Date.now() > existingLock.expiresAt) {
        await this.releaseLock(itemId, projectId);
      } else if (existingLock.userId !== userId) {
        return {
          success: false,
          lockedBy: existingLock.username || existingLock.userId,
          lockExpiresAt: existingLock.expiresAt,
        };
      } else {
        existingLock.expiresAt = Date.now() + this.LOCK_EXPIRATION_MS;
        return { success: true, lockExpiresAt: existingLock.expiresAt };
      }
    }

    const lock: ItemLock = {
      itemId,
      itemType,
      userId,
      username,
      lockedAt: Date.now(),
      expiresAt: Date.now() + this.LOCK_EXPIRATION_MS,
      projectId,
    };

    this.locks.set(lockKey, lock);

    if (!this.userLocks.has(userId)) {
      this.userLocks.set(userId, new Set());
    }
    this.userLocks.get(userId)!.add(lockKey);

    await this.redisService.setItem(
      `lock:${lockKey}`,
      JSON.stringify({
        itemId,
        itemType,
        userId,
        username,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
        projectId,
      }),
    );

    return { success: true, lockExpiresAt: lock.expiresAt };
  }

  /**
   * Release a lock on an item
   * @param itemId Item ID
   * @param projectId Project ID
   * @param userId Optional user ID (if provided, only release if locked by this user)
   * @returns true if lock was released
   */
  async releaseLock(
    itemId: string,
    projectId: string,
    userId?: string,
  ): Promise<boolean> {
    return this.latencyLogger.measureAsync(
      'lock_release',
      () => this.releaseLockImpl(itemId, projectId, userId),
      { projectId },
    );
  }

  private async releaseLockImpl(
    itemId: string,
    projectId: string,
    userId?: string,
  ): Promise<boolean> {
    const lockKey = this.getLockKey(itemId, projectId);
    const lock = this.locks.get(lockKey);

    if (!lock) return false;
    if (userId && lock.userId !== userId) return false;

    this.locks.delete(lockKey);

    const userLockSet = this.userLocks.get(lock.userId);
    if (userLockSet) {
      userLockSet.delete(lockKey);
      if (userLockSet.size === 0) this.userLocks.delete(lock.userId);
    }

    await this.redisService.deleteItem(`lock:${lockKey}`);
    await this.processQueuedEditsImpl(itemId, projectId);

    return true;
  }

  /**
   * Release all locks for a user (e.g., when they disconnect)
   * @param userId User ID
   */
  async releaseAllUserLocks(userId: string): Promise<void> {
    return this.latencyLogger.measureAsync(
      'lock_release_all',
      () => this.releaseAllUserLocksImpl(userId),
      { userId },
    );
  }

  private async releaseAllUserLocksImpl(userId: string): Promise<void> {
    const userLockSet = this.userLocks.get(userId);
    if (!userLockSet) return;

    const locksToRelease: Array<{ itemId: string; projectId: string }> = [];
    for (const lockKey of userLockSet) {
      const lock = this.locks.get(lockKey);
      if (lock) locksToRelease.push({ itemId: lock.itemId, projectId: lock.projectId });
    }

    for (const { itemId, projectId } of locksToRelease) {
      await this.releaseLock(itemId, projectId, userId);
    }
  }

  /**
   * Check if an item is locked
   * @param itemId Item ID
   * @param projectId Project ID
   * @returns Lock info if locked, null otherwise
   */
  isLocked(itemId: string, projectId: string): ItemLock | null {
    const lockKey = this.getLockKey(itemId, projectId);
    const lock = this.locks.get(lockKey);

    if (!lock) {
      return null;
    }

    // Check if expired
    if (Date.now() > lock.expiresAt) {
      this.releaseLock(itemId, projectId);
      return null;
    }

    return lock;
  }

  /**
   * Queue an edit for an item that is currently locked
   * @param itemId Item ID
   * @param itemType Item type
   * @param userId User making the edit
   * @param username Optional username
   * @param editData Edit data
   * @param projectId Project ID
   * @param priority Edit priority (higher = processed first)
   * @returns Queue position (0 = first in queue)
   */
  queueEdit(
    itemId: string,
    itemType: string,
    userId: string,
    username: string,
    editData: any,
    projectId: string,
    priority: number = 0,
  ): number {
    const lockKey = this.getLockKey(itemId, projectId);

    if (!this.editQueues.has(lockKey)) {
      this.editQueues.set(lockKey, []);
    }

    const queue = this.editQueues.get(lockKey)!;

    const queuedEdit: QueuedEdit = {
      itemId,
      itemType,
      userId,
      username,
      editData,
      queuedAt: Date.now(),
      projectId,
      priority,
    };

    // Insert in priority order (higher priority first)
    let insertIndex = 0;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].priority < priority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }

    queue.splice(insertIndex, 0, queuedEdit);

    return insertIndex;
  }

  /**
   * Process queued edits for an item after lock is released
   * @param itemId Item ID
   * @param projectId Project ID
   * @returns Array of queued edits that can now be processed
   */
  async processQueuedEdits(
    itemId: string,
    projectId: string,
  ): Promise<QueuedEdit[]> {
    return this.latencyLogger.measureAsync(
      'lock_process_queued_edits',
      () => this.processQueuedEditsImpl(itemId, projectId),
      { projectId },
    );
  }

  private async processQueuedEditsImpl(
    itemId: string,
    projectId: string,
  ): Promise<QueuedEdit[]> {
    const lockKey = this.getLockKey(itemId, projectId);
    const queue = this.editQueues.get(lockKey);

    if (!queue || queue.length === 0) return [];
    if (this.isLocked(itemId, projectId)) return [];

    const processedEdits = [...queue];
    this.editQueues.delete(lockKey);
    return processedEdits;
  }

  /**
   * Get queued edits for an item
   * @param itemId Item ID
   * @param projectId Project ID
   * @returns Array of queued edits
   */
  getQueuedEdits(itemId: string, projectId: string): QueuedEdit[] {
    const lockKey = this.getLockKey(itemId, projectId);
    return this.editQueues.get(lockKey) || [];
  }

  /**
   * Get all locks for a project
   * @param projectId Project ID
   * @returns Array of locks
   */
  getProjectLocks(projectId: string): ItemLock[] {
    const projectLocks: ItemLock[] = [];

    for (const lock of this.locks.values()) {
      if (lock.projectId === projectId && Date.now() <= lock.expiresAt) {
        projectLocks.push(lock);
      }
    }

    return projectLocks;
  }

  /**
   * Clean up expired locks (should be called periodically)
   */
  async cleanupExpiredLocks(): Promise<void> {
    return this.latencyLogger.measureAsync(
      'lock_cleanup_expired',
      () => this.cleanupExpiredLocksImpl(),
    );
  }

  private async cleanupExpiredLocksImpl(): Promise<void> {
    const now = Date.now();
    const expiredLocks: Array<{ itemId: string; projectId: string }> = [];

    for (const [, lock] of this.locks.entries()) {
      if (now > lock.expiresAt) {
        expiredLocks.push({ itemId: lock.itemId, projectId: lock.projectId });
      }
    }

    for (const { itemId, projectId } of expiredLocks) {
      await this.releaseLock(itemId, projectId);
    }
  }

  /**
   * Generate lock key from item ID and project ID
   */
  private getLockKey(itemId: string, projectId: string): string {
    return `${projectId}:${itemId}`;
  }
}

