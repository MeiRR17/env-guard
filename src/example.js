import { validateEnv, EnvGuardError } from './index.js';

/**
 * Generate a shareable .env.example template from a version-1 JSON schema.
 * This code intentionally NEVER reads an existing .env file, copies values,
 * reads process.env, or inserts schema enum/pattern text into the template.
 *
 * Every variable has an empty assignment; the user must fill actual values
 * in a private .env after copying the template.
 */
export function generateEnvExample(schemaText, { requiredOnly = false } = {}) {
  if (typeof schemaText !== 'string' || schemaText.length > 1024 * 1024) {
    throw new EnvGuardError('Schema text must be under 1 MiB.', 'INVALID_SCHEMA');
  }
  if (typeof requiredOnly !== 'boolean') {
    throw new EnvGuardError('requiredOnly must be boolean.', 'INVALID_OPTIONS');
  }

  let schema;
  try { schema = JSON.parse(schemaText); }
  catch { throw new EnvGuardError('Schema file is not valid JSON.', 'INVALID_SCHEMA'); }

  // Reuse the library's strict schema checks without supplying environment
  // data. Returned missing-variable issues are expected and ignored here.
  validateEnv(new Map(), schema);
  const names = Object.keys(schema.variables).sort((a,b)=>a.localeCompare(b,'en'));
  const lines = [
    '# Environment template generated from env.schema.json by env-guard.',
    '# All assignments are intentionally blank: NO secrets or defaults are included.',
    '# Copy to a private .env file, supply actual values and validate before use.',
    '',
  ];
  for (const name of names) {
    const rule = schema.variables[name];
    if (requiredOnly && rule.required === false) continue;
    const info = [rule.required === false ? 'optional' : 'required', 'type: ' + (rule.type ?? 'string')];
    if (rule.minLength !== undefined) info.push('min length: ' + rule.minLength);
    if (rule.maxLength !== undefined) info.push('max length: ' + rule.maxLength);
    if (rule.min !== undefined) info.push('min: ' + rule.min);
    if (rule.max !== undefined) info.push('max: ' + rule.max);
    if (rule.enum !== undefined) info.push('allowed options defined in schema');
    if (rule.pattern !== undefined) info.push('pattern defined in schema');
    if (rule.allowEmpty === true) info.push('empty allowed');
    lines.push('# ' + info.join(' | '), name + '=', '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
