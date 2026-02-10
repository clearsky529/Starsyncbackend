import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@app/services/jwt.service';

interface SubscriptionMessage {
  type: string;
  channel: 'friendRequests' | 'projectInvitations';
  token: string;
  userId: string;
}

interface UserSubscription {
  userId: string;
  channels: Set<string>;
  socket: Socket;
}

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: '*',
  },
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSubscriptions: Map<string, UserSubscription> = new Map(); // socketId -> subscription
  private userSockets: Map<string, Set<Socket>> = new Map(); // userId -> Set of sockets

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('✅ NotificationGateway initialized');
    this.logger.log('✅ Namespace: /ws');
    this.logger.log('✅ Ready to accept connections on ws://localhost:3500/ws');
    
    // Add error handlers - check if engine exists first
    if (server.engine) {
      server.engine.on('connection_error', (err) => {
        this.logger.error(`❌ Socket.IO connection error: ${err.message}`);
        if (err.context) {
          this.logger.error(`   - Context: ${JSON.stringify(err.context)}`);
        }
      });
    }
    
    // Server-level error handler
    server.on('connection_error', (err) => {
      this.logger.error(`❌ Socket.IO server connection error: ${err.message}`);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`✅ New client connected: ${client.id}`);
    this.logger.log(`   - Transport: ${client.conn.transport.name}`);
    this.logger.log(`   - Namespace: ${client.nsp.name}`);
    this.logger.log(`   - Query params: ${JSON.stringify(client.handshake.query)}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);
    const subscription = this.userSubscriptions.get(client.id);
    if (subscription) {
      this.logger.log(`   - Removing subscription for userId: ${subscription.userId}`);
      const userSockets = this.userSockets.get(subscription.userId);
      if (userSockets) {
        userSockets.delete(client);
        if (userSockets.size === 0) {
          this.userSockets.delete(subscription.userId);
        }
      }
      this.userSubscriptions.delete(client.id);
    } else {
      this.logger.log(`   - No subscription found for disconnected client`);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SubscriptionMessage,
  ) {
    try {
      this.logger.log(
        `Subscription request: channel=${message.channel}, userId=${message.userId}`,
      );

      // Validate token
      if (!message.token) {
        client.emit('error', {
          type: 'error',
          message: 'Token is required',
        });
        return;
      }

      const user = this.jwtService.verify(message.token);
      if (!user || user.user_id !== message.userId) {
        client.emit('error', {
          type: 'error',
          message: 'Invalid token or userId mismatch',
        });
        return;
      }

      // Get or create subscription
      let subscription = this.userSubscriptions.get(client.id);
      if (!subscription) {
        subscription = {
          userId: message.userId,
          channels: new Set(),
          socket: client,
        };
        this.userSubscriptions.set(client.id, subscription);

        // Add to user sockets map
        if (!this.userSockets.has(message.userId)) {
          this.userSockets.set(message.userId, new Set());
        }
        this.userSockets.get(message.userId)!.add(client);
      }

      // Add channel to subscription
      subscription.channels.add(message.channel);

      this.logger.log(
        `Subscription successful: userId=${message.userId}, channel=${message.channel}`,
      );

      client.emit('subscribed', {
        type: 'subscribed',
        channel: message.channel,
        userId: message.userId,
      });
    } catch (error) {
      this.logger.error('Error handling subscription', error);
      client.emit('error', {
        type: 'error',
        message: 'Failed to subscribe',
      });
    }
  }

  /**
   * Handle custom subscription format from frontend (subscribeProjectInvitations)
   * This allows the frontend to use a simpler subscription format
   */
  @SubscribeMessage('subscribeProjectInvitations')
  async handleSubscribeProjectInvitations(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: { userId: string; token?: string },
  ) {
    this.logger.log(
      `Custom subscription request (subscribeProjectInvitations): userId=${message.userId}, token=${message.token ? 'present' : 'missing'}`,
    );

    // Convert to standard subscription format
    const subscriptionMessage: SubscriptionMessage = {
      type: 'subscribe',
      channel: 'projectInvitations',
      token: message.token || '',
      userId: message.userId,
    };

    // Call the standard subscription handler
    try {
      await this.handleSubscribe(client, subscriptionMessage);
      this.logger.log(`✓ Subscription completed for userId=${message.userId}, channel=projectInvitations`);
    } catch (error) {
      this.logger.error(`✗ Subscription failed for userId=${message.userId}:`, error);
      throw error; // Re-throw to let Socket.IO handle it
    }
  }

  /**
   * Handle custom subscription format for friend requests
   */
  @SubscribeMessage('subscribeFriendRequests')
  async handleSubscribeFriendRequests(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: { userId: string; token?: string },
  ) {
    this.logger.log(
      `Custom subscription request (subscribeFriendRequests): userId=${message.userId}`,
    );

    // Convert to standard subscription format
    const subscriptionMessage: SubscriptionMessage = {
      type: 'subscribe',
      channel: 'friendRequests',
      token: message.token || '',
      userId: message.userId,
    };

    // Call the standard subscription handler
    return this.handleSubscribe(client, subscriptionMessage);
  }

  /**
   * Send friend request received notification
   */
  sendFriendRequestReceived(userId: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.warn(`No active sockets for user: ${userId}`);
      return;
    }

    const message = {
      type: 'friendRequestReceived',
      data: {
        id: data.id,
        sender: {
          id: data.sender.id,
          username: data.sender.username,
          email: data.sender.email,
        },
        receiver: {
          id: data.receiver.id,
          username: data.receiver.username,
          email: data.receiver.email,
        },
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };

    sockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      if (subscription && subscription.channels.has('friendRequests')) {
        socket.emit('friendRequestReceived', message);
        this.logger.log(`Sent friendRequestReceived to user: ${userId}`);
      }
    });
  }

  /**
   * Send friend request status changed notification
   */
  sendFriendRequestStatusChanged(userId: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.warn(`No active sockets for user: ${userId}`);
      return;
    }

    const message = {
      type: 'friendRequestStatusChanged',
      data: {
        id: data.id,
        sender: {
          id: data.sender.id,
          username: data.sender.username,
        },
        receiver: {
          id: data.receiver.id,
          username: data.receiver.username,
        },
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };

    sockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      if (subscription && subscription.channels.has('friendRequests')) {
        socket.emit('friendRequestStatusChanged', message);
        this.logger.log(`Sent friendRequestStatusChanged to user: ${userId}`);
      }
    });
  }

  /**
   * Send project invitation received notification
   */
  sendProjectInvitationReceived(userId: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.warn(`No active sockets for user: ${userId}`);
      return;
    }

    this.logger.log(`Attempting to send projectInvitationReceived to user: ${userId}, socket count: ${sockets.size}`);
    this.logger.log(`Invitation data: projectId=${data.projectId}, projectName=${data.projectName}, inviteeId=${data.inviteeId}`);

    const message = {
      type: 'projectInvitationReceived',
      data: {
        id: data.id,
        projectId: data.projectId,
        projectName: data.projectName,
        inviter: {
          id: data.inviter.id,
          username: data.inviter.username,
          email: data.inviter.email,
        },
        invitee: {
          id: data.invitee.id,
          username: data.invitee.username,
          email: data.invitee.email,
        },
        role: this.formatRole(data.role),
        message: data.message || null,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };

    this.logger.log(`Prepared notification message for user ${userId}`);

    let sentCount = 0;
    sockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      this.logger.log(`Checking socket ${socket.id} for user ${userId}: hasSubscription=${!!subscription}, channels=${subscription ? Array.from(subscription.channels).join(',') : 'none'}`);
      
      if (subscription && subscription.channels.has('projectInvitations')) {
        socket.emit('projectInvitationReceived', message);
        sentCount++;
        this.logger.log(`✓ Sent projectInvitationReceived to user: ${userId}, socket: ${socket.id}`);
      } else {
        this.logger.warn(`✗ Socket ${socket.id} for user ${userId} not subscribed to projectInvitations. Has subscription: ${!!subscription}, channels: ${subscription ? Array.from(subscription.channels).join(',') : 'none'}`);
      }
    });
    
    if (sentCount === 0) {
      this.logger.error(`✗✗✗ FAILED to send projectInvitationReceived to user: ${userId} - no subscribed sockets`);
    } else {
      this.logger.log(`✓✓✓ Successfully sent projectInvitationReceived to ${sentCount} socket(s) for user: ${userId}`);
    }
  }

  /**
   * Send project invitation status changed notification
   */
  sendProjectInvitationStatusChanged(userId: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.warn(`No active sockets for user: ${userId}`);
      return;
    }

    const message = {
      type: 'projectInvitationStatusChanged',
      data: {
        id: data.id,
        projectId: data.projectId,
        projectName: data.projectName,
        inviter: {
          id: data.inviter.id,
          username: data.inviter.username,
        },
        invitee: {
          id: data.invitee.id,
          username: data.invitee.username,
        },
        role: this.formatRole(data.role),
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };

    sockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      if (subscription && subscription.channels.has('projectInvitations')) {
        socket.emit('projectInvitationStatusChanged', message);
        this.logger.log(`Sent projectInvitationStatusChanged to user: ${userId}`);
      }
    });
  }

  /**
   * Format role from enum to string format (Owner, Editor, Viewer, Commenter)
   */
  private formatRole(role: string): string {
    const roleMap: Record<string, string> = {
      owner: 'Owner',
      editor: 'Editor',
      viewer: 'Viewer',
      commenter: 'Commenter',
    };
    return roleMap[role.toLowerCase()] || role;
  }

  /**
   * Emit pattern comment created event to all project subscribers
   */
  emitPatternCommentCreated(projectId: string, comment: any) {
    // Get all users who have access to this project
    // We'll emit to all sockets and let the frontend filter by project subscription
    const allSockets = Array.from(this.userSubscriptions.values()).map(
      (sub) => sub.socket,
    );

    const message = {
      type: 'patternCommentCreated',
      data: comment,
    };

    allSockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      if (subscription && subscription.channels.has('projectInvitations')) {
        socket.emit('patternCommentCreated', message);
      }
    });

    this.logger.log(
      `Emitted patternCommentCreated for project ${projectId} to ${allSockets.length} subscribers`,
    );
  }

  /**
   * Emit pattern comment deleted event
   */
  emitPatternCommentDeleted(projectId: string, commentId: string) {
    const allSockets = Array.from(this.userSubscriptions.values()).map(
      (sub) => sub.socket,
    );

    const message = {
      type: 'patternCommentDeleted',
      data: { commentId, projectId },
    };

    allSockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      if (subscription && subscription.channels.has('projectInvitations')) {
        socket.emit('patternCommentDeleted', message);
      }
    });

    this.logger.log(
      `Emitted patternCommentDeleted for project ${projectId}, comment ${commentId}`,
    );
  }

  /**
   * Emit pattern comment updated event to all project subscribers
   */
  emitPatternCommentUpdated(projectId: string, comment: any) {
    // Get all users who have access to this project
    // We'll emit to all sockets and let the frontend filter by project subscription
    const allSockets = Array.from(this.userSubscriptions.values()).map(
      (sub) => sub.socket,
    );

    const message = {
      type: 'patternCommentUpdated',
      data: comment,
    };

    allSockets.forEach((socket) => {
      const subscription = this.userSubscriptions.get(socket.id);
      if (subscription && subscription.channels.has('projectInvitations')) {
        socket.emit('patternCommentUpdated', message);
      }
    });

    this.logger.log(
      `Emitted patternCommentUpdated for project ${projectId} to ${allSockets.length} subscribers`,
    );
  }
}

