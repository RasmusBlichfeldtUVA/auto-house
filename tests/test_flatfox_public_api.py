from src.flatfox_public_api import fetch_current, listing_matches


PREFERENCES = {
    "search_bounds": {"north": "47.42", "south": "47.34", "east": "8.61", "west": "8.49"},
    "budget_upper_bound": "2600", "desired_min_rooms": 3, "furnished_only": True,
    "allowed_postcodes": ["8004"],
}


def test_filters_pin_overfetch_and_keeps_area_exception(monkeypatch):
    good = {
        "pk": 123, "url": "/en/flat/8047-zurich/123/", "status": "act",
        "offer_type": "RENT", "object_category": "APARTMENT", "is_furnished": True,
        "is_swap": False, "price_display": 2500, "number_of_rooms": 3,
        "city": "Zürich", "zipcode": "8047", "published": "2026-09-28T12:00:00Z",
    }
    too_expensive = {**good, "pk": 124, "price_display": 3180}

    def fake_get(url, params):
        if url.endswith("/pin/"):
            return [{"pk": 123}, {"pk": 124}]
        return [good, too_expensive]

    monkeypatch.setattr("src.flatfox_public_api._get_json", fake_get)
    rows = fetch_current(PREFERENCES)
    assert [row["id"] for row in rows] == ["123"]
    assert rows[0]["link"] == "https://flatfox.ch/en/flat/8047-zurich/123/"
    assert rows[0]["preferred_postcode"] == "Check area"
    assert not listing_matches({**good, "is_furnished": False}, PREFERENCES)
