class Tournament:
    def __init__(self, name, start_date, end_date=None, status="scheduled", category="100cc"):
        self.name = name
        self.start_date = start_date # Start date and time
        self.end_date = end_date # End date and time
        self.status = status # "scheduled", "current", "past"
        self.category = category

    def to_dict(self):
        return {
            "name": self.name,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "status": self.status
        }