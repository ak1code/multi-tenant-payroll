import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import Redis from 'ioredis';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  async health() {
    const mongodb = await this.checkMongo();
    const redis = await this.checkRedis();
    const status =
      mongodb === 'connected' && redis === 'connected' ? 'ok' : 'degraded';

    return { status, mongodb, redis };
  }

  private async checkMongo(): Promise<string> {
    try {
      if (this.connection.readyState !== 1) {
        return 'disconnected';
      }
      await this.connection.db!.admin().ping();
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<string> {
    const host = this.configService.get<string>('redis.host') ?? 'localhost';
    const port = this.configService.get<number>('redis.port') ?? 6379;

    const client = new Redis({
      host,
      port,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    try {
      await client.connect();
      const result = await client.ping();
      return result === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    } finally {
      client.disconnect();
    }
  }
}
