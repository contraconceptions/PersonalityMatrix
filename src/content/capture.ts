// Content script for chat auto-capture (see src/lib/capture.ts). Registered at runtime, only on the site
// the supervisor configured, and only after Chrome granted access to it. It must stay self-contained
// (no imports): Chrome runs content scripts as classic scripts, not modules.
//
// It watches the conversation for new customer messages and sends their text to the extension's side
// panel. It never stores anything and sends nothing anywhere else. Messages already on the page when it
// starts are skipped: only what arrives during the call is captured.

(() => {
  const KEY = "captureConfig";
  const MESSAGE = "pm-capture";
  const MAX_CHARS = 1000;

  interface Config {
    enabled: boolean;
    container: string;
    customerMessage: string;
  }

  const seen = new WeakSet<Element>();
  let observer: MutationObserver | null = null;

  function send(el: Element) {
    if (seen.has(el)) return;
    seen.add(el);
    const text = ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (text) chrome.runtime.sendMessage({ type: MESSAGE, text }).catch(() => {}); // no panel open: fine
  }

  function matches(node: Node, cfg: Config): Element[] {
    if (!(node instanceof Element)) return [];
    const found = node.matches(cfg.customerMessage) ? [node] : [];
    return found.concat(Array.from(node.querySelectorAll(cfg.customerMessage)));
  }

  function watch(cfg: Config) {
    observer?.disconnect();
    const attach = (container: Element) => {
      container.querySelectorAll(cfg.customerMessage).forEach((el) => seen.add(el)); // history: skip
      observer = new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => matches(n, cfg).forEach(send));
      });
      observer.observe(container, { childList: true, subtree: true });
    };
    const container = document.querySelector(cfg.container);
    if (container) return attach(container);
    // Single-page apps render late: wait for the conversation to appear.
    observer = new MutationObserver(() => {
      const c = document.querySelector(cfg.container);
      if (c) {
        observer?.disconnect();
        attach(c);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function apply(cfg: Config | undefined) {
    observer?.disconnect();
    observer = null;
    if (!cfg?.enabled || !cfg.container || !cfg.customerMessage) return;
    try {
      watch(cfg);
    } catch {
      // Invalid selector: stay idle (Settings validates before saving).
    }
  }

  chrome.storage.local.get(KEY).then((r) => apply(r[KEY] as Config | undefined));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && KEY in changes) apply(changes[KEY].newValue as Config | undefined);
  });
})();
