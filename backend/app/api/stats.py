from flask import Blueprint, jsonify

from backend.app.db import db
from backend.app.utils import serialize_firestore

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/match/<match_id>', methods=['GET'])
def get_match_stats(match_id):
    match_ref = db.collection("matches").document(match_id)
    match = match_ref.get()

    if not match.exists:
        return jsonify({"error": "Match not found"}), 404

    data = serialize_firestore(match)
    return jsonify(data), 200
