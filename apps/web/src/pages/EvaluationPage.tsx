import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Database,
  FileText,
  GitCompare,
  Layers3,
  RefreshCw,
  Server
} from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';
import LoadingSpinner from '../components/LoadingSpinner';
import { apiClient } from '../lib/api';
import {
  EvaluationDataHealth,
  EvaluationLatest,
  EvaluationMetricComparison,
  EvaluationRunSummary,
  EvaluationRuns
} from '../lib/types';

type EvaluationState = {
  latest: EvaluationLatest | null;
  health: EvaluationDataHealth | null;
  runs: EvaluationRuns | null;
  loading: boolean;
  error: string | null;
};

const numberFormatter = new Intl.NumberFormat('en-US');

const EvaluationPage = () => {
  const [state, setState] = useState<EvaluationState>({
    latest: null,
    health: null,
    runs: null,
    loading: true,
    error: null
  });

  const loadEvaluation = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: null }));

    try {
      const [latestResponse, healthResponse, runsResponse] = await Promise.all([
        apiClient.getEvaluationLatest(),
        apiClient.getEvaluationDataHealth(),
        apiClient.getEvaluationRuns(5)
      ]);

      if (!latestResponse.success || !latestResponse.data) {
        throw new Error(latestResponse.error || 'Evaluation summary is unavailable.');
      }
      if (!healthResponse.success || !healthResponse.data) {
        throw new Error(healthResponse.error || 'Evaluation data health is unavailable.');
      }
      if (!runsResponse.success || !runsResponse.data) {
        throw new Error(runsResponse.error || 'Evaluation runs are unavailable.');
      }

      setState({
        latest: latestResponse.data,
        health: healthResponse.data,
        runs: runsResponse.data,
        loading: false,
        error: null
      });
    } catch {
      setState(current => ({
        ...current,
        loading: false,
        error: 'Could not load evaluation data. Check that the API is running and the database is reachable.'
      }));
    }
  }, []);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  const warnings = useMemo(() => {
    return [
      ...(state.latest?.warnings ?? []),
      ...(state.health?.warnings ?? []),
      ...(state.runs?.warnings ?? [])
    ].filter((warning, index, allWarnings) => allWarnings.indexOf(warning) === index);
  }, [state.latest, state.health, state.runs]);

  if (state.loading) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading evaluation dashboard..." />
      </div>
    );
  }

  if (state.error) {
    return (
      <ErrorMessage
        title="Evaluation Dashboard Unavailable"
        message={state.error}
        action={{
          label: 'Retry',
          onClick: loadEvaluation
        }}
      />
    );
  }

  const latestRun = state.latest?.latestRun ?? null;
  const coverage = state.health?.coverage ?? null;
  const requiredCommands = state.latest?.requiredCommands ?? state.health?.requiredCommands ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-blue-700" />
            <h1 className="text-3xl font-bold text-gray-950">Model Evaluation</h1>
          </div>
          <p className="mt-2 max-w-3xl text-gray-600">
            Transparent prediction quality, baseline comparison, data coverage, and pipeline status.
          </p>
        </div>
        <button
          onClick={loadEvaluation}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {warnings.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
            <div>
              <h2 className="font-semibold text-amber-950">Data Warnings</h2>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {warnings.map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {!latestRun && (
        <EmptyEvaluationState commands={requiredCommands} />
      )}

      {latestRun && (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="MAE" comparison={latestRun.mae} />
            <MetricCard title="RMSE" comparison={latestRun.rmse} />
            <SummaryCard
              label="Backtest Rows"
              value={formatCount(latestRun.backtestRows)}
              detail={`${latestRun.evaluatedGameweekCount} evaluated gameweeks`}
              icon={<FileText className="h-5 w-5" />}
            />
            <SummaryCard
              label="Baseline Status"
              value={formatBaselineStatus(latestRun)}
              detail="Lower MAE and RMSE are better"
              icon={<GitCompare className="h-5 w-5" />}
            />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-blue-700" />
              <h2 className="text-xl font-semibold text-gray-950">Latest Run Metadata</h2>
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetadataItem label="Model" value={latestRun.modelName} />
              <MetadataItem label="Version" value={latestRun.modelVersion} />
              <MetadataItem label="Evaluation Type" value={latestRun.evaluationType} />
              <MetadataItem label="Evaluation Key" value={shortenKey(latestRun.evaluationKey)} />
              <MetadataItem label="Created" value={formatDateTime(latestRun.createdAt)} />
              <MetadataItem label="Updated" value={formatDateTime(latestRun.updatedAt)} />
              <MetadataItem label="Skipped Gameweeks" value={formatCount(latestRun.skippedGameweekCount)} />
              <MetadataItem
                label="Prediction Run"
                value={state.latest?.latestPredictionRun ? shortenKey(state.latest.latestPredictionRun.runKey) : 'Not loaded'}
              />
            </dl>
          </section>
        </>
      )}

      {coverage && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-700" />
            <h2 className="text-xl font-semibold text-gray-950">Data Coverage</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <CoverageCard label="Players" value={coverage.players} />
            <CoverageCard label="Teams" value={coverage.teams} />
            <CoverageCard label="Gameweeks" value={coverage.gameweeks} />
            <CoverageCard label="Fixtures" value={coverage.fixtures} />
            <CoverageCard label="History Rows" value={coverage.playerGameweekHistoryRows} />
            <CoverageCard label="Prediction Rows" value={coverage.latestPredictionRows} />
          </div>
        </section>
      )}

      <PipelineTransparency />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Limitations limitations={state.latest?.limitations ?? []} />
        <RecentRuns runs={state.runs?.runs ?? []} />
      </section>
    </div>
  );
};

type MetricCardProps = {
  title: string;
  comparison: EvaluationMetricComparison;
};

const MetricCard = ({ title, comparison }: MetricCardProps) => {
  const status = metricStatus(comparison);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{formatMetric(comparison.modelValue)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>
      <div className="mt-4 space-y-1 text-sm text-gray-600">
        <div className="flex justify-between gap-3">
          <span>Baseline</span>
          <span className="font-medium text-gray-900">{formatMetric(comparison.baselineValue)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Difference vs baseline</span>
          <span className="font-medium text-gray-900">{formatSignedMetric(comparison.differenceVsBaseline)}</span>
        </div>
      </div>
    </div>
  );
};

type SummaryCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
};

const SummaryCard = ({ label, value, detail, icon }: SummaryCardProps) => (
  <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2 text-blue-700">{icon}</div>
    <p className="mt-3 text-sm font-medium text-gray-600">{label}</p>
    <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>
    <p className="mt-2 text-sm text-gray-500">{detail}</p>
  </div>
);

type CoverageCardProps = {
  label: string;
  value: number | null;
};

const CoverageCard = ({ label, value }: CoverageCardProps) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-sm font-medium text-gray-600">{label}</p>
    <p className="mt-2 text-2xl font-bold text-gray-950">{formatCount(value)}</p>
  </div>
);

type MetadataItemProps = {
  label: string;
  value: string;
};

const MetadataItem = ({ label, value }: MetadataItemProps) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
  </div>
);

const EmptyEvaluationState = ({ commands }: { commands: string[] }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-1 h-5 w-5 flex-shrink-0 text-amber-700" />
      <div>
        <h2 className="text-xl font-semibold text-gray-950">No Evaluation Data Loaded</h2>
        <p className="mt-2 text-gray-600">
          Generate the model artifacts, run the backtest, and load predictions into PostgreSQL before reviewing model quality.
        </p>
        <div className="mt-4 grid gap-2">
          {commands.map(command => (
            <code key={command} className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
              {command}
            </code>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const PipelineTransparency = () => {
  const steps = [
    {
      title: 'Bronze',
      description: 'Raw official FPL ingestion is preserved with source metadata and timestamps.'
    },
    {
      title: 'Silver',
      description: 'Players, teams, gameweeks, and fixtures are normalized into stable typed records.'
    },
    {
      title: 'Gold',
      description: 'Feature-ready player and fixture rows are prepared without post-deadline outcomes.'
    },
    {
      title: 'Feature Engineering',
      description: 'Expected-points features use pre-deadline form, minutes, availability, and fixture context.'
    },
    {
      title: 'Backtesting',
      description: 'Walk-forward evaluation compares model errors against the recent-points baseline.'
    },
    {
      title: 'Prediction Serving',
      description: 'Loaded prediction rows feed deterministic optimizer endpoints and preserve run metadata.'
    }
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Layers3 className="h-5 w-5 text-blue-700" />
        <h2 className="text-xl font-semibold text-gray-950">Pipeline Transparency</h2>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {steps.map(step => (
          <div key={step.title} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

const Limitations = ({ limitations }: { limitations: string[] }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <div className="flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-700" />
      <h2 className="text-xl font-semibold text-gray-950">Limitations</h2>
    </div>
    <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-700">
      {(limitations.length > 0 ? limitations : defaultLimitations).map(limit => (
        <li key={limit}>{limit}</li>
      ))}
    </ul>
  </section>
);

const RecentRuns = ({ runs }: { runs: EvaluationRunSummary[] }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <div className="flex items-center gap-3">
      <FileText className="h-5 w-5 text-blue-700" />
      <h2 className="text-xl font-semibold text-gray-950">Recent Evaluation Runs</h2>
    </div>
    {runs.length === 0 ? (
      <p className="mt-4 text-sm text-gray-600">No evaluation runs are loaded.</p>
    ) : (
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-4 font-semibold">Run</th>
              <th className="py-2 pr-4 font-semibold">MAE</th>
              <th className="py-2 pr-4 font-semibold">RMSE</th>
              <th className="py-2 pr-4 font-semibold">Rows</th>
              <th className="py-2 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.map(run => (
              <tr key={run.id}>
                <td className="py-3 pr-4 font-medium text-gray-900">{run.id}</td>
                <td className="py-3 pr-4 text-gray-700">{formatMetric(run.mae.modelValue)}</td>
                <td className="py-3 pr-4 text-gray-700">{formatMetric(run.rmse.modelValue)}</td>
                <td className="py-3 pr-4 text-gray-700">{formatCount(run.backtestRows)}</td>
                <td className="py-3 text-gray-700">{formatDateTime(run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const defaultLimitations = [
  'Model quality is evaluated against a recent-points baseline.',
  'The current model should not be treated as clearly better unless it is lower than the baseline on both MAE and RMSE.',
  'Optimizer recommendations use deterministic FPL rule checks and loaded prediction rows.',
  'Predictions are decision support estimates, not certainty.'
];

function metricStatus(comparison: EvaluationMetricComparison): { label: string; className: string } {
  if (comparison.modelBeatsBaseline === null) {
    return {
      label: 'Missing baseline',
      className: 'border-gray-200 bg-gray-50 text-gray-700'
    };
  }

  if (comparison.modelBeatsBaseline) {
    return {
      label: 'Model lower',
      className: 'border-green-200 bg-green-50 text-green-800'
    };
  }

  return {
    label: 'Baseline lower',
    className: 'border-red-200 bg-red-50 text-red-800'
  };
}

function formatBaselineStatus(run: EvaluationRunSummary): string {
  if (run.mae.modelBeatsBaseline === true && run.rmse.modelBeatsBaseline === true) {
    return 'Model lower on both';
  }
  return 'Not clearly better';
}

function formatMetric(value: number | null): string {
  return value === null ? 'Unavailable' : value.toFixed(4);
}

function formatSignedMetric(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `${value > 0 ? '+' : ''}${value.toFixed(4)}`;
}

function formatCount(value: number | null): string {
  return value === null ? 'Not loaded' : numberFormatter.format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function shortenKey(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 14)}...`;
}

export default EvaluationPage;
