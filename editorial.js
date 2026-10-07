// Original editorial copy approved by Alexey on 2026-10-07.
export const EDITORIAL_COLLECTIONS = [{
  slug: 'one-evening',
  title: 'Фильм на один вечер — без обязательного продолжения',
  shortTitle: 'На один вечер',
  promise: 'Восемь самостоятельных историй: не нужно знать предысторию или планировать следующий сезон. Настроения разные — выбери то, которое подходит сегодня.',
  updated: '2026-10-07',
  owner: 'Ответственный за содержание — Алексей',
  reviewDue: '2026-11-07',
  status: 'approved',
  enabled: true,
  items: [
    { type: 'movie', id: 194, reason: 'Когда хочется немного тепла и странностей: история о маленьких поступках, которые меняют чужую жизнь. Для вечера без спешки.' },
    { type: 'movie', id: 773, reason: 'Если день пошёл не по плану: семейная поездка, где неловкость и поддержка существуют рядом. Смешно, но не без горечи.' },
    { type: 'movie', id: 212778, reason: 'Когда хочется выдохнуть: еда, дорога и попытка начать заново. Лучше смотреть не на голодный желудок.' },
    { type: 'movie', id: 116745, reason: 'Для вечера, когда всё стало слишком привычным: тихий человек делает шаг из фантазий в настоящую жизнь. Много простора и движения.' },
    { type: 'movie', id: 37165, reason: 'Если хочется обсудить увиденное после титров: знакомый мир постепенно перестаёт казаться надёжным. Лёгкая подача оставляет серьёзный вопрос о свободе.' },
    { type: 'movie', id: 137, reason: 'Когда дни похожи друг на друга: комедия о повторении, привычках и возможности измениться. Подходит для смешливого, но не совсем бездумного вечера.' },
    { type: 'movie', id: 329865, reason: 'Если есть силы на внимательный просмотр: фантастика, в которой важнее понять другого, чем победить. Спокойный темп, сильные эмоции и повод помолчать после финала.' },
    { type: 'movie', id: 77338, reason: 'Когда хочется человеческого контакта: дружба людей с очень разным опытом. Юмор и тяжёлые обстоятельства здесь не отменяют друг друга.' },
  ],
}];

export function validateCollections(collections) {
  if (!Array.isArray(collections)) throw new Error('Invalid editorial index');
  const slugs = new Set();
  for (const collection of collections) {
    if (!/^[a-z][a-z0-9-]{1,60}$/.test(collection.slug || '') || slugs.has(collection.slug)) throw new Error('Invalid or duplicate editorial slug');
    slugs.add(collection.slug);
    for (const field of ['title', 'shortTitle', 'promise', 'owner']) {
      if (typeof collection[field] !== 'string' || !collection[field].trim() || collection[field].length > 500) throw new Error('Invalid editorial text');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(collection.updated || '') || !['draft', 'approved'].includes(collection.status) || typeof collection.enabled !== 'boolean') throw new Error('Invalid editorial metadata');
    if (collection.status === 'approved' && !/^\d{4}-\d{2}-\d{2}$/.test(collection.reviewDue || '')) throw new Error('Approved editorial content needs a review date');
    if (!Array.isArray(collection.items) || collection.items.length < 8 || collection.items.length > 12) throw new Error('Editorial collections require 8–12 items');
    const ids = new Set();
    for (const item of collection.items) {
      const key = `${item.type}:${item.id}`;
      if (!['movie', 'tv'].includes(item.type) || !Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(key) || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 500) throw new Error('Invalid editorial entry');
      ids.add(key);
    }
  }
  return collections;
}

validateCollections(EDITORIAL_COLLECTIONS);
export function editorialCollection(slug) {
  return EDITORIAL_COLLECTIONS.find(collection => collection.enabled && collection.slug === slug) || null;
}

// An independent small fetcher: a missing ID cannot erase the remaining cards.
export async function fetchEditorial(collection, { getMedia, signal }) {
  const results = await Promise.all(collection.items.map(async entry => {
    try {
      const item = await getMedia(entry.type, entry.id, { signal });
      if (!item || item.type !== entry.type || item.id !== entry.id) return null;
      return { ...item, reason: entry.reason };
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  }));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const items = results.filter(Boolean);
  return { items, missing: results.length - items.length, page: 1, totalPages: 1, totalResults: items.length };
}
