// -----------------------------------------------------------------------------
// ESPN public API client (no account, no key).
//
// One read-only endpoint, the NBA scoreboard of one day:
//   https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
//     ?dates=YYYYMMDD
// A range (`dates=YYYYMMDD-YYYYMMDD`) is answered HTTP 400 over a few weeks,
// so a range is read day by day, a few days at a time, and merged. The dates
// are US dates (ESPN files a game under its local US day): the caller asks
// for one day more on each side of the window it needs.
//
// The API is undocumented: it can change or throttle without notice. Every
// call has a timeout, and a failure throws an EspnError the caller reports
// without touching the calendars (the events already pushed stay as they are).
// `fetch` is injected so the tests never touch the network.
// -----------------------------------------------------------------------------

export const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Days read at the same time: fast enough, gentle on an undocumented API.
const CONCURRENCY = 4;

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

/** Every UTC day between two dates, both included, as "YYYYMMDD". */
export function espnDays(from, to) {
  const days = [];
  const last = espnDate(to);
  for (let t = new Date(from).getTime(); ; t += DAY_MS) {
    const day = espnDate(t);
    days.push(day);
    if (day >= last) break;
  }
  return days;
}

/**
 * @param {{ fetch?: typeof fetch, timeoutMs?: number, concurrency?: number }} [options]
 */
export function createEspnClient({
  fetch = globalThis.fetch,
  timeoutMs = TIMEOUT_MS,
  concurrency = CONCURRENCY,
} = {}) {
  async function getJson(url) {
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
  }

  /** The NBA games filed on one US day ("YYYYMMDD"). */
  const day = (date) => getJson(`${SCOREBOARD_URL}?dates=${date}`);

  return {
    day,

    /**
     * Every NBA game filed between two days (inclusive), as one scoreboard
     * answer `{ events }`. One failed day fails the whole read: a partial
     * read would make the calendar prune the games of the missing day.
     * @param {Date | number | string} from
     * @param {Date | number | string} to
     */
    async scoreboard(from, to) {
      const days = espnDays(from, to);
      const answers = new Array(days.length);
      let next = 0;
      const worker = async () => {
        while (next < days.length) {
          const index = next++;
          answers[index] = await day(days[index]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, days.length) }, worker));
      // A game is listed once even if two days carry it.
      const events = new Map();
      for (const answer of answers) {
        for (const event of answer?.events ?? []) {
          if (event?.id != null && !events.has(String(event.id))) {
            events.set(String(event.id), event);
          }
        }
      }
      return { events: [...events.values()] };
    },
  };
}
