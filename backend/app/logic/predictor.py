import os

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from backend.app.logic.feature_extractor import FEATURE_KEYS

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "ml_model.pkl")


def _build_feature_vector(feat_a, feat_b):
    vec = []
    for key in FEATURE_KEYS:
        vec.append(feat_a[key])
    for key in FEATURE_KEYS:
        vec.append(feat_b[key])
    return np.array([vec])


class MatchPredictor:
    def __init__(self, model=None):
        self.model = model
        self.feature_names = [f"team_a_{k}" for k in FEATURE_KEYS] + [f"team_b_{k}" for k in FEATURE_KEYS]

    def train(self, X, y):
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            min_samples_split=3,
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X, y)
        return self

    def predict_proba(self, feat_a, feat_b):
        if self.model is None:
            raise RuntimeError("Model not trained or loaded")

        X = _build_feature_vector(feat_a, feat_b)
        probs = self.model.predict_proba(X)[0]

        team_a_prob = float(probs[1])
        team_b_prob = float(probs[0])

        predicted_winner = "team_a" if team_a_prob > team_b_prob else "team_b"
        confidence = max(team_a_prob, team_b_prob)

        return {
            "team_a_win_prob": round(team_a_prob, 4),
            "team_b_win_prob": round(team_b_prob, 4),
            "predicted_winner": predicted_winner,
            "confidence": round(confidence, 4),
        }

    def save(self, path=None):
        path = path or MODEL_PATH
        os.makedirs(os.path.dirname(path), exist_ok=True)
        joblib.dump(self.model, path)

    def load(self, path=None):
        path = path or MODEL_PATH
        if not os.path.exists(path):
            return False
        self.model = joblib.load(path)
        return True
