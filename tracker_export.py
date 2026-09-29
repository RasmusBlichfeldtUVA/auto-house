"""Export every current public Flatfox match to a local CSV for review."""

import argparse
import csv
from pathlib import Path

from src.flatfox_public_api import fetch_current, load_preferences


HEADERS = ["ID", "Status", "Viewing date", "Link", "Address", "Rent CHF", "Rooms",
           "Furnished", "Postcode", "Preferred area", "Move-in", "Published", "Last seen", "Notes"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preferences", type=Path,
                        default=Path("secret/rasmus-herman/living_preferences.json"),
                        help="Local JSON file with Flatfox search preferences")
    parser.add_argument("--output", type=Path, default=Path("secret/rasmus-herman/current_listings.csv"))
    args = parser.parse_args()
    preferences = load_preferences(args.preferences)
    rows = fetch_current(preferences)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(HEADERS)
        for item in rows:
            writer.writerow([item["id"], "New", "", item["link"], item["address"],
                             item["rent_chf"], item["rooms"], item["furnished"],
                             item["postcode"], item["preferred_postcode"], item["move_in"],
                             item["published"], item["last_seen"], ""])
    print(f"Saved {len(rows)} current listings to {args.output}")
    for item in rows:
        print(item["link"])


if __name__ == "__main__":
    main()
