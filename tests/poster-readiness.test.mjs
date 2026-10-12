import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_POSTER, installPosterFallback, waitForPosters } from '../poster-readiness.js';

class Poster extends EventTarget {
  constructor({ complete = false, width = 0, src = 'https://image.tmdb.org/t/p/w342/example.jpg' } = {}) {
    super();
    this._src = src;
    this.complete = complete;
    this.naturalWidth = width;
    this.dataset = {};
    this.classList = { add() {} };
    this.decode = async () => {};
  }
  get src() { return this._src; }
  set src(value) { this._src = value; this.complete = false; this.naturalWidth = 0; }
  get currentSrc() { return this._src; }
  getAttribute(name) { return name === 'src' ? this._src : null; }
  removeAttribute() {}
  load() { this.complete = true; this.naturalWidth = 342; this.dispatchEvent(new Event('load')); }
  fail() { this.complete = true; this.naturalWidth = 0; this.dispatchEvent(new Event('error')); }
}

test('каталог не готов, пока последний постер не загружен и не декодирован', async () => {
  const first = new Poster({ complete: true, width: 342 });
  const second = new Poster();
  let decode;
  second.decode = () => new Promise(resolve => { decode = resolve; });
  let ready = false;
  const pending = waitForPosters([first, second]).then(result => { ready = true; return result; });
  await Promise.resolve();
  assert.equal(ready, false);
  second.load();
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(second.dataset.posterReady, undefined);
  decode();
  assert.deepEqual(await pending, { failed: 0, timedOut: false });
  assert.equal(second.dataset.posterReady, 'true');
});

test('ошибка внешнего постера ждёт локальную заглушку и не маскируется как успех', async () => {
  const poster = new Poster();
  installPosterFallback(poster);
  const pending = waitForPosters([poster]);
  poster.fail();
  assert.equal(poster.src, FALLBACK_POSTER);
  poster.load();
  assert.deepEqual(await pending, { failed: 1, timedOut: false });
});

test('complete=true у сломанного кешированного изображения не означает готовность', async () => {
  const poster = new Poster({ complete: true, width: 0 });
  const pending = waitForPosters([poster]);
  assert.equal(poster.src, FALLBACK_POSTER);
  poster.load();
  assert.equal((await pending).failed, 1);
});

test('отсутствующий по данным TMDB постер с готовой заглушкой не считается сетевым сбоем', async () => {
  const poster = new Poster({ complete: true, width: 342, src: FALLBACK_POSTER });
  assert.deepEqual(await waitForPosters([poster]), { failed: 0, timedOut: false });
});

test('зависшие изображения получают заглушки, даже если сама заглушка тоже зависла', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const posters = [new Poster(), new Poster()];
  const pending = waitForPosters(posters, { timeoutMs: 12000 });
  t.mock.timers.tick(11999);
  assert.notEqual(posters[0].src, FALLBACK_POSTER);
  t.mock.timers.tick(1);
  assert.ok(posters.every(poster => poster.src === FALLBACK_POSTER));
  posters[0].load();
  await Promise.resolve();
  t.mock.timers.tick(1000);
  assert.deepEqual(await pending, { failed: 2, timedOut: true });
});

test('ошибка локальной заглушки завершает ожидание без рекурсивных запросов', async () => {
  const poster = new Poster();
  installPosterFallback(poster);
  const pending = waitForPosters([poster]);
  poster.fail();
  poster.fail();
  assert.deepEqual(await pending, { failed: 1, timedOut: false });
});

test('отмена при переходе на другой экран снимает таймер и игнорирует позднее decode', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const poster = new Poster({ complete: true, width: 342 });
  let decode;
  poster.decode = () => new Promise(resolve => { decode = resolve; });
  const pending = waitForPosters([poster], { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  decode();
  t.mock.timers.tick(13000);
  await Promise.resolve();
  assert.equal(poster.dataset.posterFailed, undefined);
});

test('отказ decode старого адреса при ещё устаревшем currentSrc ждёт новую заглушку', async () => {
  const poster = new Poster({ complete: true, width: 342 });
  const previousSource = poster.src;
  let staleSource = true;
  Object.defineProperty(poster, 'currentSrc', { get: () => staleSource ? previousSource : poster.src });
  let oldDecode;
  poster.decode = () => new Promise((_resolve, reject) => { oldDecode = reject; });
  let ready = false;
  const pending = waitForPosters([poster]).then(result => { ready = true; return result; });
  poster.src = FALLBACK_POSTER;
  oldDecode(new Error('Адрес изображения изменён'));
  await Promise.resolve();
  assert.equal(ready, false);
  staleSource = false;
  poster.decode = async () => {};
  poster.load();
  assert.equal((await pending).timedOut, false);
});

test('пустой набор готов сразу, уже отменённый запрос не запускает ожидание', async () => {
  assert.deepEqual(await waitForPosters([]), { failed: 0, timedOut: false });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForPosters([new Poster()], { signal: controller.signal }), { name: 'AbortError' });
});
