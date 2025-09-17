import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center">
        <h1 className="text-5xl font-bold text-fpl-dark mb-6">
          Master Your Fantasy Premier League
        </h1>
        <p className="text-xl text-gray-600 max-w-4xl mx-auto mb-8">
          Build the perfect FPL squad with AI-powered analysis, smart team generation, and comprehensive player insights. 
          Whether you're a seasoned manager or just starting out, our tools will help you maximize your points and climb the rankings.
        </p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => navigate('/squad')}
            className="btn-primary text-lg px-8 py-3"
          >
            Squad Builder
          </button>
          <button
            onClick={() => navigate('/generate')}
            className="bg-white text-fpl-dark border-2 border-fpl-dark px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Generate Team
          </button>
        </div>
      </div>

      {/* Features Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="card-fpl text-center">
          <div className="w-16 h-16 fpl-gradient rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-fpl-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-3 text-fpl-dark">AI-Powered Analysis</h3>
          <p className="text-gray-600">
            Get detailed insights on your squad with advanced analytics covering form, fixtures, value, and potential points. 
            Our AI analyzes player performance patterns to help you make informed decisions.
          </p>
        </div>

        <div className="card-fpl text-center">
          <div className="w-16 h-16 fpl-gradient rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-fpl-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-3 text-fpl-dark">Smart Team Generation</h3>
          <p className="text-gray-600">
            Let our algorithm build the perfect team for you! Choose from different strategies like balanced, 
            cost-effective, or form-focused approaches to generate optimized squads within your budget.
          </p>
        </div>

        <div className="card-fpl text-center">
          <div className="w-16 h-16 fpl-gradient rounded-full flex items-center justify-center mx-auto mb-4">
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
            <h3 className="text-lg font-semibold mb-2">Build or Generate</h3>
            <p className="text-gray-600">
              Create your squad manually by searching and selecting players, or use our AI to generate an optimized team 
              based on your preferred strategy and budget constraints.
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
              Our AI suggests the best moves to maximize your points potential.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center bg-fpl-dark text-white rounded-lg p-8">
        <h2 className="text-3xl font-bold mb-4">Ready to Dominate Your Mini-League?</h2>
        <p className="text-xl mb-6 opacity-90">
          Join thousands of FPL managers who are already using our tools to climb the rankings. 
          Start building your winning squad today with AI-powered insights and smart recommendations.
        </p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => navigate('/squad')}
            className="bg-white text-fpl-dark px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Build Squad
          </button>
          <button
            onClick={() => navigate('/generate')}
            className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-fpl-dark transition-colors"
          >
            Generate Team
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;