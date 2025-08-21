(() => {
  // ===== CONFIG =====
  const PASSWORD_SHA256_HEX = "e0fe87b9ef1bd5b345269890a4f357dd7e531e7bba307ac691567600a049897f";
  const DEBUG_LOG_HASH = true; // set to false after you verify
  // ==================

  function showFatal(msg){
    const box = document.getElementById('fatal');
    if (!box) return;
    box.textContent = 'Error: ' + msg;
    box.style.display = 'block';
  }

  function ready(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else { fn(); }
  }

  ready(() => {
    try {
      const gateEl    = document.getElementById('gate');
      const contentEl = document.getElementById('content');
      const errEl     = document.getElementById('err');
      const warnEl    = document.getElementById('warn');
      const pwEl      = document.getElementById('pw');
      const enterBtn  = document.getElementById('enterBtn');
      const logoutBtn = document.getElementById('logoutBtn');

      if (!gateEl || !contentEl || !pwEl || !enterBtn) {
        showFatal('Missing expected DOM nodes. Did the HTML paste correctly?');
        return;
      }

      if (!PASSWORD_SHA256_HEX || /^(?:PASTE|YOUR_|)$/i.test(PASSWORD_SHA256_HEX)) {
        errEl.textContent = 'Password gate not configured: set PASSWORD_SHA256_HEX.';
        errEl.style.display = 'block';
      }

      const cryptoOK = (typeof window.crypto !== 'undefined') && (typeof window.crypto.subtle !== 'undefined');
      if (!cryptoOK) { warnEl.style.display = 'block'; }

      function showContent(){ gateEl.classList.add('hidden'); contentEl.classList.remove('hidden'); }
      function hideContent(){ contentEl.classList.add('hidden'); gateEl.classList.remove('hidden'); }

      const KEY = 'balance_authed';
      if (sessionStorage.getItem(KEY) === '1') showContent();

      function normalizeInput(s){ return (s || '').replace(/\u00A0/g,' ').trim(); }

      async function sha256Hex(str){
        // ✅ fixed: removed the extra "()"
        const enc = new TextEncoder().encode(str);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
      }

      async function tryLogin(e){
        if (e) e.preventDefault();
        errEl.style.display = 'none';
        const entered = normalizeInput(pwEl.value);
        if (!entered) {
          errEl.textContent = 'Please enter a password.';
          errEl.style.display = 'block';
          pwEl.focus(); return;
        }
        if (!cryptoOK) { errEl.textContent = 'Secure crypto unavailable (need HTTPS).'; errEl.style.display='block'; return; }

        const hash = await sha256Hex(entered);
        if (DEBUG_LOG_HASH) console.log('[balance] computed hash:', hash);
        if (hash === PASSWORD_SHA256_HEX) {
          sessionStorage.setItem(KEY, '1'); showContent();
        } else {
          errEl.textContent = 'Incorrect password.'; errEl.style.display='block'; pwEl.select();
        }
      }

      enterBtn.addEventListener('click', tryLogin);
      pwEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.keyCode === 13) tryLogin(e); });
      if (logoutBtn) logoutBtn.addEventListener('click', () => { sessionStorage.removeItem(KEY); hideContent(); pwEl.value=''; pwEl.focus(); });

      // Optional: seed balances via query (?csfloat=123 etc.)
      const params = new URLSearchParams(location.search);
      if (params.has('csfloat')) document.getElementById('b-csfloat').textContent = '$' + params.get('csfloat');
      if (params.has('skinport')) document.getElementById('b-skinport').textContent = '$' + params.get('skinport');
      if (params.has('steam'))   document.getElementById('b-steam').textContent   = '$' + params.get('steam');

    } catch (err) {
      showFatal(err && err.stack ? err.stack : String(err));
    }
  });
})();
