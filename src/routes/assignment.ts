import { Router, Request, Response } from 'express';
import { Queue } from 'bullmq';
import redis from '../config/redis';
import Assignment from '../models/Assignment';

const router = Router();

const questionQueue = new Queue('questionGeneration', {
  connection: redis,
});

// POST /api/assignments - Create assignment & queue job
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      dueDate,
      questionTypes,
      additionalInstructions,
    } = req.body;

    // Calculate totals
    const totalQuestions = questionTypes.reduce(
      (sum: number, qt: any) => sum + Number(qt.count), 0
    );
    const totalMarks = questionTypes.reduce(
      (sum: number, qt: any) => sum + Number(qt.count) * Number(qt.marks), 0
    );

    // Save to MongoDB
    const assignment = new Assignment({
      title,
      dueDate,
      questionTypes,
      additionalInstructions,
      totalQuestions,
      totalMarks,
      status: 'pending',
    });

    await assignment.save();

    // Add to BullMQ queue
    await questionQueue.add(
      'generateQuestions',
      { assignmentId: assignment._id.toString() },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600 },
      }
    );

    res.status(201).json({
      success: true,
      assignmentId: assignment._id,
      message: 'Assignment created, generation started',
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/assignments - Get all assignments
router.get('/', async (req: Request, res: Response) => {
  try {
    const assignments = await Assignment.find()
      .sort({ createdAt: -1 })
      .select('-generatedPaper');

    res.json({ success: true, data: assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/assignments/:id - Get single assignment
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check Redis cache first
    const cached = await redis.get(`paper:${id}`);
    if (cached) {
      console.log('Serving from cache');
      return res.json({
        success: true,
        data: JSON.parse(cached),
        fromCache: true,
      });
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/assignments/:id/regenerate
router.post('/:id/regenerate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await Assignment.findByIdAndUpdate(id, {
      status: 'pending',
      generatedPaper: null,
    });

    // Delete cache
    await redis.del(`paper:${id}`);

    // Re-queue
    await questionQueue.add(
      'generateQuestions',
      { assignmentId: id },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600 },
      }
    );

    res.json({ success: true, message: 'Regeneration started' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/assignments/:id - Delete assignment, cache, and pending jobs
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await Assignment.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    await redis.del(`paper:${id}`);

    // Best-effort: remove any waiting/delayed jobs for this assignment
    try {
      const pendingJobs = await questionQueue.getJobs(['waiting', 'delayed', 'paused']);
      await Promise.all(
        pendingJobs
          .filter(j => j?.data?.assignmentId === id)
          .map(j => j.remove())
      );
    } catch (queueErr) {
      console.warn('Could not clean queued jobs for', id, queueErr);
    }

    res.json({ success: true, message: 'Assignment deleted' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;