import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseGame, parseScoreboard } from '../src/espn/parse.js';
import { createEspnClient, EspnError, espnDate } from '../src/espn/client.js';
import { parseTeams, teamCode } from '../src/nba/teams.js';

const scoreboard = JSON.parse(
  await readFile(new URL('./fixtures/nba-scoreboard.json', import.meta.url), 'utf8'),
);

test('parseScoreboard reads every valid game, sorted, and drops the broken ones', () => {
  const games = parseScoreboard(scoreboard);
  assert.equal(games.length, 8);
  const starts = games.map((game) => Date.parse(game.start));
  assert.deepEqual(
    starts,
    [...starts].sort((a, b) => a - b),
  );
  assert.ok(!games.some((game) => ['998', '999'].includes(game.id)));
});

test('a scheduled game: teams, venue, broadcasts, note and ESPN link', () => {
  const game = parseScoreboard(scoreboard).find((g) => g.id === '401800003');
  assert.equal(game.start, '2026-11-08T20:00:00.000Z');
  assert.equal(game.state, 'pre');
  assert.equal(game.completed, false);
  assert.deepEqual(game.away, {
    code: 'SA',
    name: 'San Antonio Spurs',
    shortName: 'Spurs',
    score: null,
  });
  assert.equal(game.home.code, 'MIA');
  assert.equal(game.venue, 'Kaseya Center');
  assert.equal(game.city, 'Miami');
  assert.deepEqual(game.broadcasts, ['NBA TV', 'ESPN']);
  assert.equal(game.note, 'NBA Cup');
  assert.equal(game.url, 'https://www.espn.com/nba/game/_/gameId/401800003');
});

test('a finished game carries its scores', () => {
  const game = parseScoreboard(scoreboard).find((g) => g.id === '401800005');
  assert.equal(game.completed, true);
  assert.equal(game.away.score, 108);
  assert.equal(game.home.score, 112);
});

test('a link outside espn.com is not kept', () => {
  const event = structuredClone(scoreboard.events[1]);
  event.links = [{ rel: ['summary'], href: 'https://evil.example.com/x' }];
  assert.equal(parseGame(event).url, '');
  event.links = [{ rel: ['summary'], href: 'http://www.espn.com/nba/game' }];
  assert.equal(parseGame(event).url, '', 'https only');
});

test('team codes accept the usual NBA spellings', () => {
  assert.equal(teamCode('lal'), 'LAL');
  assert.equal(teamCode('GSW'), 'GS');
  assert.equal(teamCode('NYK'), 'NY');
  assert.equal(teamCode('UTA'), 'UTAH');
  assert.equal(teamCode('XYZ'), null);
  assert.deepEqual(parseTeams(['LAL', 'GSW', 'GS', 'XYZ']), {
    teams: ['LAL', 'GS'],
    unknown: ['XYZ'],
  });
  assert.deepEqual(parseTeams('bos, nyk;mia'), { teams: ['BOS', 'NY', 'MIA'], unknown: [] });
  assert.deepEqual(parseTeams(undefined), { teams: [], unknown: [] });
});

test('the client asks ESPN for a range of days and reports failures', async () => {
  const urls = [];
  const client = createEspnClient({
    fetch: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => scoreboard };
    },
  });
  const json = await client.scoreboard(Date.parse('2026-11-06T12:00:00Z'), '2026-11-30T00:00:00Z');
  assert.equal(json, scoreboard);
  assert.match(urls[0], /basketball\/nba\/scoreboard\?dates=20261106-20261130&limit=1000$/);
  assert.equal(espnDate('2026-01-02T23:59:00Z'), '20260102');

  const down = createEspnClient({ fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(
    down.scoreboard(0, 0),
    (err) => err instanceof EspnError && err.status === 503,
  );
  const offline = createEspnClient({
    fetch: async () => {
      throw new Error('ENOTFOUND');
    },
  });
  await assert.rejects(offline.scoreboard(0, 0), /ESPN unreachable: ENOTFOUND/);
});
