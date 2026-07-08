import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Database, LineChart, Search, ShieldCheck } from 'lucide-react';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-10">
      <section className="border-b border-gray-200 pb-8">
        <h1 className="text-4xl font-bold text-gray-950">ScoutIQ</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
          FPL decision support built around prediction serving, deterministic optimizer rules,
          and transparent model evaluation.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => navigate('/squad')} className="btn-primary">
            Open Squad Builder
          </button>
          <button onClick={() => navigate('/evaluation')} className="btn-secondary">
            View Evaluation
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkflowCard
          icon={<Search className="h-5 w-5" />}
          title="Build Squad"
          description="Search prediction-backed players and assemble a valid 15-player squad."
        />
        <WorkflowCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Validate Rules"
          description="Apply FPL squad composition, budget, and starting-XI formation checks."
        />
        <WorkflowCard
          icon={<LineChart className="h-5 w-5" />}
          title="Review Decisions"
          description="Use deterministic optimizer outputs for XI, bench, captaincy, and transfers."
        />
        <WorkflowCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Check Evidence"
          description="Inspect model quality, baseline comparison, and data coverage."
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-gray-700" />
          <h2 className="text-xl font-semibold text-gray-950">Demo Flow</h2>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          {['Squad Builder', 'Analysis Results', 'Explanation', 'Evaluation Dashboard'].map((step, index) => (
            <div key={step} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-500">Step {index + 1}</p>
              <p className="mt-2 font-semibold text-gray-950">{step}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const WorkflowCard = ({
  icon,
  title,
  description
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="rounded-lg border border-gray-200 bg-white p-5">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
      {icon}
    </div>
    <h2 className="mt-4 text-lg font-semibold text-gray-950">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
  </div>
);

export default HomePage;
