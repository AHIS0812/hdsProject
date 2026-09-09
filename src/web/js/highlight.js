// 아주 가벼운 XML/WebSquare 구문 강조. DOM 비의존 (테스트 가능).
// 결과는 이미 이스케이프된 HTML 문자열이라 innerHTML 에 안전하게 넣을 수 있다.

const escape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {string} src  원본 XML 텍스트
 * @returns {string} <span class="x-*"> 로 감싼 이스케이프된 HTML
 */
export function highlightXml(src) {
  if (src == null) return '';
  const tokens = String(src).match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || [];
  return tokens
    .map((tok) => {
      if (tok.startsWith('<!--')) return `<span class="x-c">${escape(tok)}</span>`;
      if (tok.startsWith('<')) {
        let s = escape(tok);
        // 속성: name="value"  (태그명 span 을 넣기 전에 먼저 처리)
        s = s.replace(
          /([\w:.-]+)(=)("[^"]*")/g,
          '<span class="x-a">$1</span>$2<span class="x-s">$3</span>',
        );
        // 태그명: <prefix:name  또는  </name
        s = s.replace(/^(&lt;\/?)([\w:.-]+)/, '$1<span class="x-t">$2</span>');
        return s;
      }
      return escape(tok);
    })
    .join('');
}
