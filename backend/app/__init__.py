from flask import Flask
from flask_cors import CORS

from backend.app.api.teams import teams_bp
from backend.app.api.tournaments import tournaments_bp
from backend.app.api.users import users_bp

def create_app():
    app = Flask(__name__)

    CORS(app)

    app.register_blueprint(tournaments_bp, url_prefix='/api/tournaments')
    app.register_blueprint(teams_bp, url_prefix='/api/teams')
    app.register_blueprint(users_bp, url_prefix='/api/user')
    #app.register_blueprint(matches_bp, url_prefix='/api/matches')
    #app.register_blueprint(stats_bp, url_prefix='/api/stats')


    return app
