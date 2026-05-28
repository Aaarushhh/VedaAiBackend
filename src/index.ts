import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import { initSocket } from './socket/index';
import { startWorker } from './workers/questionWorker';
import assignmentRoutes from './routes/assignment';
import { isOriginAllowed } from './config/cors';

dotenv.config();

const requiredEnv = ['MONGODB_URI', 'REDIS_URL', 'GEMINI_API_KEY'] as const;
for (const key of requiredEnv) {
  const value = process.env[key]?.trim();
  if (!value) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
}

const mongoUri = process.env.MONGODB_URI!.trim();
if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
  console.error(
    'MONGODB_URI must start with mongodb:// or mongodb+srv:// (no quotes, no spaces)'
  );
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());

// Routes
app.use('/api/assignments', assignmentRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'VedaAI Backend Running' });
});

// Init
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  initSocket(server);
  startWorker();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();