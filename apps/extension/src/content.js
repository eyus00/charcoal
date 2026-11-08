/**
 * Runs on Charcoal's pages only. Passes the page's requests to the extension and the answers back,
 * using window.postMessage (the page can't call the extension directly in every browser).
 */
const PAGE = 'charcoal-page';
const EXT = 'charcoal-extension';

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== PAGE) return;
  const { id, type, payload } = e.data;
  chrome.runtime
    .sendMessage({ type, payload })
    .catch((err) => ({ ok: false, error: String(err?.message ?? err) }))
    .then((reply) => window.postMessage({ source: EXT, id, ...(reply ?? { ok: false, error: 'No answer' }) }, location.origin));
});

// Tell the page we're here (it also asks with "hello").
window.postMessage({ source: EXT, type: 'ready' }, location.origin);
