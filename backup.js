import { LIBRARY_STORAGE_KEY, normalizeLibraryItem } from './library.js?v=20261007package4';

export const BACKUP_FORMAT = 'moviedb-library';
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export const MAX_LIBRARY_ITEMS = 500;
const FIELDS = new Set(['id', 'type', 'title', 'year', 'poster', 'posterLarge', 'genreLabels', 'rating', 'votes', 'states', 'updatedAt']);
const key = item => `${item.type}:${item.id}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(message) { throw new Error(message); }

function storageTarget(storage) {
  try {
    const target = storage || globalThis.localStorage;
    if (typeof target?.getItem !== 'function' || typeof target?.setItem !== 'function') throw new Error('unavailable');
    return target;
  } catch (_) { fail('Хранилище браузера недоступно. Списки не изменены.'); }
}

function boundedShape(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 15000 || (value && typeof value === 'object' && depth > 3)) fail('Слишком сложная структура файла.');
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) boundedShape(child, depth + 1, budget);
  }
}

function validRecord(item) {
  if (!object(item) || Object.keys(item).some(field => !FIELDS.has(field))) return null;
  if (!object(item.states) || Object.keys(item.states).some(field => !['later', 'favorites', 'watched'].includes(field))) return null;
  if (Object.values(item.states).some(value => typeof value !== 'boolean')) return null;
  if (typeof item.title !== 'string' || item.title.length > 240) return null;
  if (item.year !== undefined && (typeof item.year !== 'string' || !/^(\d{4})?$/.test(item.year))) return null;
  for (const field of ['poster', 'posterLarge']) {
    if (item[field] != null && (typeof item[field] !== 'string' || (item[field] && !/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(item[field])))) return null;
  }
  if (item.genreLabels !== undefined && (!Array.isArray(item.genreLabels) || item.genreLabels.length > 3 || item.genreLabels.some(value => typeof value !== 'string' || value.length > 80))) return null;
  for (const field of ['rating', 'votes', 'updatedAt']) {
    if (item[field] !== undefined && (!Number.isFinite(item[field]) || item[field] < 0)) return null;
  }
  if (item.rating > 10 || (item.votes !== undefined && !Number.isSafeInteger(item.votes)) || !Number.isSafeInteger(item.id)) return null;
  return normalizeLibraryItem(item);
}

function combine(left, right) {
  const latest = right.updatedAt > left.updatedAt ? right : left;
  return { ...latest, states: Object.fromEntries(['later', 'favorites', 'watched'].map(section => [section, left.states[section] || right.states[section]])) };
}

function dedupe(items) {
  const unique = new Map();
  for (const item of items) unique.set(key(item), unique.has(key(item)) ? combine(unique.get(key(item)), item) : item);
  return [...unique.values()];
}

export function createBackup(items, now = new Date()) {
  const normalized = dedupe(items.map(normalizeLibraryItem).filter(Boolean));
  if (normalized.length > MAX_LIBRARY_ITEMS) fail('В копии не может быть больше 500 записей.');
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now.toISOString(), items: normalized };
}

export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) fail('Файл слишком большой. Максимум — 2 МБ.');
  let data;
  try { data = JSON.parse(text); } catch (_) { fail('Не удалось прочитать JSON. Выбери резервную копию MovieDB.'); }
  boundedShape(data);
  if (!object(data) || Object.keys(data).some(field => !['format', 'version', 'exportedAt', 'items'].includes(field)) || data.format !== BACKUP_FORMAT) fail('Это не резервная копия MovieDB.');
  // Version 1 is the first portable format. Unknown versions are never guessed.
  if (data.version !== 1) fail('Версия резервной копии не поддерживается.');
  if (typeof data.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(data.exportedAt) || !Number.isFinite(Date.parse(data.exportedAt))) fail('В копии отсутствует корректная дата.');
  if (!Array.isArray(data.items) || data.items.length > MAX_LIBRARY_ITEMS) fail('В копии должен быть список не более 500 записей.');
  const valid = data.items.map(validRecord).filter(Boolean);
  const items = dedupe(valid);
  return { items, valid: valid.length, skipped: data.items.length - valid.length, duplicates: valid.length - items.length, exportedAt: data.exportedAt };
}

function currentLibrary(storage) {
  let raw;
  try { raw = storage.getItem(LIBRARY_STORAGE_KEY); } catch (_) { fail('Хранилище браузера недоступно. Списки не изменены.'); }
  let data;
  try { data = JSON.parse(raw || '[]'); } catch (_) { fail('Текущий список повреждён. Импорт остановлен, данные не изменены.'); }
  const items = Array.isArray(data) ? data : data?.version === 1 ? data.items : null;
  if (!Array.isArray(items) || items.length > MAX_LIBRARY_ITEMS) fail('Текущий список не распознан. Данные не изменены.');
  const normalized = items.map(normalizeLibraryItem);
  if (normalized.some(item => !item)) fail('Текущий список содержит повреждённые записи. Данные не изменены.');
  return { raw, items: dedupe(normalized) };
}

export function previewImport(backup, mode = 'merge', storage) {
  if (!['merge', 'replace'].includes(mode)) fail('Выбери объединение или замену.');
  storage = storageTarget(storage);
  const before = currentLibrary(storage);
  const currentKeys = new Set(before.items.map(key));
  const conflicts = backup.items.filter(item => currentKeys.has(key(item))).length;
  const items = backup.items.length === 0 ? before.items : mode === 'merge' ? dedupe([...before.items, ...backup.items]) : backup.items;
  if (items.length > MAX_LIBRARY_ITEMS) fail('После объединения получится больше 500 записей. Списки не изменены.');
  return { mode, items, before: before.items, rawBefore: before.raw, imported: backup.items.length, conflicts };
}

export function commitImport(plan, storage) {
  storage = storageTarget(storage);
  const before = currentLibrary(storage);
  if (before.raw !== plan.rawBefore) fail('Список изменился после предпросмотра. Выбери файл ещё раз.');
  if (!plan.imported) return false;
  // A single storage write: validation and conflict handling have already finished.
  try { storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 1, items: plan.items })); }
  catch (_) { fail('Не удалось сохранить: хранилище недоступно или заполнено. Списки не изменены.'); }
  return true;
}
