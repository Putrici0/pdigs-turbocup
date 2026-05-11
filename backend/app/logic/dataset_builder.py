from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.logic.feature_extractor import extract_team_features, FEATURE_KEYS


def _build_row(db, match_doc):
    md = match_doc.to_dict()
    team_a_id = md.get("team_a_id", "")
    team_b_id = md.get("team_b_id", "")
    winner_id = md.get("winner_id")

    if not team_a_id or not team_b_id or not winner_id:
        return None

    if md.get("status") != "past":
        return None

    features_a = extract_team_features(db, team_a_id)
    features_b = extract_team_features(db, team_b_id)

    if not features_a or not features_b:
        return None

    row = {}
    for key in FEATURE_KEYS:
        row[f"team_a_{key}"] = features_a[key]
        row[f"team_b_{key}"] = features_b[key]

    row["team_a_won"] = 1 if winner_id == team_a_id else 0
    row["match_id"] = match_doc.id
    row["tournament_id"] = md.get("tournament_id", "")
    return row


def build_dataset(db):
    docs = list(
        db.collection("matches")
        .where(filter=FieldFilter("status", "==", "past"))
        .stream()
    )

    rows = []
    for doc in docs:
        row = _build_row(db, doc)
        if row:
            rows.append(row)

    if not rows:
        return None

    try:
        import pandas as pd
    except ImportError:
        raise ImportError("pandas is required to build the dataset")

    df = pd.DataFrame(rows)
    return df
