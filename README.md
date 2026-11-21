# Env Guard

Validate dotenv files against a versioned JSON schema before starting an application. **Never print configuration values or secrets.** Runs locally on Node.js 22+ with no runtime dependencies.

## Quick start

Use the bundled example (all values are fictional):

    node bin/env-guard.js --env examples/sample.env --schema examples/env.schema.json
    node bin/env-guard.js --env examples/sample.env --schema examples/env.schema.json --json

For a project, create a private `.env` and a tracked `env.schema.json` in its root:

    node bin/env-guard.js
    node bin/env-guard.js --strict
    node bin/env-guard.js --json --quiet

Exit codes: **0** configuration valid, **1** variables missing/invalid, **2** usage, parsing, schema or filesystem error. Use the exit code in CI or a startup script.

## Schema format

The schema must contain `version: 1` and a `variables` mapping. Example:

    {
      "version": 1,
      "variables": {
        "PORT": { "type": "integer", "min": 1, "max": 65535 },
        "API_BASE_URL": { "type": "url" },
        "NODE_ENV": { "type": "string", "enum": ["development", "test", "production"] },
        "ENABLE_CACHE": { "type": "boolean", "required": false },
        "API_KEY": { "type": "string", "minLength": 12, "required": false }
      }
    }

Supported types: `string`, `integer`, `number`, `boolean` and `url` (absolute HTTP/HTTPS). Rules: `required` (default true), `allowEmpty` (default false), `min`, `max`, `minLength`, `maxLength`, `enum` (exact string matches) and `pattern` (JavaScript RegExp source). A variable not defined in the schema is a warning by default and an error with `--strict`.

## Parsing behavior

- Supports lines of `KEY=value`, `export KEY=value`, blank lines and comments starting with `#`.
- Supports single- or double-quoted values, escaped double quotation marks, and common escapes in double-quoted values.
- Unquoted `#` starts a comment when preceded by whitespace.
- Fails on duplicate keys and malformed assignments instead of silently overriding them.
- Deliberately does not expand environment variables, evaluate shell expressions, or support multiline quoted assignments.

## Node.js library API

    import { inspectEnv } from './src/index.js';
    const result = inspectEnv(envText, schemaJsonText, { strictUnknown: true });
    if (!result.valid) process.exitCode = 1;

The `parseEnv` function returns values in memory. **Do not log that Map**. Only the validator's report is designed for redacted output. A report contains key names and rule descriptions but not values. Variable names themselves may still be sensitive in some organizations.

## Safety and limits

Input is limited to 1 MiB and 20,000 lines. A schema may contain at most 2,000 variables. Custom regular expressions should be trusted and reviewed: complex patterns can consume substantial CPU. The program does not contact remote services or send credentials anywhere.

The repository's `.gitignore` excludes common `.env` filenames. Always keep actual secrets out of version control, even in sample files.

## Implementation status

This branch contains new functionality and has **not been tested**; validation will be done in the owner's consolidated testing cycle. It is not marked as a production release.

## Project files

- `src/index.js` — dotenv parser, schema validator and redacted reporting
- `bin/env-guard.js` — command-line validation
- `examples/` — fake sample environment and JSON schema
- `LICENSE` — MIT

## Author

Built by Meir Dvir · https://github.com/MeiRR17
