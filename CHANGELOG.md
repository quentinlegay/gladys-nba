# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- An "NBA" calendar per Gladys user who enables the integration, filled with
  the games read on the public ESPN API (no account, no key).
- Team selection: the 30 NBA teams in a multi-select; none selected means every
  game.
- Tip-off window in the user's time zone (default: until 00:00, Europe/Paris),
  to keep only the games that can be watched in the European evening.
- Optional final scores in the games already played (off by default: no
  spoiler).
- A "Synchronize now" button reporting, user by user, the games added and the
  games left out by the window.
