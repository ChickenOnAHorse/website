/* COAH Wires Debt — populate account page (no inline JS)
   - Edit DEFAULT_DATA below, or pass query params to override:
     /wiresdebt?name=Alex&last4=8842&debt=15230.42&due=2025-09-10
   - You can also define TX rows here or later fetch from a sheet.
*/

(() => {
  const fmtUSD = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'2-digit' });
  };

  // ---- Defaults you can edit now ----
  const DEFAULT_DATA = {
    name: 'Friend Name',
    last4: '1234',
    debt: 0,                // positive = they owe you
    lastPayment: 0,
    lastPaymentDate: '',
    nextDue: '',            // e.g. '2025-09-10'
    status: 'Current',
    // Transactions: most-recent first. Amount positive = they owe (charge), negative = payment.
    tx: [
      // { date:'2025-08-18', desc:'Skin purchase coverage', amount: 500.00, balance: 500.00 },
      // { date:'2025-08-10', desc:'Payment — Zelle', amount: -200.00, balance: 300.00 },
    ],
    // Payment details to copy
    payText:
`Payment options (preferred → other):
• Zelle: your@email
• Wire: Bank XYZ, Routing 123456789, Acct 000123456, Ref last-4.
• Notes: Please include ${'**** ' + '1234'} in memo.`
  };

  // ---- Read overrides from query string ----
  const params = new URLSearchParams(location.search);
  const data = structuredClone(DEFAULT_DATA);
  if (params.get('name'))   data.name   = params.get('name');
  if (params.get('last4'))  data.last4  = params.get('last4');
  if (params.get('debt'))   data.debt   = Number(params.get('debt'));
  if (params.get('last'))   data.lastPayment = Number(params.get('last'));
  if (params.get('lastdt')) data.lastPaymentDate = params.get('lastdt');
  if (params.get('due'))    data.nextDue = params.get('due');
  if (params.get('status')) data.status  = params.get('status');

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const acctMeta = $('#acctMeta');
  const kBalance = $('#kpi-balance');
  const kLastPay = $('#kpi-lastpay');
  const kDue     = $('#kpi-due');
  const kStatus  = $('#kpi-status');
  const tBody    = $('#txTable tbody');
  const cardNum  = $('#card-number');
  const cardName = $('#card-name');
  const payInstr = $('#pay-instructions');
  const copyBtn  = $('#copyBtn');
  const copyDone = $('#copyDone');

  // ---- Fill header / KPIs ----
  acctMeta.textContent = `Account • **** ${data.last4} • ${data.name}`;
  kBalance.textContent = fmtUSD.format(data.debt);
  kLastPay.textContent = data.lastPayment ? `${fmtUSD.format(data.lastPayment)} • ${fmtDate(data.lastPaymentDate)}` : '—';
  kDue.textContent     = data.nextDue ? fmtDate(data.nextDue) : '—';
  kStatus.textContent  = data.status;

  // Color status based on debt
  const balanceBox = kBalance.closest('.kpi');
  balanceBox.classList.toggle('bad', data.debt > 0);
  balanceBox.classList.toggle('good', data.debt <= 0);

  // ---- Card ----
  cardNum.textContent  = `**** **** **** ${data.last4}`;
  cardName.textContent = (data.name || '').toUpperCase();

  // ---- Transactions table ----
  if (data.tx.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 4;
    td.textContent = 'No transactions to display.'; td.className = 'muted';
    tr.appendChild(td); tBody.appendChild(tr);
  } else {
    for (const row of data.tx) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = fmtDate(row.date);
      const td2 = document.createElement('td'); td2.textContent = row.desc || '';
      const td3 = document.createElement('td'); td3.textContent = fmtUSD.format(row.amount); td3.className='num';
      const td4 = document.createElement('td'); td4.textContent = fmtUSD.format(row.balance); td4.className='num';
      tr.append(td1,td2,td3,td4); tBody.appendChild(tr);
    }
  }

  // ---- Payment text / copy button ----
  // Personalize the pay text with name + last-4 if present:
  const personalized = (DEFAULT_DATA.payText || '').replace('Friend', data.name).replace('1234', data.last4);
  payInstr.textContent = personalized;

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(personalized);
      copyDone.style.display = 'inline';
      setTimeout(() => copyDone.style.display = 'none', 1600);
    } catch {
      alert('Copy failed. Select and copy the text manually.');
    }
  });

  // ---- Expose a small API so you can push data from console or another script ----
  window.WIRESDEBT = {
    set(data2){
      // merge and re-render a few key fields
      Object.assign(data, data2 || {});
      acctMeta.textContent = `Account • **** ${data.last4} • ${data.name}`;
      kBalance.textContent = fmtUSD.format(data.debt);
      kDue.textContent     = data.nextDue ? fmtDate(data.nextDue) : '—';
      kStatus.textContent  = data.status || '—';
      cardNum.textContent  = `**** **** **** ${data.last4}`;
      cardName.textContent = (data.name || '').toUpperCase();
    }
  };
})();
