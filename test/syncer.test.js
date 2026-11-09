import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createSyncer } from '../src/syncer.js';
import { EspnError } from '../src/espn/client.js';

const scoreboard = JSON.parse(
  await readFile(new URL('./fixtures/nba-scoreboard.json', import.meta.url), 'utf8'),
);
const NOW = Date.parse('2026-11-08T12:00:00Z');

const john = { selector: 'john', first_name: 'John', language: 'fr' };
const jane = { selector: 'jane', first_name: 'Jane', language: 'en' };

function fakeEspn(answer = scoreboard) {
  const calls = [];
  return {
    calls,
    async scoreboard(from, to) {
      calls.push({ from, to });
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

function setup({ accounts, calendars, calendarEvents, espn = fakeEspn() }) {
  const gladys = createFakeGladys({ calendarAccounts: accounts, calendars, calendarEvents });
  const syncer = createSyncer({ gladys, espn, now: () => NOW });
  return { gladys, syncer, espn };
}

const eventsOf = (gladys, user) =>
  gladys.fake.calendarEvents.filter(
    (event) => event.calendar_external_id === `ext:test-integration:${user}:nba`,
  );

test('every enabled user gets their own NBA calendar, filtered their way', async () => {
  const { gladys, syncer, espn } = setup({
    accounts: [
      { user: john, config: { teams: ['LAL', 'NYK'], latest_time: '00:00' } },
      { user: jane, config: { teams: [], earliest_time: '', latest_time: '' } },
    ],
  });
  const results = await syncer.sync();

  assert.equal(espn.calls.length, 1, 'one ESPN read for everybody');
  assert.deepEqual(
    gladys.fake.calendars.map((c) => [c.external_id, c.name, c.color]),
    [
      ['ext:test-integration:john:nba', 'NBA · LAL, NY', '#1d428a'],
      ['ext:test-integration:jane:nba', 'NBA', '#1d428a'],
    ],
  );
  // John: LAL @ DEN (23:00) and NY @ ORL (00:00); BOS @ LAL (04:30) is too late.
  assert.deepEqual(
    eventsOf(gladys, 'john').map((e) => e.name),
    ['🏀 23:00 LAL @ DEN', '🏀 00:00 NY @ ORL'],
  );
  // Jane: every game but the canceled one.
  assert.equal(eventsOf(gladys, 'jane').length, 6);
  assert.ok(
    eventsOf(gladys, 'jane').every((e) =>
      e.external_id.startsWith('ext:test-integration:jane:game:'),
    ),
  );

  assert.deepEqual(
    results.map((r) => [r.user.selector, r.outcome, r.stats.published]),
    [
      ['john', 'synced', 2],
      ['jane', 'synced', 6],
    ],
  );
});

test('a resync prunes the games that no longer pass the filter', async () => {
  const accounts = [{ user: john, config: { teams: ['LAL'], latest_time: '' } }];
  const { gladys, syncer } = setup({ accounts });
  await syncer.sync();
  assert.equal(eventsOf(gladys, 'john').length, 2);

  // The user narrows the tip-off window: the 04:30 game leaves the calendar.
  gladys.fake.calendarAccounts[0].config.latest_time = '00:00';
  await syncer.sync('john');
  assert.deepEqual(
    eventsOf(gladys, 'john').map((e) => e.name),
    ['🏀 23:00 LAL @ DEN'],
  );
});

test('events created by hand and games outside the window are left alone', async () => {
  const calendarId = 'ext:test-integration:john:nba';
  const { gladys, syncer } = setup({
    accounts: [{ user: john, config: {} }],
    calendars: [
      {
        user: 'john',
        external_id: calendarId,
        selector: 'nba',
        name: 'NBA',
        description: '',
        color: '#1d428a',
        sync: true,
        shared: true,
      },
    ],
    calendarEvents: [
      {
        calendar_external_id: calendarId,
        external_id: 'ext:test-integration:john:game:old',
        name: 'An old game',
        start: '2026-10-01T23:00:00.000Z',
        end: '2026-10-02T01:30:00.000Z',
      },
    ],
  });
  await syncer.sync();
  const names = eventsOf(gladys, 'john').map((e) => e.name);
  assert.ok(names.includes('An old game'), 'before the window: kept');
  assert.equal(gladys.fake.calendars[0].shared, true, 'the user-owned flag is untouched');
});

test('a calendar whose sync is switched off is skipped', async () => {
  const { gladys, syncer } = setup({
    accounts: [{ user: john, config: {} }],
    calendars: [
      {
        user: 'john',
        external_id: 'ext:test-integration:john:nba',
        selector: 'nba',
        name: 'NBA',
        description: '',
        color: '#1d428a',
        sync: false,
        shared: false,
      },
    ],
  });
  const [result] = await syncer.sync();
  assert.equal(result.outcome, 'sync_off');
  assert.ok(!gladys.fake.requests.some((r) => r.path === '/calendar/event'));
});

test('no enabled user: ESPN is not even read', async () => {
  const { syncer, espn } = setup({ accounts: [] });
  assert.deepEqual(await syncer.sync(), []);
  assert.equal(espn.calls.length, 0);
});

test('ESPN down: the round throws and nothing is pushed', async () => {
  const { gladys, syncer } = setup({
    accounts: [{ user: john, config: {} }],
    espn: fakeEspn(new EspnError('ESPN HTTP 503', { status: 503 })),
  });
  await assert.rejects(syncer.sync(), EspnError);
  assert.ok(!gladys.fake.requests.some((r) => r.method === 'POST'));
});

test('the ESPN range covers the widest account window, with a day of margin', async () => {
  const { syncer, espn } = setup({
    accounts: [
      { user: john, config: { days_ahead: 7 } },
      { user: jane, config: { days_ahead: 30 } },
    ],
  });
  await syncer.sync();
  const DAY = 24 * 60 * 60 * 1000;
  assert.equal(espn.calls[0].from, NOW - 3 * DAY);
  assert.equal(espn.calls[0].to, NOW + 31 * DAY);
});

test('a failing user does not stop the others', async () => {
  const { gladys, syncer } = setup({
    accounts: [
      { user: john, config: {} },
      { user: jane, config: {} },
    ],
  });
  const original = gladys.publishCalendars.bind(gladys);
  gladys.publishCalendars = async (user, calendars) => {
    if (user === 'john') throw new Error('boom');
    return original(user, calendars);
  };
  const results = await syncer.sync();
  assert.deepEqual(
    results.map((r) => [r.user.selector, r.outcome]),
    [
      ['john', 'error'],
      ['jane', 'synced'],
    ],
  );
});

test('rounds never overlap', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const espn = {
    async scoreboard() {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return scoreboard;
    },
  };
  const { syncer } = setup({ accounts: [{ user: john, config: {} }], espn });
  await Promise.all([syncer.sync(), syncer.sync(), syncer.sync('john')]);
  assert.equal(maxInFlight, 1);
});
