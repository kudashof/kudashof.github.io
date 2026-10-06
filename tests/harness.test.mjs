import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHarness } from '../scripts/check-harness.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('product harness manifest and feature briefs stay consistent', () => {
  assert.deepEqual(validateHarness(rootDir), []);
});
