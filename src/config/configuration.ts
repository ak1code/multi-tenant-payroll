export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/payroll_system',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  bull: {
    maxAttempts: parseInt(process.env.BULL_MAX_ATTEMPTS ?? '5', 10),
    backoffDelay: parseInt(process.env.BULL_BACKOFF_DELAY ?? '2000', 10),
  },
});
