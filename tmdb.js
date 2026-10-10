import { TMDB_API_KEY } from './tmdb-config.js';

const API_ROOT = 'https://api.themoviedb.org/3';
const IMAGE_ROOT = 'https://image.tmdb.org/t/p';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const READY_LISTS = Object.freeze({
  'trending-movie': { title: 'Фильмы в тренде', type: 'movie', path: '/trending/movie/week' },
  'popular-movie': { title: 'Популярные фильмы', type: 'movie', path: '/movie/popular' },
  'top-rated-movie': { title: 'Лучшие фильмы по оценкам', type: 'movie', path: '/movie/top_rated' },
  'now-playing-movie': { title: 'Новые релизы', type: 'movie', path: '/movie/now_playing' },
  'upcoming-movie': { title: 'Ожидаемые фильмы', type: 'movie', path: '/movie/upcoming' },
  'trending-tv': { title: 'Сериалы в тренде', type: 'tv', path: '/trending/tv/week' },
  'popular-tv': { title: 'Популярные сериалы', type: 'tv', path: '/tv/popular' },
  'top-rated-tv': { title: 'Лучшие сериалы по оценкам', type: 'tv', path: '/tv/top_rated' },
});

export function imageUrl(path, size = 'w342') {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9._-]+$/.test(path) || path.includes('..')) return null;
  return `${IMAGE_ROOT}/${size}${path}`;
}

export function posterSrcset(url) {
  const match = /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)(\/[A-Za-z0-9._-]+)$/.exec(url || '');
  if (!match || !imageUrl(match[1])) return '';
  return ['w185', 'w342', 'w500'].map(size => `${imageUrl(match[1], size)} ${size.slice(1)}w`).join(', ');
}

export function normalizeMedia(item, fallbackType) {
  const type = item?.media_type || fallbackType;
  if ((type !== 'movie' && type !== 'tv') || !Number.isInteger(item?.id) || item.id <= 0) return null;
  const title = type === 'movie' ? item.title : item.name;
  if (typeof title !== 'string' || !title.trim()) return null;
  const date = type === 'movie' ? item.release_date : item.first_air_date;
  return {
    id: item.id,
    type,
    title: title.trim(),
    year: typeof date === 'string' && /^\d{4}/.test(date) ? date.slice(0, 4) : '',
    poster: imageUrl(item.poster_path),
    posterLarge: imageUrl(item.poster_path, 'w500'),
    genres: Array.isArray(item.genre_ids) ? item.genre_ids.filter(Number.isInteger) : [],
    popularity: Number.isFinite(item.popularity) ? item.popularity : 0,
    rating: Number.isFinite(item.vote_average) ? item.vote_average : 0,
    votes: Number.isInteger(item.vote_count) ? item.vote_count : 0,
  };
}

export function buildSearchRequest(state) {
  const type = state.searchType === 'movie' || state.searchType === 'tv' ? state.searchType : 'multi';
  return {
    path: `/search/${type}`,
    params: { query: state.q.trim(), page: state.page, language: 'ru-RU', include_adult: false },
    fallbackType: type === 'multi' ? undefined : type,
  };
}

export function periodBounds(period, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (period === 'last5') {
    const start = new Date(Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate()));
    return [start.toISOString().slice(0, 10), today];
  }
  if (period === 'before1990') return [null, '1989-12-31'];
  const match = /^(19\d0|20\d0)s$/.exec(period || '');
  if (match) {
    const year = Number(match[1]);
    const decadeEnd = `${year + 9}-12-31`;
    return [`${year}-01-01`, decadeEnd > today ? today : decadeEnd];
  }
  return [null, today];
}

export function buildDiscoverRequest(state, now = new Date()) {
  const type = state.pickType === 'tv' ? 'tv' : 'movie';
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const [after, before] = periodBounds(state.period, now);
  const sorts = {
    popular: 'popularity.desc',
    rating: 'vote_average.desc',
    newest: `${dateField}.desc`,
  };
  const params = {
    page: state.page,
    language: 'ru-RU',
    include_adult: false,
    sort_by: sorts[state.sort] || sorts.popular,
    [`${dateField}.lte`]: before,
  };
  if (type === 'tv') params.include_null_first_air_dates = false;
  if (after) params[`${dateField}.gte`] = after;
  const genreIds = [...new Set((state.genres || []).map(genre => String(genre).split(':')[0]).filter(genre => /^\d{1,6}$/.test(genre)))];
  if (genreIds.length) params.with_genres = genreIds.join(',');
  if (state.rating) params['vote_average.gte'] = state.rating;
  if (state.sort === 'rating') params['vote_count.gte'] = 50;
  return { path: `/discover/${type}`, params, fallbackType: type };
}

export function buildListRequest(state) {
  const list = READY_LISTS[state.list] || READY_LISTS['trending-movie'];
  return {
    path: list.path,
    params: { page: state.page, language: 'ru-RU' },
    fallbackType: list.type,
  };
}

export function buildRecommendationsRequest(type, id) {
  if (!['movie', 'tv'].includes(type) || !Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid recommendation address');
  }
  return {
    path: `/${type}/${id}/recommendations`,
    params: { language: 'ru-RU' },
    fallbackType: type,
  };
}

export function buildApiUrl(path, params = {}) {
  const url = new URL(`${API_ROOT}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }
  return url;
}

export async function apiGet(path, params = {}, { signal, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetchImpl(buildApiUrl(path, params), { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function fetchCatalog(state, options = {}) {
  const request = state.mode === 'search'
    ? buildSearchRequest(state)
    : state.mode === 'lists'
      ? buildListRequest(state)
      : buildDiscoverRequest(state);
  const data = await apiGet(request.path, request.params, options);
  const items = Array.isArray(data.results) ? data.results.map(item => normalizeMedia(item, request.fallbackType)).filter(Boolean) : [];
  return {
    items,
    page: Number.isInteger(data.page) ? data.page : state.page,
    totalPages: Number.isInteger(data.total_pages) ? Math.min(data.total_pages, 500) : 1,
    totalResults: Number.isInteger(data.total_results) ? data.total_results : items.length,
  };
}

export async function fetchGenres(type, options = {}) {
  const data = await apiGet(`/genre/${type}/list`, { language: 'ru-RU' }, options);
  return Array.isArray(data.genres) ? data.genres.filter(g => Number.isInteger(g.id) && typeof g.name === 'string') : [];
}

export async function fetchMedia(type, id, options = {}) {
  if (!['movie', 'tv'].includes(type) || !Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid media address');
  const data = await apiGet(`/${type}/${id}`, { language: 'ru-RU' }, options);
  const item = normalizeMedia(data, type);
  if (!item || item.id !== id) throw new Error('Invalid media response');
  return { ...item, genreLabels: Array.isArray(data.genres) ? data.genres.map(genre => genre.name).filter(name => typeof name === 'string') : [] };
}

export async function fetchRecommendations(type, id, options = {}) {
  const request = buildRecommendationsRequest(type, id);
  const data = await apiGet(request.path, request.params, options);
  return Array.isArray(data.results)
    ? data.results.map(item => normalizeMedia(item, request.fallbackType)).filter(item => item && item.id !== id)
    : [];
}

export function pickTrailer(videos) {
  if (!Array.isArray(videos)) return null;
  const youtube = videos.filter(v => v?.site === 'YouTube' && /^[A-Za-z0-9_-]{11}$/.test(v.key || ''));
  return youtube.find(v => v.type === 'Trailer' && v.official) || youtube.find(v => v.type === 'Trailer') || youtube.find(v => v.type === 'Teaser') || null;
}

export async function fetchDetail(type, id, options = {}) {
  if (!['movie', 'tv'].includes(type) || !Number.isInteger(id) || id <= 0) throw new Error('Invalid detail address');
  const data = await apiGet(`/${type}/${id}`, { language: 'ru-RU', append_to_response: 'videos' }, options);
  return { ...data, type, trailer: pickTrailer(data.videos?.results) };
}

// Optional fallback is independent of the detail request and its first render.
export async function fetchTrailer(type, id, options = {}) {
  if (!['movie', 'tv'].includes(type) || !Number.isInteger(id) || id <= 0) throw new Error('Invalid trailer address');
  const data = await apiGet(`/${type}/${id}/videos`, { language: 'en-US' }, options);
  return pickTrailer(data.results);
}

export function formatRating(value, votes) {
  if (!votes) return 'Нет оценки';
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0);
}

export function safeDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) ? value : '';
}
