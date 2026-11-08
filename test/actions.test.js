import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow } from '../src/actions.js';
import { EspnError } from '../src/espn/client.js';
import { timeWindow } from '../src/schedule.js';

const fakeSyncer = (results) => ({
  async sync() {
    if (results instanceof Error) throw results;
    return results;
  },
});

test('sync_now reports, user by user, what went into the calendar', async () => {
  const message = await syncNow(
    fakeSyncer([
      {
        user: { selector: 'john', first_name: 'John' },
        outcome: 'synced',
        window: timeWindow(null, 0),
        stats: { games: 7, teams: 3, time: 2, canceled: 1, published: 1 },
        warnings: [{ key: 'unknown_teams', values: ['XYZ'] }],
      },
      {
        user: { selector: 'jane' },
        outcome: 'sync_off',
        window: null,
        warnings: [],
      },
      {
        user: { selector: 'bob', first_name: 'Bob' },
        outcome: 'error',
        window: null,
        error: 'boom',
        warnings: [{ key: 'time', values: ['25:00'] }],
      },
    ]),
  );
  assert.deepEqual(Object.keys(message), ['en', 'fr']);
  assert.equal(
    message.fr,
    [
      "John : 1 match(s) dans le calendrier, 2 écarté(s) par l'horaire (06:00 → 00:00), 3 d'autres équipes",
      '  ⚠ équipe(s) inconnue(s) ignorée(s) : XYZ',
      "jane : le calendrier NBA n'est pas synchronisé (interrupteur « sync » coupé).",
      'Bob : échec (boom).',
      '  ⚠ heure « 25:00 » illisible ignorée (écrivez-la HH:MM)',
    ].join('\n'),
  );
  assert.match(message.en, /^John: 1 game\(s\) in the calendar, 2 left out by the tip-off window/);
});

test('sync_now without any enabled user explains where to enable it', async () => {
  const message = await syncNow(fakeSyncer([]));
  assert.match(message.en, /My calendars/);
  assert.match(message.fr, /Mes calendriers/);
});

test('sync_now says when ESPN does not answer', async () => {
  const message = await syncNow(fakeSyncer(new EspnError('ESPN HTTP 503')));
  assert.match(message.en, /ESPN did not answer \(ESPN HTTP 503\)/);
  assert.match(message.fr, /ESPN n'a pas répondu/);
});
