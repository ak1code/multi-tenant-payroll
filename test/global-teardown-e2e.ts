import { MongoMemoryServer } from 'mongodb-memory-server';
import RedisMemoryServer from 'redis-memory-server';

export default async function globalTeardown(): Promise<void> {
  const mongod = (global as typeof globalThis & { __MONGOD__?: MongoMemoryServer }).__MONGOD__;
  if (mongod) {
    await mongod.stop();
  }

  const redis = (global as typeof globalThis & { __REDIS__?: RedisMemoryServer }).__REDIS__;
  if (redis) {
    await redis.stop();
  }
}
