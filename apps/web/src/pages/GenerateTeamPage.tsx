import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';

const GenerateTeamPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-950">Team Generation Unavailable</h1>
            <p className="mt-3 leading-7 text-gray-700">
              Automated team generation is paused for this demo. The supported flow is manual squad
              selection with prediction-backed search, validation, optimizer recommendations, and evaluation.
            </p>
            <button
              onClick={() => navigate('/squad')}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Open Squad Builder
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateTeamPage;
