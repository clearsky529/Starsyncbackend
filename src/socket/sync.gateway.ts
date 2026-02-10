import { Server, WebSocket } from 'ws';
import { RedisService } from '@app/redis/redis.service';
import { SYNCACTION, NOTIFICATION, EVENT_TYPE } from '@app/interfaces/enum';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { LockQueueService } from './lock-queue.service';
import { LatencyLoggerService } from '../libs/telemetry/latency-logger.service';
import { TelemetryService } from '../libs/telemetry/telemetry.service';

interface INoteAction {
  uuid: string;
  note: number;
  velocity: number;
  pos: number;
  length: number;
  action: SYNCACTION;
}

interface SyncMessage {
  room: string;
  sender: string;
  notes: Array<INoteAction>;
}

interface ShareProjectData {
  version: string;
  name: string;
  created: string;
  modified: string;
  patterns: Record<string, unknown>;
  playlist: Record<string, unknown>;
}

interface ShareProjectPayload {
  senderId: string;
  recipientId: string;
  recipientUsername: string;
  projectName: string;
  projectData: ShareProjectData;
}

type ShareQueueType = 'share' | 'update';

interface ShareQueueItem {
  type: ShareQueueType;
  payload: ShareProjectPayload;
  queuedAt: number;
}

@Injectable()
export class SyncGateway implements OnModuleInit {
  private wss: Server;
  constructor(
    private readonly redisService: RedisService,
    private readonly lockQueueService: LockQueueService,
    private readonly latencyLogger: LatencyLoggerService,
    private readonly telemetry: TelemetryService,
  ) {}

  // Store rooms and their connections
  private rooms: Record<string, Set<WebSocket>> = {};
  private userConnections: Map<string, Set<WebSocket>> = new Map();
  private clientToUserId: Map<WebSocket, string> = new Map();
  private pendingMessages: Map<string, ShareQueueItem[]> = new Map();

  onModuleInit() {
    // Manually create WebSocket server on port 4000
    this.wss = new Server({ port: 4000 });
    console.log('✅ SyncGateway WebSocket server started on port 4000');
    
    // Start periodic cleanup of expired locks (every 1 minute)
    setInterval(() => {
      this.lockQueueService.cleanupExpiredLocks().catch((error) => {
        console.error('❌ Error cleaning up expired locks:', error);
      });
    }, 60 * 1000);
    
    this.wss.on('connection', (client: WebSocket) => {
      console.log('🔌 New client connected to SyncGateway');
      this.handleConnection(client);
      
      client.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 Received message:', message.event, message.data ? Object.keys(message.data) : '');
          this.handleMessage(client, message);
        } catch (error) {
          console.error('❌ Error parsing message:', error);
          client.send(JSON.stringify({
            event: EVENT_TYPE.ERROR,
            message: 'Invalid JSON format'
          }));
        }
      });
      
      client.on('close', () => {
        console.log('🔌 Client disconnected from SyncGateway');
        this.handleDisconnect(client);
      });
      
      client.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
    });
  }

  handleConnection(client: WebSocket) {
    this.telemetry.recordConnection(true);
    client.send(JSON.stringify({ event: 'connected', message: 'Welcome!' }));
  }

  handleDisconnect(client: WebSocket) {
    console.log('🔌 Client disconnected from SyncGateway');
    this.telemetry.recordConnection(false);
    // Remove the client from all rooms
    for (const room of Object.keys(this.rooms)) {
      this.rooms[room]?.delete(client);
      if (this.rooms[room].size === 0) delete this.rooms[room];
    }

    // Remove from user connections map and release all locks
    const userId = this.clientToUserId.get(client);
    if (userId) {
      // Release all locks for this user
      this.lockQueueService.releaseAllUserLocks(userId).catch((error) => {
        console.error('❌ Error releasing user locks on disconnect:', error);
      });

      const clients = this.userConnections.get(userId);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) {
          this.userConnections.delete(userId);
        }
      }
      this.clientToUserId.delete(client);
    }
  }

  private handleMessage(client: WebSocket, message: any) {
    const { event, data } = message;
    const start = Date.now();
    const eventName = event || 'unknown';
    try {
    switch (event) {
      case EVENT_TYPE.REGISTER_USER:
        this.handleRegisterUser(client, data);
        break;
      case EVENT_TYPE.SHARE_PROJECT:
        this.handleShareProject(client, data);
        break;
      case EVENT_TYPE.SHARE_PROJECT_UPDATE:
        this.handleShareProjectUpdate(client, data);
        break;
      case EVENT_TYPE.JOIN_PROJECT:
        if (data && typeof data === 'object') {
          this.joinProject(client, data.projectId, data.userId);
        } else {
          const parsed = JSON.parse(data);
          this.joinProject(client, parsed.projectId, parsed.userId);
        }
        break;
      case EVENT_TYPE.LEAVE_PROJECT:
        if (data && typeof data === 'object') {
          this.leaveProject(client, data.projectId, data.userId);
        } else {
          const parsed = JSON.parse(data);
          this.leaveProject(client, parsed.projectId, parsed.userId);
        }
        break;
      case EVENT_TYPE.CURSOR_POSITION:
        this.handleCursorPosition(client, data);
        break;
      case EVENT_TYPE.PLAYBACK_STATE:
        this.handlePlaybackState(client, data);
        break;
      case EVENT_TYPE.TEMPO_CHANGE:
        this.handleTempoChange(client, data);
        break;
      case EVENT_TYPE.TEMPO_AUTOMATION:
        this.handleTempoAutomation(client, data);
        break;
      case EVENT_TYPE.MARKER_ADDED:
        this.handleMarkerAdded(client, data);
        break;
      case EVENT_TYPE.MARKER_UPDATED:
        this.handleMarkerUpdated(client, data);
        break;
      case EVENT_TYPE.MARKER_DELETED:
        this.handleMarkerDeleted(client, data);
        break;
      case EVENT_TYPE.LOCK_REQUEST:
        this.handleLockRequest(client, data);
        break;
      case EVENT_TYPE.LOCK_RELEASED:
        this.handleLockReleased(client, data);
        break;
      case EVENT_TYPE.SYNC:
        if (data && typeof data === 'object') {
          this.processMessage(client, data.room, data.sender, data.notes);
        } else {
          const parsed = JSON.parse(data);
          this.processMessage(client, parsed.room, parsed.sender, parsed.notes);
        }
        break;
      case EVENT_TYPE.UNDO:
        this.handleUndo(client, data);
        break;
      case EVENT_TYPE.REDO:
        this.handleRedo(client, data);
        break;
      case 'ping':
        // Keep-alive / load-test RTT: echo client ts for round-trip measurement
        this.sendJson(client, {
          event: 'pong',
          ts: data?.ts ?? Date.now(),
          serverTs: Date.now(),
        });
        break;
        
      // Automation events
      case EVENT_TYPE.AUTOMATION_LANE_CREATE:
        this.handleAutomationEvent(client, data, EVENT_TYPE.AUTOMATION_LANE_CREATE);
        break;
      case EVENT_TYPE.AUTOMATION_LANE_DELETE:
        this.handleAutomationEvent(client, data, EVENT_TYPE.AUTOMATION_LANE_DELETE);
        break;
      case EVENT_TYPE.AUTOMATION_LANE_UPDATE:
        this.handleAutomationEvent(client, data, EVENT_TYPE.AUTOMATION_LANE_UPDATE);
        break;
      case EVENT_TYPE.AUTOMATION_POINT_ADD:
        this.handleAutomationEvent(client, data, EVENT_TYPE.AUTOMATION_POINT_ADD);
        break;
      case EVENT_TYPE.AUTOMATION_POINT_REMOVE:
        this.handleAutomationEvent(client, data, EVENT_TYPE.AUTOMATION_POINT_REMOVE);
        break;
      case EVENT_TYPE.AUTOMATION_POINT_MOVE:
        this.handleAutomationEvent(client, data, EVENT_TYPE.AUTOMATION_POINT_MOVE);
        break;
      case EVENT_TYPE.PLUGIN:
        this.handlePlugin(client, data);
        break;
        
      default:
        console.warn('⚠️ Unknown event:', event);
    }
    } finally {
      const latencyMs = Date.now() - start;
      this.latencyLogger.logLatency('sync_gateway_message', latencyMs, { event: eventName });
      this.telemetry.recordMessageCount(eventName, 1);
    }
  }

  private handleRegisterUser(client: WebSocket, data: any) {
    try {
      const userId = data?.userId || (typeof data === 'string' ? JSON.parse(data).userId : null);
      if (!userId) {
        console.warn('⚠️ registerUser payload missing userId', data);
        this.sendJson(client, {
          event: EVENT_TYPE.SHARE_PROJECT_ERROR,
          message: 'Missing userId in registerUser payload',
        });
        return;
      }

      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)?.add(client);
      this.clientToUserId.set(client, userId);
      
      console.log(`✅ Registered user ${userId} for sharing`);
      console.log(`📊 Active connections for ${userId}: ${this.userConnections.get(userId)?.size}`);
      
      this.sendJson(client, {
        event: EVENT_TYPE.REGISTER_USER,
        userId,
        status: 'ok',
      });
      this.flushQueuedMessages(userId);
    } catch (error) {
      console.error('❌ Failed to register user:', error);
      this.sendJson(client, {
        event: EVENT_TYPE.SHARE_PROJECT_ERROR,
        message: 'Invalid registerUser payload',
      });
    }
  }

  private handleShareProject(client: WebSocket, data: any) {
    try {
      console.log('📤 shareProject received, data type:', typeof data);
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as ShareProjectPayload;
      console.log('📤 shareProject parsed:', {
        senderId: payload.senderId,
        recipientId: payload.recipientId,
        projectName: payload.projectName,
        hasProjectData: !!payload.projectData
      });
      const validationError = this.validateSharePayload(payload);
      if (validationError) {
        console.warn(
          '[SyncGateway] shareProject validation failed:',
          validationError,
        );
        this.sendJson(client, {
          event: EVENT_TYPE.SHARE_PROJECT_ERROR,
          message: validationError,
        });
        return;
      }

      const delivered = this.forwardShareEvent(EVENT_TYPE.SHARE_PROJECT, payload);
      console.log(
        `[SyncGateway] shareProject result -> recipient: ${payload.recipientId}, delivered: ${delivered}`,
      );

      this.sendJson(client, {
        event: EVENT_TYPE.SHARE_PROJECT_ACK,
        recipientId: payload.recipientId,
        projectName: payload.projectName,
        delivered,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('[SyncGateway] Failed to process shareProject payload', error.stack);
      } else {
        console.error('[SyncGateway] Failed to process shareProject payload');
      }
      this.sendJson(client, {
        event: EVENT_TYPE.SHARE_PROJECT_ERROR,
        message: 'Invalid shareProject payload',
      });
    }
  }

  private handleShareProjectUpdate(client: WebSocket, data: any) {
    try {
      console.log('📡 shareProjectUpdate received, data type:', typeof data);
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as ShareProjectPayload;
      const validationError = this.validateSharePayload(payload);
      if (validationError) {
        console.warn('[SyncGateway] shareProjectUpdate validation failed:', validationError);
        this.sendJson(client, {
          event: EVENT_TYPE.SHARE_PROJECT_ERROR,
          message: validationError,
        });
        return;
      }

      // CRITICAL FIX: Extract projectId from projectData and broadcast to ALL users in the project room
      // This enables multi-user real-time collaboration instead of point-to-point sharing
      let projectId: string | null = null;
      if (payload.projectData && typeof payload.projectData === 'object') {
        projectId = (payload.projectData as any).projectId || (payload.projectData as any).id || null;
      }

      if (projectId && this.rooms[projectId]) {
        // Broadcast to ALL users in the project room (multi-user collaboration)
        const message = JSON.stringify({
          event: EVENT_TYPE.SHARE_PROJECT_UPDATE,
          data: payload,
        });

        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] shareProjectUpdate broadcasted to ${deliveredCount} users in project room: ${projectId}`,
        );
      } else {
        // Fallback: If projectId not found or room doesn't exist, use old point-to-point method
        console.warn(
          `[SyncGateway] shareProjectUpdate: projectId not found or room doesn't exist, falling back to point-to-point`,
        );
        const delivered = this.forwardShareEvent(EVENT_TYPE.SHARE_PROJECT_UPDATE, payload);
        console.log(
          `[SyncGateway] shareProjectUpdate result -> recipient: ${payload.recipientId}, delivered: ${delivered}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to process shareProjectUpdate payload', error);
      this.sendJson(client, {
        event: EVENT_TYPE.SHARE_PROJECT_ERROR,
        message: 'Invalid shareProjectUpdate payload',
      });
    }
  }

  private handleCursorPosition(client: WebSocket, data: any) {
    try {
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as {
        projectId: string;
        userId: string;
        username?: string;
        position: { x: number; y: number };
      };

      if (!payload.projectId || !payload.userId || !payload.position) {
        console.warn('[SyncGateway] Invalid cursor position payload');
        return;
      }

      // Broadcast cursor position to all users in the project room (except sender)
      if (this.rooms[payload.projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.CURSOR_POSITION,
          data: {
            userId: payload.userId,
            username: payload.username || payload.userId,
            position: payload.position,
            projectId: payload.projectId,
          },
        });

        let deliveredCount = 0;
        this.rooms[payload.projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] Cursor position broadcasted to ${deliveredCount} users in project: ${payload.projectId}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to process cursor position', error);
    }
  }

  private handlePlugin(client: WebSocket, data: any) {
    try {
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as {
        projectId: string;
        type: string;
        trackId: number;
        slotIndex: number;
        pluginTypeId?: string;
        paramIndex?: number;
        value?: number;
        fromSlotIndex?: number;
        toSlotIndex?: number;
        isBypassed?: boolean;
      };

      if (!payload.projectId) {
        console.warn('[SyncGateway] Invalid plugin payload: missing projectId');
        return;
      }

      // Broadcast plugin message to all users in the project room (except sender)
      if (this.rooms[payload.projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.PLUGIN,
          data: payload,
        });

        let deliveredCount = 0;
        this.rooms[payload.projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] Plugin event (${payload.type}) broadcasted to ${deliveredCount} users in project: ${payload.projectId}`,
        );
      } else {
        console.warn(
          `[SyncGateway] Plugin event: project room not found for projectId: ${payload.projectId}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to process plugin event', error);
    }
  }

  private handlePlaybackState(client: WebSocket, data: any) {
    try {
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as {
        projectId: string;
        userId: string;
        username?: string;
        isPlaying: boolean;
        currentTime: number;
        action?: 'play' | 'pause' | 'stop' | 'seek';
      };

      if (!payload.projectId || !payload.userId) {
        console.warn('[SyncGateway] Invalid playback state payload');
        return;
      }

      // Broadcast playback state to all users in the project room (except sender)
      if (this.rooms[payload.projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.PLAYBACK_STATE,
          data: {
            userId: payload.userId,
            username: payload.username || payload.userId,
            isPlaying: payload.isPlaying ?? false,
            currentTime: payload.currentTime ?? 0,
            action: payload.action || (payload.isPlaying ? 'play' : 'pause'),
            projectId: payload.projectId,
          },
        });

        let deliveredCount = 0;
        this.rooms[payload.projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] Playback state broadcasted to ${deliveredCount} users in project: ${payload.projectId} - ${payload.action || (payload.isPlaying ? 'play' : 'pause')} at ${payload.currentTime}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to process playback state', error);
    }
  }

  private handleTempoChange(client: WebSocket, data: any) {
    try {
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as {
        projectId: string;
        userId: string;
        tempo: number;
      };

      if (!payload.projectId || !payload.userId || payload.tempo === undefined) {
        console.warn('[SyncGateway] Invalid tempo change payload');
        return;
      }

      // Broadcast tempo change to all users in the project room (except sender)
      if (this.rooms[payload.projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.TEMPO_CHANGE,
          data: {
            userId: payload.userId,
            tempo: payload.tempo,
            projectId: payload.projectId,
          },
        });

        let deliveredCount = 0;
        this.rooms[payload.projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] Tempo change broadcasted to ${deliveredCount} users in project: ${payload.projectId} - tempo: ${payload.tempo} BPM`,
        );
      } else {
        console.warn(`[SyncGateway] Tempo change: Project room ${payload.projectId} not found`);
      }
    } catch (error) {
      console.error('❌ Failed to process tempo change', error);
    }
  }

  private handleTempoAutomation(client: WebSocket, data: any) {
    try {
      const payload = (typeof data === 'string' ? JSON.parse(data) : data) as {
        projectId: string;
        userId: string;
        tempoMap?: any;
        automationData?: any;
        pointId?: string;
        pointData?: any;
        newTime?: number;
        newValue?: number;
      };

      console.log('[SyncGateway] Tempo automation received:', {
        projectId: payload.projectId,
        userId: payload.userId,
        hasTempoMap: !!payload.tempoMap,
        tempoMapType: payload.tempoMap ? typeof payload.tempoMap : 'undefined',
        tempoMapKeys: payload.tempoMap && typeof payload.tempoMap === 'object' ? Object.keys(payload.tempoMap) : [],
      });

      if (!payload.projectId || !payload.userId) {
        console.warn('[SyncGateway] Invalid tempo automation payload');
        return;
      }

      // Broadcast tempo automation to all users in the project room (except sender)
      // Forward the entire payload data, including tempoMap if present
      if (this.rooms[payload.projectId]) {
        const broadcastData = {
          userId: payload.userId,
          projectId: payload.projectId,
          tempoMap: payload.tempoMap, // Include tempoMap in broadcast
          automationData: payload.automationData,
          pointId: payload.pointId,
          pointData: payload.pointData,
          newTime: payload.newTime,
          newValue: payload.newValue,
          timestamp: Date.now(),
        };

        console.log('[SyncGateway] Broadcasting tempo automation:', {
          hasTempoMap: !!broadcastData.tempoMap,
          tempoMapType: broadcastData.tempoMap ? typeof broadcastData.tempoMap : 'undefined',
          tempoMapKeys: broadcastData.tempoMap && typeof broadcastData.tempoMap === 'object' ? Object.keys(broadcastData.tempoMap) : [],
        });

        const message = JSON.stringify({
          event: EVENT_TYPE.TEMPO_AUTOMATION,
          data: broadcastData,
        });

        let deliveredCount = 0;
        this.rooms[payload.projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] Tempo automation broadcasted to ${deliveredCount} users in project: ${payload.projectId}`,
        );
      } else {
        console.warn(`[SyncGateway] Tempo automation: Project room ${payload.projectId} not found`);
      }
    } catch (error) {
      console.error('❌ Failed to process tempo automation', error);
    }
  }

  /**
   * Handle automation events (lane create/delete/update, point add/remove/move)
   * Broadcasts to all users in the project room except the sender.
   */
  private handleAutomationEvent(client: WebSocket, data: any, eventType: EVENT_TYPE) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      
      const { projectId, userId, laneId, laneData, pointId, pointData, newTime, newValue } = payload;
      
      if (!projectId || !userId) {
        console.warn(`[SyncGateway] Invalid automation event payload - missing projectId or userId`);
        return;
      }
      
      // Broadcast to project room (except sender)
      if (this.rooms[projectId]) {
        const message = JSON.stringify({
          event: eventType,
          data: {
            userId,
            projectId,
            laneId,
            laneData,
            pointId,
            pointData,
            newTime,
            newValue,
            timestamp: Date.now(),
          },
        });

        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });

        console.log(
          `[SyncGateway] Automation event ${eventType} broadcasted to ${deliveredCount} users in project: ${projectId}`,
        );
      } else {
        console.warn(`[SyncGateway] Automation event: Project room ${projectId} not found`);
      }
    } catch (error) {
      console.error(`❌ Failed to process automation event ${eventType}:`, error);
    }
  }

  private joinProject(client: WebSocket, projectId: string, userId: string) {
    if (!this.rooms[projectId]) {
      this.rooms[projectId] = new Set();
    }
    this.rooms[projectId].add(client);
    client.send(
      JSON.stringify({
        event: EVENT_TYPE.JOIN_PROJECT,
        projectId,
      }),
    );
    this.broadcast(projectId, {
      event: EVENT_TYPE.NOTIFICATION,
      message: NOTIFICATION.JOIN_PROJECT,
      userId,
      projectId,
    });
  }

  private leaveProject(client: WebSocket, projectId: string, userId: string) {
    if (!this.rooms[projectId]) return;
    this.rooms[projectId].delete(client);
    if (this.rooms[projectId].size === 0) delete this.rooms[projectId];

    client.send(
      JSON.stringify({
        event: EVENT_TYPE.LEAVE_PROJECT,
        projectId,
      }),
    );
    this.broadcast(projectId, {
      event: EVENT_TYPE.NOTIFICATION,
      message: NOTIFICATION.LEAVE_PROJECT,
      userId,
      projectId,
    });
  }

  private async processMessage(
    client: WebSocket,
    projectId: string,
    sender: string,
    notes: Array<INoteAction>,
  ) {
    if (!this.rooms[projectId]) {
      client.send(
        JSON.stringify({ event: EVENT_TYPE.ERROR, message: 'Room not found' }),
      );
      return;
    }

    const historyKey = this.redisService.getHistoryKey(projectId);
    const contentKey = this.redisService.getContentKey(projectId);

    const historyItem = { notes, sender };
    await this.redisService.addItem(historyKey, historyItem);

    const contentStr = await this.redisService.getItem(contentKey);
    let content: any[] = JSON.parse(contentStr || '[]') || [];

    for (let i = 0; i < notes.length; i++) {
      const { uuid, note, velocity, pos, length, action } = notes[i];

      switch (action) {
        case SYNCACTION.ADD:
          content.push({
            uuid,
            note,
            velocity,
            pos,
            length,
          });
          break;
        case SYNCACTION.UPDATE:
          for (let j = 0; j < content.length; j++) {
            if (content[j].uuid === uuid) {
              content[j].note = note;
              content[j].velocity = velocity;
              content[j].pos = pos;
              content[j].length = length;
            }
          }
          break;
        case SYNCACTION.DELETE:
          content = content.filter((e) => e.uuid !== uuid);
          break;
      }
    }

    await this.redisService.setItem(contentKey, JSON.stringify(content));

    this.broadcast(projectId, {
      event: EVENT_TYPE.SYNC,
      notes,
      sender,
      projectId,
    });
  }

  private broadcast(room: string, data: Record<string, any>) {
    const message = JSON.stringify(data);
    this.rooms[room]?.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    });
  }

  private validateSharePayload(payload: ShareProjectPayload): string | null {
    if (!payload) {
      return 'Missing share payload';
    }

    const requiredTopLevel: Array<keyof ShareProjectPayload> = [
      'senderId',
      'recipientId',
      'recipientUsername',
      'projectName',
      'projectData',
    ];

    for (const key of requiredTopLevel) {
      if (!payload[key]) {
        return `Missing ${key} in shareProject payload`;
      }
    }

    const { projectData } = payload;
    const requiredProjectData: Array<keyof ShareProjectData> = [
      'version',
      'name',
      'created',
      'modified',
      'patterns',
      'playlist',
    ];

    for (const key of requiredProjectData) {
      if (projectData[key] === undefined || projectData[key] === null) {
        return `Missing projectData.${key} in shareProject payload`;
      }
    }

    return null;
  }

  private forwardShareEvent(
    eventType: EVENT_TYPE.SHARE_PROJECT | EVENT_TYPE.SHARE_PROJECT_UPDATE,
    payload: ShareProjectPayload,
  ): boolean {
    const recipientClients = this.userConnections.get(payload.recipientId);
    if (!recipientClients || recipientClients.size === 0) {
      this.queueShareMessage(
        payload.recipientId,
        eventType === EVENT_TYPE.SHARE_PROJECT ? 'share' : 'update',
        payload,
      );
      return false;
    }

    const message = JSON.stringify({
      event: eventType,
      data: payload,
    });

    let delivered = false;
    recipientClients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(message);
        delivered = true;
      }
    });

    if (!delivered) {
      this.queueShareMessage(
        payload.recipientId,
        eventType === EVENT_TYPE.SHARE_PROJECT ? 'share' : 'update',
        payload,
      );
    }

    return delivered;
  }

  private queueShareMessage(
    recipientId: string,
    type: ShareQueueType,
    payload: ShareProjectPayload,
  ) {
    if (!this.pendingMessages.has(recipientId)) {
      this.pendingMessages.set(recipientId, []);
    }

    this.pendingMessages.get(recipientId)?.push({
      type,
      payload,
      queuedAt: Date.now(),
    });

    console.warn(
      `[SyncGateway] Recipient ${recipientId} offline. Queued ${type} payload (total ${
        this.pendingMessages.get(recipientId)?.length ?? 0
      }).`,
    );
  }

  private flushQueuedMessages(userId: string) {
    const queue = this.pendingMessages.get(userId);
    if (!queue || queue.length === 0) {
      return;
    }

    const clients = this.userConnections.get(userId);
    if (!clients || clients.size === 0) {
      return;
    }

    console.log(`[SyncGateway] Flushing ${queue.length} queued messages for ${userId}`);
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        break;
      }

      const eventType =
        item.type === 'share'
          ? EVENT_TYPE.SHARE_PROJECT
          : EVENT_TYPE.SHARE_PROJECT_UPDATE;

      const message = JSON.stringify({
        event: eventType,
        data: item.payload,
        queuedAt: item.queuedAt,
      });

      clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      });
    }

    this.pendingMessages.delete(userId);
  }

  private sendJson(client: WebSocket, payload: Record<string, unknown>) {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }

  private handleUndo(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { projectId, userId, actionId, actionType, actionData, reverseData } = payload;
      
      if (!projectId || !userId) {
        console.warn('⚠️ Undo payload missing projectId or userId', payload);
        return;
      }
      
      console.log(
        `[SyncGateway] Undo action received: projectId=${projectId}, userId=${userId}, actionType=${actionType}`,
      );
      
      // Broadcast undo action to all users in the project room
      if (this.rooms[projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.UNDO,
          data: {
            projectId,
            userId,
            actionId,
            actionType,
            actionData,
            reverseData,
          },
        });
        
        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });
        
        console.log(
          `[SyncGateway] Undo action broadcasted to ${deliveredCount} users in project: ${projectId}`,
        );
      } else {
        console.warn(`[SyncGateway] Undo: Project room ${projectId} not found`);
      }
    } catch (error) {
      console.error('❌ Failed to process undo action', error);
    }
  }

  private handleMarkerAdded(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { projectId, userId, marker } = payload;
      
      if (!projectId || !userId || !marker) {
        console.warn('⚠️ Marker added payload missing required fields', payload);
        return;
      }
      
      console.log(
        `[SyncGateway] Marker added: projectId=${projectId}, userId=${userId}, markerName=${marker.name}`,
      );
      
      // Broadcast marker added to all users in the project room
      if (this.rooms[projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.MARKER_ADDED,
          data: {
            projectId,
            userId,
            marker,
          },
        });
        
        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });
        
        console.log(
          `[SyncGateway] Marker added broadcasted to ${deliveredCount} users in project: ${projectId}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to handle marker added:', error);
    }
  }

  private handleMarkerUpdated(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { projectId, userId, markerIndex, marker } = payload;
      
      if (!projectId || !userId || markerIndex === undefined || !marker) {
        console.warn('⚠️ Marker updated payload missing required fields', payload);
        return;
      }
      
      console.log(
        `[SyncGateway] Marker updated: projectId=${projectId}, userId=${userId}, markerIndex=${markerIndex}`,
      );
      
      // Broadcast marker updated to all users in the project room
      if (this.rooms[projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.MARKER_UPDATED,
          data: {
            projectId,
            userId,
            markerIndex,
            marker,
          },
        });
        
        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });
        
        console.log(
          `[SyncGateway] Marker updated broadcasted to ${deliveredCount} users in project: ${projectId}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to handle marker updated:', error);
    }
  }

  private handleMarkerDeleted(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { projectId, userId, markerIndex } = payload;
      
      if (!projectId || !userId || markerIndex === undefined) {
        console.warn('⚠️ Marker deleted payload missing required fields', payload);
        return;
      }
      
      console.log(
        `[SyncGateway] Marker deleted: projectId=${projectId}, userId=${userId}, markerIndex=${markerIndex}`,
      );
      
      // Broadcast marker deleted to all users in the project room
      if (this.rooms[projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.MARKER_DELETED,
          data: {
            projectId,
            userId,
            markerIndex,
          },
        });
        
        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });
        
        console.log(
          `[SyncGateway] Marker deleted broadcasted to ${deliveredCount} users in project: ${projectId}`,
        );
      }
    } catch (error) {
      console.error('❌ Failed to handle marker deleted:', error);
    }
  }

  private async handleLockRequest(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { itemId, itemType, userId, username, projectId } = payload;

      if (!itemId || !itemType || !userId || !projectId) {
        console.warn('[SyncGateway] Invalid lock request payload');
        this.sendJson(client, {
          event: EVENT_TYPE.ERROR,
          message: 'Invalid lock request: missing required fields',
        });
        return;
      }

      console.log(
        `[SyncGateway] Lock request: itemId=${itemId}, itemType=${itemType}, userId=${userId}, projectId=${projectId}`,
      );

      // Attempt to acquire lock
      const result = await this.lockQueueService.acquireLock(
        itemId,
        itemType,
        userId,
        username || userId,
        projectId,
      );

      if (result.success) {
        // Lock acquired - notify requester
        this.sendJson(client, {
          event: EVENT_TYPE.LOCK_ACQUIRED,
          data: {
            itemId,
            itemType,
            projectId,
            lockExpiresAt: result.lockExpiresAt,
          },
        });

        // Notify other users in the project that item is now locked
        if (this.rooms[projectId]) {
          const message = JSON.stringify({
            event: EVENT_TYPE.LOCK_ACQUIRED,
            data: {
              itemId,
              itemType,
              lockedBy: username || userId,
              projectId,
              lockExpiresAt: result.lockExpiresAt,
            },
          });

          this.rooms[projectId].forEach((roomClient) => {
            if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
              roomClient.send(message);
            }
          });
        }
      } else {
        // Lock denied - item is already locked
        this.sendJson(client, {
          event: EVENT_TYPE.LOCK_DENIED,
          data: {
            itemId,
            itemType,
            projectId,
            lockedBy: result.lockedBy,
            lockExpiresAt: result.lockExpiresAt,
          },
        });

        // Queue the edit if there's edit data in the payload
        if (payload.editData) {
          const queuePosition = this.lockQueueService.queueEdit(
            itemId,
            itemType,
            userId,
            username || userId,
            payload.editData,
            projectId,
            payload.priority || 0,
          );

          this.sendJson(client, {
            event: EVENT_TYPE.EDIT_QUEUED,
            data: {
              itemId,
              itemType,
              projectId,
              queuePosition,
            },
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to handle lock request:', error);
      this.sendJson(client, {
        event: EVENT_TYPE.ERROR,
        message: 'Failed to process lock request',
      });
    }
  }

  private async handleLockReleased(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { itemId, userId, projectId } = payload;

      if (!itemId || !userId || !projectId) {
        console.warn('[SyncGateway] Invalid lock release payload');
        return;
      }

      console.log(
        `[SyncGateway] Lock release: itemId=${itemId}, userId=${userId}, projectId=${projectId}`,
      );

      // Release the lock
      const released = await this.lockQueueService.releaseLock(
        itemId,
        projectId,
        userId,
      );

      if (released) {
        // Notify all users in the project
        if (this.rooms[projectId]) {
          const message = JSON.stringify({
            event: EVENT_TYPE.LOCK_RELEASED,
            data: {
              itemId,
              projectId,
              releasedBy: userId,
            },
          });

          this.rooms[projectId].forEach((roomClient) => {
            if (roomClient.readyState === roomClient.OPEN) {
              roomClient.send(message);
            }
          });

          // Process queued edits and notify users
          const processedEdits = await this.lockQueueService.processQueuedEdits(itemId, projectId);
          if (processedEdits.length > 0) {
            // Notify users that their edits can now be processed
            for (let i = 0; i < processedEdits.length; i++) {
              const edit = processedEdits[i];
              const userClients = this.userConnections.get(edit.userId);
              if (userClients) {
                const editMessage = JSON.stringify({
                  event: EVENT_TYPE.EDIT_QUEUED,
                  data: {
                    itemId,
                    itemType: edit.itemType,
                    projectId,
                    queuePosition: i, // Position in processed queue
                    canProcess: true,
                    editData: edit.editData, // Include edit data so it can be applied
                  },
                });

                userClients.forEach((editClient) => {
                  if (editClient.readyState === editClient.OPEN) {
                    editClient.send(editMessage);
                  }
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to handle lock release:', error);
    }
  }

  private handleRedo(client: WebSocket, data: any) {
    try {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const { projectId, userId, actionId, actionType, actionData, reverseData } = payload;
      
      if (!projectId || !userId) {
        console.warn('⚠️ Redo payload missing projectId or userId', payload);
        return;
      }
      
      console.log(
        `[SyncGateway] Redo action received: projectId=${projectId}, userId=${userId}, actionType=${actionType}`,
      );
      
      // Broadcast redo action to all users in the project room
      if (this.rooms[projectId]) {
        const message = JSON.stringify({
          event: EVENT_TYPE.REDO,
          data: {
            projectId,
            userId,
            actionId,
            actionType,
            actionData,
            reverseData,
          },
        });
        
        let deliveredCount = 0;
        this.rooms[projectId].forEach((roomClient) => {
          // Don't send back to the sender
          if (roomClient !== client && roomClient.readyState === roomClient.OPEN) {
            roomClient.send(message);
            deliveredCount++;
          }
        });
        
        console.log(
          `[SyncGateway] Redo action broadcasted to ${deliveredCount} users in project: ${projectId}`,
        );
      } else {
        console.warn(`[SyncGateway] Redo: Project room ${projectId} not found`);
      }
    } catch (error) {
      console.error('❌ Failed to process redo action', error);
    }
  }
}
