import { test } from 'node:test';
import assert from 'node:assert/strict';

const { highlightXml } = await import('../src/web/js/highlight.js');

test('태그명과 속성을 span 으로 감싼다', () => {
  const out = highlightXml('<w2:inputBox id="ipb1" class="w2input_essential"/>');
  assert.match(out, /<span class="x-t">w2:inputBox<\/span>/);
  assert.match(out, /<span class="x-a">id<\/span>=<span class="x-s">"ipb1"<\/span>/);
});

test('주석은 x-c 로 감싼다', () => {
  const out = highlightXml('<!-- 스캐폴딩 mock -->\n<w2:trigger value="조회"/>');
  assert.match(out, /<span class="x-c">&lt;!-- 스캐폴딩 mock --&gt;<\/span>/);
});

test('원본 꺾쇠는 이스케이프된다 (주입 방지)', () => {
  const out = highlightXml('<a>&<b>x</b></a>');
  // 실제 태그로 해석되는 <script> 등은 태그명 span 안으로 들어가더라도
  // 결과에 살아있는 <script>/<b> 요소가 없어야 한다.
  assert.ok(!/<(script|b|a)>/.test(out));
  assert.match(out, /&amp;/);
});

test('닫는 태그도 처리', () => {
  const out = highlightXml('</w2:gridView>');
  assert.match(out, /&lt;\/<span class="x-t">w2:gridView<\/span>&gt;/);
});

test('빈 입력에도 안전', () => {
  assert.equal(highlightXml(''), '');
  assert.equal(highlightXml(null), '');
});
