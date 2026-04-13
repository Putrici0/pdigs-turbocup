from backend.app.models.user_role import user_role


class User:
    def __init__(self, uid, name, surname, username, email, password, role: user_role):
        self.uid = uid
        self.name = name
        self.surname = surname
        self.username = username
        self.email = email
        self.password = password
        self.role = role

    def to_dict(self):
        return {
            "uid": self.uid,
            "name": self.name,
            "surname": self.surname,
            "username": self.username,
            "email": self.email,
            "password": self.password,
            "role": self.role
        }