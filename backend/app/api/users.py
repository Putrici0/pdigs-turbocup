from firebase_admin import auth, firestore
from datetime import datetime

from flask import Blueprint, jsonify, request
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db

users_bp = Blueprint("user", __name__)

@users_bp.route('/', methods=['POST'])
def create_user():
    data = request.json

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    try:
        user = auth.create_user(
            email=email,
            password=password
        )

        uid = user.uid

        db.collection("users").document(uid).set({
            "email": email,
            "createdAt": datetime.utcnow()
        })

        return jsonify({
            "message": "User created",
            "uid": uid
        }), 201

    except auth.EmailAlreadyExistsError:
        return jsonify({"error": "Email already in use"}), 409

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@users_bp.route('/<user_id>', methods=['GET'])
def get_user(user_id):
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()

    if not user.exists:
        return jsonify({"error": "User not found"}), 404

    return jsonify(user.to_dict()), 200

@users_bp.route('/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    try:
        # 1) Delete all teams where this user is the pilot.
        pilot_team_docs = list(
            db.collection("teams").where(filter=FieldFilter("pilot_id", "==", user_id)).stream()
        )
        pilot_team_ids = {doc.id for doc in pilot_team_docs}

        for team_doc in pilot_team_docs:
            team_doc.reference.delete()

        # 2) If this user is a co-pilot in any team, remove them from that slot.
        copilot_team_docs = list(
            db.collection("teams").where(filter=FieldFilter("copilot_id", "==", user_id)).stream()
        )
        for team_doc in copilot_team_docs:
            team_doc.reference.update({"copilot_id": ""})

        # 3) Remove deleted pilot teams from tournaments to avoid dangling references.
        if pilot_team_ids:
            tournament_docs = list(db.collection("tournaments").stream())
            for tournament_doc in tournament_docs:
                tournament_data = tournament_doc.to_dict() or {}
                registered_team_ids = tournament_data.get("registered_team_ids", [])
                participants = tournament_data.get("participants", [])

                filtered_team_ids = [team_id for team_id in registered_team_ids if team_id not in pilot_team_ids]
                filtered_participants = [
                    participant
                    for participant in participants
                    if participant.get("id") not in pilot_team_ids
                ]

                if filtered_team_ids != registered_team_ids or filtered_participants != participants:
                    tournament_doc.reference.update({
                        "registered_team_ids": filtered_team_ids,
                        "participants": filtered_participants
                    })

        # 4) Delete auth account and user profile document.
        auth.delete_user(user_id)
        db.collection("users").document(user_id).delete()

        return jsonify({"message": f"User {user_id} deleted successfully"}), 200

    except auth.UserNotFoundError:
        return jsonify({"error": "User not found in Auth"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500
