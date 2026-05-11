import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

env_path = os.path.join(BASE_DIR, '.env')
load_dotenv(dotenv_path=env_path)

if not firebase_admin._apps:
    cred_filename = os.getenv('FIREBASE_CREDENTIALS', 'firebase-credentials.json')

    cred_path = os.path.join(BASE_DIR, cred_filename)

    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()