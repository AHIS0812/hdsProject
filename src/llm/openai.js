// [담당 1] OpenAI provider (대안) — 개발지시서 §9
// TODO(A-2): openai SDK 연동. 지금은 미구현 stub. provider A/B 비교(A-11)용.

const NOT_IMPL = 'OpenAI provider 미구현 — 담당 1(A-2)에서 구현.';

export function createOpenAIProvider({ model } = {}) {
  return {
    name: 'openai',
    model: model || 'gpt-4o',
    async generateStructured() {
      throw new Error(NOT_IMPL);
    },
    async generateText() {
      throw new Error(NOT_IMPL);
    },
  };
}
