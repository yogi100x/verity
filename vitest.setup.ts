/**
 * Shared test environment shims. jsdom lacks matchMedia, which ProvenanceTag
 * uses for its mobile bottom-sheet split; every component test needs it.
 */

const createMediaQueryList = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: createMediaQueryList,
  });
}
