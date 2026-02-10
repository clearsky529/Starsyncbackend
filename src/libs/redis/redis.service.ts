import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigModule } from '@nestjs/config';
import redis from '@app/config/database.config';

const configs = [redis];

ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  load: configs,
  envFilePath: '.env',
});

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  getContentKey(key: string): string {
    return `StarSync-Content-${key}`;
  }

  getHistoryKey(key: string): string {
    return `StarSync-History-${key}`;
  }

  // Set (Set)
  async setItem(key: string, value: string): Promise<string> {
    return await this.client.set(key, value);
  }

  async addItem(key: string, value: any): Promise<string> {
    const data = (await this.client.get(key)) || '[]';
    const arr = JSON.parse(data) || [];
    arr.push(value);
    return await this.client.set(key, JSON.stringify(arr));
  }

  // Read (Get)
  async getItem(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  // Update (Same as add since set command overwrites)
  async updateItem(key: string, value: string): Promise<string> {
    return await this.client.set(key, value);
  }

  // Delete
  async deleteItem(key: string): Promise<number> {
    return await this.client.del(key);
  }

  // Query (Get multiple keys by pattern)
  async queryKeys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }
}
