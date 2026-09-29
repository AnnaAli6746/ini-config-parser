# INI Config Parser

A small TypeScript-free ESM JavaScript library that parses and serializes INI configuration files with sections, nested keys, comments, and type coercion.

```js
import { parse, stringify } from "./src/index.js";

const text = `
; database settings
[database]
host = localhost
port = 5432
ssl = true

timeout = 30
`;

const config = parse(text);
console.log(config.database.host); // "localhost"
console.log(config.database.port); // 5432 (number)
console.log(config.database.ssl);  // true (boolean)

const out = stringify(config);
// [database]
// host = localhost
// port = 5432
// ssl = true
//
// timeout = 30
```

## Why this exists

Configuration files often need more than flat key/value pairs. This library reads INI with sections and nested keys using dot notation (`a.b = 1` builds `{a:{b:1}}`), preserves comments by storing section and key order, and coerces `true`/`false`/numbers/`null` on parse so consumers don't have to. The trade-off: values are always primitives or nested objects built from dot notation — arrays are not specially handled, and quoted strings lose their quotes and are treated as plain strings.

## Edge cases you'll hit

- A key with an `=` in its value keeps the rest intact: `path = a=b=c` yields `"a=b=c"` after the first `=` split at the key boundary.
- Duplicate keys in the same section: last write wins.
- Bare keys before any section land in a top-level object with the empty-string key `""`; call `config[""]` to reach them.
- Comments (`;` or `#` at the start of a trimmed line) are dropped on parse and not re-emitted on stringify.

## API

Exported names: `parse`, `stringify`.

- `parse(text: string): IniConfig` — parse INI text into a config object.
- `stringify(config: IniConfig): string` — serialize a config object back to INI text.
- `IniConfig` — a TypeScript-style JSDoc typedef describing the shape: an object mapping section names (or `""` for top-level) to objects of nested primitive values. It is not a runtime export; import `parse` and `stringify` only.
