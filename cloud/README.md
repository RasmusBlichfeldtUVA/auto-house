# Independent Flatfox cloud tracker

This is a reusable copy of the cloud workflow. Deploy it in **your own Google
account**; it does not connect to the existing Rasmus/Herman project or Sheet.
Google Apps Script time triggers run on Google's servers while your computer is
closed. The script reads Flatfox's public search data directly, so it does not
rely on Flatfox alert emails. It never contacts advertisers.

## Set up

1. Create a new standalone project at [Google Apps Script](https://script.google.com/home/projects/create). Copy the entire [`Code.gs`](Code.gs) into its editor and save.
2. In **Project Settings → Script properties**, add the properties below. Use your own email, city, search criteria and application drafts. Keep personal information in Script Properties, not in GitHub.
3. Run `testCloud()` in the Apps Script editor. Review its execution log for a plausible count and sample links. If the count is zero, check your bounds and filters.
4. Run `installFlatfox()` once. Approve Google's requested access to fetch public web data, manage this script's triggers, create/update your tracker Sheet, and send alert emails from your account. The execution log gives the new Sheet URL. Share that Sheet with anyone who should edit statuses.
5. Run `testEmail()` and confirm it reaches every recipient. Run `scanFlatfox()` once and check that it reports no new rows or duplicate alerts. Check **Triggers** for one `scanFlatfox` time trigger and **Executions** for any failures.

| Script property | Value |
|---|---|
| `EMAIL_TO` | One or more recipient emails, separated by commas |
| `CITY` | City name as Flatfox spells it, such as `Zürich` |
| `MAX_RENT_CHF` | Maximum monthly advertised rent, e.g. `2600` |
| `MIN_ROOMS` | Minimum rooms, e.g. `3` |
| `FURNISHED_ONLY` | `true` or `false` |
| `SEARCH_WEST`, `SEARCH_SOUTH`, `SEARCH_EAST`, `SEARCH_NORTH` | Decimal longitude/latitude bounds for the search rectangle |
| `PREFERRED_POSTCODES` | Optional comma-separated postcodes; flags rows but does not exclude them |
| `MESSAGE_DE`, `MESSAGE_EN` | Optional application drafts added to alert emails for your own review |
| `SPREADSHEET_ID` | Optional ID of an existing compatible Sheet; otherwise `installFlatfox()` creates one and saves its ID here |

On installation, existing matching listings are added to the Sheet with
`Alert = Baseline` and are **not emailed**. New listings are appended with
`Status = New`, emailed to `EMAIL_TO`, and marked as sent. The five-minute
trigger also refreshes `Last seen` without overwriting manual Status, Viewing
date or Notes. If email delivery fails, `Alert` stays `Pending` and the next
run retries it. The user should review the exact neighborhood, rent, move-in,
lease length, occupancy, and availability: Flatfox's structured search cannot
reliably filter all of those.

Apps Script quotas and Flatfox's public endpoints can change. Inspect
**Executions** periodically; a failed run does not prove there were no new
flats. The Google Sheet is separate from the local `tracker_export.py` CSV.
