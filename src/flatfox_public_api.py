"""Read public Flatfox search data without logging in or contacting advertisers."""

from __future__ import annotations

from datetime import datetime
import json
import re

import requests


BASE = "https://flatfox.ch"
PINS = BASE + "/api/v1/pin/"
DETAILS = BASE + "/api/v1/public-listing/"
VALID_PATH = re.compile(r"^/(?:en|de|fr|it)/flat/[^\s]+/(\d+)/$")


def _get_json(url: str, params: dict | list[tuple[str, str]]) -> object:
    response = requests.get(url, params=params, timeout=25, headers={"Accept": "application/json"})
    response.raise_for_status()
    return response.json()


def search_params(preferences: dict) -> dict:
    bounds = preferences["search_bounds"]
    params = {
        **bounds,
        "max_count": 400,
        "max_price": preferences["budget_upper_bound"],
        "min_rooms": preferences["desired_min_rooms"],
        "object_category": "APARTMENT",
        "offer_type": "RENT",
        "is_swap": "false",
    }
    if preferences.get("furnished_only"):
        params["is_furnished"] = "true"
    return params


def listing_matches(item: dict, preferences: dict) -> bool:
    if (item.get("status") != "act" or item.get("offer_type") != "RENT"
            or item.get("object_category") != "APARTMENT" or item.get("is_swap") is True):
        return False
    if preferences.get("furnished_only") and item.get("is_furnished") is not True:
        return False
    try:
        if float(item["number_of_rooms"]) < float(preferences["desired_min_rooms"]):
            return False
        rent = float(item["price_display"])
        if rent <= 0 or rent > float(preferences["budget_upper_bound"]):
            return False
    except (KeyError, TypeError, ValueError):
        return False
    return str(item.get("city", "")).strip().casefold() in {"zürich", "zurich"}


def listing_row(item: dict, preferences: dict, checked_at: str) -> dict:
    listing_id = str(item["pk"])
    path = str(item.get("url") or "")
    match = VALID_PATH.fullmatch(path)
    if not match or match.group(1) != listing_id:
        raise ValueError(f"Unexpected listing URL for {listing_id}: {path!r}")
    postcode = str(item.get("zipcode") or "")
    return {
        "id": listing_id,
        "link": BASE + path,
        "address": ", ".join(part for part in [str(item.get("street") or "").strip(),
                                           (postcode + " " + str(item.get("city") or "")).strip()] if part),
        "rent_chf": int(float(item["price_display"])),
        "rooms": float(item["number_of_rooms"]),
        "furnished": "Yes" if item.get("is_furnished") else "No",
        "postcode": postcode,
        "preferred_postcode": "Yes" if postcode in preferences.get("allowed_postcodes", []) else "Check area",
        "move_in": str(item.get("moving_date") or ""),
        "published": str(item.get("published") or ""),
        "last_seen": checked_at,
    }


def fetch_current(preferences: dict) -> list[dict]:
    pins = _get_json(PINS, search_params(preferences))
    if not isinstance(pins, list):
        raise ValueError("Flatfox search response changed")
    if len(pins) >= 400:
        raise ValueError("Search reached Flatfox's 400-listing limit; split the map before exporting")
    ids = [str(pin["pk"]) for pin in pins if isinstance(pin, dict)
           and str(pin.get("pk", "")).isdigit() and pin.get("is_in_region") is not False]
    if not ids:
        raise ValueError("Flatfox returned no listings; refusing to treat that as a valid empty search")
    details = []
    for offset in range(0, len(ids), 80):
        params = [("limit", "0")] + [("pk", pk) for pk in ids[offset:offset + 80]]
        batch = _get_json(DETAILS, params)
        if not isinstance(batch, list):
            raise ValueError("Flatfox details response changed")
        details.extend(batch)
    if not details:
        raise ValueError("Flatfox returned no listing details")
    checked_at = datetime.now().astimezone().isoformat(timespec="seconds")
    rows = [listing_row(item, preferences, checked_at) for item in details
            if listing_matches(item, preferences)]
    return sorted(rows, key=lambda row: (row["published"], int(row["id"])), reverse=True)


def load_preferences(path: str) -> dict:
    with open(path, encoding="utf-8") as source:
        return json.load(source)
