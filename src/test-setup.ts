import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = () => {}

// jsdom has no matchMedia; sonner and the theme provider read it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
