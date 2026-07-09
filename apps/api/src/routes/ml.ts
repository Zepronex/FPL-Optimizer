import { Router, type Router as ExpressRouter } from 'express';

const router: ExpressRouter = Router();

// GET /api/ml/health - Check ML service health
router.get('/health', async (req, res) => {
  try {
    const mlResponse = await fetch('http://localhost:3002/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!mlResponse.ok) {
      throw new Error(`ML service error: ${mlResponse.status}`);
    }

    const mlData = await mlResponse.json();
    
    res.json({
      success: true,
      data: mlData
    });
  } catch (error) {
    console.error('ML health check error:', error);
    
    res.status(500).json({
      success: false,
      error: 'ML service unavailable',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as mlRouter };
