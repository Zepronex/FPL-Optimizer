import SquadForm from '../components/SquadForm';
import type { useSquad } from '../state/useSquad';

interface SquadPageProps {
  squadState: ReturnType<typeof useSquad>;
}

const SquadPage = ({ squadState }: SquadPageProps) => {
  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold text-fpl-dark mb-2">Squad Builder</h1>
        <p className="text-gray-600">
          Build or edit your current 15-man squad. Use the search to add players to your starting XI and bench,
          then head to the Optimize Transfers page to find the best moves for the next few gameweeks.
        </p>
      </div>

      <SquadForm squadState={squadState} />
    </div>
  );
};

export default SquadPage;
