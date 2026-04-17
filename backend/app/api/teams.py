from flask import Blueprint, request, jsonify
from firebase_admin import auth

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
        if user_doc.exists:
            user_data = user_doc.to_dict() or {}
            full_name = (user_data.get('fullName') or '').strip()
            name = (user_data.get('name') or '').strip()
            surname = (user_data.get('surname') or '').strip()
            composed_name = f"{name} {surname}".strip()
            username = (user_data.get('username') or '').strip()
            email = (user_data.get('email') or '').strip()

            if full_name:
                return full_name
            if composed_name:
                return composed_name
            if username:
                return username
            if email:
                return email
    except Exception:
        pass

    # Fallback to Firebase Authentication profile when Firestore profile is missing.
    try:
        firebase_user = auth.get_user(user_id)
        display_name = (firebase_user.display_name or '').strip()
        email = (firebase_user.email or '').strip()
        if display_name:
            return display_name
        if email:
            return email
    except Exception:
        pass

    return ''


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
