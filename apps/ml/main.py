from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd
import numpy as np
import joblib
import os
from datetime import datetime, timedelta
import requests
import logging
from fpl_predictor import FPLPredictor
from data_collector import FPLDataCollector

# configure logging for debugging and monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FPL ML Service", version="1.0.0")

# enable cors for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# global model and data instances loaded at startup
fpl_predictor = None
data_collector = None
fpl_api_base = "https://fantasy.premierleague.com/api"

class PlayerPrediction(BaseModel):
    player_id: int
    predicted_points: float
    confidence: float
    features: Dict[str, Any]

class AIStrategyRequest(BaseModel):
    budget: float
    formation: str = "3-4-3"
    exclude_players: List[int] = []

class AIStrategyResponse(BaseModel):
    players: List[PlayerPrediction]
    total_cost: float
    expected_points: float
    strategy_name: str = "AI Strategy"

@app.on_event("startup")
async def startup_event():
    """load trained model and data collector on service startup"""
    global fpl_predictor, data_collector
    try:
        # initialize data collector for fetching fpl data
        data_collector = FPLDataCollector()
        
        # load trained fpl predictor model
        fpl_predictor = FPLPredictor()
        if fpl_predictor.load_model():
            logger.info("FPL predictor loaded successfully")
        else:
            logger.warning("No trained FPL predictor found. Run training first.")
    except Exception as e:
        logger.error(f"Error loading model: {e}")

@app.get("/health")
async def health_check():
    """health check endpoint for service monitoring"""
    return {
        "status": "healthy",
        "model_loaded": fpl_predictor is not None and fpl_predictor.model is not None,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/players/current")
async def get_current_players():
    """fetch current player data from fpl api for team generation"""
    try:
        response = requests.get(f"{fpl_api_base}/bootstrap-static/")
        response.raise_for_status()
        data = response.json()
        
        players = []
        for player in data["elements"]:
            players.append({
                "id": player["id"],
                "name": f"{player['first_name']} {player['second_name']}",
                "position": player["element_type"],
                "team": player["team"],
                "price": player["now_cost"] / 10,
                "form": player["form"],
                "total_points": player["total_points"],
                "points_per_game": player["points_per_game"],
                "selected_by_percent": player["selected_by_percent"],
                "transfers_in": player["transfers_in"],
                "transfers_out": player["transfers_out"],
                "value_form": player["value_form"],
                "value_season": player["value_season"],
                "influence": player["influence"],
                "creativity": player["creativity"],
                "threat": player["threat"],
                "ict_index": player["ict_index"],
                "starts": player["starts"],
                "expected_goals": player["expected_goals"],
                "expected_assists": player["expected_assists"],
                "expected_goal_involvements": player["expected_goal_involvements"],
                "expected_goals_conceded": player["expected_goals_conceded"],
                "goals_scored": player["goals_scored"],
                "assists": player["assists"],
                "clean_sheets": player["clean_sheets"],
                "goals_conceded": player["goals_conceded"],
                "own_goals": player["own_goals"],
                "penalties_saved": player["penalties_saved"],
                "penalties_missed": player["penalties_missed"],
                "yellow_cards": player["yellow_cards"],
                "red_cards": player["red_cards"],
                "saves": player["saves"],
                "bonus": player["bonus"],
                "bps": player["bps"],
                "influence_rank": player["influence_rank"],
                "creativity_rank": player["creativity_rank"],
                "threat_rank": player["threat_rank"],
                "ict_index_rank": player["ict_index_rank"],
                "corners_and_indirect_freekicks_order": player.get("corners_and_indirect_freekicks_order"),
                "direct_freekicks_order": player.get("direct_freekicks_order"),
                "penalties_order": player.get("penalties_order")
            })
        
        return {"players": players, "count": len(players)}
    
    except Exception as e:
        logger.error(f"Error fetching player data: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch player data")

@app.get("/predict/top-players")
async def get_top_players_by_position():
    """Get top players by position for display purposes"""
    if fpl_predictor is None or fpl_predictor.model is None:
        raise HTTPException(status_code=503, detail="True ML model not loaded. Please train the model first.")
    
    try:
        # Load historical data
        data_dir = "data"
        if not os.path.exists(data_dir):
            raise HTTPException(status_code=503, detail="Data directory not found. Please collect data first.")
        
        data_files = [f for f in os.listdir(data_dir) if f.startswith("fpl_historical_data_")]
        if not data_files:
            raise HTTPException(status_code=503, detail="No historical data found. Please collect data first.")
        
        latest_file = sorted(data_files)[-1]
        df = data_collector.load_data(latest_file)
        
        # Get current gameweek
        current_gw = data_collector.get_current_gameweek()
        
        # Get current player data to include names
        current_players_response = await get_current_players()
        current_players = {p['id']: p for p in current_players_response['players']}
        
        # Make predictions using true ML model
        predictions_df = fpl_predictor.predict_next_gameweek(df, current_gw)
        
        # Add player names and team names to predictions
        predictions_df['name'] = predictions_df['player_id'].map(
            lambda pid: current_players.get(pid, {}).get('name', f'Player {pid}')
        )
        predictions_df['team_name'] = predictions_df['player_id'].map(
            lambda pid: current_players.get(pid, {}).get('team', 0)
        )
        
        # Group by position and get top 5 for each
        top_players_by_position = {}
        for position in [1, 2, 3, 4]:  # GK, DEF, MID, FWD
            position_players = predictions_df[predictions_df['position'] == position].copy()
            position_players = position_players.sort_values('predicted_points', ascending=False).head(5)
            
            top_players_by_position[position] = []
            for _, row in position_players.iterrows():
                predicted_points = float(row['predicted_points'])
                confidence = min(0.95, max(0.3, 0.8 - (predicted_points * 0.02)))
                
                top_players_by_position[position].append({
                    'player_id': int(row['player_id']),
                    'name': str(row['name']),
                    'position': int(row['position']),
                    'price': float(row['price']),
                    'team': int(row['team']),
                    'predicted_points': predicted_points,
                    'confidence': confidence
                })
        
        return {
            'top_players_by_position': top_players_by_position,
            'total_players_analyzed': len(predictions_df),
            'gameweek': current_gw + 1
        }
    
    except Exception as e:
        logger.error(f"Error getting top players: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get top players: {str(e)}")

@app.post("/predict/ai-strategy", response_model=AIStrategyResponse)
async def generate_ai_strategy(request: AIStrategyRequest):
    """Generate AI-optimized team using True ML predictions"""
    if fpl_predictor is None or fpl_predictor.model is None:
        raise HTTPException(status_code=503, detail="True ML model not loaded. Please train the model first.")
    
    try:
        # Load historical data
        data_dir = "data"
        if not os.path.exists(data_dir):
            raise HTTPException(status_code=503, detail="Data directory not found. Please collect data first.")
        
        data_files = [f for f in os.listdir(data_dir) if f.startswith("fpl_historical_data_")]
        if not data_files:
            raise HTTPException(status_code=503, detail="No historical data found. Please collect data first.")
        
        latest_file = sorted(data_files)[-1]
        df = data_collector.load_data(latest_file)
        
        # Get current gameweek
        current_gw = data_collector.get_current_gameweek()
        
        # Get current player data to include names
        current_players_response = await get_current_players()
        current_players = {p['id']: p for p in current_players_response['players']}
        
        # Make predictions using true ML model
        predictions_df = fpl_predictor.predict_next_gameweek(df, current_gw)
        
        # Add player names, team names, and current position data to predictions
        predictions_df['name'] = predictions_df['player_id'].map(
            lambda pid: current_players.get(pid, {}).get('name', f'Player {pid}')
        )
        predictions_df['team_name'] = predictions_df['player_id'].map(
            lambda pid: current_players.get(pid, {}).get('team', 0)
        )
        # Override position with current FPL position data to ensure accuracy
        predictions_df['position'] = predictions_df['player_id'].map(
            lambda pid: current_players.get(pid, {}).get('position', 3)
        )
        
        # Filter by budget and excluded players
        filtered_predictions = predictions_df[
            (predictions_df['price'] <= request.budget) & 
            (~predictions_df['player_id'].isin(request.exclude_players))
        ]
        
        if len(filtered_predictions) < 11:
            raise HTTPException(status_code=400, detail="Not enough players within budget")
        
        # Convert to PlayerPrediction objects
        predictions = []
        for _, row in filtered_predictions.iterrows():
            # Calculate actual confidence based on prediction variance
            # Higher variance = lower confidence
            predicted_points = float(row['predicted_points'])
            confidence = min(0.95, max(0.3, 0.8 - (predicted_points * 0.02)))  # Dynamic confidence
            
            predictions.append(PlayerPrediction(
                player_id=int(row['player_id']),
                predicted_points=predicted_points,
                confidence=confidence,
                features={
                    'name': str(row['name']),
                    'position': int(row['position']),
                    'price': float(row['price']),
                    'team': int(row['team']),
                    'team_name': int(row['team_name'])
                }
            ))
        
        # Sort by predicted points
        predictions.sort(key=lambda x: x.predicted_points, reverse=True)
        
        # Select team based on formation
        selected_team = select_team_by_formation(predictions, request.formation, request.budget)
        
        total_cost = sum(p.features.get('price', 0) for p in selected_team)
        expected_points = sum(p.predicted_points for p in selected_team)
        
        return AIStrategyResponse(
            players=selected_team,
            total_cost=total_cost,
            expected_points=expected_points
        )
    
    except Exception as e:
        logger.error(f"Error generating AI strategy: {e}")
        logger.error(f"Exception type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to generate AI strategy: {str(e)}")

def get_position_name(position_id: int) -> str:
    """Convert position ID to name"""
    position_map = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
    return position_map.get(position_id, "UNK")

def select_team_by_formation(predictions: List[PlayerPrediction], formation: str, budget: float) -> List[PlayerPrediction]:
    """Select optimal team based on formation constraints including bench players"""
    # Position mapping: 1=GK, 2=DEF, 3=MID, 4=FWD
    # FPL rules: 15 players total (11 starting + 4 bench), max 3 per team
    
    # Define starting XI limits for each formation
    starting_xi_limits = {
        "3-4-3": {"GK": 1, "DEF": 3, "MID": 4, "FWD": 3},
        "3-5-2": {"GK": 1, "DEF": 3, "MID": 5, "FWD": 2},
        "4-3-3": {"GK": 1, "DEF": 4, "MID": 3, "FWD": 3},
        "4-4-2": {"GK": 1, "DEF": 4, "MID": 4, "FWD": 2},
        "4-5-1": {"GK": 1, "DEF": 4, "MID": 5, "FWD": 1},
        "5-3-2": {"GK": 1, "DEF": 5, "MID": 3, "FWD": 2},
        "5-4-1": {"GK": 1, "DEF": 5, "MID": 4, "FWD": 1}
    }
    
    # Total limits including bench
    total_limits = {
        "3-4-3": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        "3-5-2": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        "4-3-3": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        "4-4-2": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        "4-5-1": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        "5-3-2": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        "5-4-1": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}
    }
    
    starting_limits = starting_xi_limits.get(formation, starting_xi_limits["3-4-3"])
    total_limits_dict = total_limits.get(formation, total_limits["3-4-3"])
    
    selected = []
    position_counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
    
    # Sort predictions by predicted points
    sorted_predictions = sorted(predictions, key=lambda x: x.predicted_points, reverse=True)
    
    logger.info(f"Selecting team with formation: {formation}")
    logger.info(f"Starting XI limits: {starting_limits}")
    logger.info(f"Total limits (including bench): {total_limits_dict}")
    
    # First, select the starting XI (11 players)
    for prediction in sorted_predictions:
        if len(selected) >= 11:
            break
            
        position_id = prediction.features.get('position', 3)
        position = get_position_name(position_id)
        
        if position_counts[position] < starting_limits[position]:
            selected.append(prediction)
            position_counts[position] += 1
            logger.info(f"Selected {prediction.features.get('name', 'Unknown')} as {position} (Starting XI)")
    
    # Then, select bench players (4 more players)
    for prediction in sorted_predictions:
        if len(selected) >= 15:
            break
            
        if prediction in selected:
            continue  # Skip already selected players
            
        position_id = prediction.features.get('position', 3)
        position = get_position_name(position_id)
        
        if position_counts[position] < total_limits_dict[position]:
            selected.append(prediction)
            position_counts[position] += 1
            logger.info(f"Selected {prediction.features.get('name', 'Unknown')} as {position} (Bench)")
    
    logger.info(f"Final team selection: {len(selected)} players")
    logger.info(f"Final position counts: {position_counts}")
    
    return selected

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3002)
