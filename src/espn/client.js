// -----------------------------------------------------------------------------
// ESPN public API client (no account, no key).
//
// One read-only endpoint, the NBA scoreboard over a range of days:
//   https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
//     ?dates=YYYYMMDD-YYYYMMDD&limit=1000
// The dates are US dates (ESPN files a game under its local US day): the
// caller asks for one day more on each side of the window it needs.
//
// The API is undocumented: it can change or throttle without notice. Every
// call has a timeout, and a failure throws an EspnError the caller reports
// without touching the calendars (the events already pushed stay as they are).
// `fetch` is injected so the tests never touch the network.
// -----------------------------------------------------------------------------

export const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const TIMEOUT_MS = 15_000;

export class EspnError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = 'EspnError';
    this.status = status;
    this.url = url;
  }
}

/** "20261108", the UTC day of a date. */
export function espnDate(date) {
  return new Date(date).toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createEspnClient({ fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  return {
    /**
     * Every NBA game filed between two days (inclusive).
     * @param {Date | number | string} from
     * @param {Date | number | string} to
     */
    async scoreboard(from, to) {
      const url = `${SCOREBOARD_URL}?dates=${espnDate(from)}-${espnDate(to)}&limit=1000`;
      let response;
      try {
        response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new EspnError(`ESPN unreachable: ${err.message}`, { url });
      }
      if (!response.ok) {
        throw new EspnError(`ESPN HTTP ${response.status}`, { status: response.status, url });
      }
      try {
        return await response.json();
      } catch {
        throw new EspnError('ESPN answered something that is not JSON', { url });
      }
    },
  };
}
