import { EnvGuardError, parseEnv, validateEnv } from './index.js';

/**
 * Produce a minimal version-1 schema skeleton from an existing dotenv file.
 *
 * Deliberately uses no value-driven type inference: even inferring an enum
 * or minLength from secret contents could leak configuration metadata.
 * No source values appear in the returned JSON.
 *
 * The generated schema is a starting point, NOT a complete policy. All
 * variables begin as required strings and must be reviewed before deployment.
 */
export function scaffoldEnvSchema(envText) {
  const parsed = parseEnv(envText);
  const keys = [...parsed.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  if (!keys.length) throw new EnvGuardError('No variable names found in .env input.', 'EMPTY_ENV');
  if (keys.length > 2000) {
    throw new EnvGuardError('Schema supports at most 2,000 variables.', 'SCHEMA_SIZE');
  }
  // A fresh object protects reserved property names and avoids prototype
  // inheritance. The schema contains names, not parsed values.
  const variables = Object.create(null);
  for (const name of keys) {
    variables[name] = { type: 'string', required: true };
  }
  const schema = { version: 1, variables };
  validateEnv(new Map(), schema);
  return JSON.stringify(schema, null, 2) + '\n';
}
