class User:
    def __init__(self, username, email, role="participant", profile_img_url=None):
        self.username = username
        self.email = email
        self.role = role
        self.profile_img_url = profile_img_url
        self.is_active = True

    def to_dict(self):
        return {
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "profile_img_url": self.profile_img_url,
            "is_active": self.is_active
        }