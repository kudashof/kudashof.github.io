import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchRequest, fetchCatalog, fetchPerson, normalizePersonCredits, personWorks } from '../tmdb.js';
import { DEFAULT_STATE, parseState, stateUrl } from '../state.js';
import { detailFacts, detailMore, formatDate, releaseCertificate } from '../detail-metadata.js';

test('person search uses a distinct endpoint and keeps same-name people separate', async () => {
  const state = { ...DEFAULT_STATE, mode: 'search', searchType: 'person', q: 'Александр', page: 2 };
  assert.equal(buildSearchRequest(state).path, '/search/person');
  const urls = [];
  const result = await fetchCatalog(state, { fetchImpl: async url => {
    urls.push(new URL(url));
    return { ok: true, json: async () => ({ page: 2, total_pages: 3, results: [
      { id: 1, name: 'Александр', profile_path: '/a.jpg', known_for: [] },
      { id: 2, name: 'Александр', profile_path: null, known_for: [] },
      { id: 3, name: 'Александр', adult: true },
    ] }) };
  } });
  assert.deepEqual(result.items.map(item => item.id), [1, 2]);
  assert.equal(urls[0].searchParams.get('page'), '2');
  assert.equal(urls[0].searchParams.get('include_adult'), 'false');
});

test('unified search keeps people beside films and series with navigable IDs', async () => {
  const state = { ...DEFAULT_STATE, mode: 'search', searchType: 'all', q: '  Tom Hanks  ' };
  assert.equal(buildSearchRequest(state).path, '/search/multi');
  let url;
  const result = await fetchCatalog(state, { fetchImpl: async request => {
    url = new URL(request);
    return { ok: true, json: async () => ({ page: 1, total_pages: 1, results: [
      { id: 10, media_type: 'movie', title: 'Фильм' },
      { id: 31, media_type: 'person', name: 'Tom Hanks', known_for_department: 'Acting', known_for: [] },
      { id: 20, media_type: 'tv', name: 'Сериал' },
      { id: 99, media_type: 'person', name: 'Adult', adult: true },
    ] }) };
  } });
  assert.equal(url.searchParams.get('query'), 'Tom Hanks');
  assert.deepEqual(result.items.map(item => [item.type, item.id]), [['movie', 10], ['person', 31], ['tv', 20]]);
  assert.equal(parseState(stateUrl({ ...state, q: 'Tom Hanks', view: 'person', id: 31 }, 'https://example.com/').href).id, 31);
});

test('director credits exclude other jobs, and repeated TV roles share one card', () => {
  const credits = normalizePersonCredits({
    cast: [
      { id: 10, media_type: 'tv', name: 'Сериал', genre_ids: [18], character: 'Герой' },
      { id: 10, media_type: 'tv', name: 'Сериал', genre_ids: [18], character: 'Голос героя' },
      { id: 11, media_type: 'tv', name: 'Ток-шоу', genre_ids: [10767], character: 'Self' },
    ],
    crew: [
      { id: 20, media_type: 'movie', title: 'Фильм', job: 'Producer' },
      { id: 20, media_type: 'movie', title: 'Фильм', job: 'Director' },
      { id: 21, media_type: 'tv', name: 'Сериал', job: 'Creator' },
    ],
  });
  assert.equal(personWorks(credits, { type: 'tv' }).length, 1);
  assert.deepEqual(personWorks(credits, { type: 'tv' })[0].characters, ['Герой', 'Голос героя']);
  assert.equal(personWorks(credits, { type: 'tv', shows: true }).length, 2);
  assert.deepEqual(personWorks(credits, { role: 'directing' }).map(item => item.id), [20]);
});

test('filmography sorts valid dates and voted ratings while keeping unknown values last', () => {
  const credits = normalizePersonCredits({ cast: [
    { id: 1, media_type: 'movie', title: 'Без даты', release_date: '2026-02-31', popularity: 2, vote_average: 9, vote_count: 0 },
    { id: 2, media_type: 'movie', title: 'Ранний', release_date: '2024-01-01', popularity: 3, vote_average: 7, vote_count: 8 },
    { id: 3, media_type: 'movie', title: 'Новый', release_date: '2026-10-20', popularity: 1, vote_average: 8, vote_count: 3 },
  ] });
  assert.deepEqual(personWorks(credits, { sort: 'newest' }).map(item => item.id), [3, 2, 1]);
  assert.deepEqual(personWorks(credits, { sort: 'rating' }).map(item => item.id), [3, 2, 1]);
  assert.equal(personWorks(credits, { sort: 'newest' })[2].date, '');
});

test('person deep link preserves role, tab and sorting and rejects malformed fields', () => {
  const state = { ...DEFAULT_STATE, view: 'person', id: 17419, role: 'directing', personTab: 'tv', personSort: 'newest', shows: true };
  assert.deepEqual(parseState(stateUrl(state, 'https://example.com/').href), state);
  const malformed = parseState('https://example.com/?view=person&id=12&role=writer&ptab=both&psort=random&shows=yes');
  assert.equal(malformed.role, 'acting');
  assert.equal(malformed.personTab, 'movie');
  assert.equal(malformed.personSort, 'popular');
  assert.equal(malformed.shows, false);
});

test('person request uses one detail call with combined credits', async () => {
  let url;
  const result = await fetchPerson(7, { fetchImpl: async request => {
    url = new URL(request);
    return { ok: true, json: async () => ({ id: 7, name: 'Режиссёр', combined_credits: { cast: [], crew: [] } }) };
  } });
  assert.equal(url.pathname, '/3/person/7');
  assert.equal(url.searchParams.get('append_to_response'), 'combined_credits');
  assert.equal(result.person.name, 'Режиссёр');
});

test('metadata distinguishes episode length, country, certification and unknown money', () => {
  const tv = { type: 'tv', first_air_date: '2010-01-20', episode_run_time: [], last_episode_to_air: { runtime: 56 }, origin_country: ['US'] };
  assert.deepEqual(detailFacts(tv).filter(item => item.label.includes('серия') || item.label.includes('Серия')).map(item => item.value), ['56 мин']);
  assert.equal(detailFacts(tv).find(item => item.label === 'Страны происхождения')?.value.length > 0, true);
  assert.equal(formatDate('2026-02-31'), '');
  assert.match(formatDate('2026-09-17T23:59:00Z'), /17 сентября 2026/);
  assert.equal(releaseCertificate({ type: 'movie', release_dates: { results: [{ iso_3166_1: 'NL', release_dates: [{ certification: '16', type: 3 }] }] } }), null);
  const movie = { type: 'movie', title: 'Название', original_title: 'Original', status: 'Released', budget: 0, revenue: 500, original_language: 'en' };
  const more = detailMore(movie);
  assert.equal(more.some(item => item.label === 'Бюджет'), false);
  assert.equal(more.find(item => item.label === 'Сборы')?.value.includes('USD'), true);
});
