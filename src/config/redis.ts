import dotenv from 'dotenv';
dotenv.config();
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
  tls: {
    rejectUnauthorized: false,
  },
});

redis.on('connect', () => console.log('Redis Connected'));
redis.on('error', (err) => console.error('Redis Error:', err));

export default redis;