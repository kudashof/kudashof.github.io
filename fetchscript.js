import { fetchCatalog, fetchDetail, fetchGenres, formatRating, imageUrl, READY_LISTS } from './tmdb.js?v=20261001c';
import { catalogKey, DEFAULT_STATE, listState, parseState, stateUrl } from './state.js?v=20261001c';

const root = document.documentElement;
root.dataset.ratingDesign = 'ring';
const els = {
  home: document.querySelector('#home-link'),
  searchMode: document.querySelector('#mode-search'),
  pickMode: document.querySelector('#mode-pick'),
  listsMode: document.querySelector('#mode-lists'),
  navLine: document.querySelector('.nav-line'),
  theme: document.querySelector('#theme-choice'),
  themeIcon: document.querySelector('.theme-icon'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-query'),
  pickControls: document.querySelector('#pick-controls'),
  searchControls: document.querySelector('#search-controls'),
  listsControls: document.querySelector('#lists-controls'),
  filters: document.querySelector('.filters'),
  filterToggle: document.querySelector('#filter-toggle'),
  genrePicker: document.querySelector('.genre-picker'),
  genreToggle: document.querySelector('#genre-toggle'),
  genrePopover: document.querySelector('#genre-popover'),
  genreLabel: document.querySelector('#genre-label'),
  genreSummary: document.querySelector('#genre-summary'),
  genreChips: document.querySelector('#genre-chips'),
  clearGenres: document.querySelector('#clear-genres'),
  genreOptions: document.querySelector('#genre-options'),
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
let draftGenres = [...state.genres];
let activeCatalog = null;
let activeDetail = null;
let catalogSequence = 0;
let detailSequence = 0;
let returnFocus = null;
const catalogCache = new Map();
const genreData = { movie: null, tv: null };
const genreOptionsData = { movie: null, tv: null };
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
  const lists = state.mode === 'lists';
  const list = READY_LISTS[state.list] || READY_LISTS['trending-movie'];
  setPageMeta(
    search && state.q ? `Поиск: ${state.q} — Что посмотреть` : lists ? `${list.title} — Что посмотреть` : 'Что посмотреть — фильмы и сериалы',
    search && state.q ? `Результаты поиска фильмов и сериалов по запросу «${state.q}» на основе данных TMDB.` : lists ? `${list.title} по данным TMDB.` : 'Поиск фильмов и сериалов и идеи для просмотра по данным TMDB.',
  );
  els.searchMode.classList.toggle('active', search);
  els.pickMode.classList.toggle('active', !search && !lists);
  els.listsMode.classList.toggle('active', lists);
  els.searchMode.setAttribute('aria-pressed', String(search));
  els.pickMode.setAttribute('aria-pressed', String(!search && !lists));
  els.listsMode.setAttribute('aria-pressed', String(lists));
  els.navLine.classList.toggle('pick', !search && !lists);
  els.navLine.classList.toggle('search', search);
  els.navLine.classList.toggle('lists', lists);
  els.pickControls.hidden = search || lists;
  els.searchControls.hidden = !search;
  els.listsControls.hidden = !lists;
  els.title.textContent = search ? 'Результаты поиска' : lists ? list.title : 'Идеи для просмотра';
  els.searchInput.value = state.q;
  draftPickType = state.pickType;
  draftSearchType = state.searchType;
  setChoiceButtons('[data-pick-type]', draftPickType, 'pickType');
  setChoiceButtons('[data-search-type]', draftSearchType, 'searchType');
  setChoiceButtons('[data-list]', state.list, 'list');
  els.period.value = state.period;
  els.rating.value = state.rating;
  els.sort.value = state.sort;
  draftGenres = [...state.genres];
  populateGenres();
}

function populateGenres() {
  els.genreOptions.replaceChildren();
  for (const genre of genreOptionsData[draftPickType] || []) {
    const label = node('label', 'genre-option');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = genre.key;
    input.checked = draftGenres.includes(input.value);
    input.addEventListener('change', () => {
      draftGenres = [...els.genreOptions.querySelectorAll('input:checked')].map(item => item.value);
      renderGenreSelection();
    });
    label.append(input, node('span', '', genre.name));
    els.genreOptions.append(label);
  }
  renderGenreSelection();
}

function selectedGenres() {
  const byKey = new Map((genreOptionsData[draftPickType] || []).map(genre => [genre.key, genre]));
  return draftGenres.map(key => byKey.get(key)).filter(Boolean);
}

function setGenrePopover(open) {
  els.genrePopover.hidden = !open;
  els.genrePicker.classList.toggle('is-open', open);
  els.genreToggle.setAttribute('aria-expanded', String(open));
}

function renderGenreSelection() {
  const selected = selectedGenres();
  els.genreLabel.textContent = selected.length === 0 ? 'Жанр:' : 'Жанры:';
  els.genreSummary.textContent = selected.length === 0 ? 'любой' : selected.length === 1 ? '1 выбран' : `${selected.length} выбрано`;
  els.clearGenres.hidden = selected.length === 0;
  els.genreChips.replaceChildren();
  for (const genre of selected) {
    const chip = node('button', 'genre-chip');
    chip.type = 'button';
    chip.setAttribute('aria-label', `Убрать жанр «${genre.name}»`);
    chip.append(node('span', '', genre.name), node('span', 'genre-chip-remove', '×'));
    chip.addEventListener('click', () => {
      draftGenres = draftGenres.filter(key => key !== genre.key);
      populateGenres();
    });
    els.genreChips.append(chip);
  }
  els.genreChips.hidden = selected.length === 0;
}

function genreOptions(genres) {
  const parts = {
    10759: ['Боевик', 'Приключения'],
    10765: ['Научная фантастика', 'Фэнтези'],
    10768: ['Военный', 'Политика'],
  };
  return genres.flatMap(genre => (parts[genre.id] || [genre.name]).map((name, index) => ({
    id: genre.id, key: parts[genre.id] ? `${genre.id}:${index}` : String(genre.id), name,
  })));
}

function ensureGenres(type) {
  if (genreData[type]) return Promise.resolve(genreData[type]);
  if (!genrePromises[type]) {
    genrePromises[type] = fetchGenres(type).then(genres => {
      genreData[type] = genres;
      genreOptionsData[type] = genreOptions(genres);
      if (draftPickType === type) populateGenres();
      return genres;
    }).catch(() => {
      genreData[type] = [];
      return [];
    });
  }
  return genrePromises[type];
}

function orderGenresByPopularity(type, items) {
  if (!genreOptionsData[type]?.length || !items.length) return;
  const popularity = new Map();
  for (const item of items) for (const id of item.genres) popularity.set(id, (popularity.get(id) || 0) + item.popularity);
  genreOptionsData[type] = [...genreOptionsData[type]].sort((left, right) => (popularity.get(right.id) || 0) - (popularity.get(left.id) || 0) || left.name.localeCompare(right.name, 'ru'));
  if (type === draftPickType) populateGenres();
}

function genreNames(item) {
  const list = genreData[item.type] || [];
  return item.genres.map(id => list.find(genre => genre.id === id)?.name).filter(Boolean).slice(0, 2).join(', ');
}

function formatVotes(votes) {
  if (!votes) return 'Оценок пока нет';
  const short = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(votes);
  return short + ' ' + (votes < 1000 ? countWord(votes, ['оценка', 'оценки', 'оценок']) : 'оценок');
}

function countWord(count, forms) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  const last = count % 10;
  return last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
}

function scoreBadge(value, votes, { onPoster = false } = {}) {
  const valid = Number.isFinite(value) && value >= 0 && value <= 10 && Number.isInteger(votes) && votes > 0;
  // Each whole rating has its own hue; fewer than 50 votes remain neutral.
  const tier = !valid || votes < 50 || value < 5.5
    ? 'muted'
    : Math.min(10, Math.floor(Math.round(value * 10) / 10));
  const confidence = votes >= 250 ? 'high' : votes >= 50 ? 'mid' : 'low';
  const toneClass = tier === 'muted' ? 'score-muted' : `score-${tier}`;
  const badge = node('span', `score-badge ${toneClass} score-confidence-${confidence}${onPoster ? ' score-badge--poster' : ''}`);
  badge.style.setProperty('--score-progress', valid ? value * 10 + '%' : '0%');
  badge.append(node('span', 'score-value', valid ? formatRating(value, votes) : '—'));
  if (valid && !onPoster) badge.append(node('small', 'score-scale', '/10'));
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

function makeCard(item, index) {
  const href = stateUrl({ ...listState(state), view: item.type, id: item.id }, location.href);
  const card = node('a', 'card');
  card.href = href.pathname + href.search;
  card.dataset.type = item.type;
  card.dataset.id = String(item.id);
  card.style.setProperty('--i', String(Math.min(index, 8)));
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
  poster.append(scoreBadge(item.rating, item.votes, { onPoster: true }));
  card.append(poster);
  card.append(node('h3', '', item.title));
  const mediaType = item.type === 'movie' ? 'Фильм' : 'Сериал';
  const meta = node('p', 'card-meta');
  meta.append(node('span', 'type-badge', mediaType));
  meta.append(node('span', 'card-year', item.year || 'Год неизвестен'));
  const genres = genreNames(item);
  if (genres) meta.append(node('span', 'card-genres', genres));
  card.append(meta);
  const ratingLabel = item.votes ? `Оценка ${formatRating(item.rating, item.votes)} из 10` : 'Оценок пока нет';
  card.setAttribute('aria-label', `Подробнее: ${item.title}. ${mediaType}, ${item.year || 'год неизвестен'}. ${ratingLabel}`);
  return card;
}

function renderCatalog(result, animate = true) {
  els.grid.classList.toggle('no-motion', !animate);
  els.grid.replaceChildren(...result.items.map(makeCard));
  els.empty.hidden = result.items.length > 0;
  if (!result.items.length) els.emptyTitle.textContent = state.mode === 'search' ? 'Ничего не найдено' : state.mode === 'lists' ? 'В списке пока нет фильмов' : 'Подборка пуста';
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
  const updateLabel = state.mode === 'lists' ? 'Обновляем список' : 'Обновляем подборку';
  els.status.textContent = els.grid.children.length ? `${updateLabel}; пока показаны прежние результаты…` : 'Загружаем результаты…';
  try {
    const genresNeeded = state.mode === 'search'
      ? Promise.all([ensureGenres('movie'), ensureGenres('tv')])
      : state.mode === 'lists'
        ? ensureGenres((READY_LISTS[state.list] || READY_LISTS['trending-movie']).type)
        : ensureGenres(state.pickType);
    const [result] = await Promise.all([fetchCatalog(state, { signal: activeCatalog.signal }), genresNeeded]);
    if (sequence !== catalogSequence) return;
    if (state.mode === 'pick') orderGenresByPopularity(state.pickType, result.items);
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
    if (Number.isInteger(data.number_of_seasons) && data.number_of_seasons > 0) {
      facts.append(node('span', '', data.number_of_seasons + ' ' + countWord(data.number_of_seasons, ['сезон', 'сезона', 'сезонов'])));
    }
    if (Number.isInteger(data.number_of_episodes) && data.number_of_episodes > 0) {
      facts.append(node('span', '', data.number_of_episodes + ' ' + countWord(data.number_of_episodes, ['серия', 'серии', 'серий'])));
    }
    const statuses = { 'Returning Series': 'Продолжается', Ended: 'Завершён', Canceled: 'Отменён', 'In Production': 'В производстве', Planned: 'Планируется', Pilot: 'Пилот' };
    if (statuses[data.status]) facts.append(detailLine('Статус', statuses[data.status]));
  }
  content.append(facts);
  const score = node('div', 'detail-rating');
  score.append(scoreBadge(data.vote_average, data.vote_count));
  const scoreInfo = node('div', 'score-info');
  scoreInfo.append(node('span', 'score-label', 'Оценка пользователей'));
  scoreInfo.append(node('span', 'score-votes', formatVotes(data.vote_count)));
  score.append(scoreInfo);
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
els.listsMode.addEventListener('click', () => {
  if (state.mode === 'lists' && !state.view) return;
  switchRoute({ ...state, mode: 'lists', page: 1 });
});
els.home.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  switchRoute({ ...DEFAULT_STATE });
});
document.querySelectorAll('[data-pick-type]').forEach(button => button.addEventListener('click', () => {
  const pickType = button.dataset.pickType;
  if (pickType === state.pickType) return;
  // A genre ID from the other media type may mean something different here.
  els.grid.replaceChildren();
  els.pages.hidden = true;
  switchRoute({
    ...state, mode: 'pick', pickType, genres: [],
    period: els.period.value, rating: els.rating.value, sort: els.sort.value, page: 1,
  }, { scrollTop: false });
}));
document.querySelectorAll('[data-search-type]').forEach(button => button.addEventListener('click', () => {
  draftSearchType = button.dataset.searchType;
  setChoiceButtons('[data-search-type]', draftSearchType, 'searchType');
  if (state.mode === 'search' && state.q) switchRoute({ ...state, searchType: draftSearchType, page: 1 }, { scrollTop: false });
}));
document.querySelectorAll('[data-list]').forEach(button => button.addEventListener('click', () => {
  const list = button.dataset.list;
  if (!READY_LISTS[list] || (state.mode === 'lists' && list === state.list)) return;
  switchRoute({ ...state, mode: 'lists', list, page: 1 }, { scrollTop: false, scrollCatalog: true });
}));
els.filterToggle.addEventListener('click', () => {
  const open = els.pickControls.classList.toggle('opened');
  els.filterToggle.setAttribute('aria-expanded', String(open));
});
els.genreToggle.addEventListener('click', () => {
  setGenrePopover(els.genrePopover.hidden);
});
els.clearGenres.addEventListener('click', () => {
  draftGenres = [];
  populateGenres();
});
document.addEventListener('click', event => {
  if (!els.genrePopover.hidden && !els.genrePicker.contains(event.target)) setGenrePopover(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !els.genrePopover.hidden) {
    setGenrePopover(false);
    els.genreToggle.focus();
  }
});
els.apply.addEventListener('click', () => {
  setGenrePopover(false);
  switchRoute({
    ...state, mode: 'pick', pickType: draftPickType,
    genres: draftGenres, period: els.period.value, rating: els.rating.value,
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
