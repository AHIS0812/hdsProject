// [담당 1] LLM Provider 추상화 — 개발지시서 §9
//
// 인터페이스:
//   generateStructured({ system, messages, images?, jsonSchema }) -> { json, usage }
//   generateText({ system, messages })                            -> { text, usage }
//
// 공통 책임: timeout, 지수 백오프 재시도, usage(토큰/비용) 로깅.
// 키는 env 에서만 읽는다 (ANTHROPIC_API_KEY / OPENAI_API_KEY).

import { createClaudeProvider } from './claude.js';
import { createOpenAIProvider } from './openai.js';

const FACTORIES = {
  claude: createClaudeProvider,
  openai: createOpenAIProvider,
};

/**
 * @param {'claude'|'openai'} name
 * @param {{ model?: string }} [opts]
 */
export function getProvider(name, opts = {}) {
  const factory = FACTORIES[name];
  if (!factory) throw new Error(`알 수 없는 LLM provider: ${name}`);
  return factory(opts);
}

/** env 기준 단계별 provider. */
export function providersFromEnv() {
  return {
    stageA: getProvider(process.env.LLM_PROVIDER_STAGE_A || 'claude', { model: process.env.LLM_MODEL_STAGE_A }),
    stageB: getProvider(process.env.LLM_PROVIDER_STAGE_B || 'claude', { model: process.env.LLM_MODEL_STAGE_B }),
  };
}
