import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Database, LineChart, Search, ShieldCheck } from 'lucide-react';

const workflowCards = [
  {
    icon: <Search className="h-5 w-5" />,
    title: 'Build Squad',
    description: 'Search prediction-backed players and assemble a valid 15-player squad.',
    accentClass: 'border-t-fpl-green',
    iconClass: 'border-teal-100 bg-teal-50 text-teal-700'
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Validate Rules',
    description: 'Apply FPL squad composition, budget, and starting-XI formation checks.',
    accentClass: 'border-t-blue-600',
    iconClass: 'border-blue-100 bg-blue-50 text-blue-700'
  },
  {
    icon: <LineChart className="h-5 w-5" />,
    title: 'Review Decisions',
    description: 'Use deterministic optimizer outputs for XI, bench, captaincy, and transfers.',
    accentClass: 'border-t-amber-600',
    iconClass: 'border-amber-100 bg-amber-50 text-amber-700'
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: 'Check Evidence',
    description: 'Inspect model quality, baseline comparison, and data coverage.',
    accentClass: 'border-t-sky-700',
    iconClass: 'border-sky-100 bg-sky-50 text-sky-700'
  }
];

const demoSteps = [
  { label: 'Squad Builder', className: 'border-l-fpl-green text-teal-700' },
  { label: 'Analysis Results', className: 'border-l-blue-600 text-blue-700' },
  { label: 'Explanation', className: 'border-l-amber-600 text-amber-700' },
  { label: 'Evaluation Dashboard', className: 'border-l-sky-700 text-sky-700' }
];

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-10">
      <section className="border-b border-teal-100 pb-8 pl-5 border-l-4 border-l-fpl-green">
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
        {workflowCards.map(card => (
          <WorkflowCard key={card.title} {...card} />
        ))}
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-6">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-fpl-green" />
          <h2 className="text-xl font-semibold text-gray-950">Demo Flow</h2>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          {demoSteps.map((step, index) => (
            <div key={step.label} className={`rounded-lg border border-gray-200 border-l-4 bg-slate-50 p-4 ${step.className}`}>
              <p className="text-sm font-semibold">Step {index + 1}</p>
              <p className="mt-2 font-semibold text-gray-950">{step.label}</p>
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
  description,
  accentClass,
  iconClass
}: {
  icon: ReactNode;
  title: string;
  description: string;
  accentClass: string;
  iconClass: string;
}) => (
  <div className={`rounded-lg border border-gray-200 border-t-4 bg-white p-5 ${accentClass}`}>
    <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${iconClass}`}>
      {icon}
    </div>
    <h2 className="mt-4 text-lg font-semibold text-gray-950">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
  </div>
);

export default HomePage;
