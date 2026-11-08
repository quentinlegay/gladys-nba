# gladys-nba

A [Gladys Assistant](https://gladysassistant.com) external integration that puts
**NBA games into your Gladys calendar**, kept to the tip-off times that suit
you — e.g. only the games starting at **00:00 at the latest, Paris time**, the
ones you can actually watch from Europe.

- One **NBA calendar per Gladys user** who enables it, with their own teams
  (multi-select of the 30 teams, or every game) and their own time window.
- **Tip-off window** read in the user's time zone (default `Europe/Paris`,
  latest tip-off `00:00`), daylight saving time handled game by game.
- Games that no longer pass the filters, and canceled games, leave the
  calendar at the next sync; events created by hand are never touched.
- Optional final scores (off by default: no spoiler for the morning replay).
- Works with the calendar view, the `calendar.event-is-coming` scene trigger
  and the assistant, like any Gladys calendar.

Data: the public ESPN scoreboard API (no account, no key).

User documentation: [English](docs/en.md) · [Français](docs/fr.md).

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js),
inspired by [gladys-teamtracker](https://github.com/prohand/gladys-teamtracker)
(ESPN reading) — this integration adds the calendar and the European-hours
filter.

## Development

Node 22+, ESM, no build step, one runtime dependency
(`@gladysassistant/integration-sdk`).

```bash
npm install
```

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run format:check
```

```bash
npx github:GladysAssistant/integration-store .
```

Layout:

```
index.js                          SDK wiring: timer, account updates, sync_now action
src/syncer.js                     one round: ESPN read, then each user's calendar
src/calendar.js                   games -> calendar events (pure), window splitting
src/schedule.js                   tip-off time window (pure)
src/config.js                     config_schema + account_schema defaults, normalization
src/espn/client.js, parse.js      ESPN scoreboard client and parser
src/nba/teams.js                  the 30 teams, ESPN abbreviations and aliases
src/actions.js                    "Synchronize now" message
gladys-assistant-integration.json manifest (type "calendar", Gladys >= 5.2.0)
docs/en.md, docs/fr.md            user documentation
```

## Release

Versions are cut by the **Release** workflow (Actions → Release), which bumps
`package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds and pushes
the multi-arch image to `ghcr.io/quentinlegay/gladys-nba`. The first image
pushed creates a **private** package on ghcr.io: make it public once (Package
settings → Change visibility), or Gladys cannot pull it.

## License

Apache-2.0.
