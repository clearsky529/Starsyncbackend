// chat.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatMessage } from '@app/entities/chat-message.entity';
import { ChatReadReceipt } from '@app/entities/chat-read-receipt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, ChatReadReceipt])],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule implements OnModuleInit {
  constructor() {
    console.log('🚀 CHAT SOCKET: ChatModule constructor called!');
    console.log('🚀 CHAT SOCKET: ChatModule is being initialized...');
  }
  
  onModuleInit() {
    console.log('🚀 CHAT SOCKET: ChatModule initialized successfully!');
  }
}
