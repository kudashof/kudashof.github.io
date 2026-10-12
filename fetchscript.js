import { fetchCatalog, fetchCredits, fetchDetail, fetchGenres, fetchMedia, fetchPerson, fetchRecommendations, fetchTrailer, formatRating, imageUrl, personWorks, posterSrcset, READY_LISTS } from './tmdb.js?v=20261012people4';
import { catalogKey, DEFAULT_STATE, listState, parseState, stateUrl } from './state.js?v=20261012people4';
import { detailFacts, detailMore } from './detail-metadata.js?v=20261012people4';
import { LIBRARY_SECTIONS, libraryItems, libraryState, toggleLibraryState } from './library.js?v=20261007perf2';
import { buildSharePayload, shareLink } from './share.js?v=20261007perf2';
import { EDITORIAL_COLLECTIONS, editorialCollection, fetchEditorial } from './editorial.js?v=20261007perf2';
import { setLoadingStatus, startLoadingNotice } from './spinner.js?v=20261012spinner3';
import { installPosterFallback, waitForPosters } from './poster-readiness.js?v=20261012spinner3';

const root = document.documentElement;
root.dataset.ratingDesign = 'ring';
const els = {
  home: document.querySelector('#home-link'),
  searchMode: document.querySelector('#mode-search'),
  pickMode: document.querySelector('#mode-pick'),
  listsMode: document.querySelector('#mode-lists'),
  myMode: document.querySelector('#mode-my'),
  navLine: document.querySelector('.nav-line'),
  theme: document.querySelector('#theme-choice'),
  themeIcon: document.querySelector('.theme-icon'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-query'),
  searchLabel: document.querySelector('#search-label'),
  suggestions: document.querySelector('#search-suggestions'),
  searchAnnouncement: document.querySelector('#search-announcement'),
  pickControls: document.querySelector('#pick-controls'),
  searchControls: document.querySelector('#search-controls'),
  listsControls: document.querySelector('#lists-controls'),
  myControls: document.querySelector('#my-controls'),
  backup: document.querySelector('#library-backup'),
  editorialIntro: document.querySelector('#editorial-intro'),
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
  catalogShare: document.querySelector('#catalog-share'),
  status: document.querySelector('#catalog-status'),
  notice: document.querySelector('#catalog-notice'),
  grid: document.querySelector('#movie-grid'),
  empty: document.querySelector('#catalog-empty'),
  emptyTitle: document.querySelector('#empty-title'),
  emptyCopy: document.querySelector('#empty-copy'),
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
  personView: document.querySelector('#person-view'),
  personContent: document.querySelector('#person-content'),
  personBack: document.querySelector('#back-from-person'),
  back: document.querySelector('#back-to-list'),
  networkStatus: document.querySelector('#network-status'),
  installButton: document.querySelector('#install-app'),
  installHint: document.querySelector('#install-hint'),
  installStatus: document.querySelector('#install-status'),
};

let state = parseState(location.href);
let draftPickType = state.pickType;
let draftSearchType = state.searchType;
let draftGenres = [...state.genres];
let activeCatalog = null;
let activeDetail = null;
let activeRecommendations = null;
let activePerson = null;
let personSequence = 0;
let searchTimer = null;
let searchComposing = false;
let suggestionItems = [];
let activeSuggestion = -1;
let personShown = { movie: 12, tv: 12 };
let personScroll = { movie: null, tv: null };
let catalogSequence = 0;
let detailSequence = 0;
let recommendationsSequence = 0;
let returnFocus = null;
const catalogCache = new Map();
let backupModule = null;
let backupUpdater = null;
const genreData = { movie: null, tv: null };
const genreOptionsData = { movie: null, tv: null };
const genrePromises = { movie: null, tv: null };
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = 'system';
let installPrompt = null;
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

function makeShareControls({ detailTitle = '', catalog = false } = {}) {
  const controls = node('div', 'share-controls');
  const row = node('div', 'share-action-row');
  const button = node('button', 'share-button');
  button.type = 'button';
  button.setAttribute('aria-label', catalog ? 'Поделиться ссылкой на текущий каталог' : 'Поделиться карточкой');
  button.title = button.getAttribute('aria-label');
  button.append(icon('share'));
  const status = node('p', 'share-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const fallback = node('div', 'share-fallback');
  fallback.hidden = true;
  const label = node('label', '', 'Ссылка для копирования');
  const input = node('input', 'share-url');
  input.type = 'text';
  input.readOnly = true;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('click', () => input.select());
  input.addEventListener('focus', () => input.select());
  label.append(input);
  fallback.append(label);
  row.append(button, status);
  controls.append(row);
  if (catalog && state.mode === 'my') {
    controls.append(node('p', 'share-note', 'Ссылка откроет раздел «Моё», но сохранённые списки не передаст.'));
  }
  controls.append(fallback);
  button.addEventListener('click', async () => {
    const payload = buildSharePayload(state, location.href, detailTitle || (catalog ? els.title.textContent : ''));
    status.textContent = '';
    fallback.hidden = true;
    button.disabled = true;
    try {
      const outcome = await shareLink(payload);
      if (!controls.isConnected) return;
      if (outcome === 'copied') status.textContent = 'Ссылка скопирована.';
      else if (outcome === 'manual') {
        status.textContent = 'Скопируй ссылку из поля ниже.';
        input.value = payload.url;
        fallback.hidden = false;
        input.focus();
        input.select();
      }
    } finally {
      button.disabled = false;
    }
  });
  return controls;
}

function renderControls() {
  const search = state.mode === 'search';
  const lists = state.mode === 'lists';
  const mine = state.mode === 'my';
  const collection = lists && editorialCollection(state.list);
  const list = collection || READY_LISTS[state.list] || READY_LISTS['trending-movie'];
  setPageMeta(
    search && state.q ? `Поиск: ${state.q} — Что посмотреть` : lists ? `${list.title} — Что посмотреть` : mine ? `${LIBRARY_SECTIONS[state.library].label} — Что посмотреть` : 'Что посмотреть — фильмы и сериалы',
    search && state.q ? `Результаты поиска фильмов и сериалов по запросу «${state.q}» на основе данных TMDB.` : collection ? collection.promise : lists ? `${list.title} по данным TMDB.` : mine ? `${LIBRARY_SECTIONS[state.library].label}. Данные хранятся только в этом браузере.` : 'Поиск фильмов и сериалов и идеи для просмотра по данным TMDB.',
  );
  els.searchMode.classList.toggle('active', search);
  els.pickMode.classList.toggle('active', !search && !lists && !mine);
  els.listsMode.classList.toggle('active', lists);
  els.myMode.classList.toggle('active', mine);
  els.searchMode.setAttribute('aria-pressed', String(search));
  els.pickMode.setAttribute('aria-pressed', String(!search && !lists && !mine));
  els.listsMode.setAttribute('aria-pressed', String(lists));
  els.myMode.setAttribute('aria-pressed', String(mine));
  els.navLine.classList.toggle('pick', !search && !lists && !mine);
  els.navLine.classList.toggle('search', search);
  els.navLine.classList.toggle('lists', lists);
  els.navLine.classList.toggle('my', mine);
  els.pickControls.hidden = search || lists || mine;
  els.searchControls.hidden = !search;
  els.listsControls.hidden = !lists;
  els.myControls.hidden = !mine;
  els.backup.hidden = !mine;
  if (mine) updateBackup();
  els.editorialIntro.hidden = !collection;
  els.editorialIntro.replaceChildren();
  if (collection) {
    els.editorialIntro.append(node('p', 'editorial-promise', collection.promise));
    els.editorialIntro.append(node('p', 'editorial-meta', `${collection.status === 'draft' ? 'Черновик · ждёт утверждения содержания. ' : 'Редакционная подборка. '}${collection.owner}. Обновлено: ${collection.updated}.${collection.reviewDue ? ` Следующая проверка: ${collection.reviewDue}.` : ''} Метаданные и оценки — TMDB.`));
  }
  setChoiceButtons('[data-library]', state.library, 'library');
  els.title.textContent = search ? (state.searchType === 'person' ? 'Найденные люди' : 'Результаты поиска') : lists ? list.title : mine ? LIBRARY_SECTIONS[state.library].label : 'Идеи для просмотра';
  document.querySelector('.section-heading>span').textContent = search && state.searchType === 'person' ? 'Люди TMDB' : 'Оценки TMDB';
  document.querySelector('.hero').setAttribute('aria-label', state.searchType === 'person' && search ? 'Поиск людей кино' : 'Поиск фильма или сериала');
  els.searchLabel.textContent = state.searchType === 'person' ? 'Имя актёра или режиссёра' : 'Название фильма или сериала';
  els.searchInput.placeholder = els.searchLabel.textContent;
  document.querySelector('.search-hint').textContent = state.searchType === 'person' ? 'Поиск людей по данным TMDB' : 'Поиск по названию без фильтров подбора';
  els.catalogShare.replaceChildren(makeShareControls({ catalog: true }));
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
      // Refresh the visible catalog, even if its original request is no longer active.
      const visible = !state.view && catalogCache.get(catalogKey(state));
      if (visible) {
        if (state.mode === 'pick' && state.pickType === type) orderGenresByPopularity(type, visible.items);
        updateCardGenres(visible.items);
      }
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
  if (Array.isArray(item.genreLabels) && item.genreLabels.length) return item.genreLabels.slice(0, 2).join(', ');
  const list = genreData[item.type] || [];
  return (item.genres || []).map(id => list.find(genre => genre.id === id)?.name).filter(Boolean).slice(0, 2).join(', ');
}

function updateCardGenres(items) {
  const byId = new Map(items.map(item => [`${item.type}:${item.id}`, item]));
  for (const card of els.grid.children) {
    const item = byId.get(`${card.dataset.type}:${card.dataset.id}`);
    const label = card.querySelector('.card-genres');
    if (item && label) label.textContent = genreNames(item);
  }
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

function firstRowCount() {
  return matchMedia('(max-width:335px)').matches ? 1 : matchMedia('(max-width:760px)').matches ? 2 : matchMedia('(max-width:900px)').matches ? 4 : 6;
}

function firstScreenPosters(cards, grid) {
  const columns = firstRowCount();
  const top = grid.getBoundingClientRect().top;
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 18;
  const cardWidth = (grid.clientWidth - (columns - 1) * gap) / columns;
  const rowHeight = cardWidth * 257 / 179 + 110;
  const firstVisibleRow = Math.max(0, Math.floor(-top / rowHeight));
  const lastVisibleRow = Math.max(1, Math.ceil((innerHeight - top) / rowHeight));
  return cards.filter((_card, index) => index < columns || (index >= firstVisibleRow * columns && index < lastVisibleRow * columns))
    .map(card => card.querySelector('.poster img'));
}

function makeCard(item, index, { numbered = true, recommendation = false } = {}) {
  if (item.type === 'person') return makePersonCard(item, index);
  const href = stateUrl({ ...listState(state), view: item.type, id: item.id }, location.href);
  const card = node('a', recommendation ? 'card recommendation-card' : 'card');
  card.href = href.pathname + href.search;
  card.dataset.type = item.type;
  card.dataset.id = String(item.id);
  card.style.setProperty('--i', String(Math.min(index, 8)));
  if (numbered) card.append(node('span', 'number', String(index + 1 + (state.page - 1) * 20).padStart(2, '0')));
  const poster = node('div', 'poster');
  const image = node('img', item.poster ? '' : 'is-placeholder');
  image.src = item.poster || 'img/noposter.jpg';
  image.alt = '';
  image.width = 342;
  image.height = 513;
  const firstRow = firstRowCount();
  image.loading = !recommendation && index < firstRow ? 'eager' : 'lazy';
  image.fetchPriority = !recommendation && index < firstRow ? 'high' : 'low';
  image.decoding = 'async';
  image.srcset = posterSrcset(item.poster);
  image.sizes = '(max-width:335px) calc(100vw - 36px), (max-width:760px) calc(50vw - 25px), (max-width:900px) calc(25vw - 27.5px), (max-width:1480px) calc(16.667vw - 24.333px), 223px';
  installPosterFallback(image);
  poster.append(image);
  poster.append(scoreBadge(item.rating, item.votes, { onPoster: true }));
  card.append(poster);
  card.append(node('h3', '', item.title));
  const mediaType = item.type === 'movie' ? 'Фильм' : 'Сериал';
  const meta = node('p', 'card-meta');
  meta.append(node('span', 'type-badge', mediaType));
  meta.append(node('span', 'card-year', item.year || 'Год неизвестен'));
  const genres = genreNames(item);
  meta.append(node('span', 'card-genres', genres));
  card.append(meta);
  if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date > new Date().toISOString().slice(0, 10)) card.append(node('span', 'upcoming-label', 'Скоро'));
  if (item.characters?.length) card.append(node('p', 'credit-role', item.characters.join(', ')));
  else if (item.directed) card.append(node('p', 'credit-role', item.type === 'tv' ? 'Режиссура эпизодов' : 'Режиссёр'));
  if (item.reason) {
    const reason = node('p', 'editorial-reason', item.reason);
    reason.id = `why-${item.type}-${item.id}`;
    card.setAttribute('aria-describedby', reason.id);
    card.append(reason);
  }
  const ratingLabel = item.votes ? `Оценка ${formatRating(item.rating, item.votes)} из 10. Голосов: ${new Intl.NumberFormat('ru-RU').format(item.votes)}` : 'Оценок пока нет';
  card.setAttribute('aria-label', `Подробнее: ${item.title}. ${mediaType}, ${item.year || 'год неизвестен'}. ${item.characters?.length ? 'Роль: ' + item.characters.join(', ') + '. ' : item.directed ? 'Режиссура. ' : ''}${ratingLabel}`);
  return card;
}

function makePersonCard(item, index) {
  const href = stateUrl({ ...listState(state), view: 'person', id: item.id }, location.href);
  const card = node('a', 'card person-result');
  card.href = href.pathname + href.search;
  card.dataset.type = 'person';
  card.dataset.id = String(item.id);
  card.style.setProperty('--i', String(Math.min(index, 8)));
  const portrait = node('div', 'poster');
  const photo = node('img');
  photo.src = item.photo || 'img/noposter.jpg';
  photo.alt = '';
  photo.loading = index < firstRowCount() ? 'eager' : 'lazy';
  photo.decoding = 'async';
  photo.addEventListener('error', () => { photo.src = 'img/noposter.jpg'; }, { once: true });
  portrait.append(photo);
  card.append(portrait, node('h3', '', item.name));
  const department = { Acting: 'Актёр', Directing: 'Режиссёр' }[item.department] || item.department || 'Деятель кино';
  card.append(node('p', 'card-meta', department));
  if (item.knownFor.length) card.append(node('p', 'person-known-for', item.knownFor.map(work => `${work.title} (${work.type === 'tv' ? 'сериал' : 'фильм'}, ${work.year || 'год неизвестен'})`).join(' · ')));
  card.setAttribute('aria-label', `Открыть: ${item.name}. ${department}.`);
  return card;
}

function renderCatalog(result, animate = true, cards = result.items.map(makeCard)) {
  els.grid.classList.toggle('no-motion', !animate);
  els.grid.replaceChildren(...cards);
  els.empty.hidden = result.items.length > 0;
  if (!result.items.length) {
    els.emptyTitle.textContent = state.mode === 'search' ? (state.searchType === 'person' ? 'Люди не найдены' : 'Ничего не найдено') : state.mode === 'lists' ? 'В списке пока нет фильмов' : state.mode === 'my' ? `В «${LIBRARY_SECTIONS[state.library].label}» пока пусто` : 'Подборка пуста';
    els.emptyCopy.textContent = state.mode === 'my' ? 'Открой карточку фильма или сериала и добавь его в этот список.' : state.mode === 'lists' && editorialCollection(state.list) ? 'Сейчас не удалось загрузить карточки подборки. Проверь соединение и повтори запрос.' : 'Попробуйте изменить запрос или параметры.';
  }
  const totalPages = Math.max(1, result.totalPages);
  els.pages.hidden = totalPages <= 1;
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= totalPages;
  els.pageLabel.textContent = 'Страница ' + state.page + ' из ' + totalPages;
  els.grid.setAttribute('aria-busy', 'false');
  els.grid.classList.remove('updating');
  els.status.textContent = result.items.length ? `Показано ${result.items.length} ${countWord(result.items.length, ['результат', 'результата', 'результатов'])}` : '';
  els.error.hidden = !result.missing;
  if (result.missing) {
    els.errorText.textContent = `Не удалось загрузить ${result.missing} из ${result.items.length + result.missing} карточек. Показаны доступные; можно повторить запрос.`;
  }
}

async function loadCatalog({ animate = true, force = false } = {}) {
  activeCatalog?.abort();
  activeCatalog = new AbortController();
  const controller = activeCatalog;
  const sequence = ++catalogSequence;
  const key = catalogKey(state);
  els.notice.replaceChildren();
  if (state.mode === 'search' && state.q.trim().length < 2) {
    els.grid.replaceChildren();
    els.empty.hidden = false;
    els.emptyTitle.textContent = state.q ? 'Введи ещё один символ' : state.searchType === 'person' ? 'Введи имя человека' : 'Введи название фильма или сериала';
    els.emptyCopy.textContent = 'Результаты появятся автоматически.';
    closeSuggestions();
    els.pages.hidden = true;
    els.error.hidden = true;
    els.status.textContent = '';
    els.grid.setAttribute('aria-busy', 'false');
    els.grid.classList.remove('updating');
    return;
  }
  els.grid.setAttribute('aria-busy', 'true');
  els.grid.classList.add('updating');
  els.empty.hidden = true;
  els.error.hidden = true;
  const updateLabel = state.mode === 'lists' ? 'Обновляем список' : state.mode === 'search' ? 'Обновляем результаты поиска' : 'Обновляем подборку';
  setLoadingStatus(els.status, els.grid.children.length ? `${updateLabel}; пока показаны прежние результаты…` : 'Загружаем результаты…');
  const notice = startLoadingNotice(els.notice, { signal: controller.signal, onRetry: () => loadCatalog({ force: true }) });
  try {
    const collection = state.mode === 'lists' && editorialCollection(state.list);
    const genreTypes = state.mode === 'search' ? (state.searchType === 'person' ? [] : ['movie', 'tv'])
      : [state.mode === 'lists' ? (READY_LISTS[state.list] || READY_LISTS['trending-movie']).type : state.pickType];
    let result = !force && catalogCache.get(key);
    if (state.mode === 'my') result = { items: libraryItems(state.library), page: 1, totalPages: 1 };
    if (!result) {
      genreTypes.forEach(ensureGenres);
      result = await (collection ? fetchEditorial(collection, { getMedia: fetchMedia, signal: controller.signal }) : fetchCatalog(state, { signal: controller.signal }));
    }
    if (sequence !== catalogSequence) return;
    if (state.mode === 'pick') orderGenresByPopularity(state.pickType, result.items);
    catalogCache.delete(key);
    catalogCache.set(key, result);
    if (catalogCache.size > 20) catalogCache.delete(catalogCache.keys().next().value);
    if (state.mode === 'search' && state.page === 1) renderSuggestions(result.items);
    const cards = result.items.map(makeCard);
    if (cards.length) setLoadingStatus(els.status, 'Загружаем постеры…');
    const posters = await waitForPosters(firstScreenPosters(cards, els.grid), { signal: controller.signal });
    if (sequence !== catalogSequence || controller.signal.aborted) return;
    renderCatalog(result, animate, cards);
    notice.finish({ failed: posters.failed > 0 });
  } catch (error) {
    if (sequence !== catalogSequence || error?.name === 'AbortError') return;
    els.grid.setAttribute('aria-busy', 'false');
    els.grid.classList.remove('updating');
    els.error.hidden = false;
    closeSuggestions();
    els.errorText.textContent = 'Не удалось получить данные TMDB. Проверь соединение и попробуй ещё раз.';
    els.status.textContent = els.grid.children.length ? 'Показаны прежние результаты' : '';
    if (!els.grid.children.length) els.pages.hidden = true;
    notice.finish({ failed: true, retryAvailable: false });
  }
}

function closeSuggestions() {
  els.suggestions.hidden = true;
  els.suggestions.replaceChildren();
  els.searchInput.setAttribute('aria-expanded', 'false');
  els.searchInput.removeAttribute('aria-activedescendant');
  activeSuggestion = -1;
}

function renderSuggestions(items) {
  suggestionItems = items.slice(0, 6);
  closeSuggestions();
  if (!suggestionItems.length || document.activeElement !== els.searchInput || state.mode !== 'search') return;
  for (const [index, item] of suggestionItems.entries()) {
    const option = node('div', 'search-option');
    option.id = `search-option-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.dataset.index = String(index);
    const photo = node('img');
    photo.src = (item.type === 'person' ? item.photo : item.poster) || 'img/noposter.jpg';
    photo.alt = '';
    photo.loading = 'lazy';
    photo.addEventListener('error', () => { photo.src = 'img/noposter.jpg'; }, { once: true });
    const label = node('span');
    const department = ({ Acting: 'Актёр', Directing: 'Режиссёр' }[item.department] || item.department || 'Человек');
    label.append(node('strong', '', item.type === 'person' ? item.name : item.title),
      node('small', '', item.type === 'person' ? `${department}${item.knownFor?.[0] ? ' · ' + item.knownFor[0].title : ''}` : `${item.type === 'movie' ? 'Фильм' : 'Сериал'} · ${item.year || 'год неизвестен'}`));
    option.append(photo, label);
    option.addEventListener('pointerdown', event => event.preventDefault());
    option.addEventListener('click', () => openSuggestion(index));
    els.suggestions.append(option);
  }
  els.suggestions.hidden = false;
  els.searchInput.setAttribute('aria-expanded', 'true');
  els.searchAnnouncement.textContent = `Найдено подсказок: ${suggestionItems.length}`;
}

function selectSuggestion(index) {
  activeSuggestion = index;
  [...els.suggestions.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
  if (index >= 0) {
    const option = els.suggestions.children[index];
    els.searchInput.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  } else els.searchInput.removeAttribute('aria-activedescendant');
}

function openSuggestion(index) {
  const item = suggestionItems[index];
  if (!item) return;
  closeSuggestions();
  openItem(item, { fromList: true });
}

function switchRoute(next, { replace = false, scrollTop = true, scrollCatalog = false } = {}) {
  clearTimeout(searchTimer);
  closeSuggestions();
  activeCatalog?.abort();
  activeDetail?.abort();
  activeRecommendations?.abort();
  activePerson?.abort();
  catalogSequence++;
  detailSequence++;
  recommendationsSequence++;
  personSequence++;
  state = listState(next);
  const url = stateUrl(state, location.href);
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search);
  root.dataset.route = 'list';
  els.list.hidden = false;
  els.detail.hidden = true;
  els.personView.hidden = true;
  els.detailContent.replaceChildren();
  renderControls();
  if (scrollTop) window.scrollTo(0, 0);
  else if (scrollCatalog) els.title.scrollIntoView({ block: 'start' });
  loadCatalog();
}

function detailLine(label, value) {
  const text = node('span', '', label + ': ' + value);
  return text;
}

function personPortrait(person) {
  const portrait = node('div', 'person-portrait');
  const missing = () => portrait.replaceChildren(node('span', 'person-photo-missing', 'Нет фото'));
  if (!person.photo) { missing(); return portrait; }
  const photo = node('img');
  photo.src = person.photo;
  photo.srcset = `${person.photo} 185w, ${person.photoLarge} 421w`;
  photo.sizes = '(max-width:760px) calc((100vw - 50px) / 2), (max-width:1100px) 185px, 220px';
  photo.width = 185;
  photo.height = 278;
  photo.alt = person.name;
  photo.loading = 'lazy';
  photo.decoding = 'async';
  photo.addEventListener('error', missing, { once: true });
  portrait.append(photo);
  return portrait;
}

function expandablePeople(people, { director = false } = {}) {
  const group = node('div', director ? 'directors-group' : 'cast-group');
  const list = node('ul', director ? 'directors-list' : 'cast-grid');
  list.id = director ? 'detail-directors-list' : 'detail-cast-list';
  const initialCount = director ? 2 : 4;
  const makePerson = person => {
    const entry = node('li', director ? 'director-person' : 'cast-person');
    const copy = node('div', 'person-copy');
    if (director) copy.append(node('span', 'person-label', people.length === 1 ? 'Режиссёр' : 'Режиссёры'));
    const personUrl = stateUrl({ ...state, view: 'person', id: person.id, role: director ? 'directing' : 'acting', personTab: 'movie', personSort: 'popular', shows: false }, location.href);
    const link = node('a', 'person-link');
    link.href = personUrl.pathname + personUrl.search;
    link.append(personPortrait(person), node('span', 'person-name', person.name));
    link.setAttribute('aria-label', `Фильмография: ${person.name}`);
    if (!director && person.character) copy.append(node('p', 'person-role', person.character));
    copy.prepend(link);
    entry.append(copy);
    return entry;
  };
  list.append(...people.slice(0, initialCount).map(makePerson));
  group.append(list);
  if (people.length > initialCount) {
    const expandText = director ? `Показать всех режиссёров (${people.length})` : `Показать весь состав (${people.length})`;
    const toggle = node('button', 'people-toggle', expandText);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', list.id);
    let drawn = false;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      if (expanded && !drawn) { list.append(...people.slice(initialCount).map(makePerson)); drawn = true; }
      Array.from(list.children).slice(initialCount).forEach(entry => { entry.hidden = !expanded; });
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Свернуть' : expandText;
    });
    group.append(toggle);
  }
  return group;
}

async function loadCredits(data, section, sequence, signal) {
  section.setAttribute('aria-busy', 'true');
  const status = node('p', 'credits-status', 'Загружаем актёров и режиссёров…');
  status.setAttribute('role', 'status');
  section.replaceChildren(status);
  try {
    const { directors, cast } = await fetchCredits(data.type, data.id, { signal });
    if (sequence !== detailSequence || signal.aborted || !section.isConnected) return;
    section.setAttribute('aria-busy', 'false');
    section.replaceChildren();
    if (directors.length) section.append(expandablePeople(directors, { director: true }));
    else section.append(node('p', 'credits-status', 'Режиссёры пока не указаны в TMDB.'));
    const heading = node('h2', '', 'В ролях');
    section.append(heading);
    if (cast.length) section.append(expandablePeople(cast));
    else section.append(node('p', 'credits-status', 'Актёрский состав пока не указан в TMDB.'));
  } catch (error) {
    if (sequence !== detailSequence || signal.aborted || !section.isConnected) return;
    section.setAttribute('aria-busy', 'false');
    const message = node('p', 'credits-status', 'Не удалось загрузить актёров и режиссёров.');
    message.setAttribute('role', 'alert');
    const retry = node('button', 'people-toggle', 'Повторить');
    retry.type = 'button';
    retry.addEventListener('click', () => loadCredits(data, section, sequence, signal));
    section.replaceChildren(message, retry);
  }
}

function recommendationsTitle() {
  return node('h2', '', 'Что посмотреть дальше');
}

function renderRecommendationsLoading(section) {
  section.hidden = false;
  section.setAttribute('aria-busy', 'true');
  const status = node('p', 'recommendations-status', 'Подбираем похожие варианты…');
  status.setAttribute('role', 'status');
  setLoadingStatus(status, 'Подбираем похожие варианты…');
  section.replaceChildren(recommendationsTitle(), status);
}

function renderRecommendations(section, items, cards) {
  section.hidden = false;
  section.setAttribute('aria-busy', 'false');
  const grid = node('div', 'grid recommendations-grid');
  grid.replaceChildren(...cards);
  section.replaceChildren(recommendationsTitle(), grid);
}

function renderRecommendationsError(section, data, detailRequestSequence) {
  section.hidden = false;
  section.setAttribute('aria-busy', 'false');
  const box = node('div', 'recommendations-error');
  box.setAttribute('role', 'alert');
  box.append(node('p', '', 'Не удалось загрузить варианты. Основные сведения сохранены.'));
  const retry = node('button', '', 'Повторить');
  retry.type = 'button';
  retry.addEventListener('click', () => loadRecommendations(data, section, detailRequestSequence));
  box.append(retry);
  section.replaceChildren(recommendationsTitle(), box);
}

async function loadRecommendations(data, section, detailRequestSequence) {
  activeRecommendations?.abort();
  activeRecommendations = new AbortController();
  const controller = activeRecommendations;
  const sequence = ++recommendationsSequence;
  renderRecommendationsLoading(section);
  const notice = startLoadingNotice(section, { signal: controller.signal, onRetry: () => loadRecommendations(data, section, detailRequestSequence) });
  try {
    const items = (await fetchRecommendations(data.type, data.id, { signal: controller.signal })).slice(0, 6);
    if (detailRequestSequence !== detailSequence || sequence !== recommendationsSequence || !section.isConnected) return;
    if (!items.length) {
      section.hidden = true;
      section.setAttribute('aria-busy', 'false');
      notice.finish();
      return;
    }
    const cards = items.map((item, index) => makeCard(item, index, { numbered: false, recommendation: true }));
    const posters = await waitForPosters(firstScreenPosters(cards, section), { signal: controller.signal });
    if (detailRequestSequence !== detailSequence || sequence !== recommendationsSequence || controller.signal.aborted || !section.isConnected) return;
    renderRecommendations(section, items, cards);
    notice.finish({ failed: posters.failed > 0 });
    if (posters.failed) section.insertBefore(notice.element, section.querySelector('.grid'));
  } catch (error) {
    if (detailRequestSequence !== detailSequence || sequence !== recommendationsSequence || error?.name === 'AbortError' || !section.isConnected) return;
    renderRecommendationsError(section, data, detailRequestSequence);
    notice.finish({ failed: true, retryAvailable: false });
  }
}

function makeDetailPoster(data) {
  const poster = node('img', 'detail-poster' + (data.poster_path ? '' : ' is-placeholder'));
  poster.src = imageUrl(data.poster_path, 'w500') || 'img/noposter.jpg';
  poster.srcset = posterSrcset(poster.src);
  poster.sizes = '(max-width:335px) calc(58vw - 20.88px), (max-width:760px) min(190px, calc(48vw - 17.28px)), (max-width:900px) 190px, 300px';
  poster.fetchPriority = 'high';
  poster.decoding = 'async';
  poster.alt = '';
  poster.width = 500;
  poster.height = 750;
  installPosterFallback(poster);
  return poster;
}

function renderDetail(data, poster = makeDetailPoster(data)) {
  els.detailContent.replaceChildren();
  const title = data.title || data.name || 'Без названия';
  setPageMeta(`${title} — Что посмотреть`, data.overview?.trim().slice(0, 155) || `Сведения о ${data.type === 'tv' ? 'сериале' : 'фильме'} ${title} по данным TMDB.`);
  const layout = node('div', 'detail-layout');
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
  for (const fact of detailFacts(data)) {
    const element = node('span', fact.kind === 'certificate' ? 'detail-certificate' : 'detail-fact');
    element.append(node('strong', '', fact.label + ': '), document.createTextNode(fact.value));
    facts.append(element);
  }
  content.append(facts);
  const score = node('div', 'detail-rating');
  score.append(scoreBadge(data.vote_average, data.vote_count));
  const scoreInfo = node('div', 'score-info');
  scoreInfo.append(node('span', 'score-label', 'Оценка пользователей'));
  scoreInfo.append(node('span', 'score-votes', formatVotes(data.vote_count)));
  score.append(scoreInfo);
  content.append(score);
  content.append(makeShareControls({ detailTitle: title }));
  const library = node('section', 'library-actions');
  library.setAttribute('aria-label', 'Моё');
  library.append(node('h2', '', 'Моё'));
  const libraryNote = node('p', 'library-note', 'Списки хранятся только в этом браузере.');
  const libraryButtons = node('div', 'library-buttons');
  const libraryStatus = node('p', 'library-status');
  libraryStatus.setAttribute('role', 'status');
  libraryStatus.setAttribute('aria-live', 'polite');
  const savedItem = {
    id: data.id,
    type: data.type,
    title,
    year: typeof date === 'string' && /^\d{4}/.test(date) ? date.slice(0, 4) : '',
    poster: imageUrl(data.poster_path),
    posterLarge: imageUrl(data.poster_path, 'w500'),
    genreLabels: Array.isArray(data.genres) ? data.genres.map(genre => genre.name).filter(Boolean) : [],
    rating: Number(data.vote_average) || 0,
    votes: Number(data.vote_count) || 0,
  };
  const drawLibraryActions = () => {
    libraryButtons.replaceChildren();
    for (const [section, meta] of Object.entries(LIBRARY_SECTIONS)) {
      const active = libraryState(savedItem, section);
      const button = node('button', active ? 'is-active' : '', active ? meta.activeLabel : meta.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', () => {
        const result = toggleLibraryState(savedItem, section);
        if (!result.saved) {
          libraryStatus.textContent = 'Не удалось сохранить список в этом браузере.';
          return;
        }
        catalogCache.clear();
        drawLibraryActions();
        libraryStatus.textContent = result.active ? `Добавлено: ${meta.label}.` : `Убрано: ${meta.label}.`;
      });
      libraryButtons.append(button);
    }
  };
  drawLibraryActions();
  library.append(libraryNote, libraryButtons, libraryStatus);
  content.append(library);
  if (typeof data.tagline === 'string' && data.tagline.trim()) content.append(node('p', 'detail-tagline', data.tagline.trim()));
  content.append(node('h2', '', data.type === 'tv' ? 'О сериале' : 'О фильме'));
  content.append(node('p', 'detail-overview', data.overview || 'Описание пока недоступно.'));
  const extra = detailMore(data);
  if (extra.length) {
    const more = node('details', 'detail-more');
    more.append(node('summary', '', data.type === 'tv' ? 'Подробнее о сериале' : 'Подробнее о фильме'));
    const description = node('dl');
    for (const entry of extra) {
      description.append(node('dt', '', entry.label), node('dd', '', entry.value));
    }
    more.append(description, node('p', 'detail-more-source', 'По данным TMDB'));
    content.append(more);
  }
  const credits = node('section', 'detail-credits');
  credits.setAttribute('aria-label', 'Актёры и режиссёры');
  content.append(credits);
  const trailerBox = node('div', 'trailer-box');
  trailerBox.setAttribute('aria-live', 'polite');
  content.append(trailerBox);
  layout.append(content);
  const recommendations = node('section', 'detail-recommendations');
  recommendations.setAttribute('aria-label', 'Что посмотреть дальше');
  recommendations.hidden = true;
  els.detailContent.append(layout, recommendations);
  heading.focus({ preventScroll: true });
  return { recommendations, trailerBox, credits };
}

function renderTrailer(data, trailerBox) {
  trailerBox.replaceChildren();
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
}

async function loadTrailer(data, trailerBox, sequence, signal) {
  if (data.trailer) { renderTrailer(data, trailerBox); return; }
  trailerBox.replaceChildren(node('h2', '', 'Трейлер'), node('p', '', 'Загружаем трейлер…'));
  try {
    const trailer = await fetchTrailer(data.type, data.id, { signal });
    if (sequence !== detailSequence || !trailerBox.isConnected) return;
    renderTrailer({ ...data, trailer }, trailerBox);
  } catch (error) {
    if (sequence !== detailSequence || signal.aborted || !trailerBox.isConnected) return;
    const retry = node('button', '', 'Повторить');
    retry.type = 'button';
    retry.addEventListener('click', () => loadTrailer(data, trailerBox, sequence, signal));
    trailerBox.replaceChildren(node('h2', '', 'Трейлер'), node('p', '', 'Не удалось загрузить трейлер.'), retry);
  }
}

async function showDetail() {
  activeCatalog?.abort();
  catalogSequence++;
  activeDetail?.abort();
  activeRecommendations?.abort();
  recommendationsSequence++;
  activeDetail = new AbortController();
  const controller = activeDetail;
  const sequence = ++detailSequence;
  root.dataset.route = 'detail';
  els.list.hidden = true;
  els.detail.hidden = false;
  els.personView.hidden = true;
  els.back.lastChild.textContent = history.state?.fromPerson ? 'К фильмографии' : history.state?.fromDetail ? 'К предыдущей карточке' : 'К результатам';
  els.back.href = stateUrl(listState(state), location.href).pathname + stateUrl(listState(state), location.href).search;
  if (history.state?.returnHref) els.back.href = history.state.returnHref;
  const loading = node('div', 'detail-loading');
  loading.setAttribute('role', 'status');
  setLoadingStatus(loading, 'Загружаем сведения…', { large: true });
  els.detailContent.replaceChildren(loading);
  const notice = startLoadingNotice(els.detailContent, { signal: controller.signal, onRetry: showDetail });
  try {
    const data = await fetchDetail(state.view, state.id, { signal: controller.signal });
    if (sequence !== detailSequence) return;
    const poster = makeDetailPoster(data);
    setLoadingStatus(loading, 'Загружаем постер…', { large: true });
    const posters = await waitForPosters([poster], { signal: controller.signal });
    if (sequence !== detailSequence || controller.signal.aborted) return;
    const { recommendations, trailerBox, credits } = renderDetail(data, poster);
    if (history.state?.scrollY) window.scrollTo(0, history.state.scrollY);
    notice.finish({ failed: posters.failed > 0 });
    if (posters.failed) els.detailContent.prepend(notice.element);
    loadCredits(data, credits, sequence, controller.signal);
    loadRecommendations(data, recommendations, sequence);
    loadTrailer(data, trailerBox, sequence, controller.signal);
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
    notice.finish({ failed: true, retryAvailable: false });
  }
}

const personCache = new Map();

function openItem(item, { role = 'acting', fromList = false } = {}) {
  if (!item || !['movie', 'tv', 'person'].includes(item.type) || !Number.isSafeInteger(item.id)) return;
  if (item.type === 'person') {
    personShown = { movie: 12, tv: 12 };
    personScroll = { movie: null, tv: null };
  }
  const previous = { ...history.state, scrollY: window.scrollY };
  history.replaceState(previous, '', location.href);
  const next = { ...state, view: item.type, id: item.id, role, personTab: 'movie', personSort: 'popular', shows: false };
  const url = stateUrl(next, location.href);
  history.pushState({ fromList, fromPerson: root.dataset.route === 'person', fromDetail: root.dataset.route === 'detail', returnHref: location.pathname + location.search }, '', url.pathname + url.search);
  state = parseState(location.href);
  if (state.view === 'person') showPerson();
  else showDetail();
  window.scrollTo(0, 0);
}

function updatePersonUrl() {
  const url = stateUrl(state, location.href);
  history.replaceState(history.state, '', url.pathname + url.search);
}

function renderPerson(data) {
  const { person, credits } = data;
  const container = els.personContent;
  container.replaceChildren();
  const header = node('div', 'person-header');
  const photo = node('img', 'person-hero-photo');
  photo.src = person.photoLarge || person.photo || 'img/noposter.jpg';
  photo.alt = '';
  photo.width = 185;
  photo.height = 278;
  photo.addEventListener('error', () => { photo.src = 'img/noposter.jpg'; }, { once: true });
  const intro = node('div');
  const heading = node('h1', '', person.name);
  heading.id = 'person-title';
  heading.tabIndex = -1;
  intro.append(node('p', 'detail-kicker', 'Люди кино'), heading, node('p', 'person-subtitle', 'Работы по данным TMDB'));
  const roleButtons = node('div', 'person-roles');
  roleButtons.setAttribute('role', 'group');
  roleButtons.setAttribute('aria-label', 'Участие');
  const hasRole = role => credits[role].movie.length + credits[role].tv.length > 0;
  for (const [role, label] of [['acting', 'В ролях'], ['directing', 'Режиссура']]) {
    if (!hasRole(role)) continue;
    const button = node('button', '', label);
    button.type = 'button';
    button.dataset.role = role;
    button.addEventListener('click', () => {
      if (state.role === role) return;
      state = { ...state, role, personTab: 'movie' };
      personShown = { movie: 12, tv: 12 };
      personScroll = { movie: null, tv: null };
      updatePersonUrl();
      renderPersonWorks(data);
      const worksTop = els.personContent.querySelector('#person-works').getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo(0, Math.max(0, worksTop));
    });
    roleButtons.append(button);
  }
  if (roleButtons.childElementCount > 1) intro.append(roleButtons);
  header.append(photo, intro);
  container.append(header);
  if (!hasRole('acting') && !hasRole('directing')) container.append(node('p', 'person-empty', 'В TMDB пока нет актёрских или режиссёрских работ этого человека.'));
  const controls = node('div', 'person-controls');
  const tabs = node('div', 'person-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Тип произведений');
  for (const [type, label] of [['movie', 'Фильмы'], ['tv', 'Сериалы']]) {
    const button = node('button', '', label);
    button.type = 'button';
    button.dataset.personTab = type;
    button.id = `person-tab-${type}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'person-works');
    button.addEventListener('click', () => {
      if (state.personTab === type) return;
      personScroll[state.personTab] = window.scrollY;
      state = { ...state, personTab: type };
      updatePersonUrl();
      renderPersonWorks(data);
      const controlsTop = els.personContent.querySelector('.person-controls').getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo(0, personScroll[type] ?? Math.max(0, controlsTop));
    });
    tabs.append(button);
  }
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'ArrowLeft' || event.key === 'Home' ? tabs.firstElementChild : tabs.lastElementChild;
    target.click();
    target.focus();
  });
  controls.append(tabs);
  const sortLabel = node('label', 'person-sort-label', 'Сортировка ');
  const sort = node('select');
  sort.id = 'person-sort';
  for (const [value, label] of [['popular', 'Популярные'], ['newest', 'Новые'], ['rating', 'По рейтингу']]) {
    const option = node('option', '', label); option.value = value; sort.append(option);
  }
  sort.value = state.personSort;
  sort.addEventListener('change', () => { state = { ...state, personSort: sort.value }; personShown = { movie: 12, tv: 12 }; personScroll = { movie: null, tv: null }; updatePersonUrl(); renderPersonWorks(data); window.scrollTo(0, Math.max(0, works.getBoundingClientRect().top + window.scrollY - 16)); });
  sortLabel.append(sort);
  controls.append(sortLabel);
  const showsLabel = node('label', 'person-shows');
  const shows = node('input'); shows.type = 'checkbox'; shows.id = 'person-shows'; shows.checked = state.shows;
  shows.addEventListener('change', () => { state = { ...state, shows: shows.checked }; personShown = { movie: 12, tv: 12 }; personScroll = { movie: null, tv: null }; updatePersonUrl(); renderPersonWorks(data); window.scrollTo(0, Math.max(0, works.getBoundingClientRect().top + window.scrollY - 16)); });
  showsLabel.append(shows, node('span', '', 'Включить телешоу'));
  controls.append(showsLabel);
  container.append(controls);
  const works = node('div', 'grid person-grid');
  works.id = 'person-works';
  works.setAttribute('role', 'tabpanel');
  container.append(works);
  const more = node('button', 'people-toggle', 'Показать ещё');
  more.type = 'button';
  more.id = 'person-more';
  more.addEventListener('click', () => { personShown[state.personTab] += 12; renderPersonWorks(data); });
  container.append(more);
  renderPersonWorks(data);
  heading.focus({ preventScroll: true });
}

function renderPersonWorks(data) {
  const { credits } = data;
  const works = els.personContent.querySelector('#person-works');
  if (!works) return;
  const role = state.role;
  const type = state.personTab;
  els.personContent.querySelector('.person-subtitle').textContent = `${role === 'directing' ? 'Режиссура' : 'В ролях'} · Работы по данным TMDB`;
  const active = personWorks(credits, { role, type, sort: state.personSort, shows: state.shows });
  for (const button of els.personContent.querySelectorAll('[data-role]')) {
    button.setAttribute('aria-pressed', String(button.dataset.role === role));
    button.classList.toggle('chosen', button.dataset.role === role);
  }
  for (const button of els.personContent.querySelectorAll('[data-person-tab]')) {
    const selected = button.dataset.personTab === type;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.textContent = `${button.dataset.personTab === 'movie' ? 'Фильмы' : 'Сериалы'} · ${personWorks(credits, { role, type: button.dataset.personTab, shows: state.shows }).length}`;
  }
  works.setAttribute('aria-labelledby', `person-tab-${type}`);
  els.personContent.querySelector('.person-shows').hidden = type !== 'tv';
  const cards = active.slice(0, personShown[type]).map((item, i) => makeCard({ ...item, directed: role === 'directing' }, i, { numbered: false }));
  works.replaceChildren(...cards);
  if (!cards.length) works.append(node('p', 'person-empty', `В TMDB пока нет ${type === 'tv' ? 'сериалов' : 'фильмов'} с ${role === 'acting' ? 'актёрским участием' : 'режиссёрской работой'}${type === 'tv' && !state.shows ? ' при выключенных телешоу' : ''}.`));
  els.personContent.querySelector('#person-more').hidden = personShown[type] >= active.length;
}

async function showPerson() {
  activeCatalog?.abort(); catalogSequence++;
  activeDetail?.abort(); detailSequence++;
  activeRecommendations?.abort(); recommendationsSequence++;
  activePerson?.abort();
  activePerson = new AbortController();
  const controller = activePerson;
  const sequence = ++personSequence;
  root.dataset.route = 'person';
  els.list.hidden = true; els.detail.hidden = true; els.personView.hidden = false;
  els.personBack.lastElementChild.textContent = history.state?.fromDetail ? 'К фильму или сериалу' : 'К результатам поиска';
  const fallback = stateUrl({ ...listState(state), mode: 'search', searchType: 'person', q: state.searchType === 'person' ? state.q : '' }, location.href);
  els.personBack.href = fallback.pathname + fallback.search;
  if (history.state?.returnHref) els.personBack.href = history.state.returnHref;
  els.personContent.replaceChildren(node('p', 'detail-loading', 'Загружаем фильмографию…'));
  try {
    const data = personCache.get(state.id) || await fetchPerson(state.id, { signal: controller.signal });
    if (sequence !== personSequence || controller.signal.aborted) return;
    personCache.delete(state.id);
    personCache.set(state.id, data);
    if (personCache.size > 12) personCache.delete(personCache.keys().next().value);
    const available = role => data.credits[role].movie.length + data.credits[role].tv.length > 0;
    if (!available(state.role) && available(state.role === 'acting' ? 'directing' : 'acting')) {
      state = { ...state, role: state.role === 'acting' ? 'directing' : 'acting' };
      updatePersonUrl();
    }
    if (!personWorks(data.credits, { role: state.role, type: 'movie', shows: state.shows }).length &&
      personWorks(data.credits, { role: state.role, type: 'tv', shows: state.shows }).length && !location.search.includes('ptab=')) {
      state = { ...state, personTab: 'tv' }; updatePersonUrl();
    }
    setPageMeta(`${data.person.name} — Фильмография — Что посмотреть`, `Фильмы и сериалы с участием ${data.person.name} по данным TMDB.`);
    renderPerson(data);
    if (history.state?.scrollY) window.scrollTo(0, history.state.scrollY);
  } catch (error) {
    if (sequence !== personSequence || controller.signal.aborted) return;
    const box = node('div', 'detail-error');
    box.append(node('h1', '', error?.message?.includes('404') ? 'Человек не найден' : 'Не удалось открыть фильмографию'));
    box.append(node('p', '', 'Проверь соединение и повтори запрос.'));
    const retry = node('button', 'show', 'Повторить'); retry.type = 'button'; retry.addEventListener('click', showPerson);
    box.append(retry); els.personContent.replaceChildren(box);
  }
}

function restoreList(scrollPosition = 0) {
  activeCatalog?.abort();
  catalogSequence++;
  activeDetail?.abort();
  activeRecommendations?.abort();
  activePerson?.abort();
  detailSequence++;
  recommendationsSequence++;
  personSequence++;
  state = listState(parseState(location.href));
  root.dataset.route = 'list';
  els.list.hidden = false;
  els.detail.hidden = true;
  els.personView.hidden = true;
  els.detailContent.replaceChildren();
  renderControls();
  const target = returnFocus;
  returnFocus = null;
  window.scrollTo(0, scrollPosition);
  const ready = loadCatalog({ animate: false });
  const sequence = catalogSequence;
  ready.then(() => {
    if (target && sequence === catalogSequence && root.dataset.route === 'list') {
      const card = els.grid.querySelector('[data-type="' + target.type + '"][data-id="' + target.id + '"]');
      card?.focus({ preventScroll: true });
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
  if (activeSuggestion >= 0 && !els.suggestions.hidden) { openSuggestion(activeSuggestion); return; }
  const q = els.searchInput.value.trim();
  clearTimeout(searchTimer);
  closeSuggestions();
  if (q.length < 2) return;
  if (state.mode === 'search' && state.q === q && state.searchType === draftSearchType) {
    if (els.grid.classList.contains('updating')) loadCatalog();
    return;
  }
  switchRoute({ ...state, mode: 'search', q, searchType: draftSearchType, page: 1 }, { replace: state.mode === 'search', scrollTop: false });
});
function queueSearch() {
  if (searchComposing) return;
  let q = els.searchInput.value.trim().slice(0, 200);
  if (state.mode !== 'search') {
    switchRoute({ ...state, mode: 'search', q: '', searchType: draftSearchType, page: 1 }, { scrollTop: false });
    els.searchInput.value = q;
  }
  clearTimeout(searchTimer);
  activeCatalog?.abort(); catalogSequence++;
  closeSuggestions();
  suggestionItems = [];
  if (q.length < 2) {
    switchRoute({ ...state, q, searchType: draftSearchType, page: 1 }, { replace: true, scrollTop: false });
    els.searchInput.focus();
    return;
  }
  els.grid.classList.add('updating');
  els.status.textContent = 'Обновляем результаты поиска…';
  searchTimer = setTimeout(() => {
    q = els.searchInput.value.trim().slice(0, 200);
    switchRoute({ ...state, mode: 'search', q, searchType: draftSearchType, page: 1 }, { replace: true, scrollTop: false });
    els.searchInput.focus();
  }, 350);
}
els.searchInput.addEventListener('compositionstart', () => { searchComposing = true; clearTimeout(searchTimer); });
els.searchInput.addEventListener('compositionend', () => { searchComposing = false; queueSearch(); });
els.searchInput.addEventListener('input', queueSearch);
els.searchInput.addEventListener('focus', () => {
  if (suggestionItems.length && state.mode === 'search' && state.q === els.searchInput.value.trim()) renderSuggestions(suggestionItems);
});
els.searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeSuggestions(); return; }
  if (els.suggestions.hidden || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'ArrowDown' ? (activeSuggestion + 1) % suggestionItems.length : (activeSuggestion - 1 + suggestionItems.length) % suggestionItems.length;
  selectSuggestion(next);
});
document.addEventListener('click', event => { if (!els.searchForm.contains(event.target)) closeSuggestions(); });
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
els.myMode.addEventListener('click', () => {
  if (state.mode === 'my' && !state.view) return;
  switchRoute({ ...state, mode: 'my', page: 1 });
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
  const q = els.searchInput.value.trim();
  suggestionItems = [];
  if (state.mode === 'search') switchRoute({ ...state, q, searchType: draftSearchType, page: 1 }, { scrollTop: false });
}));
async function updateBackup() {
  if (backupUpdater) { backupUpdater(); return; }
  els.backup.replaceChildren(node('p', 'library-status', 'Загружаем перенос и резервную копию…'));
  try {
    const { mountLibraryBackup } = await (backupModule ||= import('./backup-ui.js?v=20261007perf2'));
    if (!backupUpdater) {
      els.backup.replaceChildren();
      backupUpdater = mountLibraryBackup(els.backup, () => {
        catalogCache.clear();
        if (state.mode === 'my' && !state.view) loadCatalog({ animate: false });
      });
    }
    backupUpdater();
  } catch (_) {
    backupModule = null;
    const retry = node('button', 'show', 'Повторить');
    retry.type = 'button';
    // Browsers may retain a failed module graph; reload retries all dependencies.
    retry.addEventListener('click', () => location.reload());
    els.backup.replaceChildren(node('p', 'library-status', 'Не удалось загрузить перенос и резервную копию.'), retry);
  }
}

for (const collection of EDITORIAL_COLLECTIONS.filter(item => item.enabled)) {
  const button = node('button', '', collection.shortTitle + (collection.status === 'draft' ? ' · черновик' : ''));
  button.type = 'button';
  button.dataset.list = collection.slug;
  document.querySelector('#editorial-choices').append(button);
}
document.querySelector('#editorial-group').hidden = !EDITORIAL_COLLECTIONS.some(item => item.enabled);
document.querySelectorAll('[data-list]').forEach(button => button.addEventListener('click', () => {
  const list = button.dataset.list;
  if ((!READY_LISTS[list] && !editorialCollection(list)) || (state.mode === 'lists' && list === state.list)) return;
  switchRoute({ ...state, mode: 'lists', list, page: 1 }, { scrollTop: false, scrollCatalog: true });
}));
document.querySelectorAll('[data-library]').forEach(button => button.addEventListener('click', () => {
  const library = button.dataset.library;
  if (!LIBRARY_SECTIONS[library] || (state.mode === 'my' && library === state.library)) return;
  switchRoute({ ...state, mode: 'my', library, page: 1 }, { scrollTop: false, scrollCatalog: true });
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
  openItem({ type: card.dataset.type, id: Number(card.dataset.id) }, { fromList: true });
});
els.detailContent.addEventListener('click', event => {
  const person = event.target.closest('a.person-link');
  if (person && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    const parsed = parseState(person.href);
    openItem({ type: 'person', id: parsed.id }, { role: parsed.role });
    return;
  }
  const card = event.target.closest('a.recommendation-card');
  if (!card || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openItem({ type: card.dataset.type, id: Number(card.dataset.id) });
});
els.personContent.addEventListener('click', event => {
  const card = event.target.closest('a.card');
  if (!card || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openItem({ type: card.dataset.type, id: Number(card.dataset.id) });
});
els.back.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (history.state?.fromList || history.state?.fromPerson || history.state?.fromDetail) history.back();
  else switchRoute(listState(state));
});
els.personBack.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (history.state?.fromDetail || history.state?.fromList) history.back();
  else switchRoute({ ...listState(state), mode: 'search', searchType: 'person', page: 1 });
});
window.addEventListener('popstate', event => {
  state = parseState(location.href);
  if (state.view === 'person') showPerson();
  else if (state.view) { showDetail(); if (event.state?.scrollY) window.scrollTo(0, event.state.scrollY); }
  else {
    restoreList(event.state?.scrollY || 0);
  }
});

function updateNetworkStatus() {
  const offline = navigator.onLine === false;
  els.networkStatus.hidden = !offline;
  els.networkStatus.textContent = offline ? 'Нет подключения. Интерфейс и сохранённые списки доступны, но новые данные TMDB не загрузятся.' : '';
}

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function showInstallHint() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !isStandalone()) {
    els.installHint.hidden = false;
    els.installHint.textContent = 'На iPhone: «Поделиться» → «На экран Домой».';
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // The website remains fully usable if a browser blocks service workers.
  });
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  els.installButton.hidden = false;
});
els.installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const result = await installPrompt.userChoice;
  installPrompt = null;
  els.installButton.hidden = true;
  els.installStatus.hidden = false;
  els.installStatus.textContent = result.outcome === 'accepted' ? 'Приложение установлено.' : 'Установка отменена.';
});
window.addEventListener('appinstalled', () => {
  els.installButton.hidden = true;
  els.installHint.hidden = true;
  els.installStatus.hidden = false;
  els.installStatus.textContent = 'Приложение установлено.';
});

applyTheme();
updateNetworkStatus();
showInstallHint();
renderControls();
if (state.view === 'person') showPerson();
else if (state.view) showDetail();
else restoreList(history.state?.scrollY || 0);
ensureGenres(state.pickType);
