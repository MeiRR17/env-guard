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

## Bounded input and strict text decoding

Every CLI mode reads `.env` and/or schema JSON via a bounded **1 MiB byte stream** with fatal UTF-8 decoding. Oversized files and malformed bytes are rejected *before* they can become misleading configuration values or regex rules. No secret contents or schema snippets appear in these errors; `--summary-only` keeps its fixed error-code reporting. These are local-only reads, not network operations.

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
        "PORT": { "type": "port" },
        "BIND_ADDRESS": { "type": "ipv4" },
        "TRUSTED_NETWORK": { "type": "cidr", "required": false },
        "SERVICE_HOST": { "type": "hostname" },
    "FINGERPRINT_HEX": { "type": "hex", "required": false, "minLength": 8 },
        "ENCODED_SAMPLE": { "type": "base64", "required": false },
        "URLSAFE_SAMPLE": { "type": "base64url", "required": false },
    "SESSION_UUID": { "type": "uuid-v4", "required": false },
        "API_BASE_URL": { "type": "url" },
        "NODE_ENV": { "type": "string", "enum": ["development", "test", "production"] },
        "ENABLE_CACHE": { "type": "boolean", "required": false },
        "API_KEY": { "type": "string", "minLength": 12, "required": false }
      }
    }

Supported types: `string`, `integer`, `number`, `boolean`, `url` (absolute HTTP/HTTPS), `port` (a decimal TCP/UDP port from 1 to 65535 without a sign or leading zeros), `hostname` (ASCII DNS labels or a single-label local host; max 253 characters and 63 characters per label), `uuid-v4` (canonical 36-character hyphenated UUID version 4 with RFC 4122 variant bits, uppercase/lowercase ASCII hex accepted), `hex` (1–2,048 complete hexadecimal bytes, exactly two ASCII hex digits per byte, no `0x` prefix, whitespace or separators), `base64` (1–2,048 bytes encoded using canonical, padded RFC 4648 Base64 with the standard `A–Z`, `a–z`, `0–9`, `+`, `/` alphabet), `base64url` (1–2,048 bytes using canonical, **unpadded** RFC 4648 Base64URL with `A–Z`, `a–z`, `0–9`, `-`, `_`), `ip` (IPv4 or IPv6), `ipv4` (IPv4 only), `ipv6` (IPv6 only), and `cidr` (IPv4/IPv6 address followed by `/` and a decimal prefix length). The `hostname` rule accepts names such as `localhost`, `dev-api` and `internal.example`, including ASCII punycode labels; it rejects URL schemes, ports, empty labels, underscores, terminal dots and leading/trailing hyphens. It checks syntax only and performs no DNS lookup. IP types require literal addresses, not hostnames or CIDR ranges. The separate `cidr` type recognizes strings such as `192.0.2.0/24` or `2001:db8::/32`; it uses Node.js's built-in IP parser plus a canonical decimal prefix from 0–32 for IPv4 or 0–128 for IPv6. Empty prefixes, leading-zero prefixes, signs, dotted-decimal netmasks, spaces, hostnames and URL-shaped values are rejected. It checks **syntax only**, does not normalize host bits or determine whether the supplied address is the network base, and never confirms that a firewall rule, allowlist or subnet is safe or active. It performs no DNS/network lookup. No supplied CIDR text is printed in diagnostics. IPv6 compression is supported by Node.js's built-in IP parser; no DNS lookups or network connections are performed. Rules: `required` (default true), `allowEmpty` (default false), `min`, `max`, `minLength`, `maxLength`, `enum` (exact string matches) and `pattern` (JavaScript RegExp source). A variable not defined in the schema is a warning by default and an error with `--strict`. The `port` type is for explicitly configured service ports; dynamic assignment via port 0 is deliberately rejected. Existing `min`/`max` constraints can also restrict the accepted port range. For `hex`, `minLength` and `maxLength` count **hex characters**, not bytes; e.g. 32 characters represent 16 bytes. The hex check never displays decoded bytes and cannot establish that a key was generated securely. The `base64` type rejects whitespace, URL-safe `-` / `_` alphabet, noncanonical or omitted padding, malformed byte quartets, nonzero trailing pad bits, empty encoded data and decoded byte lengths above 2,048. It validates canonical syntax by decoding **in memory** with Node's built-in Buffer and comparing a fresh encoding; the decoded bytes and original value are never included in diagnostic output or persisted. The separate `base64url` type requires an **unpadded**, URL-safe canonical string (2–2,731 characters), with no `=`, `+`, `/`, whitespace or control characters. It rejects malformed one-character tails, nonzero unused pad bits and decoded payloads outside 1–2,048 bytes. Node's bounded in-memory Base64URL decode/re-encode comparison enforces the canonical spelling. This checks only byte encoding; it does **not** parse a JWT, verify a token signature, validate authorization, or guarantee confidentiality. `minLength` and `maxLength` count encoded **characters**, not decoded bytes, for both variants. All diagnostics remain redacted, without encoded or decoded contents. Base64 is *encoding*, **not encryption**. A valid result cannot prove secure key generation, key entropy, confidentiality, ownership or suitability for a particular protocol. Use optional `minLength`/`maxLength` to constrain the *encoded character length*, if needed. `uuid-v4` checks the five canonical groups, hyphen positions, version nibble `4`, and RFC 4122 variant nibble `8`/`9`/`a`/`b`. It rejects braces, `urn:uuid:` prefixes, compact values and whitespace. This is **format validation only**: neither uniqueness, cryptographically secure random generation, actual issuance nor ownership is verified; an all-zero-like synthetic example may pass its syntax check. Diagnostic output remains key-name/code only, without values.

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

- `src/index.js` — dotenv parser, schema validation (including canonical Base64) and redacted reporting
- `bin/env-guard.js` — command-line validation and blank template generation
- `src/example.js` — schema-based, secret-free `.env.example` generator
- `src/scaffold.js` — names-only schema skeleton generator from an existing .env file
- `src/summary.js` — aggregate-only report for CI, omitting variable names and values
- `examples/` — fake sample environment and JSON schema
- `LICENSE` — MIT

## Author

Built by Meir Dvir · https://github.com/MeiRR17
