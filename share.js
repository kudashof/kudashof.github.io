import { parseState, stateUrl } from './state.js?v=20261007package4';

export function buildSharePayload(state, currentUrl, title = '') {
  const normalized = parseState(stateUrl(state, currentUrl).href);
  if (normalized.mode === 'my' && !normalized.view) normalized.page = 1;
  const url = stateUrl(normalized, currentUrl);
  url.hash = '';
  const name = typeof title === 'string' ? title.trim().slice(0, 240) : '';
  if (normalized.view) {
    const mediaType = normalized.view === 'tv' ? 'Сериал' : 'Фильм';
    return {
      title: name ? `${name} — Что посмотреть` : 'Что посмотреть',
      text: name ? `${mediaType} «${name}» в приложении «Что посмотреть».` : 'Карточка в приложении «Что посмотреть».',
      url: url.href,
    };
  }
  if (normalized.mode === 'my') {
    return {
      title: 'Моё — Что посмотреть',
      text: 'Раздел «Моё» в приложении «Что посмотреть». Локальные списки не передаются.',
      url: url.href,
    };
  }
  const label = normalized.mode === 'search'
    ? normalized.q ? `Поиск: ${normalized.q}` : 'Поиск'
    : normalized.mode === 'lists'
      ? name || 'Готовый список'
      : 'Подбор фильмов и сериалов';
  return { title: `${label} — Что посмотреть`, text: `${label} в приложении «Что посмотреть».`, url: url.href };
}

// Called directly from a click handler: no async work before navigator.share().
export async function shareLink(payload, { navigatorApi = globalThis.navigator, secureContext = globalThis.isSecureContext } = {}) {
  if (secureContext && typeof navigatorApi?.share === 'function') {
    try {
      if (typeof navigatorApi.canShare !== 'function' || navigatorApi.canShare(payload)) {
        await navigatorApi.share(payload);
        return 'shared';
      }
    } catch (error) {
      // Cancellation must not copy anything or show an error.
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  if (secureContext) {
    try {
      if (typeof navigatorApi?.clipboard?.writeText === 'function') {
        await navigatorApi.clipboard.writeText(payload.url);
        return 'copied';
      }
    } catch (_) { /* Keep a selectable URL available when the browser denies access. */ }
  }
  return 'manual';
}
