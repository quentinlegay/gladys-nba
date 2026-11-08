# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** of type `calendar` (Node 22+, ESM,
no build step, one runtime dependency:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)).
It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

Every Gladys user who enables it in the "My calendars" block gets an "NBA"
calendar, filled from the public ESPN scoreboard API with the games of the
teams they picked, kept to a tip-off window of their time zone (default: until
00:00, Europe/Paris). Gladys 5.2+ is required (`type: "calendar"`,
`account_schema`).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/schedule.test.js         # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint` and `test` before pushing: the CI runs them on Node
22 and 24.

## Architecture

```
index.js            SDK wiring only: handlers registered before connect(), sync timer
src/syncer.js       a sync round: one ESPN read, then each enabled user (publishCalendars,
                    getCalendars for the `sync` flag, publishCalendarEvents with a window)
src/calendar.js     pure: games -> events of one user, texts (en/fr), window splitting
src/schedule.js     pure: the tip-off time window
src/config.js       DEFAULT_CONFIG (config_schema) and DEFAULT_ACCOUNT (account_schema)
src/espn/           ESPN client (fetch injected) and parser
src/nba/teams.js    the 30 teams (ESPN abbreviations) and their aliases
src/actions.js      the "sync_now" button message
```

## Rules

- **External ids are forever.** The calendar is `ext:<selector>:<user>:nba`, a
  game `ext:<selector>:<user>:game:<espn id>` (see `calendarKey` / `gameKey` in
  src/syncer.js). Changing them gives every user a new calendar and orphans the
  old one. The same goes for the keys users store: `config_schema` and
  `account_schema` keys, the team codes of the multi-select, action keys.
- **The prune window is the delete mechanism.** `publishCalendarEvents` with a
  window deletes the integration's events overlapping it that are not in the
  list: every pushed event must overlap its window, and an event straddling two
  sub-windows goes into both (`splitWindow`).
- **Core limits**: 500 events per request, 30 calendar writes per minute, 50
  calendars per user; texts: name ≤ 200, description ≤ 1000, location ≤ 500,
  url http(s) ≤ 500.
- **The container rootfs is read-only.** This integration writes nothing; if it
  ever needs to, only under `/data`.
- **Versions belong to the Release workflow.** Never edit `version` in
  `package.json` or in the manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading.
- **Manifest.** Texts are `{ "en": ..., "fr": ... }` objects. The catalog
  `description` holds 10 to 100 characters per language. `test/manifest.test.js`
  ties the manifest to the code (defaults, bounds, teams, action handlers):
  change both sides together.
- **User-facing text** is bilingual (English and French): event texts, action
  messages, manifest texts, `docs/en.md` / `docs/fr.md`.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (ESPN fixture in `test/fixtures/`).
