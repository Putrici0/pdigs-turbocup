from flask import Blueprint, jsonify, request
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.utils import serialize_firestore

matches_bp = Blueprint('matches', __name__)


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
