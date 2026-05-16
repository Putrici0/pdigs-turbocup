# TurboCup

TurboCup is a web application for managing and tracking tournaments, teams, participants, matches, and statistics.  
This project was developed for the **Proyectos de Ingenieria y Gestion del Software (PDIGS)** course at the **Universidad de Las Palmas de Gran Canaria (ULPGC)**.

## Tech Stack

- `Frontend`: Angular 21
- `Backend`: Flask 3 + Flask-CORS
- `Database`: Firebase Firestore (via `firebase_admin`)
- `Machine Learning`: scikit-learn (model file: `backend/app/models/ml_model.pkl`)

## Repository Structure

```text
.
|- backend/             # Flask API, business logic, data/ML scripts
|- frontend-angular/    # Angular application
|- schema.sql           # Schema reference
`- README.md
```

## Prerequisites

- Python 3.12+ (recommended)
- Node.js 20+ and npm
- A Firebase project with Firestore enabled

## Backend Setup

1. Create a virtual environment and install dependencies:

```bash
cd backend
python -m venv .venv
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Configure Firebase credentials:

- Place your credentials JSON file at `backend/firebase-credentials.json`, or
- Set `FIREBASE_CREDENTIALS` in `backend/.env` with your credentials filename.

Example `backend/.env`:

```env
FIREBASE_CREDENTIALS=firebase-credentials.json
```

3. Run the API:

```bash
python run.py
```

The backend runs by default at `http://localhost:5050`.

## Frontend Setup

1. Install dependencies:

```bash
cd frontend-angular
npm install
```

2. Start the development server:

```bash
npm start
```

The frontend runs by default at `http://localhost:4200`.

## Local Development Workflow

1. Start the backend in one terminal (`backend`, port `5050`).
2. Start the frontend in another terminal (`frontend-angular`, port `4200`).
3. Verify that the frontend can reach the local API.

## Useful Scripts

### Backend

- `python run.py`: start the Flask API.
- `python train_model.py`: train/update the ML model.
- `python generate_data.py`: generate sample data.
- `python mass_populate.py` / `python incremental_populate.py`: data population scripts.

### Frontend

- `npm start`: start development server.
- `npm run build`: create production build.
- `npm test`: run frontend tests.

## API Base Endpoints

Registered blueprints:

- `/api/tournaments`
- `/api/teams`
- `/api/user`
- `/api/notifications`
- `/api/stats`
- `/api/participants`
- `/api/predictions`
- `/api/matches`

## Authors

- Pablo Llopis Parrilla
- David Gonzalez Espino
- Joan Martinez Perdomo
- Vivien Engl
