import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SquadAnalysis, AnalysisResult, Squad, AnalysisWeights, WeightPreset } from '../lib/types';
import PlayerRow from '../components/PlayerRow';
import WeightsPanel from '../components/WeightsPanel';
import { formatScore, formatPrice, getFormationString } from '../lib/format';
import { apiClient } from '../lib/api';
import { useWeights } from '../state/useWeights';

const AnalyzePage = () => {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<SquadAnalysis | null>(null);
  const [originalSquad, setOriginalSquad] = useState<Squad | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weightsState = useWeights();

  useEffect(() => {
    const loadAnalysis = () => {
      try {
        const storedAnalysis = sessionStorage.getItem('fpl-analysis-results');
        const storedSquad = sessionStorage.getItem('fpl-original-squad');
        
        if (storedAnalysis && storedSquad) {
          const parsed = JSON.parse(storedAnalysis);
          const squadData = JSON.parse(storedSquad);
          
          // Extract the actual analysis data from the API response
          const analysisData = parsed.success ? parsed.data : parsed;
          setAnalysis(analysisData);
          setOriginalSquad(squadData);
          
          // Set the weights from the analysis
          if (analysisData.weights) {
            // Store the weights in localStorage so they persist
            localStorage.setItem('fpl-optimizer-weights', JSON.stringify(analysisData.weights));
          }
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
    sessionStorage.removeItem('fpl-original-squad');
    navigate('/squad');
  };

  const handleReAnalyze = async () => {
    if (!originalSquad) return;
    
    setIsReAnalyzing(true);
    setError(null);

    try {
      const response = await apiClient.analyzeSquad(originalSquad, weightsState.weights);
      
      // Store results in session storage for the analyze page
      sessionStorage.setItem('fpl-analysis-results', JSON.stringify(response));
      
      // Extract the actual analysis data from the API response
      const analysisData = response.success ? response.data : response;
      setAnalysis(analysisData);
    } catch (error) {
      setError('Re-analysis failed. Please try again.');
    } finally {
      setIsReAnalyzing(false);
    }
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={handleNewAnalysis}
              className="btn-primary"
            >
              Start New Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">No Analysis Found</h2>
          <p className="text-gray-600 mb-6">Please analyze your squad first.</p>
          <button
            onClick={handleNewAnalysis}
            className="btn-primary"
          >
            Build Squad
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
            onClick={handleReAnalyze}
            disabled={isReAnalyzing}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-lg px-8 py-4"
          >
            {isReAnalyzing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Re-analyzing...
              </>
            ) : (
              'Re-analyze with New Weights'
            )}
          </button>
          <button 
            onClick={handleNewAnalysis}
            className="btn-secondary text-lg px-8 py-4"
          >
            New Squad
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Content with Weights Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Analysis Results */}
        <div className="lg:col-span-3 space-y-8">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(analysis.weights).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div className="text-lg font-semibold text-fpl-dark">
                    {(value * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-600 capitalize">
                    {key === 'xg90' ? 'xG/90' :
                     key === 'xa90' ? 'xA/90' :
                     key === 'expMin' ? 'Minutes' :
                     key === 'next3Ease' ? 'Fixtures' :
                     key === 'avgPoints' ? 'Avg Points' :
                     key === 'ownership' ? 'Ownership' :
                     key.charAt(0).toUpperCase() + key.slice(1)}
                  </div>
                </div>
              ))}
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
                  isBench={true}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Legend</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <div className="flex items-center space-x-2">
                <span className="badge bg-red-900 text-red-100 border-red-800">Not Playing</span>
                <span className="text-sm text-gray-600">Injured/Suspended</span>
              </div>
            </div>
          </div>
        </div>

        {/* Weights Panel */}
        <div className="lg:col-span-1">
          <WeightsPanel weightsState={weightsState} />
        </div>
      </div>
    </div>
  );
};

export default AnalyzePage;