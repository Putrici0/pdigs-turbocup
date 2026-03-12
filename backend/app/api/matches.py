from flask import Blueprint, jsonify

matches_bp = Blueprint('matches', __name__)

@matches_bp.route('/', methods=['GET'])
def get_matches():
    return jsonify({"message": "GET matches working"}), 200