import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apiGet, buildDiscoverRequest, buildListRequest, buildRecommendationsRequest, buildSearchRequest, fetchRecommendations, imageUrl, normalizeMedia, periodBounds, pickTrailer } from '../tmdb.js';
import { catalogKey, DEFAULT_STATE, listState, parseState, stateUrl } from '../state.js';
import { LIBRARY_STORAGE_KEY, libraryItems, libraryState, readLibrary, toggleLibraryState } from '../library.js';

test('URL state round trips search and detail context', () => {
  const state = { ...DEFAULT_STATE, mode: 'search', q: 'Амели', searchType: 'tv', page: 3, view: 'tv', id: 123 };
  const url = stateUrl(state, 'https://example.com/');
  assert.deepEqual(parseState(url.href), state);
  assert.equal(parseState(stateUrl(listState(state), url.href).href).view, '');
  assert.notEqual(catalogKey(state), catalogKey({ ...state, page: 2 }));
});

test('invalid URL values fall back to safe list defaults', () => {
  const state = parseState('https://example.com/?mode=bad&page=-1&view=person&id=6&genres=abc,,12x&rating=10');
  assert.deepEqual(state, DEFAULT_STATE);
});

test('legacy single-genre links remain valid multi-genre state', () => {
  assert.deepEqual(parseState('https://example.com/?genre=18').genres, ['18']);
  assert.deepEqual(parseState('https://example.com/?genres=10759%3A0,10765%3A0').genres, ['10759:0', '10765:0']);
});

test('URL state round trips local library and keeps it when opening a detail page', () => {
  const state = { ...DEFAULT_STATE, mode: 'my', library: 'favorites', view: 'movie', id: 42 };
  const url = stateUrl(state, 'https://example.com/');
  assert.equal(url.search, '?mode=my&my=favorites&view=movie&id=42');
  assert.deepEqual(parseState(url.href), state);
  assert.deepEqual(listState(state), { ...state, view: '', id: 0 });
});

test('local library keeps independent states and removes an item only when all states are off', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const item = { id: 194, type: 'movie', title: 'Амели', year: '2001', poster: 'https://image.tmdb.org/t/p/w342/amelie.jpg', rating: 7.9, votes: 100 };
  assert.equal(toggleLibraryState(item, 'later', { storage, now: 1 }).active, true);
  assert.equal(libraryState(item, 'later', storage), true);
  assert.equal(toggleLibraryState(item, 'favorites', { storage, now: 2 }).active, true);
  assert.equal(libraryItems('later', storage).length, 1);
  assert.equal(libraryItems('favorites', storage).length, 1);
  assert.equal(toggleLibraryState(item, 'later', { storage, now: 3 }).active, false);
  assert.equal(libraryItems('later', storage).length, 0);
  assert.equal(readLibrary(storage).length, 1);
  assert.equal(toggleLibraryState(item, 'favorites', { storage, now: 4 }).active, false);
  assert.equal(readLibrary(storage).length, 0);
  assert.match(values.get(LIBRARY_STORAGE_KEY), /"items":\[\]/);
});

test('PWA manifest is installable and the application references it', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../fetchscript.js', import.meta.url), 'utf8');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.match(index, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(index, /apple-touch-icon/);
  const styleUrl = index.match(/href="(main\.css\?[^\"]+)"/)?.[1];
  const moduleUrl = index.match(/src="(fetchscript\.js\?[^\"]+)"/)?.[1];
  const tmdbUrl = entry.match(/from '\.\/(tmdb\.js\?[^']+)'/)?.[1];
  for (const asset of [styleUrl, moduleUrl, tmdbUrl]) assert.ok(asset && shell.includes(`'./${asset}'`));
});

test('search request targets title search and keeps media type', () => {
  const request = buildSearchRequest({ ...DEFAULT_STATE, q: '  Амели  ', searchType: 'movie' });
  assert.equal(request.path, '/search/movie');
  assert.equal(request.params.query, 'Амели');
  assert.equal(request.fallbackType, 'movie');
});

test('ready lists have stable URLs and use the correct TMDB endpoints', () => {
  const state = { ...DEFAULT_STATE, mode: 'lists', list: 'top-rated-tv', page: 2 };
  assert.deepEqual(parseState(stateUrl(state, 'https://example.com/').href), state);
  assert.equal(buildListRequest(state).path, '/tv/top_rated');
  assert.equal(buildListRequest(state).fallbackType, 'tv');
  assert.equal(buildListRequest({ ...state, list: 'now-playing-movie' }).path, '/movie/now_playing');
});

test('recommendations use the matching movie or TV endpoint and keep only valid cards', async () => {
  assert.equal(buildRecommendationsRequest('movie', 194).path, '/movie/194/recommendations');
  assert.equal(buildRecommendationsRequest('tv', 1396).path, '/tv/1396/recommendations');
  assert.throws(() => buildRecommendationsRequest('person', 1), /Invalid recommendation address/);
  let requestUrl = null;
  const items = await fetchRecommendations('tv', 1396, {
    fetchImpl: async url => {
      requestUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({ results: [
          { id: 1396, name: 'Во все тяжкие' },
          { id: 42, name: 'Лучше звоните Солу', first_air_date: '2015-02-08', poster_path: '/saul.jpg', vote_average: 8.7, vote_count: 500 },
          { id: 43, name: '' },
        ] }),
      };
    },
  });
  assert.equal(requestUrl.pathname, '/3/tv/1396/recommendations');
  assert.equal(requestUrl.searchParams.get('language'), 'ru-RU');
  assert.deepEqual(items.map(item => [item.id, item.type, item.title]), [[42, 'tv', 'Лучше звоните Солу']]);
});

test('recommendation request can be cancelled when another detail page opens', async () => {
  const controller = new AbortController();
  const pending = fetchRecommendations('movie', 194, {
    signal: controller.signal,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('movie and TV discover requests use their distinct date fields and require every selected genre', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const movie = buildDiscoverRequest({ ...DEFAULT_STATE, genres: ['18', '35'], period: '2020s', rating: '7', sort: 'rating' }, now);
  assert.equal(movie.path, '/discover/movie');
  assert.equal(movie.params['primary_release_date.lte'], '2026-09-30');
  assert.equal(movie.params['primary_release_date.gte'], '2020-01-01');
  assert.equal(movie.params.with_genres, '18,35');
  const series = buildDiscoverRequest({ ...DEFAULT_STATE, pickType: 'tv', genres: ['10759:0', '35'] }, now);
  assert.equal(series.params.with_genres, '10759,35');
  assert.equal(movie.params['vote_count.gte'], 50);
  const tv = buildDiscoverRequest({ ...DEFAULT_STATE, pickType: 'tv', sort: 'newest' }, now);
  assert.equal(tv.path, '/discover/tv');
  assert.equal(tv.params.sort_by, 'first_air_date.desc');
  assert.equal(tv.params['first_air_date.lte'], '2026-09-30');
  assert.deepEqual(periodBounds('before1990', now), [null, '1989-12-31']);
});

test('mixed search results include only valid movie and TV records', () => {
  assert.equal(normalizeMedia({ media_type: 'person', id: 1, name: 'Actor' }), null);
  assert.equal(normalizeMedia({ media_type: 'movie', id: 2, title: '' }), null);
  const movie = normalizeMedia({ media_type: 'movie', id: 194, title: 'Амели', release_date: '2001-04-25', poster_path: '/abc.jpg', popularity: 12.5, vote_average: 7.9, vote_count: 20 });
  assert.equal(movie.year, '2001');
  assert.equal(movie.popularity, 12.5);
  assert.match(movie.poster, /^https:\/\/image\.tmdb\.org\//);
  assert.equal(imageUrl('https://evil.test/img'), null);
  assert.equal(imageUrl('/../x'), null);
});

test('trailer selection prefers official YouTube trailer', () => {
  const videos = [
    { site: 'YouTube', key: 'abcdefghijk', type: 'Teaser' },
    { site: 'YouTube', key: '12345678901', type: 'Trailer', official: true },
    { site: 'Other', key: '09876543210', type: 'Trailer', official: true },
  ];
  assert.equal(pickTrailer(videos).key, '12345678901');
  assert.equal(pickTrailer([{ site: 'YouTube', key: 'bad', type: 'Trailer' }]), null);
});

test('TMDB request reports HTTP failures and respects cancellation', async () => {
  await assert.rejects(apiGet('/search/movie', {}, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /TMDB HTTP 503/);
  const controller = new AbortController();
  const pending = apiGet('/search/movie', {}, {
    signal: controller.signal,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
