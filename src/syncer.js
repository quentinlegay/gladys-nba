// -----------------------------------------------------------------------------
// Synchronization: ESPN -> the NBA calendar of every user who enabled the
// integration.
//
// One ESPN read per round, whatever the number of users: the range read
// covers the widest window of all the accounts, then each account filters the
// same games with its own teams and tip-off window.
//
// Per user, a round is:
//   1. publishCalendars: create or rename their "NBA" calendar (upsert);
//   2. getCalendars: skip it when the user switched its `sync` off (the core
//      would answer 403);
//   3. publishCalendarEvents over the user's window, which also prunes the
//      events that no longer pass the filters.
// A failure on one user never stops the others. When ESPN does not answer,
// nothing is pushed: the calendars keep the last known games.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeAccount } from './config.js';
import { parseScoreboard } from './espn/parse.js';
import {
  CALENDAR_COLOR,
  buildEvents,
  calendarInfo,
  languageOf,
  splitWindow,
  syncWindow,
} from './calendar.js';

const logger = createLogger({ name: 'syncer' });

const DAY_MS = 24 * 60 * 60 * 1000;

// Identifiers stored by Gladys: never change them, or every user gets a new
// calendar and the old one is orphaned.
export const calendarKey = (userSelector) => `${userSelector}:nba`;
export const gameKey = (userSelector, gameId) => `${userSelector}:game:${gameId}`;

/**
 * @typedef {object} SyncResult
 * @property {{ selector: string, first_name?: string, language?: string }} user
 * @property {'synced' | 'sync_off' | 'error'} outcome
 * @property {object} [stats]     see buildEvents
 * @property {{ from: number, to: number } | null} window  the tip-off window
 * @property {object[]} warnings  see normalizeAccount
 * @property {string} [error]
 */

/**
 * @param {{ gladys: import('@gladysassistant/integration-sdk').GladysIntegration,
 *   espn: ReturnType<import('./espn/client.js').createEspnClient>, now?: () => number }} deps
 */
export function createSyncer({ gladys, espn, now = Date.now }) {
  // Rounds run one after the other, never two at once.
  let queue = Promise.resolve();

  async function readGames(accounts, at) {
    let from = Infinity;
    let to = -Infinity;
    for (const { settings } of accounts) {
      const window = syncWindow(settings, at);
      from = Math.min(from, window.from.getTime());
      to = Math.max(to, window.to.getTime());
    }
    // ESPN files a game under its US day, up to a day off the UTC one.
    return parseScoreboard(await espn.scoreboard(from - DAY_MS, to + DAY_MS));
  }

  /** @returns {Promise<SyncResult>} */
  async function syncAccount({ account, settings }, games, at) {
    const { user } = account;
    const result = { user, window: settings.window, warnings: settings.warnings };
    try {
      const language = languageOf(user);
      const calendarId = gladys.externalId(calendarKey(user.selector));
      await gladys.publishCalendars(user.selector, [
        { external_id: calendarId, color: CALENDAR_COLOR, ...calendarInfo(settings, language) },
      ]);
      const calendar = (await gladys.getCalendars(user.selector)).find(
        (candidate) => candidate.external_id === calendarId,
      );
      if (calendar && calendar.sync === false) {
        logger.info(`${user.selector}: calendar sync switched off, skipped`);
        return { ...result, outcome: 'sync_off' };
      }
      const window = syncWindow(settings, at);
      const { events, ranges, stats } = buildEvents(games, settings, {
        language,
        window,
        eventId: (gameId) => gladys.externalId(gameKey(user.selector, gameId)),
      });
      for (const chunk of splitWindow(window, events, (event) => ranges.get(event.external_id))) {
        await gladys.publishCalendarEvents(calendarId, chunk.events, {
          from: chunk.window.from.toISOString(),
          to: chunk.window.to.toISOString(),
        });
      }
      logger.info(
        `${user.selector}: ${stats.published} game(s) published, ` +
          `${stats.time} out of the tip-off window, ${stats.teams} of other teams`,
      );
      return { ...result, outcome: 'synced', stats };
    } catch (err) {
      logger.error(`${user.selector}: calendar sync failed`, err);
      return { ...result, outcome: 'error', error: err.message };
    }
  }

  async function run(onlyUser) {
    const at = now();
    const accounts = (await gladys.getCalendarAccounts())
      .filter((account) => !onlyUser || account.user.selector === onlyUser)
      .map((account) => ({ account, settings: normalizeAccount(account.config) }));
    if (accounts.length === 0) {
      return [];
    }
    const games = await readGames(accounts, at);
    const results = [];
    // One user after the other: the core allows 30 calendar writes a minute.
    for (const entry of accounts) {
      results.push(await syncAccount(entry, games, at));
    }
    return results;
  }

  return {
    /**
     * Synchronize every enabled user (or only one). A call during a round
     * waits for it, then runs its own.
     * @param {string} [onlyUser] user selector
     * @returns {Promise<SyncResult[]>} throws an EspnError when ESPN fails
     */
    sync(onlyUser) {
      const round = queue.then(() => run(onlyUser));
      queue = round.catch(() => {});
      return round;
    },
  };
}
