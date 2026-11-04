#!/bin/sh
# Best-effort Node-host build step. Docker installs these dependencies directly.
set -u
if ! command -v python3 >/dev/null 2>&1; then
  echo '[YouTube] Python 3 is unavailable; YouTube downloads require host setup.'
  exit 0
fi
if python3 -m venv .venv && .venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt 'yt-dlp[default]'; then
  echo '[YouTube] Python downloader dependencies installed.'
else
  echo '[YouTube] Could not install Python downloader dependencies; see owner setup instructions.'
fi
exit 0
