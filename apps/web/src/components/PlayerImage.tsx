import { useState } from 'react';
import { EnrichedPlayer } from '../lib/types';

interface PlayerImageProps {
  player: EnrichedPlayer;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PlayerImage = ({ player, size = 'md', className = '' }: PlayerImageProps) => {
  const [imageError, setImageError] = useState(false);
  
  // Size classes
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };
  
  // Generate a placeholder image URL based on player initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };
  
  // Generate a placeholder image using a service like UI Avatars
  const getPlaceholderUrl = (name: string, teamShort: string) => {
    const initials = getInitials(name);
    const backgroundColor = getTeamColor(teamShort);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${backgroundColor}&color=fff&size=128&bold=true`;
  };
  
  // Get team color for placeholder
  const getTeamColor = (teamShort: string) => {
    const teamColors: Record<string, string> = {
      'ARS': 'EF0107', // Arsenal - Red
      'AVL': '95BFE5', // Aston Villa - Light Blue
      'BOU': 'DA020E', // Bournemouth - Red
      'BRE': 'C8102E', // Brentford - Red
      'BHA': '0057B8', // Brighton - Blue
      'CHE': '034694', // Chelsea - Blue
      'CRY': '1B458F', // Crystal Palace - Blue
      'EVE': '003399', // Everton - Blue
      'FUL': '000000', // Fulham - Black
      'LEE': 'FFCD00', // Leeds - Yellow
      'LEI': '003090', // Leicester - Blue
      'LIV': 'C8102E', // Liverpool - Red
      'MCI': '6CABDD', // Manchester City - Light Blue
      'MUN': 'DA020E', // Manchester United - Red
      'NEW': '241F20', // Newcastle - Black
      'NFO': 'DD0000', // Nottingham Forest - Red
      'SHE': 'EE2524', // Sheffield United - Red
      'SOU': 'ED1A3B', // Southampton - Red
      'TOT': '132257', // Tottenham - Navy
      'WHU': '7A263A', // West Ham - Maroon
      'WOL': 'FDB913'  // Wolves - Gold
    };
    return teamColors[teamShort] || '6B7280'; // Default gray
  };
  
  const imageUrl = player.imageUrl || getPlaceholderUrl(player.name, player.teamShort);
  
  return (
    <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-200 flex items-center justify-center ${className}`}>
      {!imageError ? (
        <img
          src={imageUrl}
          alt={player.name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-full h-full bg-gray-300 flex items-center justify-center">
          <span className="text-gray-600 font-semibold text-xs">
            {getInitials(player.name)}
          </span>
        </div>
      )}
    </div>
  );
};

export default PlayerImage;
