import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_PRIORITIES = new Set(['now', 'later', 'research', 'exclude']);
const REQUIRED_HEADINGS = [
  '## Решение',
  '## Пользовательская проблема',
  '## Гипотеза',
  '## Scope',
  '## Не входит',
  '## UX-сценарий',
  '## Данные и ограничения',
  '## Состояния',
  '## Критерии готовности',
  '## Проверки',
  '## Риски и откат',
  '## Решение Алексея',
];

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: ${error.message}`);
    return null;
  }
}

function markdownValue(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown.match(new RegExp('^' + escaped + ': `([^`]+)`$', 'm'))?.[1] || '';
}

function validateDependencies(features, errors) {
  const byId = new Map(features.map(feature => [feature.id, feature]));

  for (const feature of features) {
    if (!Array.isArray(feature.dependsOn)) {
      errors.push(`${feature.id}: dependsOn должен быть массивом`);
      continue;
    }
    for (const dependency of feature.dependsOn) {
      if (dependency === feature.id) errors.push(`${feature.id}: инициатива не может зависеть сама от себя`);
      else if (!byId.has(dependency)) errors.push(`${feature.id}: неизвестная зависимость ${dependency}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, chain = []) {
    if (visiting.has(id)) {
      errors.push(`Циклическая зависимость: ${[...chain, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const feature = byId.get(id);
    for (const dependency of feature?.dependsOn || []) {
      if (byId.has(dependency)) visit(dependency, [...chain, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
}

export function validateHarness(rootDir = process.cwd()) {
  const errors = [];
  const manifestPath = path.join(rootDir, 'docs/harness/manifest.json');
  const manifest = readJson(manifestPath, errors);
  if (!manifest) return errors;

  if (manifest.schemaVersion !== 1) errors.push('manifest.json: поддерживается только schemaVersion 1');
  if (!manifest.project?.trim()) errors.push('manifest.json: отсутствует project');
  if (!manifest.productGoal?.trim()) errors.push('manifest.json: отсутствует productGoal');
  if (!Array.isArray(manifest.constraints) || manifest.constraints.length === 0) {
    errors.push('manifest.json: constraints должен быть непустым массивом');
  }

  const statuses = new Set(manifest.allowedStatuses || []);
  if (statuses.size === 0) errors.push('manifest.json: allowedStatuses должен быть непустым массивом');
  const features = Array.isArray(manifest.features) ? manifest.features : [];
  if (features.length === 0) errors.push('manifest.json: features должен быть непустым массивом');

  const ids = new Set();
  const briefs = new Set();
  for (const feature of features) {
    const prefix = feature.id || '<без ID>';
    if (!/^[A-Z][A-Z0-9-]*-\d{3}$/.test(feature.id || '')) errors.push(`${prefix}: неверный формат ID`);
    if (ids.has(feature.id)) errors.push(`${prefix}: повторяющийся ID`);
    ids.add(feature.id);
    if (!feature.title?.trim()) errors.push(`${prefix}: отсутствует title`);
    if (!ALLOWED_PRIORITIES.has(feature.priority)) errors.push(`${prefix}: неизвестный priority ${feature.priority}`);
    if (!statuses.has(feature.status)) errors.push(`${prefix}: неизвестный status ${feature.status}`);
    if (!['required', 'approved', 'rejected'].includes(feature.decision)) {
      errors.push(`${prefix}: decision должен быть required, approved или rejected`);
    }
    if (['approved', 'in_progress', 'verified', 'released'].includes(feature.status) && feature.decision !== 'approved') {
      errors.push(`${prefix}: статус ${feature.status} требует decision=approved`);
    }
    if (feature.status === 'rejected' && feature.decision !== 'rejected') {
      errors.push(`${prefix}: статус rejected требует decision=rejected`);
    }

    if (typeof feature.brief !== 'string' || !feature.brief.startsWith('docs/harness/features/')) {
      errors.push(`${prefix}: brief должен находиться в docs/harness/features/`);
      continue;
    }
    if (briefs.has(feature.brief)) errors.push(`${prefix}: brief уже назначен другой инициативе`);
    briefs.add(feature.brief);
    const briefPath = path.resolve(rootDir, feature.brief);
    if (!briefPath.startsWith(path.resolve(rootDir, 'docs/harness/features') + path.sep)) {
      errors.push(`${prefix}: brief выходит за каталог features`);
      continue;
    }
    if (!fs.existsSync(briefPath)) {
      errors.push(`${prefix}: не найден ${feature.brief}`);
      continue;
    }
    const markdown = fs.readFileSync(briefPath, 'utf8');
    if (!markdown.startsWith(`# ${feature.id} `)) errors.push(`${prefix}: заголовок brief должен начинаться с ID`);
    for (const heading of REQUIRED_HEADINGS) {
      if (!markdown.includes(`\n${heading}\n`)) errors.push(`${prefix}: отсутствует раздел «${heading.slice(3)}»`);
    }
    const documentStatus = markdownValue(markdown, 'Статус');
    const documentPriority = markdownValue(markdown, 'Приоритет');
    if (documentStatus !== feature.status) {
      errors.push(`${prefix}: статус brief (${documentStatus || 'не задан'}) не совпадает с manifest (${feature.status})`);
    }
    if (documentPriority !== feature.priority) {
      errors.push(`${prefix}: приоритет brief (${documentPriority || 'не задан'}) не совпадает с manifest (${feature.priority})`);
    }
    if (!markdown.includes(`Статус решения: \`${feature.decision}\``)) {
      errors.push(`${prefix}: решение в brief не совпадает с manifest (${feature.decision})`);
    }
  }

  validateDependencies(features, errors);
  return errors;
}

function run() {
  const errors = validateHarness(process.cwd());
  if (errors.length) {
    console.error('Харнес содержит ошибки:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Харнес проверен: manifest, спецификации и зависимости согласованы.');
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) run();
