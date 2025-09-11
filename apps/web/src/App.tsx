import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import SquadPage from './pages/SquadPage';
import AnalyzePage from './pages/AnalyzePage';
import { apiClient } from './lib/api';
import { useSquad } from './state/useSquad';
import { useWeights } from './state/useWeights';

function App() {
  const [isApiConnected, setIsApiConnected] = useState<boolean | null>(null);
  const squadState = useSquad();
  const weightsState = useWeights();

  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        await apiClient.healthCheck();
        setIsApiConnected(true);
      } catch (error) {
        console.error('API connection failed:', error);
        setIsApiConnected(false);
      }
    };

    checkApiConnection();
  }, []);

  if (isApiConnected === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpl-green mx-auto mb-4"></div>
          <p className="text-gray-600">Connecting to API...</p>
        </div>
      </div>
    );
  }

  if (isApiConnected === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-800 mb-2">API Connection Failed</h1>
          <p className="text-red-600 mb-4">
            Unable to connect to the FPL Optimizer API. Please make sure the API server is running on port 3001.
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
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-fpl-dark">
                  FPL Optimizer
                </h1>
              </div>
              <nav className="flex space-x-4">
                <a 
                  href="/" 
                  className="text-gray-600 hover:text-fpl-dark transition-colors"
                >
                  Home
                </a>
                <a 
                  href="/squad" 
                  className="text-gray-600 hover:text-fpl-dark transition-colors"
                >
                  New Squad
                </a>
                {sessionStorage.getItem('fpl-analysis-results') && (
                  <a 
                    href="/analyze" 
                    className="text-gray-600 hover:text-fpl-dark transition-colors"
                  >
                    Current Analysis
                  </a>
                )}
              </nav>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/squad" element={<SquadPage squadState={squadState} weightsState={weightsState} />} />
            <Route path="/analyze" element={<AnalyzePage />} />
          </Routes>
        </main>

        <footer className="bg-white border-t border-gray-200 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center text-gray-500 text-sm">
              <p>FPL Optimizer - Built for Fantasy Premier League managers</p>
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
