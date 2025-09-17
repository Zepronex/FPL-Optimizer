import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Users, Target, DollarSign, TrendingUp, Shield, Zap } from 'lucide-react';
import { apiClient } from '../lib/api';
import { Squad, AnalysisWeights } from '../lib/types';
import { useSquad } from '../state/useSquad';
import { useWeights } from '../state/useWeights';

interface TeamGenerationStrategy {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  weights: AnalysisWeights;
  budget: number;
  color: string;
}

const GenerateTeamPage = () => {
  const navigate = useNavigate();
  const squadState = useSquad();
  const weightsState = useWeights();
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strategies: TeamGenerationStrategy[] = [
    {
      id: 'balanced',
      name: 'Balanced Approach',
      description: 'Well-rounded team focusing on consistent performers across all positions',
      icon: <Shield className="w-6 h-6" />,
      weights: {
        form: 0.15,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.2,
        next3Ease: 0.15,
        avgPoints: 0.15,
        value: 0.05,
        ownership: 0.0
      },
      budget: 100,
      color: 'bg-blue-500'
    },
    {
      id: 'premium',
      name: 'Premium Heavy',
      description: 'Invest heavily in proven premium players with guaranteed minutes',
      icon: <Target className="w-6 h-6" />,
      weights: {
        form: 0.1,
        xg90: 0.2,
        xa90: 0.2,
        expMin: 0.25,
        next3Ease: 0.1,
        avgPoints: 0.1,
        value: 0.02,
        ownership: 0.03
      },
      budget: 100,
      color: 'bg-purple-500'
    },
    {
      id: 'value',
      name: 'Value Optimized',
      description: 'Maximum points per million - focus on budget enablers and differentials',
      icon: <DollarSign className="w-6 h-6" />,
      weights: {
        form: 0.15,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.15,
        next3Ease: 0.1,
        avgPoints: 0.1,
        value: 0.2,
        ownership: 0.0
      },
      budget: 100,
      color: 'bg-green-500'
    },
    {
      id: 'differential',
      name: 'Differential Focus',
      description: 'Low ownership players for unique advantages and rank climbing',
      icon: <Zap className="w-6 h-6" />,
      weights: {
        form: 0.2,
        xg90: 0.2,
        xa90: 0.15,
        expMin: 0.15,
        next3Ease: 0.15,
        avgPoints: 0.1,
        value: 0.03,
        ownership: 0.02
      },
      budget: 100,
      color: 'bg-orange-500'
    },
    {
      id: 'form',
      name: 'Form & Fixtures',
      description: 'Players in hot form with favorable upcoming fixture runs',
      icon: <TrendingUp className="w-6 h-6" />,
      weights: {
        form: 0.25,
        xg90: 0.15,
        xa90: 0.1,
        expMin: 0.15,
        next3Ease: 0.25,
        avgPoints: 0.05,
        value: 0.03,
        ownership: 0.02
      },
      budget: 100,
      color: 'bg-red-500'
    },
    {
      id: 'template',
      name: 'Template Team',
      description: 'Popular picks with high ownership for consistent, safe returns',
      icon: <Users className="w-6 h-6" />,
      weights: {
        form: 0.1,
        xg90: 0.1,
        xa90: 0.1,
        expMin: 0.25,
        next3Ease: 0.1,
        avgPoints: 0.2,
        value: 0.05,
        ownership: 0.1
      },
      budget: 100,
      color: 'bg-indigo-500'
    },
    {
      id: 'setforget',
      name: 'Set & Forget',
      description: 'Stable team with minimal transfers - focus on season-long consistency',
      icon: <Shield className="w-6 h-6" />,
      weights: {
        form: 0.05,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.3,
        next3Ease: 0.05,
        avgPoints: 0.25,
        value: 0.03,
        ownership: 0.02
      },
      budget: 100,
      color: 'bg-gray-500'
    },
    {
      id: 'wildcard',
      name: 'Wildcard Strategy',
      description: 'Aggressive approach for short-term gains with high-risk, high-reward players',
      icon: <Zap className="w-6 h-6" />,
      weights: {
        form: 0.3,
        xg90: 0.2,
        xa90: 0.15,
        expMin: 0.1,
        next3Ease: 0.2,
        avgPoints: 0.02,
        value: 0.02,
        ownership: 0.01
      },
      budget: 100,
      color: 'bg-yellow-500'
    }
  ];

  const handleGenerateTeam = async () => {
    if (!selectedStrategy) return;

    const strategy = strategies.find(s => s.id === selectedStrategy);
    if (!strategy) return;

    setIsGenerating(true);
    setError(null);

    try {
      // Call the API to generate the team
      const response = await apiClient.generateTeam(selectedStrategy, strategy.budget);
      
      if (response.success && response.data) {
        const { squad, strategy: strategyName, weights, budget } = response.data;
        
        console.log('GenerateTeamPage - API Response:', response.data);
        console.log('GenerateTeamPage - Squad:', squad);
        
        // Store the generated team data
        const generatedData = {
          squad,
          strategy: strategyName,
          weights,
          budget
        };
        
        // Store in session storage for the generated team page
        sessionStorage.setItem('generated-team-data', JSON.stringify(generatedData));
        console.log('GenerateTeamPage - Stored data:', generatedData);

        // Navigate to the generated team page
        navigate('/generated-team', { state: { generatedData } });
      } else {
        setError(response.error || 'Failed to generate team. Please try again.');
      }
    } catch (error) {
      setError('Failed to generate team. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-fpl-dark mb-4">
          Generate FPL Team
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Choose a strategy and let our AI generate an optimized Fantasy Premier League team for you.
        </p>
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

      {/* Strategy Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {strategies.map((strategy) => (
          <button
            key={strategy.id}
            onClick={() => setSelectedStrategy(strategy.id)}
            className={`p-6 rounded-lg border-2 transition-all duration-200 text-left ${
              selectedStrategy === strategy.id
                ? 'border-blue-500 bg-blue-50 shadow-lg'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className={`p-2 rounded-lg ${strategy.color} text-white`}>
                {strategy.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900">{strategy.name}</h3>
            </div>
            <p className="text-gray-600 mb-4">{strategy.description}</p>
            
            {/* Strategy Weights Preview */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Key Focus Areas:</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(strategy.weights)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span
                      key={key}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {key === 'xg90' ? 'xG/90' :
                       key === 'xa90' ? 'xA/90' :
                       key === 'expMin' ? 'Minutes' :
                       key === 'next3Ease' ? 'Fixtures' :
                       key === 'avgPoints' ? 'Avg Points' :
                       key === 'ownership' ? 'Ownership' :
                       key.charAt(0).toUpperCase() + key.slice(1)}: {(value * 100).toFixed(0)}%
                    </span>
                  ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Generate Button */}
      <div className="text-center">
        <button
          onClick={handleGenerateTeam}
          disabled={!selectedStrategy || isGenerating}
          className="btn-primary text-xl px-10 py-4 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating Team...
            </>
          ) : (
            <>
              <Wand2 className="w-6 h-6 mr-2 inline" />
              Generate My Team
            </>
          )}
        </button>
        
        {!selectedStrategy && (
          <p className="text-sm text-gray-500 mt-3">
            Please select a team generation strategy above
          </p>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <Wand2 className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-blue-800">
            <h3 className="font-semibold mb-2">How Team Generation Works:</h3>
            <ul className="text-sm space-y-1.5">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Our AI analyzes thousands of player combinations using your selected strategy
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Each strategy optimizes for different aspects (value, form, ownership, etc.)
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                The generated team will be loaded into the Squad Builder for your review
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                You can then analyze the team or make manual adjustments as needed
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateTeamPage;
