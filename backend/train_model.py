import sys
import os

# Ensure the root project directory is in the path so we can find 'backend'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.db import db

from backend.app.logic.dataset_builder import build_dataset
from backend.app.logic.predictor import MatchPredictor


def main():
    print("=== TurboCup Match Predictor Trainer ===")
    print("Building dataset from Firestore...")

    df = build_dataset(db)

    if df is None or len(df) == 0:
        print("ERROR: No past matches found in Firestore. Cannot train model.")
        print("Run generate_data.py or mass_populate.py first to create historical data.")
        sys.exit(1)

    print(f"Found {len(df)} past matches with complete features.")

    feature_cols = [f"team_a_{k}" for k in ["win_rate", "total_wins", "matches_played", "avg_speed", "sector_1_avg", "sector_2_avg", "sector_3_avg", "recent_form_pct"]] + \
                   [f"team_b_{k}" for k in ["win_rate", "total_wins", "matches_played", "avg_speed", "sector_1_avg", "sector_2_avg", "sector_3_avg", "recent_form_pct"]]

    X = df[feature_cols].values
    y = df["team_a_won"].values

    class_dist = {0: int((y == 0).sum()), 1: int((y == 1).sum())}
    print(f"Class distribution: team_a_won={class_dist[1]}, team_b_won={class_dist[0]}")

    predictor = MatchPredictor()
    predictor.train(X, y)

    train_acc = predictor.model.score(X, y)
    print(f"Training accuracy: {train_acc:.4f}")

    predictor.save()
    print(f"Model saved to backend/app/models/ml_model.pkl")
    print("Done!")


if __name__ == "__main__":
    main()
