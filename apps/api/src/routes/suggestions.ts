import { Router } from 'express';
import { z } from 'zod';
import { DataMerger } from '../lib/merge';
import { ScoringService } from '../lib/scoring';
import { SquadAnalyzer } from '../lib/squad';

const router = Router();

// Validation schemas
const suggestionRequestSchema = z.object({
  playerId: z.number().int().positive(),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  maxPrice: z.number().positive().max(15),
  excludeIds: z.array(z.number().int().positive()).optional().default([]),
  limit: z.number().int().min(1).max(10).optional().default(5)
});

// POST /api/suggestions - Get player suggestions for a specific slot
router.post('/', async (req, res) => {
  try {
    const { playerId, position, maxPrice, excludeIds, limit } = suggestionRequestSchema.parse(req.body);
    
    // Get all players
    const allPlayers = await DataMerger.getAllEnrichedPlayers();
    
    // Find current player
    const currentPlayer = allPlayers.find(p => p.id === playerId);
    if (!currentPlayer) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }
    
    // Filter candidates
    const candidates = allPlayers.filter(player => 
      player.id !== playerId && // Not the same player
      player.pos === position && // Same position
      player.price <= maxPrice && // Within budget
      player.status === 'a' && // Available
      !excludeIds.includes(player.id) // Not in exclude list
    );
    
    // Calculate scores for candidates
    const scoredCandidates = candidates.map(player => ({
      ...player,
      score: ScoringService.calculatePlayerScore(player)
    }));
    
    // Sort by score and take top suggestions
    const suggestions = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(player => ({
        id: player.id,
        name: player.name,
        teamShort: player.teamShort,
        price: player.price,
        score: player.score,
        form: player.form,
        xg90: player.xg90,
        xa90: player.xa90,
        next3Ease: player.next3Ease,
        delta: Math.round((player.score - currentPlayer.score!) * 100) / 100
      }));
    
    res.json({
      success: true,
      data: {
        currentPlayer: {
          id: currentPlayer.id,
          name: currentPlayer.name,
          score: currentPlayer.score
        },
        suggestions,
        count: suggestions.length
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    // Error getting suggestions
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions'
    });
  }
});

// POST /api/suggestions/bulk - Get suggestions for multiple players
router.post('/bulk', async (req, res) => {
  try {
    const { players, weights } = z.object({
      players: z.array(z.object({
        id: z.number().int().positive(),
        position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
        maxPrice: z.number().positive().max(15),
        excludeIds: z.array(z.number().int().positive()).optional().default([])
      })),
      weights: z.object({
        form: z.number().min(0).max(1).optional(),
        xg90: z.number().min(0).max(1).optional(),
        xa90: z.number().min(0).max(1).optional(),
        expMin: z.number().min(0).max(1).optional(),
        next3Ease: z.number().min(0).max(1).optional()
      }).optional()
    }).parse(req.body);
    
    const analysisWeights = weights ? {
      form: weights.form ?? 0.3,
      xg90: weights.xg90 ?? 0.25,
      xa90: weights.xa90 ?? 0.2,
      expMin: weights.expMin ?? 0.15,
      next3Ease: weights.next3Ease ?? 0.1
    } : ScoringService.DEFAULT_WEIGHTS;
    
    const results = await Promise.all(
      players.map(async (player) => {
        const suggestions = await getSuggestionsForPlayer(
          player.id,
          player.position,
          player.maxPrice,
          player.excludeIds || [],
          analysisWeights
        );
        return {
          playerId: player.id,
          suggestions
        };
      })
    );
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    // Error getting bulk suggestions
    res.status(500).json({
      success: false,
      error: 'Failed to get bulk suggestions'
    });
  }
});

// Helper method for getting suggestions
async function getSuggestionsForPlayer(
  playerId: number,
  position: string,
  maxPrice: number,
  excludeIds: number[],
  weights: any
) {
  const allPlayers = await DataMerger.getAllEnrichedPlayers();
  
  const currentPlayer = allPlayers.find(p => p.id === playerId);
  if (!currentPlayer) return [];
  
  const candidates = allPlayers.filter(player => 
    player.id !== playerId &&
    player.pos === position &&
    player.price <= maxPrice &&
    player.status === 'a' &&
    !excludeIds.includes(player.id)
  );
  
  const scoredCandidates = candidates.map(player => ({
    ...player,
    score: ScoringService.calculatePlayerScore(player, weights)
  }));
  
  return scoredCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(player => ({
      id: player.id,
      name: player.name,
      teamShort: player.teamShort,
      price: player.price,
      score: player.score,
      delta: Math.round((player.score - currentPlayer.score!) * 100) / 100
    }));
}

export { router as suggestionsRouter };

