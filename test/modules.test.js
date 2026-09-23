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

test('projects / systems / dialog / thumbnail / home-logic 모듈도 Node 에서 부작용 없이 import 된다', async () => {
  const projects = await import('../src/web/js/projects.js');
  const systems = await import('../src/web/js/systems.js');
  const dialog = await import('../src/web/js/dialog.js');
  const thumb = await import('../src/web/js/thumbnail.js');
  const logic = await import('../src/web/js/home-logic.js');
  assert.equal(typeof projects.createProjectStore, 'function');
  assert.equal(typeof projects.browserStorage, 'function');
  assert.equal(typeof systems.createSystemStore, 'function');
  assert.equal(typeof systems.isLocked, 'function');
  assert.equal(typeof dialog.showDialog, 'function');
  assert.equal(typeof thumb.thumbnailSvg, 'function');
  assert.equal(typeof logic.filterProjects, 'function');
});

test('버전 기록 모듈(doc-model / versions / version-panel)도 부작용 없이 import 된다', async () => {
  const dm = await import('../src/web/js/doc-model.js');
  const vs = await import('../src/web/js/versions.js');
  const vp = await import('../src/web/js/version-panel.js');
  const th = await import('../src/web/js/thumbnail.js');
  assert.equal(typeof dm.docPages, 'function');
  assert.equal(typeof vs.createVersionStore, 'function');
  assert.equal(typeof vp.openVersionPanel, 'function');
  assert.equal(th.cachedBgThumb('not-an-image'), null);
});

test('browserStorage — localStorage 가 없는 환경(Node)에서는 메모리 저장소로 동작한다', async () => {
  const { browserStorage } = await import('../src/web/js/projects.js');
  const s = browserStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  s.removeItem('k');
  assert.equal(s.getItem('k'), null);
});

test('editor.resetHistory 는 초기화 전에 호출해도 안전하다', async () => {
  const editor = await import('../src/web/js/editor.js');
  assert.doesNotThrow(() => editor.resetHistory());
});

test('editor.getBoardSize 기본값은 900×600(DEFAULT_BOARD)', async () => {
  const editor = await import('../src/web/js/editor.js');
  assert.deepEqual(editor.getBoardSize(), { w: 900, h: 600 });
});
