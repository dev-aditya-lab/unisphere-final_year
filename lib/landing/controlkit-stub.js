// sheryjs imports ControlKit only for its developer "debug" panel (`debug: true`), which the landing page never turns on.
// Pointing the import at this stub (see next.config.mjs) keeps that library, and the styles it injects on load, out of
// the bundle. It is never constructed here.
export default class ControlKit {}
