import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLibrary, readLibrary, toggleLibraryState } from '../library.js';
import { createBackup, parseBackup, previewImport, commitImport } from '../backup.js';
import { createGenreCache } from '../genres.js';

const record = id => ({ id, type: 'movie', title: `Фильм ${id}`, states: { later: true, favorites: false, watched: false } });
function storage(raw) {
  return { raw, writes: 0, getItem() { return this.raw; }, setItem(_key, value) { this.writes++; this.raw = value; } };
}
const parsed = () => parseBackup(JSON.stringify(createBackup([record(42)])));

test('499 → 500 succeeds; 501st item fails without touching the original bytes', () => {
  const target = storage(JSON.stringify({ version: 1, items: Array.from({ length: 499 }, (_, i) => record(i + 1)) }));
  assert.equal(toggleLibraryState(record(500), 'later', { storage: target }).saved, true);
  assert.equal(readLibrary(target).length, 500);
  const before = target.raw;
  const writes = target.writes;
  const result = toggleLibraryState(record(501), 'favorites', { storage: target });
  assert.equal(result.saved, false);
  assert.equal(result.active, false);
  assert.equal(result.reason, 'limit');
  assert.match(result.message, /500/);
  assert.equal(target.raw, before);
  assert.equal(target.writes, writes);
  // At capacity, existing flags can still be changed independently.
  assert.equal(toggleLibraryState(record(1), 'watched', { storage: target }).saved, true);
  assert.equal(readLibrary(target).find(item => item.id === 1).states.later, true);
  assert.equal(toggleLibraryState(record(2), 'later', { storage: target }).saved, true);
  assert.equal(toggleLibraryState(record(501), 'favorites', { storage: target }).saved, true);
  assert.equal(readLibrary(target).length, 500);
});

test('damaged JSON, records, envelopes and unknown versions block all ordinary writes', () => {
  for (const raw of [' {broken\n', '', 'null', '{}', '{"version":2,"items":[]}', '{"version":1,"items":[{}]}', JSON.stringify(Array.from({ length: 501 }, (_, i) => record(i + 1)))]) {
    const target = storage(raw);
    const result = toggleLibraryState(record(42), 'later', { storage: target });
    assert.equal(result.saved, false);
    assert.equal(result.active, false);
    assert.match(result.message, /Восстановить из файла/);
    assert.equal(target.raw, raw);
    assert.equal(target.writes, 0);
  }
  const fresh = storage(null);
  assert.equal(toggleLibraryState(record(42), 'later', { storage: fresh }).saved, true);
  const legacy = storage(JSON.stringify([record(42)]));
  assert.equal(toggleLibraryState(record(42), 'watched', { storage: legacy }).saved, true);
  assert.equal(readLibrary(legacy)[0].states.later, true);
});

test('read failures and unavailable localStorage never reach setItem', () => {
  const target = storage('untouched original');
  target.getItem = () => { throw new Error('denied'); };
  assert.equal(inspectLibrary(target).status, 'unavailable');
  assert.equal(toggleLibraryState(record(42), 'later', { storage: target }).saved, false);
  assert.equal(target.raw, 'untouched original');
  assert.equal(target.writes, 0);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try { assert.equal(toggleLibraryState(record(42), 'later').saved, false); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('write failure preserves bytes and reports the previous flag, not success', () => {
  const target = storage(JSON.stringify([record(42)]));
  const before = target.raw;
  target.setItem = () => { throw new Error('quota'); };
  assert.deepEqual(toggleLibraryState(record(42), 'later', { storage: target }), { saved: false, active: true });
  assert.deepEqual(toggleLibraryState(record(13), 'later', { storage: target }), { saved: false, active: false });
  assert.equal(target.raw, before);
});

test('corruption recovery requires explicit replacement and retains original bytes in preview', () => {
  const target = storage(' {broken\n');
  assert.throws(() => previewImport(parsed(), 'merge', target, { recoverCorrupt: true }), /повреждён/);
  assert.throws(() => previewImport(parsed(), 'replace', target), /повреждён/);
  const plan = previewImport(parsed(), 'replace', target, { recoverCorrupt: true });
  assert.equal(plan.recovering, true);
  assert.equal(plan.rawBefore, target.raw);
  assert.equal(target.writes, 0);
  assert.equal(commitImport(plan, target), true);
  assert.equal(readLibrary(target)[0].id, 42);
  assert.equal(plan.rawBefore, ' {broken\n');
});

test('recovery refuses unreadable, unsupported, changed storage and empty backups', () => {
  const target = storage('{broken');
  const plan = previewImport(parsed(), 'replace', target, { recoverCorrupt: true });
  target.raw = '{changed';
  assert.throws(() => commitImport(plan, target), /изменился/);
  assert.equal(target.raw, '{changed');
  assert.equal(target.writes, 0);
  const emptyPlan = previewImport(parseBackup(JSON.stringify(createBackup([]))), 'replace', target, { recoverCorrupt: true });
  assert.equal(commitImport(emptyPlan, target), false);
  assert.equal(target.raw, '{changed');
  const unknown = storage('{"version":2,"items":[]}');
  assert.throws(() => previewImport(parsed(), 'replace', unknown, { recoverCorrupt: true }), /не распознан/);
  target.getItem = () => { throw new Error('denied'); };
  assert.throws(() => previewImport(parsed(), 'replace', target, { recoverCorrupt: true }), /недоступно/);
  assert.equal(target.writes, 0);
});

test('genres distinguish unloaded, failed, retrying and successfully empty; concurrent loads share a request', async () => {
  let calls = 0;
  const cache = createGenreCache(async () => {
    if (++calls === 1) throw new Error('temporary');
    return [];
  });
  assert.equal(cache.get('movie').status, 'unloaded');
  const first = cache.ensure('movie');
  assert.equal(cache.get('movie').status, 'loading');
  assert.equal(cache.ensure('movie'), first);
  assert.equal(await first, null);
  assert.equal(cache.get('movie').status, 'error');
  assert.equal(cache.get('movie').genres, null);
  assert.deepEqual(await cache.ensure('movie'), []);
  assert.equal(cache.get('movie').status, 'loaded');
  assert.deepEqual(await cache.ensure('movie'), []);
  assert.equal(calls, 2);
});

test('late movie genres do not replace TV data', async () => {
  let finishMovie;
  const cache = createGenreCache(type => type === 'movie' ? new Promise(resolve => { finishMovie = resolve; }) : Promise.resolve([{ id: 10759, name: 'TV' }]));
  const movie = cache.ensure('movie');
  await cache.ensure('tv');
  finishMovie([{ id: 28, name: 'Movie' }]);
  await movie;
  assert.equal(cache.get('tv').genres[0].id, 10759);
  assert.equal(cache.get('movie').genres[0].id, 28);
});
