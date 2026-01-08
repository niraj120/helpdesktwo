import { Router } from 'express';

const router = Router();

// Placeholder for new master data routes
// These routes handle separate collections for cities, states, centers, etc.
// TODO: Implement individual routes for each master data collection

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Master data routes - coming soon',
  });
});

export default router;
