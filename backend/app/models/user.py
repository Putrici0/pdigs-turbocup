class User:
    def __init__(self, name, surname, username, email, password, role="participant"):
        self.name = name
        self.surname = surname
        self.username = username
        self.email = email
        self.password = password
        self.role = role

    def to_dict(self):
        return {
            "name": self.name,
            "surname": self.surname,
            "username": self.username,
            "email": self.email,
            "password": self.password,
            "role": self.role
        }