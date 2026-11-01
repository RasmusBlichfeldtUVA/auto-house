/**
 * Flatfox cloud tracker for a separate Google Apps Script project.
 * Configure Script Properties as described in cloud/README.md, then run
 * installFlatfox() once. No advertiser messages are sent by this script.
 */
const FLATFOX = Object.freeze({
  pinsUrl: 'https://flatfox.ch/api/v1/pin/',
  detailsUrl: 'https://flatfox.ch/api/v1/public-listing/',
  headers: ['ID', 'Status', 'Viewing date', 'Link', 'Address', 'Rent CHF',
    'Rooms', 'Furnished', 'Postcode', 'Preferred area', 'Move-in', 'Published',
    'Last seen', 'Notes', 'Alert'],
  statuses: ['New', 'Contacted', 'Rejected', 'Viewing', 'Accepted'],
});

function settings_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const required = ['EMAIL_TO', 'CITY', 'MAX_RENT_CHF', 'MIN_ROOMS',
    'SEARCH_WEST', 'SEARCH_SOUTH', 'SEARCH_EAST', 'SEARCH_NORTH'];
  for (const key of required) {
    if (!String(p[key] || '').trim()) throw new Error('Missing Script Property: ' + key);
  }
  const recipients = p.EMAIL_TO.split(',').map(x => x.trim()).filter(Boolean);
  if (!recipients.length || recipients.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) {
    throw new Error('EMAIL_TO must contain valid comma-separated email addresses');
  }
  const maxRent = Number(p.MAX_RENT_CHF);
  const minRooms = Number(p.MIN_ROOMS);
  const bounds = {
    west: Number(p.SEARCH_WEST), south: Number(p.SEARCH_SOUTH),
    east: Number(p.SEARCH_EAST), north: Number(p.SEARCH_NORTH),
  };
  if (!(maxRent > 0 && minRooms > 0 && Object.values(bounds).every(Number.isFinite)
      && bounds.west < bounds.east && bounds.south < bounds.north)) {
    throw new Error('Invalid rent, room count, or map bounds');
  }
  return {
    recipients: recipients.join(','), city: p.CITY.trim(), maxRent, minRooms,
    bounds, furnishedOnly: String(p.FURNISHED_ONLY || 'false').toLowerCase() === 'true',
    preferredPostcodes: (p.PREFERRED_POSTCODES || '').split(',').map(x => x.trim()).filter(Boolean),
    messageGerman: p.MESSAGE_DE || '', messageEnglish: p.MESSAGE_EN || '',
    spreadsheetId: p.SPREADSHEET_ID || '',
  };
}

function flatfoxJson_(url, params) {
  const query = params ? '?' + Object.keys(params).map(key => {
    const value = params[key];
    return Array.isArray(value)
      ? value.map(item => encodeURIComponent(key) + '=' + encodeURIComponent(item)).join('&')
      : encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }).join('&') : '';
  const response = UrlFetchApp.fetch(url + query, {
    muteHttpExceptions: true, headers: {'Accept': 'application/json'},
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Flatfox HTTP ' + response.getResponseCode() + ' for ' + url);
  }
  return JSON.parse(response.getContentText());
}

function currentListings_(config) {
  const pins = flatfoxJson_(FLATFOX.pinsUrl, {
    ...config.bounds, max_count: 400, max_price: config.maxRent,
    min_rooms: config.minRooms, object_category: 'APARTMENT',
    offer_type: 'RENT', is_swap: 'false',
    ...(config.furnishedOnly ? {is_furnished: 'true'} : {}),
  });
  if (!Array.isArray(pins)) throw new Error('Flatfox search format changed');
  if (pins.length >= 400) throw new Error('Flatfox returned 400 pins; narrow or split the map');
  const ids = [...new Set(pins.filter(pin => pin && /^\d+$/.test(String(pin.pk))
    && pin.is_in_region !== false).map(pin => String(pin.pk)))];
  const details = [];
  for (let start = 0; start < ids.length; start += 80) {
    const batch = flatfoxJson_(FLATFOX.detailsUrl, {
      limit: 0, pk: ids.slice(start, start + 80),
    });
    if (!Array.isArray(batch)) throw new Error('Flatfox listing format changed');
    details.push(...batch);
  }
  if (ids.length && !details.length) throw new Error('Flatfox returned no listing details');
  if (details.length < ids.length) {
    Logger.log('Flatfox omitted some listing details; later runs will retry them');
  }
  return details.filter(item => listingMatches_(item, config));
}

function listingMatches_(item, config) {
  if (!item || item.status !== 'act' || item.offer_type !== 'RENT' ||
      item.object_category !== 'APARTMENT' || item.is_swap === true ||
      (config.furnishedOnly && item.is_furnished !== true)) return false;
  const rent = Number(item.price_display), rooms = Number(item.number_of_rooms);
  if (!Number.isFinite(rent) || rent <= 0 || rent > config.maxRent ||
      !Number.isFinite(rooms) || rooms < config.minRooms) return false;
  const normalize = value => String(value || '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalize(item.city) === normalize(config.city);
}

function listingUrl_(item) {
  const id = String(item.pk);
  const path = String(item.url || '');
  if (!/^\/(?:en|de|fr|it)\/flat\/[^\s]+\/\d+\/$/.test(path) ||
      !path.endsWith('/' + id + '/')) {
    throw new Error('Unexpected Flatfox listing URL for ' + id);
  }
  return 'https://flatfox.ch' + path;
}

function safeCell_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function sheet_(config) {
  const ss = config.spreadsheetId
    ? SpreadsheetApp.openById(config.spreadsheetId)
    : SpreadsheetApp.create('Flatfox apartment tracker');
  if (!config.spreadsheetId) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('New tracker: ' + ss.getUrl());
  }
  let sheet = ss.getSheetByName('Listings');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.setName('Listings');
    else sheet = ss.insertSheet('Listings');
  }
  const first = sheet.getRange(1, 1, 1, FLATFOX.headers.length).getValues()[0];
  if (first.every(x => x === '')) {
    sheet.getRange(1, 1, 1, FLATFOX.headers.length).setValues([FLATFOX.headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, FLATFOX.headers.length).setFontWeight('bold');
  } else if (JSON.stringify(first) !== JSON.stringify(FLATFOX.headers)) {
    throw new Error('Tracker columns changed; refusing to overwrite manual data');
  }
  return {ss, sheet};
}

function rowFor_(item, config, seenAt, alert) {
  const zip = String(item.zipcode || '');
  const address = [String(item.street || '').trim(),
    [zip, String(item.city || '').trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const date = item.published ? new Date(item.published) : null;
  return [String(item.pk), 'New', '', listingUrl_(item), safeCell_(address),
    Number(item.price_display), Number(item.number_of_rooms),
    item.is_furnished ? 'Yes' : 'No', zip,
    config.preferredPostcodes.includes(zip) ? 'Yes' : 'Check area',
    safeCell_(item.moving_date), date && !isNaN(date.getTime()) ? date : '',
    seenAt, '', alert];
}

function sync_(sheet, matches, config, initial) {
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, FLATFOX.headers.length).getValues() : [];
  const byId = new Map();
  rows.forEach((row, i) => {
    const id = String(row[0]).trim();
    if (id && byId.has(id)) throw new Error('Duplicate tracker ID: ' + id);
    if (id) byId.set(id, i);
  });
  const seenAt = new Date();
  const newRows = [];
  for (const item of matches) {
    const id = String(item.pk);
    if (byId.has(id)) {
      rows[byId.get(id)][12] = seenAt;
    } else {
      byId.set(id, rows.length + newRows.length);
      newRows.push(rowFor_(item, config, seenAt, initial ? 'Baseline' : 'Pending'));
    }
  }
  if (rows.length) sheet.getRange(2, 13, rows.length, 1).setValues(rows.map(row => [row[12]]));
  if (newRows.length) {
    const start = last + 1;
    sheet.getRange(start, 1, newRows.length, FLATFOX.headers.length).setValues(newRows);
    sheet.getRange(start, 12, newRows.length, 2).setNumberFormat('yyyy-mm-dd hh:mm');
    const validation = SpreadsheetApp.newDataValidation()
      .requireValueInList(FLATFOX.statuses, true).setAllowInvalid(false).build();
    sheet.getRange(start, 2, newRows.length, 1).setDataValidation(validation);
  }
  Logger.log('Current matches: ' + matches.length + '; new tracker rows: ' + newRows.length);
}

function sendPending_(sheet, config) {
  const last = sheet.getLastRow();
  if (last <= 1) return;
  const rows = sheet.getRange(2, 1, last - 1, FLATFOX.headers.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[14] !== 'Pending') continue;
    const id = String(row[0]);
    const url = String(row[3]);
    if (!/^https:\/\/flatfox\.ch\/(?:en|de|fr|it)\/flat\//.test(url)) {
      throw new Error('Invalid tracker listing URL: ' + id);
    }
    const text = [
      'New Flatfox listing: ' + url,
      'Address: ' + row[4],
      'Rent: CHF ' + row[5] + '/month (verify total)',
      'Rooms: ' + row[6] + '; furnished: ' + row[7],
      'Move-in: ' + (row[10] || 'not specified'),
      'Area: ' + row[9] + ' (verify exact neighborhood)',
      'Check availability, occupancy, lease terms and all costs before applying.',
      config.messageGerman ? 'GERMAN DRAFT\n' + config.messageGerman : '',
      config.messageEnglish ? 'ENGLISH DRAFT\n' + config.messageEnglish : '',
    ].filter(Boolean).join('\n\n');
    MailApp.sendEmail({to: config.recipients,
      subject: '[Flatfox #' + id + '] New apartment candidate', body: text,
      name: 'Flatfox apartment tracker'});
    sheet.getRange(i + 2, 15).setValue(new Date());
  }
}

function installFlatfox() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const config = settings_();
    const props = PropertiesService.getScriptProperties();
    const alreadyInstalled = props.getProperty('INSTALLED') === 'true';
    const tracker = sheet_(config);
    const matches = currentListings_(config);
    sync_(tracker.sheet, matches, config, !alreadyInstalled);
    if (alreadyInstalled) sendPending_(tracker.sheet, config);
    props.setProperty('INSTALLED', 'true');
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'scanFlatfox')) {
      ScriptApp.newTrigger('scanFlatfox').timeBased().everyMinutes(5).create();
    }
    Logger.log('Installed. Tracker: ' + tracker.ss.getUrl());
  } finally {
    lock.releaseLock();
  }
}

function scanFlatfox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    if (PropertiesService.getScriptProperties().getProperty('INSTALLED') !== 'true') {
      throw new Error('Run installFlatfox() first');
    }
    const config = settings_();
    const tracker = sheet_(config);
    const matches = currentListings_(config);
    sync_(tracker.sheet, matches, config, false);
    sendPending_(tracker.sheet, config);
  } catch (error) {
    reportFailure_(error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function reportFailure_(error) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  if (now - Number(props.getProperty('FAILURE_REPORTED_MS') || 0) < 86400000) return;
  try {
    const recipients = settings_().recipients;
    MailApp.sendEmail({to: recipients, subject: '[Flatfox tracker needs attention]',
      body: 'The cloud listing check failed. New-listing coverage is not guaranteed until it is fixed. Check Apps Script Executions. Error: ' + String(error).slice(0, 300),
      name: 'Flatfox apartment tracker'});
    props.setProperty('FAILURE_REPORTED_MS', String(now));
  } catch (notificationError) {
    Logger.log('Could not send failure alert: ' + notificationError);
  }
}

function testCloud() {
  const config = settings_();
  const matches = currentListings_(config);
  Logger.log('Current matching listings: ' + matches.length);
  Logger.log('Sample links: ' + matches.slice(0, 5).map(listingUrl_).join('\n'));
  return matches.length;
}

function testEmail() {
  const config = settings_();
  MailApp.sendEmail({to: config.recipients, subject: '[Test] Flatfox cloud tracker',
    body: 'Cloud email delivery works. This is a setup test; no advertiser was contacted.',
    name: 'Flatfox apartment tracker'});
}
