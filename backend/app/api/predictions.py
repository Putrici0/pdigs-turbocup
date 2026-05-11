from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.logic.feature_extractor import extract_team_features

predictions_bp = Blueprint("predictions", __name__)

_model_cache = None

MODEL_VERSION = "1.0.0"


def _get_model():
    global _model_cache
    if _model_cache is None:
        from backend.app.logic.predictor import MatchPredictor
        _model_cache = MatchPredictor()
        if not _model_cache.load():
            _model_cache = None
    return _model_cache


@predictions_bp.route("/matches/<match_id>/predict", methods=["POST"])
def predict_match(match_id):
    match_doc = db.collection("matches").document(match_id).get()
    if not match_doc.exists:
        return jsonify({"message": "Match not found"}), 404

    md = match_doc.to_dict()

    team_a_id = md.get("team_a_id")
    team_b_id = md.get("team_b_id")
    if not team_a_id or not team_b_id:
        return jsonify({"message": "Match does not have both teams assigned"}), 400

    existing = list(
        db.collection("predictions")
        .where(filter=FieldFilter("match_id", "==", match_id))
        .limit(1)
        .stream()
    )
    if existing:
        existing_data = existing[0].to_dict()
        existing_data["id"] = existing[0].id
        return jsonify(existing_data), 200

    feat_a = extract_team_features(db, team_a_id)
    feat_b = extract_team_features(db, team_b_id)
    if not feat_a or not feat_b:
        return jsonify({"message": "Could not extract features for one or both teams"}), 400

    predictor = _get_model()
    if predictor is None:
        return jsonify({"message": "Model not trained. Run train_model.py first"}), 503

    result = predictor.predict_proba(feat_a, feat_b)

    prediction_doc = {
        "match_id": match_id,
        "tournament_id": md.get("tournament_id", ""),
        "team_a_id": team_a_id,
        "team_a_name": md.get("team_a_name", "TBD"),
        "team_b_id": team_b_id,
        "team_b_name": md.get("team_b_name", "TBD"),
        "team_a_win_prob": result["team_a_win_prob"],
        "team_b_win_prob": result["team_b_win_prob"],
        "predicted_winner_id": team_a_id if result["predicted_winner"] == "team_a" else team_b_id,
        "predicted_winner_name": md.get("team_a_name") if result["predicted_winner"] == "team_a" else md.get("team_b_name"),
        "confidence": result["confidence"],
        "model_version": MODEL_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "actual_winner_id": None,
        "is_correct": None,
    }

    ref = db.collection("predictions").document()
    ref.set(prediction_doc)
    prediction_doc["id"] = ref.id

    return jsonify(prediction_doc), 201


@predictions_bp.route("/", methods=["GET"])
def list_predictions():
    query = db.collection("predictions").order_by("created_at", direction=FieldFilter.Operator.DESCENDING)

    tournament_id = request.args.get("tournament_id")
    if tournament_id:
        query = query.where(filter=FieldFilter("tournament_id", "==", tournament_id))

    status_filter = request.args.get("status")
    if status_filter == "pending":
        query = query.where(filter=FieldFilter("is_correct", "==", None))
    elif status_filter == "resolved":
        query = query.where(filter=FieldFilter("is_correct", "!=", None))

    docs = list(query.stream())
    results = []
    for d in docs:
        data = d.to_dict()
        data["id"] = d.id
        results.append(data)

    return jsonify(results), 200


@predictions_bp.route("/<prediction_id>", methods=["GET"])
def get_prediction(prediction_id):
    doc = db.collection("predictions").document(prediction_id).get()
    if not doc.exists:
        return jsonify({"message": "Prediction not found"}), 404
    data = doc.to_dict()
    data["id"] = doc.id
    return jsonify(data), 200


@predictions_bp.route("/<prediction_id>/resolve", methods=["POST"])
def resolve_prediction(prediction_id):
    data = request.get_json(silent=True) or {}
    actual_winner_id = data.get("actual_winner_id")
    if not actual_winner_id:
        return jsonify({"message": "Missing actual_winner_id"}), 400

    doc_ref = db.collection("predictions").document(prediction_id)
    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({"message": "Prediction not found"}), 404

    pred_data = doc.to_dict()
    if pred_data.get("is_correct") is not None:
        return jsonify({"message": "Prediction already resolved"}), 409

    predicted_winner_id = pred_data.get("predicted_winner_id")
    is_correct = (predicted_winner_id == actual_winner_id)

    doc_ref.update({
        "actual_winner_id": actual_winner_id,
        "is_correct": is_correct,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    })

    updated = doc_ref.get().to_dict()
    updated["id"] = doc_ref.id
    return jsonify(updated), 200


@predictions_bp.route("/accuracy", methods=["GET"])
def get_accuracy():
    docs = list(
        db.collection("predictions")
        .where(filter=FieldFilter("is_correct", "!=", None))
        .stream()
    )

    total = len(docs)
    if total == 0:
        return jsonify({
            "total_predictions": 0,
            "correct": 0,
            "incorrect": 0,
            "accuracy": 0.0,
            "model_version": MODEL_VERSION,
        }), 200

    correct = sum(1 for d in docs if d.to_dict().get("is_correct"))
    incorrect = total - correct

    model_versions = {}
    for d in docs:
        v = d.to_dict().get("model_version", "unknown")
        if v not in model_versions:
            model_versions[v] = {"total": 0, "correct": 0}
        model_versions[v]["total"] += 1
        if d.to_dict().get("is_correct"):
            model_versions[v]["correct"] += 1

    for v in model_versions:
        model_versions[v]["accuracy"] = round(
            model_versions[v]["correct"] / model_versions[v]["total"] * 100, 2
        ) if model_versions[v]["total"] > 0 else 0.0

    return jsonify({
        "total_predictions": total,
        "correct": correct,
        "incorrect": incorrect,
        "accuracy": round(correct / total * 100, 2),
        "model_version": MODEL_VERSION,
        "by_version": model_versions,
    }), 200


@predictions_bp.route("/tournament/<tournament_id>/summary", methods=["GET"])
def get_tournament_predictions_summary(tournament_id):
    docs = list(
        db.collection("predictions")
        .where(filter=FieldFilter("tournament_id", "==", tournament_id))
        .stream()
    )

    total = len(docs)
    resolved = sum(1 for d in docs if d.to_dict().get("is_correct") is not None)
    pending = total - resolved
    correct = sum(1 for d in docs if d.to_dict().get("is_correct") is True)

    predictions = []
    for d in docs:
        data = d.to_dict()
        data["id"] = d.id
        predictions.append(data)

    return jsonify({
        "tournament_id": tournament_id,
        "total": total,
        "resolved": resolved,
        "pending": pending,
        "correct": correct,
        "accuracy": round(correct / resolved * 100, 2) if resolved > 0 else 0.0,
        "predictions": predictions,
    }), 200
