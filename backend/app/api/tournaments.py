from datetime import datetime

from firebase_admin import credentials
from flask import Blueprint, jsonify, Flask
from firebase_admin import firestore
import firebase_admin
import json



tournaments_bp = Flask(__name__)

if not firebase_admin._apps:
    cred = credentials.Certificate("../../firebase-credentials.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

def serialize_firestore(doc):
    item = doc.to_dict()

    for key, value in item.items():
        if isinstance(value, datetime):
            item[key] = value.isoformat()

    item["id"] = doc.id
    return item


@tournaments_bp.route("/tournaments", methods=["GET"])
def get_tournaments():
    tournaments = db.collection("tournaments").stream()
    data = [serialize_firestore(doc) for doc in tournaments]

    return jsonify(data), 200


@tournaments_bp.route('/', methods=['POST'])
def create_tournament():
    return jsonify({"message": "POST tournament working"}), 201

if __name__ == "__main__":
    tournaments_bp.run(debug=True)