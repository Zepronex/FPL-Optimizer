import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';

const router: Router = Router();

// Validation schemas
const topPlayersRequestSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10)
});

// GET /api/ml/top-players - Proxy to ML service for predicted points
router.get('/top-players', async (req, res) => {
  try {
    const { limit } = topPlayersRequestSchema.parse(req.query);

    const response = await axios.get('http://localhost:3002/predict/top-players', {
      params: { limit },
      timeout: 10000,
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Top players error:', error);

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
