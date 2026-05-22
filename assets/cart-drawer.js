/**
 * Cart drawer controller.
 *
 * Open/close via `data-cart-trigger` (any element with this attribute opens
 * the drawer; clicking the overlay, an element with `data-cart-close`, or
 * pressing Escape closes it).
 *
 * Quantity steppers and item removal mutate the cart via Shopify's Ajax Cart
 * API (`/cart/change.js`). The drawer stays open across mutations: we update
 * the row's qty + line price, the total, and the count badge in place from
 * the JSON response. When the last item is removed we full-reload so the
 * empty state renders cleanly.
 */
(function () {
  'use strict';

  const drawer = document.querySelector('[data-cart-drawer]');
  if (!drawer) return;

  // Currency formatter — Cham is INR-only, no decimals (matches the React
  // formatPrice helper). The Shopify Ajax response gives prices as integer
  // paise; we divide by 100 before formatting.
  const moneyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
  function formatMoney(cents) {
    return moneyFormatter.format(Math.round(cents) / 100);
  }

  function open() {
    drawer.setAttribute('aria-hidden', 'false');
    document.body.setAttribute('data-drawer-open', 'true');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    drawer.setAttribute('aria-hidden', 'true');
    document.body.removeAttribute('data-drawer-open');
    document.body.style.overflow = '';
  }

  // Apply a fresh cart object to the drawer in place: per-line qty + line
  // price, the bottom total, and the header count badge.
  function applyCart(cart, changedRow, removed) {
    if (removed && changedRow) {
      changedRow.remove();
    } else if (changedRow) {
      const lineKey = changedRow.getAttribute('data-line-key');
      const item = (cart.items || []).find((it) => it.key === lineKey);
      if (item) {
        const qtyEl = changedRow.querySelector('.cart-drawer__qty-value');
        const linePriceEl = changedRow.querySelector('.cart-drawer__item-line-price');
        if (qtyEl) qtyEl.textContent = item.quantity;
        if (linePriceEl) linePriceEl.textContent = formatMoney(item.final_line_price);
      }
      changedRow.removeAttribute('data-loading');
    }

    // Bottom total.
    const totalEl = drawer.querySelector('.cart-drawer__total-amount');
    if (totalEl) totalEl.textContent = formatMoney(cart.total_price);

    // Drawer header count and global cart-trigger badges.
    const countText = drawer.querySelector('[data-cart-count-text]');
    if (countText) {
      countText.textContent = cart.item_count > 0 ? '(' + cart.item_count + ')' : '';
    }
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = cart.item_count;
      el.setAttribute('data-cart-count', cart.item_count);
    });

    // Empty cart needs the full empty-state markup — reload for that one case.
    if (cart.item_count === 0) {
      window.location.assign(window.location.pathname + '?cart=open');
    }
  }

  // Open: any element with data-cart-trigger
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-cart-trigger]');
    if (trigger) {
      e.preventDefault();
      open();
      return;
    }
    const closer = e.target.closest('[data-cart-close]');
    if (closer && drawer.contains(closer)) {
      // For navigation links (anchors with a real href), let the browser
      // navigate. The next page load renders the drawer in its default
      // closed state, so no explicit close() is needed.
      const isNavLink = closer.tagName === 'A'
        && closer.getAttribute('href')
        && closer.getAttribute('href') !== '#';
      if (isNavLink) return;
      e.preventDefault();
      close();
      return;
    }
  });

  // Esc closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.getAttribute('aria-hidden') === 'false') {
      close();
    }
  });

  // Qty stepper + remove — in-place rehydration via /cart/change.js JSON.
  // We identify the line by its key (stable) rather than line index, because
  // the gift wrap product is hidden from the items list — DOM position no
  // longer matches Shopify's 1-based line numbering.
  drawer.addEventListener('click', async (e) => {
    const qtyBtn = e.target.closest('[data-cart-qty]');
    const removeBtn = e.target.closest('[data-cart-remove]');
    if (!qtyBtn && !removeBtn) return;

    e.preventDefault();
    const target = qtyBtn || removeBtn;
    const row = target.closest('[data-line-key]');
    if (!row) return;

    const lineKey = row.getAttribute('data-line-key');
    if (!lineKey) return;

    let newQty;
    if (qtyBtn) {
      const delta = parseInt(qtyBtn.getAttribute('data-delta'), 10);
      const current = parseInt(row.querySelector('.cart-drawer__qty-value').textContent, 10) || 0;
      newQty = Math.max(0, current + delta);
    } else {
      newQty = 0;
    }

    row.setAttribute('data-loading', 'true');
    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineKey, quantity: newQty }),
      });
      if (!res.ok) throw new Error('Cart change failed: ' + res.status);
      const cart = await res.json();
      applyCart(cart, row, newQty === 0);
    } catch (err) {
      console.error('Cart change failed', err);
      row.removeAttribute('data-loading');
    }
  });

  // Open the drawer automatically if a `?cart=open` query param is present
  // (useful after add-to-cart redirects from product/quick-add forms in future).
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('cart') === 'open') {
    open();
  }

  // Discount form — apply via Shopify's /discount/<code>?redirect=... URL.
  // We round-trip through a redirect so Shopify can validate and apply server-side.
  // After return, if the attempted code didn't land in the applied list we
  // surface the error inline (matches the prod-site UX).
  const discountForm = drawer.querySelector('[data-discount-form]');
  if (discountForm) {
    discountForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = discountForm.querySelector('[data-discount-input]');
      if (!input) return;
      const code = input.value.trim();
      if (!code) return;
      const redirect = window.location.pathname + '?cart=open&attempted_discount=' + encodeURIComponent(code);
      window.location.assign('/discount/' + encodeURIComponent(code) + '?redirect=' + encodeURIComponent(redirect));
    });
  }

  // After a discount redirect, compare the attempted code against the applied
  // discounts rendered server-side. If absent, show the error message. Either
  // way, expand the discount section so the user sees the outcome.
  const attempted = urlParams.get('attempted_discount');
  if (attempted) {
    const discountDetails = drawer.querySelector('.cart-drawer__discount');
    if (discountDetails) discountDetails.open = true;
    const applied = Array.from(drawer.querySelectorAll('.cart-drawer__applied-discounts li'))
      .map((li) => li.textContent.toLowerCase());
    const wasApplied = applied.some((text) => text.includes(attempted.toLowerCase()));
    if (!wasApplied) {
      const errorEl = drawer.querySelector('[data-discount-error]');
      if (errorEl) errorEl.hidden = false;
    }
    // Clean up the URL after we've consumed the param.
    const url = new URL(window.location);
    url.searchParams.delete('attempted_discount');
    url.searchParams.delete('cart');
    window.history.replaceState({}, '', url.toString());
  } else if (urlParams.get('cart') === 'open') {
    // Clean cart param even when there's no attempted_discount.
    const url = new URL(window.location);
    url.searchParams.delete('cart');
    window.history.replaceState({}, '', url.toString());
  }

  // ---- Gift message ----
  // Save the textarea contents to the `Gift Message` cart
  // attribute. Debounce while typing (600ms idle) and force-save on blur, so
  // we don't spam /cart/update.js but never lose the latest value.
  const messageInput = drawer.querySelector('[data-cart-gift-message]');
  const messageCount = drawer.querySelector('[data-cart-gift-message-count]');
  const messageStatus = drawer.querySelector('[data-cart-gift-message-status]');
  if (messageInput) {
    let messageTimer = null;
    let lastSavedMessage = messageInput.value;

    async function saveMessage() {
      const value = messageInput.value;
      if (value === lastSavedMessage) return;
      try {
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ attributes: { 'Gift Message': value } }),
        });
        lastSavedMessage = value;
        if (messageStatus) {
          messageStatus.hidden = false;
          setTimeout(() => { messageStatus.hidden = true; }, 1800);
        }
      } catch (err) {
        console.error('Save gift message failed', err);
      }
    }

    messageInput.addEventListener('input', () => {
      if (messageCount) messageCount.textContent = String(messageInput.value.length);
      if (messageStatus) messageStatus.hidden = true;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(saveMessage, 600);
    });

    messageInput.addEventListener('blur', () => {
      clearTimeout(messageTimer);
      saveMessage();
    });
  }
})();
