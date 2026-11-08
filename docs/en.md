# NBA for Gladys Assistant

NBA games in your Gladys calendar, filtered on the tip-off times that suit
you: for instance, only the games starting **at midnight at the latest, Paris
time**.

The schedule comes from the public ESPN API: no account, no key.

## Installation

1. Install the **NBA** integration from the Gladys integration catalog
   (Gladys 5.2 or later).
2. Open its configuration page. In the **My calendars** block, fill in your
   settings (see below), then click **Enable**.
3. An **NBA** calendar appears in your Gladys calendars. It is **private**:
   share it from the Calendar page so the rest of the household and the scenes
   see it.

Every Gladys user enables the integration for themselves and gets their own
calendar, with their own teams and times.

## Your calendar settings

| Setting          | Default        | Purpose                                                          |
| ---------------- | -------------- | ---------------------------------------------------------------- |
| Teams            | none           | The games of these teams (home or away). None: every game.       |
| Time zone        | `Europe/Paris` | Zone the tip-off window is read in (IANA name).                  |
| Earliest tip-off | empty (06:00)  | Earliest start time, `HH:MM`.                                    |
| Latest tip-off   | `00:00`        | Latest start time, `HH:MM`, included.                            |
| Days ahead       | 21             | Days of upcoming games in the calendar (1 to 60).                |
| Show the scores  | no             | Writes the final score of the games played (beware of spoilers). |

### The tip-off window

Only the games that **start** between the earliest and the latest tip-off are
added, both included. The window is read forward in time and may cross
midnight:

| Earliest  | Latest    | Games kept                                  |
| --------- | --------- | ------------------------------------------- |
| _(empty)_ | `00:00`   | 06:00 to midnight sharp: European evening   |
| `18:00`   | `23:00`   | 18:00 to 23:00: weekend and Christmas games |
| `20:00`   | `02:00`   | 20:00 to 02:00 in the morning               |
| _(empty)_ | _(empty)_ | every game                                  |

A blank time takes the bound of the "game day", which runs from **06:00 to
05:59** the next morning: no NBA game starts at dawn in Europe.

Daylight saving time is handled game by game: a game at 18:00 in New York is at
00:00 in Paris in winter, but at 23:00 during the few weeks of March and late
October when the two countries do not change their clocks on the same day.

## The events

- **Name**: `🏀 Celtics @ Lakers` (away @ home); `(postponed)` is added to a
  postponed game. With "Show the scores", a finished game becomes
  `🏀 Celtics 108 – 112 Lakers`.
- **Duration**: 2 h 30.
- **Location**: the arena and the city.
- **Description**: both teams, the competition (NBA Cup, playoffs...), the
  tip-off in your time zone, the US TV channels.
- **Link**: the game page on espn.com.

Canceled games are not added. At every sync, the games that no longer pass
your filters (window changed, team removed, game canceled) are removed from
the calendar. Events you create by hand in this calendar are never touched.

## Scenes

The NBA calendar is a Gladys calendar like any other: once shared, the
**A calendar event is coming** trigger can start a scene before every game
(turn the TV on, dim the lights, send a message...).

## Integration settings (administrator)

| Setting       | Default | Purpose                                      |
| ------------- | ------- | -------------------------------------------- |
| Sync interval | 60 min  | How often ESPN is read (15 to 1440 minutes). |

The **Synchronize now** button reads ESPN right away and tells, for each user,
how many games were added and how many the window or the team selection left
out.

## Troubleshooting

- **The calendar is empty**: on weekdays, most NBA games start between 01:00
  and 04:30 Paris time. With "latest 00:00", often only the weekend games
  remain. Clear both times to check the games come through.
- **"ESPN does not answer"**: the ESPN API is undocumented and may be down for
  a while. The calendars keep their games; the next sync tries again.
- **A misspelled time or time zone** is ignored and reported by the
  "Synchronize now" button.
