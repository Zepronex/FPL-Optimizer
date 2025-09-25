import { Router } from 'express';
import { z } from 'zod';
import { DataMerger } from '../lib/merge';
import { ScoringService } from '../lib/scoring';
import { Squad, AnalysisWeights } from '../types';

const router = Router();

// Validation schemas
const generateRequestSchema = z.object({
  strategy: z.enum(['balanced', 'premium', 'value', 'differential', 'form', 'template', 'setforget', 'wildcard', 'ai']),
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

    // Handle AI strategy separately
    if (strategy === 'ai') {
      try {
        // Call ML service for AI strategy
        const mlResponse = await fetch('http://localhost:3002/predict/ai-strategy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            budget: budget,
            formation: '3-4-3',
            exclude_players: []
          })
        });

        if (!mlResponse.ok) {
          throw new Error(`ML service error: ${mlResponse.status}`);
        }

        const mlData = await mlResponse.json();
        
        // Convert ML response to our squad format
        const aiSquad = await convertMLResponseToSquad(mlData, allPlayers);
        
        res.json({
          success: true,
          data: {
            squad: aiSquad,
            strategy: 'ai',
            weights: {
              form: 0.25,
              xg90: 0.20,
              xa90: 0.20,
              expMin: 0.15,
              next3Ease: 0.10,
              avgPoints: 0.05,
              value: 0.03,
              ownership: 0.02
            },
            budget: budget,
            totalCost: mlData.total_cost,
            expectedPoints: mlData.expected_points,
            mlPredictions: mlData.players
          }
        });
        return;
      } catch (error) {
        console.error('AI strategy error:', error);
        // Fallback to balanced strategy if ML service is unavailable
        const weights = strategyWeights['balanced'];
        const generatedSquad = await generateTeam(allPlayers, weights, budget, 'balanced');
        
        res.json({
          success: true,
          data: {
            squad: generatedSquad,
            strategy: 'balanced', // Fallback
            weights,
            budget,
            fallback: true,
            error: 'ML service unavailable, using balanced strategy'
          }
        });
        return;
      }
    }

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
    
    // Find the current player's score from the original data
    const currentPlayerData = playersByPosition[position].find((p: any) => p.id === currentPlayer.id);
    if (!currentPlayerData) continue; // Skip if current player not found
    
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
      
      if (bestUpgrade && bestUpgrade.score > currentPlayerData.score) { // Check if upgrade has better score
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

// Helper function to convert ML response to squad format
async function convertMLResponseToSquad(mlData: any, allPlayers: any[]): Promise<Squad> {
  const squad: Squad = {
    startingXI: [],
    bench: [],
    bank: 0
  };

  // Create a map of player IDs to player data
  const playerMap = new Map();
  allPlayers.forEach(player => {
    playerMap.set(player.id, player);
  });

  // Process ML predictions and assign to positions
  // First 11 players go to startingXI, next 4 go to bench
  for (let i = 0; i < mlData.players.length; i++) {
    const prediction = mlData.players[i];
    const player = playerMap.get(prediction.player_id);
    
    let squadSlot;
    
    if (!player) {
      // If player not found in allPlayers, create a basic player object from ML data
      const playerData = {
        id: prediction.player_id,
        name: prediction.features?.name || `Player ${prediction.player_id}`,
        position: prediction.features?.position || 3,
        price: prediction.features?.price || 5.0,
        team: prediction.features?.team || 1,
        score: prediction.predicted_points,
        mlConfidence: prediction.confidence,
        form: 0,
        total_points: 0,
        points_per_game: 0,
        selected_by_percent: 0,
        transfers_in: 0,
        transfers_out: 0,
        value_form: 0,
        value_season: 0,
        influence: 0,
        creativity: 0,
        threat: 0,
        ict_index: 0,
        starts: 0,
        expected_goals: 0,
        expected_assists: 0,
        expected_goal_involvements: 0,
        expected_goals_conceded: 0,
        goals_scored: 0,
        assists: 0,
        clean_sheets: 0,
        goals_conceded: 0,
        own_goals: 0,
        penalties_saved: 0,
        penalties_missed: 0,
        yellow_cards: 0,
        red_cards: 0,
        saves: 0,
        bonus: 0,
        bps: 0,
        influence_rank: 0,
        creativity_rank: 0,
        threat_rank: 0,
        ict_index_rank: 0
      };
      
      // Convert to SquadSlot format
      squadSlot = {
        id: playerData.id,
        pos: playerData.position === 1 ? 'GK' : playerData.position === 2 ? 'DEF' : playerData.position === 3 ? 'MID' : 'FWD',
        price: playerData.price,
        name: playerData.name,
        teamShort: `T${playerData.team}`
      };
    } else {
      // Convert to SquadSlot format using position from ML prediction features
      const mlPosition = prediction.features?.position || player.position;
      squadSlot = {
        id: player.id,
        pos: mlPosition === 1 ? 'GK' : mlPosition === 2 ? 'DEF' : mlPosition === 3 ? 'MID' : 'FWD',
        price: player.price,
        name: player.name,
        teamShort: player.teamShort || `T${player.teamId}`
      };
      
    }
    
    // Assign to startingXI (first 11) or bench (next 4)
    if (i < 11) {
      squad.startingXI.push(squadSlot);
    } else if (i < 15) {
      squad.bench.push(squadSlot);
    }
  }

  // Calculate remaining budget (bank)
  const totalCost = [...squad.startingXI, ...squad.bench].reduce((sum, player) => sum + player.price, 0);
  squad.bank = 100 - totalCost; // Assuming 100m budget

  return squad;
}

export { router as generateRouter };
