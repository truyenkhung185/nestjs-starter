import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(this.configService.get<number>('REDIS_PORT')) || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis connection retry limit reached. Redis disabled temporarily.');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Failed to connect to Redis (${err.message}). In-memory fallback/graceful degrade will apply.`);
    });
  }

  async blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
    try {
      if (this.client && this.client.status === 'ready') {
        await this.client.set(`blacklist:${token}`, 'true', 'EX', expiresInSeconds);
      }
    } catch (err: any) {
      this.logger.error(`Error blacklisting token in Redis: ${err.message}`);
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      if (this.client && this.client.status === 'ready') {
        const result = await this.client.get(`blacklist:${token}`);
        return result !== null;
      }
    } catch (err: any) {
      this.logger.error(`Error checking token blacklist in Redis: ${err.message}`);
    }
    return false;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }
}
