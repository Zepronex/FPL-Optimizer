import { BrowserRouter as Router, Link, Routes, Route } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy } from 'react';
import { AlertTriangle } from 'lucide-react';
import GlobalPlayerSearch from './components/GlobalPlayerSearch';
import LoadingSpinner from './components/LoadingSpinner';
import { apiClient } from './lib/api';
import { useSquad } from './state/useSquad';

// main pages loaded directly for instant navigation
import HomePage from './pages/HomePage';
import SquadPage from './pages/SquadPage';
import GenerateTeamPage from './pages/GenerateTeamPage';

// secondary pages lazy loaded to reduce initial bundle size
const AnalyzePage = lazy(() => import('./pages/AnalyzePage'));
const EvaluationPage = lazy(() => import('./pages/EvaluationPage'));
const GeneratedTeamPage = lazy(() => import('./pages/GeneratedTeamPage'));
const PlayerDetailPage = lazy(() => import('./pages/PlayerDetailPage'));

// Import TopPlayersPage directly to avoid lazy loading issues
import TopPlayersPage from './pages/TopPlayersPage';

// lightweight loading spinner for page transitions
const FastLoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fpl-green"></div>
  </div>
);

function App() {
  const [isApiConnected, setIsApiConnected] = useState<boolean | null>(null);
  const squadState = useSquad();

  // check api connection on app startup
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        await apiClient.healthCheck();
        setIsApiConnected(true);
      } catch {
        setIsApiConnected(false);
      }
    };

    checkApiConnection();
  }, []);

  if (isApiConnected === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Connecting to API..." />
      </div>
    );
  }

  if (isApiConnected === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-800 mb-2">API Connection Failed</h1>
          <p className="text-red-600 mb-4">
            Unable to connect to the ScoutIQ API. Confirm that the API server is running on port 3001.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn-primary"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-fpl-dark">
                  ScoutIQ
                </h1>
              </div>
              
              {/* Global Player Search - Left of Nav */}
              <div className="w-80 ml-8">
                <GlobalPlayerSearch />
              </div>
              
              <div className="w-4"></div>
              
              <nav className="flex space-x-6 ml-auto">
                <Link
                  to="/squad"
                  className="text-gray-600 hover:text-fpl-dark transition-colors font-medium"
                >
                  Squad Builder
                </Link>
                <Link
                  to="/top-players"
                  className="text-gray-600 hover:text-fpl-dark transition-colors font-medium"
                >
                  Top Players
                </Link>
                <Link
                  to="/analyze"
                  className="text-gray-600 hover:text-fpl-dark transition-colors font-medium"
                >
                  Team Analysis
                </Link>
                <Link
                  to="/evaluation"
                  className="text-gray-600 hover:text-fpl-dark transition-colors font-medium"
                >
                  Evaluation
                </Link>
                <Link
                  to="/"
                  className="text-gray-600 hover:text-fpl-dark transition-colors font-medium"
                >
                  Home
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Suspense fallback={<FastLoadingSpinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/generate" element={<GenerateTeamPage />} />
              <Route path="/generated-team" element={<GeneratedTeamPage />} />
              <Route path="/squad" element={<SquadPage squadState={squadState} />} />
              <Route path="/top-players" element={<TopPlayersPage />} />
              <Route path="/analyze" element={<AnalyzePage />} />
              <Route path="/evaluation" element={<EvaluationPage />} />
              <Route path="/player/:id" element={<PlayerDetailPage />} />
            </Routes>
          </Suspense>
        </main>

        <footer className="bg-white border-t border-gray-200 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center text-gray-500 text-sm">
              <p>ScoutIQ - FPL decision support with transparent model evaluation</p>
              <p className="mt-1">
                Data provided by the official Fantasy Premier League API
              </p>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
