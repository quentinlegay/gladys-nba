// -----------------------------------------------------------------------------
// Button of the Configuration screen (manifest `actions`):
//
//   - sync_now  read ESPN now, push every enabled user's calendar and say,
//               user by user, how many games were added and how many the
//               tip-off window or the team selection left out.
//
// The resolved message (multi-language object) is shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { describeWindow } from './calendar.js';

const logger = createLogger({ name: 'actions' });

const LANGUAGES = ['en', 'fr'];

const multilingual = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

const WARNINGS = {
  unknown_teams: {
    en: (values) => `unknown team(s) ignored: ${values.join(', ')}`,
    fr: (values) => `équipe(s) inconnue(s) ignorée(s) : ${values.join(', ')}`,
  },
  timezone: {
    en: (values) => `unknown time zone "${values[0]}", Europe/Paris used`,
    fr: (values) => `fuseau horaire « ${values[0]} » inconnu, Europe/Paris utilisé`,
  },
  time: {
    en: (values) => `unreadable time "${values[0]}" ignored (write it HH:MM)`,
    fr: (values) => `heure « ${values[0]} » illisible ignorée (écrivez-la HH:MM)`,
  },
};

const LINES = {
  synced: {
    en: (name, s, window) =>
      `${name}: ${s.published} game(s) in the calendar` +
      (window ? `, ${s.time} left out by the tip-off window (${window})` : '') +
      (s.teams ? `, ${s.teams} of other teams` : ''),
    fr: (name, s, window) =>
      `${name} : ${s.published} match(s) dans le calendrier` +
      (window ? `, ${s.time} écarté(s) par l'horaire (${window})` : '') +
      (s.teams ? `, ${s.teams} d'autres équipes` : ''),
  },
  sync_off: {
    en: (name) => `${name}: the NBA calendar is not synchronized (its "sync" switch is off).`,
    fr: (name) =>
      `${name} : le calendrier NBA n'est pas synchronisé (interrupteur « sync » coupé).`,
  },
  error: {
    en: (name, error) => `${name}: failed (${error}).`,
    fr: (name, error) => `${name} : échec (${error}).`,
  },
};

function describeResult(result, language) {
  const name = result.user.first_name || result.user.selector;
  const window = describeWindow(result.window);
  let line;
  if (result.outcome === 'synced') {
    line = LINES.synced[language](name, result.stats, window);
  } else if (result.outcome === 'sync_off') {
    line = LINES.sync_off[language](name);
  } else {
    line = LINES.error[language](name, result.error);
  }
  const warnings = result.warnings.map((w) => WARNINGS[w.key][language](w.values));
  return [line, ...warnings.map((warning) => `  ⚠ ${warning}`)].join('\n');
}

/**
 * Handler of `sync_now`.
 * @param {ReturnType<import('./syncer.js').createSyncer>} syncer
 */
export async function syncNow(syncer) {
  logger.info('Action sync_now -> synchronizing the calendars now');
  let results;
  try {
    results = await syncer.sync();
  } catch (err) {
    logger.error('sync_now: ESPN read failed', err);
    return {
      en: `ESPN did not answer (${err.message}), try again later. The calendars keep their games.`,
      fr: `ESPN n'a pas répondu (${err.message}), réessayez plus tard. Les calendriers gardent leurs matchs.`,
    };
  }
  if (results.length === 0) {
    return {
      en: 'Nobody enabled the integration yet: open "My calendars" below and enable it to get your NBA calendar.',
      fr: "Personne n'a encore activé l'intégration : ouvrez « Mes calendriers » ci-dessous et activez-la pour obtenir votre calendrier NBA.",
    };
  }
  return multilingual((language) =>
    results.map((result) => describeResult(result, language)).join('\n'),
  );
}
