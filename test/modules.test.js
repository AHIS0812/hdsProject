import { test } from 'node:test';
import assert from 'node:assert/strict';

// main.js 는 로드 시 boot() 가 DOM 을 건드리므로 여기서 제외한다.
// 나머지 모듈은 top-level 부작용이 없어야 한다(함수 안에서만 DOM 접근).

test('editor / combobox / api / result-modal 이 Node 에서 부작용 없이 import 된다', async () => {
  const editor = await import('../src/web/js/editor.js');
  const combobox = await import('../src/web/js/combobox.js');
  const api = await import('../src/web/js/api.js');
  const modal = await import('../src/web/js/result-modal.js');

  assert.equal(typeof editor.initEditor, 'function');
  assert.equal(typeof editor.setBoardSize, 'function');
  assert.equal(typeof editor.getBoardSize, 'function');
  assert.equal(typeof editor.toPayloadShapes, 'function');
  assert.equal(typeof combobox.makeCombo, 'function');
  assert.equal(typeof api.generate, 'function');
  assert.equal(typeof api.getSystems, 'function');
  assert.equal(typeof modal.runBuild, 'function');
  assert.equal(typeof modal.initResultModal, 'function');
});

test('projects / dialog 모듈도 Node 에서 부작용 없이 import 된다', async () => {
  const projects = await import('../src/web/js/projects.js');
  const dialog = await import('../src/web/js/dialog.js');
  assert.equal(typeof projects.createProjectStore, 'function');
  assert.equal(typeof dialog.showDialog, 'function');
});

test('editor.resetHistory 는 초기화 전에 호출해도 안전하다', async () => {
  const editor = await import('../src/web/js/editor.js');
  assert.doesNotThrow(() => editor.resetHistory());
});

test('editor.getBoardSize 기본값은 960×600', async () => {
  const editor = await import('../src/web/js/editor.js');
  assert.deepEqual(editor.getBoardSize(), { w: 960, h: 600 });
});
