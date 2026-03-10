import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

if not firebase_admin._apps:
    cred_path = os.getenv('FIREBASE_CREDENTIALS')
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()