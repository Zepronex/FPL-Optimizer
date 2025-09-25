import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Edit3, BarChart3 } from 'lucide-react';
import { Squad, AnalysisWeights } from '../lib/types';
import { apiClient } from '../lib/api';
import { formatPrice } from '../lib/format';
import FootballPitch from '../components/FootballPitch';
import SquadSummary from '../components/SquadSummary';
import BudgetDisplay from '../components/BudgetDisplay';
import BenchDisplay from '../components/BenchDisplay';

interface GeneratedTeamData {
  squad: Squad;
  strategy: string;
  weights: AnalysisWeights;
  budget: number;
}

const GeneratedTeamPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [generatedData, setGeneratedData] = useState<GeneratedTeamData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get the generated team data from location state or session storage
    const data = location.state?.generatedData || JSON.parse(sessionStorage.getItem('generated-team-data') || 'null');
    
    console.log('GeneratedTeamPage - Received data:', data);
    
    if (data) {
      setGeneratedData(data);
      setIsLoading(false);
    } else {
      setError('No generated team data found. Please generate a team first.');
      setIsLoading(false);
    }
  }, [location.state]);

  const handleEditTeam = () => {
    // Store the generated team data and navigate to squad builder
    if (generatedData) {
      sessionStorage.setItem('edit-generated-team', JSON.stringify(generatedData.squad));
      navigate('/squad');
    }
  };

  const handleAnalyzeTeam = async () => {
    if (!generatedData) return;

    try {
      const response = await apiClient.analyzeSquad(generatedData.squad, generatedData.weights);
      
      // Store results and original squad in session storage for the analyze page
      sessionStorage.setItem('fpl-analysis-results', JSON.stringify(response));
      sessionStorage.setItem('fpl-original-squad', JSON.stringify(generatedData.squad));
      
      // Navigate to analyze page
      navigate('/analyze');
    } catch (error) {
    }
  };

  const getStrategyInfo = (strategy: string) => {
    const strategies = {
      balanced: { name: 'Balanced Approach', color: 'bg-blue-500', description: 'Well-rounded team focusing on consistent performers across all positions' },
      premium: { name: 'Premium Heavy', color: 'bg-purple-500', description: 'Invest heavily in proven premium players with guaranteed minutes' },
      value: { name: 'Value Optimized', color: 'bg-green-500', description: 'Maximum points per million - focus on budget enablers and differentials' },
      differential: { name: 'Differential Focus', color: 'bg-orange-500', description: 'Low ownership players for unique advantages and rank climbing' },
      ai: { name: 'AI Strategy', color: 'bg-gradient-to-r from-purple-500 to-pink-500', description: 'Machine learning optimized team selection using advanced algorithms' },
      form: { name: 'Form & Fixtures', color: 'bg-red-500', description: 'Players in hot form with favorable upcoming fixture runs' },
      template: { name: 'Template Team', color: 'bg-indigo-500', description: 'Popular picks with high ownership for consistent, safe returns' },
      setforget: { name: 'Set & Forget', color: 'bg-gray-500', description: 'Stable team with minimal transfers - focus on season-long consistency' },
      wildcard: { name: 'Wildcard Strategy', color: 'bg-yellow-500', description: 'Aggressive approach for short-term gains with high-risk, high-reward players' }
    };
    return strategies[strategy as keyof typeof strategies] || { name: strategy, color: 'bg-gray-500', description: 'Custom strategy' };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpl-green mx-auto mb-4"></div>
          <p className="text-gray-600">Loading generated team...</p>
        </div>
      </div>
    );
  }

  if (error || !generatedData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-800 mb-2">No Team Found</h1>
          <p className="text-red-600 mb-4">{error || 'The generated team data could not be found.'}</p>
          <button 
            onClick={() => navigate('/generate')} 
            className="btn-primary"
          >
            Generate New Team
          </button>
        </div>
      </div>
    );
  }

  const strategyInfo = getStrategyInfo(generatedData.strategy);

  // Format startingXI for FootballPitch component (needs 11 slots with nulls)
  const formatStartingXI = (squad: Squad) => {
    const startingXI = [...squad.startingXI];
    console.log('GeneratedTeamPage - Starting XI players:', startingXI.length, startingXI);
    console.log('GeneratedTeamPage - Bench players:', squad.bench.length, squad.bench);
    // Pad with nulls to make it 11 slots
    while (startingXI.length < 11) {
      startingXI.push(null);
    }
    return startingXI;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/generate')}
            className="flex items-center text-gray-600 hover:text-fpl-dark transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Generate
          </button>
          
          <div className="text-center">
            <div className="flex items-center justify-center space-x-4 mb-4">
              <div className={`p-3 rounded-lg ${strategyInfo.color} text-white`}>
                <BarChart3 className="w-8 h-8" />
              </div>
              <div className="text-center">
                <h1 className="text-4xl font-bold text-fpl-dark">{strategyInfo.name}</h1>
                <p className="text-lg text-gray-600">{strategyInfo.description}</p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-center space-x-4 mb-6">
              <button
                onClick={handleAnalyzeTeam}
                className="btn-primary flex items-center space-x-2"
              >
                <BarChart3 className="w-5 h-5" />
                <span>Analyze Team</span>
              </button>
              <button
                onClick={handleEditTeam}
                className="bg-white text-fpl-dark border-2 border-fpl-dark px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors flex items-center space-x-2"
              >
                <Edit3 className="w-5 h-5" />
                <span>Edit Team</span>
              </button>
            </div>
          </div>
        </div>

        {/* Team Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Football Pitch */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Generated Team</h2>
              <FootballPitch startingXI={formatStartingXI(generatedData.squad)} isReadOnly={true} />
              
              {/* Bench Players */}
              <div className="mt-6">
                <BenchDisplay 
                  bench={generatedData.squad.bench} 
                  onRemovePlayer={() => {}} // Read-only mode
                />
              </div>
            </div>
          </div>

          {/* Team Summary */}
          <div className="lg:col-span-1 space-y-6">
            <SquadSummary squad={generatedData.squad} />
            
            {/* Team Statistics - Moved higher */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-fpl-dark">{generatedData.squad.startingXI.length}</div>
                  <div className="text-sm text-gray-600">Starting XI</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-fpl-dark">{generatedData.squad.bench.length}</div>
                  <div className="text-sm text-gray-600">Bench Players</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-fpl-dark">
                    {formatPrice(generatedData.squad.startingXI.reduce((sum, player) => sum + player.price, 0) + 
                     generatedData.squad.bench.reduce((sum, player) => sum + player.price, 0))}
                  </div>
                  <div className="text-sm text-gray-600">Total Cost</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-fpl-dark">
                    {new Set([...generatedData.squad.startingXI, ...generatedData.squad.bench].map(p => p.teamShort)).size}
                  </div>
                  <div className="text-sm text-gray-600">Different Teams</div>
                </div>
              </div>
            </div>
            
            {/* Budget Summary - Read Only */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-green-800 mb-4">Budget Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Spent:</span>
                  <span className="font-semibold text-green-700">{formatPrice(100 - generatedData.squad.bank)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Remaining Budget:</span>
                  <span className="font-semibold text-green-700">{formatPrice(generatedData.squad.bank)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Budget Efficiency:</span>
                  <span className="font-semibold text-green-700">{((100 - generatedData.squad.bank) / 100 * 100).toFixed(1)}%</span>
                </div>
              </div>
              
              {/* Budget Bar */}
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="h-3 rounded-full bg-green-500 transition-all duration-300"
                    style={{ width: `${((100 - generatedData.squad.bank) / 100 * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            {/* Strategy Details */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Strategy Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Strategy:</span>
                  <span className="font-medium">{strategyInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Description:</span>
                  <span className="font-medium text-right max-w-48">{strategyInfo.description}</span>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Key Focus Areas:</h4>
                <div className="flex flex-wrap gap-2">
                  {generatedData.strategy === 'ai' ? (
                    // AI Strategy specific focus areas
                    <>
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                        ML Analysis: 100%
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                        Historical Data
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                        Pattern Recognition
                      </span>
                    </>
                  ) : (
                    // Other strategies use weights
                    Object.entries(generatedData.weights)
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
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedTeamPage;
