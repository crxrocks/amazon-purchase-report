// ==UserScript==
// @name         Amazon Purchase Report
// @namespace    local.amazon.purchase.report
// @version      1.4.2
// @description  Collect Amazon Payments transactions across pages and show purchased items in one date-filtered report.
// @match        https://www.amazon.com/cpe/yourpayments/transactions*
// @homepageURL  https://github.com/crxrocks/amazon-purchase-report
// @updateURL    https://raw.githubusercontent.com/crxrocks/amazon-purchase-report/main/Amazon_Purchase_Report.user.js
// @downloadURL  https://raw.githubusercontent.com/crxrocks/amazon-purchase-report/main/Amazon_Purchase_Report.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SELECTORS = {
    payment: '.apx-transactions-line-item-component-container',
    date: '.apx-transaction-date-container',
    order: 'a[href*="/gp/css/summary/edit.html"][href*="orderID="]'
  };
  const PAGE_DELAY = 700;
  const ORDER_DELAY = 550;
  const MAX_PAGES = 100;
  const REVIEW_STORAGE_KEY = 'amazon-purchase-report-reviewed-v1';

  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const money = (v) => clean(v).match(/-?\$[\d,]+(?:\.\d{2})?/g) || [];
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const isoMonthStart = () => `${isoToday().slice(0, 8)}01`;
  const parseDate = (text) => {
    const date = new Date(`${clean(text)} 12:00:00`);
    return Number.isNaN(date.valueOf()) ? null : date;
  };
  const isoDate = (date) => date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : '';
  const displayDate = (iso) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString() : '';
  const moneyValue = (value) => {
    const match = clean(value).match(/-?\$([\d,]+(?:\.\d{2})?)/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  };
  const dollars = (value) => `$${Math.abs(value).toFixed(2)}`;

  function installStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #apr-launch { position:fixed; right:18px; bottom:18px; z-index:2147483646; border:0; border-radius:22px;
        padding:12px 18px; background:#ff9900; color:#111; font:700 14px Arial; box-shadow:0 3px 14px #0005; cursor:pointer; }
      #apr-app { position:fixed; inset:0; z-index:2147483647; background:#f3f4f6; color:#111827;
        font:14px/1.4 Arial,sans-serif; display:none; overflow:auto; }
      #apr-app * { box-sizing:border-box; }
      #apr-app header { position:sticky; top:0; z-index:2; display:flex; gap:14px; align-items:center; padding:14px 20px;
        background:#131921; color:#fff; box-shadow:0 2px 7px #0004; }
      #apr-app h1 { font-size:20px; margin:0 auto 0 0; }
      #apr-app button { border:1px solid #9ca3af; border-radius:7px; background:#fff; padding:8px 12px; cursor:pointer; }
      #apr-app button.primary { background:#ff9900; border-color:#e68a00; color:#111; font-weight:700; }
      #apr-app button:disabled { opacity:.5; cursor:not-allowed; }
      #apr-controls { display:flex; flex-wrap:wrap; gap:12px; align-items:end; padding:18px 20px; background:#fff; border-bottom:1px solid #d1d5db; }
      #apr-controls label { display:grid; gap:4px; font-weight:700; }
      #apr-controls input { min-width:145px; padding:8px; border:1px solid #9ca3af; border-radius:6px; }
      #apr-status { padding:10px 20px; background:#fff7df; border-bottom:1px solid #ead7a1; min-height:41px; }
      #apr-summary { display:flex; gap:18px; flex-wrap:wrap; padding:12px 20px; font-weight:700; }
      #apr-table-wrap { margin:0 20px 28px; overflow:auto; background:#fff; border:1px solid #d1d5db; border-radius:8px; }
      #apr-table { width:100%; border-collapse:collapse; }
      #apr-table th { position:sticky; top:0; z-index:1; background:#e5e7eb; text-align:left; white-space:nowrap; }
      #apr-table th, #apr-table td { padding:9px 10px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
      #apr-table tr:hover td { background:#fffbea; }
      #apr-table tr.apr-reviewed td { background:#dcfce7; color:#4b5563; }
      #apr-table tr.apr-reviewed:hover td { background:#c7f3d5; }
      #apr-table tr.apr-reviewed td:nth-child(2) { text-decoration:line-through; text-decoration-color:#6b7280; }
      #apr-table tr.apr-group-even:not(.apr-reviewed) td { background:#f8fafc; }
      #apr-table tr.apr-group-even:not(.apr-reviewed):hover td { background:#f1f5f9; }
      #apr-table tr.apr-group-start td { border-top:3px solid #94a3b8; }
      #apr-table tr.apr-group-start:first-child td { border-top:0; }
      #apr-table tr.apr-group-end td { border-bottom:2px solid #cbd5e1; }
      #apr-table .num { text-align:right; white-space:nowrap; }
      #apr-table td.apr-item-price-cell { font-weight:700; font-variant-numeric:tabular-nums; }
      #apr-table td.apr-price-missing { white-space:normal; }
      #apr-table td.apr-charge-repeat { color:#6b7280; font-size:12px; }
      .apr-group-arrow { color:#64748b; font-weight:700; padding-left:4px; }
      .apr-total-main { font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; }
      .apr-price-detail { margin-top:4px; color:#475569; font-size:12px; line-height:1.35; }
      .apr-price-detail span { display:block; }
      .apr-price-warning { color:#b45309; font-weight:700; }
      .apr-price-match { color:#15803d; font-weight:700; }
      #apr-table .muted { color:#6b7280; }
      #apr-table a { color:#0066c0; }
      #apr-empty { padding:40px; text-align:center; color:#6b7280; }
      #apr-undo { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:3; display:none;
        align-items:center; gap:16px; max-width:min(620px,calc(100vw - 40px)); padding:11px 14px; border-radius:8px;
        background:#232f3e; color:#fff; box-shadow:0 4px 18px #0006; }
      #apr-undo button { border-color:#ffb84d; background:#ff9900; color:#111; font-weight:700; }
      .apr-error { color:#b12704; font-weight:700; }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    const launch = document.createElement('button');
    launch.id = 'apr-launch';
    launch.textContent = 'Amazon Purchase Report';
    document.body.appendChild(launch);

    const app = document.createElement('div');
    app.id = 'apr-app';
    app.innerHTML = `
      <header><h1>Amazon Purchase Report</h1><button id="apr-close">Close</button></header>
      <section id="apr-controls">
        <label>Start date<input id="apr-start" type="date" value="${isoMonthStart()}"></label>
        <label>End date<input id="apr-end" type="date" value="${isoToday()}"></label>
        <button id="apr-run" class="primary">Build report</button>
        <label>Filter results<input id="apr-filter" type="search" placeholder="Product or order…"></label>
        <label style="display:flex;grid-auto-flow:column;align-items:center;gap:7px;padding-bottom:8px;font-weight:400">
          <input id="apr-hide-reviewed" type="checkbox" style="min-width:auto" checked>Hide checked
        </label>
        <button id="apr-copy" disabled>Copy table</button>
        <button id="apr-csv" disabled>Download CSV</button>
      </section>
      <div id="apr-status">Choose a date range and click <b>Build report</b>.</div>
      <div id="apr-summary"></div>
      <div id="apr-table-wrap"><div id="apr-empty">No report loaded.</div>
        <table id="apr-table" hidden><thead><tr>
          <th>Transaction checked</th><th>Purchase date</th><th>Product</th><th class="num">Item price</th><th class="num">Transaction total</th>
          <th>Payment method</th><th>Order</th><th>Status</th>
        </tr></thead><tbody></tbody></table>
      </div>
      <div id="apr-undo"><span></span><button type="button">Undo</button></div>`;
    document.body.appendChild(app);
    launch.onclick = () => { app.style.display = 'block'; document.body.style.overflow = 'hidden'; };
    app.querySelector('#apr-close').onclick = () => { app.style.display = 'none'; document.body.style.overflow = ''; };
    return app;
  }

  function priorDate(row) {
    let level = row;
    for (let depth = 0; level && depth < 5; depth += 1, level = level.parentElement) {
      for (let node = level.previousElementSibling; node; node = node.previousElementSibling) {
        if (node.matches?.(SELECTORS.date)) return clean(node.textContent);
        const nested = node.querySelector?.(SELECTORS.date);
        if (nested) return clean(nested.textContent);
      }
    }
    return '';
  }

  function readPayments(doc) {
    return [...doc.querySelectorAll(SELECTORS.payment)].map((row) => {
      const link = row.querySelector(SELECTORS.order);
      if (!link) return null;
      const bold = [...row.querySelectorAll('.a-text-bold')].map((e) => clean(e.textContent));
      const charge = bold.find((v) => /^-?\$[\d,]+(?:\.\d{2})?$/.test(v)) || money(row.textContent)[0] || '';
      const paymentMethod = bold.find((v) => v !== charge) || '';
      const orderNumber = clean(link.textContent).replace(/^Order\s*#/i, '');
      const date = parseDate(priorDate(row));
      return { paymentDate: isoDate(date), charge, paymentMethod, orderNumber,
        orderUrl: new URL(link.getAttribute('href'), location.origin).href };
    }).filter(Boolean);
  }

  function pageDateBounds(doc) {
    const dates = [...doc.querySelectorAll(SELECTORS.date)].map((e) => parseDate(e.textContent)).filter(Boolean);
    return dates.length ? { newest: new Date(Math.max(...dates)), oldest: new Date(Math.min(...dates)) } : null;
  }

  function paginationForm(doc) {
    return [...doc.forms].find((form) => form.querySelector(SELECTORS.payment)) || null;
  }

  async function fetchNextPage(doc) {
    const form = paginationForm(doc);
    if (!form) return null;
    const next = [...form.querySelectorAll('input[type="submit"],button[type="submit"]')]
      .find((e) => (e.name || '').includes('DefaultNextPageNavigationEvent'));
    if (!next || next.disabled) return null;
    const body = new URLSearchParams();
    for (const element of form.elements) {
      if (!element.name || element.disabled) continue;
      if (/^(submit|button)$/i.test(element.type)) continue;
      if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) continue;
      body.append(element.name, element.value);
    }
    body.append(next.name, next.value || '');
    const response = await fetch(new URL(form.getAttribute('action') || location.href, location.href), {
      method: (form.method || 'POST').toUpperCase(), credentials: 'include', redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: body.toString()
    });
    if (!response.ok) throw new Error(`Payments page returned HTTP ${response.status}`);
    const text = await response.text();
    if (/Robot Check|captcha/i.test(text.slice(0, 5000))) throw new Error('Amazon requested a CAPTCHA');
    return new DOMParser().parseFromString(text, 'text/html');
  }

  async function collectPayments(start, end, setStatus) {
    let doc = document;
    const found = [];
    const seenPages = new Set();
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const bounds = pageDateBounds(doc);
      const payments = readPayments(doc);
      const signature = payments.map((p) => `${p.paymentDate}|${p.orderNumber}|${p.charge}`).join(';');
      if (!signature || seenPages.has(signature)) break;
      seenPages.add(signature);
      found.push(...payments.filter((p) => p.paymentDate >= start && p.paymentDate <= end));
      setStatus(`Scanning payment-history page ${page}… ${found.length} matching charge(s) found.`);
      if (bounds && isoDate(bounds.oldest) < start) break;
      await sleep(PAGE_DELAY);
      const next = await fetchNextPage(doc);
      if (!next) break;
      doc = next;
    }
    const unique = new Map(found.map((p) => [`${p.paymentDate}|${p.orderNumber}|${p.charge}|${p.paymentMethod}`, p]));
    return [...unique.values()].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }

  function isProductLink(a) {
    const href = a.getAttribute('href') || '';
    return /(?:\/dp\/|\/gp\/product\/)[A-Z0-9]{8,14}/i.test(href) && clean(a.textContent).length > 2 &&
      !a.closest('#nav-main,#navFooter,[role="navigation"],.navFooterVerticalRow');
  }

  function nearPrice(anchor) {
    let node = anchor;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const preferred = [...node.querySelectorAll('.a-color-price,.a-text-price,.a-price,.price,[class*="item-price"],[class*="order-item-price"],td:last-child')]
        .flatMap((e) => money(e.textContent));
      if (preferred.length) return preferred[0];
      const all = money(node.textContent);
      if (all.length === 1 && clean(node.textContent).length < 1600) return all[0];
    }
    return '';
  }

  function printableOrderUrl(url) {
    const printable = new URL(url);
    printable.pathname = printable.pathname.replace(/\/edit\.html$/i, '/print.html');
    return printable.href;
  }

  function itemIdentity(item) {
    return (item.productUrl.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{8,14})/i) || [])[1] || clean(item.product).toLowerCase();
  }

  function mergePrintablePrices(items, printableItems) {
    const prices = new Map(printableItems.filter((item) => item.itemPrice).map((item) => [itemIdentity(item), item.itemPrice]));
    return items.map((item) => ({ ...item, itemPrice: item.itemPrice || prices.get(itemIdentity(item)) || '' }));
  }

  function orderPlacedDate(doc, fallback) {
    const text = clean(doc.body?.textContent);
    const match = text.match(/Order placed\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i);
    return match ? isoDate(parseDate(match[1])) : fallback;
  }

  function itemsFromOrder(html, url, fallbackDate) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lead = `${doc.title} ${clean(doc.body?.textContent).slice(0, 1500)}`;
    if (/sign[ -]?in|enter your (?:email|mobile)/i.test(lead)) throw new Error('Amazon returned a sign-in page');
    if (/captcha|robot check/i.test(lead)) throw new Error('Amazon requested a CAPTCHA');
    const purchaseDate = orderPlacedDate(doc, fallbackDate);
    const seen = new Set();
    const items = [];
    for (const a of [...doc.querySelectorAll('a[href]')].filter(isProductLink)) {
      const product = clean(a.textContent) || clean(a.querySelector('img')?.alt);
      const productUrl = new URL(a.getAttribute('href'), url).href;
      const asin = (productUrl.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{8,14})/i) || [])[1] || productUrl;
      if (!product || seen.has(asin)) continue;
      seen.add(asin);
      items.push({ purchaseDate, product, itemPrice: nearPrice(a), productUrl });
    }
    return items;
  }

  async function addOrderDetails(payments, setStatus) {
    const cache = new Map();
    const rows = [];
    for (let i = 0; i < payments.length; i += 1) {
      const payment = payments[i];
      setStatus(`Reading order ${i + 1} of ${payments.length}: ${payment.orderNumber}`);
      try {
        let items = cache.get(payment.orderUrl);
        if (!items) {
          const response = await fetch(payment.orderUrl, { credentials: 'include', redirect: 'follow', cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          items = itemsFromOrder(await response.text(), payment.orderUrl, payment.paymentDate);
          if (items.some((item) => !item.itemPrice)) {
            const printUrl = printableOrderUrl(payment.orderUrl);
            if (printUrl !== payment.orderUrl) {
              try {
                const printResponse = await fetch(printUrl, { credentials: 'include', redirect: 'follow', cache: 'no-store' });
                if (printResponse.ok) {
                  const printableItems = itemsFromOrder(await printResponse.text(), printUrl, payment.paymentDate);
                  items = mergePrintablePrices(items, printableItems);
                }
              } catch (_) { /* Keep the original item list when the printable page is unavailable. */ }
            }
          }
          cache.set(payment.orderUrl, items);
          await sleep(ORDER_DELAY);
        }
        if (!items.length) rows.push({ ...payment, purchaseDate: payment.paymentDate, product: '', itemPrice: '', productUrl: '', status: 'Items not recognized' });
        else items.forEach((item) => rows.push({ ...payment, ...item, status: 'OK' }));
      } catch (error) {
        rows.push({ ...payment, purchaseDate: payment.paymentDate, product: '', itemPrice: '', productUrl: '', status: error.message });
      }
    }
    return rows;
  }

  function csvCell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }
  function reviewKey(row) {
    return [row.paymentDate, row.orderNumber, row.charge, row.productUrl || row.product].join('|');
  }
  function loadReviews() {
    try { return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function saveReview(row, checked) {
    const reviews = loadReviews();
    if (checked) reviews[reviewKey(row)] = true;
    else delete reviews[reviewKey(row)];
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews));
    row.reviewed = checked;
  }
  function applySavedReviews(rows) {
    const reviews = loadReviews();
    rows.forEach((row) => { row.reviewed = !!reviews[reviewKey(row)]; });
    return rows;
  }

  let undoTimer = null;
  function showUndo(app, transactionRows, previousStates, rows) {
    const undo = app.querySelector('#apr-undo');
    const first = transactionRows[0];
    undo.querySelector('span').textContent = `Marked transaction checked: Order ${first.orderNumber}`;
    undo.style.display = 'flex';
    clearTimeout(undoTimer);
    const dismiss = () => { undo.style.display = 'none'; clearTimeout(undoTimer); undoTimer = null; };
    undo.querySelector('button').onclick = () => {
      transactionRows.forEach((row, index) => saveReview(row, previousStates[index]));
      dismiss();
      render(app, rows);
    };
    undoTimer = setTimeout(dismiss, 10000);
  }
  function rowsToCsv(rows) {
    const columns = [['Checked Against YNAB','reviewed'],['Purchase Date','purchaseDate'],['Product','product'],['Item Price','itemPrice'],['Amazon Charge','charge'],
      ['Payment Method','paymentMethod'],['Order Number','orderNumber'],['Product URL','productUrl'],['Order URL','orderUrl'],['Status','status']];
    const value = (row, key) => key === 'reviewed' ? (row.reviewed ? 'Yes' : 'No') : row[key];
    return [columns.map(([h]) => csvCell(h)).join(','), ...rows.map((r) => columns.map(([,k]) => csvCell(value(r,k))).join(','))].join('\r\n');
  }

  function rowsToTsv(rows) {
    const columns = [['Checked Against YNAB','reviewed'],['Purchase Date','purchaseDate'],['Product','product'],['Item Price','itemPrice'],['Amazon Charge','charge'],
      ['Payment Method','paymentMethod'],['Order Number','orderNumber'],['Product URL','productUrl'],['Order URL','orderUrl'],['Status','status']];
    const cell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
    const value = (row, key) => key === 'reviewed' ? (row.reviewed ? 'Yes' : 'No') : row[key];
    return [columns.map(([h]) => h).join('\t'), ...rows.map((r) => columns.map(([,k]) => cell(value(r,k))).join('\t'))].join('\n');
  }

  function download(rows) {
    const blob = new Blob(['\uFEFF', rowsToCsv(rows)], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `amazon-purchases-${isoToday()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  function render(app, rows) {
    const tbody = app.querySelector('tbody');
    const table = app.querySelector('#apr-table');
    const empty = app.querySelector('#apr-empty');
    const filter = clean(app.querySelector('#apr-filter').value).toLowerCase();
    const hideReviewed = app.querySelector('#apr-hide-reviewed').checked;
    const allGroups = new Map();
    rows.forEach((row) => {
      const key = transactionKey(row);
      if (!allGroups.has(key)) allGroups.set(key, []);
      allGroups.get(key).push(row);
    });
    const transactionReviewed = new Map([...allGroups].map(([key, items]) => [key, items.every((item) => item.reviewed)]));
    const shown = rows.filter((r) => (!hideReviewed || !transactionReviewed.get(transactionKey(r))) &&
      (!filter || `${r.product} ${r.orderNumber} ${r.paymentMethod}`.toLowerCase().includes(filter)));
    const shownCounts = new Map();
    shown.forEach((row) => shownCounts.set(transactionKey(row), (shownCounts.get(transactionKey(row)) || 0) + 1));
    const groupIndexes = new Map([...allGroups.keys()].map((key, index) => [key, index]));
    const renderedTransactions = new Set();
    const renderedCounts = new Map();
    tbody.replaceChildren(...shown.map((r) => {
      const key = transactionKey(r);
      const transactionRows = allGroups.get(key);
      const isFirst = !renderedTransactions.has(key);
      renderedTransactions.add(key);
      const renderedCount = (renderedCounts.get(key) || 0) + 1;
      renderedCounts.set(key, renderedCount);
      const isLast = renderedCount === shownCounts.get(key);
      const tr = document.createElement('tr');
      tr.classList.toggle('apr-group-even', groupIndexes.get(key) % 2 === 0);
      tr.classList.toggle('apr-group-start', isFirst);
      tr.classList.toggle('apr-group-end', isLast);
      tr.classList.toggle('apr-reviewed', transactionRows.every((item) => item.reviewed));
      const reviewCell = document.createElement('td');
      if (isFirst) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = transactionRows.every((item) => item.reviewed);
        checkbox.setAttribute('aria-label', `Checked against YNAB: Order ${r.orderNumber}`);
        checkbox.addEventListener('change', () => {
          const previousStates = transactionRows.map((item) => !!item.reviewed);
          transactionRows.forEach((item) => saveReview(item, checkbox.checked));
          if (checkbox.checked) showUndo(app, transactionRows, previousStates, rows);
          render(app, rows);
        });
        reviewCell.appendChild(checkbox);
      } else {
        const arrow = document.createElement('span');
        arrow.className = 'apr-group-arrow'; arrow.textContent = '↳'; arrow.title = 'Same Amazon transaction';
        reviewCell.appendChild(arrow);
      }
      tr.appendChild(reviewCell);
      const itemPrice = r.itemPrice || 'Not shown by Amazon';
      const values = [displayDate(r.purchaseDate), r.product, itemPrice, isFirst ? r.charge : 'Same transaction', r.paymentMethod, r.orderNumber, r.status];
      values.forEach((value, i) => {
        const td = document.createElement('td');
        if (i === 1 && r.productUrl) { const a=document.createElement('a'); a.href=r.productUrl; a.target='_blank'; a.textContent=value; td.appendChild(a); }
        else if (i === 5) { const a=document.createElement('a'); a.href=r.orderUrl; a.target='_blank'; a.textContent=value; td.appendChild(a); }
        else if (i === 3 && isFirst) {
          const info = transactionPriceInfo(transactionRows);
          const total = document.createElement('div'); total.className = 'apr-total-main'; total.textContent = value; td.appendChild(total);
          const details = document.createElement('div'); details.className = 'apr-price-detail';
          const subtotal = document.createElement('span');
          subtotal.textContent = `${info.missing ? 'Known item prices' : 'Item subtotal'}: ${dollars(info.subtotal)}`;
          details.appendChild(subtotal);
          if (info.missing) {
            const warning = document.createElement('span'); warning.className = 'apr-price-warning';
            warning.textContent = `⚠ ${info.missing} item price${info.missing === 1 ? '' : 's'} not shown`;
            details.appendChild(warning);
          } else if (info.difference !== null && Math.abs(info.difference) <= 0.01) {
            const match = document.createElement('span'); match.className = 'apr-price-match'; match.textContent = '✓ Item prices match total';
            details.appendChild(match);
          } else if (info.difference !== null) {
            const difference = document.createElement('span'); difference.className = 'apr-price-warning';
            difference.textContent = `Difference: ${info.difference >= 0 ? '+' : '−'}${dollars(info.difference)} (tax, shipping or discount)`;
            details.appendChild(difference);
          }
          td.appendChild(details);
        } else td.textContent = value;
        if (i === 2 || i === 3) td.className='num';
        if (i === 2) td.classList.add(r.itemPrice ? 'apr-item-price-cell' : 'apr-price-missing');
        if (i === 3 && !isFirst) td.classList.add('apr-charge-repeat');
        if (i === 6 && value !== 'OK') td.className='apr-error';
        tr.appendChild(td);
      });
      return tr;
    }));
    table.hidden = !shown.length; empty.hidden = !!shown.length;
    if (!shown.length) empty.textContent = rows.length ? 'No rows match the filter.' : 'No purchases found in this date range.';
    updateSummary(app, rows, shown.length);
  }

  function transactionKey(row) {
    return [row.paymentDate, row.orderNumber, row.charge, row.paymentMethod].join('|');
  }

  function transactionPriceInfo(items) {
    const prices = items.map((item) => moneyValue(item.itemPrice));
    const known = prices.filter((value) => value !== null);
    const missing = prices.length - known.length;
    const subtotal = known.reduce((sum, value) => sum + value, 0);
    const total = moneyValue(items[0]?.charge);
    const difference = total === null ? null : total - subtotal;
    return { missing, subtotal, total, difference };
  }

  function updateSummary(app, rows, displayed) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = transactionKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    const checked = [...groups.values()].filter((items) => items.every((item) => item.reviewed)).length;
    app.querySelector('#apr-summary').innerHTML = `<span>${groups.size} Amazon charge(s)</span><span>${rows.length} product row(s)</span><span>${checked} transaction(s) checked</span><span>${displayed} product row(s) displayed</span>`;
  }

  installStyles();
  const app = buildUi();
  let reportRows = [];
  const status = (text, error=false) => { const e=app.querySelector('#apr-status'); e.textContent=text; e.className=error?'apr-error':''; };
  app.querySelector('#apr-filter').addEventListener('input', () => render(app, reportRows));
  app.querySelector('#apr-hide-reviewed').addEventListener('change', () => render(app, reportRows));
  app.querySelector('#apr-csv').onclick = () => download(reportRows);
  app.querySelector('#apr-copy').onclick = async () => {
    await navigator.clipboard.writeText(rowsToTsv(reportRows));
    status('Copied report to the clipboard.');
  };
  app.querySelector('#apr-run').onclick = async () => {
    const run = app.querySelector('#apr-run');
    const start = app.querySelector('#apr-start').value, end = app.querySelector('#apr-end').value;
    if (!start || !end || start > end) return status('Choose a valid start and end date.', true);
    run.disabled = true; reportRows = []; render(app, reportRows);
    app.querySelector('#apr-copy').disabled = true; app.querySelector('#apr-csv').disabled = true;
    try {
      const payments = await collectPayments(start, end, status);
      if (!payments.length) { status('No Amazon Payments transactions were found in that date range.'); return; }
      reportRows = applySavedReviews(await addOrderDetails(payments, status));
      render(app, reportRows);
      app.querySelector('#apr-copy').disabled = false; app.querySelector('#apr-csv').disabled = false;
      const warnings = reportRows.filter((r) => r.status !== 'OK').length;
      status(`Report complete: ${payments.length} charge(s), ${reportRows.length} product row(s).${warnings ? ` ${warnings} row(s) need review.` : ''}`);
    } catch (error) {
      console.error('Amazon Purchase Report:', error);
      status(`Report stopped: ${error.message}`, true);
    } finally { run.disabled = false; }
  };
})();
