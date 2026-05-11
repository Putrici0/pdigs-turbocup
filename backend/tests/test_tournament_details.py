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

        _, self.team1_ref = db.collection('teams').add({"name": "The Hawks"})
        _, self.team2_ref = db.collection('teams').add({"name": "The Goats"})

        # 2. Se inyecta un torneo falso
        _, self.tourn_ref = db.collection('tournaments').add({
            "name": "Extreme Test GP",
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
            "team_b_id": "FALSE_ID1",
            "category": "Amateur"
        })

    def tearDown(self):
        self.team1_ref.delete()
        self.team2_ref.delete()
        self.tourn_ref.delete()
        self.match1_ref.delete()
        self.match2_ref.delete()

    def test_details_comprehensive(self):
        response = self.client.get(f'/api/tournaments/{self.tourn_ref.id}/details')
        self.assertEqual(response.status_code, 200)

        data = response.get_json()

        self.assertEqual(data['name'], "Extreme Test GP")
        self.assertIn('matches', data)
        self.assertEqual(len(data['matches']), 2, "It must show the two races")

        match_2 = next((m for m in data['matches'] if m['id'] == self.match2_ref.id), None)
        self.assertIsNotNone(match_2)

        self.assertEqual(match_2['team_a_name'], "TBD", "No resolvió el nombre del equipo real")

        self.assertEqual(match_2['team_b_name'], "TBD", "Falló al manejar el equipo huérfano")

    def test_details_not_found(self):
        response = self.client.get('/api/tournaments/VERY_FALSE_ID/details')
        self.assertEqual(response.status_code, 404, "Debe dar 404 Not Found")

    def test_details_no_matches(self):
        _, empty_tourn = db.collection('tournaments').add({"name": "Hollow GP"})

        response = self.client.get(f'/api/tournaments/{empty_tourn.id}/details')
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertEqual(len(data['matches']), 0, "It must return an empty matches list")

        empty_tourn.delete()

    def test_admin_dashboard_permissions(self):
        _, tourn_a = db.collection('tournaments').add({
            "name": "Exclusive GP Admin A",
            "creator_id": "admin_A_123"
        })

        _, tourn_b = db.collection('tournaments').add({
            "name": "Secret GP Admin B",
            "creator_id": "admin_B_999"
        })

        response = self.client.get('/api/tournaments/admin/admin_A_123')
        data = response.get_json()

        self.assertEqual(len(data), 1, "Permission Failure: You are seeing GPs of other admins")
        self.assertEqual(data[0]['name'], "Exclusive GP Admin A")

        tourn_a.delete()
        tourn_b.delete()

if __name__ == '__main__':
    unittest.main()