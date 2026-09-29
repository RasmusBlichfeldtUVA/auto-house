import json
from urllib.parse import parse_qs, urlparse

from src.personal_profile import PersonalProfile
from src.lib.flatfox_web_interactor import build_search_url, is_allowed_postcode


def test_flatfox_profile_loads_without_other_site_credentials(tmp_path, monkeypatch):
    profile_dir = tmp_path / "secret" / "example"
    profile_dir.mkdir(parents=True)
    (profile_dir / "my_description.json").write_text(
        json.dumps({"Name": "Applicant", "Phone_number": "123", "Email": "a@example.com"})
    )
    (profile_dir / "living_preferences.json").write_text(
        json.dumps({"place": "Zürich", "budget_upper_bound": "2600"})
    )
    (profile_dir / "site_credentials.json").write_text(
        json.dumps({"flatfox_login": "a@example.com", "flatfox_password": ""})
    )
    (profile_dir / "message.md").write_text("Use English for English listings.")
    monkeypatch.chdir(tmp_path)

    profile = PersonalProfile("example")

    assert profile.place == "Zürich"
    assert profile.max_rent == 2600
    assert profile.flatfox_login == "a@example.com"
    assert "Use English" in profile.description

    query = parse_qs(urlparse(build_search_url(profile)).query)
    assert query["offer_type"] == ["RENT"]
    assert query["object_category"] == ["APARTMENT"]
    assert query["min_rooms"] == ["3"]
    assert query["max_price"] == ["2600"]
    assert query["is_swap"] == ["false"]
    assert query["west"] == ["8.515"]
    assert query["east"] == ["8.575"]
    assert query["south"] == ["47.356"]
    assert query["north"] == ["47.393"]


def test_furnished_and_neighborhood_candidate_settings(tmp_path, monkeypatch):
    profile_dir = tmp_path / "secret" / "example"
    profile_dir.mkdir(parents=True)
    (profile_dir / "my_description.json").write_text(
        json.dumps({"Name": "Applicant", "Phone_number": "123", "Email": "a@example.com"})
    )
    (profile_dir / "living_preferences.json").write_text(json.dumps({
        "place": "Zürich",
        "budget_upper_bound": "2600",
        "furnished_only": True,
        "allowed_postcodes": ["8001", "8037"],
        "search_bounds": {"west": "8.49", "south": "47.34", "east": "8.61", "north": "47.42"},
    }))
    (profile_dir / "site_credentials.json").write_text(
        json.dumps({"flatfox_login": "a@example.com", "flatfox_password": ""})
    )
    monkeypatch.chdir(tmp_path)
    profile = PersonalProfile("example")
    query = parse_qs(urlparse(build_search_url(profile)).query)

    assert query["is_furnished"] == ["true"]
    assert query["west"] == ["8.49"]
    assert profile.allowed_postcodes == {"8001", "8037"}
    assert is_allowed_postcode("https://flatfox.ch/en/flat/8037-zurich/123/", profile.allowed_postcodes)
    assert not is_allowed_postcode("https://flatfox.ch/en/flat/8057-zurich/123/", profile.allowed_postcodes)
