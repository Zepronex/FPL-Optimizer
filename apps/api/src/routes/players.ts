import { Router } from 'express';
import { z } from 'zod';
import { DataMerger } from '../lib/merge';
import { FPLDataFetcher } from '../lib/fetchers/fpl';

const router = Router();

// Validation schemas
const searchSchema = z.object({
  name: z.string().min(1).max(100)
});

// GET /api/players - Get all players
router.get('/', async (req, res) => {
  try {
    const players = await DataMerger.getAllEnrichedPlayers();
    res.json({
      success: true,
      data: players,
      count: players.length
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch players'
    });
  }
});

// GET /api/players/search?name=playerName - Search players by name
router.get('/search', async (req, res) => {
  try {
    const { name } = searchSchema.parse(req.query);
    const players = await DataMerger.searchPlayersByName(name);
    
    if (players.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No players found',
        data: []
      });
    }
    
    res.json({
      success: true,
      data: players,
      count: players.length
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search parameters',
        details: error.errors
      });
    }
    
    console.error('Error searching players:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search players'
    });
  }
});

// GET /api/players/:id - Get specific player by ID
router.get('/:id', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    if (isNaN(playerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID'
      });
    }
    
    const players = await DataMerger.getAllEnrichedPlayers();
    const player = players.find(p => p.id === playerId);
    
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }
    
    res.json({
      success: true,
      data: player
    });
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player'
    });
  }
});

// GET /api/players/position/:pos - Get players by position
router.get('/position/:pos', async (req, res) => {
  try {
    const position = req.params.pos.toUpperCase();
    const validPositions = ['GK', 'DEF', 'MID', 'FWD'];
    
    if (!validPositions.includes(position)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid position. Must be GK, DEF, MID, or FWD'
      });
    }
    
    const players = await DataMerger.getAllEnrichedPlayers();
    const filteredPlayers = players.filter(p => p.pos === position);
    
    res.json({
      success: true,
      data: filteredPlayers,
      count: filteredPlayers.length
    });
  } catch (error) {
    console.error('Error fetching players by position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch players by position'
    });
  }
});

// POST /api/players/refresh - Refresh player data (admin endpoint)
router.post('/refresh', async (req, res) => {
  try {
    // In a real app, you'd check for admin authentication here
    await FPLDataFetcher.refreshAllData();
    
    res.json({
      success: true,
      message: 'Player data refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing player data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh player data'
    });
  }
});

export { router as playersRouter };
