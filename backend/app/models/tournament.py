from datetime import datetime

class Tournament:
    def __init__(self, name, status="pending"):
        self.name = name
        self.status = status # pending, in_progress, completed
        self.created_at = datetime.now()
        self.teams = []

    def to_dict(self):
        return {
            "name": self.name,
            "status": self.status,
            "created_at": self.created_at,
            "teams": self.teams
        }