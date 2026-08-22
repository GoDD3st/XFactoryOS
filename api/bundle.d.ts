/**
 * The server bundle is a build artifact, not a source file - it does not exist on a clean checkout
 * and is produced by `npm run build:server`. Without this declaration `tsc --noEmit` would fail on
 * a fresh clone before the first build, which would make the lint step depend on build order.
 *
 * Typed loosely on purpose: the real contract lives in backend/server.ts, and duplicating its
 * signature here would just create a second thing to keep in step. api/index.ts narrows what it
 * needs at the point of use.
 */
declare module '*.cjs' {
  const bundle: any;
  export default bundle;
}
