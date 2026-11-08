// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers and defaults the code actually uses: these tests keep both in
// sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DAYS_AHEAD_BOUNDS,
  DEFAULT_ACCOUNT,
  DEFAULT_CONFIG,
  SYNC_INTERVAL_BOUNDS,
} from '../src/config.js';
import { NBA_TEAMS } from '../src/nba/teams.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

const allFields = [
  ...manifest.config_schema,
  ...manifest.account_schema,
  ...(manifest.actions ?? []).flatMap((action) => action.fields ?? []),
];
const fieldOf = (list, key) => manifest[list].find((field) => field.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('a calendar integration requires Gladys >= 5.2.0', () => {
  assert.equal(manifest.type, 'calendar');
  assert.ok(
    isAtLeast(minGladysVersion(), [5, 2, 0]),
    `type "calendar" and account_schema require gladys_version >= 5.2.0, got "${manifest.gladys_version}"`,
  );
});

test('every manifest action has a registered handler', () => {
  for (const action of manifest.actions) {
    assert.ok(
      indexSource.includes(`gladys.onAction('${action.key}'`),
      `manifest action "${action.key}" has no handler in index.js`,
    );
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema.filter((f) => f.type !== 'section')) {
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG misses "${field.key}"`);
    assert.equal(field.default, DEFAULT_CONFIG[field.key], `default of "${field.key}"`);
  }
  const interval = fieldOf('config_schema', 'sync_interval');
  assert.deepEqual({ min: interval.min, max: interval.max }, SYNC_INTERVAL_BOUNDS);
});

test('account_schema defaults stay consistent with DEFAULT_ACCOUNT', () => {
  for (const field of manifest.account_schema.filter((f) => f.type !== 'section')) {
    assert.ok(field.key in DEFAULT_ACCOUNT, `DEFAULT_ACCOUNT misses "${field.key}"`);
    if (field.default !== undefined) {
      assert.deepEqual(field.default, DEFAULT_ACCOUNT[field.key], `default of "${field.key}"`);
    }
  }
  const days = fieldOf('account_schema', 'days_ahead');
  assert.deepEqual({ min: days.min, max: days.max }, DAYS_AHEAD_BOUNDS);
});

test('the teams multi-select offers exactly the 30 NBA teams', () => {
  const teams = fieldOf('account_schema', 'teams');
  assert.equal(teams.type, 'multi_select');
  assert.deepEqual(teams.options.map((o) => o.value).sort(), Object.keys(NBA_TEAMS).sort());
});

test('section fields are purely presentational', () => {
  const sections = allFields.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}" placeholder`);
    for (const language of Object.keys(section.description ?? {})) {
      assert.ok(section.description[language].length <= 1000, `section "${section.key}" text`);
    }
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('every text is bilingual, English and French', () => {
  const texts = [
    manifest.description,
    ...allFields.flatMap((f) => [f.label, f.description, f.placeholder]),
    ...allFields.flatMap((f) => (f.options ?? []).map((o) => o.label)),
    ...allFields.flatMap((f) => (f.links ?? []).map((l) => l.label)),
    ...manifest.actions.flatMap((a) => [a.label, a.description]),
  ].filter(Boolean);
  for (const text of texts) {
    assert.equal(typeof text, 'object', `"${text}" must be a multi-language object`);
    assert.ok(text.en && text.fr, `missing en or fr in ${JSON.stringify(text)}`);
  }
});
