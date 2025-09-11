import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SquadForm from '../components/SquadForm';
import WeightsPanel from '../components/WeightsPanel';
import { apiClient } from '../lib/api';
import { Squad } from '../lib/types';

interface SquadPageProps {
  squadState: ReturnType<typeof import('../state/useSquad').useSquad>;
  weightsState: ReturnType<typeof import('../state/useWeights').useWeights>;
}

const SquadPage = ({ squadState, weightsState }: SquadPageProps) => {
  const navigate = useNavigate();
  const { squad, error: squadError, clearError: clearSquadError } = squadState;
  const { weights, error: weightsError, clearError: clearWeightsError } = weightsState;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (squad.startingXI.length !== 11 || squad.bench.length !== 4) {
      setAnalysisError('Please complete your squad (11 starting XI + 4 bench players)');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await apiClient.analyzeSquad(squad, weights);
      
      // Store results in session storage for the analyze page
      sessionStorage.setItem('fpl-analysis-results', JSON.stringify(response));
      
      // Navigate to analyze page
      navigate('/analyze');
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysisError('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickStart = async () => {
    // Create a sample analysis result for demonstration
    const sampleAnalysis = {
      results: [
        {
          id: 1,
          name: "Mohamed Salah",
          teamShort: "LIV",
          pos: "MID",
          price: 14.5,
          score: 8.2,
          breakdown: {
            form: 2.4,
            xg90: 2.1,
            xa90: 1.8,
            expMin: 1.2,
            next3Ease: 0.7
          }
        },
        {
          id: 2,
          name: "Erling Haaland",
          teamShort: "MCI",
          pos: "FWD",
          price: 15.0,
          score: 9.1,
          breakdown: {
            form: 2.7,
            xg90: 2.8,
            xa90: 1.2,
            expMin: 1.5,
            next3Ease: 0.9
          }
        }
      ],
      averageScore: 7.65,
      flaggedPlayers: 0,
      bankLeft: 0.5,
      totalScore: 15.3,
      weights: {
        form: 0.3,
        xg90: 0.25,
        xa90: 0.2,
        expMin: 0.15,
        next3Ease: 0.1
      },
      timestamp: new Date().toISOString()
    };

    sessionStorage.setItem('fpl-analysis-results', JSON.stringify(sampleAnalysis));
    navigate('/analyze');
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-fpl-dark mb-4">
          Squad Builder
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Build your Fantasy Premier League squad and get AI-powered analysis with personalized suggestions to maximize your points potential.
        </p>
      </div>

      {/* Quick Start Section */}
      <div className="text-center">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Quick Start</h3>
          <p className="text-blue-700 mb-4">
            Want to see how it works? Try our demo with a sample analysis.
          </p>
          <button
            onClick={handleQuickStart}
            className="btn-secondary"
          >
            View Demo Analysis
          </button>
        </div>
      </div>

      {/* Error Display */}
      {(squadError || weightsError || analysisError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 mt-1">
                {squadError || weightsError || analysisError}
              </p>
            </div>
            <button
              onClick={() => {
                clearSquadError();
                clearWeightsError();
                setAnalysisError(null);
              }}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Squad Input */}
        <div className="lg:col-span-2">
          <SquadForm squadState={squadState} />
        </div>

        {/* Weights Panel */}
        <div className="lg:col-span-1">
          <WeightsPanel weightsState={weightsState} />
        </div>
      </div>

      {/* Analyze Button */}
      <div className="text-center">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || squad.startingXI.length !== 11 || squad.bench.length !== 4}
          className="btn-primary text-lg px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-fpl-dark inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing Squad...
            </>
          ) : (
            'Analyze My Squad'
          )}
        </button>
        
        {squad.startingXI.length !== 11 && (
          <p className="text-sm text-gray-500 mt-2">
            Complete your starting XI ({squad.startingXI.length}/11 players)
          </p>
        )}
        
        {squad.bench.length !== 4 && squad.startingXI.length === 11 && (
          <p className="text-sm text-gray-500 mt-2">
            Complete your bench ({squad.bench.length}/4 players)
          </p>
        )}
      </div>
    </div>
  );
};

export default SquadPage;
