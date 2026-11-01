// Local mock test for the Apps Script workflow. Run: node cloud/test_cloud.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const props = {
  EMAIL_TO: 'nikita@example.com', CITY: 'Zürich', MAX_RENT_CHF: '2600',
  MIN_ROOMS: '3', FURNISHED_ONLY: 'true', SEARCH_WEST: '8.49',
  SEARCH_SOUTH: '47.34', SEARCH_EAST: '8.61', SEARCH_NORTH: '47.42',
  PREFERRED_POSTCODES: '8004', MESSAGE_DE: 'Grüezi, wir interessieren uns.',
};
const sent = [];
const triggers = [];
const item = (pk, street) => ({
  pk, url: `/en/flat/${pk}-zurich/${pk}/`, status: 'act',
  offer_type: 'RENT', object_category: 'APARTMENT', is_swap: false,
  is_furnished: true, price_display: 2500, number_of_rooms: 3,
  city: 'Zürich', zipcode: '8004', street, published: '2026-11-01T12:00:00Z',
});
let listings = [item(12345678, 'First Street')];
const cells = [];
const sheet = {
  name: 'Sheet1', getLastRow: () => cells.length,
  setName(name) { this.name = name; }, setFrozenRows() {},
  getRange(r, c, nr = 1, nc = 1) {
    return {
      getValues() {
        return Array.from({length: nr}, (_, i) =>
          Array.from({length: nc}, (_, j) => cells[r + i - 1]?.[c + j - 1] ?? ''));
      },
      setValues(values) {
        for (let i = 0; i < nr; i++) {
          cells[r + i - 1] ||= [];
          for (let j = 0; j < nc; j++) cells[r + i - 1][c + j - 1] = values[i][j];
        }
        return this;
      },
      setValue(value) { return this.setValues([[value]]); },
      setNumberFormat() { return this; }, setDataValidation() { return this; },
      setFontWeight() { return this; },
    };
  },
};
const spreadsheet = {
  getId: () => 'test-sheet', getUrl: () => 'https://docs.google.com/spreadsheets/d/test-sheet/edit',
  getSheetByName: name => sheet.name === name ? sheet : null,
  getSheets: () => [sheet], insertSheet: name => { sheet.name = name; return sheet; },
};
const context = vm.createContext({
  console, Date, Set, Map,
  PropertiesService: {getScriptProperties: () => ({
    getProperties: () => ({...props}), getProperty: key => props[key],
    setProperty: (key, value) => { props[key] = value; },
  })},
  UrlFetchApp: {fetch: url => {
    const ids = [...new URL(url).searchParams.getAll('pk')];
    const data = url.includes('/pin/')
      ? listings.map(x => ({pk: x.pk, is_in_region: true}))
      : listings.filter(x => ids.includes(String(x.pk)));
    return {getResponseCode: () => 200, getContentText: () => JSON.stringify(data)};
  }},
  SpreadsheetApp: {
    create: () => spreadsheet, openById: () => spreadsheet,
    newDataValidation: () => ({requireValueInList() {return this;},
      setAllowInvalid() {return this;}, build() {return {};}}),
  },
  ScriptApp: {
    getProjectTriggers: () => triggers,
    newTrigger: name => ({timeBased() {return this;}, everyMinutes(n) {this.interval = n; return this;},
      create() {triggers.push({getHandlerFunction: () => name, interval: this.interval});}}),
  },
  LockService: {getScriptLock: () => ({waitLock() {}, tryLock: () => true, releaseLock() {}})},
  MailApp: {sendEmail: mail => sent.push(mail)},
  Logger: {log() {}},
});
vm.runInContext(fs.readFileSync('cloud/Code.gs', 'utf8') +
  '\nglobalThis.test = {installFlatfox, scanFlatfox, safeCell_, listingMatches_};', context);
const api = context.test;
api.installFlatfox();
assert.equal(props.SPREADSHEET_ID, 'test-sheet');
assert.equal(triggers.length, 1);
assert.equal(triggers[0].interval, 5);
assert.equal(cells.length, 2);
assert.equal(cells[1][14], 'Baseline');
assert.equal(sent.length, 0);
cells[1][1] = 'Contacted';
cells[1][13] = 'Called landlord';
listings.push(item(12345679, '=HYPERLINK("evil")'));
api.scanFlatfox();
assert.equal(cells.length, 3);
assert.equal(cells[1][1], 'Contacted');
assert.equal(cells[1][13], 'Called landlord');
assert.equal(sent.length, 1);
assert.match(sent[0].body, /https:\/\/flatfox\.ch\/en\/flat\//);
assert.ok(cells[2][4].startsWith("'="));
assert.ok(cells[2][14] instanceof Date);
api.scanFlatfox();
assert.equal(sent.length, 1);
assert.equal(api.listingMatches_({...listings[0], price_display: 3000}, {
  maxRent: 2600, minRooms: 3, furnishedOnly: true, city: 'Zürich'}), false);
console.log('Cloud workflow mock test passed');
