const DEMO_RUNTIME = '<meta name="conference-runtime" content="demo">';
const PRODUCTION_RUNTIME = '<meta name="conference-runtime" content="production">';
const DEMO_BOOTSTRAP = /\.\/src\/platform\/demo-bootstrap\.js(\?v=[A-Za-z0-9._-]+)?/g;

export function asProductionHtml(source) {
  if (typeof source !== 'string' || source.split(DEMO_RUNTIME).length !== 2) {
    throw new TypeError('PRODUCTION_HTML_RUNTIME_MARKER_INVALID');
  }
  const bootstrapMatches = [...source.matchAll(DEMO_BOOTSTRAP)];
  if (bootstrapMatches.length !== 1) {
    throw new TypeError('PRODUCTION_HTML_BOOTSTRAP_MARKER_INVALID');
  }
  return source
    .replace(DEMO_RUNTIME, PRODUCTION_RUNTIME)
    .replace(DEMO_BOOTSTRAP, (_match, cacheMarker = '') => (
      `./src/platform/production-bootstrap.js${cacheMarker}`
    ));
}
