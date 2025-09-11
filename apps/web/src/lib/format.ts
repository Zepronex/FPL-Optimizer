import { PlayerLabel } from './types';

export const formatPrice = (price: number): string => {
  return `£${price.toFixed(1)}m`;
};

export const formatScore = (score: number): string => {
  return score.toFixed(1);
};

export const formatDelta = (delta: number): string => {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
};

export const getLabelColor = (label: PlayerLabel): string => {
  switch (label) {
    case 'perfect':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'good':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'poor':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'urgent':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'not-playing':
      return 'bg-red-900 text-red-100 border-red-800';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const getLabelText = (label: PlayerLabel): string => {
  switch (label) {
    case 'perfect':
      return 'Perfect';
    case 'good':
      return 'Good';
    case 'poor':
      return 'Poor';
    case 'urgent':
      return 'Urgent';
    case 'not-playing':
      return 'Not Playing';
    default:
      return 'Unknown';
  }
};

export const getPositionColor = (position: string): string => {
  switch (position) {
    case 'GK':
      return 'bg-purple-100 text-purple-800';
    case 'DEF':
      return 'bg-blue-100 text-blue-800';
    case 'MID':
      return 'bg-green-100 text-green-800';
    case 'FWD':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getDifficultyColor = (difficulty: number): string => {
  if (difficulty <= 2) return 'bg-green-100 text-green-800';
  if (difficulty <= 3) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

export const getDifficultyText = (difficulty: number): string => {
  if (difficulty <= 2) return 'Easy';
  if (difficulty <= 3) return 'Medium';
  return 'Hard';
};

export const formatForm = (form: number): string => {
  return form.toFixed(1);
};

export const formatXG = (xg: number): string => {
  return xg.toFixed(2);
};

export const formatXA = (xa: number): string => {
  return xa.toFixed(2);
};

export const formatMinutes = (minutes: number): string => {
  return `${minutes}min`;
};

export const calculateTotalSquadValue = (squad: { startingXI: any[]; bench: any[]; bank: number }): number => {
  const totalPlayerValue = [...squad.startingXI, ...squad.bench]
    .reduce((sum, slot) => sum + slot.price, 0);
  return totalPlayerValue + squad.bank;
};

export const isValidFormation = (startingXI: any[]): boolean => {
  if (startingXI.length !== 11) return false;
  
  const positionCounts = startingXI.reduce((counts, slot) => {
    counts[slot.pos] = (counts[slot.pos] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  // Must have exactly 1 goalkeeper
  if (positionCounts.GK !== 1) return false;
  
  // Must have 3-5 defenders, 3-5 midfielders, 1-3 forwards
  const defCount = positionCounts.DEF || 0;
  const midCount = positionCounts.MID || 0;
  const fwdCount = positionCounts.FWD || 0;
  
  return defCount >= 3 && defCount <= 5 &&
         midCount >= 3 && midCount <= 5 &&
         fwdCount >= 1 && fwdCount <= 3;
};

export const getFormationString = (startingXI: any[]): string => {
  if (!isValidFormation(startingXI)) return 'Invalid';
  
  const positionCounts = startingXI.reduce((counts, slot) => {
    counts[slot.pos] = (counts[slot.pos] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  const defCount = positionCounts.DEF || 0;
  const midCount = positionCounts.MID || 0;
  const fwdCount = positionCounts.FWD || 0;
  
  return `${defCount}-${midCount}-${fwdCount}`;
};

