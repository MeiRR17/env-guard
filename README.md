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

## Counts-only diagnostics for CI

Use `--summary-only` to generate a report containing **no variable names, values, line numbers, or schema patterns**:

    node bin/env-guard.js --env .env --schema env.schema.json --summary-only
    node bin/env-guard.js --env .env --schema env.schema.json --summary-only --json

Text output lists aggregate counts per finding code (VALID, MISSING, INVALID, UNKNOWN, OPTIONAL). JSON output adds structured totals and a count-only advisory. The mode does not change exit codes: invalid data still exits with status **1**, while file and schema errors exit with **2**. Use `--strict` with `--summary-only` to count unexpected variables as errors. `--quiet` cannot be combined with `--summary-only`; the latter already suppresses all individual findings.

Programmatically, `aggregateEnvReport(inspectEnv(envText, schemaText))` is exposed from `@meirr17/env-guard/summary`. Aggregate counts may themselves be sensitive, so apply organizational data-sharing policy before publishing the report. In this mode, startup, file or schema errors are also printed as **generic error codes**, rather than including potentially sensitive variable names and filesystem paths. To investigate the precise cause, run the validator locally without `--summary-only`.

## Generate a safe .env.example template

Create a **blank, shareable** environment template from your schema without opening an existing `.env` file or copying secret values:

    node bin/env-guard.js --schema examples/env.schema.json --init-example .env.example
    node bin/env-guard.js --schema examples/env.schema.json --required-only --init-example required.env.example

The output contains variable names, types, required/optional labels and non-sensitive length/number constraints. It **does not include actual values, enum choices, pattern sources, schema defaults or process environment variables**. Each generated assignment is intentionally empty, so copy the example to your private `.env`, fill in real values and validate. This is a documentation template, not a functioning configuration file.

The CLI creates a **new** file only (`wx`): it refuses to overwrite an existing template. Template mode reads the schema only; it does not inspect `.env` or `process.env`. The option `--required-only` excludes optional schema variables.

Programmatic use:

    import { generateEnvExample } from './src/example.js';
    const example = generateEnvExample(schemaJsonText, { requiredOnly: false });

Package users can import from `@meirr17/env-guard/example`. Keep variable names non-sensitive if publishing even blank templates. Nothing is uploaded.


## Generate a schema skeleton from an existing .env

To bootstrap a new validation schema, explicitly choose this mode:

    node bin/env-guard.js --env .env --init-schema env.schema.json

The command **reads the local .env** to discover variable names, but **never writes variable values** to the generated JSON. Each variable starts with a generic \`{"type":"string","required":true}\` rule. There is no inference of numeric types, URLs, regex patterns, defaults or enum values from any existing credentials. Review the schema to configure proper types, optional fields and limits before relying on it.

- The destination is created **only if it does not already exist** (\`wx\`); existing schema files cannot be overwritten.
- Only the \`--env\` file is read. No environment variables are read from \`process.env\`, and no network requests are made.
- The output contains **variable names**, which may themselves be sensitive. Inspect the schema before committing or publishing it.
- This mode is separate from \`--init-example\` and cannot be combined with validation-format flags.
- A missing or malformed input fails with an error. The resulting stub is intentionally **not** a complete security or configuration policy.

Programmatic use:

    import { scaffoldEnvSchema } from './src/scaffold.js';
    const schema = scaffoldEnvSchema(dotenvText); // JSON string, names only

Package users can import \`@meirr17/env-guard/scaffold\`.

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
- `bin/env-guard.js` — command-line validation and blank template generation
- `src/example.js` — schema-based, secret-free `.env.example` generator
- `src/scaffold.js` — names-only schema skeleton generator from an existing .env file
- `src/summary.js` — aggregate-only report for CI, omitting variable names and values
- `examples/` — fake sample environment and JSON schema
- `LICENSE` — MIT

## Author

Built by Meir Dvir · https://github.com/MeiRR17
