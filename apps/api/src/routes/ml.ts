import { Router } from 'express';
import { z } from 'zod';
import { DataMerger } from '../lib/merge';
import { ScoringService } from '../lib/scoring';
import { FPLDataFetcher } from '../lib/fetchers/fpl';

const router: Router = Router();

// Validation schemas
const topPlayersRequestSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10)
});

// GET /api/ml/top-players - Get top players predictions from ML service or fallback to scoring system
router.get('/top-players', async (req, res) => {
  try {
    const { limit } = topPlayersRequestSchema.parse(req.query);
    
    // Try ML service first
    try {
      const mlResponse = await fetch('http://localhost:3002/predict/top-players', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (mlResponse.ok) {
        const mlData = await mlResponse.json();
        return res.json({
          success: true,
          data: mlData
        });
      }
    } catch (mlError) {
      console.log('ML service unavailable, using fallback scoring system');
    }
    
    // Fallback: Use scoring system to generate top players
    const players = await DataMerger.getAllEnrichedPlayers();
    const scoredPlayers = players.map(player => ({
      ...player,
      score: ScoringService.calculatePlayerScore(player)
    }));
    
    // Group by position and get top players
    const topPlayersByPosition: { [key: number]: any[] } = {};
    const positionMap = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
    
    Object.entries(positionMap).forEach(([pos, posId]) => {
      const positionPlayers = scoredPlayers
        .filter(p => p.pos === pos)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit || 10)
        .map(player => ({
          player_id: player.id,
          name: player.name,
          position: posId,
          price: player.price,
          team: player.teamId,
          predicted_points: Math.round(player.score * 10) / 10, // Keep score as 0-10 scale
          confidence: Math.min(0.95, Math.max(0.6, player.score / 10)) // Confidence based on score
        }));
      
      topPlayersByPosition[posId] = positionPlayers;
    });
    
    // Get current gameweek
    const currentGameweek = await FPLDataFetcher.getCurrentGameweek().catch(() => 1);
    
    const fallbackData = {
      top_players_by_position: topPlayersByPosition,
      total_players_analyzed: players.length,
      gameweek: currentGameweek,
      fallback: true // Indicate this is a fallback response
    };
    
    res.json({
      success: true,
      data: fallbackData
    });
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
