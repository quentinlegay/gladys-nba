// -----------------------------------------------------------------------------
// Entry point of the Gladys NBA integration.
//
// A calendar integration (manifest `type: "calendar"`): every user who enables
// it in the "My calendars" block gets an "NBA" calendar in Gladys, filled with
// the games of the teams they follow, kept to the tip-off times they chose
// (e.g. "until midnight at the latest, Paris time"). The calendar view, the
// `calendar.event-is-coming` scene trigger and the assistant read it like any
// other calendar.
//
// This file only wires the SDK: the work lives in src/syncer.js.
//   1. instantiate the SDK (connection, auth, reconnection: handled for you);
//   2. register the handlers BEFORE connect();
//   3. on every connection, synchronize everyone and start the sync timer.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { createEspnClient } from './src/espn/client.js';
import { createSyncer } from './src/syncer.js';
import { syncNow } from './src/actions.js';

const gladys = new GladysIntegration();
const syncer = createSyncer({ gladys, espn: createEspnClient() });

let config = normalizeConfig();
let timer = null;

const ESPN_DOWN = {
  en: 'ESPN does not answer: the calendars keep their games, retrying at the next sync.',
  fr: 'ESPN ne répond pas : les calendriers gardent leurs matchs, nouvel essai à la prochaine synchronisation.',
};

/**
 * One synchronization round, the connection status following ESPN's health.
 * Never throws: the timer and the handlers just fire and forget it.
 * @param {string} [onlyUser]
 */
async function syncAndReport(onlyUser) {
  try {
    await syncer.sync(onlyUser);
    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error('Synchronization failed', err);
    await gladys.setConnectionStatus(false, ESPN_DOWN).catch(() => {});
  }
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => syncAndReport(), config.sync_interval * 60_000);
}

// --- A user enabled or disabled the integration, changed their values ---------
// (teams, time zone, tip-off window...) or flipped their calendar's sync or
// shared switch: the core already applied it, resync that user. A disabled
// user is no longer in getCalendarAccounts() (the core destroyed their
// calendar): the round simply has nothing to do for them.
gladys.onCalendarAccountUpdated(async (userSelector) => {
  logger.info(`onCalendarAccountUpdated <- ${userSelector}`);
  await syncAndReport(userSelector);
});

// --- Configuration button -----------------------------------------------------
gladys.onAction('sync_now', () => syncNow(syncer));

// --- The administrator changed the integration settings ------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  startTimer();
});

// --- Connection lifecycle -------------------------------------------------------
// The account-updated events are lost while disconnected: re-read everything
// on every (re)connection.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
  } catch (err) {
    logger.error('Could not read the configuration, defaults used', err);
  }
  startTimer();
  await syncAndReport();
});

gladys.on('disconnected', () => {
  stopTimer();
});

// --- Graceful shutdown ----------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  stopTimer();
});

// --- Startup --------------------------------------------------------------------
logger.info('Starting the Gladys NBA integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
