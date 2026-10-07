import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBackup, parseBackup, previewImport, commitImport, MAX_BACKUP_BYTES } from '../backup.js';
import { LIBRARY_STORAGE_KEY, readLibrary } from '../library.js';
import { EDITORIAL_COLLECTIONS, editorialCollection, fetchEditorial, validateCollections } from '../editorial.js';
import { fetchMedia } from '../tmdb.js';
import { DEFAULT_STATE, parseState, stateUrl, listState } from '../state.js';
import { buildSharePayload } from '../share.js';

const record = (id = 194, overrides = {}) => ({ id, type: 'movie', title: 'Амели', year: '2001', poster: 'https://image.tmdb.org/t/p/w342/amelie.jpg', posterLarge: '', genreLabels: ['Комедия'], rating: 7.9, votes: 100, states: { later: true, favorites: false, watched: false }, updatedAt: 100, ...overrides });
const backup = items => JSON.stringify(createBackup(items, new Date('2026-10-07T10:00:00Z')));
function storage(items = []) {
  let raw = JSON.stringify({ version: 1, items });
  return { getItem: () => raw, setItem: (key, value) => { assert.equal(key, LIBRARY_STORAGE_KEY); raw = value; } };
}

test('backup round trip exports only normalized My data and all independent states', () => {
  const item = record(194, { states: { later: true, favorites: true, watched: true }, secret: 'never export' });
  const exported = createBackup([item]);
  assert.deepEqual(Object.keys(exported), ['format', 'version', 'exportedAt', 'items']);
  assert.equal(exported.items[0].secret, undefined);
  const parsed = parseBackup(JSON.stringify(exported));
  const target = storage();
  assert.equal(commitImport(previewImport(parsed, 'merge', target), target), true);
  assert.deepEqual(readLibrary(target), exported.items);
});

test('import deduplicates type+ID, unions flags and uses fresher metadata', () => {
  const parsed = parseBackup(backup([record(), record(194, { title: 'Свежее', updatedAt: 200, states: { favorites: true } }), record(194, { type: 'tv' })]));
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.duplicates, 0); // Export already deduplicates.
  const target = storage([record(194, { updatedAt: 50, states: { watched: true } }), record(13)]);
  const plan = previewImport(parsed, 'merge', target);
  assert.equal(plan.conflicts, 1);
  assert.equal(plan.items.length, 3);
  const combined = plan.items.find(item => item.type === 'movie' && item.id === 194);
  assert.equal(combined.title, 'Свежее');
  assert.deepEqual(combined.states, { later: true, favorites: true, watched: true });
  const raw = createBackup([record()]);
  raw.items.push(record());
  assert.equal(parseBackup(JSON.stringify(raw)).duplicates, 1);
});

test('preview never writes; explicit replacement keeps recovery data in memory', () => {
  const target = storage([record(13)]);
  const initial = target.getItem();
  const plan = previewImport(parseBackup(backup([record()])), 'replace', target);
  assert.equal(target.getItem(), initial);
  assert.equal(plan.before[0].id, 13);
  commitImport(plan, target);
  assert.deepEqual(readLibrary(target).map(item => item.id), [194]);
  assert.equal(parseBackup(backup(plan.before)).items[0].id, 13);
});

test('empty imports cannot erase current data, even in replace mode', () => {
  for (const mode of ['merge', 'replace']) {
    const target = storage([record()]);
    const initial = target.getItem();
    assert.equal(commitImport(previewImport(parseBackup(backup([])), mode, target), target), false);
    assert.equal(target.getItem(), initial);
  }
});

test('broken JSON, envelopes, unknown versions, oversized/deep data are rejected', () => {
  const good = createBackup([record()]);
  for (const data of [[], { ...good, format: 'other' }, { ...good, version: 2 }, { ...good, items: {} }, { ...good, exportedAt: 'yesterday' }, { ...good, extra: 'field' }, { ...good, items: Array.from({ length: 501 }, (_, index) => record(index + 1)) }, { ...good, items: [{ nested: { too: { deep: {} } } }] }]) {
    assert.throws(() => parseBackup(JSON.stringify(data)));
  }
  assert.throws(() => parseBackup('{broken'), /JSON/);
  assert.throws(() => parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)), /2 МБ/);
  assert.throws(() => parseBackup('я'.repeat(MAX_BACKUP_BYTES / 2 + 1)), /2 МБ/);
});

test('bad individual records are counted and skipped, unsafe URLs never enter storage', () => {
  const data = createBackup([record()]);
  data.items.push(...[
    record(2, { poster: 'javascript:alert(1)' }), record(3, { poster: 'https://image.tmdb.org.evil.test/t/p/w342/a.jpg' }),
    record(4, { states: { later: 'true' } }), record(5, { type: 'person' }), record(6, { rating: 11 }),
    record(7, { unexpected: 'extra' }), record(8, { title: 'x'.repeat(241) }), record(9, { votes: -1 }), record(10, { id: 1.5 }),
  ]);
  const parsed = parseBackup(JSON.stringify(data));
  assert.equal(parsed.skipped, 9);
  assert.deepEqual(parsed.items.map(item => item.id), [194]);
  const target = storage([record(13)]);
  commitImport(previewImport(parsed, 'merge', target), target);
  assert.deepEqual(readLibrary(target).map(item => item.id), [13, 194]);
});

test('oversized union, concurrent changes, read and write errors leave storage unchanged', () => {
  const target = storage(Array.from({ length: 500 }, (_, index) => record(index + 1)));
  const initial = target.getItem();
  assert.throws(() => previewImport(parseBackup(backup([record(501)])), 'merge', target), /500/);
  assert.equal(target.getItem(), initial);
  const another = storage([record()]);
  const plan = previewImport(parseBackup(backup([record(13)])), 'merge', another);
  another.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 1, items: [record(14)] }));
  assert.throws(() => commitImport(plan, another), /изменился/);
  assert.equal(readLibrary(another)[0].id, 14);
  const failing = { getItem: target.getItem, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => commitImport(previewImport(parseBackup(backup([record()])), 'replace', failing), failing), /не изменены/);
  assert.equal(target.getItem(), initial);
  assert.throws(() => previewImport(parseBackup(backup([])), 'merge', { getItem: () => { throw new Error('denied'); } }), /недоступно/);
});

test('existing legacy storage array can be imported into; corrupted current data is not overwritten', () => {
  let raw = JSON.stringify([record()]);
  const target = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  commitImport(previewImport(parseBackup(backup([record(13)])), 'merge', target), target);
  assert.equal(readLibrary(target).length, 2);
  for (const damaged of ['{broken', '{"version":2,"items":[]}', '{"version":1,"items":[{}]}']) {
    const bad = { getItem: () => damaged, setItem: () => assert.fail('must not overwrite') };
    assert.throws(() => previewImport(parseBackup(backup([record()])), 'replace', bad));
  }
});

test('editorial pilot is validated, original and has exactly eight standalone movie entries', () => {
  assert.equal(validateCollections(EDITORIAL_COLLECTIONS), EDITORIAL_COLLECTIONS);
  const pilot = editorialCollection('one-evening');
  assert.ok(['draft', 'approved'].includes(pilot.status));
  assert.equal(pilot.items.length, 8);
  assert.ok(pilot.items.every(item => item.type === 'movie' && item.reason.length > 50));
  assert.equal(editorialCollection('unknown'), null);
  for (const change of [{ slug: '../x' }, { items: [] }, { items: [...pilot.items.slice(0, 7), pilot.items[0]] }, { status: 'approved', reviewDue: null }]) {
    assert.throws(() => validateCollections([{ ...pilot, ...change }]));
  }
  assert.throws(() => validateCollections([pilot, pilot]), /slug/);
});

test('editorial direct link, detail, Back context and share preserve the stable slug', () => {
  const state = { ...DEFAULT_STATE, mode: 'lists', list: 'one-evening', view: 'movie', id: 194 };
  const url = stateUrl(state, 'https://example.com/');
  assert.deepEqual(parseState(url.href), state);
  assert.equal(parseState(stateUrl(listState(state), url.href).href).list, 'one-evening');
  assert.equal(parseState('https://example.com/?mode=lists&list=one-evening&page=100').page, 1);
  const payload = buildSharePayload(state, url.href, 'Амели');
  assert.equal(new URL(payload.url).searchParams.get('list'), 'one-evening');
});

test('editorial fetch handles partial and empty responses without losing order or original explanations', async () => {
  const collection = editorialCollection('one-evening');
  const result = await fetchEditorial(collection, { getMedia: async (type, id) => {
    if (id === 194) throw new Error('404');
    return { id, type, title: String(id) };
  } });
  assert.equal(result.missing, 1);
  assert.equal(result.items.length, 7);
  assert.equal(result.items[0].id, 773);
  assert.equal(result.items[0].reason, collection.items[1].reason);
  const empty = await fetchEditorial(collection, { getMedia: async () => null });
  assert.equal(empty.items.length, 0);
  assert.equal(empty.missing, 8);
});

test('editorial stale request cancellation rejects and mismatched media is skipped', async () => {
  const controller = new AbortController();
  const pending = fetchEditorial(editorialCollection('one-evening'), { signal: controller.signal, getMedia: async () => {
    controller.abort();
    return { id: 194, type: 'tv' };
  } });
  await assert.rejects(pending, { name: 'AbortError' });
  const wrong = await fetchEditorial(editorialCollection('one-evening'), { getMedia: async () => ({ id: 1, type: 'tv' }) });
  assert.equal(wrong.items.length, 0);
});

test('editorial media fetch uses matching endpoint and normalizes detail metadata', async () => {
  let address;
  const item = await fetchMedia('movie', 194, { fetchImpl: async url => {
    address = new URL(url);
    return { ok: true, json: async () => ({ id: 194, title: 'Амели', genres: [{ id: 35, name: 'Комедия' }] }) };
  } });
  assert.equal(address.pathname, '/3/movie/194');
  assert.deepEqual(item.genreLabels, ['Комедия']);
  await assert.rejects(fetchMedia('person', 1), /Invalid media/);
});

test('all local module dependency versions and portability shell assets are cached for offline use', async () => {
  const shell = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  for (const file of ['fetchscript.js', 'state.js', 'share.js', 'backup.js', 'backup-ui.js', 'editorial.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/from ['"]\.\/(\w[\w.-]*\.js(?:\?[^'"]+)?)['"]/g)) assert.ok(shell.includes(`'./${match[1]}'`), `${file}: ${match[1]} not cached`);
  }
  const entry = await readFile(new URL('../fetchscript.js', import.meta.url), 'utf8');
  assert.match(entry, /node\('p', 'editorial-reason', item\.reason\)/); // Text, never innerHTML.
  assert.match(entry, /setAttribute\('aria-describedby', reason\.id\)/);
  assert.match(entry, /\(item\.genres \|\| \[\]\)\.map/); // Imported items may have no genre IDs or labels.
  const ui = await readFile(new URL('../backup-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /file\.size > MAX_BACKUP_BYTES/);
  assert.match(ui, /plan\.mode === 'replace' && !confirmation\.checked/);
  assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|innerHTML/);
});
