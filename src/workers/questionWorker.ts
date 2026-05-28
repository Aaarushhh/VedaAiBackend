import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import Assignment from '../models/Assignment';
import { generateQuestionPaper } from '../services/aiService';
import { getIO } from '../socket/index';

export const startWorker = () => {
  const worker = new Worker(
    'questionGeneration',
    async (job: Job) => {
      const { assignmentId } = job.data;

      console.log(`Processing job for assignment: ${assignmentId}`);

      // Update status to processing
      await Assignment.findByIdAndUpdate(assignmentId, { status: 'processing' });

      // Notify frontend - processing started
      const io = getIO();
      io.emit(`assignment:${assignmentId}`, {
        status: 'processing',
        message: 'Generating your question paper...',
      });

      // Get assignment from DB
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) throw new Error('Assignment not found');

      // Generate paper using AI
      const generatedPaper = await generateQuestionPaper(
        assignment.title,
        assignment.questionTypes,
        assignment.additionalInstructions,
        assignment.totalMarks
      );

      // Save result to DB
      await Assignment.findByIdAndUpdate(assignmentId, {
        status: 'completed',
        generatedPaper,
      });

      // Cache result in Redis
      await redis.set(
        `paper:${assignmentId}`,
        JSON.stringify(generatedPaper),
        'EX',
        3600 // 1 hour cache
      );

      // Notify frontend - completed
      io.emit(`assignment:${assignmentId}`, {
        status: 'completed',
        message: 'Question paper generated!',
        data: generatedPaper,
      });

      console.log(`Job completed for assignment: ${assignmentId}`);
    },
    { connection: redis }
  );

  worker.on('failed', async (job, err) => {
    if (!job) {
      console.error(`Job failed (no job context):`, err);
      return;
    }

    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = attemptsMade >= maxAttempts;

    console.error(
      `Job ${job.id} failed (attempt ${attemptsMade}/${maxAttempts}):`,
      err?.message ?? err
    );

    if (!isFinalAttempt) {
      // BullMQ will retry with exponential backoff; keep status as 'processing'
      return;
    }

    await Assignment.findByIdAndUpdate(job.data.assignmentId, {
      status: 'failed',
    });
    const io = getIO();
    io.emit(`assignment:${job.data.assignmentId}`, {
      status: 'failed',
      message: 'Generation failed after multiple attempts. Please try again.',
    });
  });

  console.log('Question generation worker started');
};