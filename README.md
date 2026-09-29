# Flatfox apartment search

This fork searches current public [Flatfox](https://flatfox.ch/) rental listings and
exports matching links to a local CSV. It does not contact advertisers. The
shared Google Sheet and scheduled email alerts are managed separately in Google
Apps Script; cloning this repository does not create or modify those cloud jobs.

## Run a local listing snapshot

Use Python 3.11 or later:

```sh
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
mkdir -p secret/rasmus-herman
cp secret/example/living_preferences.json secret/rasmus-herman/living_preferences.json
venv/bin/python tracker_export.py
```

Edit `secret/rasmus-herman/living_preferences.json` before running to set the
map bounds, maximum monthly rent, minimum rooms, furnished requirement, and
preferred postcodes. The example contains the current shared search values.
The script prints links and writes `secret/rasmus-herman/current_listings.csv`.
Both files under `secret/` stay on your computer and are ignored by Git.
Use `--preferences PATH` and `--output PATH` to choose different files.

The Flatfox search covers a rectangular area. The `allowed_postcodes` list is
shown in the CSV as a review hint; it does not exclude listings. Check each
listing's exact neighborhood, move-in date, lease terms, and availability
before contacting the advertiser. The CSV is a fresh snapshot, not the shared
status tracker. Flatfox's public endpoints can change, so a failed export
should be investigated rather than treated as zero matches.

Run `make check` for the local tests. The optional Selenium preview in
`main.py` requires a separate local profile and Chrome. Neither the public
snapshot nor the shared tracker requires a Gemini key or Flatfox login.
