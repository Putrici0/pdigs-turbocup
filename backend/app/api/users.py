from firebase_admin import auth, firestore
from datetime import datetime

from flask import Blueprint, jsonify, request

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
            "stats": {
                "matchesPlayed": 0,
                "wins": 0,
            },
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

@users_bp.route('/<user_id>/stats', methods=['GET'])
def get_user_stats(user_id):
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()

    if not user.exists:
        return jsonify({"error": "User not found"}), 404

    data = user.to_dict()
    return jsonify(data.get("stats", {})), 200