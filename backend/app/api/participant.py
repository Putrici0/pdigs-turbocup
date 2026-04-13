from datetime import datetime

from flask import Blueprint, jsonify, request
from firebase_admin import firestore

participants_bp = Blueprint('participants', __name__)
db = firestore.client()


@participants_bp.route('/create/<user_id>', methods=['POST'])
def create_participant(user_id):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400


        required_fields = ['name', 'last_name', 'dob', 'license', 'licenseExpedition']

        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({
                "error": "Missing required fields",
                "missing": missing_fields
            }), 400

        user_ref = db.collection("users").document(user_id)
        if not user_ref.get().exists:
            return jsonify({"error": f"User ID {user_id} not found in 'users' collection"}), 404

        participant_ref = db.collection("participants").document(user_id)
        if participant_ref.get().exists:
            return jsonify({"error": "This user is already registered as a participant"}), 400

        new_participant = {
            "name": data['name'],
            "last_name": data['last_name'],
            "dob": data['dob'],
            "license": data['license'],
            "licenseExpedition": data['licenseExpedition'],
            "user_id": user_id,
            "stats": {
                "win": 0,
                "loss": 0,
                "matchesPlayed": 0
            },
            "created_at": datetime.utcnow()
        }

        participant_ref.set(new_participant)

        return jsonify({
            "id": user_id,
            "message": "Participant created successfully"
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500



@participants_bp.route('/<participant_id>', methods=['DELETE'])
def delete_participant(participant_id):
    participant_ref = db.collection("participants").document(participant_id)
    if not participant_ref.get().exists:
        return jsonify({"error": "Participant not found"}), 404

    participant_ref.delete()
    return jsonify({"success": f"Participant {participant_id} deleted"}), 200


@participants_bp.route('/<participant_id>/stats', methods=['GET'])
def get_participant_stats(participant_id):
    participant_ref = db.collection("participants").document(participant_id)
    participant = participant_ref.get()
    if not participant.exists:
        return jsonify({"error": "Participant not found"}), 404

    return jsonify(participant.to_dict().get("stats", {})), 200


@participants_bp.route('/<participant_id>/win', methods=['POST'])
def add_win(participant_id):
    participant_ref = db.collection("participants").document(participant_id)
    if not participant_ref.get().exists:
        return jsonify({"error": "Participant not found"}), 404

    participant_ref.update({
        "stats.win": firestore.Increment(1),
        "stats.matchesPlayed": firestore.Increment(1)
    })
    return jsonify({"success": "Win added"}), 200


@participants_bp.route('/<participant_id>/loss', methods=['POST'])
def add_loss(participant_id):
    participant_ref = db.collection("participants").document(participant_id)
    if not participant_ref.get().exists:
        return jsonify({"error": "Participant not found"}), 404

    participant_ref.update({
        "stats.loss": firestore.Increment(1),
        "stats.matchesPlayed": firestore.Increment(1)
    })
    return jsonify({"success": "Loss added"}), 200