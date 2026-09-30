import { fetchCatalog, fetchDetail, fetchGenres, formatRating, imageUrl } from './tmdb.js';
import { catalogKey, DEFAULT_STATE, listState, parseState, stateUrl } from './state.js';

const root = document.documentElement;
const els = {
  home: document.querySelector('#home-link'),
  searchMode: document.querySelector('#mode-search'),
  pickMode: document.querySelector('#mode-pick'),
  navLine: document.querySelector('.nav-line'),
  theme: document.querySelector('#theme-choice'),
  themeIcon: document.querySelector('.theme-icon'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-query'),
  pickControls: document.querySelector('#pick-controls'),
  searchControls: document.querySelector('#search-controls'),
  filters: document.querySelector('.filters'),
  filterToggle: document.querySelector('#filter-toggle'),
  genre: document.querySelector('#genre'),
  period: document.querySelector('#period'),
  rating: document.querySelector('#rating'),
  sort: document.querySelector('#sort'),
  apply: document.querySelector('#apply-filters'),
  title: document.querySelector('#catalog-title'),
  status: document.querySelector('#catalog-status'),
  grid: document.querySelector('#movie-grid'),
  empty: document.querySelector('#catalog-empty'),
  emptyTitle: document.querySelector('#empty-title'),
  error: document.querySelector('#catalog-error'),
  errorText: document.querySelector('#catalog-error-text'),
  retry: document.querySelector('#retry-catalog'),
  pages: document.querySelector('#pagination'),
  prev: document.querySelector('#prev-page'),
  next: document.querySelector('#next-page'),
  pageLabel: document.querySelector('#page-label'),
  list: document.querySelector('#list-view'),
  detail: document.querySelector('#detail-view'),
  detailContent: document.querySelector('#detail-content'),
  back: document.querySelector('#back-to-list'),
};

let state = parseState(location.href);
let draftPickType = state.pickType;
let draftSearchType = state.searchType;
let activeCatalog = null;
let activeDetail = null;
let catalogSequence = 0;
let detailSequence = 0;
let returnFocus = null;
const catalogCache = new Map();
const genreData = { movie: null, tv: null };
const genrePromises = { movie: null, tv: null };
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = 'system';
try { themeChoice = localStorage.getItem('movie-theme') || 'system'; } catch (_) {}
if (!['light', 'dark', 'system'].includes(themeChoice)) themeChoice = 'system';

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function icon(name) {
  const element = node('span', 'icon icon-' + name);
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function setPageMeta(title, description) {
  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
}

function applyTheme() {
  const dark = themeChoice === 'dark' || (themeChoice === 'system' && systemTheme.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  els.theme.value = themeChoice;
  els.themeIcon.className = 'icon theme-icon icon-' + (dark ? 'moon' : 'sun');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0c0c0c' : '#f6f6f4';
}

function setChoiceButtons(selector, chosen, attribute) {
  document.querySelectorAll(selector).forEach(button => {
    const active = button.dataset[attribute] === chosen;
    button.classList.toggle('chosen', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderControls() {
  const search = state.mode === 'search';
  setPageMeta(
    search && state.q ? `Поиск: ${state.q} — Что посмотреть` : 'Что посмотреть — фильмы и сериалы',
    search && state.q ? `Результаты поиска фильмов и сериалов по запросу «${state.q}» на основе данных TMDB.` : 'Поиск фильмов и сериалов и идеи для просмотра по данным TMDB.',
  );
  els.searchMode.classList.toggle('active', search);
  els.pickMode.classList.toggle('active', !search);
  els.searchMode.setAttribute('aria-pressed', String(search));
  els.pickMode.setAttribute('aria-pressed', String(!search));
  els.navLine.classList.toggle('pick', !search);
  els.navLine.classList.toggle('search', search);
  els.pickControls.hidden = search;
  els.searchControls.hidden = !search;
  els.title.textContent = search ? 'Результаты поиска' : 'Идеи для просмотра';
  els.searchInput.value = state.q;
  draftPickType = state.pickType;
  draftSearchType = state.searchType;
  setChoiceButtons('[data-pick-type]', draftPickType, 'pickType');
  setChoiceButtons('[data-search-type]', draftSearchType, 'searchType');
  els.period.value = state.period;
  els.rating.value = state.rating;
  els.sort.value = state.sort;
  populateGenres(state.genre);
}

function populateGenres(selected = els.genre.value || state.genre) {
  els.genre.replaceChildren(new Option('Жанр: любой', ''));
  for (const genre of genreData[draftPickType] || []) {
    els.genre.add(new Option(genre.name, String(genre.id)));
  }
  els.genre.value = selected;
  if (els.genre.selectedIndex < 0) els.genre.value = '';
}

function ensureGenres(type) {
  if (genreData[type]) return Promise.resolve(genreData[type]);
  if (!genrePromises[type]) {
    genrePromises[type] = fetchGenres(type).then(genres => {
      genreData[type] = genres;
      if (draftPickType === type) populateGenres(els.genre.value);
      return genres;
    }).catch(() => {
      genreData[type] = [];
      return [];
    });
  }
  return genrePromises[type];
}

function genreNames(item) {
  const list = genreData[item.type] || [];
  return item.genres.map(id => list.find(genre => genre.id === id)?.name).filter(Boolean).slice(0, 2).join(', ');
}

function formatVotes(votes) {
  if (!votes) return 'Оценок пока нет';
  const short = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(votes);
  return short + ' оценок';
}

function makeCard(item, index) {
  const href = stateUrl({ ...listState(state), view: item.type, id: item.id }, location.href);
  const card = node('a', 'card');
  card.href = href.pathname + href.search;
  card.dataset.type = item.type;
  card.dataset.id = String(item.id);
  card.style.setProperty('--i', String(Math.min(index, 8)));
  card.setAttribute('aria-label', 'Подробнее: ' + item.title);
  card.append(node('span', 'number', String(index + 1 + (state.page - 1) * 20).padStart(2, '0')));
  const poster = node('div', 'poster');
  const image = node('img', item.poster ? '' : 'is-placeholder');
  image.src = item.poster || 'img/noposter.jpg';
  image.alt = '';
  image.width = 342;
  image.height = 513;
  image.loading = index < 6 ? 'eager' : 'lazy';
  image.decoding = 'async';
  if (item.posterLarge) image.srcset = item.poster + ' 342w, ' + item.posterLarge + ' 500w';
  image.sizes = '(max-width: 335px) 100vw, (max-width: 760px) 50vw, (max-width: 900px) 25vw, 17vw';
  image.addEventListener('error', () => {
    image.onerror = null;
    image.removeAttribute('srcset');
    image.src = 'img/noposter.jpg';
    image.classList.add('is-placeholder');
  }, { once: true });
  poster.append(image);
  card.append(poster);
  card.append(node('h3', '', item.title));
  const meta = [item.year || 'Год неизвестен', item.type === 'movie' ? 'Фильм' : 'Сериал', genreNames(item)].filter(Boolean).join(' · ');
  card.append(node('p', 'card-meta', meta));
  const rating = node('div', 'rating');
  rating.append(icon('star'));
  rating.append(node('span', '', formatRating(item.rating, item.votes)));
  rating.append(node('small', '', '· ' + formatVotes(item.votes)));
  card.append(rating);
  return card;
}

function renderCatalog(result, animate = true) {
  els.grid.classList.toggle('no-motion', !animate);
  els.grid.replaceChildren(...result.items.map(makeCard));
  els.empty.hidden = result.items.length > 0;
  if (!result.items.length) els.emptyTitle.textContent = state.mode === 'search' ? 'Ничего не найдено' : 'Подборка пуста';
  const totalPages = Math.max(1, result.totalPages);
  els.pages.hidden = totalPages <= 1;
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= totalPages;
  els.pageLabel.textContent = 'Страница ' + state.page + ' из ' + totalPages;
  els.grid.setAttribute('aria-busy', 'false');
  els.grid.classList.remove('updating');
  els.status.textContent = result.items.length ? 'Показано ' + result.items.length + ' результатов' : '';
  els.error.hidden = true;
}

async function loadCatalog({ animate = true, force = false } = {}) {
  const key = catalogKey(state);
  if (!force && catalogCache.has(key)) {
    renderCatalog(catalogCache.get(key), animate);
    return;
  }
  if (state.mode === 'search' && !state.q) {
    els.grid.replaceChildren();
    els.empty.hidden = false;
    els.emptyTitle.textContent = 'Введите название фильма или сериала';
    els.pages.hidden = true;
    els.error.hidden = true;
    els.status.textContent = '';
    return;
  }
  activeCatalog?.abort();
  activeCatalog = new AbortController();
  const sequence = ++catalogSequence;
  els.grid.setAttribute('aria-busy', 'true');
  els.grid.classList.add('updating');
  els.empty.hidden = true;
  els.error.hidden = true;
  els.status.textContent = els.grid.children.length ? 'Обновляем подборку; пока показаны прежние результаты…' : 'Загружаем результаты…';
  try {
    const genresNeeded = state.mode === 'search'
      ? Promise.all([ensureGenres('movie'), ensureGenres('tv')])
      : ensureGenres(state.pickType);
    const [result] = await Promise.all([fetchCatalog(state, { signal: activeCatalog.signal }), genresNeeded]);
    if (sequence !== catalogSequence) return;
    catalogCache.set(key, result);
    renderCatalog(result, animate);
  } catch (error) {
    if (sequence !== catalogSequence || error?.name === 'AbortError') return;
    els.grid.setAttribute('aria-busy', 'false');
    els.grid.classList.remove('updating');
    els.error.hidden = false;
    els.errorText.textContent = 'Не удалось получить данные TMDB. Проверь соединение и попробуй ещё раз.';
    els.status.textContent = els.grid.children.length ? 'Показаны прежние результаты' : '';
    if (!els.grid.children.length) els.pages.hidden = true;
  }
}

function switchRoute(next, { replace = false, scrollTop = true, scrollCatalog = false } = {}) {
  activeCatalog?.abort();
  activeDetail?.abort();
  catalogSequence++;
  detailSequence++;
  state = listState(next);
  const url = stateUrl(state, location.href);
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search);
  root.dataset.route = 'list';
  els.list.hidden = false;
  els.detail.hidden = true;
  renderControls();
  if (scrollTop) window.scrollTo(0, 0);
  else if (scrollCatalog) els.title.scrollIntoView({ block: 'start' });
  loadCatalog();
}

function detailLine(label, value) {
  const text = node('span', '', label + ': ' + value);
  return text;
}

function renderDetail(data) {
  els.detailContent.replaceChildren();
  const title = data.title || data.name || 'Без названия';
  setPageMeta(`${title} — Что посмотреть`, data.overview?.trim().slice(0, 155) || `Сведения о ${data.type === 'tv' ? 'сериале' : 'фильме'} ${title} по данным TMDB.`);
  const layout = node('div', 'detail-layout');
  const poster = node('img', 'detail-poster' + (data.poster_path ? '' : ' is-placeholder'));
  poster.src = imageUrl(data.poster_path, 'w500') || 'img/noposter.jpg';
  poster.alt = '';
  poster.width = 500;
  poster.height = 750;
  poster.addEventListener('error', () => { poster.src = 'img/noposter.jpg'; poster.classList.add('is-placeholder'); }, { once: true });
  layout.append(poster);
  const content = node('div');
  const date = data.type === 'movie' ? data.release_date : data.first_air_date;
  const year = typeof date === 'string' && /^\d{4}/.test(date) ? date.slice(0, 4) : 'Год неизвестен';
  content.append(node('p', 'detail-kicker', (data.type === 'movie' ? 'Фильм' : 'Сериал') + ' · ' + year));
  const heading = node('h1', '', title);
  heading.id = 'detail-title';
  heading.tabIndex = -1;
  content.append(heading);
  const facts = node('div', 'detail-facts');
  const genres = Array.isArray(data.genres) ? data.genres.map(genre => genre.name).filter(Boolean).join(', ') : '';
  if (genres) facts.append(node('span', '', genres));
  if (data.type === 'movie' && data.runtime) facts.append(detailLine('Длительность', data.runtime + ' мин'));
  if (data.type === 'tv') {
    if (Number.isInteger(data.number_of_seasons)) facts.append(detailLine('Сезоны', String(data.number_of_seasons)));
    const statuses = { 'Returning Series': 'Продолжается', Ended: 'Завершён', Canceled: 'Отменён', 'In Production': 'В производстве', Planned: 'Планируется', Pilot: 'Пилот' };
    if (statuses[data.status]) facts.append(detailLine('Статус', statuses[data.status]));
  }
  content.append(facts);
  const score = node('div', 'detail-rating');
  score.append(icon('star'));
  score.append(node('span', '', 'TMDB ' + formatRating(data.vote_average, data.vote_count) + ' · ' + formatVotes(data.vote_count)));
  content.append(score);
  content.append(node('h2', '', data.type === 'tv' ? 'О сериале' : 'О фильме'));
  content.append(node('p', 'detail-overview', data.overview || 'Описание пока недоступно.'));
  const trailerBox = node('div', 'trailer-box');
  trailerBox.append(node('h2', '', 'Трейлер'));
  if (data.trailer) {
    const play = node('button', '', 'Смотреть трейлер');
    play.type = 'button';
    play.addEventListener('click', () => {
      const frame = node('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + data.trailer.key + '?autoplay=1';
      frame.title = 'Трейлер: ' + (data.title || data.name);
      frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      frame.loading = 'lazy';
      play.replaceWith(frame);
    });
    trailerBox.append(play);
  } else {
    trailerBox.append(node('p', '', 'Трейлер пока недоступен.'));
  }
  content.append(trailerBox);
  layout.append(content);
  els.detailContent.append(layout);
  heading.focus({ preventScroll: true });
}

async function showDetail() {
  activeCatalog?.abort();
  catalogSequence++;
  activeDetail?.abort();
  activeDetail = new AbortController();
  const sequence = ++detailSequence;
  root.dataset.route = 'detail';
  els.list.hidden = true;
  els.detail.hidden = false;
  els.back.href = stateUrl(listState(state), location.href).pathname + stateUrl(listState(state), location.href).search;
  const loading = node('p', 'detail-kicker', 'Загружаем сведения…');
  loading.setAttribute('role', 'status');
  els.detailContent.replaceChildren(loading);
  try {
    const data = await fetchDetail(state.view, state.id, { signal: activeDetail.signal });
    if (sequence !== detailSequence) return;
    renderDetail(data);
  } catch (error) {
    if (sequence !== detailSequence || error?.name === 'AbortError') return;
    const box = node('div', 'detail-error');
    box.setAttribute('role', 'alert');
    box.append(node('h1', '', 'Не удалось открыть подробности'));
    box.append(node('p', '', 'Проверь соединение и попробуй ещё раз.'));
    const retry = node('button', 'show', 'Повторить');
    retry.type = 'button';
    retry.addEventListener('click', showDetail);
    box.append(retry);
    els.detailContent.replaceChildren(box);
  }
}

function restoreList(scrollPosition = 0) {
  activeCatalog?.abort();
  catalogSequence++;
  activeDetail?.abort();
  detailSequence++;
  state = listState(parseState(location.href));
  root.dataset.route = 'list';
  els.list.hidden = false;
  els.detail.hidden = true;
  renderControls();
  loadCatalog({ animate: false });
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollPosition);
    if (returnFocus) {
      const card = els.grid.querySelector('[data-type="' + returnFocus.type + '"][data-id="' + returnFocus.id + '"]');
      card?.focus({ preventScroll: true });
      returnFocus = null;
    }
  });
}

els.theme.addEventListener('change', () => {
  themeChoice = els.theme.value;
  try { localStorage.setItem('movie-theme', themeChoice); } catch (_) {}
  applyTheme();
});
systemTheme.addEventListener('change', () => { if (themeChoice === 'system') applyTheme(); });

els.searchForm.addEventListener('submit', event => {
  event.preventDefault();
  const q = els.searchInput.value.trim();
  if (!q) {
    els.searchInput.setCustomValidity('Введите название фильма или сериала');
    els.searchInput.reportValidity();
    els.searchInput.focus();
    return;
  }
  els.searchInput.setCustomValidity('');
  switchRoute({ ...state, mode: 'search', q, searchType: draftSearchType, page: 1 });
});
els.searchInput.addEventListener('input', () => els.searchInput.setCustomValidity(''));
els.searchMode.addEventListener('click', () => {
  if (state.mode === 'search' && !state.view) return;
  switchRoute({ ...state, mode: 'search', q: els.searchInput.value.trim(), page: 1 });
  els.searchInput.focus();
});
els.pickMode.addEventListener('click', () => {
  if (state.mode === 'pick' && !state.view) return;
  switchRoute({ ...state, mode: 'pick', page: 1 });
});
els.home.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  switchRoute({ ...DEFAULT_STATE });
});
document.querySelectorAll('[data-pick-type]').forEach(button => button.addEventListener('click', () => {
  draftPickType = button.dataset.pickType;
  els.genre.value = '';
  setChoiceButtons('[data-pick-type]', draftPickType, 'pickType');
  populateGenres('');
  ensureGenres(draftPickType);
}));
document.querySelectorAll('[data-search-type]').forEach(button => button.addEventListener('click', () => {
  draftSearchType = button.dataset.searchType;
  setChoiceButtons('[data-search-type]', draftSearchType, 'searchType');
  if (state.mode === 'search' && state.q) switchRoute({ ...state, searchType: draftSearchType, page: 1 }, { scrollTop: false });
}));
els.filterToggle.addEventListener('click', () => {
  const open = els.filters.classList.toggle('opened');
  els.filterToggle.setAttribute('aria-expanded', String(open));
});
els.apply.addEventListener('click', () => {
  switchRoute({
    ...state, mode: 'pick', pickType: draftPickType,
    genre: els.genre.value, period: els.period.value, rating: els.rating.value,
    sort: els.sort.value, page: 1,
  }, { scrollTop: false, scrollCatalog: true });
});
els.retry.addEventListener('click', () => loadCatalog({ force: true }));
els.prev.addEventListener('click', () => { if (!els.prev.disabled) switchRoute({ ...state, page: state.page - 1 }, { scrollTop: false, scrollCatalog: true }); });
els.next.addEventListener('click', () => { if (!els.next.disabled) switchRoute({ ...state, page: state.page + 1 }, { scrollTop: false, scrollCatalog: true }); });
els.grid.addEventListener('click', event => {
  const card = event.target.closest('a.card');
  if (!card || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  returnFocus = { type: card.dataset.type, id: card.dataset.id };
  history.replaceState({ scrollY: window.scrollY }, '', location.href);
  history.pushState({ fromList: true }, '', card.href);
  state = parseState(location.href);
  showDetail();
  window.scrollTo(0, 0);
});
els.back.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (history.state?.fromList) history.back();
  else switchRoute(listState(state));
});
window.addEventListener('popstate', event => {
  state = parseState(location.href);
  if (state.view) {
    showDetail();
    window.scrollTo(0, 0);
  } else {
    restoreList(event.state?.scrollY || 0);
  }
});

applyTheme();
renderControls();
if (state.view) showDetail();
else restoreList(history.state?.scrollY || 0);
ensureGenres(state.pickType);
