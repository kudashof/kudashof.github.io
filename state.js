export const DEFAULT_STATE = Object.freeze({
  mode: 'pick', q: '', searchType: 'all', pickType: 'movie',
  genres: [], period: '', rating: '', sort: 'popular', list: 'trending-movie', library: 'later', page: 1,
  view: '', id: 0,
});

const PERIODS = new Set(['', 'last5', '2020s', '2010s', '2000s', '1990s', 'before1990']);
const RATINGS = new Set(['', '6', '7', '8']);
const SORTS = new Set(['popular', 'rating', 'newest']);
const SEARCH_TYPES = new Set(['all', 'movie', 'tv']);
const LISTS = new Set(['trending-movie', 'popular-movie', 'top-rated-movie', 'now-playing-movie', 'upcoming-movie', 'trending-tv', 'popular-tv', 'top-rated-tv']);
const LIBRARY_SECTIONS = new Set(['later', 'favorites', 'watched']);

function parseGenres(params) {
  const values = (params.get('genres') || params.get('genre') || '').split(',');
  return [...new Set(values.filter(value => /^\d{1,6}(?::[a-z0-9-]+)?$/.test(value)))].slice(0, 12);
}

export function parseState(input) {
  const url = new URL(input, 'https://example.invalid/');
  const params = url.searchParams;
  const mode = ['search', 'lists', 'my'].includes(params.get('mode')) ? params.get('mode') : 'pick';
  const page = Number(params.get('page'));
  const id = Number(params.get('id'));
  const view = params.get('view');
  const validDetail = (view === 'movie' || view === 'tv') && Number.isInteger(id) && id > 0;
  return {
    mode,
    q: (params.get('q') || '').trim().slice(0, 200),
    searchType: SEARCH_TYPES.has(params.get('st')) ? params.get('st') : 'all',
    pickType: params.get('pt') === 'tv' ? 'tv' : 'movie',
    genres: parseGenres(params),
    period: PERIODS.has(params.get('period')) ? params.get('period') : '',
    rating: RATINGS.has(params.get('rating')) ? params.get('rating') : '',
    sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'popular',
    list: LISTS.has(params.get('list')) ? params.get('list') : 'trending-movie',
    library: LIBRARY_SECTIONS.has(params.get('my')) ? params.get('my') : 'later',
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 500) : 1,
    view: validDetail ? view : '',
    id: validDetail ? id : 0,
  };
}

export function listState(state) {
  return { ...state, view: '', id: 0 };
}

export function stateUrl(state, currentUrl) {
  const url = new URL(currentUrl);
  url.search = '';
  if (state.mode !== 'pick') url.searchParams.set('mode', state.mode);
  if (state.mode === 'search') {
    if (state.q) url.searchParams.set('q', state.q);
    if (state.searchType !== 'all') url.searchParams.set('st', state.searchType);
  }
  if (state.mode === 'pick') {
    if (state.pickType !== 'movie') url.searchParams.set('pt', state.pickType);
    if (state.genres?.length) url.searchParams.set('genres', state.genres.join(','));
    if (state.period) url.searchParams.set('period', state.period);
    if (state.rating) url.searchParams.set('rating', state.rating);
    if (state.sort !== 'popular') url.searchParams.set('sort', state.sort);
  }
  if (state.mode === 'lists' && state.list !== 'trending-movie') url.searchParams.set('list', state.list);
  if (state.mode === 'my' && state.library !== 'later') url.searchParams.set('my', state.library);
  if (state.page > 1) url.searchParams.set('page', String(state.page));
  if (state.view && state.id) {
    url.searchParams.set('view', state.view);
    url.searchParams.set('id', String(state.id));
  }
  return url;
}

export function catalogKey(state) {
  const { mode, q, searchType, pickType, genres, period, rating, sort, list, library, page } = state;
  return JSON.stringify({ mode, q, searchType, pickType, genres, period, rating, sort, list, library, page });
}
