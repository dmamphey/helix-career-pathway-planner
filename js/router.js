/**
 * Hash routing.
 *
 * Hash routes mean every URL resolves to index.html, so a refresh or a shared
 * link cannot produce a GitHub Pages 404 — which is the whole reason for choosing
 * them over the history API for a static deployment.
 */

const routes = [];
let notFound = null;
let current = "";

/**
 * Register a route.
 *
 * @param {string} pattern e.g. "/career/:id"
 * @param {function} handler receives ({ params, path })
 */
export function route(pattern, handler) {
  const parts = pattern.split("/").filter(Boolean);
  routes.push({ pattern, parts, handler });
}

export function fallback(handler) {
  notFound = handler;
}

/** The current hash path, without the leading "#". */
export function currentPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/";
}

export function navigate(path, options = {}) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, "", url);
    resolve();
  } else if (window.location.hash === target) {
    resolve();
  } else {
    window.location.hash = target;
  }
}

/** Match the current path and run its handler. */
export function resolve() {
  const path = currentPath();
  current = path;
  const parts = path.split("/").filter(Boolean);

  for (const entry of routes) {
    if (entry.parts.length !== parts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < entry.parts.length; i += 1) {
      const expected = entry.parts[i];
      const actual = parts[i];
      if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual);
      else if (expected.toLowerCase() !== actual.toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (matched) {
      entry.handler({ params, path });
      return;
    }
  }
  if (notFound) notFound({ params: {}, path });
}

export function start() {
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function activePath() {
  return current;
}
