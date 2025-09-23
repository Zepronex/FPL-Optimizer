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
        form: 0.15,
        xg90: 0.25,
        xa90: 0.25,
        expMin: 0.2,
        next3Ease: 0.05,
        avgPoints: 0.05,
        value: 0.0, // No value consideration for premium
        ownership: 0.05
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
    const generatedSquad = await generateTeam(allPlayers, weights, budget, strategy);
    
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
async function generateTeam(players: any[], weights: AnalysisWeights, budget: number, strategy: string): Promise<Squad> {
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
      const player = findBestPlayer(playersByPosition[pos as keyof typeof playersByPosition], squad, squad.bank, strategy);
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
      const player = findBestPlayer(playersByPosition[pos as keyof typeof playersByPosition], squad, squad.bank, strategy);
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
      const player = findBestPlayer(playersByPosition[pos as keyof typeof playersByPosition], squad, squad.bank, strategy);
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

  // Budget optimization: try to upgrade players if we have remaining budget
  if (squad.bank > 2) { // If we have more than 2M left
    optimizeBudgetUsage(squad, playersByPosition, strategy);
  }

  return squad;
}

// Helper function to find the best available player
function findBestPlayer(players: any[], squad: Squad, availableBudget: number, strategy: string = 'balanced') {
  const usedPlayerIds = new Set([...squad.startingXI, ...squad.bench].map(p => p.id));
  
  // Filter available players
  const availablePlayers = players.filter(p => 
    !usedPlayerIds.has(p.id) && p.price <= availableBudget
  );
  
  if (availablePlayers.length === 0) return null;
  
  // For premium strategy, prioritize more expensive players with good scores
  if (strategy === 'premium') {
    // Sort by score per price ratio, but heavily weight towards higher-priced players
    return availablePlayers.sort((a, b) => {
      const scoreA = a.score * (1 + a.price * 0.1); // Boost for higher price
      const scoreB = b.score * (1 + b.price * 0.1);
      return scoreB - scoreA;
    })[0];
  }
  
  // For value strategy, prioritize score per price ratio
  if (strategy === 'value') {
    return availablePlayers.sort((a, b) => {
      const ratioA = a.score / a.price;
      const ratioB = b.score / b.price;
      return ratioB - ratioA;
    })[0];
  }
  
  // Default: highest score
  return availablePlayers.sort((a, b) => b.score - a.score)[0];
}

// Budget optimization function to use remaining budget more effectively
function optimizeBudgetUsage(squad: Squad, playersByPosition: any, strategy: string) {
  const usedPlayerIds = new Set([...squad.startingXI, ...squad.bench].map(p => p.id));
  
  // Try to upgrade players in starting XI first
  for (let i = 0; i < squad.startingXI.length; i++) {
    const currentPlayer = squad.startingXI[i];
    const position = currentPlayer.pos;
    const availableBudget = squad.bank + currentPlayer.price;
    
    // Find better players in the same position
    const availablePlayers = playersByPosition[position].filter((p: any) => 
      !usedPlayerIds.has(p.id) && 
      p.price <= availableBudget && 
      p.price > currentPlayer.price // Only consider more expensive players
    );
    
    if (availablePlayers.length > 0) {
      let bestUpgrade = null;
      
      if (strategy === 'premium') {
        // For premium, prioritize higher-priced players with good scores
        bestUpgrade = availablePlayers.sort((a: any, b: any) => {
          const scoreA = a.score * (1 + a.price * 0.1);
          const scoreB = b.score * (1 + b.price * 0.1);
          return scoreB - scoreA;
        })[0];
      } else {
        // For other strategies, prioritize score improvement
        bestUpgrade = availablePlayers.sort((a: any, b: any) => b.score - a.score)[0];
      }
      
      if (bestUpgrade && bestUpgrade.score > currentPlayer.price) { // Simple check for improvement
        // Replace the player
        squad.bank = squad.bank + currentPlayer.price - bestUpgrade.price;
        squad.startingXI[i] = {
          id: bestUpgrade.id,
          pos: bestUpgrade.pos,
          price: bestUpgrade.price,
          name: bestUpgrade.name,
          teamShort: bestUpgrade.teamShort
        };
        
        // Update used player tracking
        usedPlayerIds.delete(currentPlayer.id);
        usedPlayerIds.add(bestUpgrade.id);
      }
    }
  }
}

export { router as generateRouter };
