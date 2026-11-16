import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(this.configService.get<number>('REDIS_PORT')) || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        this.logger.warn(`Redis disconnected, retrying connection (attempt #${times}) in ${delay}ms...`);
        return delay;
      },
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Failed initial connection to Redis (${err.message}). Background reconnect will keep trying.`);
    });
  }

  private throwUnavailable(errorMsg?: string): never {
    const message = this.i18n.t('auth.REDIS_UNAVAILABLE') || 'Authentication service temporarily unavailable';
    this.logger.error(`Redis operation failed: ${errorMsg || 'Client not ready'}`);
    throw new ServiceUnavailableException(message);
  }

  async blacklistToken(jti: string, expiresInSeconds: number): Promise<void> {
    if (expiresInSeconds <= 0) {
      return;
    }

    try {
      if (!this.client || this.client.status !== 'ready') {
        this.throwUnavailable('Redis is not ready for blacklist write');
      }
      await this.client.set(`blacklist:${jti}`, 'true', 'EX', expiresInSeconds);
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.throwUnavailable(err.message);
    }
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      if (!this.client || this.client.status !== 'ready') {
        this.throwUnavailable('Redis is not ready for blacklist read');
      }
      const result = await this.client.get(`blacklist:${jti}`);
      return result !== null;
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.throwUnavailable(err.message);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }
}
