import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private rooms: Map<string, Set<string>> = new Map();
  
  // CRITICAL FIX: Track connected users by userId for direct notifications
  // Store actual Socket objects (not just IDs) to enable direct notification sending
  private userClients: Map<string, Set<Socket>> = new Map(); // userId -> Set<Socket>
  private clientUsers: Map<string, string> = new Map(); // socketId -> userId

  constructor(private readonly chatService: ChatService) {
    console.log('🚀 CHAT SOCKET: ChatGateway constructor called!');
    console.log('🚀 CHAT SOCKET: Gateway is being initialized...');
  }

  afterInit(server: Server) {
    console.log('🔗 CHAT SOCKET: ================================================');
    console.log('🔗 CHAT SOCKET: ✅ CHAT SOCKET IS NOW RUNNING!');
    console.log('🔗 CHAT SOCKET: ✅ Namespace: /chat');
    console.log('🔗 CHAT SOCKET: ✅ Server initialized successfully');
    console.log('🔗 CHAT SOCKET: ✅ Ready to accept connections on ws://localhost:3500/chat');
    console.log('🔗 CHAT SOCKET: ================================================');
  }

  handleConnection(client: Socket) {
    console.log('='.repeat(50));
    console.log('🔗 CHAT SOCKET: NEW CLIENT CONNECTED!');
    console.log(`🔗 CHAT SOCKET: Client ID: ${client.id}`);
    console.log(`🔗 CHAT SOCKET: Client IP: ${client.handshake.address}`);
    console.log(`🔗 CHAT SOCKET: Namespace: ${client.nsp.name}`);
    console.log(`🔗 CHAT SOCKET: Headers: ${JSON.stringify(client.handshake.headers)}`);
    
    // Add error handling for the client
    client.on('error', (error) => {
      console.log('🔗 CHAT SOCKET: ❌ Client error:', error);
    });
    
    client.on('disconnect', (reason) => {
      console.log(`🔗 CHAT SOCKET: ❌ Client disconnecting: ${reason}`);
    });
    
    console.log('='.repeat(50));
  }

  handleDisconnect(client: Socket) {
    console.log('='.repeat(50));
    console.log('🔗 CHAT SOCKET: CLIENT DISCONNECTED!');
    console.log(`🔗 CHAT SOCKET: Client ID: ${client.id}`);
    this.rooms.forEach((clients, room) => clients.delete(client.id));
    console.log(`🔗 CHAT SOCKET: Removed client from all rooms`);
    
    // Clean up user tracking - remove actual client object
    const userId = this.clientUsers.get(client.id);
    if (userId) {
      this.clientUsers.delete(client.id);
      const userClientSet = this.userClients.get(userId);
      if (userClientSet) {
        userClientSet.delete(client);
        if (userClientSet.size === 0) {
          this.userClients.delete(userId);
        }
      }
      console.log(`🔗 CHAT SOCKET: Unregistered user ${userId} from socket ${client.id}`);
    }
    console.log('='.repeat(50));
  }

  // CRITICAL FIX: Register user with their socket for direct notifications
  @SubscribeMessage('registerChatUser')
  handleRegisterUser(client: Socket, data: { userId: string }) {
    try {
      console.log('🔗 CHAT SOCKET: ========== REGISTER USER EVENT ==========');
      console.log(`🔗 CHAT SOCKET: Raw data received: ${JSON.stringify(data)}`);
      console.log(`🔗 CHAT SOCKET: Client ID: ${client.id}`);
      
      const userId = typeof data === 'object' ? data.userId : data;
      if (!userId) {
        console.log('🔗 CHAT SOCKET: ❌ registerChatUser: Missing userId');
        return;
      }
      
      console.log(`🔗 CHAT SOCKET: Registering user ${userId} with socket ${client.id}`);
      
      // Track clientId -> userId
      this.clientUsers.set(client.id, userId);
      
      // Track userId -> actual client objects (user might have multiple connections)
      if (!this.userClients.has(userId)) {
        this.userClients.set(userId, new Set());
      }
      this.userClients.get(userId)?.add(client);
      
      console.log(`🔗 CHAT SOCKET: ✅ User ${userId} registered successfully!`);
      console.log(`🔗 CHAT SOCKET: ✅ User has ${this.userClients.get(userId)?.size} active connection(s)`);
      console.log(`🔗 CHAT SOCKET: ✅ Total registered users: ${this.userClients.size}`);
      console.log('🔗 CHAT SOCKET: ==========================================');
      
      client.emit('registerChatUserAck', { status: 'ok', userId });
    } catch (error) {
      console.log('🔗 CHAT SOCKET: ❌ ERROR in registerChatUser:', error);
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(client: Socket, room: string) {
    try {
      console.log('='.repeat(50));
      console.log('🔗 CHAT SOCKET: JOIN ROOM EVENT RECEIVED!');
      console.log(`🔗 CHAT SOCKET: Client ID: ${client.id}`);
      console.log(`🔗 CHAT SOCKET: Room: ${room}`);
      console.log(`🔗 CHAT SOCKET: Room type: ${typeof room}`);
      
      client.join(room);
      if (!this.rooms.has(room)) {
        this.rooms.set(room, new Set());
        console.log(`🔗 CHAT SOCKET: ✅ Created new room: ${room}`);
      }
      
      this.rooms.get(room)?.add(client.id);
      console.log(`🔗 CHAT SOCKET: Room ${room} now has ${this.rooms.get(room)?.size} clients`);
      this.server.to(room).emit('userJoined', { clientId: client.id });
      console.log('🔗 CHAT SOCKET: ✅ Join room successful');
      console.log('='.repeat(50));
    } catch (error) {
      console.log('🔗 CHAT SOCKET: ❌ ERROR in joinRoom:', error);
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(client: Socket, room: string) {
    console.log(`🔗 CHAT SOCKET: Client ${client.id} leaving room: ${room}`);
    client.leave(room);
    this.rooms.get(room)?.delete(client.id);
    this.server.to(room).emit('userLeft', { clientId: client.id });
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: { room: string; senderId: string; message: string },
  ) {
    try {
      console.log('='.repeat(50));
      console.log('🔗 CHAT SOCKET: SEND MESSAGE EVENT RECEIVED!');
      console.log(`🔗 CHAT SOCKET: Data received: ${JSON.stringify(data)}`);
      console.log(`🔗 CHAT SOCKET: Data type: ${typeof data}`);
      
      if (!data) {
        console.log('🔗 CHAT SOCKET: ❌ No data received!');
        return;
      }
      
      const { room, senderId, message } = data;
      console.log(`🔗 CHAT SOCKET: Room: ${room}`);
      console.log(`🔗 CHAT SOCKET: Sender ID: ${senderId}`);
      console.log(`🔗 CHAT SOCKET: Message: "${message}"`);
      
      if (!room || !senderId || !message) {
        console.log('🔗 CHAT SOCKET: ❌ Missing room, senderId, or message!');
        return;
      }
      
      // Save message to database
      const savedMessage = await this.chatService.saveMessage(room, senderId, message);
      console.log(`🔗 CHAT SOCKET: ✅ Message saved to database with ID: ${savedMessage.id}`);
      
      // Get the full message with sender information for broadcasting
      const messageWithSender = await this.chatService.getMessageWithSender(savedMessage.id);
      
      if (!messageWithSender) {
        console.log('🔗 CHAT SOCKET: ❌ Could not find message with sender info');
        return;
      }
      
      // Broadcast message to room with complete metadata
      const messageData = {
        id: messageWithSender.id,
        room: messageWithSender.room,
        sender_id: messageWithSender.sender_id,
        message: messageWithSender.message,
        created_at: messageWithSender.created_at,
        sender: messageWithSender.sender,
      };
      
      console.log(`🔗 CHAT SOCKET: Broadcasting 'newMessage' to room ${room}`);
      this.server.to(room).emit('newMessage', messageData);
      console.log('🔗 CHAT SOCKET: ✅ Message broadcasted successfully!');
      
      // CRITICAL FIX: ALWAYS send direct notification to recipient
      // This ensures ALL messages trigger notification badges, including the VERY FIRST message
      const roomParts = room.split('_');
      console.log(`🔗 CHAT SOCKET: Room parts: ${JSON.stringify(roomParts)}, senderId: ${senderId}`);
      
      if (roomParts.length === 2) {
        // Determine recipient (the user who is NOT the sender)
        const recipientId = roomParts[0] === senderId ? roomParts[1] : roomParts[0];
        console.log(`🔗 CHAT SOCKET: Recipient ID determined: ${recipientId}`);
        console.log(`🔗 CHAT SOCKET: Currently registered users: ${Array.from(this.userClients.keys()).join(', ')}`);
        
        // Send direct notification using stored client objects (not by looking up socket IDs)
        const recipientClients = this.userClients.get(recipientId);
        
        if (recipientClients && recipientClients.size > 0) {
          console.log(`🔗 CHAT SOCKET: ✅ Found ${recipientClients.size} connection(s) for recipient ${recipientId}`);
          
          recipientClients.forEach(recipientClient => {
            try {
              console.log(`🔗 CHAT SOCKET: 📬 Sending 'newMessageNotification' to ${recipientId}`);
              recipientClient.emit('newMessageNotification', {
                ...messageData,
                isDirectNotification: true,
              });
              console.log(`🔗 CHAT SOCKET: ✅ Notification sent successfully!`);
            } catch (emitError) {
              console.log(`🔗 CHAT SOCKET: ⚠️ Error emitting to client: ${emitError}`);
            }
          });
        } else {
          console.log(`🔗 CHAT SOCKET: ⚠️ Recipient ${recipientId} not found in userClients map (not online or not registered)`);
        }
      } else {
        console.log(`🔗 CHAT SOCKET: ⚠️ Room format invalid, cannot determine recipient`);
      }
      
      console.log('='.repeat(50));
    } catch (error) {
      console.log('🔗 CHAT SOCKET: ❌ ERROR in sendMessage:', error);
      console.log('🔗 CHAT SOCKET: ❌ Error stack:', error.stack);
    }
  }

  /**
   * Helper method to normalize room name
   * Ensures user1_user2 and user2_user1 use the same room
   */
  @SubscribeMessage('joinRoomBetweenUsers')
  handleJoinRoomBetweenUsers(
    client: Socket, 
    data: { userId1: string; userId2: string }
  ) {
    try {
      console.log('='.repeat(50));
      console.log('🔗 CHAT SOCKET: JOIN ROOM BETWEEN USERS EVENT RECEIVED!');
      console.log(`🔗 CHAT SOCKET: Client ID: ${client.id}`);
      console.log(`🔗 CHAT SOCKET: User 1: ${data.userId1}`);
      console.log(`🔗 CHAT SOCKET: User 2: ${data.userId2}`);
      
      const normalizedRoom = this.chatService.normalizeRoom(data.userId1, data.userId2);
      console.log(`🔗 CHAT SOCKET: Normalized room name: ${normalizedRoom}`);
      
      client.join(normalizedRoom);
      if (!this.rooms.has(normalizedRoom)) {
        this.rooms.set(normalizedRoom, new Set());
        console.log(`🔗 CHAT SOCKET: ✅ Created new room: ${normalizedRoom}`);
      }
      
      this.rooms.get(normalizedRoom)?.add(client.id);
      console.log(`🔗 CHAT SOCKET: Room ${normalizedRoom} now has ${this.rooms.get(normalizedRoom)?.size} clients`);
      this.server.to(normalizedRoom).emit('userJoined', { 
        clientId: client.id, 
        room: normalizedRoom 
      });
      console.log('🔗 CHAT SOCKET: ✅ Join room successful');
      console.log('='.repeat(50));
      
      return { room: normalizedRoom };
    } catch (error) {
      console.log('🔗 CHAT SOCKET: ❌ ERROR in joinRoomBetweenUsers:', error);
    }
  }
}