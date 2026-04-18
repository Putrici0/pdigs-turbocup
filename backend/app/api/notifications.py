from datetime import datetime
from flask import Blueprint, jsonify, request
from google.cloud.firestore_v1.base_query import FieldFilter
from backend.app.db import db

notifications_bp = Blueprint('notifications', __name__)

@notifications_bp.route('/user/<user_id>', methods=['GET'])
def get_user_notifications(user_id):
    docs = db.collection('notifications').where(filter=FieldFilter('user_id', '==', user_id)).stream()
    data = []
    for doc in docs:
        d = doc.to_dict()
        d['id'] = doc.id
        data.append(d)

    data.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(data), 200

@notifications_bp.route('/<notif_id>/read', methods=['PUT'])
def mark_as_read(notif_id):
    db.collection('notifications').document(notif_id).update({'read': True})
    return jsonify({"message": "Notification marked as read"}), 200

@notifications_bp.route('/', methods=['POST'])
def create_notification():
    data = request.get_json()

    if not data or 'user_id' not in data or 'message' not in data:
        return jsonify({"message": "Data Missing"}), 400

    new_notif = {
        "user_id": data['user_id'],
        "message": data['message'],
        "read": False,
        "created_at": datetime.now().isoformat()
    }

    _, doc_ref = db.collection('notifications').add(new_notif)

    return jsonify({"message": "Notification created succesfully", "id": doc_ref.id}), 201