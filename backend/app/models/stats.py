class MatchStats:
    def __init__(self, match_id, team_id, average_speed, section_times):
        self.match_id = match_id
        self.team_id = team_id
        self.average_speed = average_speed # Average speeds
        self.section_times = section_times

    def to_dict(self):
        return {
            "match_id": self.match_id,
            "team_id": self.team_id,
            "average_speed": self.average_speed,
            "section_times": self.section_times
        }