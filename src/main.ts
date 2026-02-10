import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
// import { WsAdapter } from './socket/WsAdapter';
// import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  console.log('🔧 Setting up Socket.IO adapter...');
  app.useWebSocketAdapter(new IoAdapter(app));
  
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  
  console.log('🚀 Server starting on port 3500');
  await app.listen(3500);
  console.log('✅ Server is running on http://localhost:3500');
  console.log('✅ Socket.IO should be available at ws://localhost:3500/socket.io/');
  console.log('✅ Chat namespace should be available at ws://localhost:3500/chat/socket.io/');
}
bootstrap();

