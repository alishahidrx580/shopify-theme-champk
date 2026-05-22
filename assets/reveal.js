/**
 * Reveal-on-scroll module.
 *
 * Replaces the React `Reveal` component (src/components/Reveal.tsx).
 * Observes any element with `data-reveal` and applies the `.in` class when
 * it enters the viewport, triggering the CSS transition defined in
 * critical.css (.reveal -> .reveal.in).
 *
 * Honours `prefers-reduced-motion: reduce` and Shopify's editor designMode by
 * short-circuiting the observer and applying `.in` immediately, so editors
 * never see blank sections.
 *
 * Optional per-element settings via data attributes:
 *   data-reveal-delay="120"   (milliseconds before applying .in)
 */
(function () {
  'use strict';

  const SELECTOR = '[data-reveal]';

  function showImmediately() {
    document.querySelectorAll(SELECTOR).forEach((el) => el.classList.add('in'));
  }

  function init() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const inDesignMode = window.Shopify && window.Shopify.designMode === true;

    if (prefersReducedMotion || inDesignMode || !('IntersectionObserver' in window)) {
      showImmediately();
      observeNew();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
          if (delay > 0) {
            setTimeout(() => el.classList.add('in'), delay);
          } else {
            el.classList.add('in');
          }
          observer.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );

    document.querySelectorAll(SELECTOR).forEach((el) => observer.observe(el));

    // Pick up elements added later (cart drawer line items, AJAX'd product grids, etc.)
    observeNew(observer);
  }

  function observeNew(observer) {
    if (!('MutationObserver' in window)) return;
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches(SELECTOR)) {
            observer ? observer.observe(node) : node.classList.add('in');
          }
          if (node.querySelectorAll) {
            node.querySelectorAll(SELECTOR).forEach((el) => {
              observer ? observer.observe(el) : el.classList.add('in');
            });
          }
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-observe when the theme editor injects/swaps sections.
  document.addEventListener('shopify:section:load', init);
  document.addEventListener('shopify:section:select', () => {
    document.querySelectorAll(SELECTOR).forEach((el) => el.classList.add('in'));
  });
})();
