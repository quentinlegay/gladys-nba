import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseScoreboard } from '../src/espn/parse.js';
import { normalizeAccount } from '../src/config.js';
import {
  buildEvents,
  calendarInfo,
  eventDescription,
  eventName,
  eventTiming,
  localDate,
  languageOf,
  splitWindow,
  syncWindow,
} from '../src/calendar.js';

const games = parseScoreboard(
  JSON.parse(await readFile(new URL('./fixtures/nba-scoreboard.json', import.meta.url), 'utf8')),
);
const NOW = Date.parse('2026-11-08T12:00:00Z');
const gameById = (id) => games.find((game) => game.id === id);

function build(account, language = 'fr') {
  const settings = normalizeAccount(account);
  return buildEvents(games, settings, {
    language,
    window: syncWindow(settings, NOW),
    eventId: (id) => `ext:test:john:game:${id}`,
  });
}

const idsOf = (events) => events.map((event) => event.external_id.split(':').at(-1));

test('the default account keeps the games starting until 00:00, Paris time', () => {
  // Defaults: every team, Europe/Paris, latest tip-off 00:00.
  const { events, stats } = build({});
  assert.deepEqual(idsOf(events), ['401800005', '401800003', '401800002', '401800007']);
  // In the window: 7 games (the March one is too far). Out by time: 04:30 and
  // 01:00; canceled: 1.
  assert.deepEqual(stats, { games: 7, teams: 0, time: 2, canceled: 1, published: 4 });
});

test('blank times keep every game but the canceled one', () => {
  const { events } = build({ earliest_time: '', latest_time: '' });
  assert.equal(events.length, 6);
});

test('the team selection keeps the games of either side', () => {
  const { events, stats } = build({ teams: ['LAL'], latest_time: '' });
  assert.deepEqual(idsOf(events), ['401800005', '401800001']);
  assert.equal(stats.teams, 5);
  const { events: evening } = build({ teams: ['LAL'] });
  assert.deepEqual(idsOf(evening), ['401800005'], 'the 04:30 game of the Lakers is left out');
});

test('an evening-only window, read in another time zone', () => {
  // New York: LAL @ DEN at 17:00, SA @ MIA at 15:00, NY @ ORL at 18:00,
  // GS @ PHI at 19:00, BOS @ LAL at 22:30.
  const { events } = build({
    timezone: 'America/New_York',
    earliest_time: '18:00',
    latest_time: '20:00',
  });
  assert.deepEqual(idsOf(events), ['401800002', '401800004']);
});

test('all-day events (default): the game day, the tip-off in the title', () => {
  const { events } = build({ latest_time: '' });
  const nyOrl = events.find((e) => e.external_id.endsWith(':401800002'));
  // Tip-off 2026-11-08T23:00Z is Monday 00:00 in Paris: the event is Monday.
  assert.equal(nyOrl.full_day, true);
  assert.equal(nyOrl.start, '2026-11-09');
  assert.equal(nyOrl.end, '2026-11-10', 'exclusive end: one single day');
  assert.equal(nyOrl.name, '🏀 00:00 NY @ ORL');
  const saMia = events.find((e) => e.external_id.endsWith(':401800003'));
  assert.equal(saMia.start, '2026-11-08');
  assert.equal(saMia.name, '🏀 21:00 SA @ MIA');
});

test('timed events: tip-off to an estimated end, never past 23:59', () => {
  const { events } = build({ latest_time: '', event_style: 'timed' });
  const byId = (id) => events.find((e) => e.external_id.endsWith(`:${id}`));
  // 21:00 Paris: 2 h 15 fits in the day.
  assert.equal(byId('401800003').start, '2026-11-08T20:00:00.000Z');
  assert.equal(byId('401800003').end, '2026-11-08T22:15:00.000Z');
  assert.equal(byId('401800003').full_day, undefined);
  assert.equal(byId('401800003').name, '🏀 SA @ MIA', 'the calendar already shows the time');
  // 23:00 Paris: cut at 23:59.
  assert.equal(byId('401800005').end, '2026-11-07T22:59:00.000Z');
  // 00:00 and 04:30 Paris: night games keep their 2 h 15.
  assert.equal(byId('401800002').end, '2026-11-09T01:15:00.000Z');
  assert.equal(byId('401800001').end, '2026-11-08T05:45:00.000Z');
});

test('eventTiming handles the daylight saving time change of the zone', () => {
  // Paris switches to winter time on 2026-10-25: a 23:30 game that evening.
  const { fields, range } = eventTiming('2026-10-25T22:30:00Z', 'all_day', 'Europe/Paris');
  assert.deepEqual(fields, { start: '2026-10-25', end: '2026-10-26', full_day: true });
  assert.ok(range.start <= Date.parse('2026-10-25T22:30:00Z') && range.end > range.start);
  assert.equal(localDate('2026-11-08T23:30:00Z', 'Europe/Paris'), '2026-11-09');
});

test('the window bounds the games by their tip-off', () => {
  const { events } = build({ latest_time: '', days_ahead: 1, event_style: 'timed' });
  const window = syncWindow(normalizeAccount({ days_ahead: 1 }), NOW);
  for (const event of events) {
    assert.ok(Date.parse(event.start) < window.to.getTime());
    assert.ok(Date.parse(event.start) >= window.from.getTime());
  }
  assert.ok(!idsOf(events).includes('401800007'), 'the game of Nov 9 evening is beyond one day');
});

test('event texts: abbreviations, postponed flag, no spoiler unless asked', () => {
  const played = gameById('401800005');
  const paris = { timezone: 'Europe/Paris' };
  assert.equal(
    eventName(played, { ...paris, language: 'fr', showScores: false }),
    '🏀 23:00 LAL @ DEN',
  );
  assert.equal(
    eventName(played, { ...paris, language: 'en', showScores: true }),
    '🏀 LAL 108 – 112 DEN',
  );
  assert.equal(
    eventName(gameById('401800007'), { ...paris, language: 'fr', showScores: false }),
    '🏀 20:30 POR @ UTAH (reporté)',
  );
  assert.equal(
    eventName(gameById('401800001'), {
      ...paris,
      language: 'en',
      showScores: true,
      style: 'timed',
    }),
    '🏀 BOS @ LAL',
    'no score before the game, no time on a timed event',
  );

  const fr = eventDescription(gameById('401800003'), {
    language: 'fr',
    timezone: 'Europe/Paris',
    showScores: false,
  });
  assert.match(fr, /^NBA · San Antonio Spurs chez Miami Heat\nNBA Cup\n/);
  assert.match(fr, /Coup d’envoi : dim\. 8 nov\. 2026.*21:00 \(Europe\/Paris\)/);
  assert.match(fr, /Salle : Kaseya Center, Miami/);
  assert.match(fr, /TV \(US\) : NBA TV, ESPN/);

  const en = eventDescription(played, {
    language: 'en',
    timezone: 'Europe/Paris',
    showScores: true,
  });
  assert.match(en, /Tip-off: Sat, 7 Nov 2026, 23:00 \(Europe\/Paris\)/);
  assert.match(en, /Final: LAL 108 – 112 DEN/);
  assert.doesNotMatch(
    eventDescription(played, { language: 'en', timezone: 'Europe/Paris', showScores: false }),
    /108/,
  );
});

test('the events carry location and ESPN link', () => {
  const { events } = build({});
  const event = events.find((e) => e.external_id.endsWith(':401800003'));
  assert.equal(event.location, 'Kaseya Center, Miami');
  assert.equal(event.url, 'https://www.espn.com/nba/game/_/gameId/401800003');
});

test('calendar name and description follow the account', () => {
  assert.deepEqual(calendarInfo(normalizeAccount({}), 'fr'), {
    name: 'NBA',
    description: 'Matchs NBA d’après ESPN · Tous les matchs NBA · début 06:00 → 00:00.',
  });
  assert.deepEqual(
    calendarInfo(normalizeAccount({ teams: ['LAL', 'BOS'], latest_time: '' }), 'en'),
    {
      name: 'NBA · LAL, BOS',
      description: 'NBA games from ESPN · LAL, BOS.',
    },
  );
});

test('languageOf picks French for fr users, English otherwise', () => {
  assert.equal(languageOf({ language: 'fr' }), 'fr');
  assert.equal(languageOf({ language: 'fr-FR' }), 'fr');
  assert.equal(languageOf({ language: 'de' }), 'en');
  assert.equal(languageOf(undefined), 'en');
});

test('splitWindow keeps requests under the limit, straddling events in both halves', () => {
  const window = { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-03T00:00:00Z') };
  const event = (iso, minutes) => ({
    start: Date.parse(iso),
    end: Date.parse(iso) + minutes * 60_000,
  });
  const events = [
    event('2026-11-01T10:00:00Z', 135),
    event('2026-11-01T23:00:00Z', 135), // straddles the middle (Nov 2, 00:00)
    event('2026-11-02T10:00:00Z', 135),
  ];
  const rangeOf = (e) => e;
  assert.equal(splitWindow(window, events, rangeOf, 10).length, 1);
  const chunks = splitWindow(window, events, rangeOf, 2);
  assert.deepEqual(
    chunks.map((chunk) => chunk.events.length),
    [2, 2],
  );
  assert.equal(chunks[0].window.to.toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(chunks[1].window.from.toISOString(), '2026-11-02T00:00:00.000Z');

  // A zero-length range on a boundary belongs to the later sub-window only.
  const points = ['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', '2026-11-02T10:00:00Z'].map(
    (iso) => event(iso, 0),
  );
  assert.deepEqual(
    splitWindow(window, points, rangeOf, 2).map((chunk) => chunk.events.length),
    [1, 2],
  );
});
