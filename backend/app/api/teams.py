from flask import Blueprint, jsonify

teams_bp = Blueprint('teams', __name__)

@teams_bp.route('/', methods=['POST'])
def join_team():
    return jsonify({"message": "POST team working"}), 201