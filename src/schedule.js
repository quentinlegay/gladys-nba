// -----------------------------------------------------------------------------
// Tip-off time filter: keep only the games starting inside a time window of
// the user's time zone, e.g. "at midnight at the latest, Paris time".
//
// A window is read FORWARD from its earliest time to its latest time:
//   - earliest 18:00, latest 23:30 -> 18:00 ... 23:30;
//   - earliest 06:00, latest 00:00 -> 06:00 ... midnight (crosses no day:
//     the window ends exactly at 00:00, included);
//   - earliest 20:00, latest 02:00 -> 20:00 ... midnight ... 02:00.
// Both ends are included. A blank end takes the bound of the "game day",
// which runs from 06:00 to 05:59 the next morning: no NBA game starts at
// dawn in Europe, so a blank earliest time means "from the morning" and a
// blank latest time "until the end of the night". Both blank: no filter.
//
// Pure functions: the local time comes from Intl, so the daylight saving time
// changes of the user's zone are handled for every single game.
// -----------------------------------------------------------------------------

export const DAY_START = 6 * 60; // 06:00
export const DAY_END = DAY_START - 1; // 05:59

/**
 * Minutes since midnight of an "HH:MM" (or "HHhMM", "H") text; null when
 * blank; NaN when unreadable. "24:00" is midnight.
 * @param {unknown} value
 */
export function parseTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(/^(\d{1,2})(?:\s*[:hH.]\s*(\d{2})?)?$/);
  if (!match) {
    return Number.NaN;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) {
    return Number.NaN;
  }
  return (hours * 60 + minutes) % (24 * 60);
}

/** "00:00", from minutes since midnight. */
export function formatTime(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** True when the IANA zone is known to this Node build. */
export function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return Boolean(timezone);
  } catch {
    return false;
  }
}

/**
 * Minutes since midnight of a date, in a time zone.
 * @param {string | number | Date} date
 * @param {string} timezone IANA name
 */
export function localMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).formatToParts(new Date(date));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

/**
 * The effective window of two optional ends, or null for "no filter".
 * @param {number | null} earliest minutes, null when blank
 * @param {number | null} latest minutes, null when blank
 * @returns {{ from: number, to: number } | null}
 */
export function timeWindow(earliest, latest) {
  if (earliest == null && latest == null) {
    return null;
  }
  return { from: earliest ?? DAY_START, to: latest ?? DAY_END };
}

/**
 * Is a time of day inside a window (both ends included, read forward)?
 * @param {number} minutes
 * @param {{ from: number, to: number } | null} window
 */
export function isInWindow(minutes, window) {
  if (!window) {
    return true;
  }
  if (window.from <= window.to) {
    return minutes >= window.from && minutes <= window.to;
  }
  // The window crosses midnight.
  return minutes >= window.from || minutes <= window.to;
}

/**
 * Does a game start inside the window, in the given time zone?
 * @param {string} start ISO date of the tip-off
 * @param {{ from: number, to: number } | null} window
 * @param {string} timezone
 */
export function startsInWindow(start, window, timezone) {
  return isInWindow(localMinutes(start, timezone), window);
}
