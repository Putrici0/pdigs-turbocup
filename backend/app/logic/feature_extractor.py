from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter


FEATURE_KEYS = [
    "win_rate",
    "total_wins",
    "matches_played",
    "avg_speed",
    "sector_1_avg",
    "sector_2_avg",
    "sector_3_avg",
    "recent_form_pct",
]


def _safe_div(a, b, default=0.0):
    return a / b if b > 0 else default


def _get_team(db, team_id):
    doc = db.collection("teams").document(team_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return data


def _get_participant_stats(db, user_id):
    doc = db.collection("participants").document(user_id).get()
    if not doc.exists:
        return {"win": 0, "loss": 0, "matchesPlayed": 0}
    return doc.to_dict().get("stats", {"win": 0, "loss": 0, "matchesPlayed": 0})


def _get_match_stats_for_team(db, team_id):
    docs = list(
        db.collection("match_stats")
        .where(filter=FieldFilter("team_id", "==", team_id))
        .stream()
    )
    return [d.to_dict() for d in docs]


def _get_recent_matches(db, team_id, n=5):
    match_ids = set()
    for field in ["team_a_id", "team_b_id"]:
        docs = (
            db.collection("matches")
            .where(filter=FieldFilter(field, "==", team_id))
            .where(filter=FieldFilter("status", "==", "past"))
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(n)
            .stream()
        )
        for d in docs:
            md = d.to_dict()
            md["id"] = d.id
            match_ids.add(md["id"])

    docs = []
    for mid in match_ids:
        d = db.collection("matches").document(mid).get()
        if d.exists:
            md = d.to_dict()
            md["id"] = d.id
            docs.append(md)

    docs.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return docs[:n]


def _was_team_winner(match_doc, team_id):
    winner_id = match_doc.get("winner_id")
    if not winner_id:
        return False
    if match_doc.get("status") != "past":
        return False
    team_a = match_doc.get("team_a_id")
    team_b = match_doc.get("team_b_id")
    if team_a == team_id or team_b == team_id:
        return winner_id == team_id
    return False


def extract_team_features(db, team_id):
    team = _get_team(db, team_id)
    if not team:
        return None

    pilot_id = team.get("pilot_id", "")
    copilot_id = team.get("copilot_id", "")

    p_stats = _get_participant_stats(db, pilot_id) if pilot_id else {"win": 0, "loss": 0, "matchesPlayed": 0}
    c_stats = _get_participant_stats(db, copilot_id) if copilot_id else {"win": 0, "loss": 0, "matchesPlayed": 0}

    total_wins = p_stats.get("win", 0) + c_stats.get("win", 0)
    matches_played = p_stats.get("matchesPlayed", 0) + c_stats.get("matchesPlayed", 0)
    win_rate = _safe_div(total_wins, matches_played)

    ms_list = _get_match_stats_for_team(db, team_id)
    if ms_list:
        speeds = [m.get("average_speed", 0) for m in ms_list if m.get("average_speed")]
        s1 = [m.get("section_times", {}).get("sector_1", 0) for m in ms_list if m.get("section_times")]
        s2 = [m.get("section_times", {}).get("sector_2", 0) for m in ms_list if m.get("section_times")]
        s3 = [m.get("section_times", {}).get("sector_3", 0) for m in ms_list if m.get("section_times")]

        avg_speed = _safe_div(sum(speeds), len(speeds))
        sector_1_avg = _safe_div(sum(s1), len(s1))
        sector_2_avg = _safe_div(sum(s2), len(s2))
        sector_3_avg = _safe_div(sum(s3), len(s3))
    else:
        avg_speed = 0.0
        sector_1_avg = 0.0
        sector_2_avg = 0.0
        sector_3_avg = 0.0

    recent = _get_recent_matches(db, team_id, n=5)
    if recent:
        recent_wins = sum(1 for m in recent if _was_team_winner(m, team_id))
        recent_form_pct = _safe_div(recent_wins, len(recent))
    else:
        recent_form_pct = 0.5

    return {
        "win_rate": win_rate,
        "total_wins": total_wins,
        "matches_played": matches_played,
        "avg_speed": avg_speed,
        "sector_1_avg": sector_1_avg,
        "sector_2_avg": sector_2_avg,
        "sector_3_avg": sector_3_avg,
        "recent_form_pct": recent_form_pct,
    }
