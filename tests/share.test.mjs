import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, parseState } from '../state.js';
import { buildSharePayload, shareLink } from '../share.js';

const currentUrl = 'https://kudashof.github.io/?theme=dark&unexpected=value#section';
const payload = { title: 'Амели', text: 'Карточка фильма', url: 'https://kudashof.github.io/?view=movie&id=194' };

test('share preserves pick filters and page, removing unrelated URL parameters and fragments', () => {
  const state = { ...DEFAULT_STATE, pickType: 'tv', genres: ['18', '35'], period: '2010s', rating: '7', sort: 'rating', page: 3 };
  const result = buildSharePayload(state, currentUrl);
  assert.deepEqual(parseState(result.url), state);
  const url = new URL(result.url);
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.has('theme'), false);
  assert.equal(url.searchParams.has('unexpected'), false);
  assert.match(result.title, /Подбор/);
});

test('search, ready list and movie/TV links keep their context and title', () => {
  const search = { ...DEFAULT_STATE, mode: 'search', q: 'Амели', searchType: 'movie', page: 2 };
  assert.deepEqual(parseState(buildSharePayload(search, currentUrl).url), search);
  assert.match(buildSharePayload(search, currentUrl).title, /Поиск: Амели/);
  const list = { ...DEFAULT_STATE, mode: 'lists', list: 'top-rated-tv', page: 2 };
  assert.deepEqual(parseState(buildSharePayload(list, currentUrl, 'Лучшие сериалы').url), list);
  assert.match(buildSharePayload(list, currentUrl, 'Лучшие сериалы').title, /Лучшие сериалы/);
  for (const view of ['movie', 'tv']) {
    const detail = { ...search, view, id: 194 };
    const result = buildSharePayload(detail, currentUrl, '  Амели  ');
    assert.deepEqual(parseState(result.url), detail);
    assert.equal(result.title, 'Амели — Что посмотреть');
    assert.match(result.text, view === 'tv' ? /Сериал/ : /Фильм/);
  }
});

test('My shares only selected section, never local records', () => {
  const state = { ...DEFAULT_STATE, mode: 'my', library: 'favorites', page: 3, items: [{ id: 194, title: 'Личная запись' }] };
  const result = buildSharePayload(state, currentUrl);
  assert.equal(result.url, 'https://kudashof.github.io/?mode=my&my=favorites');
  assert.match(result.text, /Локальные списки не передаются/);
  assert.doesNotMatch(JSON.stringify(result), /194|Личная запись|items/);
});

test('native sharing starts synchronously, retains receiver and does not copy after success', async () => {
  let calls = 0;
  const navigatorApi = {
    canShare(data) { assert.equal(this, navigatorApi); assert.equal(data, payload); return true; },
    share(data) { assert.equal(this, navigatorApi); assert.equal(data, payload); calls += 1; return Promise.resolve(); },
    clipboard: { writeText() { assert.fail('successful native sharing must not copy'); } },
  };
  const pending = shareLink(payload, { navigatorApi, secureContext: true });
  assert.equal(calls, 1, 'native sharing must run before awaiting anything');
  assert.equal(await pending, 'shared');
});

test('cancelling native sharing stays silent and does not copy', async () => {
  assert.equal(await shareLink(payload, {
    secureContext: true,
    navigatorApi: {
      share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); },
      clipboard: { writeText() { assert.fail('cancellation must not copy'); } },
    },
  }), 'cancelled');
});

test('unsupported, rejected or unavailable native sharing falls back to copying only the URL', async () => {
  for (const native of [
    {},
    { canShare: () => false, share() { assert.fail('unsupported payload must not be shared'); } },
    { share: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } },
    { canShare: () => { throw new Error('unsupported'); }, share() { assert.fail(); } },
  ]) {
    const copied = [];
    const navigatorApi = { ...native, clipboard: { async writeText(value) { assert.equal(this, navigatorApi.clipboard); copied.push(value); } } };
    assert.equal(await shareLink(payload, { navigatorApi, secureContext: true }), 'copied');
    assert.deepEqual(copied, [payload.url]);
  }
});

test('denied or unavailable clipboard and insecure contexts keep a manual URL available', async () => {
  for (const navigatorApi of [undefined, {}, { clipboard: { writeText: async () => { throw new Error('denied'); } } }]) {
    assert.equal(await shareLink(payload, { navigatorApi, secureContext: true }), 'manual');
  }
  assert.equal(await shareLink(payload, {
    secureContext: false,
    navigatorApi: { share() { assert.fail(); }, clipboard: { writeText() { assert.fail(); } } },
  }), 'manual');
});
