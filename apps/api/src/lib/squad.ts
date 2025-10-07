import { Squad, SquadSlot, EnrichedPlayer, Suggestion, AnalysisWeights } from '../types';
import { ScoringService } from './scoring';
import { DataMerger } from './merge';

export class SquadAnalyzer {
  static async analyzeSquad(
    squad: Squad,
    weights: AnalysisWeights = ScoringService.DEFAULT_WEIGHTS
  ): Promise<{
    results: Array<{
      player: EnrichedPlayer;
      score: number;
      label: string;
      suggestions: Suggestion[];
    }>;
    averageScore: number;
    flaggedPlayers: number;
    bankLeft: number;
    totalScore: number;
  }> {
    // Get all enriched players
    const allPlayers = await DataMerger.getAllEnrichedPlayers();
    
    // Create a map for quick player lookup
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));
    
    // Analyze each squad slot
    const results = [];
    let totalScore = 0;
    let flaggedCount = 0;
    
    // Analyze starting XI
    for (const slot of squad.startingXI) {
      const player = playerMap.get(slot.id);
      if (!player) continue;
      
      const score = ScoringService.calculatePlayerScore(player, weights);
      const label = ScoringService.getPlayerLabel(score, player);
      
      // Get suggestions for all players (within +/- 1.5 score range)
      const suggestions = await this.getSuggestions(player, slot, squad, allPlayers, weights);
      
      results.push({
        player: { ...player, score },
        score,
        label,
        suggestions
      });
      
      totalScore += score;
      if (label !== 'perfect') flaggedCount++;
    }
    
    // Analyze bench (optional - could be separate endpoint)
    for (const slot of squad.bench) {
      const player = playerMap.get(slot.id);
      if (!player) continue;
      
      const score = ScoringService.calculatePlayerScore(player, weights);
      const label = ScoringService.getPlayerLabel(score, player);
      
      results.push({
        player: { ...player, score },
        score,
        label,
        suggestions: [] // Bench players don't get suggestions
      });
    }
    
    const averageScore = results.length > 0 ? totalScore / results.length : 0;
    
    return {
      results,
      averageScore: Math.round(averageScore * 100) / 100,
      flaggedPlayers: flaggedCount,
      bankLeft: squad.bank,
      totalScore: Math.round(totalScore * 100) / 100
    };
  }

  private static async getSuggestions(
    currentPlayer: EnrichedPlayer,
    slot: SquadSlot,
    squad: Squad,
    allPlayers: EnrichedPlayer[],
    weights: AnalysisWeights
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const currentScore = ScoringService.calculatePlayerScore(currentPlayer, weights);
    
    // Filter potential replacements
    const candidates = allPlayers.filter(player => 
      player.id !== currentPlayer.id && // Not the same player
      player.pos === currentPlayer.pos && // Same position
      player.price <= slot.price + squad.bank && // Within budget
      player.status === 'a' && // Available
      !this.isPlayerInSquad(player.id, squad) // Not already in squad
    );
    
    // Calculate scores for candidates
    const scoredCandidates = candidates.map(player => ({
      ...player,
      score: ScoringService.calculatePlayerScore(player, weights)
    }));
    
    // Filter candidates within +/- 1.5 score range
    const scoreRange = 1.5;
    const sortedCandidates = scoredCandidates
      .filter(player => Math.abs(player.score - currentScore) <= scoreRange)
      .sort((a, b) => Math.abs(b.score - currentScore) - Math.abs(a.score - currentScore))
      .slice(0, 5); // Top 5 suggestions within range
    
    return sortedCandidates.map(player => ({
      id: player.id,
      name: player.name,
      price: player.price,
      delta: Math.round((player.score - currentScore) * 100) / 100
    }));
  }

  private static isPlayerInSquad(playerId: number, squad: Squad): boolean {
    return [...squad.startingXI, ...squad.bench].some(slot => slot.id === playerId);
  }

  static validateSquad(squad: Squad): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check formation (must have exactly 11 starting players)
    if (squad.startingXI.length !== 11) {
      errors.push('Starting XI must have exactly 11 players');
    }
    
    // Check bench (must have exactly 4 bench players)
    if (squad.bench.length !== 4) {
      errors.push('Bench must have exactly 4 players');
    }
    
    // Check position distribution in starting XI
    const positionCounts = squad.startingXI.reduce((counts, slot) => {
      counts[slot.pos] = (counts[slot.pos] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Valid formations: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1
    const validFormations = [
      { GK: 1, DEF: 3, MID: 4, FWD: 3 },
      { GK: 1, DEF: 3, MID: 5, FWD: 2 },
      { GK: 1, DEF: 4, MID: 3, FWD: 3 },
      { GK: 1, DEF: 4, MID: 4, FWD: 2 },
      { GK: 1, DEF: 4, MID: 5, FWD: 1 },
      { GK: 1, DEF: 5, MID: 3, FWD: 2 },
      { GK: 1, DEF: 5, MID: 4, FWD: 1 }
    ];
    
    const isValidFormation = validFormations.some(formation =>
      Object.entries(formation).every(([pos, count]) => positionCounts[pos] === count)
    );
    
    if (!isValidFormation) {
      errors.push('Invalid formation - must have 1 GK and valid DEF/MID/FWD distribution');
    }
    
    // Check total cost - allow negative bank for existing squads where player values have increased
    const totalCost = [...squad.startingXI, ...squad.bench]
      .reduce((sum, slot) => sum + slot.price, 0);
    
    // Only enforce 100M limit if bank is positive (new squad building)
    // If bank is negative, it means players have increased in value since squad was created
    if (squad.bank >= 0 && totalCost + squad.bank > 100) {
      errors.push('Total squad value cannot exceed 100.0');
    }
    
    // Check for duplicate players
    const allPlayerIds = [...squad.startingXI, ...squad.bench].map(slot => slot.id);
    const uniqueIds = new Set(allPlayerIds);
    if (uniqueIds.size !== allPlayerIds.length) {
      errors.push('Cannot have duplicate players in squad');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Validation for analysis - no budget constraints
  static validateSquadForAnalysis(squad: Squad): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check formation (must have exactly 11 starting players)
    if (squad.startingXI.length !== 11) {
      errors.push('Starting XI must have exactly 11 players');
    }
    
    // Check bench (must have exactly 4 bench players)
    if (squad.bench.length !== 4) {
      errors.push('Bench must have exactly 4 players');
    }
    
    // Check position distribution in starting XI
    const positionCounts = squad.startingXI.reduce((counts, slot) => {
      counts[slot.pos] = (counts[slot.pos] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Valid formations: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1
    const validFormations = [
      { GK: 1, DEF: 3, MID: 4, FWD: 3 },
      { GK: 1, DEF: 3, MID: 5, FWD: 2 },
      { GK: 1, DEF: 4, MID: 3, FWD: 3 },
      { GK: 1, DEF: 4, MID: 4, FWD: 2 },
      { GK: 1, DEF: 4, MID: 5, FWD: 1 },
      { GK: 1, DEF: 5, MID: 3, FWD: 2 },
      { GK: 1, DEF: 5, MID: 4, FWD: 1 }
    ];
    
    const isValidFormation = validFormations.some(formation =>
      Object.entries(formation).every(([pos, count]) => positionCounts[pos] === count)
    );
    
    if (!isValidFormation) {
      errors.push('Invalid formation - must have 1 GK and valid DEF/MID/FWD distribution');
    }
    
    // Check for duplicate players
    const allPlayerIds = [...squad.startingXI, ...squad.bench].map(slot => slot.id);
    const uniqueIds = new Set(allPlayerIds);
    if (uniqueIds.size !== allPlayerIds.length) {
      errors.push('Cannot have duplicate players in squad');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

