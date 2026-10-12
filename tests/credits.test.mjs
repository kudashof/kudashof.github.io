import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCredits, normalizeCredits } from '../tmdb.js';

const response = data => ({ ok: true, json: async () => data });

test('movie credits preserve billing order, deduplicate people and distinguish directors from producers', () => {
  const credits = normalizeCredits({
    cast: [
      { id: 2, name: ' Второй ', order: 1, character: 'Role', profile_path: '/face.jpg' },
      { id: 1, name: 'Первый', order: 0 },
      { id: 2, name: 'Дубликат', order: 2 },
      { id: 0, name: 'Невалидный' }, null,
    ],
    crew: [
      { id: 10, name: 'Режиссёр', job: 'Director' },
      { id: 10, name: 'Режиссёр', job: 'Director' },
      { id: 11, name: 'Продюсер', job: 'Producer' },
    ],
  });
  assert.deepEqual(credits.cast.map(person => person.id), [1, 2]);
  assert.equal(credits.cast[1].name, 'Второй');
  assert.equal(credits.cast[1].photo, 'https://image.tmdb.org/t/p/w185/face.jpg');
  assert.equal(credits.cast[0].photo, null);
  assert.deepEqual(credits.directors.map(person => person.id), [10]);
});

test('aggregate TV credits join distinct characters and rank directors by directed episodes, not all crew jobs', () => {
  const credits = normalizeCredits({
    cast: [{ id: 1, name: 'Actor', roles: [{ character: 'One' }, { character: 'One' }, { character: ' Two ' }, null] }],
    crew: [
      { id: 2, name: 'A', jobs: [{ job: 'Director', episode_count: 1 }, { job: 'Producer', episode_count: 100 }] },
      { id: 3, name: 'B', jobs: [{ job: 'Director', episode_count: 4 }] },
      { id: 4, name: 'Creator', jobs: [{ job: 'Creator', episode_count: 200 }] },
      { id: 5, name: 'Malformed', job: 'Director', jobs: {} },
    ],
  });
  assert.equal(credits.cast[0].character, 'One, Two');
  assert.deepEqual(credits.directors.map(person => person.id), [3, 2, 5]);
});

test('missing and unsafe person data does not become a photo URL or an invented person', () => {
  assert.deepEqual(normalizeCredits(null), { cast: [], directors: [] });
  const credits = normalizeCredits({ cast: [
    { id: 1, name: '<img src=x onerror=alert(1)>', profile_path: 'https://evil.test/x.jpg' },
    { id: 2, name: '   ' }, { id: 3, name: 15 },
  ] });
  assert.equal(credits.cast.length, 1);
  assert.equal(credits.cast[0].photo, null);
  assert.equal(credits.cast[0].name, '<img src=x onerror=alert(1)>');
});

test('credits use the movie endpoint or all-season TV endpoint and reject malformed responses', async () => {
  for (const type of ['movie', 'tv']) {
    let requested;
    const result = await fetchCredits(type, 123, { fetchImpl: async url => {
      requested = new URL(url);
      return response({ cast: [], crew: [] });
    } });
    assert.equal(requested.pathname, `/3/${type}/123/${type === 'tv' ? 'aggregate_credits' : 'credits'}`);
    assert.equal(requested.searchParams.get('language'), 'ru-RU');
    assert.deepEqual(result, { cast: [], directors: [] });
  }
  await assert.rejects(fetchCredits('movie', 123, { fetchImpl: async () => response({}) }), /Invalid credits response/);
  await assert.rejects(fetchCredits('movie', 123, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(fetchCredits('person', 1), /Invalid credits address/);
  await assert.rejects(fetchCredits('movie', -1), /Invalid credits address/);
});

test('credits respect cancellation when leaving a detail page', async () => {
  const controller = new AbortController();
  const pending = fetchCredits('movie', 123, { signal: controller.signal, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }) });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
