class Tournament:
    def __init__(self, name, start_date, end_date=None, status="scheduled"):
        self.name = name
        self.start_date = start_date # Start date and time
        self.end_date = end_date # End date and time
        self.status = status # "scheduled", "current", "past"

        # Diccionario para guardar los puntos logrados por cada participante
        # Formato esperado: {"team_id_1": 15, "team_id_2": 10}
        self.participants_points = {}

    def to_dict(self):
        return {
            "name": self.name,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "status": self.status,
            "participants_points": self.participants_points
        }