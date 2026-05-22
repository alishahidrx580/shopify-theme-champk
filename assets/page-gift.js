/**
 * Build-your-own gift box controller.
 *
 * Each [data-gift-product] row carries the variant id, unit price (paise),
 * and product name as data attributes. Selections are tracked client-side
 * keyed by variant id. The CTA POSTs the selected variants in a single
 * /cart/add.js request, then writes the gift message to the Gift Message
 * cart attribute via /cart/update.js. Finally the page reloads with
 * ?cart=open so cart-drawer.js opens it (matching the add-to-cart pattern
 * used elsewhere in this theme).
 */
(function () {
  'use strict';

  const root = document.querySelector('[data-page-gift]');
  if (!root) return;

  const moneyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
  const formatMoney = (cents) => moneyFormatter.format(Math.round(cents) / 100);

  const messageMax = parseInt(root.dataset.messageMax || '240', 10);

  // selections: variantId -> { qty, price, name }
  const selections = new Map();
  let giftMessage = '';

  /* ---------- product rows ---------- */
  root.querySelectorAll('[data-gift-product]').forEach((row) => {
    const variantId = row.dataset.variantId;
    const price = parseInt(row.dataset.price || '0', 10);
    const name = row.dataset.name || '';
    const addBtn = row.querySelector('[data-gift-add]');
    const qtyWrap = row.querySelector('[data-gift-qty-wrap]');
    const qtyValue = row.querySelector('[data-gift-qty-value]');
    const check = row.querySelector('[data-gift-check]');

    function paint() {
      const entry = selections.get(variantId);
      const qty = entry ? entry.qty : 0;
      const isSelected = qty > 0;
      row.dataset.selected = isSelected ? 'true' : 'false';
      addBtn.hidden = isSelected;
      qtyWrap.hidden = !isSelected;
      check.hidden = !isSelected;
      qtyValue.textContent = String(qty);
    }

    function setQty(qty) {
      if (qty <= 0) {
        selections.delete(variantId);
      } else {
        selections.set(variantId, { qty, price, name });
      }
      paint();
      renderSummary();
    }

    addBtn.addEventListener('click', () => setQty(1));

    qtyWrap.querySelectorAll('[data-gift-qty-delta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.giftQtyDelta || '0', 10);
        const current = selections.get(variantId)?.qty || 0;
        setQty(current + delta);
      });
    });

    paint();
  });

  /* ---------- message ---------- */
  const messageInput = root.querySelector('[data-gift-message]');
  const messageCount = root.querySelector('[data-gift-message-count]');
  if (messageInput) {
    messageInput.addEventListener('input', (e) => {
      let value = e.target.value;
      if (value.length > messageMax) value = value.slice(0, messageMax);
      e.target.value = value;
      giftMessage = value;
      if (messageCount) messageCount.textContent = String(value.length);
    });
  }

  /* ---------- summary ---------- */
  const emptyEl = root.querySelector('[data-gift-empty]');
  const detailEl = root.querySelector('[data-gift-detail]');
  const itemsEl = root.querySelector('[data-gift-summary-items]');
  const totalEl = root.querySelector('[data-gift-total]');
  const submitBtn = root.querySelector('[data-gift-submit]');
  const submitLabel = root.querySelector('[data-gift-submit-label]');
  const idleLabel = submitLabel ? submitLabel.textContent.trim() : 'Add gift pack to bag';

  function renderSummary() {
    const entries = [...selections.values()];
    const itemCount = entries.reduce((sum, e) => sum + e.qty, 0);
    const total = entries.reduce((sum, e) => sum + e.qty * e.price, 0);

    if (itemCount === 0) {
      emptyEl.hidden = false;
      detailEl.hidden = true;
      submitBtn.disabled = true;
      submitLabel.textContent = idleLabel;
      return;
    }

    emptyEl.hidden = true;
    detailEl.hidden = false;
    submitBtn.disabled = false;

    itemsEl.innerHTML = entries
      .map(
        (e) => `
        <li>
          <span>${escapeHtml(e.name)} <span class="qty">× ${e.qty}</span></span>
          <span class="price">${formatMoney(e.qty * e.price)}</span>
        </li>`,
      )
      .join('');

    totalEl.textContent = formatMoney(total);
    submitLabel.textContent = `${idleLabel} — ${formatMoney(total)}`;
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ---------- submit ---------- */
  submitBtn.addEventListener('click', async () => {
    if (selections.size === 0) return;
    submitBtn.setAttribute('data-loading', 'true');
    submitBtn.disabled = true;

    const items = [...selections.entries()].map(([id, e]) => ({
      id: Number(id),
      quantity: e.qty,
    }));

    try {
      const addRes = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!addRes.ok) {
        const data = await addRes.json().catch(() => ({}));
        throw new Error(data.description || data.message || 'Add failed');
      }

      // Persist the gift message as a cart-level attribute so the cart
      // drawer + order notification can surface it. An empty value clears
      // any previously saved message.
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          attributes: { 'Gift Message': giftMessage },
        }),
      });

      const url = new URL(window.location.href);
      url.searchParams.set('cart', 'open');
      window.location.assign(url.toString());
    } catch (err) {
      console.error('Gift add to bag failed', err);
      submitBtn.removeAttribute('data-loading');
      submitBtn.disabled = false;
    }
  });

  /* ---------- initial paint ---------- */
  renderSummary();
})();
