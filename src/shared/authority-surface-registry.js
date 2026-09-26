function closeAndClearSurface(surface) {
  try {
    if (surface.open === true && typeof surface.close === 'function') surface.close();
  } catch {}
  try { surface.replaceChildren?.(); } catch {}
  try { surface.remove?.(); } catch {}
}

export function createAuthoritySurfaceRegistry() {
  const surfaces = new Set();

  const track = (surface) => {
    if (!surface || typeof surface.addEventListener !== 'function') {
      throw new TypeError('AUTHORITY_SURFACE_REQUIRED');
    }
    surfaces.add(surface);
    surface.addEventListener('close', () => surfaces.delete(surface), { once: true });
    return surface;
  };

  const closeAll = () => {
    const current = [...surfaces];
    surfaces.clear();
    current.forEach(closeAndClearSurface);
    return current.length;
  };

  return Object.freeze({ track, closeAll });
}
