from flask import Blueprint, request, jsonify

from backend.app.db import db
from backend.app.models.racing_category import racing_category
from backend.app.utils import serialize_firestore

teams_bp = Blueprint('teams', __name__)

ALLOWED_CATEGORIES = [item.value for item in racing_category]


def _resolve_user_name(user_id: str) -> str:
    if not user_id:
        return ''

    try:
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists:
            return user_id

        user_data = user_doc.to_dict() or {}
        return (
                user_data.get('fullName')
                or user_data.get('username')
                or user_data.get('email')
                or user_id
        )
    except Exception:
        return user_id


def _serialize_team(doc):
    data = serialize_firestore(doc)

    pilot_id = data.get('pilot_id', '')
    copilot_id = data.get('copilot_id', '')

    data['pilot_name'] = _resolve_user_name(pilot_id) if pilot_id else ''
    data['copilot_name'] = _resolve_user_name(copilot_id) if copilot_id else ''
    data['member_count'] = int(bool(pilot_id)) + int(bool(copilot_id))

    return data


@teams_bp.route('/categories', methods=['GET'])
def list_categories():
    return jsonify({"categories": ALLOWED_CATEGORIES}), 200


@teams_bp.route('/', methods=['GET'])
def list_teams():
    teams = db.collection('teams').stream()
    data = [_serialize_team(doc) for doc in teams]
    data.sort(key=lambda item: item.get('name', '').lower())
    return jsonify(data), 200


@teams_bp.route('/<team_id>', methods=['GET'])
def get_team(team_id):
    doc = db.collection('teams').document(team_id).get()

    if not doc.exists:
        return jsonify({"message": "Team not found"}), 404

    return jsonify(_serialize_team(doc)), 200


@teams_bp.route('/', methods=['POST'])
def create_team():
    data = request.get_json()

    if not data or not all(key in data for key in ("name", "pilot_id", "copilot_id", "category")):
        return jsonify({"message": "Missing required fields: name, pilot_id, copilot_id, or category"}), 400

    if data['category'] not in ALLOWED_CATEGORIES:
        return jsonify({
            "message": f"Invalid category. Must be one of: {', '.join(ALLOWED_CATEGORIES)}"
        }), 400

    team_data = {
        "name": data['name'],
        "pilot_id": data['pilot_id'],
        "copilot_id": data['copilot_id'],
        "category": data['category']
    }

    try:
        _, doc_ref = db.collection('teams').add(team_data)
        created_team = doc_ref.get()
        return jsonify(_serialize_team(created_team)), 201

    except Exception as e:
        return jsonify({"message": f"Error creating team: {str(e)}"}), 500