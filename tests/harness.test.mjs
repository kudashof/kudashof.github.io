import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHarness } from '../scripts/check-harness.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('product harness manifest and feature briefs stay consistent', () => {
  assert.deepEqual(validateHarness(rootDir), []);
});

test('research approval cannot be recorded as implemented and accepted UI', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moviedb-harness-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const source = path.join(rootDir, 'docs/harness');
  const target = path.join(fixtureRoot, 'docs/harness');
  fs.cpSync(source, target, { recursive: true });
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const providers = manifest.features.find(feature => feature.id === 'PROVIDERS-001');
  providers.implementation = 'done';
  providers.delivery = 'public_verified';
  providers.acceptance = 'passed';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  assert.match(validateHarness(fixtureRoot).join('\n'), /код нельзя считать начатым без решения о реализации/);
});
