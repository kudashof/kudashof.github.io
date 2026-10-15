const datePattern = /^(\d{4})-(\d{2})-(\d{2})/;
const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['ru'], { type: 'language' });

export function formatDate(value) {
  const match = datePattern.exec(value || '');
  if (!match) return '';
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (date.getUTCFullYear() !== +match[1] || date.getUTCMonth() !== +match[2] - 1 || date.getUTCDate() !== +match[3]) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function formatMinutes(value) {
  if (!Number.isInteger(value) || value <= 0) return '';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours} ч${minutes ? ` ${minutes} мин` : ''}` : `${minutes} мин`;
}

function localizedName(code, names) {
  if (typeof code !== 'string' || !code.trim()) return '';
  try { return names.of(code.trim().toUpperCase()) || code; } catch (_) { return code; }
}

export function releaseCertificate(data) {
  if (data?.type === 'tv') {
    const value = data.content_ratings?.results?.find(entry => entry.iso_3166_1 === 'RU' && typeof entry.rating === 'string' && entry.rating.trim());
    return value ? { value: value.rating.trim(), label: 'Возрастное ограничение, Россия' } : null;
  }
  const entries = data?.release_dates?.results?.find(entry => entry.iso_3166_1 === 'RU')?.release_dates;
  const rank = [3, 2, 4, 6, 5, 1];
  const eligible = (Array.isArray(entries) ? entries : []).filter(entry => typeof entry.certification === 'string' && entry.certification.trim());
  eligible.sort((a, b) => (rank.indexOf(a.type) < 0 ? 99 : rank.indexOf(a.type)) - (rank.indexOf(b.type) < 0 ? 99 : rank.indexOf(b.type))
    || (a.release_date || '').localeCompare(b.release_date || ''));
  return eligible[0] ? { value: eligible[0].certification.trim(), label: 'Возрастное ограничение, Россия' } : null;
}

export function detailFacts(data) {
  const facts = [];
  const certificate = releaseCertificate(data);
  if (certificate) facts.push({ label: certificate.label, value: certificate.value, kind: 'certificate' });
  const release = data?.type === 'movie' ? formatDate(data.release_date) : formatDate(data.first_air_date);
  if (release) facts.push({ label: data.type === 'tv' ? 'Первый эфир' : 'Дата выхода по TMDB', value: release });
  const countries = (Array.isArray(data?.production_countries) ? data.production_countries : [])
    .map(item => localizedName(item?.iso_3166_1, countryNames) || item?.name).filter(Boolean);
  if (countries.length) facts.push({ label: 'Страны производства', value: [...new Set(countries)].join(', ') });
  else if (data?.type === 'tv' && Array.isArray(data.origin_country) && data.origin_country.length) {
    facts.push({ label: 'Страны происхождения', value: [...new Set(data.origin_country.map(code => localizedName(code, countryNames)).filter(Boolean))].join(', ') });
  }
  const genres = (Array.isArray(data?.genres) ? data.genres : []).map(item => item?.name).filter(Boolean);
  if (genres.length) facts.push({ label: 'Жанры', value: [...new Set(genres)].join(', ') });
  if (data?.type === 'movie') {
    const duration = formatMinutes(data.runtime);
    if (duration) facts.push({ label: 'Длительность', value: duration });
  } else {
    const times = [...new Set((Array.isArray(data?.episode_run_time) ? data.episode_run_time : [])
      .filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
    if (times.length) facts.push({ label: 'Серия', value: times.length > 1 ? `${formatMinutes(times[0])}–${formatMinutes(times.at(-1))}` : formatMinutes(times[0]) });
    else if (formatMinutes(data?.last_episode_to_air?.runtime)) facts.push({ label: 'Последняя серия', value: formatMinutes(data.last_episode_to_air.runtime) });
    if (Number.isInteger(data?.number_of_seasons) && data.number_of_seasons > 0) facts.push({ label: 'Сезонов', value: String(data.number_of_seasons) });
    if (Number.isInteger(data?.number_of_episodes) && data.number_of_episodes > 0) facts.push({ label: 'Серий', value: String(data.number_of_episodes) });
  }
  return facts;
}

export function detailMore(data) {
  const more = [];
  const original = data?.type === 'movie' ? data.original_title : data.original_name;
  const shown = data?.type === 'movie' ? data.title : data.name;
  if (typeof original === 'string' && original.trim() && original.trim().toLocaleLowerCase('ru') !== String(shown || '').trim().toLocaleLowerCase('ru')) {
    more.push({ label: 'Оригинальное название', value: original.trim() });
  }
  const statuses = { Released: 'Выпущен', 'Post Production': 'Постпродакшн', 'In Production': 'В производстве', Planned: 'Планируется', Rumored: 'Не подтверждён', Canceled: 'Отменён', Ended: 'Завершён', 'Returning Series': 'Продолжается', Pilot: 'Пилот' };
  if (typeof data?.status === 'string' && data.status) more.push({ label: 'Статус', value: statuses[data.status] || data.status });
  if (data?.original_language) more.push({ label: 'Исходный язык', value: localizedName(data.original_language, languageNames) });
  if (data?.type === 'movie') {
    for (const [field, label] of [['budget', 'Бюджет'], ['revenue', 'Сборы']]) {
      const value = data[field];
      if (Number.isFinite(value) && value > 0) more.push({ label, value: `${new Intl.NumberFormat('ru-RU').format(value)} $ (USD)` });
    }
  }
  return more;
}
