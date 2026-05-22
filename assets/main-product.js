/**
 * Main product section controller.
 *
 * Responsibilities:
 *   - Gallery thumbnail click → swap the active main image (CSS opacity toggle).
 *   - Quantity stepper (+ / − / direct input) clamped to >= 1.
 *   - Variant resolver: when option radios change, find the matching variant
 *     from the product JSON, update the hidden `id` input, refresh the price /
 *     compare-at / save% / ATC label / disabled state.
 *   - Form submit: POST to /cart/add.js, then either reload with `?cart=open`
 *     so cart-drawer.js opens the drawer (Add to cart), or redirect straight
 *     to /checkout (Buy now). The triggering button is read from `e.submitter`.
 */
(function () {
  'use strict';

  const PRICE_SENTINEL = '__PDP_PRICE__';
  const moneyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

  function formatMoney(cents) {
    return moneyFormatter.format(Math.round(cents) / 100);
  }

  document.querySelectorAll('[data-product-section]').forEach((section) => {
    initSection(section);
  });

  function initSection(section) {
    const variantsScript = section.querySelector('[data-product-variants-json]');
    let variants = [];
    if (variantsScript) {
      try {
        variants = JSON.parse(variantsScript.textContent.trim());
      } catch (err) {
        console.error('Failed to parse product variants JSON', err);
      }
    }

    initGallery(section);
    initZoom(section);
    const form = section.querySelector('[data-product-form]');
    if (form) {
      initQty(form);
      initVariants(section, form, variants);
      initSubmit(form);
    }
  }

  // -------- Gallery --------
  function initGallery(section) {
    const thumbs = section.querySelectorAll('[data-gallery-thumb]');
    const images = section.querySelectorAll('[data-gallery-image]');
    if (!images.length) return;

    function setActive(index) {
      if (index < 0) index = images.length - 1;
      if (index >= images.length) index = 0;
      const indexStr = String(index);
      thumbs.forEach((t) => {
        const isActive = t.getAttribute('data-index') === indexStr;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      images.forEach((img) => {
        img.classList.toggle('is-active', img.getAttribute('data-index') === indexStr);
      });
    }

    function activeIndex() {
      const found = Array.from(images).findIndex((img) => img.classList.contains('is-active'));
      return found >= 0 ? found : 0;
    }

    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        setActive(parseInt(thumb.getAttribute('data-index'), 10) || 0);
      });
    });

    // Touch swipe on the main image (phone) → previous / next photo.
    const main = section.querySelector('[data-gallery-main]');
    if (main && images.length > 1) {
      const SWIPE_THRESHOLD = 40;
      let startX = 0;
      let startY = 0;
      let swiping = false;

      main.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
        swiping = false;
      }, { passive: true });

      main.addEventListener('touchmove', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        // Treat as a swipe once horizontal movement clearly dominates.
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) swiping = true;
      }, { passive: true });

      main.addEventListener('touchend', (e) => {
        if (!swiping) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        // Cancel the synthesized click so the zoom dialog doesn't open.
        e.preventDefault();
        setActive(dx < 0 ? activeIndex() + 1 : activeIndex() - 1);
      }, { passive: false });

      // Backup guard: block the click that may still follow a swipe.
      main.addEventListener('click', (e) => {
        if (!swiping) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        swiping = false;
      }, true);
    }
  }

  // -------- Zoom dialog --------
  function initZoom(section) {
    const trigger = section.querySelector('[data-zoom-trigger]');
    const dialog = section.querySelector('[data-zoom-dialog]');
    if (!trigger || !dialog) return;

    const images = Array.from(section.querySelectorAll('[data-gallery-image]'));
    if (!images.length) return;

    const zoomImg = dialog.querySelector('[data-zoom-img]');
    const counter = dialog.querySelector('[data-zoom-counter]');
    const prevBtn = dialog.querySelector('[data-zoom-prev]');
    const nextBtn = dialog.querySelector('[data-zoom-next]');
    const closeBtn = dialog.querySelector('[data-zoom-close]');
    let current = 0;

    function activeIndex() {
      const found = images.findIndex((img) => img.classList.contains('is-active'));
      return found >= 0 ? found : 0;
    }

    function setImage(index) {
      if (index < 0) index = images.length - 1;
      if (index >= images.length) index = 0;
      current = index;
      const src = images[index].getAttribute('data-zoom-src') || images[index].getAttribute('src');
      zoomImg.src = src;
      zoomImg.alt = images[index].getAttribute('alt') || '';
      if (counter) counter.textContent = (index + 1) + ' / ' + images.length;
    }

    function open() {
      setImage(activeIndex());
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      document.body.setAttribute('data-zoom-open', 'true');
    }

    function close() {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      document.body.removeAttribute('data-zoom-open');
      // Return focus to the trigger for accessibility.
      trigger.focus({ preventScroll: true });
    }

    trigger.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (prevBtn) prevBtn.addEventListener('click', () => setImage(current - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => setImage(current + 1));
    if (zoomImg) zoomImg.addEventListener('click', close);

    // Click on backdrop (dialog itself, not a child) → close.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });

    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setImage(current - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setImage(current + 1);
      }
      // ESC handled natively by <dialog> via the 'cancel' event.
    });

    dialog.addEventListener('cancel', () => {
      document.body.removeAttribute('data-zoom-open');
    });
  }

  // -------- Quantity stepper --------
  function initQty(form) {
    const input = form.querySelector('[data-qty-input]');
    if (!input) return;

    form.querySelectorAll('[data-qty-delta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.getAttribute('data-qty-delta'), 10) || 0;
        const next = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
        input.value = next;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    input.addEventListener('change', () => {
      const v = Math.max(1, parseInt(input.value, 10) || 1);
      input.value = v;
      updateAtcLabel(form);
    });
    input.addEventListener('input', () => updateAtcLabel(form));
  }

  // -------- Variants --------
  function initVariants(section, form, variants) {
    const radios = form.querySelectorAll('[data-option-position]');
    if (!radios.length || !variants.length) return;

    radios.forEach((radio) => {
      radio.addEventListener('change', () => onVariantChange(section, form, variants));
    });
  }

  function onVariantChange(section, form, variants) {
    const selected = readSelectedOptions(form);
    const match = variants.find((v) => optionsMatch(v, selected));
    if (!match) return;

    const idInput = form.querySelector('[data-variant-id]');
    if (idInput) idInput.value = match.id;

    form.setAttribute('data-unit-price', match.price);

    const priceDisplay = section.querySelector('[data-price-display]');
    if (priceDisplay) priceDisplay.textContent = formatMoney(match.price);

    const compareDisplay = section.querySelector('[data-compare-display]');
    const saveDisplay = section.querySelector('[data-save-display]');
    const hasCompare = match.compare_at_price && match.compare_at_price > match.price;
    if (compareDisplay) {
      compareDisplay.textContent = hasCompare ? formatMoney(match.compare_at_price) : '';
      compareDisplay.style.display = hasCompare ? '' : 'none';
    }
    if (saveDisplay) {
      if (hasCompare) {
        const pct = Math.round(((match.compare_at_price - match.price) / match.compare_at_price) * 100);
        saveDisplay.textContent = saveDisplay.getAttribute('data-template')
          ? saveDisplay.getAttribute('data-template').replace('{{ percent }}', pct)
          : `Save ${pct}%`;
        saveDisplay.style.display = '';
      } else {
        saveDisplay.style.display = 'none';
      }
    }

    // Toggle availability on both the Add to cart and Buy now buttons.
    form.querySelectorAll('[data-atc], [data-buy-now]').forEach((btn) => {
      if (match.available) {
        btn.removeAttribute('disabled');
      } else {
        btn.setAttribute('disabled', '');
      }
    });
    updateAtcLabel(form);

    // Reflect selected variant in the URL so refresh / share keeps it.
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', match.id);
      window.history.replaceState({}, '', url.toString());
    }
  }

  function readSelectedOptions(form) {
    const out = {};
    form.querySelectorAll('[data-option-position]:checked').forEach((radio) => {
      const pos = parseInt(radio.getAttribute('data-option-position'), 10);
      out[pos] = radio.value;
    });
    return out;
  }

  function optionsMatch(variant, selected) {
    for (const pos in selected) {
      const key = 'option' + pos;
      if (variant[key] !== selected[pos]) return false;
    }
    return true;
  }

  // -------- ATC label --------
  function updateAtcLabel(form) {
    const atc = form.querySelector('[data-atc]');
    if (!atc) return;
    const labelEl = atc.querySelector('[data-atc-label]');
    if (!labelEl) return;

    if (atc.hasAttribute('disabled')) {
      labelEl.textContent = atc.getAttribute('data-sold-out-label') || 'Sold out';
      return;
    }

    const unitPrice = parseInt(form.getAttribute('data-unit-price'), 10) || 0;
    const qty = parseInt(form.querySelector('[data-qty-input]')?.value, 10) || 1;
    const total = unitPrice * qty;
    const template = atc.getAttribute('data-label-template') || '';
    labelEl.textContent = template.replace(PRICE_SENTINEL, formatMoney(total));
  }

  // -------- Submit --------
  function initSubmit(form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Which button fired the submit — Add to cart or Buy now. `e.submitter`
      // is widely supported; fall back to the ATC button (also covers Enter
      // pressed inside the quantity field).
      const trigger = e.submitter || form.querySelector('[data-atc]');
      if (!trigger || trigger.hasAttribute('disabled')) return;

      const isBuyNow = trigger.hasAttribute('data-buy-now');
      trigger.setAttribute('data-loading', 'true');

      try {
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.description || data.message || 'Add to cart failed');
        }

        if (isBuyNow) {
          // Buy now skips the cart drawer — straight to checkout.
          window.location.assign('/checkout');
        } else {
          // Add to cart: reload with ?cart=open so cart-drawer.js opens it.
          const url = new URL(window.location.href);
          url.searchParams.set('cart', 'open');
          window.location.assign(url.toString());
        }
      } catch (err) {
        console.error('Add to cart failed', err);
        trigger.removeAttribute('data-loading');
      }
    });
  }
})();
