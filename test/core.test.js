import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, stringify } from "../src/index.js";

test("parse flat key/value under a section", () => {
  const config = parse("[db]\nhost = localhost\nport = 5432\n");
  assert.equal(config.db.host, "localhost");
  assert.equal(config.db.port, 5432);
  assert.equal(typeof config.db.port, "number");
});

test("parse coerces booleans and null", () => {
  const config = parse("[s]\na = true\nb = false\nc = null\n");
  assert.equal(config.s.a, true);
  assert.equal(config.s.b, false);
  assert.equal(config.s.c, null);
});

test("parse coerces decimals and negative numbers", () => {
  const config = parse("[s]\na = 1.5\nb = -42\nc = +7\n");
  assert.equal(config.s.a, 1.5);
  assert.equal(config.s.b, -42);
  // +7 is not matched by our regex (we require optional leading `-` only),
  // so it stays a string. This is the documented conservative behaviour.
  assert.equal(config.s.c, "+7");
  assert.equal(typeof config.s.c, "string");
});

test("parse ignores blank lines and comments", () => {
  const text = "; header comment\n\n# another\n[s]\n; inline-ish\nx = 1\n";
  const config = parse(text);
  assert.deepEqual(config.s, { x: 1 });
});

test("parse supports nested keys via dot notation", () => {
  const config = parse("[s]\na.b.c = 1\na.d = 2\n");
  assert.deepEqual(config.s.a, { b: { c: 1 }, d: 2 });
});

test("parse preserves equals signs in the value", () => {
  const config = parse("[s]\npath = a=b=c\n");
  assert.equal(config.s.path, "a=b=c");
});

test("bare keys before any section go into the empty-string section", () => {
  const config = parse("top = 1\n[s]\nx = 2\n");
  assert.equal(config[""].top, 1);
  assert.equal(config.s.x, 2);
});

test("duplicate keys: last write wins", () => {
  const config = parse("[s]\nx = 1\nx = 2\n");
  assert.equal(config.s.x, 2);
});

test("a key with no equals sign becomes boolean true (flag convention)", () => {
  const config = parse("[s]\nenabled\n");
  assert.equal(config.s.enabled, true);
});

test("parse throws on non-string input", () => {
  assert.throws(() => parse(/** @type {unknown} */ (42)), TypeError);
});

test("stringify emits sections and coerced values", () => {
  const text = stringify({
    "": { top: 1 },
    db: { host: "localhost", port: 5432, ssl: true },
  });
  assert.equal(
    text,
    "top = 1\n\n[db]\nhost = localhost\nport = 5432\nssl = true\n",
  );
});

test("stringify flattens nested keys with dots", () => {
  const text = stringify({ s: { a: { b: { c: 1 } } } });
  assert.equal(text, "[s]\na.b.c = 1\n");
});

test("stringify emits an empty section header", () => {
  const text = stringify({ empty: {} });
  assert.equal(text, "[empty]\n");
});

test("round-trip: parse then stringify preserves data", () => {
  const original = "[db]\nhost = localhost\nport = 5432\nssl = true\n\n[cache]\na.b = 1\n";
  const config = parse(original);
  const reproduced = stringify(config);
  assert.equal(reproduced, original);
});

test("stringify throws on non-object input", () => {
  assert.throws(() => stringify(/** @type {unknown} */ (null)), TypeError);
});
