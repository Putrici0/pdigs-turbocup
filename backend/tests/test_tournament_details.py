import sys
import os

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import unittest
from backend.app import create_app
from backend.app.db import db

class TestTournamentDetailsAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

        # 1. Se inyectan equipos falsos en Firebase
        _, self.team1_ref = db.collection('teams').add({"name": "Los Halcones"})
        _, self.team2_ref = db.collection('teams').add({"name": "Las Cobras"})

        # 2. Se inyecta un torneo falso
        _, self.tourn_ref = db.collection('tournaments').add({
            "name": "Copa Test Extremo",
            "status": "current"
        })

        _, self.match1_ref = db.collection('matches').add({
            "tournament_id": self.tourn_ref.id,
            "team_a_id": self.team1_ref.id,
            "team_b_id": self.team2_ref.id,
            "category": "Pro"
        })

        _, self.match2_ref = db.collection('matches').add({
            "tournament_id": self.tourn_ref.id,
            "team_a_id": self.team1_ref.id,
            "team_b_id": "ID_FALSA_QUE_NO_EXISTE",
            "category": "Amateur"
        })

    def tearDown(self):
        self.team1_ref.delete()
        self.team2_ref.delete()
        self.tourn_ref.delete()
        self.match1_ref.delete()
        self.match2_ref.delete()

    # --- PRUEBAS ---

    def test_details_comprehensive(self):
        """Prueba 1: ensamblado y manejo de equipos borrados"""
        response = self.client.get(f'/api/tournaments/{self.tourn_ref.id}/details')
        self.assertEqual(response.status_code, 200)

        data = response.get_json()

        self.assertEqual(data['name'], "Copa Test Extremo")
        self.assertIn('matches', data)
        self.assertEqual(len(data['matches']), 2, "Debe traer exactamente las 2 carreras asociadas")

        match_2 = next((m for m in data['matches'] if m['id'] == self.match2_ref.id), None)
        self.assertIsNotNone(match_2)

        self.assertEqual(match_2['team_a_name'], "Los Halcones", "No resolvió el nombre del equipo real")

        self.assertEqual(match_2['team_b_name'], "TBD (Por definir)", "Falló al manejar el equipo huérfano")

    def test_details_not_found(self):
        """Prueba 2: Comprueba qué pasa si se piden detalles de un torneo que no existe"""
        response = self.client.get('/api/tournaments/ID_FALSA_TOTALMENTE/details')
        self.assertEqual(response.status_code, 404, "Debe dar 404 Not Found")

    def test_details_no_matches(self):
        """Prueba 3: Comprueba el caso de un torneo recién creado que aún no tiene carreras"""
        _, empty_tourn = db.collection('tournaments').add({"name": "Torneo Vacío"})

        response = self.client.get(f'/api/tournaments/{empty_tourn.id}/details')
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertEqual(len(data['matches']), 0, "Debe devolver una lista de matches vacía, no fallar")

        empty_tourn.delete()

    def test_admin_dashboard_permissions(self):
        """Prueba que un admin solo puede ver sus propios torneos, aislando los datos"""
        _, tourn_a = db.collection('tournaments').add({
            "name": "Torneo Exclusivo Admin A",
            "creator_id": "admin_A_123"
        })

        _, tourn_b = db.collection('tournaments').add({
            "name": "Torneo Secreto Admin B",
            "creator_id": "admin_B_999"
        })

        # 3. Petición de Admin A
        response = self.client.get('/api/tournaments/admin/admin_A_123')
        data = response.get_json()

        # 4. Solo debe devolver su torneo
        self.assertEqual(len(data), 1, "Fallo de permisos: Está viendo torneos de otros admins")
        self.assertEqual(data[0]['name'], "Torneo Exclusivo Admin A")

        tourn_a.delete()
        tourn_b.delete()

if __name__ == '__main__':
    unittest.main()