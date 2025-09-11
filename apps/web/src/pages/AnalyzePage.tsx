import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SquadAnalysis, AnalysisResult } from '../lib/types';
import PlayerRow from '../components/PlayerRow';
import { formatScore, formatPrice, getFormationString } from '../lib/format';

const AnalyzePage = () => {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<SquadAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalysis = () => {
      try {
        const storedAnalysis = sessionStorage.getItem('fpl-analysis-results');
        
        if (storedAnalysis) {
          const parsed = JSON.parse(storedAnalysis);
          // Extract the actual analysis data from the API response
          const analysisData = parsed.success ? parsed.data : parsed;
          setAnalysis(analysisData);
        } else {
          setError('No analysis results found. Please analyze your squad first.');
        }
      } catch (err) {
        // Error loading analysis
        setError('Failed to load analysis results.');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalysis();
  }, []);

  const handleNewAnalysis = () => {
    sessionStorage.removeItem('fpl-analysis-results');
    navigate('/squad');
  };

  const copySuggestionsToClipboard = (result: AnalysisResult) => {
    if (result.suggestions.length === 0) return;
    
    const suggestionsText = result.suggestions
      .map(s => `${s.name} (${formatPrice(s.price)}) - ${s.delta > 0 ? '+' : ''}${s.delta.toFixed(1)} points`)
      .join('\n');
    
    const clipboardText = `OUT: ${result.player.name} (${formatPrice(result.player.price)})\nIN:\n${suggestionsText}`;
    
    navigator.clipboard.writeText(clipboardText).then(() => {
      // You could add a toast notification here
      // Suggestions copied successfully
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpl-green mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-800 mb-2">Analysis Not Found</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={handleNewAnalysis}
            className="btn-primary"
          >
            Start New Analysis
          </button>
        </div>
      </div>
    );
  }

  const startingXIResults = analysis.results.filter((_, index) => index < 11);
  const benchResults = analysis.results.filter((_, index) => index >= 11);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-fpl-dark mb-2">
            Squad Analysis Results
          </h1>
          <p className="text-gray-600">
            Analysis completed at {new Date(analysis.timestamp).toLocaleString()}
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handleNewAnalysis}
            className="btn-primary"
          >
            New Analysis
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-fpl-green mb-2">
            {formatScore(analysis.averageScore)}
          </div>
          <div className="text-sm text-gray-600">Average Score</div>
        </div>
        
        <div className="card text-center">
          <div className="text-3xl font-bold text-fpl-dark mb-2">
            {formatScore(analysis.totalScore)}
          </div>
          <div className="text-sm text-gray-600">Total Score</div>
        </div>
        
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-500 mb-2">
            {analysis.flaggedPlayers}
          </div>
          <div className="text-sm text-gray-600">Flagged Players</div>
        </div>
        
        <div className="card text-center">
          <div className="text-3xl font-bold text-blue-500 mb-2">
            {formatPrice(analysis.bankLeft)}
          </div>
          <div className="text-sm text-gray-600">Bank Remaining</div>
        </div>
      </div>

      {/* Weights Display */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Analysis Weights</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold text-fpl-green">
              {(analysis.weights.form * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">Form</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-fpl-green">
              {(analysis.weights.xg90 * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">xG/90</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-fpl-green">
              {(analysis.weights.xa90 * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">xA/90</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-fpl-green">
              {(analysis.weights.expMin * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">Expected Minutes</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-fpl-green">
              {(analysis.weights.next3Ease * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">Next 3 Fixtures</div>
          </div>
        </div>
      </div>

      {/* Starting XI */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6">
          Starting XI ({getFormationString(startingXIResults.map(r => ({ pos: r.player.pos })))})
        </h2>
        <div className="space-y-3">
          {startingXIResults.map((result, index) => (
            <PlayerRow
              key={result.player.id}
              result={result}
              onCopySuggestions={() => copySuggestionsToClipboard(result)}
            />
          ))}
        </div>
      </div>

      {/* Bench */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6">Bench</h2>
        <div className="space-y-3">
          {benchResults.map((result) => (
            <PlayerRow
              key={result.player.id}
              result={result}
              onCopySuggestions={() => copySuggestionsToClipboard(result)}
              isBench={true}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center space-x-2">
            <span className="badge bg-green-100 text-green-800 border-green-200">Perfect</span>
            <span className="text-sm text-gray-600">Score ≥ 8.0</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="badge bg-blue-100 text-blue-800 border-blue-200">Good</span>
            <span className="text-sm text-gray-600">Score ≥ 6.0</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="badge bg-yellow-100 text-yellow-800 border-yellow-200">Poor</span>
            <span className="text-sm text-gray-600">Score ≥ 4.0</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="badge bg-red-100 text-red-800 border-red-200">Urgent</span>
            <span className="text-sm text-gray-600">Score &lt; 4.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyzePage;

