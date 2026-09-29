/**
 * Public entry point for the INI Config Parser.
 *
 * Re-exports the parse and stringify functions plus the IniConfig type alias.
 * Keeping the public surface tiny on purpose: two functions and one type.
 */
export { parse, stringify } from "./core.js";

/**
 * @typedef {import("./core.js").IniConfig} IniConfig
 */
export {};
