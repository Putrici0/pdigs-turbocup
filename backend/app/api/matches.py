from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.utils import serialize_firestore
from backend.app.logic.simulator import update_participant_stats

matches_bp = Blueprint('matches', __name__)


def _resolve_pending_predictions(match_id, actual_winner_id):
    """Auto-resolve any pending predictions for a resolved match."""
    pred_docs = list(
        db.collection("predictions")
        .where(filter=FieldFilter("match_id", "==", match_id))
        .where(filter=FieldFilter("is_correct", "==", None))
        .limit(1)
        .stream()
    )
    if not pred_docs:
        return
    pred_doc = pred_docs[0]
    pred_data = pred_doc.to_dict()
    predicted = pred_data.get("predicted_winner_id")
    is_correct = (predicted == actual_winner_id)
    pred_doc.reference.update({
        "actual_winner_id": actual_winner_id,
        "is_correct": is_correct,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    })


@matches_bp.route('/', methods=['GET'])
def get_matches():
    tournament_id = request.args.get('tournament_id') if hasattr(request, 'args') else None

    if tournament_id:
        docs = db.collection("matches").where(
            filter=FieldFilter("tournament_id", "==", tournament_id)
        ).stream()
    else:
        docs = db.collection("matches").stream()

    results = []
    for d in docs:
        data = d.to_dict()
        data["id"] = d.id
        results.append(data)
    return jsonify(results), 200


@matches_bp.route('/<match_id>', methods=['GET'])
def get_match(match_id):
    doc = db.collection("matches").document(match_id).get()
    if not doc.exists:
        return jsonify({"message": "Match not found"}), 404
    data = doc.to_dict()
    data["id"] = doc.id
    return jsonify(data), 200


@matches_bp.route('/<match_id>/result', methods=['PUT'])
def submit_match_result(match_id):
    data = request.get_json(silent=True) or {}

    winner_id = data.get('winner_id')
    winner_name = data.get('winner_name')
    team_a_time = data.get('team_a_time')
    team_b_time = data.get('team_b_time')
    section_times_a = data.get('section_times_a', {})
    section_times_b = data.get('section_times_b', {})

    if not winner_id:
        return jsonify({"message": "Missing winner_id"}), 400

    match_ref = db.collection("matches").document(match_id)
    match_doc = match_ref.get()
    if not match_doc.exists:
        return jsonify({"message": "Match not found"}), 404

    match_data = match_doc.to_dict()

    match_ref.update({
        "winner_id": winner_id,
        "winner_name": winner_name or "TBD",
        "team_a_time": team_a_time,
        "team_b_time": team_b_time,
        "status": "past"
    })

    batch = db.batch()
    a_id = match_data.get("team_a_id")
    b_id = match_data.get("team_b_id")

    if a_id:
        batch.set(db.collection("match_stats").document(), {
            "match_id": match_id,
            "team_id": a_id,
            "section_times": section_times_a,
            "total_time": team_a_time
        })
    if b_id:
        batch.set(db.collection("match_stats").document(), {
            "match_id": match_id,
            "team_id": b_id,
            "section_times": section_times_b,
            "total_time": team_b_time
        })
    batch.commit()

    _resolve_pending_predictions(match_id, winner_id)

    team_refs = []
    if a_id:
        team_refs.append(db.collection("teams").document(a_id))
    if b_id:
        team_refs.append(db.collection("teams").document(b_id))

    teams_map = {}
    for doc in db.get_all(team_refs):
        if doc and doc.exists:
            teams_map[doc.id] = {**doc.to_dict(), "id": doc.id}

    batch2 = db.batch()
    for tid, team_data in teams_map.items():
        update_participant_stats(batch2, db, team_data, winner_id)
    batch2.commit()

    return jsonify({"message": "Result submitted successfully"}), 200
