from flask import Flask
from flask_cors import CORS  # 1. Importamos la librería nueva
from backend.app.api.tournaments import tournaments_bp

def create_app():
    app = Flask(__name__)

    # 2. Activamos CORS para que el navegador confíe en nuestra API
    CORS(app)

    app.register_blueprint(tournaments_bp, url_prefix='/api/tournaments')
    #app.register_blueprint(teams_bp, url_prefix='/api/teams')
    #app.register_blueprint(matches_bp, url_prefix='/api/matches')
    #app.register_blueprint(stats_bp, url_prefix='/api/stats')


    return app