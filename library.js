export const LIBRARY_STORAGE_KEY = 'movie-db-library-v1';

export const LIBRARY_SECTIONS = Object.freeze({
  later: { label: 'Посмотреть позже', activeLabel: 'В списке «Посмотреть позже»' },
  favorites: { label: 'Избранное', activeLabel: 'В избранном' },
  watched: { label: 'Просмотрено', activeLabel: 'Отмечено просмотренным' },
});

const SECTION_KEYS = new Set(Object.keys(LIBRARY_SECTIONS));
export const MAX_LIBRARY_ITEMS = 500;
export const LIBRARY_RECOVERY_MESSAGE = 'Списки не изменены. Открой «Моё» → «Резервная копия» → «Восстановить из файла» и выбери замену из сохранённой копии. Если хранилище недоступно, сначала разреши хранение данных сайта в браузере.';

function usableStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch (_) { return null; }
}

function validMedia(item) {
  return item && (item.type === 'movie' || item.type === 'tv') && Number.isInteger(item.id) && item.id > 0;
}

function text(value, length = 240) {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}

function image(value) {
  return typeof value === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(value) ? value : '';
}

function number(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function states(value) {
  return {
    later: value?.later === true,
    favorites: value?.favorites === true,
    watched: value?.watched === true,
  };
}

function hasAnyState(value) {
  return Object.values(value).some(Boolean);
}

export function normalizeLibraryItem(item) {
  if (!validMedia(item)) return null;
  const savedStates = states(item.states);
  if (!hasAnyState(savedStates)) return null;
  const title = text(item.title);
  if (!title) return null;
  return {
    id: item.id,
    type: item.type,
    title,
    year: /^\d{4}$/.test(item.year || '') ? item.year : '',
    poster: image(item.poster),
    posterLarge: image(item.posterLarge),
    genreLabels: Array.isArray(item.genreLabels) ? item.genreLabels.map(label => text(label, 80)).filter(Boolean).slice(0, 3) : [],
    rating: Math.min(10, number(item.rating)),
    votes: Math.floor(number(item.votes)),
    states: savedStates,
    updatedAt: Number.isFinite(item.updatedAt) && item.updatedAt > 0 ? item.updatedAt : 0,
  };
}

export function inspectLibrary(storage) {
  const target = usableStorage(storage);
  if (!target) return { status: 'unavailable', items: [], raw: null };
  let raw;
  try { raw = target.getItem(LIBRARY_STORAGE_KEY); }
  catch (_) { return { status: 'unavailable', items: [], raw: null }; }
  try {
    const data = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(data) && data?.version !== undefined && data.version !== 1) return { status: 'unsupported', items: [], raw };
    const rawItems = Array.isArray(data) ? data : data?.version === 1 ? data.items : null;
    if (!Array.isArray(rawItems) || rawItems.length > MAX_LIBRARY_ITEMS) return { status: 'corrupt', items: [], raw };
    if (rawItems.some(item => !item?.states || typeof item.states !== 'object' || Array.isArray(item.states) || Object.entries(item.states).some(([section, active]) => !SECTION_KEYS.has(section) || typeof active !== 'boolean'))) {
      return { status: 'corrupt', items: [], raw };
    }
    const items = rawItems.map(normalizeLibraryItem);
    if (items.some(item => !item)) return { status: 'corrupt', items: [], raw };
    return { status: 'ok', items, raw };
  } catch (_) {
    return { status: 'corrupt', items: [], raw };
  }
}

function writeItems(items, storage) {
  const target = usableStorage(storage);
  if (!target) return false;
  try {
    target.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 1, items }));
    return true;
  } catch (_) {
    return false;
  }
}

export function readLibrary(storage) {
  return inspectLibrary(storage).items;
}

export function libraryItems(section, storage) {
  if (!SECTION_KEYS.has(section)) return [];
  return readLibrary(storage)
    .filter(item => item.states[section])
    .sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, 'ru'));
}

export function libraryState(item, section, storage) {
  if (!validMedia(item) || !SECTION_KEYS.has(section)) return false;
  const found = readLibrary(storage).find(saved => saved.type === item.type && saved.id === item.id);
  return found?.states[section] === true;
}

export function toggleLibraryState(item, section, { storage, now = Date.now() } = {}) {
  if (!validMedia(item) || !SECTION_KEYS.has(section)) return { saved: false, active: false };
  const snapshot = inspectLibrary(storage);
  if (snapshot.status !== 'ok') return { saved: false, active: false, reason: snapshot.status, message: LIBRARY_RECOVERY_MESSAGE };
  const items = snapshot.items;
  const index = items.findIndex(saved => saved.type === item.type && saved.id === item.id);
  const current = index >= 0 ? items[index] : null;
  if (!current && items.length >= MAX_LIBRARY_ITEMS) {
    return { saved: false, active: false, reason: 'limit', message: 'В «Моё» уже 500 записей. Убери все отметки у ненужной записи и попробуй снова. Существующие списки не изменены.' };
  }
  const nextStates = states(current?.states);
  nextStates[section] = !nextStates[section];
  const active = nextStates[section];
  if (!hasAnyState(nextStates)) {
    if (index >= 0) items.splice(index, 1);
  } else {
    const next = normalizeLibraryItem({ ...current, ...item, states: nextStates, updatedAt: now });
    if (!next) return { saved: false, active: false };
    if (index >= 0) items[index] = next;
    else items.unshift(next);
  }
  const saved = writeItems(items, storage);
  return { saved, active: saved ? active : current?.states[section] === true };
}
