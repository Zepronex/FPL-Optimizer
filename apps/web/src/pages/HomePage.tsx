import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center">
        <h1 className="text-5xl font-bold text-fpl-dark mb-6">
          ScoutIQ Fantasy Premier League Review
        </h1>
        <p className="text-xl text-gray-600 max-w-4xl mx-auto mb-8">
          Build a data-backed FPL squad with transparent analysis, deterministic recommendations, and comprehensive player insights.
          Review the assumptions behind each decision before making changes.
        </p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => navigate('/squad')}
            className="btn-primary text-lg px-8 py-3"
          >
            Squad Builder
          </button>
          <button
            onClick={() => navigate('/evaluation')}
            className="bg-white text-fpl-dark border-2 border-fpl-dark px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Evaluation
          </button>
        </div>
      </div>

      {/* Features Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="card-fpl text-center">
          <div className="w-16 h-16 bg-fpl-green rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-fpl-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-3 text-fpl-dark">Model-Backed Analysis</h3>
          <p className="text-gray-600">
            Get detailed insights on your squad with advanced analytics covering form, fixtures, value, and potential points. 
            The scoring model summarizes player performance patterns to support informed decisions.
          </p>
        </div>

        <div className="card-fpl text-center">
          <div className="w-16 h-16 bg-fpl-green rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-fpl-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-3 text-fpl-dark">Deterministic Optimizer</h3>
          <p className="text-gray-600">
            Review starting XI, bench order, captaincy, and transfer options produced from loaded prediction data
            and FPL rule checks.
          </p>
        </div>

        <div className="card-fpl text-center">
          <div className="w-16 h-16 bg-fpl-green rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-fpl-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-3 text-fpl-dark">Player Search & Insights</h3>
          <p className="text-gray-600">
            Search through thousands of Premier League players with detailed stats, price history, and performance metrics. 
            Find the perfect players for your squad with our comprehensive database.
          </p>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-fpl-dark text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              1
            </div>
            <h3 className="text-lg font-semibold mb-2">Build Your Squad</h3>
            <p className="text-gray-600">
              Create your squad by searching the prediction-backed player database and selecting starters and bench players.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-fpl-dark text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              2
            </div>
            <h3 className="text-lg font-semibold mb-2">Analyze & Optimize</h3>
            <p className="text-gray-600">
              Get detailed analysis of your squad with insights on formation, budget allocation, and player performance. 
              Configure analysis weights to match your playing style and preferences.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-fpl-dark text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              3
            </div>
            <h3 className="text-lg font-semibold mb-2">Get Suggestions</h3>
            <p className="text-gray-600">
              Receive personalized recommendations for transfers, captain choices, and tactical adjustments. 
              Recommendations summarize the best available moves from the loaded scoring data and rule checks.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center bg-fpl-dark text-white rounded-lg p-8">
        <h2 className="text-3xl font-bold mb-4">Ready to Review Your Squad?</h2>
        <p className="text-xl mb-6 opacity-90">
          Use transparent model output, deterministic rule checks, and squad analysis before making transfer decisions.
        </p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => navigate('/squad')}
            className="bg-white text-fpl-dark px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Build Squad
          </button>
          <button
            onClick={() => navigate('/evaluation')}
            className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-fpl-dark transition-colors"
          >
            View Evaluation
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
