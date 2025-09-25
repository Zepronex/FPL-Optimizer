import pandas as pd
import numpy as np
from fpl_predictor import FPLPredictor
from data_collector import FPLDataCollector
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Test the true ML model predictions"""
    # Load the trained model
    model = FPLPredictor()
    if not model.load_model():
        print("❌ Model not found. Please train the model first.")
        return
    
    # Collect current data
    collector = FPLDataCollector()
    current_gw = collector.get_current_gameweek()
    
    # Load historical data
    data_files = [f for f in collector.load_data.__globals__['os'].listdir("data") if f.startswith("fpl_historical_data_")]
    if not data_files:
        print("❌ No historical data found. Please collect data first.")
        return
    
    latest_file = sorted(data_files)[-1]
    df = collector.load_data(latest_file)
    
    # Make predictions for next gameweek
    try:
        predictions = model.predict_next_gameweek(df, current_gw)
        
        # Sort by predicted points
        predictions = predictions.sort_values('predicted_points', ascending=False)
        
        print("🧠 True ML Model Predictions for Next Gameweek")
        print("=" * 60)
        print(f"📊 Predicting Gameweek {current_gw + 1}")
        print(f"👥 Total players predicted: {len(predictions)}")
        print()
        
        # Show top predictions by position
        positions = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
        
        for pos_id, pos_name in positions.items():
            pos_predictions = predictions[predictions['position'] == pos_id].head(5)
            if len(pos_predictions) > 0:
                print(f"🏆 Top 5 {pos_name}s:")
                for i, (_, player) in enumerate(pos_predictions.iterrows(), 1):
                    print(f"  {i}. {player['name']:<25} £{player['price']:5.1f} "
                          f"Pred: {player['predicted_points']:5.2f}")
                print()
        
        # Show overall top 10
        print("🌟 Overall Top 10 Predictions:")
        for i, (_, player) in enumerate(predictions.head(10).iterrows(), 1):
            pos_name = positions.get(player['position'], "UNK")
            print(f"  {i:2d}. {player['name']:<25} {pos_name:<3} £{player['price']:5.1f} "
                  f"Pred: {player['predicted_points']:5.2f}")
        
        print()
        print("✅ True ML predictions complete!")
        
    except Exception as e:
        logger.error(f"Error making predictions: {e}")
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()

