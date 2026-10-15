export const POSTER_TIMEOUT_MS = 12000;
export const FALLBACK_POSTER = 'img/noposter.jpg';

export function setPosterFallback(image) {
  image.dataset.posterFailed = 'true';
  delete image.dataset.posterReady;
  image.classList.add('is-placeholder');
  image.removeAttribute('srcset');
  image.loading = 'eager';
  if (image.getAttribute('src') !== FALLBACK_POSTER) image.src = FALLBACK_POSTER;
}

export function installPosterFallback(image) {
  image.addEventListener('error', () => {
    if (image.getAttribute('src') !== FALLBACK_POSTER) setPosterFallback(image);
  });
}

// Ждём реальные элементы <img>, включая декодирование и локальную заглушку.
// Отмена не позволяет готовности старой страницы повлиять на новый экран.
export function waitForPosters(images, { signal, timeoutMs = POSTER_TIMEOUT_MS, fallbackGraceMs = 1000 } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Загрузка отменена', 'AbortError'));
  if (!images.length) return Promise.resolve({ failed: 0, timedOut: false });
  return new Promise((resolve, reject) => {
    let done = false;
    let remaining = images.length;
    let timedOut = false;
    let deadline;
    let grace;
    const records = [];
    const cleanup = () => {
      clearTimeout(deadline);
      clearTimeout(grace);
      signal?.removeEventListener('abort', abort);
      for (const record of records) {
        record.image.removeEventListener('load', record.loaded);
        record.image.removeEventListener('error', record.errored);
      }
    };
    const abort = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new DOMException('Загрузка отменена', 'AbortError'));
    };
    const finish = record => {
      if (done || record.ready) return;
      record.ready = true;
      record.image.dataset.posterReady = 'true';
      if (--remaining) return;
      done = true;
      cleanup();
      resolve({ failed: images.filter(image => image.dataset.posterFailed === 'true').length, timedOut });
    };
    for (const image of images) {
      const record = { image, ready: false };
      record.loaded = async () => {
        if (done || record.ready || !image.complete || !image.naturalWidth) return;
        const source = image.currentSrc || image.src;
        const requestedSrc = image.src;
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (!done && requestedSrc === image.src && source === (image.currentSrc || image.src) && image.naturalWidth) finish(record);
        } catch (_) {
          if (done || requestedSrc !== image.src || source !== (image.currentSrc || image.src)) return;
          if (image.getAttribute('src') === FALLBACK_POSTER) {
            image.dataset.posterFailed = 'true';
            finish(record);
          } else setPosterFallback(image);
        }
      };
      record.errored = () => {
        // Обработчик карточки уже мог сменить адрес на локальную заглушку.
        if (image.getAttribute('src') !== FALLBACK_POSTER) setPosterFallback(image);
        else if (image.complete && !image.naturalWidth) {
          image.dataset.posterFailed = 'true';
          finish(record);
        }
      };
      records.push(record);
      image.addEventListener('load', record.loaded);
      image.addEventListener('error', record.errored);
      image.loading = 'eager';
    }
    signal?.addEventListener('abort', abort, { once: true });
    deadline = setTimeout(() => {
      timedOut = true;
      for (const record of records.filter(record => !record.ready)) setPosterFallback(record.image);
      grace = setTimeout(() => {
        for (const record of records) finish(record);
      }, fallbackGraceMs);
      for (const record of records) record.loaded();
    }, timeoutMs);
    for (const record of records) {
      if (record.image.complete && !record.image.naturalWidth) record.errored();
      else record.loaded();
    }
  });
}
