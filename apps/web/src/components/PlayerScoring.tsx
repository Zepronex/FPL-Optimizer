import { useState } from 'react';
import { EnrichedPlayer, AnalysisWeights } from '../lib/types';
import { apiClient } from '../lib/api';
import { TrendingUp, X } from 'lucide-react';

interface PlayerScoringProps {
  player: EnrichedPlayer;
  onClose: () => void;
  onScoreCalculated: (score: number) => void;
}

const PlayerScoring = ({ player, onClose, onScoreCalculated }: PlayerScoringProps) => {
  const [isScoring, setIsScoring] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default weights for scoring
  const defaultWeights: AnalysisWeights = {
    form: 0.2,
    xg90: 0.15,
    xa90: 0.15,
    expMin: 0.15,
    next3Ease: 0.1,
    avgPoints: 0.15,
    value: 0.05,
    ownership: 0.05
  };

  const calculateScore = async () => {
    setIsScoring(true);
    setError(null);
    
    try {
      const response = await apiClient.analyzeSquad({
        players: [player],
        formation: '3-4-3',
        captain: player.id,
        viceCaptain: player.id
      }, defaultWeights);

      if (response.success && response.data) {
        const playerScore = response.data.players.find(p => p.id === player.id)?.score || 0;
        setScore(playerScore);
        onScoreCalculated(playerScore);
      } else {
        setError('Failed to calculate score');
      }
    } catch (err) {
      setError('Error calculating score');
      console.error('Scoring error:', err);
    } finally {
      setIsScoring(false);
    }
  };

  const getScoreLabel = (score: number) => {
    if (score >= 8) return { label: 'Excellent', color: 'bg-green-100 text-green-800' };
    if (score >= 6) return { label: 'Good', color: 'bg-blue-100 text-blue-800' };
    if (score >= 4) return { label: 'Average', color: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Poor', color: 'bg-red-100 text-red-800' };
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Player Analysis</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <div className="font-medium text-gray-900">{player.name}</div>
          <div className="text-sm text-gray-600">
            {player.teamShort} • {player.pos} • £{player.price}M
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {score !== null ? (
          <div className="text-center">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-2 ${getScoreLabel(score).color}`}>
              {getScoreLabel(score).label}
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {score.toFixed(1)}
            </div>
            <div className="text-sm text-gray-500">Overall Score</div>
          </div>
        ) : (
          <div className="text-center">
            <button
              onClick={calculateScore}
              disabled={isScoring}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <TrendingUp className="w-4 h-4" />
              <span>{isScoring ? 'Calculating...' : 'Calculate Score'}</span>
            </button>
          </div>
        )}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerScoring;
