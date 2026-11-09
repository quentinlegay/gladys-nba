// -----------------------------------------------------------------------------
// From NBA games to the events of a user's Gladys calendar.
//
// Pure functions: given the games read on ESPN, the account values of a user
// and the current time, which events to push and over which window. The
// syncer (src/syncer.js) does the I/O.
//
// The window matters: publishCalendarEvents PRUNES the integration's events
// overlapping it that are not in the list. So a game moved out of the tip-off
// window, a team removed from the selection or a canceled game disappears
// from the calendar at the next sync, while events created by hand in Gladys
// are never touched.
// -----------------------------------------------------------------------------

import { DAYS_BEHIND, EVENT_STYLES } from './config.js';
import { DAY_START, formatTime, localMinutes, startsInWindow } from './schedule.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Two shapes of event, chosen per user (`event_style`). The Gladys calendar
// view shows a timed event as "start – end", sized by its duration, so:
//   - all_day (default): a full-day event named "🏀 21:00 BOS @ LAL": one
//     time only, and the title is readable in the all-day row;
//   - timed: from the tip-off to an estimated end (an NBA game lasts about
//     2 h 15), cut at 23:59 so an evening game never shows on two days. The
//     calendar scene trigger ("an event is coming") fires before the tip-off.
export const GAME_DURATION_MS = 135 * 60 * 1000;
export { EVENT_STYLES };

// Core limit: 500 events per publishCalendarEvents request.
export const MAX_EVENTS_PER_REQUEST = 500;

export const CALENDAR_COLOR = '#1d428a';

const LOCALES = { en: 'en-GB', fr: 'fr-FR' };

const WORDS = {
  en: {
    postponed: 'postponed',
    final: 'Final',
    tipoff: 'Tip-off',
    venue: 'Arena',
    tv: 'TV (US)',
    at: 'at',
    allGames: 'Every NBA game',
    calendarDescription: (teams, window) =>
      `NBA games from ESPN${teams ? ` · ${teams}` : ''}${window ? ` · tip-off ${window}` : ''}.`,
  },
  fr: {
    postponed: 'reporté',
    final: 'Score final',
    tipoff: 'Coup d’envoi',
    venue: 'Salle',
    tv: 'TV (US)',
    at: 'chez',
    allGames: 'Tous les matchs NBA',
    calendarDescription: (teams, window) =>
      `Matchs NBA d’après ESPN${teams ? ` · ${teams}` : ''}${window ? ` · début ${window}` : ''}.`,
  },
};

export function languageOf(user) {
  return String(user?.language ?? '')
    .toLowerCase()
    .startsWith('fr')
    ? 'fr'
    : 'en';
}

function isCanceled(game) {
  return /CANCEL|FORFEIT/.test(game.statusName);
}

function isPostponed(game) {
  return /POSTPONED|SUSPENDED|DELAYED/.test(game.statusName);
}

function truncate(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** "06:00 → 00:00", the window as written in the calendar description. */
export function describeWindow(window) {
  return window ? `${formatTime(window.from)} → ${formatTime(window.to)}` : '';
}

/** "sam. 8 nov. 2026, 21:00 (Europe/Paris)". */
export function formatTipoff(start, language, timezone) {
  const text = new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).format(new Date(start));
  return `${text} (${timezone})`;
}

/** "21:00", the tip-off in the user's time zone. */
export function formatClock(start, timezone) {
  return formatTime(localMinutes(start, timezone));
}

/**
 * "🏀 21:00 BOS @ LAL" (all-day event) or "🏀 BOS @ LAL" (timed event: the
 * calendar already shows the time), "🏀 BOS 108 – 112 LAL" once played when
 * the scores are wanted. Abbreviations keep the title short enough for the
 * calendar cells: the full names are in the description.
 */
export function eventName(game, { language, showScores, timezone, style = 'all_day' }) {
  const w = WORDS[language];
  const scored = showScores && game.completed && game.away.score != null && game.home.score != null;
  const matchup = scored
    ? `${game.away.code} ${game.away.score} – ${game.home.score} ${game.home.code}`
    : `${game.away.code} @ ${game.home.code}`;
  const clock = style === 'all_day' && !scored ? `${formatClock(game.start, timezone)} ` : '';
  const suffix = isPostponed(game) ? ` (${w.postponed})` : '';
  return truncate(`🏀 ${clock}${matchup}${suffix}`, 200);
}

export function eventDescription(game, { language, timezone, showScores }) {
  const w = WORDS[language];
  // The French typography puts a space before the colon, English does not.
  const sep = language === 'fr' ? ' : ' : ': ';
  const lines = [`NBA · ${game.away.name} ${w.at} ${game.home.name}`];
  if (game.note) {
    lines.push(game.note);
  }
  lines.push(`${w.tipoff}${sep}${formatTipoff(game.start, language, timezone)}`);
  if (game.venue) {
    lines.push(`${w.venue}${sep}${[game.venue, game.city].filter(Boolean).join(', ')}`);
  }
  if (game.broadcasts.length > 0) {
    lines.push(`${w.tv}${sep}${game.broadcasts.join(', ')}`);
  }
  if (showScores && game.completed && game.away.score != null && game.home.score != null) {
    lines.push(
      `${w.final}${sep}${game.away.code} ${game.away.score} – ${game.home.score} ${game.home.code}`,
    );
  }
  return truncate(lines.join('\n'), 1000);
}

/** Name and description of the user's NBA calendar. */
export function calendarInfo(settings, language) {
  const w = WORDS[language];
  const teams = settings.teams.join(', ');
  return {
    name: truncate(teams ? `NBA · ${teams}` : 'NBA', 100),
    description: truncate(
      w.calendarDescription(teams || w.allGames, describeWindow(settings.window)),
      500,
    ),
  };
}

/** The range of dates a user's calendar covers: a few days back, N days ahead. */
export function syncWindow(settings, now) {
  return {
    from: new Date(now - DAYS_BEHIND * DAY_MS),
    to: new Date(now + settings.days_ahead * DAY_MS),
  };
}

// The core's overlap rule, on a range of instants { start, end } (ms).
function overlaps(range, window) {
  return (
    range.start < window.to.getTime() &&
    (range.end > window.from.getTime() || range.start >= window.from.getTime())
  );
}

/** "2026-11-08", the calendar date of an instant in a time zone. */
export function localDate(start, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(new Date(start));
}

/**
 * The time fields of a game's event, and the instants it covers (to place it
 * in its window). A full-day event is stored by Gladys at the midnights of
 * the instance time zone, taken here as the user's own.
 */
export function eventTiming(start, style, timezone) {
  const tipoff = Date.parse(start);
  const minutes = localMinutes(tipoff, timezone);
  if (style === 'all_day') {
    const dayStart = tipoff - minutes * 60_000;
    const dayEnd = dayStart + DAY_MS;
    return {
      fields: {
        start: localDate(tipoff, timezone),
        end: localDate(dayEnd + 60 * 60_000, timezone), // exclusive: the next day
        full_day: true,
      },
      range: { start: dayStart, end: dayEnd },
    };
  }
  let end = tipoff + GAME_DURATION_MS;
  // An evening game would end after midnight: stop at 23:59, same day.
  if (minutes >= DAY_START && minutes * 60_000 + GAME_DURATION_MS >= DAY_MS) {
    end = tipoff + (24 * 60 - 1 - minutes) * 60_000;
  }
  return {
    fields: { start: new Date(tipoff).toISOString(), end: new Date(end).toISOString() },
    range: { start: tipoff, end },
  };
}

/**
 * The events of one user's calendar.
 * @param {import('./espn/parse.js').Game[]} games
 * @param {ReturnType<import('./config.js').normalizeAccount>} settings
 * @param {{ language: 'en' | 'fr', eventId: (gameId: string) => string, window: { from: Date, to: Date } }} options
 * @returns {{ events: object[], ranges: Map<string, { start: number, end: number }>, stats: object }}
 *   `ranges`: the instants each event covers, by external id (see splitWindow)
 */
export function buildEvents(games, settings, { language, eventId, window }) {
  const stats = { games: 0, teams: 0, time: 0, canceled: 0, published: 0 };
  const followed = new Set(settings.teams);
  const events = [];
  const ranges = new Map();
  for (const game of games) {
    // The game belongs to the window by its tip-off: the day of an all-day
    // event then overlaps the window too, as the core requires.
    const tipoff = Date.parse(game.start);
    if (!overlaps({ start: tipoff, end: tipoff }, window)) {
      continue;
    }
    stats.games += 1;
    if (followed.size > 0 && !followed.has(game.home.code) && !followed.has(game.away.code)) {
      stats.teams += 1;
      continue;
    }
    if (isCanceled(game)) {
      stats.canceled += 1;
      continue;
    }
    if (!startsInWindow(game.start, settings.window, settings.timezone)) {
      stats.time += 1;
      continue;
    }
    const textOptions = {
      language,
      timezone: settings.timezone,
      showScores: settings.show_scores,
      style: settings.event_style,
    };
    const { fields, range } = eventTiming(game.start, settings.event_style, settings.timezone);
    const event = {
      external_id: eventId(game.id),
      name: eventName(game, textOptions),
      ...fields,
      description: eventDescription(game, textOptions),
    };
    const location = [game.venue, game.city].filter(Boolean).join(', ');
    if (location) {
      event.location = truncate(location, 500);
    }
    if (game.url) {
      event.url = game.url;
    }
    events.push(event);
    ranges.set(event.external_id, range);
  }
  stats.published = events.length;
  return { events, ranges, stats };
}

/**
 * Split a window into requests of at most `max` events. An event straddling
 * a boundary goes into every sub-window it overlaps, otherwise the core would
 * prune it from the one it is missing from.
 * @param {(event: object) => { start: number, end: number }} rangeOf instants of an event
 * @returns {Array<{ window: { from: Date, to: Date }, events: object[] }>}
 */
export function splitWindow(window, events, rangeOf, max = MAX_EVENTS_PER_REQUEST) {
  if (events.length <= max) {
    return [{ window, events }];
  }
  const middle = new Date((window.from.getTime() + window.to.getTime()) / 2);
  // A window too narrow to split (500 games in a few minutes) cannot happen
  // with the NBA; stop rather than recurse forever.
  if (middle.getTime() - window.from.getTime() < 60_000) {
    return [{ window, events: events.slice(0, max) }];
  }
  const halves = [
    { from: window.from, to: middle },
    { from: middle, to: window.to },
  ];
  return halves.flatMap((half) =>
    splitWindow(
      half,
      events.filter((event) => overlaps(rangeOf(event), half)),
      rangeOf,
      max,
    ),
  );
}
