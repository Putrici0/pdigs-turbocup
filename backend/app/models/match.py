class Match:
    def __init__(self, tournament_id, team_a_id, team_b_id, category):
        self.tournament_id = tournament_id
        self.team_a_id = team_a_id
        self.team_b_id = team_b_id
        self.category = category
        self.status = "scheduled"
        self.winner_id = None

    def to_dict(self):
        return {
            "tournament_id": self.tournament_id,
            "team_a_id": self.team_a_id,
            "team_b_id": self.team_b_id,
            "category": self.category,
            "status": self.status,
            "winner_id": self.winner_id
        }