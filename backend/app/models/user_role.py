from enum import Enum


class UserRole(Enum):
    PARTICIPANT_PILOT = "participant_pilot"
    PARTICIPANT_COPILOT = "participant_copilot"
    TOURNAMENT_ADMIN = "tournament_admin"