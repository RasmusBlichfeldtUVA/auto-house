from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import re
from urllib.parse import urlencode
from selenium.webdriver.support.ui import WebDriverWait


TIME_DELAY_ON_LOAD = 0.5
SILENT = False  # use driver.get_screenshot_as_file("capture.png") to debug

CENTRAL_ZURICH_SEARCH_BOUNDS = {
    "east": "8.575",
    "north": "47.393",
    "south": "47.356",
    "west": "8.515",
}


def build_search_url(profile):
    """Return the public Flatfox rental-apartment search observed in the UI."""
    if profile.place.casefold() not in {"zürich", "zurich"}:
        raise ValueError("The preview currently supports Zürich only")
    if profile.max_rent <= 0 or profile.min_rooms < 1:
        raise ValueError("Rent and minimum rooms must be positive")
    params = {
        **(profile.search_bounds or CENTRAL_ZURICH_SEARCH_BOUNDS),
        "max_price": profile.max_rent,
        "min_rooms": profile.min_rooms,
        "object_category": "APARTMENT",
        "offer_type": "RENT",
        "place_name": "Zürich, Zurich, Switzerland",
        "place_type": "place",
        "query": "Zürich",
        "take": 48,
    }
    if profile.furnished_only:
        params["is_furnished"] = "true"
    params["is_swap"] = "false"
    return "https://flatfox.ch/en/search/?" + urlencode(params)


def is_allowed_postcode(url, allowed_postcodes):
    """Keep only Zürich candidates in the requested postal areas."""
    if not allowed_postcodes:
        return True
    match = re.search(r"(\d{4})-zurich/\d+/?", url.casefold())
    return bool(match and match.group(1) in allowed_postcodes)


class FlatfoxWebInteractor:
    def __init__(self, profile):
        self.base_url = "https://flatfox.ch/en/accounts/login/?next=/en/search/"
        self.profile = profile
        self.driver = webdriver.Chrome()
        self.state = "STARTING"

    def load(self):
        self.driver.get(self.base_url)
        time.sleep(TIME_DELAY_ON_LOAD)
        consent_button = self.driver.find_element(By.ID, "onetrust-accept-btn-handler")
        consent_button.click()
        time.sleep(TIME_DELAY_ON_LOAD)
        self.state = "LOADED"

    def enter(self):
        username_field = self.driver.find_element(By.ID, "id_email")
        username_field.send_keys(self.profile.flatfox_login)
        consent_button = self.driver.find_element(By.CLASS_NAME, "css-1iioj0r")
        consent_button.click()
        time.sleep(TIME_DELAY_ON_LOAD)
        username_field = self.driver.find_element(By.ID, "id_password")
        username_field.send_keys(self.profile.flatfox_password)
        consent_button.click()
        code = input("Enter the six-digit Flatfox login code: ").strip()
        if not (len(code) == 6 and code.isdigit()):
            raise ValueError("Flatfox login code must be six digits")
        otp_field = self.driver.find_element(By.ID, "f1")
        otp_field.send_keys(code)
        consent_button.click()
        self.state = "ENTERED"

    def search(self):
        self.driver.get(build_search_url(self.profile))
        WebDriverWait(self.driver, 20).until(
            lambda driver: driver.find_elements(By.CSS_SELECTOR, 'a[href*="/en/flat/"]')
            or "no results" in driver.find_element(By.TAG_NAME, "body").text.lower()
        )
        self.state = "SEARCHED"

    def gather_results(self):
        links = self.driver.execute_script(
            "return Array.from(document.querySelectorAll('a[href*=\"/en/flat/\"]'), a => a.href)"
        )
        valid_links = []
        seen = set()
        for url in links:
            if url and re.search(r"/en/flat/[^/]+/\d+/?(?:\?|$)", url) and url not in seen:
                if not is_allowed_postcode(url, self.profile.allowed_postcodes):
                    continue
                seen.add(url)
                valid_links.append(url)

        return valid_links

    def read_listing(self, url: str):
        """Collect visible public listing text without logging in or sending."""
        self.driver.get(url)
        WebDriverWait(self.driver, 20).until(
            lambda driver: driver.find_element(By.TAG_NAME, "body").text.strip()
        )
        return self.driver.find_element(By.TAG_NAME, "body").text.strip()

    def close(self):
        self.driver.quit()
