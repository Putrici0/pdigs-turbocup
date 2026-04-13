from enum import Enum


class user_role(Enum):
    PARTICIPANT_PILOT = "participant_pilot"
    PARTICIPANT_COPILOT = "participant_copilot"
    TOURNAMENT_ADMIN = "tournament_admin"