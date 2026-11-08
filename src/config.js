// -----------------------------------------------------------------------------
// Configuration.
//
// Two levels, both declared in `gladys-assistant-integration.json`:
//   - `config_schema`: the integration's own settings, filled in once by an
//     administrator (how often ESPN is read);
//   - `account_schema`: the values of EACH user who enabled the integration in
//     the "My calendars" block (teams, time zone, tip-off window...). A
//     calendar is personal data: every user gets their own calendar.
//
// This module provides the defaults and normalizes what Gladys sends, so the
// rest of the code never deals with `undefined` nor with a malformed value.
// The defaults MUST stay equal to the `default` values of the manifest
// (test/manifest.test.js checks it).
// -----------------------------------------------------------------------------

import { parseTeams } from './nba/teams.js';
import { isValidTimezone, parseTime, timeWindow } from './schedule.js';

export const DEFAULT_CONFIG = {
  // Minutes between two reads of ESPN (and two pushes of the calendars).
  sync_interval: 60,
};

export const SYNC_INTERVAL_BOUNDS = { min: 15, max: 1440 };

export const DEFAULT_ACCOUNT = {
  teams: [],
  timezone: 'Europe/Paris',
  earliest_time: '',
  latest_time: '00:00',
  days_ahead: 21,
  show_scores: false,
};

export const DAYS_AHEAD_BOUNDS = { min: 1, max: 60 };

// The days already played kept in the calendar (with their score when the
// user asked for it); older games are left as they are, never deleted.
export const DAYS_BEHIND = 2;

function clamp(value, { min, max }, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Merge the integration config with the defaults.
 * @param {Record<string, unknown>} [raw]
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    sync_interval: clamp(
      raw.sync_interval ?? DEFAULT_CONFIG.sync_interval,
      SYNC_INTERVAL_BOUNDS,
      DEFAULT_CONFIG.sync_interval,
    ),
  };
}

/**
 * Normalize the account values of one user. Every problem is collected in
 * `warnings` (a key per problem) instead of failing: a typo in a time keeps
 * the calendar alive, without that end of the filter.
 * @param {Record<string, unknown>} [raw]
 */
export function normalizeAccount(raw = {}) {
  const warnings = [];

  const { teams, unknown } = parseTeams(raw.teams ?? DEFAULT_ACCOUNT.teams);
  if (unknown.length > 0) {
    warnings.push({ key: 'unknown_teams', values: unknown });
  }

  let timezone = String(raw.timezone ?? '').trim() || DEFAULT_ACCOUNT.timezone;
  if (!isValidTimezone(timezone)) {
    warnings.push({ key: 'timezone', values: [timezone] });
    timezone = DEFAULT_ACCOUNT.timezone;
  }

  const readTime = (key) => {
    const value = raw[key] === undefined ? DEFAULT_ACCOUNT[key] : raw[key];
    const minutes = parseTime(value);
    if (Number.isNaN(minutes)) {
      warnings.push({ key: 'time', values: [String(value)] });
      return null;
    }
    return minutes;
  };
  const earliest = readTime('earliest_time');
  const latest = readTime('latest_time');

  return {
    teams,
    timezone,
    earliest,
    latest,
    window: timeWindow(earliest, latest),
    days_ahead: clamp(
      raw.days_ahead ?? DEFAULT_ACCOUNT.days_ahead,
      DAYS_AHEAD_BOUNDS,
      DEFAULT_ACCOUNT.days_ahead,
    ),
    show_scores: raw.show_scores === true || raw.show_scores === 'true',
    warnings,
  };
}
