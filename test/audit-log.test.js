import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { writeAuditLog, runDirName } from '../src/server/audit-log.js';

const tmpRoot = () => mkdtempSync(path.join(os.tmpdir(), 'hds-audit-'));
const runsOf = (dir) => readdirSync(dir);

test('runDirName — 같은 시각이어도 랜덤 접미사 때문에 서로 다르다', () => {
  const now = new Date('2026-09-28T01:02:03.456Z');
  const a = runDirName(now);
  const b = runDirName(now);
  assert.notEqual(a, b);
  assert.match(a, /^2026-09-28T01-02-03-456Z-[0-9a-f]{6}$/);
});

test('writeAuditLog — 성공 결과는 payload·screen.xml·preview.html·report.json 4개를 남긴다', async () => {
  const runsDir = tmpRoot();
  const payload = { screenName: '조회', shapes: [] };
  const result = {
    status: 'ok',
    code: { websquareXml: '<w2:group id="screenRoot"/>' },
    preview: { html: '<!DOCTYPE html><html></html>' },
    report: { converter: 'deterministic', elapsedMs: 3 },
  };
  await writeAuditLog({ payload, result }, { runsDir });

  const [dir] = runsOf(runsDir);
  const full = path.join(runsDir, dir);
  assert.deepEqual(JSON.parse(readFileSync(path.join(full, 'payload.json'), 'utf8')), payload);
  assert.equal(readFileSync(path.join(full, 'screen.xml'), 'utf8'), result.code.websquareXml);
  assert.equal(readFileSync(path.join(full, 'preview.html'), 'utf8'), result.preview.html);
  assert.deepEqual(JSON.parse(readFileSync(path.join(full, 'report.json'), 'utf8')), result.report);

  rmSync(runsDir, { recursive: true, force: true });
});

test('writeAuditLog — 에러 결과는 payload·report.json 만 남기고 screen.xml·preview.html 은 안 만든다', async () => {
  const runsDir = tmpRoot();
  const payload = { shapes: 'not-an-array' };
  const result = { status: 'error', error: { message: '스키마 위반', details: ['/shapes must be array'] } };
  await writeAuditLog({ payload, result }, { runsDir });

  const [dir] = runsOf(runsDir);
  const files = runsOf(path.join(runsDir, dir));
  assert.deepEqual([...files].sort(), ['payload.json', 'report.json']);
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(runsDir, dir, 'report.json'), 'utf8')),
    result.error,
  );

  rmSync(runsDir, { recursive: true, force: true });
});

test('writeAuditLog — 요청 두 건은 서로 다른 디렉토리에 남는다(덮어쓰지 않는다)', async () => {
  const runsDir = tmpRoot();
  const result = { status: 'ok', code: { websquareXml: '<a/>' }, preview: { html: '<b/>' }, report: {} };
  await writeAuditLog({ payload: { screenName: '첫번째' }, result }, { runsDir });
  await writeAuditLog({ payload: { screenName: '두번째' }, result }, { runsDir });

  const dirs = runsOf(runsDir);
  assert.equal(dirs.length, 2);

  rmSync(runsDir, { recursive: true, force: true });
});

test('writeAuditLog — 디스크에 못 쓰는 상황이어도 예외를 던지지 않는다(감사 로그는 best-effort)', async () => {
  // runsDir 자리에 이미 "파일"이 있으면 mkdir(recursive) 가 그 경로를 디렉토리로 만들지 못하고 reject 한다.
  const parent = tmpRoot();
  const blocked = path.join(parent, 'blocked');
  writeFileSync(blocked, 'i am a file, not a directory');

  await assert.doesNotReject(
    writeAuditLog(
      { payload: {}, result: { status: 'ok', code: { websquareXml: '' }, preview: { html: '' }, report: {} } },
      { runsDir: blocked },
    ),
  );

  rmSync(parent, { recursive: true, force: true });
});

test('writeAuditLog — 응답을 먼저 보내고 fire-and-forget 으로 부르는 걸 전제로 Promise 를 반환한다', () => {
  const runsDir = tmpRoot();
  const result = { status: 'ok', code: { websquareXml: '<a/>' }, preview: { html: '<b/>' }, report: {} };
  const p = writeAuditLog({ payload: {}, result }, { runsDir });
  assert.ok(p instanceof Promise, 'writeAuditLog 는 await 없이 호출해도 되는 Promise 를 반환해야 한다');
  return p.then(() => rmSync(runsDir, { recursive: true, force: true }));
});
