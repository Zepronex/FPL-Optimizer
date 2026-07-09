import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

const GeneratedTeamPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-1 h-5 w-5 flex-shrink-0 text-gray-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-950">Generated Team View Unavailable</h1>
            <p className="mt-3 leading-7 text-gray-700">
              Generated-team review is not part of the current ScoutIQ demo path. Use the Squad Builder
              to create a prediction-backed squad and run analysis.
            </p>
            <button
              onClick={() => navigate('/squad')}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Squad Builder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedTeamPage;
