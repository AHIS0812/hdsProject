import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItemSpec, pageRows, toCsv, COLUMNS } from '../src/web/js/item-spec.js';

const page = {
  screenName: '계약 조회',
  shapes: [
    { id: 's1', type: 'area', x: 20, y: 20, w: 900, h: 120, label: '조회 영역' },
    { id: 's2', type: 'label', x: 40, y: 40, w: 80, h: 16, label: '계약번호', required: true },
    { id: 's3', type: 'input', x: 130, y: 38, w: 160, h: 20, desc: '13자리 숫자만 입력', required: true },
    { id: 's4', type: 'select', x: 320, y: 38, w: 140, h: 20, items: '전체,진행중,완료' },
    { id: 's5', type: 'button', x: 820, y: 38, w: 80, h: 20, label: '조회', linksTo: ['s6'] },
    { id: 's6', type: 'list', x: 20, y: 180, w: 900, h: 300, label: '결과 그리드', items: '순번,계약번호,상태' },
    { id: 's7', type: 'divider', x: 20, y: 500, w: 900, h: 4 },
  ],
};

test('pageRows — 읽기 순서로 번호를 매기고 묶음(area)은 영역 이름으로 들어간다', () => {
  const rows = pageRows(page);
  assert.deepEqual(rows.map((r) => r.No), [1, 2, 3, 4, 5]); // 구분선·묶음 제외
  assert.deepEqual(rows.map((r) => r.항목명), ['계약번호', '입력칸', '전체', '조회', '결과 그리드']);
  assert.equal(rows[0].영역, '조회 영역');
  assert.equal(rows[0].필수, '필수');
  assert.equal(rows[4].영역, ''); // 그리드는 묶음 밖
  assert.equal(rows.every((r) => r.화면 === '계약 조회'), true);
});

test('pageRows — 문구가 없으면 선택지 첫 항목, 그것도 없으면 유형 이름으로 채운다', () => {
  const rows = pageRows(page);
  const sel = rows.find((r) => r.유형 === '선택');
  assert.equal(sel.항목명, '전체');
  assert.equal(sel['선택 항목'], '전체,진행중,완료');
  const input = rows.find((r) => r.유형 === '입력칸');
  assert.equal(input.항목명, '입력칸');
  assert.equal(input.설명, '13자리 숫자만 입력');
  assert.equal(input.필수, '필수');
});

test('pageRows — 연결(linksTo)은 대상 항목 이름으로 적힌다', () => {
  const btn = pageRows(page).find((r) => r.유형 === '버튼');
  assert.equal(btn.연결, '결과 그리드');
});

test('buildItemSpec — 화면마다 번호를 1번부터 다시 센다', () => {
  const rows = buildItemSpec([page, { screenName: '상세', shapes: [{ id: 'a', type: 'input', x: 0, y: 0, w: 10, h: 10, label: '이름' }] }]);
  assert.equal(rows.at(-1).화면, '상세');
  assert.equal(rows.at(-1).No, 1);
  assert.equal(rows.filter((r) => r.화면 === '계약 조회').length, 5);
});

test('buildItemSpec — 잘못된 입력에도 빈 목록', () => {
  assert.deepEqual(buildItemSpec(null), []);
  assert.deepEqual(buildItemSpec([{}]), []);
});

test('toCsv — 헤더·BOM·CRLF, 쉼표와 따옴표가 든 값은 감싼다', () => {
  const csv = toCsv([{ 화면: '조회, 목록', No: 1, 항목명: '상태"값"', 유형: '선택', 필수: '', '선택 항목': 'A,B', 설명: '줄\n바꿈', 영역: '', 연결: '' }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '﻿' + COLUMNS.join(',')); // 엑셀이 한글을 읽도록 BOM 이 앞에 붙는다
  assert.ok(lines[1].includes('"조회, 목록"'));
  assert.ok(lines[1].includes('"상태""값"""'));
  assert.ok(lines[1].includes('"A,B"'));
  assert.ok(csv.endsWith('\r\n'));
});
