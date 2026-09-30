import test from 'node:test';
import assert from 'node:assert/strict';
import { apiGet, buildDiscoverRequest, buildSearchRequest, imageUrl, normalizeMedia, periodBounds, pickTrailer } from '../tmdb.js';
import { catalogKey, DEFAULT_STATE, listState, parseState, stateUrl } from '../state.js';

test('URL state round trips search and detail context', () => {
  const state = { ...DEFAULT_STATE, mode: 'search', q: 'Амели', searchType: 'tv', page: 3, view: 'tv', id: 123 };
  const url = stateUrl(state, 'https://example.com/');
  assert.deepEqual(parseState(url.href), state);
  assert.equal(parseState(stateUrl(listState(state), url.href).href).view, '');
  assert.notEqual(catalogKey(state), catalogKey({ ...state, page: 2 }));
});

test('invalid URL values fall back to safe list defaults', () => {
  const state = parseState('https://example.com/?mode=bad&page=-1&view=person&id=6&genre=abc&rating=10');
  assert.deepEqual(state, DEFAULT_STATE);
});

test('search request targets title search and keeps media type', () => {
  const request = buildSearchRequest({ ...DEFAULT_STATE, q: '  Амели  ', searchType: 'movie' });
  assert.equal(request.path, '/search/movie');
  assert.equal(request.params.query, 'Амели');
  assert.equal(request.fallbackType, 'movie');
});

test('movie and TV discover requests use their distinct date fields', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const movie = buildDiscoverRequest({ ...DEFAULT_STATE, genre: '18', period: '2020s', rating: '7', sort: 'rating' }, now);
  assert.equal(movie.path, '/discover/movie');
  assert.equal(movie.params['primary_release_date.lte'], '2026-09-30');
  assert.equal(movie.params['primary_release_date.gte'], '2020-01-01');
  assert.equal(movie.params.with_genres, '18');
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
  const movie = normalizeMedia({ media_type: 'movie', id: 194, title: 'Амели', release_date: '2001-04-25', poster_path: '/abc.jpg', vote_average: 7.9, vote_count: 20 });
  assert.equal(movie.year, '2001');
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
