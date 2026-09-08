// [담당 1] Claude provider (기본) — 개발지시서 §9
// TODO(A-2): @anthropic-ai/sdk 연동. 지금은 미구현 stub.

const NOT_IMPL = 'Claude provider 미구현 — 담당 1(A-2)에서 구현. 지금은 USE_DETERMINISTIC_ONLY=true 로 우회.';

export function createClaudeProvider({ model } = {}) {
  return {
    name: 'claude',
    model: model || 'claude-sonnet-5',
    async generateStructured() {
      throw new Error(NOT_IMPL);
    },
    async generateText() {
      throw new Error(NOT_IMPL);
    },
  };
}
