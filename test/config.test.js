import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ACCOUNT,
  DEFAULT_CONFIG,
  normalizeAccount,
  normalizeConfig,
} from '../src/config.js';

test('normalizeConfig fills the defaults and clamps the interval', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(normalizeConfig({ sync_interval: '30' }).sync_interval, 30);
  assert.equal(normalizeConfig({ sync_interval: 1 }).sync_interval, 15);
  assert.equal(normalizeConfig({ sync_interval: 99999 }).sync_interval, 1440);
  assert.equal(normalizeConfig({ sync_interval: 'abc' }).sync_interval, 60);
});

test('normalizeAccount defaults: every team, Paris, until 00:00, 21 days, no score', () => {
  const account = normalizeAccount();
  assert.deepEqual(account.teams, []);
  assert.equal(account.timezone, DEFAULT_ACCOUNT.timezone);
  assert.equal(account.earliest, null);
  assert.equal(account.latest, 0);
  assert.deepEqual(account.window, { from: 6 * 60, to: 0 });
  assert.equal(account.days_ahead, 21);
  assert.equal(account.show_scores, false);
  assert.deepEqual(account.warnings, []);
});

test('normalizeAccount clears the window when both times are blank', () => {
  assert.equal(normalizeAccount({ earliest_time: '', latest_time: '' }).window, null);
});

test('normalizeAccount reports what it could not read and keeps going', () => {
  const account = normalizeAccount({
    teams: ['LAL', 'NOPE'],
    timezone: 'Mars/Olympus',
    latest_time: '25:61',
    days_ahead: 500,
    show_scores: 'true',
  });
  assert.deepEqual(account.teams, ['LAL']);
  assert.equal(account.timezone, 'Europe/Paris');
  assert.equal(account.latest, null);
  assert.equal(account.window, null, 'the unreadable end is dropped');
  assert.equal(account.days_ahead, 60);
  assert.equal(account.show_scores, true);
  assert.deepEqual(
    account.warnings.map((w) => w.key),
    ['unknown_teams', 'timezone', 'time'],
  );
});
