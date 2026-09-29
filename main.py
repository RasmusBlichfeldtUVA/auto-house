"""Read-only Flatfox search and listing collection for Codex drafting."""

from src.lib.flatfox_web_interactor import FlatfoxWebInteractor, build_search_url
from src.personal_profile import PersonalProfile
import argparse
from datetime import datetime
from pathlib import Path
import json


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flatfox apartment search")
    parser.add_argument("--preview", action="store_true", help="List apartments without sending messages")
    parser.add_argument("--collect", action="store_true", help="Save listing text locally for Codex to draft from")
    parser.add_argument("--limit", type=int, default=10, help="Maximum listings to show")
    args = parser.parse_args()
    if args.preview == args.collect:
        parser.error("Choose exactly one of --preview or --collect. Sending is disabled.")
    if args.limit < 1:
        parser.error("--limit must be positive")

    profile = PersonalProfile("rasmus-herman")
    print("Preview search:", build_search_url(profile))
    web = FlatfoxWebInteractor(profile)
    try:
        web.search()
        listings = web.gather_results()
        print(f"Found {len(listings)} postcode-matched listing candidates on the first page. Showing up to {args.limit}:")
        for url in listings[:args.limit]:
            print(url)
        if args.collect:
            collected = []
            for url in listings[:args.limit]:
                try:
                    collected.append({"url": url, "listing_text": web.read_listing(url)})
                except Exception as exc:
                    print(f"Could not read {url}: {type(exc).__name__}")
            output = Path("secret/rasmus-herman/listing_packet.json")
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps({
                "collected_at": datetime.now().astimezone().isoformat(),
                "listings": collected,
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Saved {len(collected)} listing(s) to {output}")
    finally:
        web.close()
