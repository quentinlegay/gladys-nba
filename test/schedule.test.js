import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_END,
  DAY_START,
  formatTime,
  isInWindow,
  isValidTimezone,
  localMinutes,
  parseTime,
  startsInWindow,
  timeWindow,
} from '../src/schedule.js';

const at = (hh, mm = 0) => hh * 60 + mm;

test('parseTime reads HH:MM and its usual variants', () => {
  assert.equal(parseTime('00:00'), 0);
  assert.equal(parseTime('23:30'), at(23, 30));
  assert.equal(parseTime('9:05'), at(9, 5));
  assert.equal(parseTime('21h'), at(21));
  assert.equal(parseTime('21h30'), at(21, 30));
  assert.equal(parseTime('7'), at(7));
  assert.equal(parseTime('24:00'), 0, '24:00 is midnight');
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('   '), null);
  assert.equal(parseTime(undefined), null);
  for (const bad of ['25:00', '12:60', '24:30', 'midnight', '12:3', '-1:00']) {
    assert.ok(Number.isNaN(parseTime(bad)), `"${bad}" is unreadable`);
  }
});

test('formatTime writes HH:MM', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(at(6, 5)), '06:05');
  assert.equal(formatTime(DAY_END), '05:59');
});

test('a blank end takes the bound of the 06:00 -> 05:59 game day', () => {
  assert.equal(timeWindow(null, null), null, 'no filter at all');
  assert.deepEqual(timeWindow(null, 0), { from: DAY_START, to: 0 });
  assert.deepEqual(timeWindow(at(20), null), { from: at(20), to: DAY_END });
});

test('"until 00:00" keeps the evening and midnight, drops the night', () => {
  const window = timeWindow(null, parseTime('00:00'));
  assert.ok(isInWindow(at(0), window), '00:00 is included');
  assert.ok(isInWindow(at(21), window));
  assert.ok(isInWindow(at(23, 59), window));
  assert.ok(isInWindow(at(6), window), 'the game day starts at 06:00');
  assert.ok(!isInWindow(at(0, 1), window), '00:01 is too late');
  assert.ok(!isInWindow(at(1), window));
  assert.ok(!isInWindow(at(4, 30), window));
  assert.ok(!isInWindow(at(5, 59), window));
});

test('a window inside the day, and one crossing midnight', () => {
  const evening = timeWindow(at(18), at(23));
  assert.ok(isInWindow(at(18), evening) && isInWindow(at(23), evening));
  assert.ok(!isInWindow(at(17, 59), evening) && !isInWindow(at(23, 1), evening));

  const late = timeWindow(at(20), at(2));
  assert.ok(isInWindow(at(20), late) && isInWindow(at(0), late) && isInWindow(at(2), late));
  assert.ok(!isInWindow(at(2, 1), late) && !isInWindow(at(19, 59), late));
});

test('no window keeps everything', () => {
  for (let minutes = 0; minutes < 24 * 60; minutes += 37) {
    assert.ok(isInWindow(minutes, null));
  }
});

test('local times follow the daylight saving time of the zone', () => {
  // Winter, Paris is UTC+1.
  assert.equal(localMinutes('2026-11-08T23:00:00Z', 'Europe/Paris'), 0);
  // Summer, Paris is UTC+2: the same UTC time is 01:00.
  assert.equal(localMinutes('2027-04-10T23:00:00Z', 'Europe/Paris'), at(1));
  assert.equal(localMinutes('2026-11-08T23:00:00Z', 'America/New_York'), at(18));
  const window = timeWindow(null, 0);
  assert.ok(startsInWindow('2026-11-08T23:00:00Z', window, 'Europe/Paris'));
  assert.ok(!startsInWindow('2027-04-10T23:00:00Z', window, 'Europe/Paris'));
  assert.ok(startsInWindow('2027-04-10T22:00:00Z', window, 'Europe/Paris'));
});

test('isValidTimezone knows the IANA names', () => {
  assert.ok(isValidTimezone('Europe/Paris'));
  assert.ok(isValidTimezone('America/Montreal'));
  assert.ok(!isValidTimezone('Paris'));
  assert.ok(!isValidTimezone(''));
});
