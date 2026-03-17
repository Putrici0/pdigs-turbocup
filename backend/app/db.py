import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# 1. Calculamos la ruta absoluta a la carpeta 'backend'
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 2. Le decimos a load_dotenv dónde está el .env exactamente
env_path = os.path.join(BASE_DIR, '.env')
load_dotenv(dotenv_path=env_path)

if not firebase_admin._apps:
    # 3. Obtenemos el nombre del archivo
    cred_filename = os.getenv('FIREBASE_CREDENTIALS', 'firebase-credentials.json')

    # 4. Construimos la RUTA ABSOLUTA al json (ej: C:\...\backend\firebase-credentials.json)
    cred_path = os.path.join(BASE_DIR, cred_filename)

    # 5. Inicializamos Firebase con la ruta completa
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()