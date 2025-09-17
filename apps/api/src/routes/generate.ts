import { Router } from 'express';
import { z } from 'zod';
import { DataMerger } from '../lib/merge';
import { ScoringService } from '../lib/scoring';
import { Squad, AnalysisWeights } from '../types';

const router = Router();

// Validation schemas
const generateRequestSchema = z.object({
  strategy: z.enum(['balanced', 'premium', 'value', 'differential', 'form', 'template', 'setforget', 'wildcard']),
  budget: z.number().min(80).max(100).optional().default(100)
});

// POST /api/generate - Generate a team based on strategy
router.post('/', async (req, res) => {
  try {
    const { strategy, budget } = generateRequestSchema.parse(req.body);
    
    // Get all players
    const allPlayers = await DataMerger.getAllEnrichedPlayers();
    
    // Define strategy weights - Updated with realistic FPL strategies
    const strategyWeights: Record<string, AnalysisWeights> = {
      balanced: {
        form: 0.15,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.2,
        next3Ease: 0.15,
        avgPoints: 0.15,
        value: 0.05,
        ownership: 0.0
      },
      premium: {
        form: 0.1,
        xg90: 0.2,
        xa90: 0.2,
        expMin: 0.25,
        next3Ease: 0.1,
        avgPoints: 0.1,
        value: 0.02,
        ownership: 0.03
      },
      value: {
        form: 0.15,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.15,
        next3Ease: 0.1,
        avgPoints: 0.1,
        value: 0.2,
        ownership: 0.0
      },
      differential: {
        form: 0.2,
        xg90: 0.2,
        xa90: 0.15,
        expMin: 0.15,
        next3Ease: 0.15,
        avgPoints: 0.1,
        value: 0.03,
        ownership: 0.02
      },
      form: {
        form: 0.25,
        xg90: 0.15,
        xa90: 0.1,
        expMin: 0.15,
        next3Ease: 0.25,
        avgPoints: 0.05,
        value: 0.03,
        ownership: 0.02
      },
      template: {
        form: 0.1,
        xg90: 0.1,
        xa90: 0.1,
        expMin: 0.25,
        next3Ease: 0.1,
        avgPoints: 0.2,
        value: 0.05,
        ownership: 0.1
      },
      setforget: {
        form: 0.05,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.3,
        next3Ease: 0.05,
        avgPoints: 0.25,
        value: 0.03,
        ownership: 0.02
      },
      wildcard: {
        form: 0.3,
        xg90: 0.2,
        xa90: 0.15,
        expMin: 0.1,
        next3Ease: 0.2,
        avgPoints: 0.02,
        value: 0.02,
        ownership: 0.01
      }
    };

    const weights = strategyWeights[strategy];
    
    // Generate team using the strategy
    const generatedSquad = await generateTeam(allPlayers, weights, budget);
    
    res.json({
      success: true,
      data: {
        squad: generatedSquad,
        strategy,
        weights,
        budget
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
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate team'
    });
  }
});

// Team generation algorithm
async function generateTeam(players: any[], weights: AnalysisWeights, budget: number): Promise<Squad> {
  // Score all players
  const scoredPlayers = players.map(player => ({
    ...player,
    score: ScoringService.calculatePlayerScore(player, weights)
  }));

  // Filter available players
  const availablePlayers = scoredPlayers.filter(p => p.status === 'a');

  // Group by position
  const playersByPosition = {
    GK: availablePlayers.filter(p => p.pos === 'GK'),
    DEF: availablePlayers.filter(p => p.pos === 'DEF'),
    MID: availablePlayers.filter(p => p.pos === 'MID'),
    FWD: availablePlayers.filter(p => p.pos === 'FWD')
  };

  // Sort each position by score (descending)
  Object.keys(playersByPosition).forEach(pos => {
    playersByPosition[pos as keyof typeof playersByPosition].sort((a, b) => b.score - a.score);
  });

  // Generate squad using a greedy algorithm
  const squad: Squad = {
    startingXI: [],
    bench: [],
    bank: budget
  };

  // Required positions for starting XI
  const requiredPositions = [
    { pos: 'GK', count: 1 },
    { pos: 'DEF', count: 3 },
    { pos: 'MID', count: 3 },
    { pos: 'FWD', count: 1 }
  ];

  // Add required positions first
  for (const { pos, count } of requiredPositions) {
    for (let i = 0; i < count; i++) {
      const player = findBestPlayer(playersByPosition[pos as keyof typeof playersByPosition], squad, squad.bank);
      if (player) {
        squad.startingXI.push({
          id: player.id,
          pos: player.pos,
          price: player.price,
          name: player.name,
          teamShort: player.teamShort
        });
        squad.bank -= player.price;
      }
    }
  }

  // Fill remaining starting XI positions (flexible)
  const remainingSlots = 11 - squad.startingXI.length;
  const flexiblePositions = ['DEF', 'MID', 'FWD'];
  
  for (let i = 0; i < remainingSlots; i++) {
    let bestPlayer = null;
    let bestScore = -1;
    let bestPos = '';

    // Find the best available player across flexible positions
    for (const pos of flexiblePositions) {
      const player = findBestPlayer(playersByPosition[pos as keyof typeof playersByPosition], squad, squad.bank);
      if (player && player.score > bestScore) {
        bestPlayer = player;
        bestScore = player.score;
        bestPos = pos;
      }
    }

    if (bestPlayer) {
      squad.startingXI.push({
        id: bestPlayer.id,
        pos: bestPlayer.pos,
        price: bestPlayer.price,
        name: bestPlayer.name,
        teamShort: bestPlayer.teamShort
      });
      squad.bank -= bestPlayer.price;
    }
  }

  // Add bench players (1 GK, 1 DEF, 1 MID, 1 FWD)
  const benchPositions = [
    { pos: 'GK', count: 1 },
    { pos: 'DEF', count: 1 },
    { pos: 'MID', count: 1 },
    { pos: 'FWD', count: 1 }
  ];

  for (const { pos, count } of benchPositions) {
    for (let i = 0; i < count; i++) {
      const player = findBestPlayer(playersByPosition[pos as keyof typeof playersByPosition], squad, squad.bank);
      if (player) {
        squad.bench.push({
          id: player.id,
          pos: player.pos,
          price: player.price,
          name: player.name,
          teamShort: player.teamShort
        });
        squad.bank -= player.price;
      }
    }
  }

  return squad;
}

// Helper function to find the best available player
function findBestPlayer(players: any[], squad: Squad, availableBudget: number) {
  const usedPlayerIds = new Set([...squad.startingXI, ...squad.bench].map(p => p.id));
  
  for (const player of players) {
    if (!usedPlayerIds.has(player.id) && player.price <= availableBudget) {
      return player;
    }
  }
  return null;
}

export { router as generateRouter };
