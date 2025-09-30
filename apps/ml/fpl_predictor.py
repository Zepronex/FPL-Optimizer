import pandas as pd
import numpy as np
import joblib
import os
from typing import List, Dict, Any, Tuple
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.ensemble import RandomForestRegressor
import logging
from datetime import datetime

# configure logging for model training and prediction
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FPLPredictor:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.feature_columns = None
        self.target_column = 'next_gameweek_points'
        
    def create_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """create rolling averages and trend features for better predictions"""
        df = df.copy()
        
        # sort by player and gameweek for rolling calculations
        df = df.sort_values(['player_id', 'gameweek'])
        
        # create rolling averages for form and minutes over different windows
        for window in [3, 5, 10]:
            df[f'points_avg_{window}'] = df.groupby('player_id')['points'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
            df[f'minutes_avg_{window}'] = df.groupby('player_id')['minutes'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
            df[f'goals_avg_{window}'] = df.groupby('player_id')['goals_scored'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
            df[f'assists_avg_{window}'] = df.groupby('player_id')['assists'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
            df[f'ict_avg_{window}'] = df.groupby('player_id')['ict_index'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
            df[f'xg_avg_{window}'] = df.groupby('player_id')['expected_goals'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
            df[f'xa_avg_{window}'] = df.groupby('player_id')['expected_assists'].rolling(window=window, min_periods=1).mean().reset_index(0, drop=True)
        
        # Create form indicators
        df['form_3gw'] = df.groupby('player_id')['points'].rolling(window=3, min_periods=1).mean().reset_index(0, drop=True)
        df['form_5gw'] = df.groupby('player_id')['points'].rolling(window=5, min_periods=1).mean().reset_index(0, drop=True)
        
        # Create trend indicators
        df['points_trend'] = df.groupby('player_id')['points'].rolling(window=3, min_periods=2).apply(lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) >= 2 else 0).reset_index(0, drop=True)
        df['minutes_trend'] = df.groupby('player_id')['minutes'].rolling(window=3, min_periods=2).apply(lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) >= 2 else 0).reset_index(0, drop=True)
        
        # Create consistency indicators
        df['points_std_5'] = df.groupby('player_id')['points'].rolling(window=5, min_periods=2).std().reset_index(0, drop=True)
        df['minutes_std_5'] = df.groupby('player_id')['minutes'].rolling(window=5, min_periods=2).std().reset_index(0, drop=True)
        
        # Create price change indicators
        df['price_change_3gw'] = df.groupby('player_id')['price'].rolling(window=3, min_periods=1).apply(lambda x: x.iloc[-1] - x.iloc[0] if len(x) >= 2 else 0).reset_index(0, drop=True)
        
        # Create ownership change indicators
        df['ownership_change_3gw'] = df.groupby('player_id')['selected_by_percent'].rolling(window=3, min_periods=1).apply(lambda x: x.iloc[-1] - x.iloc[0] if len(x) >= 2 else 0).reset_index(0, drop=True)
        
        return df
    
    def create_target_variable(self, df: pd.DataFrame, prediction_horizon: int = 1) -> pd.DataFrame:
        """Create target variable for next gameweek(s) prediction"""
        df = df.copy()
        df = df.sort_values(['player_id', 'gameweek'])
        
        # Create target: points in next gameweek(s)
        df['next_gameweek_points'] = df.groupby('player_id')['points'].shift(-prediction_horizon)
        
        # For multi-gameweek prediction, sum the next N gameweeks
        if prediction_horizon > 1:
            for i in range(2, prediction_horizon + 1):
                next_points = df.groupby('player_id')['points'].shift(-i)
                df['next_gameweek_points'] += next_points.fillna(0)
        
        return df
    
    def prepare_features(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        """Prepare features for ML model"""
        # Select feature columns
        feature_cols = [
            # Current gameweek features
            'points', 'minutes', 'goals_scored', 'assists', 'clean_sheets',
            'goals_conceded', 'own_goals', 'penalties_saved', 'penalties_missed',
            'yellow_cards', 'red_cards', 'saves', 'bonus', 'bps',
            'influence', 'creativity', 'threat', 'ict_index', 'starts',
            'expected_goals', 'expected_assists', 'expected_goal_involvements',
            'expected_goals_conceded',
            
            # Rolling averages
            'points_avg_3', 'points_avg_5', 'points_avg_10',
            'minutes_avg_3', 'minutes_avg_5', 'minutes_avg_10',
            'goals_avg_3', 'goals_avg_5', 'goals_avg_10',
            'assists_avg_3', 'assists_avg_5', 'assists_avg_10',
            'ict_avg_3', 'ict_avg_5', 'ict_avg_10',
            'xg_avg_3', 'xg_avg_5', 'xg_avg_10',
            'xa_avg_3', 'xa_avg_5', 'xa_avg_10',
            
            # Form and trends
            'form_3gw', 'form_5gw', 'points_trend', 'minutes_trend',
            'points_std_5', 'minutes_std_5',
            
            # Price and ownership changes
            'price_change_3gw', 'ownership_change_3gw',
            
            # Static features
            'position', 'price', 'selected_by_percent', 'value_form', 'value_season',
            
            # Fixture features
            'fixture_difficulty', 'is_home'
        ]
        
        # Filter existing columns
        existing_cols = [col for col in feature_cols if col in df.columns]
        self.feature_columns = existing_cols
        
        # Prepare features
        X = df[existing_cols].copy()
        
        # Handle missing values
        X = X.fillna(0)
        
        # Handle infinite values
        X = X.replace([np.inf, -np.inf], 0)
        
        return X, existing_cols
    
    def train_model(self, df: pd.DataFrame, prediction_horizon: int = 1) -> Dict[str, float]:
        """Train the ML model with proper time series validation"""
        logger.info("Preparing data for training...")
        
        # Create time-based features
        df = self.create_time_features(df)
        
        # Create target variable
        df = self.create_target_variable(df, prediction_horizon)
        
        # Remove rows with missing targets (last N gameweeks for each player)
        df = df.dropna(subset=['next_gameweek_points'])
        
        # Prepare features
        X, feature_cols = self.prepare_features(df)
        y = df['next_gameweek_points']
        
        logger.info(f"Training data: {len(X)} samples, {len(feature_cols)} features")
        
        # Use TimeSeriesSplit for proper time series validation
        tscv = TimeSeriesSplit(n_splits=5)
        
        # Split data by gameweek for time series validation
        unique_gameweeks = sorted(df['gameweek'].unique())
        train_size = int(len(unique_gameweeks) * 0.8)
        train_gameweeks = unique_gameweeks[:train_size]
        test_gameweeks = unique_gameweeks[train_size:]
        
        # Create train/test splits
        train_mask = df['gameweek'].isin(train_gameweeks)
        test_mask = df['gameweek'].isin(test_gameweeks)
        
        X_train, X_test = X[train_mask], X[test_mask]
        y_train, y_test = y[train_mask], y[test_mask]
        
        logger.info(f"Train set: {len(X_train)} samples")
        logger.info(f"Test set: {len(X_test)} samples")
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train Random Forest model
        logger.info("Training Random Forest model...")
        self.model = RandomForestRegressor(
            n_estimators=200,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        
        # Train the model
        self.model.fit(X_train_scaled, y_train)
        
        # Evaluate model
        y_pred = self.model.predict(X_test_scaled)
        
        metrics = {
            'mse': mean_squared_error(y_test, y_pred),
            'mae': mean_absolute_error(y_test, y_pred),
            'r2': r2_score(y_test, y_pred),
            'rmse': np.sqrt(mean_squared_error(y_test, y_pred))
        }
        
        logger.info("Model Performance:")
        logger.info(f"  MSE: {metrics['mse']:.4f}")
        logger.info(f"  MAE: {metrics['mae']:.4f}")
        logger.info(f"  R²: {metrics['r2']:.4f}")
        logger.info(f"  RMSE: {metrics['rmse']:.4f}")
        
        # Feature importance
        feature_importance = pd.DataFrame({
            'feature': feature_cols,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)
        
        logger.info("Top 10 Most Important Features:")
        for _, row in feature_importance.head(10).iterrows():
            logger.info(f"  {row['feature']}: {row['importance']:.4f}")
        
        return metrics
    
    def predict_next_gameweek(self, df: pd.DataFrame, gameweek: int) -> pd.DataFrame:
        """Predict points for next gameweek"""
        if self.model is None:
            raise ValueError("Model not trained. Call train_model() first.")
        
        # Get the latest available gameweek data (not the target gameweek)
        max_gameweek = df['gameweek'].max()
        latest_data = df[df['gameweek'] == max_gameweek].copy()
        
        if len(latest_data) == 0:
            raise ValueError(f"No data found for latest gameweek {max_gameweek}")
        
        # Create time-based features
        latest_data = self.create_time_features(latest_data)
        
        # Prepare features
        X, _ = self.prepare_features(latest_data)
        
        # Scale features
        X_scaled = self.scaler.transform(X)
        
        # Make predictions
        predictions = self.model.predict(X_scaled)
        
        # Create results dataframe
        results = latest_data[['player_id', 'name', 'position', 'price', 'team']].copy()
        results['predicted_points'] = predictions
        results['gameweek'] = gameweek + 1
        
        return results
    
    def save_model(self, model_dir: str = "models") -> None:
        """Save the trained model"""
        os.makedirs(model_dir, exist_ok=True)
        
        # Save model
        model_path = os.path.join(model_dir, "fpl_model.pkl")
        joblib.dump(self.model, model_path)
        
        # Save scaler
        scaler_path = os.path.join(model_dir, "fpl_scaler.pkl")
        joblib.dump(self.scaler, scaler_path)
        
        # Save feature columns
        features_path = os.path.join(model_dir, "fpl_features.pkl")
        joblib.dump(self.feature_columns, features_path)
        
        logger.info(f"Model saved to {model_dir}/")
    
    def load_model(self, model_dir: str = "models") -> bool:
        """Load the trained model"""
        try:
            # Load model
            model_path = os.path.join(model_dir, "fpl_model.pkl")
            self.model = joblib.load(model_path)
            
            # Load scaler
            scaler_path = os.path.join(model_dir, "fpl_scaler.pkl")
            self.scaler = joblib.load(scaler_path)
            
            # Load feature columns
            features_path = os.path.join(model_dir, "fpl_features.pkl")
            self.feature_columns = joblib.load(features_path)
            
            logger.info("True ML model loaded successfully")
            return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False

def main():
    """Main function to train the true ML model"""
    from data_collector import FPLDataCollector
    
    # Collect data
    collector = FPLDataCollector()
    current_gw = collector.get_current_gameweek()
    
    # Try to load existing data first
    data_files = [f for f in os.listdir("data") if f.startswith("fpl_historical_data_")]
    if data_files:
        latest_file = sorted(data_files)[-1]
        logger.info(f"Loading existing data: {latest_file}")
        df = collector.load_data(latest_file)
    else:
        logger.info("No existing data found. Collecting new data...")
        df = collector.collect_historical_data(start_gameweek=1, end_gameweek=current_gw)
        collector.save_data(df)
    
    # Train model
    model = FPLPredictor()
    metrics = model.train_model(df, prediction_horizon=1)
    
    # Save model
    model.save_model()
    
    print("True ML model training complete!")
    print(f"Model performance: R² = {metrics['r2']:.4f}, RMSE = {metrics['rmse']:.4f}")

if __name__ == "__main__":
    main()
