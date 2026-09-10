import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readJson } from './paths.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const SCHEMAS = {
  screenDraft: 'schemas/screen-draft.schema.json',
  generationResult: 'schemas/generation-result.schema.json',
};
for (const rel of Object.values(SCHEMAS)) ajv.addSchema(readJson(rel));

function validatorFor(rel) {
  const { $id } = readJson(rel);
  const v = ajv.getSchema($id);
  /** @returns {null | string[]} null=통과, 배열=사람이 읽을 수 있는 오류 목록 */
  return (data) => (v(data) ? null : v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`));
}

export const validateScreenDraft = validatorFor(SCHEMAS.screenDraft);
export const validateGenerationResult = validatorFor(SCHEMAS.generationResult);
