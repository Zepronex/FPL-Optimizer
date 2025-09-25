import requests
import pandas as pd
import numpy as np
import time
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FPLDataCollector:
    def __init__(self):
        self.base_url = "https://fantasy.premierleague.com/api"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        
    def get_current_gameweek(self) -> int:
        """Get the current gameweek number"""
        try:
            response = self.session.get(f"{self.base_url}/bootstrap-static/")
            response.raise_for_status()
            data = response.json()
            
            # Find current gameweek
            for event in data['events']:
                if event['is_current']:
                    return event['id']
            
            # If no current gameweek, return the latest
            return max(event['id'] for event in data['events'])
            
        except Exception as e:
            logger.error(f"Error getting current gameweek: {e}")
            return 1
    
    def get_historical_gameweek_data(self, gameweek: int) -> List[Dict[str, Any]]:
        """Get player performance data for a specific gameweek"""
        try:
            response = self.session.get(f"{self.base_url}/event/{gameweek}/live/")
            response.raise_for_status()
            data = response.json()
            
            gameweek_data = []
            for player in data['elements']:
                player_data = {
                    'player_id': player['id'],
                    'gameweek': gameweek,
                    'points': player['stats']['total_points'],
                    'minutes': player['stats']['minutes'],
                    'goals_scored': player['stats']['goals_scored'],
                    'assists': player['stats']['assists'],
                    'clean_sheets': player['stats']['clean_sheets'],
                    'goals_conceded': player['stats']['goals_conceded'],
                    'own_goals': player['stats']['own_goals'],
                    'penalties_saved': player['stats']['penalties_saved'],
                    'penalties_missed': player['stats']['penalties_missed'],
                    'yellow_cards': player['stats']['yellow_cards'],
                    'red_cards': player['stats']['red_cards'],
                    'saves': player['stats']['saves'],
                    'bonus': player['stats']['bonus'],
                    'bps': player['stats']['bps'],
                    'influence': player['stats']['influence'],
                    'creativity': player['stats']['creativity'],
                    'threat': player['stats']['threat'],
                    'ict_index': player['stats']['ict_index'],
                    'starts': player['stats']['starts'],
                    'expected_goals': player['stats']['expected_goals'],
                    'expected_assists': player['stats']['expected_assists'],
                    'expected_goal_involvements': player['stats']['expected_goal_involvements'],
                    'expected_goals_conceded': player['stats']['expected_goals_conceded']
                }
                gameweek_data.append(player_data)
            
            return gameweek_data
            
        except Exception as e:
            logger.error(f"Error getting gameweek {gameweek} data: {e}")
            return []
    
    def get_player_static_data(self) -> Dict[int, Dict[str, Any]]:
        """Get static player data (position, team, etc.)"""
        try:
            response = self.session.get(f"{self.base_url}/bootstrap-static/")
            response.raise_for_status()
            data = response.json()
            
            players = {}
            for player in data['elements']:
                players[player['id']] = {
                    'name': f"{player['first_name']} {player['second_name']}",
                    'position': player['element_type'],  # 1=GK, 2=DEF, 3=MID, 4=FWD
                    'team': player['team'],
                    'price': player['now_cost'] / 10,
                    'selected_by_percent': player['selected_by_percent'],
                    'transfers_in': player['transfers_in'],
                    'transfers_out': player['transfers_out'],
                    'value_form': player['value_form'],
                    'value_season': player['value_season']
                }
            
            return players
            
        except Exception as e:
            logger.error(f"Error getting static player data: {e}")
            return {}
    
    def get_fixture_data(self, gameweek: int) -> List[Dict[str, Any]]:
        """Get fixture data for a specific gameweek"""
        try:
            response = self.session.get(f"{self.base_url}/fixtures/?event={gameweek}")
            response.raise_for_status()
            data = response.json()
            
            fixtures = []
            for fixture in data:
                fixtures.append({
                    'gameweek': gameweek,
                    'home_team': fixture['team_h'],
                    'away_team': fixture['team_a'],
                    'home_difficulty': fixture['team_h_difficulty'],
                    'away_difficulty': fixture['team_a_difficulty'],
                    'is_home': True  # We'll process this for each team
                })
                
                # Add away team perspective
                fixtures.append({
                    'gameweek': gameweek,
                    'home_team': fixture['team_a'],
                    'away_team': fixture['team_h'],
                    'home_difficulty': fixture['team_a_difficulty'],
                    'away_difficulty': fixture['team_h_difficulty'],
                    'is_home': False
                })
            
            return fixtures
            
        except Exception as e:
            logger.error(f"Error getting fixture data for gameweek {gameweek}: {e}")
            return []
    
    def collect_historical_data(self, start_gameweek: int = 1, end_gameweek: Optional[int] = None) -> pd.DataFrame:
        """Collect historical data for multiple gameweeks"""
        if end_gameweek is None:
            end_gameweek = self.get_current_gameweek()
        
        logger.info(f"Collecting data from gameweek {start_gameweek} to {end_gameweek}")
        
        all_data = []
        static_data = self.get_player_static_data()
        
        for gw in range(start_gameweek, end_gameweek + 1):
            logger.info(f"Collecting gameweek {gw} data...")
            
            # Get gameweek performance data
            gw_data = self.get_historical_gameweek_data(gw)
            
            # Get fixture data
            fixtures = self.get_fixture_data(gw)
            fixture_dict = {}
            for fixture in fixtures:
                fixture_dict[fixture['home_team']] = {
                    'difficulty': fixture['home_difficulty'],
                    'is_home': fixture['is_home']
                }
            
            # Combine with static data
            for player_data in gw_data:
                player_id = player_data['player_id']
                if player_id in static_data:
                    # Add static data
                    player_data.update(static_data[player_id])
                    
                    # Add fixture difficulty
                    team_id = static_data[player_id]['team']
                    if team_id in fixture_dict:
                        player_data['fixture_difficulty'] = fixture_dict[team_id]['difficulty']
                        player_data['is_home'] = fixture_dict[team_id]['is_home']
                    else:
                        player_data['fixture_difficulty'] = 3  # Default medium difficulty
                        player_data['is_home'] = True
                    
                    all_data.append(player_data)
            
            # Be respectful to the API
            time.sleep(0.1)
        
        df = pd.DataFrame(all_data)
        logger.info(f"Collected {len(df)} player-gameweek records")
        
        return df
    
    def save_data(self, df: pd.DataFrame, filename: str = None) -> str:
        """Save collected data to CSV"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"fpl_historical_data_{timestamp}.csv"
        
        filepath = os.path.join("data", filename)
        os.makedirs("data", exist_ok=True)
        
        df.to_csv(filepath, index=False)
        logger.info(f"Data saved to {filepath}")
        
        return filepath
    
    def load_data(self, filename: str) -> pd.DataFrame:
        """Load data from CSV"""
        filepath = os.path.join("data", filename)
        df = pd.read_csv(filepath)
        logger.info(f"Data loaded from {filepath}: {len(df)} records")
        
        return df

def main():
    """Main function to collect historical data"""
    collector = FPLDataCollector()
    
    # Collect data for current season (adjust gameweek range as needed)
    current_gw = collector.get_current_gameweek()
    logger.info(f"Current gameweek: {current_gw}")
    
    # Collect data from gameweek 1 to current gameweek
    df = collector.collect_historical_data(start_gameweek=1, end_gameweek=current_gw)
    
    # Save the data
    filename = collector.save_data(df)
    
    print(f"Historical data collection complete!")
    print(f"Collected {len(df)} player-gameweek records")
    print(f"Data saved to: {filename}")
    print(f"Gameweeks covered: {df['gameweek'].min()} to {df['gameweek'].max()}")
    print(f"Unique players: {df['player_id'].nunique()}")

if __name__ == "__main__":
    main()
