import mongoose from 'mongoose';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/payroll_system';
const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);

async function checkMongo(): Promise<boolean> {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.db!.admin().ping();
    console.log(`MongoDB connected at ${MONGODB_URI}`);
    return true;
  } catch {
    console.error(
      `MongoDB not reachable at ${MONGODB_URI} — install MongoDB and ensure the service is running (see README)`,
    );
    return false;
  } finally {
    await mongoose.disconnect();
  }
}

async function checkRedis(): Promise<boolean> {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong === 'PONG') {
      console.log(`Redis connected at ${REDIS_HOST}:${REDIS_PORT}`);
      return true;
    }
    console.error(
      `Redis not reachable at ${REDIS_HOST}:${REDIS_PORT} — install Redis and ensure the service is running (see README)`,
    );
    return false;
  } catch {
    console.error(
      `Redis not reachable at ${REDIS_HOST}:${REDIS_PORT} — install Redis and ensure the service is running (see README)`,
    );
    return false;
  } finally {
    client.disconnect();
  }
}

async function main(): Promise<void> {
  const mongoOk = await checkMongo();
  const redisOk = await checkRedis();

  if (mongoOk && redisOk) {
    console.log('\nAll services ready.');
    process.exit(0);
  }

  process.exit(1);
}

void main();
