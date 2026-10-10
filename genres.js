// A failed request is retryable; a successfully empty response is cached.
export function createGenreCache(load, onChange = () => {}) {
  const entries = new Map(['movie', 'tv'].map(type => [type, { status: 'unloaded', genres: null, pending: null }]));
  const get = type => entries.get(type);
  function ensure(type) {
    const entry = get(type);
    if (entry.status === 'loaded') return Promise.resolve(entry.genres);
    if (entry.pending) return entry.pending;
    entry.status = 'loading';
    entry.pending = Promise.resolve().then(() => load(type)).then(genres => {
      entry.genres = genres;
      entry.status = 'loaded';
      return genres;
    }, () => {
      entry.status = 'error';
      return null;
    }).finally(() => {
      entry.pending = null;
      onChange(type, entry);
    });
    onChange(type, entry);
    return entry.pending;
  }
  return { get, ensure };
}
