/**
 * Core INI parser and serializer.
 *
 * Design decisions (stated plainly so behaviour is predictable):
 *
 * 1. Sections are `[name]`. A line that is only whitespace or a comment (`;`/`#` at
 *    the start of the trimmed line) is ignored. Keys before any section go into the
 *    top-level bucket keyed by the empty string "".
 * 2. Keys may use dot notation: `a.b.c = 1` builds nested objects.
 * 3. Values are coerced: "true"/"false" -> boolean, "null" -> null, integers and
 *    decimals -> number, everything else -> string. Strings are NOT unquoted; a
 *    quoted value keeps its quotes in the resulting string. This is deliberate:
 *    we don't try to guess escape semantics.
 * 4. The first `=` on a key line separates key from value. Additional `=` in the
 *    value are preserved verbatim.
 * 5. Duplicate keys: last write wins. For nested paths, writing again merges into
 *    existing objects.
 * 6. stringify emits sections in insertion order (JS object string key order is
 *    stable for non-integer keys), keys within a section in insertion order, and
 *    a blank line between sections. Top-level ("") keys are emitted first if present.
 */

/**
 * @typedef {Record<string, unknown>} Section
 */

/**
 * @typedef {Record<string, Section>} IniConfig
 * Maps section name (or "" for top-level bare keys) to a section object.
 */

/**
 * Coerce a raw string value into a JS primitive.
 *
 * We keep this conservative on purpose: only the three literal forms
 * (true/false/null) and JSON-style numbers are converted. Anything else
 * stays a string, which means quoted strings keep their quotes.
 *
 * @param {string} raw
 * @returns {boolean | number | null | string}
 */
function coerceValue(raw) {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  // Integer or decimal, optional leading sign. Reject anything with extra chars.
  // Using Number() would accept "" and whitespace, so we guard with a regex.
  if (/^-?\d+\.?\d*$/.test(trimmed) && trimmed !== "." && trimmed !== "-" && trimmed !== "-.") {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return raw.trim();
}

/**
 * Set a nested value at a dot-separated path inside a section object.
 *
 * We walk/create intermediate objects. If an intermediate is not an object
 * (e.g. a previous scalar was set at `a` and now we see `a.b`), we overwrite
 * it with an object — last-write-wins for conflicting shapes.
 *
 * @param {Section} section
 * @param {string} keyPath
 * @param {unknown} value
 * @returns {void}
 */
function setNested(section, keyPath, value) {
  const parts = keyPath.split(".");
  let cursor = section;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const existing = cursor[part];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      cursor[part] = {};
    }
    cursor = /** @type {Section} */ (cursor[part]);
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * Parse INI text into a config object.
 *
 * @param {string} text
 * @returns {IniConfig}
 */
export function parse(text) {
  if (typeof text !== "string") {
    throw new TypeError("parse expects a string");
  }

  /** @type {IniConfig} */
  const config = {};
  let currentSection = "";

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Blank lines and comment lines (starting with ; or #) are ignored.
    if (trimmed === "" || trimmed.startsWith(";") || trimmed.startsWith("#")) {
      continue;
    }

    // Section header: `[name]`. We do not support inline comments after `]`
    // because that would require guessing when `]` ends the name — keep it simple.
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1).trim();
      if (!Object.prototype.hasOwnProperty.call(config, currentSection)) {
        config[currentSection] = {};
      }
      continue;
    }

    // Key/value line. Split on the FIRST `=` only, so values may contain `=`.
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      // A non-empty line with no `=` and not a section/comment is a key with empty value.
      // We treat it as a boolean true, which is the common INI convention for flags.
      if (!Object.prototype.hasOwnProperty.call(config, currentSection)) {
        config[currentSection] = {};
      }
      setNested(config[currentSection], trimmed, true);
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key === "") {
      // Empty key with `=value` is malformed; skip it rather than crash.
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(config, currentSection)) {
      config[currentSection] = {};
    }
    setNested(config[currentSection], key, coerceValue(value));
  }

  return config;
}

/**
 * Stringify a value back to its INI textual form.
 *
 * @param {unknown} value
 * @returns {string}
 */
function stringifyScalar(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return String(value);
  return String(value);
}

/**
 * Flatten a nested section object into dot-path key/value pairs for emission.
 *
 * @param {Section} section
 * @param {string} [prefix]
 * @returns {Array<[string, unknown]>}
 */
function flatten(section, prefix = "") {
  /** @type {Array<[string, unknown]>} */
  const out = [];
  for (const key of Object.keys(section)) {
    const value = section[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flatten(/** @type {Section} */ (value), path));
    } else {
      out.push([path, value]);
    }
  }
  return out;
}

/**
 * Serialize a config object back into INI text.
 *
 * Sections are emitted in object key order; the top-level "" section (if present)
 * is emitted first and without a header. Each section is followed by a blank line
 * for readability. Nested keys are flattened with dot notation.
 *
 * @param {IniConfig} config
 * @returns {string}
 */
export function stringify(config) {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new TypeError("stringify expects a config object");
  }

  /** @type {string[]} */
  const chunks = [];

  // Emit the bare top-level section first, if it has any keys.
  const sections = Object.keys(config);
  if (sections.includes("")) {
    const pairs = flatten(config[""]);
    if (pairs.length > 0) {
      for (const [key, value] of pairs) {
        chunks.push(`${key} = ${stringifyScalar(value)}`);
      }
      chunks.push("");
    }
  }

  for (const section of sections) {
    if (section === "") continue;
    const pairs = flatten(config[section]);
    if (pairs.length === 0) {
      // Emit an empty section header so round-trip preserves its existence.
      chunks.push(`[${section}]`);
      chunks.push("");
      continue;
    }
    chunks.push(`[${section}]`);
    for (const [key, value] of pairs) {
      chunks.push(`${key} = ${stringifyScalar(value)}`);
    }
    chunks.push("");
  }

  // Join with newlines and trim the trailing blank line(s) for a clean result.
  return chunks.join("\n").replace(/\n+$/u, "") + "\n";
}
