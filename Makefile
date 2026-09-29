.PHONY: check tracker

check:
	venv/bin/python -m pytest -q

tracker:
	venv/bin/python tracker_export.py
