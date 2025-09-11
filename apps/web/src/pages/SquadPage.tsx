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
      
      // Store results and original squad in session storage for the analyze page
      sessionStorage.setItem('fpl-analysis-results', JSON.stringify(response));
      sessionStorage.setItem('fpl-original-squad', JSON.stringify(squad));
      
      // Navigate to analyze page
      navigate('/analyze');
    } catch (error) {
      // Analysis failed
      setAnalysisError('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <div className="space-y-8">
      {/* Page Header with Analyze Button */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-fpl-dark mb-4">
          Squad Builder
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-6">
          Build your Fantasy Premier League squad and get AI-powered analysis with personalized suggestions to maximize your points potential.
        </p>
        
        {/* Analyze Button - Moved to top */}
        <div className="flex flex-col items-center space-y-3">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || squad.startingXI.length !== 11 || squad.bench.length !== 4}
            className="btn-primary text-xl px-10 py-4 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            {isAnalyzing ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing Squad...
              </>
            ) : (
              '🚀 Analyze My Squad'
            )}
          </button>
          
          {/* Progress indicators */}
          <div className="flex flex-col items-center space-y-1">
            {squad.startingXI.length !== 11 && (
              <p className="text-sm text-orange-600 font-medium">
                Complete your starting XI ({squad.startingXI.length}/11 players)
              </p>
            )}
            
            {squad.bench.length !== 4 && squad.startingXI.length === 11 && (
              <p className="text-sm text-orange-600 font-medium">
                Complete your bench ({squad.bench.length}/4 players)
              </p>
            )}
            
            {squad.startingXI.length === 11 && squad.bench.length === 4 && (
              <p className="text-sm text-green-600 font-medium">
                ✅ Squad complete! Ready to analyze
              </p>
            )}
          </div>
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
    </div>
  );
};

export default SquadPage;
