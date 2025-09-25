import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schemas
const topPlayersRequestSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10)
});

// GET /api/ml/top-players - Get top players predictions from ML service
router.get('/top-players', async (req, res) => {
  try {
    const { limit } = topPlayersRequestSchema.parse(req.query);
    
    // Call ML service for top players predictions
    const mlResponse = await fetch('http://localhost:3002/predict/top-players', {
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
    console.error('ML top players error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top players predictions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
