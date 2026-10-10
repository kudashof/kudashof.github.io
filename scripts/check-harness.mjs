import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_PRIORITIES = new Set(['now', 'later', 'research', 'exclude']);
const ALLOWED_DECISIONS = new Set(['required', 'approved', 'rejected']);
const ALLOWED_DECISION_SCOPES = new Set(['none', 'research', 'implementation']);
const ALLOWED_IMPLEMENTATION = new Set(['not_started', 'in_progress', 'done']);
const ALLOWED_DELIVERY = new Set(['none', 'branch', 'pr', 'master', 'pages_built', 'public_verified']);
const ALLOWED_ACCEPTANCE = new Set(['not_applicable', 'pending', 'passed']);
const REQUIRED_DOCS = ['RESEARCH.md', 'EVIDENCE.md', 'SCENARIOS.md', 'EXPERIMENTS.md', 'CANDIDATES.md'];
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
  const harnessDir = path.join(rootDir, 'docs/harness');
  const manifestPath = path.join(harnessDir, 'manifest.json');
  const manifest = readJson(manifestPath, errors);
  if (!manifest) return errors;

  if (manifest.schemaVersion !== 2) errors.push('manifest.json: поддерживается только schemaVersion 2');
  if (!manifest.project?.trim()) errors.push('manifest.json: отсутствует project');
  if (!manifest.productGoal?.trim()) errors.push('manifest.json: отсутствует productGoal');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.updated || '')) errors.push('manifest.json: updated должен быть датой YYYY-MM-DD');
  if (!Array.isArray(manifest.constraints) || manifest.constraints.length === 0) {
    errors.push('manifest.json: constraints должен быть непустым массивом');
  }

  const documentContents = new Map();
  for (const file of REQUIRED_DOCS) {
    const documentPath = path.join(harnessDir, file);
    if (!fs.existsSync(documentPath)) errors.push(`docs/harness/${file}: документ не найден`);
    else documentContents.set(file, fs.readFileSync(documentPath, 'utf8'));
  }
  const evidence = documentContents.get('EVIDENCE.md') || '';
  const candidateIds = new Set();
  for (const match of (documentContents.get('CANDIDATES.md') || '').matchAll(/^\| (CAND-\d{3})\b/gm)) {
    if (candidateIds.has(match[1])) errors.push(`${match[1]}: повторяющийся кандидат`);
    candidateIds.add(match[1]);
  }
  if (candidateIds.size === 0) errors.push('CANDIDATES.md: отсутствуют кандидаты');
  const features = Array.isArray(manifest.features) ? manifest.features : [];
  if (features.length === 0) errors.push('manifest.json: features должен быть непустым массивом');

  const ids = new Set();
  const briefs = new Set();
  for (const feature of features) {
    const prefix = feature.id || '<без ID>';
    if (!/^[A-Z][A-Z0-9-]*-\d{3}$/.test(feature.id || '')) errors.push(`${prefix}: неверный формат ID`);
    if (ids.has(feature.id)) errors.push(`${prefix}: повторяющийся ID`);
    ids.add(feature.id);
    if (candidateIds.has(feature.id)) errors.push(`${prefix}: кандидат не может быть утверждённой инициативой без отдельного решения`);
    if (!feature.title?.trim()) errors.push(`${prefix}: отсутствует title`);
    if (!ALLOWED_PRIORITIES.has(feature.priority)) errors.push(`${prefix}: неизвестный priority ${feature.priority}`);
    if ('status' in feature) errors.push(`${prefix}: старый общий status запрещён; используйте четыре независимых состояния`);
    if (!ALLOWED_DECISIONS.has(feature.decision)) {
      errors.push(`${prefix}: decision должен быть required, approved или rejected`);
    }
    if (!ALLOWED_DECISION_SCOPES.has(feature.decisionScope)) {
      errors.push(`${prefix}: неизвестный decisionScope ${feature.decisionScope}`);
    }
    if (!ALLOWED_IMPLEMENTATION.has(feature.implementation)) {
      errors.push(`${prefix}: неизвестный implementation ${feature.implementation}`);
    }
    if (!ALLOWED_DELIVERY.has(feature.delivery)) errors.push(`${prefix}: неизвестный delivery ${feature.delivery}`);
    if (!ALLOWED_ACCEPTANCE.has(feature.acceptance)) errors.push(`${prefix}: неизвестный acceptance ${feature.acceptance}`);
    if (feature.decision === 'approved' && feature.decisionScope === 'none') errors.push(`${prefix}: approved требует объёма решения`);
    if (feature.decision !== 'approved' && feature.decisionScope !== 'none') errors.push(`${prefix}: объём решения задан без одобрения`);
    if (feature.decisionScope !== 'implementation' && feature.implementation !== 'not_started') {
      errors.push(`${prefix}: код нельзя считать начатым без решения о реализации`);
    }
    if (feature.implementation !== 'done' && ['master', 'pages_built', 'public_verified'].includes(feature.delivery)) {
      errors.push(`${prefix}: выпуск в master/Pages требует готового кода`);
    }
    if (feature.implementation === 'not_started' && feature.delivery !== 'none') errors.push(`${prefix}: код не начат, но выпуск указан`);
    if (feature.acceptance === 'passed' && feature.implementation !== 'done') {
      errors.push(`${prefix}: пройденная приёмка требует готового кода`);
    }

    const expectedEvidenceRef = `docs/harness/EVIDENCE.md#${feature.id}`;
    if (feature.evidenceRef !== expectedEvidenceRef) errors.push(`${prefix}: неверная ссылка evidenceRef`);
    if (!evidence.includes(`\n### ${feature.id}\n`)) errors.push(`${prefix}: нет раздела в EVIDENCE.md`);

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
    const documentPriority = markdownValue(markdown, 'Приоритет');
    for (const [field, label] of [
      ['decision', 'Решение'],
      ['decisionScope', 'Объём решения'],
      ['implementation', 'Реализация'],
      ['delivery', 'Выпуск'],
      ['acceptance', 'Приёмка'],
    ]) {
      const documentValue = markdownValue(markdown, label);
      if (documentValue !== feature[field]) {
        errors.push(`${prefix}: ${label} в brief (${documentValue || 'не задано'}) не совпадает с manifest (${feature[field]})`);
      }
    }
    if (markdownValue(markdown, 'Статус')) errors.push(`${prefix}: старый общий Статус в brief запрещён`);
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
  console.log('Харнес проверен: решения, реализация, выпуск, приёмка, документы и зависимости согласованы.');
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) run();
