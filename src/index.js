/**
 * Zero-dependency dotenv parser and schema validator.
 * Does not interpolate shell variables. Diagnostic objects never expose values.
 */
import { isIP } from 'node:net';

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPES = new Set(['string','integer','number','boolean','url','port','ip','ipv4','ipv6']);
const MAX_TEXT = 1024 * 1024;

export class EnvGuardError extends Error {
  constructor(message, code = 'CONFIG_ERROR') {
    super(message);
    this.name = 'EnvGuardError';
    this.code = code;
  }
}

/** Parse one-line dotenv assignments and retain source line numbers. */
export function parseEnv(source) {
  if (typeof source !== 'string' || source.length > MAX_TEXT)
    throw new EnvGuardError('Environment file must be text under 1 MiB.', 'INPUT_SIZE');
  const result = new Map();
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 20_000) throw new EnvGuardError('Too many environment lines.', 'INPUT_SIZE');
  lines.forEach((original, index) => {
    let line = original.trim();
    if (!line || line.startsWith('#')) return;
    if (line.startsWith('export ')) line = line.slice(7).trimStart();
    const assign = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!assign) throw new EnvGuardError('Invalid assignment at line ' + (index+1), 'INVALID_ENV');
    const name = assign[1];
    if (result.has(name)) throw new EnvGuardError('Duplicate key ' + name + ' at line ' + (index+1), 'DUPLICATE_KEY');
    let value = assign[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      let end = -1, escaped = false;
      for (let i = 1; i < value.length; i++) {
        if (quote === '"' && value[i] === '\\' && !escaped) { escaped = true; continue; }
        if (value[i] === quote && !escaped) { end = i; break; }
        escaped = false;
      }
      if (end < 0) throw new EnvGuardError('Unclosed quote for ' + name + ' at line ' + (index+1), 'INVALID_ENV');
      const trailing = value.slice(end+1).trim();
      if (trailing && !trailing.startsWith('#'))
        throw new EnvGuardError('Extra text after quoted value of ' + name, 'INVALID_ENV');
      value = value.slice(1,end);
      if (quote === '"') value = value.replace(/\\([nrt"\\])/g, (_,ch) =>
        ({n:'\n',r:'\r',t:'\t','"':'"','\\':'\\'})[ch]);
    } else {
      value = value.replace(/\s+#.*$/, '').trimEnd();
    }
    result.set(name, { value, line: index+1 });
  });
  return result;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validateSchema(schema) {
  if (!object(schema) || schema.version !== 1 || !object(schema.variables))
    throw new EnvGuardError('Schema must have version 1 and a variables object.', 'INVALID_SCHEMA');
  const keys = Object.keys(schema.variables);
  if (keys.length > 2000) throw new EnvGuardError('Schema is too large.', 'INVALID_SCHEMA');
  const allowed = new Set(['type','required','allowEmpty','min','max','minLength','maxLength','enum','pattern']);
  for (const name of keys) {
    const rule = schema.variables[name];
    if (!KEY.test(name) || !object(rule)) throw new EnvGuardError('Invalid schema rule for ' + name, 'INVALID_SCHEMA');
    if (Object.keys(rule).some(k => !allowed.has(k))) throw new EnvGuardError('Unknown schema property for ' + name, 'INVALID_SCHEMA');
    if (!TYPES.has(rule.type ?? 'string')) throw new EnvGuardError('Invalid type for ' + name, 'INVALID_SCHEMA');
    for (const bool of ['required','allowEmpty']) {
      if (rule[bool] !== undefined && typeof rule[bool] !== 'boolean')
        throw new EnvGuardError('Invalid ' + bool + ' for ' + name, 'INVALID_SCHEMA');
    }
    for (const numeric of ['min','max','minLength','maxLength']) {
      if (rule[numeric] !== undefined && (!Number.isFinite(rule[numeric]) ||
        (numeric.endsWith('Length') && (!Number.isInteger(rule[numeric]) || rule[numeric] < 0))))
        throw new EnvGuardError('Invalid ' + numeric + ' for ' + name, 'INVALID_SCHEMA');
    }
    if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max)
      throw new EnvGuardError('Invalid numeric range for ' + name, 'INVALID_SCHEMA');
    if (rule.minLength !== undefined && rule.maxLength !== undefined && rule.minLength > rule.maxLength)
      throw new EnvGuardError('Invalid length range for ' + name, 'INVALID_SCHEMA');
    if (rule.enum !== undefined && (!Array.isArray(rule.enum) || rule.enum.length === 0 ||
      !rule.enum.every(x => typeof x === 'string')))
      throw new EnvGuardError('Invalid enum for ' + name, 'INVALID_SCHEMA');
    if (rule.pattern !== undefined) {
      if (typeof rule.pattern !== 'string' || rule.pattern.length > 200)
        throw new EnvGuardError('Invalid pattern for ' + name, 'INVALID_SCHEMA');
      try { new RegExp(rule.pattern); } catch {
        throw new EnvGuardError('Invalid regex for ' + name, 'INVALID_SCHEMA');
      }
    }
  }
  return keys;
}
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const PORT = /^(?:[1-9]\d{0,4})$/;

/** Validate values without printing or storing them in the result. */
export function validateEnv(parsed, schema, options = {}) {
  if (!(parsed instanceof Map)) throw new TypeError('Expected parseEnv() output.');
  const keys = validateSchema(schema);
  const strict = options.strictUnknown === true;
  const checks = [];
  for (const name of keys) {
    const rule = schema.variables[name];
    const entry = parsed.get(name);
    if (!entry) {
      checks.push(rule.required === false ?
        {key:name,status:'optional',code:'OPTIONAL',message:'Optional variable is absent.'} :
        {key:name,status:'error',code:'MISSING',message:'Required variable is missing.'});
      continue;
    }
    const value = entry.value;
    const failures = [];
    const type = rule.type ?? 'string';
    if (!value && rule.allowEmpty !== true) failures.push('Empty value.');
    if (value) {
      if (type === 'integer' && (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))))
        failures.push('Expected a safe integer.');
      if (type === 'number' && (!DECIMAL.test(value) || !Number.isFinite(Number(value))))
        failures.push('Expected a finite decimal number.');
      if (type === 'boolean' && !/^(?:true|false|yes|no|1|0)$/i.test(value))
        failures.push('Expected boolean.');
      // Treat ports as a separate, bounded network setting rather than
      // generic integers: no signs, leading zeros, decimals or port zero.
      if (type === 'port' && (!PORT.test(value) || Number(value) > 65535)) {
        failures.push('Expected a TCP/UDP port number from 1 to 65535.');
      }
      // Node's built-in IP parser performs strict syntax validation locally.
      // It does not resolve hostnames, open sockets, or normalize the value.
      if (type === 'ip' || type === 'ipv4' || type === 'ipv6') {
        const family = isIP(value);
        if (family === 0 || (type === 'ipv4' && family !== 4) ||
            (type === 'ipv6' && family !== 6)) {
          failures.push('Expected a valid ' +
            (type === 'ip' ? 'IP' : type === 'ipv4' ? 'IPv4' : 'IPv6') + ' address.');
        }
      }
      if (type === 'url') {
        try {
          const url = new URL(value);
          if (!['http:','https:'].includes(url.protocol)) failures.push('Expected absolute HTTP(S) URL.');
        } catch { failures.push('Expected absolute HTTP(S) URL.'); }
      }
    }
    if (value && (type === 'integer' || type === 'number' || type === 'port') && Number.isFinite(Number(value))) {
      const number = Number(value);
      if (rule.min !== undefined && number < rule.min) failures.push('Below minimum ' + rule.min + '.');
      if (rule.max !== undefined && number > rule.max) failures.push('Above maximum ' + rule.max + '.');
    }
    if (rule.minLength !== undefined && value.length < rule.minLength) failures.push('Too short.');
    if (rule.maxLength !== undefined && value.length > rule.maxLength) failures.push('Too long.');
    if (rule.enum && !rule.enum.includes(value)) failures.push('Not an allowed choice.');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) failures.push('Pattern mismatch.');
    checks.push(failures.length ?
      {key:name,status:'error',code:'INVALID',message:failures.join(' ')} :
      {key:name,status:'ok',code:'VALID',message:'Valid.'});
  }
  for (const [name] of parsed) {
    if (!Object.hasOwn(schema.variables, name)) checks.push(strict ?
      {key:name,status:'error',code:'UNKNOWN',message:'Not in schema.'} :
      {key:name,status:'warning',code:'UNKNOWN',message:'Not in schema.'});
  }
  const errors = checks.filter(x=>x.status==='error').length;
  const warnings = checks.filter(x=>x.status==='warning').length;
  return {valid:errors===0,summary:{checked:checks.length,errors,warnings},checks};
}

/** Convenience entry point accepting .env text and JSON schema text. */
export function inspectEnv(envText, schemaText, options) {
  let schema;
  try { schema = JSON.parse(schemaText); }
  catch { throw new EnvGuardError('Schema file is not valid JSON.', 'INVALID_SCHEMA'); }
  return validateEnv(parseEnv(envText), schema, options);
}
