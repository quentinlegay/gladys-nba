// -----------------------------------------------------------------------------
// The 30 NBA teams, keyed by the abbreviation ESPN uses.
//
// The keys are stored in the users' account values (the `teams` multi-select):
// never rename one. ESPN writes a few abbreviations its own way (GS, NO, NY,
// SA, UTAH, WSH): the usual NBA spellings (GSW, NOP, NYK...) are accepted as
// aliases, so a team typed by hand or coming from another source still matches.
// -----------------------------------------------------------------------------

export const NBA_TEAMS = {
  ATL: 'Atlanta Hawks',
  BOS: 'Boston Celtics',
  BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls',
  CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',
  DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons',
  GS: 'Golden State Warriors',
  HOU: 'Houston Rockets',
  IND: 'Indiana Pacers',
  LAC: 'LA Clippers',
  LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',
  MIN: 'Minnesota Timberwolves',
  NO: 'New Orleans Pelicans',
  NY: 'New York Knicks',
  OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',
  PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',
  SAC: 'Sacramento Kings',
  SA: 'San Antonio Spurs',
  TOR: 'Toronto Raptors',
  UTAH: 'Utah Jazz',
  WSH: 'Washington Wizards',
};

const ALIASES = {
  BRK: 'BKN',
  BRO: 'BKN',
  NJN: 'BKN',
  CHO: 'CHA',
  GSW: 'GS',
  NOP: 'NO',
  NOR: 'NO',
  NYK: 'NY',
  PHO: 'PHX',
  SAS: 'SA',
  UTA: 'UTAH',
  WAS: 'WSH',
};

/**
 * The ESPN abbreviation of a team, from any usual spelling, or null.
 * @param {unknown} value
 */
export function teamCode(value) {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  if (NBA_TEAMS[raw]) {
    return raw;
  }
  return ALIASES[raw] ?? null;
}

/**
 * The followed teams of an account: the multi-select arrives as an array, a
 * hand-written value as a comma-separated string. Unknown entries are
 * returned apart, so they can be reported instead of silently ignored.
 * @param {unknown} value
 * @returns {{ teams: string[], unknown: string[] }}
 */
export function parseTeams(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[,;\s]+/)
        .filter(Boolean);
  const teams = [];
  const unknown = [];
  for (const entry of entries) {
    const code = teamCode(entry);
    if (code) {
      if (!teams.includes(code)) {
        teams.push(code);
      }
    } else if (String(entry).trim()) {
      unknown.push(String(entry).trim());
    }
  }
  return { teams, unknown };
}
