import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDetail, fetchTrailer, posterSrcset } from '../tmdb.js';

const trailer = { site: 'YouTube', key: '12345678901', type: 'Trailer', official: true };
const response = data => ({ ok: true, json: async () => data });

test('movie and TV details return without making an optional trailer request', async () => {
  for (const type of ['movie', 'tv']) {
    const calls = [];
    const data = await fetchDetail(type, 194, { fetchImpl: async url => {
      calls.push(new URL(url));
      return response({ id: 194, title: 'Example', overview: 'Usable now', videos: { results: [] } });
    } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathname, `/3/${type}/194`);
    assert.equal(data.overview, 'Usable now');
    assert.equal(data.trailer, null);
  }
});

test('a localized trailer is retained without a fallback request', async () => {
  const data = await fetchDetail('movie', 194, { fetchImpl: async () => response({ id: 194, videos: { results: [trailer] } }) });
  assert.equal(data.trailer.key, trailer.key);
});

test('independent trailer fallback uses English and the right movie or TV endpoint', async () => {
  for (const type of ['movie', 'tv']) {
    let requested;
    const result = await fetchTrailer(type, 194, { fetchImpl: async url => {
      requested = new URL(url);
      return response({ results: [trailer] });
    } });
    assert.equal(requested.pathname, `/3/${type}/194/videos`);
    assert.equal(requested.searchParams.get('language'), 'en-US');
    assert.equal(result.key, trailer.key);
  }
});

test('missing or failed fallback leaves already fetched details usable', async () => {
  const data = await fetchDetail('movie', 194, { fetchImpl: async () => response({ id: 194, overview: 'Already visible' }) });
  assert.equal(await fetchTrailer('movie', 194, { fetchImpl: async () => response({ results: [] }) }), null);
  await assert.rejects(fetchTrailer('movie', 194, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  assert.equal(data.overview, 'Already visible');
  assert.equal(data.trailer, null);
});

test('fallback respects cancellation when leaving a detail page', async () => {
  const controller = new AbortController();
  const pending = fetchTrailer('tv', 1396, { signal: controller.signal, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }) });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(fetchTrailer('person', 1), /Invalid trailer address/);
});

test('responsive sources also work with stored legacy posters without changing library data', () => {
  const legacy = 'https://image.tmdb.org/t/p/w500/poster.jpg';
  assert.equal(posterSrcset(legacy), 'https://image.tmdb.org/t/p/w185/poster.jpg 185w, https://image.tmdb.org/t/p/w342/poster.jpg 342w, https://image.tmdb.org/t/p/w500/poster.jpg 500w');
  for (const bad of [null, '', 'img/noposter.jpg', 'https://evil.test/poster.jpg', 'https://image.tmdb.org/t/p/w342/../bad.jpg']) assert.equal(posterSrcset(bad), '');
});
