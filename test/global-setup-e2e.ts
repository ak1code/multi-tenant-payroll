import { MongoMemoryServer } from 'mongodb-memory-server';
import RedisMemoryServer from 'redis-memory-server';

export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('payroll_system');
  process.env.MONGODB_URI = uri;

  const redisServer = new RedisMemoryServer();
  const redisHost = await redisServer.getHost();
  const redisPort = await redisServer.getPort();
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);

  (global as typeof globalThis & { __MONGOD__: MongoMemoryServer }).__MONGOD__ = mongod;
  (global as typeof globalThis & { __REDIS__: RedisMemoryServer }).__REDIS__ = redisServer;
}
