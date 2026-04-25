import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeYaml,
  normalizePath,
  sanitizeTitleForFilename,
  stripMdExtension
} from '../src/shared.mjs';

test('normalizePath removes empty parts and trims spaces', () => {
  assert.equal(normalizePath('  ChatGPT //  2026 / note.md '), 'ChatGPT/2026/note.md');
});

test('sanitizeTitleForFilename strips invalid filename characters', () => {
  assert.equal(sanitizeTitleForFilename('A:/B*?"<C>|'), 'A B C');
});

test('sanitizeTitleForFilename falls back when empty', () => {
  assert.equal(sanitizeTitleForFilename('   ', 'fallback-id'), 'fallback-id');
});

test('stripMdExtension removes .md only from end', () => {
  assert.equal(stripMdExtension('ChatGPT/note.md'), 'ChatGPT/note');
  assert.equal(stripMdExtension('ChatGPT/note.md.backup'), 'ChatGPT/note.md.backup');
});

test('escapeYaml always returns JSON string literal', () => {
  assert.equal(escapeYaml('hello'), '"hello"');
  assert.equal(escapeYaml(null), '""');
});
