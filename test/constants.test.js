import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPS, DEF, NAME, HAS_ITEMS,
  DEFAULT_BOARD, BOARD_SIZES, boardSizeFor,
  defaultLabel, defaultCols,
} from '../src/web/js/constants.js';
import { TEMPLATE_KEYS } from '../src/web/js/templates.js';

const TYPES = COMPS.map((c) => c.t);

test('COMPS 요소 타입에 중복이 없다', () => {
  assert.equal(new Set(TYPES).size, TYPES.length);
});

test('모든 요소 타입에 NAME 표시명이 있다', () => {
  for (const t of TYPES) assert.equal(typeof NAME[t], 'string', `NAME[${t}] 없음`);
});

test('모든 요소 타입에 DEF 기본 크기 [w,h] 가 있다', () => {
  for (const t of TYPES) {
    assert.ok(Array.isArray(DEF[t]) && DEF[t].length === 2, `DEF[${t}] 형식 오류`);
    assert.ok(DEF[t][0] > 0 && DEF[t][1] > 0, `DEF[${t}] 크기 오류`);
  }
});

test('HAS_ITEMS 는 list / select 만', () => {
  assert.deepEqual(Object.keys(HAS_ITEMS).sort(), ['list', 'select']);
});

test('BOARD_SIZES 가 blank 을 제외한 모든 템플릿 키를 덮는다', () => {
  for (const k of TEMPLATE_KEYS) {
    if (k === 'blank') continue;
    const s = BOARD_SIZES[k];
    assert.ok(s && s.w > 0 && s.h > 0, `BOARD_SIZES[${k}] 없음`);
  }
});

test('boardSizeFor: 알려진 키 / 미지의 키', () => {
  assert.deepEqual(boardSizeFor('main'), { w: 1280, h: 720 });
  assert.deepEqual(boardSizeFor('popup'), { w: 560, h: 420 });
  assert.deepEqual(boardSizeFor('list'), DEFAULT_BOARD);
  assert.deepEqual(boardSizeFor('없는키'), DEFAULT_BOARD);
});

test('defaultLabel / defaultCols 는 모든 타입에서 문자열을 돌려준다', () => {
  for (const t of TYPES) {
    assert.equal(typeof defaultLabel(t), 'string');
    assert.equal(typeof defaultCols(t), 'string');
  }
  assert.ok(defaultCols('list').includes(','));
});
