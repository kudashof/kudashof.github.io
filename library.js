export const LIBRARY_STORAGE_KEY = 'movie-db-library-v1';

export const LIBRARY_SECTIONS = Object.freeze({
  later: { label: 'Посмотреть позже', activeLabel: 'В списке «Посмотреть позже»' },
  favorites: { label: 'Избранное', activeLabel: 'В избранном' },
  watched: { label: 'Просмотрено', activeLabel: 'Отмечено просмотренным' },
});

const SECTION_KEYS = new Set(Object.keys(LIBRARY_SECTIONS));
const MAX_ITEMS = 500;

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
  return typeof value === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\//.test(value) ? value : '';
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

function readItems(storage) {
  const target = usableStorage(storage);
  if (!target) return [];
  try {
    const data = JSON.parse(target.getItem(LIBRARY_STORAGE_KEY) || '[]');
    const rawItems = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(rawItems)) return [];
    return rawItems.map(normalizeLibraryItem).filter(Boolean).slice(0, MAX_ITEMS);
  } catch (_) {
    return [];
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
  return readItems(storage);
}

export function libraryItems(section, storage) {
  if (!SECTION_KEYS.has(section)) return [];
  return readItems(storage)
    .filter(item => item.states[section])
    .sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, 'ru'));
}

export function libraryState(item, section, storage) {
  if (!validMedia(item) || !SECTION_KEYS.has(section)) return false;
  const found = readItems(storage).find(saved => saved.type === item.type && saved.id === item.id);
  return found?.states[section] === true;
}

export function toggleLibraryState(item, section, { storage, now = Date.now() } = {}) {
  if (!validMedia(item) || !SECTION_KEYS.has(section)) return { saved: false, active: false };
  const items = readItems(storage);
  const index = items.findIndex(saved => saved.type === item.type && saved.id === item.id);
  const current = index >= 0 ? items[index] : null;
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
  return { saved: writeItems(items.slice(0, MAX_ITEMS), storage), active };
}
