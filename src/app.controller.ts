import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        http: 'running',
        websocket: 'running',
        chat_socket: 'running on /chat namespace'
      }
    };
  }

  @Get('socket-info')
  getSocketInfo() {
    return {
      chat_socket: {
        url: 'ws://localhost:3500/chat',
        namespace: '/chat',
        events: ['joinRoom', 'leaveRoom', 'sendMessage'],
        status: 'active'
      }
    };
  }
}
