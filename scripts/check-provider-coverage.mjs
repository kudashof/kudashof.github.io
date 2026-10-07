import { apiGet } from '../tmdb.js';

// Read-only research; do not log API URLs or credentials.
const samples = [
  ['movie', 550], ['movie', 278], ['movie', 13], ['movie', 324857],
  ['movie', 64690], ['movie', 1022789], ['movie', 751171],
  ['tv', 1396], ['tv', 1399], ['tv', 66732], ['tv', 94605],
  ['tv', 95396], ['tv', 71712], ['tv', 234763],
  ['movie', 969681], ['movie', 1423191], ['tv', 95350], ['tv', 247718],
];
let coverage = 0;
let errors = 0;
for (const [type, id] of samples) {
  try {
    const [data, providers] = await Promise.all([
      apiGet(`/${type}/${id}`, { language: 'ru-RU' }),
      apiGet(`/${type}/${id}/watch/providers`),
    ]);
    const region = providers.results?.RU;
    const groups = Object.fromEntries(['flatrate', 'rent', 'buy'].map(group => [group, (region?.[group] || []).map(item => item.provider_name)]));
    const covered = Object.values(groups).some(items => items.length);
    if (covered) coverage++;
    console.log(JSON.stringify({ type, id, title: data.title || data.name, date: data.release_date || data.first_air_date, covered, groups, otherGroups: Object.keys(region || {}).filter(group => !['link', 'flatrate', 'rent', 'buy'].includes(group)) }));
  } catch (error) {
    errors++;
    console.log(JSON.stringify({ type, id, error: error.message }));
  }
}
console.log(JSON.stringify({ region: 'RU', covered: coverage, sampleSize: samples.length, errors, warning: 'Nonempty source data does not prove actual availability.' }));
if (errors) process.exitCode = 1;
