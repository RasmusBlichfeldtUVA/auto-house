import json
from pathlib import Path

class PersonalProfile():
    def __init__(self, name: str):

        self.name = name

        with open(f'secret/{name}/my_description.json') as f:
            data = json.load(f)
            self.user_name = data["Name"]
            self.user_phone_number = data["Phone_number"]
            self.user_email = data["Email"]
            self.description = str(data)
            # Optional editable guidance for Codex-assisted message drafting.
            message_file = Path(f"secret/{name}/message.md")
            if message_file.exists():
                self.description += "\n\n" + message_file.read_text(encoding="utf-8")

        with open(f'secret/{name}/living_preferences.json') as f:
            data = json.load(f)
            self.place = data["place"]
            self.max_rent = int(data["budget_upper_bound"])
            self.min_rooms = int(data.get("desired_min_rooms", 3))
            self.search_bounds = data.get("search_bounds")
            self.furnished_only = bool(data.get("furnished_only", False))
            self.allowed_postcodes = {str(code) for code in data.get("allowed_postcodes", [])}

        with open(f'secret/{name}/site_credentials.json') as f:
            data = json.load(f)
            self.flatfox_login = data["flatfox_login"]
            self.flatfox_password = data["flatfox_password"]
