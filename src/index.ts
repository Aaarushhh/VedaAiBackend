import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import { initSocket } from './socket/index';
import { startWorker } from './workers/questionWorker';
import assignmentRoutes from './routes/assignment';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
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