// -----------------------------------------------------------------------------
// Read an ESPN scoreboard into the few values the calendar needs.
//
// Everything is read defensively: a missing field gives a neutral value, an
// event without a date or without its two teams is dropped, never an exception.
// -----------------------------------------------------------------------------

import { teamCode } from '../nba/teams.js';

/**
 * @typedef {object} GameTeam
 * @property {string} code         ESPN abbreviation, normalized (LAL, GS...)
 * @property {string} name         "Los Angeles Lakers"
 * @property {string} shortName    "Lakers"
 * @property {number | null} score null before tip-off
 *
 * @typedef {object} Game
 * @property {string} id           ESPN event id
 * @property {string} start        ISO date of the tip-off
 * @property {'pre' | 'in' | 'post'} state
 * @property {boolean} completed
 * @property {string} statusName   ESPN status, e.g. STATUS_FINAL, STATUS_POSTPONED
 * @property {GameTeam} home
 * @property {GameTeam} away
 * @property {string} venue        "Crypto.com Arena"
 * @property {string} city         "Los Angeles"
 * @property {string[]} broadcasts "ESPN", "NBA TV"...
 * @property {string} note         "NBA Cup", "Paris Game", "East Finals - Game 1"...
 * @property {string} url          the ESPN game page, or ''
 */

const STATES = ['pre', 'in', 'post'];

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function readScore(score, state) {
  if (state === 'pre') {
    return null;
  }
  const raw = score && typeof score === 'object' ? (score.value ?? score.displayValue) : score;
  const number = Number.parseInt(raw, 10);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function readTeam(competitor, state) {
  const team = competitor?.team ?? {};
  const abbreviation = text(team.abbreviation);
  return {
    code: teamCode(abbreviation) ?? abbreviation.toUpperCase(),
    name: text(team.displayName || team.name || abbreviation),
    shortName: text(team.shortDisplayName || team.name || team.displayName || abbreviation),
    score: readScore(competitor?.score, state),
  };
}

function readBroadcasts(competition) {
  const names = new Set();
  for (const broadcast of competition?.broadcasts ?? []) {
    for (const name of broadcast?.names ?? []) {
      if (text(name)) names.add(text(name));
    }
  }
  for (const broadcast of competition?.geoBroadcasts ?? []) {
    const name = text(broadcast?.media?.shortName);
    if (name) names.add(name);
  }
  return [...names];
}

// Only ESPN's own pages become the event link: the URL comes from an answer
// of the API, and Gladys shows it as a clickable link.
function readUrl(event) {
  const links = event?.links ?? [];
  const page =
    links.find((link) => Array.isArray(link?.rel) && link.rel.includes('summary')) ?? links[0];
  try {
    const url = new URL(text(page?.href));
    if (url.protocol === 'https:' && /(^|\.)espn\.com$/.test(url.hostname)) {
      return url.href.slice(0, 500);
    }
  } catch {
    // no link, or not a URL
  }
  return '';
}

/**
 * One scoreboard event, or null when it cannot be a calendar entry.
 * @returns {Game | null}
 */
export function parseGame(event) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((c) => c?.homeAway === 'home');
  const away = competitors.find((c) => c?.homeAway === 'away');
  const date = new Date(text(competition?.date || event?.date));
  if (!home || !away || Number.isNaN(date.getTime())) {
    return null;
  }
  const type = (competition.status ?? event.status ?? {}).type ?? {};
  const state = STATES.includes(type.state) ? type.state : 'pre';
  const id = text(event.id || competition.id);
  if (!id) {
    return null;
  }
  return {
    id,
    start: date.toISOString(),
    state,
    completed: state === 'post' && type.completed === true,
    statusName: text(type.name),
    home: readTeam(home, state),
    away: readTeam(away, state),
    venue: text(competition.venue?.fullName),
    city: text(competition.venue?.address?.city),
    broadcasts: readBroadcasts(competition),
    note: text(competition.notes?.[0]?.headline),
    url: readUrl(event),
  };
}

/** Every game of a scoreboard answer, sorted by tip-off. */
export function parseScoreboard(json) {
  return (json?.events ?? [])
    .map(parseGame)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
