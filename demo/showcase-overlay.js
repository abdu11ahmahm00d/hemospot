/**
 * showcase-overlay.js - injected into the app before its own scripts run.
 *
 * Three jobs, none of which touch the app's source:
 *   1. a drawn cursor that eases along a human path (the OS cursor is never
 *      captured by the screencast, so the arrow in the video is this one)
 *   2. a click ripple so presses read as presses
 *   3. a route crossfade, so a screen change is a dissolve instead of a cut
 *
 * The driver talks to it through window.__showcase.
 */
(() => {
  const CSS = `
    *, *::before, *::after { cursor: none !important; }
    main { transition: opacity 220ms cubic-bezier(.4,0,.2,1), transform 220ms cubic-bezier(.4,0,.2,1); }
    main.sfx-out { opacity: 0; transform: translateY(10px); }
    main.sfx-in  { opacity: 0; transform: translateY(10px); }

    #__scursor {
      position: fixed; left: 0; top: 0; width: 24px; height: 24px;
      pointer-events: none; z-index: 2147483647; will-change: transform;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.35));
    }
    #__scursor svg { display: block; }
    #__scursor.pressed svg { transform: scale(.86); }

    #__sripple {
      position: fixed; left: 0; top: 0; width: 14px; height: 14px;
      margin: -7px 0 0 -7px; border-radius: 999px; pointer-events: none;
      z-index: 2147483646; background: rgba(190,18,60,.40); opacity: 0; transform: scale(.4);
    }
    #__sripple.go { animation: __sripple 460ms cubic-bezier(.2,.7,.3,1) forwards; }
    @keyframes __sripple {
      0%   { opacity: .5; transform: scale(.35); }
      100% { opacity: 0;  transform: scale(2.8); }
    }
  `;

  function injectStyle() {
    if (document.getElementById("__sfx-style")) return;
    const root = document.head || document.documentElement;
    if (!root) return; // the parser has not created the document yet
    const style = document.createElement("style");
    style.id = "__sfx-style";
    style.textContent = CSS;
    root.appendChild(style);
  }

  // ------------------------------------------------------- driver API
  // Declared FIRST: at init-script time the document may be empty, and the
  // recorder must be able to talk to the overlay the moment the page exists.
  window.__showcase = {
    __x: -60,
    __y: -60,
    ready: true,
    setCursor(x, y) {
      ensureCursor();
      cursorX = x;
      cursorY = y;
      targetX = x;
      targetY = y;
      window.__showcase.__x = x;
      window.__showcase.__y = y;
    },
    setCursorTarget(x, y) {
      ensureCursor();
      targetX = x;
      targetY = y;
      window.__showcase.__x = x;
      window.__showcase.__y = y;
    },
    // The app centres every page in a max-w-4xl column, so a 1920px frame
    // would be half empty. Scaling the app root makes it lay out for a
    // narrower window and render at full resolution.
    setZoom(z) {
      const root = document.getElementById("root");
      if (root) root.style.zoom = String(z);
    },
    hideCursor() {
      if (cursorEl) cursorEl.style.opacity = "0";
    },
    showCursor() {
      if (cursorEl) cursorEl.style.opacity = "1";
    },
    scrollTo(y, ms = 700) {
      return new Promise((resolve) => {
        const from = window.scrollY;
        const delta = y - from;
        const started = performance.now();
        function step(now) {
          const p = Math.min(1, (now - started) / ms);
          const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          window.scrollTo(0, from + delta * eased);
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    },
  };

  injectStyle();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyle, { once: true });
  }

  // ---------------------------------------------------------------- cursor
  const CURSOR_SVG =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2.5 1.8 L2.5 19.0 L7.4 14.4 L10.4 21.2 L13.7 19.6 L10.7 13.1 L17.3 12.7 Z" ' +
    'fill="#ffffff" stroke="#0a0a0a" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  let cursorEl = null;
  let rippleEl = null;
  let cursorX = -60;
  let cursorY = -60;
  let targetX = -60;
  let targetY = -60;

  function ensureCursor() {
    if (cursorEl && cursorEl.isConnected) return;
    cursorEl = document.createElement("div");
    cursorEl.id = "__scursor";
    cursorEl.innerHTML = CURSOR_SVG;
    document.body.appendChild(cursorEl);

    rippleEl = document.createElement("div");
    rippleEl.id = "__sripple";
    document.body.appendChild(rippleEl);
  }

  function paint() {
    if (!cursorEl) return;
    // the drawn cursor chases the commanded point with a spring, so a move
    // reads as a hand travelling rather than a teleporting arrow
    const dx = targetX - cursorX;
    const dy = targetY - cursorY;
    const distance = Math.hypot(dx, dy);
    const gain = distance > 260 ? 0.16 : 0.13;
    cursorX += dx * gain;
    cursorY += dy * gain;
    // a couple of pixels of hand tremor around the commanded point
    const jx = (Math.random() - 0.5) * 0.9;
    const jy = (Math.random() - 0.5) * 0.9;
    cursorEl.style.transform = `translate(${cursorX + jx}px, ${cursorY + jy}px)`;
    requestAnimationFrame(paint);
  }

  document.addEventListener("mousedown", (event) => {
    ensureCursor();
    if (rippleEl) {
      rippleEl.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      rippleEl.classList.remove("go");
      void rippleEl.offsetWidth;
      rippleEl.classList.add("go");
    }
    if (cursorEl) cursorEl.classList.add("pressed");
  });
  document.addEventListener("mouseup", () => {
    if (cursorEl) cursorEl.classList.remove("pressed");
  });

  // ------------------------------------------------------- route crossfade
  let fadeTimer = null;
  function onNavigate() {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("sfx-out");
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => {
      main.classList.remove("sfx-out");
      main.classList.add("sfx-in");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => main.classList.remove("sfx-in")),
      );
    }, 180);
  }

  const rawPush = history.pushState.bind(history);
  const rawReplace = history.replaceState.bind(history);
  history.pushState = function (...args) {
    const result = rawPush(...args);
    onNavigate();
    return result;
  };
  history.replaceState = function (...args) {
    const result = rawReplace(...args);
    onNavigate();
    return result;
  };
  window.addEventListener("popstate", onNavigate);

  function boot() {
    ensureCursor();
    requestAnimationFrame(paint);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
