import express, { Request, Response } from 'express';

const router = express.Router();

/**
 * Simple health check that returns deployment info
 * No authentication required
 */
router.get('/ping', (req: Request, res: Response) => {
  return res.json({
    success: true,
    message: 'Pong!',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
  });
});

export default router;
