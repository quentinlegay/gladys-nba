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

import { DAYS_BEHIND } from './config.js';
import { formatTime, startsInWindow } from './schedule.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// An event has no duration (its end is its tip-off): a 2 h 30 block starting
// in the European evening would cross midnight and show on two days, and only
// the tip-off matters (the calendar scene trigger reads the start).
export const GAME_DURATION_MS = 0;

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

/** "🏀 Celtics @ Lakers", or with the score once played and wanted. */
export function eventName(game, { language, showScores }) {
  const w = WORDS[language];
  const scored = showScores && game.completed && game.away.score != null && game.home.score != null;
  const matchup = scored
    ? `${game.away.shortName} ${game.away.score} – ${game.home.score} ${game.home.shortName}`
    : `${game.away.shortName} @ ${game.home.shortName}`;
  const suffix = isPostponed(game) ? ` (${w.postponed})` : '';
  return truncate(`🏀 ${matchup}${suffix}`, 200);
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

function overlaps(event, window) {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  // The core's overlap rule: a zero-duration event at `from` overlaps too.
  return (
    start < window.to.getTime() && (end > window.from.getTime() || start >= window.from.getTime())
  );
}

/**
 * The events of one user's calendar.
 * @param {import('./espn/parse.js').Game[]} games
 * @param {ReturnType<import('./config.js').normalizeAccount>} settings
 * @param {{ language: 'en' | 'fr', eventId: (gameId: string) => string, window: { from: Date, to: Date } }} options
 */
export function buildEvents(games, settings, { language, eventId, window }) {
  const stats = { games: 0, teams: 0, time: 0, canceled: 0, published: 0 };
  const followed = new Set(settings.teams);
  const events = [];
  for (const game of games) {
    const event = {
      external_id: eventId(game.id),
      name: '',
      start: game.start,
      end: new Date(Date.parse(game.start) + GAME_DURATION_MS).toISOString(),
    };
    if (!overlaps(event, window)) {
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
    const textOptions = { language, timezone: settings.timezone, showScores: settings.show_scores };
    event.name = eventName(game, textOptions);
    event.description = eventDescription(game, textOptions);
    const location = [game.venue, game.city].filter(Boolean).join(', ');
    if (location) {
      event.location = truncate(location, 500);
    }
    if (game.url) {
      event.url = game.url;
    }
    events.push(event);
  }
  stats.published = events.length;
  return { events, stats };
}

/**
 * Split a window into requests of at most `max` events. An event straddling
 * a boundary goes into every sub-window it overlaps, otherwise the core would
 * prune it from the one it is missing from.
 * @returns {Array<{ window: { from: Date, to: Date }, events: object[] }>}
 */
export function splitWindow(window, events, max = MAX_EVENTS_PER_REQUEST) {
  if (events.length <= max) {
    return [{ window, events }];
  }
  const middle = new Date((window.from.getTime() + window.to.getTime()) / 2);
  const halves = [
    { from: window.from, to: middle },
    { from: middle, to: window.to },
  ];
  // A window too narrow to split (500 games in a few minutes) cannot happen
  // with the NBA; stop rather than recurse forever.
  if (middle.getTime() - window.from.getTime() < 60_000) {
    return [{ window, events: events.slice(0, max) }];
  }
  return halves.flatMap((half) =>
    splitWindow(
      half,
      events.filter((event) => overlaps(event, half)),
      max,
    ),
  );
}
