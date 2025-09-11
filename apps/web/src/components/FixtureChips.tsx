import { getDifficultyColor, getDifficultyText } from '../lib/format';

interface FixtureChipProps {
  difficulty: number;
  isHome: boolean;
  opponent: string;
}

const FixtureChip = ({ difficulty, isHome, opponent }: FixtureChipProps) => {
  return (
    <div className="flex items-center space-x-1">
      <span className={`badge ${getDifficultyColor(difficulty)} text-xs`}>
        {getDifficultyText(difficulty)}
      </span>
      <span className="text-xs text-gray-600">
        {isHome ? 'vs' : '@'} {opponent}
      </span>
    </div>
  );
};

interface FixtureChipsProps {
  fixtures: Array<{
    difficulty: number;
    isHome: boolean;
    opponent: string;
  }>;
  maxFixtures?: number;
}

const FixtureChips = ({ fixtures, maxFixtures = 3 }: FixtureChipsProps) => {
  const displayFixtures = fixtures.slice(0, maxFixtures);

  if (displayFixtures.length === 0) {
    return (
      <div className="text-xs text-gray-500">
        No fixtures available
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {displayFixtures.map((fixture, index) => (
        <FixtureChip
          key={index}
          difficulty={fixture.difficulty}
          isHome={fixture.isHome}
          opponent={fixture.opponent}
        />
      ))}
    </div>
  );
};

export default FixtureChips;

