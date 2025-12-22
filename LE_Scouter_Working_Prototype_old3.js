// ==UserScript==
// @name         ATK Scouter Base v1.3.6
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @match        https://pda.torn.com/*
// @version      1.3.29-exp
// @description  Profile RSI+ experimental panel + robust mount + local trainer + readability fixes
// @updateURL    https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
// @downloadURL  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  const GREEN_ARROW_UP  = "data:image/svg+xml;utf8,<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><polygon points='10,3 19,17 1,17' fill='%232e7d32'/></svg>";
  const YELLOW_ARROW_UP = "data:image/svg+xml;utf8,<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><polygon points='10,3 19,17 1,17' fill='%23f9a825'/></svg>";
  const RED_ARROW_UP    = "data:image/svg+xml;utf8,<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><polygon points='10,3 19,17 1,17' fill='%23c62828'/></svg>";

  const PLANE_ICON_URL = 'https://raw.githubusercontent.com/infodump01/LE-Scouter/main/airport-xxl.png';

  // ---- Environment Adapter ----
  if (typeof PDA_httpGet === 'function') {
    window.rD_xmlhttpRequest = d =>
      d.method.toLowerCase()==='get'
        ? PDA_httpGet(d.url).then(d.onload).catch(d.onerror)
        : PDA_httpPost(d.url, d.headers, d.data).then(d.onload).catch(d.onerror);
    window.rD_setValue    = (k,v)=>localStorage.setItem(k,v);
    window.rD_getValue    = (k,d)=>localStorage.getItem(k)||d;
    window.rD_deleteValue = k=>localStorage.removeItem(k);
  } else {
    window.rD_xmlhttpRequest = GM_xmlhttpRequest;
    window.rD_setValue       = GM_setValue;
    window.rD_getValue       = GM_getValue;
    window.rD_deleteValue    = GM_deleteValue;
  }

  let API_KEY = rD_getValue('api_key','');
  const defaults = { lowHigh:100, highMed:120, lifeWeight:0.1, drugWeight:0.1 };
  const settings = {
    lowHigh:    +rD_getValue('threshold_lowHigh', defaults.lowHigh),
    highMed:    +rD_getValue('threshold_highMed', defaults.highMed),
    lifeWeight: +rD_getValue('lifeWeight', defaults.lifeWeight),
    drugWeight: +rD_getValue('drugWeight', defaults.drugWeight)
  };

  // ---- Styles ----
  GM_addStyle(`
    .ff-score-badge {
      display:inline-block;
      margin-left:8px;
      padding:4px 8px;
      border-radius:6px;
      font-size:0.95em;
      color:#fff;
    }
    .ff-score-badge.high  { background:#c62828; }
    .ff-score-badge.med   { background:#f9a825; }
    .ff-score-badge.low   { background:#2e7d32; }
    .ff-score-badge.wounded {
      box-shadow:0 0 6px 2px rgba(229,57,53,0.8);
    }
    div[class*="honorWrap"] { overflow: visible !important; position: relative !important; }
    .honor-text-wrap { position: relative !important; }
    .ff-list-arrow-img {
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 16px !important;
      height: 16px !important;
      max-width: 16px !important;
      max-height: 16px !important;
      pointer-events: auto;
      z-index: 10000;
      transform: translate(-50%, 38%);
      display: block;
      transition: box-shadow .15s;
    }
    .ff-list-arrow-img.wounded {
      box-shadow: 0 0 10px 4px #c62828, 0 0 2px 2px #fff2;
      border-radius: 5px;
    }
    .ff-tooltip-viewport {
      position: absolute;
      background: rgba(0,0,0,0.85);
      color: #fff;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      line-height: 1.2em;
      white-space: nowrap;
      z-index: 2147483647 !important;
      pointer-events: none;
    }
    .ff-fab {
      position:fixed; bottom:20px; left:20px;
      width:50px; height:50px; border-radius:25px;
      background:#222; color:#eee; font-size:26px; line-height:50px;
      text-align:center; cursor:pointer; z-index:10000;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
      transition:background .2s;
    }
    .ff-fab:hover { background:#333; }
    .ff-modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,0.7);
      z-index:9998; display:none;
    }
    .ff-modal {
      position:fixed; top:50%; left:50%; transform:translate(-50%, -50%);
      background:#2b2b2b; color:#eee; padding:20px; border-radius:8px;
      z-index:9999; min-width:360px; display:none;
      box-shadow:0 8px 24px rgba(0,0,0,0.6);
      font-family:sans-serif;
    }
    .ff-modal h3 {
      margin:0 0 12px; font-size:1.3em; display:flex; align-items:center;
    }
    .ff-modal h3::before { content:"🛠️"; margin-right:8px; }
    .ff-tabs { display:flex; margin-bottom:12px; }
    .ff-tab {
      flex:1; padding:8px; text-align:center; cursor:pointer;
      color:#aaa; border-bottom:2px solid transparent;
      user-select:none; transition:color .2s, border-color .2s;
    }
    .ff-tab.active {
      color:#fff; border-color:#fff;
    }
    .ff-tab-content { display:none; }
    .ff-tab-content.active { display:block; }
    .ff-modal label {
      display:block; margin:12px 0 4px; font-size:0.9em; color:#ccc;
    }
    .ff-modal input {
      width:100%; padding:6px; border:1px solid #444;
      border-radius:4px; background:#333; color:#eee;
      font-size:1em;
    }
    .ff-modal .btn {
      display:inline-block; margin-top:16px; padding:8px 14px;
      border:none; border-radius:4px; font-size:0.95em;
      cursor:pointer; transition:background .2s;
    }
    .ff-modal .btn-save {
      background:#4caf50; color:#fff; margin-right:8px;
    }
    .ff-modal .btn-save:hover { background:#66bb6a; }
    .ff-modal .btn-cancel {
      background:#c62828; color:#fff;
    }
    .ff-modal .btn-cancel:hover { background:#e53935; }
    .ff-modal .btn-clear {
      background:#555; color:#fff; margin-left:8px;
    }
    .ff-modal .btn-clear:hover { background:#666; }
    .ff-travel-icon {
      position: absolute;
      right: 4px;
      bottom: 2px;
      height: 16px !important;
      width: 16px !important;
      max-width: 16px !important;
      max-height: 16px !important;
      z-index: 2147483646 !important;
      filter: grayscale(1) brightness(0.7);
      opacity: 0.92;
      pointer-events: auto;
      transition: filter 0.15s, box-shadow 0.15s;
    }
    .ff-travel-icon.ff-traveling {
      filter: grayscale(0) brightness(1) drop-shadow(0 0 3px #2094fa) drop-shadow(0 0 2px #42a5f5);
    }
    .ff-travel-icon.ff-abroad {
      filter: grayscale(0) brightness(1) drop-shadow(0 0 3px #ff9800) drop-shadow(0 0 2px #ffb300);
    }
    .ff-travel-icon:hover {
      filter: brightness(1.4) !important;
    }
    .ff-hospital-icon {
      position: absolute;
      right: 4px;
      bottom: 2px;
      height: 16px !important;
      width: 16px !important;
      max-width: 16px !important;
      max-height: 16px !important;
      z-index: 2147483646 !important;
      opacity: 0.92;
      pointer-events: auto;
      transition: filter 0.15s, box-shadow 0.15s;
    }
      .ff-tooltip-viewport a {
      color: #ff5252 !important;
      text-decoration: underline;
    }
    .ff-tooltip-viewport a:visited {
      color: #e53935 !important;
    }
  `);

  GM_addStyle(`
    #ff-api-warning {
      position: fixed;
      left: 20px;
      bottom: 80px;
      max-width: 260px;
      background: rgba(33,33,33,0.95);
      color: #ffeb3b;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.3;
      z-index: 2147483647;
      box-shadow: 0 0 10px rgba(0,0,0,.6);
      cursor: pointer;
    }
  `);




let apiErrorShown = false;

function showApiBanner(text) {
  try {
    let el = document.getElementById('ff-api-warning');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ff-api-warning';
      document.body.appendChild(el);
    }
    el.textContent = text + ' (click to hide)';
    el.onclick = () => { el.style.display = 'none'; };
    el.style.display = 'block';
  } catch(e) { /* noop */ }
}



const apiCache = new Map();
const apiQueue = [];
const apiInFlight = new Map();
let apiActive = 0;
let apiLastStart = 0;
let apiTimer = null;
const API_MAX_ACTIVE = 3;    // Max concurrent Torn API requests
const API_MIN_DELAY  = 200;  // Min ms between starting requests

function apiGet(ep, cb) {
  if (!API_KEY) return;

  const now = Date.now();
  const ttl = /selections=basic/.test(ep) ? 10000 : 30000; // basic/status fresher; others can cache longer
  const cached = apiCache.get(ep);
  if (cached && now - cached.ts < ttl) {
    try { cb(cached.data); } catch (e) {}
    return;
  }

  const pending = apiInFlight.get(ep);
  if (pending) {
    pending.push(cb);
    return;
  }

  apiQueue.push({ ep, cbs: [cb] });
  drainApiQueue();
}

function drainApiQueue() {
  if (!apiQueue.length || apiActive >= API_MAX_ACTIVE) return;

  const now = Date.now();
  const wait = API_MIN_DELAY - (now - apiLastStart);
  if (wait > 0) {
    if (!apiTimer) {
      apiTimer = setTimeout(() => {
        apiTimer = null;
        drainApiQueue();
      }, wait);
    }
    return;
  }

  const item = apiQueue.shift();
  if (!item) return;
  const { ep, cbs } = item;

  apiInFlight.set(ep, cbs);
  apiActive++;
  apiLastStart = now;

  rD_xmlhttpRequest({
    method: 'GET',
    url: `https://api.torn.com${ep}&key=${API_KEY}`,
    onload: r => {
      apiActive--;
      const callbacks = apiInFlight.get(ep) || cbs;
      apiInFlight.delete(ep);
      try {
        const d = JSON.parse(r.responseText);
        if (!d.error) {
          apiCache.set(ep, { data: d, ts: Date.now() });
          for (const fn of callbacks) {
            try { fn(d); } catch (e) {}
          }
        } else {
          console.error('Torn API error', d.error);
          if (!apiErrorShown) {
            apiErrorShown = true;
            let msg = `ATK Scouter: Torn API error ${d.error.code} – ${d.error.error}`;
            if (d.error.code === 1 || d.error.code === 2) {
              msg = 'ATK Scouter: Your Torn API key is invalid or lacks required permissions. Open the ⚙️ settings and verify the key.';
            } else if (d.error.code === 5) {
              msg = 'ATK Scouter: Torn API rate limit reached for this key. Some data may be delayed or missing until Torn resets your limit.';
            }
            showApiBanner(msg);
          }
        }
      } catch (e) {
        console.error('Torn API parse error', e);
      }
      drainApiQueue();
    },
    onerror: err => {
      apiActive--;
      apiInFlight.delete(ep);
      console.error('Torn API request failed', err);
      drainApiQueue();
    }
  });
}


  function baseCalc(ps,b) {
// === RSI+ Experimental: parts calc, panel builder, globals, and robust mount ===
window.__FF_ME_STATS_OBJ = window.__FF_ME_STATS_OBJ || null;
window.__FF_LAST_PROFILE_OBJ = window.__FF_LAST_PROFILE_OBJ || null;

function ff_calcParts(ps, b) {
  const elo = ps.elo * 2;
  const dmg = Math.sqrt(ps.attackdamage/1000) * 1.5;
  const win = Math.sqrt(Math.max(ps.attackswon - ps.attackslost, 0)) * 1.2;
  const wr  = (ps.attackswon + ps.attackslost) > 0 ? (ps.attackswon / (ps.attackswon + ps.attackslost)) * 100 : 0;
  const cr  = ps.attackhits > 0 ? (ps.attackcriticalhits / ps.attackhits) * 100 : 0;
  const nw  = Math.log10((ps.networth || 0) + 1) * 5;
  const now = Date.now() / 1000;
  const joined = b && b.joined ? b.joined : now;
  const age = Math.log10(((now - joined) / 86400) + 1) * 5;
  const act = Math.log10((ps.useractivity || 0) + 1) * 2;
  const parts = { elo, dmg, win, wr, cr, nw, age, act };
  const sum = elo + dmg + win + wr + cr + nw + age + act;
  return { parts, sum };
}

function ff_buildExpPanelImmediate(h, meStatsObj, oppObj){
  try{
    if (!h || document.getElementById('ff-exp-panel')) return;
    if (!meStatsObj || !oppObj) return;

    const mePS = meStatsObj.personalstats || {};
    const meB  = meStatsObj.basic || {};
    const oppPS= oppObj.personalstats || {};
    const oppB = oppObj.basic || oppObj.profile || {};

    const me = ff_calcParts(mePS, meB);
    const op = ff_calcParts(oppPS, oppB);

    const meGymMul  = getGymMultiplier(mePS.xantaken || 0);
    const meDrugMul = (1 - (typeof USER_DRUG_DEBUFF==='number'?USER_DRUG_DEBUFF:0) * settings.drugWeight);
    const opGymMul  = getGymMultiplier(oppPS.xantaken || 0);

    const keys = ['elo','dmg','win','wr','cr','nw','age','act'];
    const eff = keys.map(k => {
      const y = me.parts[k] * meGymMul * meDrugMul;
      const o = op.parts[k] * opGymMul;
      return {key:k, you:y, opp:o, delta:y-o};
    }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));

    const oppBP = op.sum * opGymMul;
    const yourBP = (typeof USER_BP==='number' && USER_BP>0)
        ? USER_BP
        : (me.sum * meGymMul * meDrugMul);
    const raw   = (yourBP / oppBP) * 100;
    const life  = (oppObj.life && oppObj.life.maximum) ? (oppObj.life.current / oppObj.life.maximum) : 1;
    const wp    = 1 - (life || 1);
    const fair  = Math.min(raw / 100, 1);
    const boost = wp * settings.lifeWeight * fair;
    const adj   = raw * (1 + boost);

    // Learned RSI (beta): logistic on rawRSI-100; theta stored locally
    let theta0 = 0 + Number(typeof GM_getValue === 'function' ? GM_getValue('ff_lrsi_theta0', 0) : 0);
    let theta1 = 0 + Number(typeof GM_getValue === 'function' ? GM_getValue('ff_lrsi_theta1', 0.12) : 0.12);
    const x_raw = (raw - 100);
    const p_win = 1 / (1 + Math.exp(-(theta0 + theta1 * x_raw)));

    const wrap = document.createElement('details');
    wrap.id='ff-exp-panel';
    wrap.open=true;
    wrap.style.marginTop='6px';
    wrap.style.background='rgba(0,0,0,0.25)';
    wrap.style.border='1px solid rgba(255,255,255,0.1)';
    wrap.style.borderRadius='6px';
    wrap.style.padding='8px 10px';
    wrap.style.color='#e6e6e6';

    const sum=document.createElement('summary');
    sum.textContent='RSI+ (Experimental) — breakdown & drivers';
    sum.style.cursor='pointer';
    sum.style.color='#e6e6e6';
    sum.style.fontWeight='600';
    wrap.appendChild(sum);

    const nameMap={elo:'ELO×2', dmg:'√Damage×1.5', win:'√(W−L)×1.2', wr:'Win%×100', cr:'Crit%×100', nw:'log₁₀(Networth+1)×5', age:'log Age×5', act:'log Activity×2'};
    const top3 = eff.slice(0,3).map(r=>{
      const sign = r.delta>=0?'+':'−';
      return `${nameMap[r.key]} ${sign}${Math.abs(r.delta).toFixed(1)}`;
    }).join(' · ');

    const div=document.createElement('div');
    div.innerHTML=`
      <div style="margin-top:6px;font-size:12px;line-height:1.35">
        <div style="margin-bottom:6px;"><b>Adjusted RSI:</b> ${adj.toFixed(2)}% &nbsp;
          <span style="margin-left:10px;"><b>Learned RSI (beta):</b> <span id="ff-lrsi-value">${(p_win*100).toFixed(1)}%</span></span>
          <span id="ff-lrsi-msg" class="ff-note"></span>
        </div>
        <div class="ff-lrsi-controls">
          <b>Learned RSI controls:</b>
          θ<sub>0</sub>=<span id="ff-theta0"></span>, θ<sub>1</sub>=<span id="ff-theta1"></span>
          <span class="ff-note" id="ff-lrsi-n"></span>
          <span class="ff-mini-btn" id="ff-softer">Softer</span>
          <span class="ff-mini-btn" id="ff-steeper">Steeper</span>
          <span class="ff-mini-btn" id="ff-reset">Reset</span>
          <span class="ff-mini-btn" id="ff-refit">Re-fit (from log)</span>
          <span class="ff-mini-btn" id="ff-clear">Clear log</span>
          <span class="ff-mini-btn" id="ff-logwin">Log Win</span>
          <span class="ff-mini-btn" id="ff-logloss">Log Loss</span>
        </div>
        <div style="margin-top:6px;opacity:.9;"><b>Top drivers:</b> ${top3}</div>
        <div style="opacity:.8;">Raw: ${raw.toFixed(2)}% &nbsp; Wound boost: ${(boost*100).toFixed(1)}% &nbsp; Life: ${(life*100).toFixed(0)}%</div>
        <table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;color:#e6e6e6;margin-top:6px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,.1)">
              <th style="text-align:left;padding:4px 2px">Term</th>
              <th style="text-align:right;padding:4px 2px">You</th>
              <th style="text-align:right;padding:4px 2px">Target</th>
              <th style="text-align:right;padding:4px 2px">Δ</th>
            </tr>
          </thead>
          <tbody>
            ${eff.map(r=>`<tr>
              <td style="padding:3px 2px;opacity:.9;color:#e6e6e6">${nameMap[r.key]}</td>
              <td style="padding:3px 2px;text-align:right;color:#e6e6e6">${r.you.toFixed(1)}</td>
              <td style="padding:3px 2px;text-align:right;color:#e6e6e6">${r.opp.toFixed(1)}</td>
              <td style="padding:3px 2px;text-align:right;color:${r.delta>=0?'#9ccc65':'#ef5350'}">${r.delta>=0?'+':''}${r.delta.toFixed(1)}</td>
            </tr>`).join('')}
            <tr style="border-top:1px dotted rgba(255,255,255,.15)">
              <td style="padding:4px 2px"><span class="ff-chip-label">Gym × Drug multipliers applied</span></td>
              <td style="padding:4px 2px;text-align:right;opacity:.9;color:#e6e6e6">× ${(meGymMul*meDrugMul).toFixed(3)}</td>
              <td style="padding:4px 2px;text-align:right;opacity:.9;color:#e6e6e6">× ${opGymMul.toFixed(3)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>`;
    wrap.appendChild(div);
    h.insertAdjacentElement('afterend', wrap);

    // styles
    try{
      GM_addStyle(`#ff-exp-panel, #ff-exp-panel * { color:#e6e6e6 !important; }
      #ff-exp-panel .ff-chip-label{display:inline-block;padding:2px 6px;border-radius:4px;background:rgba(66,165,245,.18);border:1px solid rgba(66,165,245,.45);}
      #ff-exp-panel .ff-mini-btn{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#e6e6e6;cursor:pointer;font-size:11px;}
      #ff-exp-panel .ff-mini-btn:hover{background:rgba(255,255,255,.14);} #ff-exp-panel .ff-note{opacity:.8;font-size:11px;margin-left:6px;}`);
    }catch(e){}

    // Trainer helpers
    function ff_lrs_load(){
      const t0 = typeof GM_getValue==='function' ? Number(GM_getValue('ff_lrsi_theta0', 0)) : 0;
      const t1 = typeof GM_getValue==='function' ? Number(GM_getValue('ff_lrsi_theta1', 0.12)) : 0.12;
      const meta = typeof GM_getValue==='function' ? (GM_getValue('ff_lrsi_meta', {n:0,ts:0})||{n:0,ts:0}) : {n:0,ts:0};
      const hist = typeof GM_getValue==='function' ? (GM_getValue('ff_lrsi_hist', [])||[]) : [];
      return {t0,t1,meta,hist};
    }
    function ff_lrs_saveTheta(t0,t1){
      try{ GM_setValue && GM_setValue('ff_lrsi_theta0', t0); GM_setValue && GM_setValue('ff_lrsi_theta1', t1); }catch(e){}
    }
    function ff_lrs_saveHist(hist){
      try{ GM_setValue && GM_setValue('ff_lrsi_hist', hist); GM_setValue && GM_setValue('ff_lrsi_meta', {n:hist.length,ts:Date.now()}); }catch(e){}
    }
    function ff_lrs_addSample(hist, rsiRaw, won){
      const now = Date.now();
      const ninety = 90*24*3600*1000;
      const pruned = (hist||[]).filter(h => now - h.ts <= ninety);
      pruned.push({ts: now, rsi: Number(rsiRaw)||0, y: won?1:0});
      while (pruned.length > 500) pruned.shift();
      ff_lrs_saveHist(pruned);
      return pruned;
    }
    function ff_lrs_refit(hist){
      if (!hist || !hist.length) return null;
      let t0 = 0;
      let t1 = (typeof GM_getValue==='function') ? Number(GM_getValue('ff_lrsi_theta1', 0.12)) : 0.12;
      const lr = 1e-3, reg = 1e-4, iters = 250;
      for (let it=0; it<iters; it++){
        let g0=0, g1=0;
        for (const h of hist){
          const x = (h.rsi - 100);
          const z = t0 + t1*x;
          const p = 1/(1+Math.exp(-z));
          const e = p - (h.y?1:0);
          g0 += e;
          g1 += e*x;
        }
        g0 += reg*t0;
        g1 += reg*t1;
        t0 -= lr*g0;
        t1 -= lr*g1;
      }
      ff_lrs_saveTheta(t0,t1);
      return {t0,t1};
    }

    // Wire up
    (function(){
      const t0El = wrap.querySelector('#ff-theta0');
      const t1El = wrap.querySelector('#ff-theta1');
      const nEl  = wrap.querySelector('#ff-lrsi-n');
      const valEl= wrap.querySelector('#ff-lrsi-value');
      const msgEl= wrap.querySelector('#ff-lrsi-msg');
      function flash(msg){ if (!msgEl) return; msgEl.textContent = ` · ${msg}`; setTimeout(()=>{ if (msgEl && msgEl.textContent === ` · ${msg}`) msgEl.textContent=''; }, 2000); }
      function load(){ return ff_lrs_load(); }
      function showTheta(){ const cur = load(); if (t0El) t0El.textContent = (cur.t0).toFixed(3); if (t1El) t1El.textContent = (cur.t1).toFixed(3); if (nEl) nEl.textContent = ` · samples: ${cur.meta && cur.meta.n ? cur.meta.n : (cur.hist||[]).length}`; }
      function updateProb(){ const cur = load(); const x = (raw - 100); const p = 1/(1+Math.exp(-(cur.t0 + cur.t1 * x))); if (valEl) valEl.textContent = `${(p*100).toFixed(1)}%`; }
      function refreshAll(){ showTheta(); updateProb(); }
      refreshAll();
      const softer = wrap.querySelector('#ff-softer'); const steeper= wrap.querySelector('#ff-steeper'); const reset  = wrap.querySelector('#ff-reset'); const refit  = wrap.querySelector('#ff-refit'); const clear  = wrap.querySelector('#ff-clear'); const logW   = wrap.querySelector('#ff-logwin'); const logL   = wrap.querySelector('#ff-logloss');
      softer && softer.addEventListener('click', ()=>{ const cur = load(); ff_lrs_saveTheta(cur.t0, cur.t1 * 0.9); refreshAll(); flash('slope softer'); });
      steeper && steeper.addEventListener('click', ()=>{ const cur = load(); ff_lrs_saveTheta(cur.t0, cur.t1 * 1.1); refreshAll(); flash('slope steeper'); });
      reset && reset.addEventListener('click', ()=>{ try{ ff_lrs_saveTheta(0, 0.12); if (typeof GM_setValue==='function'){ GM_setValue('ff_lrsi_hist', []); GM_setValue('ff_lrsi_meta', {n:0,ts:Date.now()}); } }catch(e){} refreshAll(); flash('reset'); });
      refit && refit.addEventListener('click', ()=>{ const cur = load(); const fitted = ff_lrs_refit(cur.hist); refreshAll(); flash(fitted ? `re-fit: θ0=${fitted.t0.toFixed(3)}, θ1=${fitted.t1.toFixed(3)}` : 'no samples'); });
      function addSample(won){ const cur = load(); const hist = ff_lrs_addSample(cur.hist, raw, won); refreshAll(); flash(`logged ${won?'win':'loss'} (#${hist.length})`); }
      logW && logW.addEventListener('click', ()=>addSample(true)); logL && logL.addEventListener('click', ()=>addSample(false));
      clear && clear.addEventListener('click', ()=>{ if (typeof GM_setValue==='function'){ GM_setValue('ff_lrsi_hist', []); GM_setValue('ff_lrsi_meta', {n:0,ts:Date.now()}); } refreshAll(); flash('log cleared'); });
    })();
  }catch(e){ /*no-op*/ }
}

// Robust auto-mount fallback: whenever we see the RSI badge appear, attach panel if missing.
(function(){
  let debounce = 0;
  function tryMount(){
    if (Date.now() - debounce < 150) return;
    debounce = Date.now();
    if (document.getElementById('ff-exp-panel')) return;
    const badge = document.querySelector('span.ff-score-badge');
    if (!badge) return;
    const h = badge.closest('h4');
    if (!h) return;
    const me = window.__FF_ME_STATS_OBJ || (typeof ME_STATS!=='undefined' ? ME_STATS : null);
    const opp = window.__FF_LAST_PROFILE_OBJ || null;
    if (!me || !opp) return;
    try{ ff_buildExpPanelImmediate(h, me, opp); }catch(e){}
  }
  try{ new MutationObserver(tryMount).observe(document.body, {childList:true, subtree:true}); }catch(e){}
  setTimeout(tryMount, 300);
})();

    const elo = ps.elo * 2;
    const dmg = Math.sqrt(ps.attackdamage/1000) * 1.5;
    const win = Math.sqrt(Math.max(ps.attackswon - ps.attackslost, 0)) * 1.2;
    const wr  = (ps.attackswon + ps.attackslost) > 0
              ? ps.attackswon / (ps.attackswon + ps.attackslost)
              : 0;
    const cr  = ps.attackhits > 0
              ? ps.attackcriticalhits / ps.attackhits
              : 0;
    const nw  = Math.log10((ps.networth || 0) + 1) * 5;
    const now = Date.now() / 1000;
    const joined = b && b.joined ? b.joined : now;
    const age = Math.log10(((now - joined) / 86400) + 1) * 5;
    const act = Math.log10((ps.useractivity || 0) + 1) * 2;
    return elo + dmg + win + wr * 100 + cr * 100 + nw + age + act;
  }

  const gymTiers = [
    { energy: 0,      mul: 1    },
    { energy: 200,    mul: 1.2375 },
    { energy: 500,    mul: 1.45   },
    { energy: 1000,   mul: 1.6    },
    { energy: 2000,   mul: 1.7    },
    { energy: 2750,   mul: 1.8    },
    { energy: 3000,   mul: 1.85   },
    { energy: 3500,   mul: 1.85   },
    { energy: 4000,   mul: 2      },
    { energy: 6000,   mul: 2.175  },
    { energy: 7000,   mul: 2.275  },
    { energy: 8000,   mul: 2.425  },
    { energy: 11000,  mul: 2.525  },
    { energy: 12420,  mul: 2.55   },
    { energy: 18000,  mul: 2.7375 },
    { energy: 18100,  mul: 2.785  },
    { energy: 24140,  mul: 3      },
    { energy: 31260,  mul: 3.1    },
    { energy: 36610,  mul: 3.1625 },
    { energy: 46640,  mul: 3.2625 },
    { energy: 56520,  mul: 3.325  },
    { energy: 67775,  mul: 3.2875 },
    { energy: 84535,  mul: 3.35   },
    { energy: 106305, mul: 3.45   },
    { energy: 100000000, mul: 3.65 }
  ];
  function getGymMultiplier(xan) {
    const e = xan * 250;
    let m = 1;
    gymTiers.forEach(t => {
      if (e >= t.energy) m = t.mul;
    });
    return m;
  }

  let ME_STATS         = null,
      ME_DRUGS         = null,
      USER_BP          = null,
      USER_DRUG_DEBUFF = 0;

  apiGet('/user/?selections=personalstats,basic', d => { ME_STATS = d; initIfReady(); });
  apiGet('/user/?selections=battlestats',       d => { ME_DRUGS = d; initIfReady(); });

  function initIfReady() {
    if (!ME_STATS || !ME_DRUGS) return;
    const negs = [
      ME_DRUGS.strength_modifier,
      ME_DRUGS.defense_modifier,
      ME_DRUGS.speed_modifier,
      ME_DRUGS.dexterity_modifier
    ].filter(x => x < 0)
     .map(x => -x / 100);

    USER_DRUG_DEBUFF = negs.length
      ? negs.reduce((a, c) => a + c, 0) / negs.length
      : 0;

    USER_BP = baseCalc(ME_STATS.personalstats, ME_STATS.basic)
            * getGymMultiplier(ME_STATS.personalstats.xantaken || 0)
            * (1 - USER_DRUG_DEBUFF * settings.drugWeight);

    injectAll();
    window.addEventListener('popstate', injectAll);
    new MutationObserver(m => m.forEach(r => injectAll()))
      .observe(document.body, { childList:true, subtree:true });
  }

  function showTooltipAt(pageX, pageY, html) {
    let tt = document.querySelector('.ff-tooltip-viewport');
    if (!tt) {
      tt = document.createElement('div');
      tt.className = 'ff-tooltip-viewport';
      document.body.appendChild(tt);
    }
    tt.innerHTML = html;
    requestAnimationFrame(() => {
      const rect = tt.getBoundingClientRect();
      let left = pageX - rect.width / 2;
      left = Math.max(4, Math.min(left, document.documentElement.clientWidth - rect.width - 4));
      const top = pageY - rect.height - 12;
      tt.style.left = left + 'px';
      tt.style.top  = top + 'px';
      tt.style.display = 'block';
    });
  }
  function hideTooltip() {
    const tt = document.querySelector('.ff-tooltip-viewport');
    if (tt) tt.style.display = 'none';
  }

  function injectProfile() {
    const h = document.querySelector('h4');
    if (!h || h.dataset.ff) {
      return;
    }
    h.dataset.ff = '1';
    const m = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
    const userId = m ? m[1] : null;
    if (!userId) {
      return;
    }

    apiGet(`/user/${userId}?selections=personalstats,basic,profile`, o => {
      const oppBP = baseCalc(o.personalstats, o.basic)
                  * getGymMultiplier(o.personalstats.xantaken || 0),
            raw   = (USER_BP / oppBP) * 100,
            wp    = 1 - (o.life.current / o.life.maximum || 1),
            fair  = Math.min(raw / 100, 1),
            boost = wp * settings.lifeWeight * fair,
            adj   = raw * (1 + boost),
            pct   = parseFloat(adj.toFixed(2));

      let cls  = 'low', note = 'Advantage';
      if (pct < settings.lowHigh)     { cls = 'high'; note = 'High risk'; }
      else if (pct < settings.highMed) { cls = 'med';  note = 'Moderate risk'; }
      let lifePct = null;
      if (o.life && typeof o.life.current === 'number' && o.life.maximum) {
        lifePct = Math.round((o.life.current / o.life.maximum) * 100);
      }
      let lastObj = null;
      if (o.last_action && typeof o.last_action === 'object') {
        lastObj = o.last_action;
      } else if (o.profile && o.profile.last_action && typeof o.profile.last_action === 'object') {
        lastObj = o.profile.last_action;
      } else if (o.basic && o.basic.last_action && typeof o.basic.last_action === 'object') {
        lastObj = o.basic.last_action;
      }
      let rel = null;
      if (lastObj && typeof lastObj.relative === 'string') {
        const mm = lastObj.relative.match(/^(\d+)\s+(\w+)/);
        if (mm) {
          const num = mm[1];
          const w   = mm[2].toLowerCase();
          let suffix = 'm';
          if      (w.startsWith('hour'))   suffix = 'h';
          else if (w.startsWith('minute')) suffix = 'm';
          else if (w.startsWith('second')) suffix = 'm';
          else if (w.startsWith('day'))    suffix = 'd';
          rel = num + suffix;
        }
      }
      let extra = '';
      if (lifePct !== null && rel !== null) {
        extra = ` (L ${lifePct}% · A ${rel})`;
      } else if (lifePct !== null) {
        extra = ` (L ${lifePct}%)`;
      } else if (rel !== null) {
        extra = ` (A ${rel})`;
      }
      const sp = document.createElement('span');
      sp.className = `ff-score-badge ${cls}` + (wp > 0 ? ' wounded' : '');
      sp.innerHTML = `
        RSI ${pct}% — ${note}${extra}
        ${wp > 0 ? `<span style="margin-left:6px; color:#fff;">✚</span>` : ''}
        ${USER_DRUG_DEBUFF > 0
          ? `<img src="https://raw.githubusercontent.com/infodump01/LE-Scouter/main/pill-icon-2048x2048.png"
                style="width:12px;height:12px;vertical-align:middle;margin-left:6px;">`
          : ''
        }
      `;
      h.appendChild(sp);
      try{ window.__FF_ME_STATS_OBJ = ME_STATS; window.__FF_LAST_PROFILE_OBJ = o; ff_buildExpPanelImmediate(h, ME_STATS, o); }catch(e){}
    });
  }

  function injectList(root = document) {
    injectProfile();
    root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(a => {
      const honorWrap = a.closest('div[class*="honorWrap"]');
      if (!honorWrap || honorWrap.dataset.ff) return;
      honorWrap.dataset.ff = '1';
      const honorTextWrap = honorWrap.querySelector('.honor-text-wrap') || honorWrap;
      const computed = window.getComputedStyle(honorTextWrap);
      if (computed.position === 'static') {
        honorTextWrap.style.position = 'relative';
      }
      const userIdMatch = a.href.match(/XID=(\d+)/);
      if (!userIdMatch) return;
      const userId = userIdMatch[1];
      apiGet(`/user/${userId}?selections=personalstats,basic,profile`, d => {
        // Remove any existing triangle/plane/hospital
        Array.from(honorTextWrap.querySelectorAll('.ff-list-arrow-img, .ff-travel-icon, .ff-hospital-icon')).forEach(el => el.remove());

        // TRIANGLE ARROW as before:
        const oppBP = baseCalc(d.personalstats, d.basic)
                    * getGymMultiplier(d.personalstats.xantaken || 0),
              raw   = (USER_BP / oppBP) * 100,
              wp    = 1 - (d.life.current / d.life.maximum || 1),
              fair  = Math.min(raw / 100, 1),
              boost = wp * settings.lifeWeight * fair,
              adj   = raw * (1 + boost),
              cls   = adj < settings.lowHigh ? 'high'
                    : adj < settings.highMed ? 'med'
                    : 'low',
              pct   = parseFloat(adj.toFixed(2));
        const pos = (100 - Math.min(adj, 200) / 200 * 100) + '%';
        let lifePct = null;
        if (d.life && typeof d.life.current === 'number' && d.life.maximum) {
          lifePct = Math.round((d.life.current / d.life.maximum) * 100);
        }
        let lastObj = null;
        if (d.last_action && typeof d.last_action === 'object') {
          lastObj = d.last_action;
        } else if (d.profile && d.profile.last_action && typeof d.profile.last_action === 'object') {
          lastObj = d.profile.last_action;
        } else if (d.basic && d.basic.last_action && typeof d.basic.last_action === 'object') {
          lastObj = d.basic.last_action;
        }
        let tooltipHtml = `RSI: ${pct.toFixed(2)}%`;
        if (lifePct !== null) {
          tooltipHtml += `<br>Life: ${lifePct}%`;
        }
        if (lastObj && typeof lastObj.relative === 'string') {
          tooltipHtml += `<br>Last action: ${lastObj.relative}`;
        }
        const img = document.createElement('img');
        img.className = 'ff-list-arrow-img';
        img.style.left = pos;
        img.src = cls === 'low' ? GREEN_ARROW_UP : cls === 'med' ? YELLOW_ARROW_UP : RED_ARROW_UP;
        img.setAttribute('width', '20');
        img.setAttribute('height', '20');
        img.style.width = "20px";
        img.style.height = "20px";
        img.style.maxWidth = "20px";
        img.style.maxHeight = "20px";
        if (wp > 0) img.classList.add('wounded');
        // Tooltip on hover/tap (always up to date: refresh just this triangle)
        img.addEventListener('mouseenter', e => {
          apiGet(`/user/${userId}?selections=personalstats,basic,profile`, d2 => {
            Array.from(honorTextWrap.querySelectorAll('.ff-list-arrow-img')).forEach(el => el.remove());
            injectOneTriangle(honorTextWrap, d2, userId, e);
          });
        });
        img.addEventListener('mousemove', e => { showTooltipAt(e.pageX, e.pageY, tooltipHtml); });
        img.addEventListener('mouseleave', () => { hideTooltip(); });
        img.addEventListener('click', e => {
          e.preventDefault();
          apiGet(`/user/${userId}?selections=personalstats,basic,profile`, d2 => {
            Array.from(honorTextWrap.querySelectorAll('.ff-list-arrow-img')).forEach(el => el.remove());
            injectOneTriangle(honorTextWrap, d2, userId, e);
          });
          setTimeout(hideTooltip, 2000);
        });
        honorTextWrap.appendChild(img);

        // ---- HOSPITAL/TRAVEL ICON LOGIC START ----
        addStatusIcon(d, honorTextWrap, userId);
        // ---- HOSPITAL/TRAVEL ICON LOGIC END ----
      });
    });
  }

  // --- Hybrid tooltip: always instant, background updates if changed ---
  function addStatusIcon(statusData, honorTextWrap, userId) {
    if (!statusData || !statusData.status) return;
    Array.from(honorTextWrap.querySelectorAll('.ff-travel-icon, .ff-hospital-icon')).forEach(el => el.remove());

    function makeTooltip(s) {
      let tip = s.status.description || s.status.state;
      if (s.status.details) tip += `<br>${s.status.details}`;
      return tip;
    }

    // HOSPITAL TAKES PRIORITY OVER TRAVEL
    if (statusData.status.state === "Hospital") {
      const desc = (statusData.status.description || statusData.status.details || "").trim();
      const isAbroad = /^In a\s+.+\s+hospital\s+for\s+\d+\s+min/i.test(desc);
      let hospitalIcon = document.createElement('img');
      hospitalIcon.src = "https://github.com/infodump01/LE-Scouter/raw/main/hospital.png";
      hospitalIcon.className = "ff-hospital-icon";
      hospitalIcon.alt = "Hospital";
      hospitalIcon.setAttribute('draggable', 'false');
      hospitalIcon.style.position = "absolute";
      hospitalIcon.style.right = "4px";
      hospitalIcon.style.bottom = "2px";
      hospitalIcon.style.height = "16px";
      hospitalIcon.style.width = "16px";
      hospitalIcon.style.maxWidth = "16px";
      hospitalIcon.style.maxHeight = "16px";
      hospitalIcon.style.zIndex = "2147483646";
      hospitalIcon.style.opacity = "0.92";
      hospitalIcon.style.pointerEvents = "auto";
      if (desc) {
        try { hospitalIcon.setAttribute('data-ff-desc', desc); } catch(e){}
      }
      if (statusData.status && statusData.status.until) {
        try { hospitalIcon.setAttribute('data-ff-until', String(statusData.status.until)); } catch(e){}
      }
      hospitalIcon.style.filter = isAbroad
        ? "grayscale(0) brightness(1) drop-shadow(0 0 3px #ff9800) drop-shadow(0 0 2px #ffb300)" // yellow
        : "grayscale(0) brightness(1) drop-shadow(0 0 3px #2094fa) drop-shadow(0 0 2px #42a5f5)"; // blue

      let lastTooltip = makeTooltip(statusData);

      hospitalIcon.addEventListener('mouseenter', function(ev) {
        showTooltipAt(ev.pageX, ev.pageY, lastTooltip);
        apiGet(`/user/${userId}?selections=basic`, function(newStatus) {
          if (!newStatus.status) return;
          if (JSON.stringify(newStatus.status) !== JSON.stringify(statusData.status)) {
            Array.from(honorTextWrap.querySelectorAll('.ff-hospital-icon, .ff-travel-icon')).forEach(el => el.remove());
            addStatusIcon(newStatus, honorTextWrap, userId);
            showTooltipAt(ev.pageX, ev.pageY, makeTooltip(newStatus));
          }
        });
      });
      hospitalIcon.addEventListener('mousemove', function(ev) {
        showTooltipAt(ev.pageX, ev.pageY, lastTooltip);
      });
      hospitalIcon.addEventListener('mouseleave', hideTooltip);
      hospitalIcon.addEventListener('click', function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        showTooltipAt(ev.pageX, ev.pageY, lastTooltip);
        setTimeout(hideTooltip, 2000);
      });
      honorTextWrap.appendChild(hospitalIcon);
      return; // Don't render plane if in hospital
    }

    // If not in hospital, travel/abroad logic as before (hybrid tooltip)
    if (statusData.status.state === "Traveling" || statusData.status.state === "Abroad") {
      const plane = document.createElement('img');
      plane.src = PLANE_ICON_URL;
      plane.className = 'ff-travel-icon' + (statusData.status.state === "Traveling"
        ? ' ff-traveling'
        : ' ff-abroad');
      plane.alt = statusData.status.state;
      plane.setAttribute('draggable', 'false');
      plane.style.position = "absolute";
      plane.style.right = "4px";
      plane.style.bottom = "2px";
      plane.style.height = "16px";
      plane.style.width = "16px";
      plane.style.maxWidth = "16px";
      plane.style.maxHeight = "16px";
      plane.style.zIndex = "2147483646";
      plane.style.opacity = "0.92";
      plane.style.pointerEvents = "auto";

      let lastTooltip = makeTooltip(statusData);

      plane.addEventListener('mouseenter', function(ev) {
        showTooltipAt(ev.pageX, ev.pageY, lastTooltip);
        apiGet(`/user/${userId}?selections=basic`, function(newStatus) {
          if (!newStatus.status) return;
          if (JSON.stringify(newStatus.status) !== JSON.stringify(statusData.status)) {
            Array.from(honorTextWrap.querySelectorAll('.ff-travel-icon, .ff-hospital-icon')).forEach(el => el.remove());
            addStatusIcon(newStatus, honorTextWrap, userId);
            showTooltipAt(ev.pageX, ev.pageY, makeTooltip(newStatus));
          }
        });
      });
      plane.addEventListener('mousemove', function(ev) {
        showTooltipAt(ev.pageX, ev.pageY, lastTooltip);
      });
      plane.addEventListener('mouseleave', hideTooltip);
      plane.addEventListener('click', function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        showTooltipAt(ev.pageX, ev.pageY, lastTooltip);
        setTimeout(hideTooltip, 2000);
      });

      try {
        const _ffDesc = (statusData && statusData.status)
          ? (statusData.status.description || statusData.status.details || '').trim()
          : '';
        if (_ffDesc) plane.setAttribute('data-ff-desc', _ffDesc);
      } catch(e){}

      honorTextWrap.appendChild(plane);
    } else {
      hideTooltip();
    }
  }

  function injectOneTriangle(honorTextWrap, d, userId, e) {
    const oppBP = baseCalc(d.personalstats, d.basic)
                * getGymMultiplier(d.personalstats.xantaken || 0),
          raw   = (USER_BP / oppBP) * 100,
          wp    = 1 - (d.life.current / d.life.maximum || 1),
          fair  = Math.min(raw / 100, 1),
          boost = wp * settings.lifeWeight * fair,
          adj   = raw * (1 + boost),
          cls   = adj < settings.lowHigh ? 'high'
                : adj < settings.highMed ? 'med'
                : 'low',
          pct   = parseFloat(adj.toFixed(2));
    const pos = (100 - Math.min(adj, 200) / 200 * 100) + '%';
    let lifePct = null;
    if (d.life && typeof d.life.current === 'number' && d.life.maximum) {
      lifePct = Math.round((d.life.current / d.life.maximum) * 100);
    }
    let lastObj = null;
    if (d.last_action && typeof d.last_action === 'object') {
      lastObj = d.last_action;
    } else if (d.profile && d.profile.last_action && typeof d.profile.last_action === 'object') {
      lastObj = d.profile.last_action;
    } else if (d.basic && d.basic.last_action && typeof d.basic.last_action === 'object') {
      lastObj = d.basic.last_action;
    }
    let tooltipHtml = `RSI: ${pct.toFixed(2)}%`;
    if (lifePct !== null) tooltipHtml += `<br>Life: ${lifePct}%`;
    if (lastObj && typeof lastObj.relative === 'string') tooltipHtml += `<br>Last action: ${lastObj.relative}`;
    const img = document.createElement('img');
    img.className = 'ff-list-arrow-img';
    img.style.left = pos;
    img.src = cls === 'low' ? GREEN_ARROW_UP : cls === 'med' ? YELLOW_ARROW_UP : RED_ARROW_UP;
    img.setAttribute('width', '20');
    img.setAttribute('height', '20');
    img.style.width = "20px";
    img.style.height = "20px";
    img.style.maxWidth = "20px";
    img.style.maxHeight = "20px";
    if (wp > 0) img.classList.add('wounded');
    img.addEventListener('mouseenter', ee => { showTooltipAt(ee.pageX, ee.pageY, tooltipHtml); });
    img.addEventListener('mousemove', ee => { showTooltipAt(ee.pageX, ee.pageY, tooltipHtml); });
    img.addEventListener('mouseleave', hideTooltip);
    img.addEventListener('click', ee => {
      ee.preventDefault();
      showTooltipAt(ee.pageX, ee.pageY, tooltipHtml);
      setTimeout(hideTooltip, 2000);
    });
    honorTextWrap.appendChild(img);
    if (e && e.pageX) showTooltipAt(e.pageX, e.pageY, tooltipHtml);
  }

  function injectAll() {
    injectList();
  }

  // ---- GUI ----
  const fab      = document.createElement('div'),
        backdrop = document.createElement('div'),
        modal    = document.createElement('div');
  fab.className      = 'ff-fab'; fab.textContent = '⚙️';
  backdrop.className = 'ff-modal-backdrop';
  modal.className    = 'ff-modal';
  document.body.append(fab, backdrop, modal);

  modal.innerHTML = `
    <h3>ATK Scouter Settings</h3>
    <div class="ff-tabs">
      <div class="ff-tab active" data-tab="settings">⚙️ Settings</div>
      <div class="ff-tab"        data-tab="apikey">🔑 API Key</div>
    </div>
    <div class="ff-tab-content active" id="tab-settings">
      <label>High→Med cutoff (%)</label>
      <input type="number" id="ff-th1" value="${settings.lowHigh}" min="0" max="1000">
      <label>Med→Low cutoff (%)</label>
      <input type="number" id="ff-th2" value="${settings.highMed}" min="0" max="1000">
      <label>Life weight (0–1)</label>
      <input type="number" step="0.01" id="ff-lw" value="${settings.lifeWeight}" min="0" max="1">
      <label>Drug weight (0–1)</label>
      <input type="number" step="0.01" id="ff-dw" value="${settings.drugWeight}"  min="0" max="1">
    </div>
    <div class="ff-tab-content" id="tab-apikey">
      <label>API Key</label>
      <input type="text" id="ff-key" value="${API_KEY}" placeholder="Enter your Torn API Key…">
      <button class="btn btn-clear" id="ff-clear-key">Clear Key</button>
    </div>
    <div style="text-align:right;">
      <button class="btn btn-save"   id="ff-save">💾 Save & Reload</button>
      <button class="btn btn-cancel" id="ff-cancel">❌ Cancel</button>
    </div>
  `;

  modal.querySelectorAll('.ff-tab').forEach(tab => {
    tab.onclick = () => {
      modal.querySelectorAll('.ff-tab, .ff-tab-content')
           .forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelector('#tab-' + tab.dataset.tab).classList.add('active');
    };
  });

  fab.onclick = () => { backdrop.style.display = 'block'; modal.style.display = 'block'; };
  backdrop.onclick = closeModal;
  modal.querySelector('#ff-cancel').onclick = closeModal;
  function closeModal() {
    modal.style.display = 'none';
    backdrop.style.display = 'none';
  }
  modal.querySelector('#ff-clear-key').onclick = () => {
    rD_deleteValue('api_key');
    API_KEY = '';
    modal.querySelector('#ff-key').value = '';
    alert('API key cleared');
  };
  modal.querySelector('#ff-save').onclick = () => {
    const nk = modal.querySelector('#ff-key').value.trim();
    if (nk) rD_setValue('api_key', nk), API_KEY = nk;
    const v1 = +modal.querySelector('#ff-th1').value,
          v2 = +modal.querySelector('#ff-th2').value,
          v3 = +modal.querySelector('#ff-lw').value,
          v4 = +modal.querySelector('#ff-dw').value;
    if (!isNaN(v1)) rD_setValue('threshold_lowHigh', v1);
    if (!isNaN(v2)) rD_setValue('threshold_highMed', v2);
    if (!isNaN(v3)) rD_setValue('lifeWeight', v3);
    if (!isNaN(v4)) rD_setValue('drugWeight', v4);
    location.reload();
  };
  if (!API_KEY) {
    fab.click();
    modal.querySelector('[data-tab=apikey]').click();
  }


  // ---- BRIGHTER AND LONGER FLASH-FADE FOR NEW 'AVAILABLE' CELLS ----
  let seenAvail = new WeakSet();
  setInterval(() => {
    document.querySelectorAll('div').forEach(el => {
      if (el.textContent.match(/^\d+\s*available$/)) {
        // Inline transition for maximum priority
        el.style.transition = "background 3s cubic-bezier(.4,0,.2,1)";
        if (!seenAvail.has(el)) {
          seenAvail.add(el);
          el.style.background = "#ff0000"; // Bright red
          setTimeout(() => {
            el.style.background = ""; // Fades out over 3s
          }, 1200); // Red shows for 1.2s
        }
        // Always keep text white, normal
        el.style.color = "";
        el.style.fontWeight = "";
        el.style.fontSize = "";
      }
    });
  }, 1000);
  // ---- END PATCH ----

  // ==== BEGIN ATTACK BUTTON FOR MARKET SELLERS (CIRCLE ICON WITH RED GLOW) ====

  function injectMarketAttackButtons() {
    document.querySelectorAll('[class*="sellerListWrapper"] ul').forEach(ul => {
      ul.querySelectorAll('a[href*="profiles.php?XID="]').forEach(profileLink => {
        if (!profileLink.parentElement.querySelector('.ff-attack-btn')) {
          const xidMatch = profileLink.getAttribute('href').match(/XID=(\d+)/);
          if (!xidMatch) return;
          const xid = xidMatch[1];

          // Create the glowing circle icon button
          const btn = document.createElement('button');
          btn.className = 'ff-attack-btn';
          btn.title = 'Attack this player';
          btn.style.marginLeft = '5px';
          btn.style.background = 'transparent';
          btn.style.border = 'none';
          btn.style.padding = '0';
          btn.style.cursor = 'pointer';
          btn.style.verticalAlign = 'middle';

          // Create the icon with red glow
          const icon = document.createElement('img');
          icon.src = 'https://github.com/infodump01/LE-Scouter/raw/main/circle.png';
          icon.alt = 'Attack';
          icon.style.width = '16px';
          icon.style.height = '16px';
          icon.style.display = 'inline-block';
          icon.style.filter = 'drop-shadow(0 0 5px #ff1744) drop-shadow(0 0 6px #c62828)';
          icon.style.transition = 'filter 0.2s';

          // Optional: Stronger glow on hover
          btn.onmouseover = () => {
            icon.style.filter = 'drop-shadow(0 0 8px #ff1744) drop-shadow(0 0 14px #c62828)';
          };
          btn.onmouseout = () => {
            icon.style.filter = 'drop-shadow(0 0 5px #ff1744) drop-shadow(0 0 6px #c62828)';
          };

          btn.appendChild(icon);

          btn.onclick = (e) => {
            e.preventDefault();
            window.open(`https://www.torn.com/loader.php?sid=attack&user2ID=${xid}`, '_blank');
          };
          profileLink.parentElement.insertBefore(btn, profileLink.nextSibling);
        }
      });
    });
  }
  injectMarketAttackButtons();
  const obs = new MutationObserver(injectMarketAttackButtons);
  obs.observe(document.body, {childList: true, subtree: true});

  // ==== END ATTACK BUTTON FOR MARKET SELLERS (CIRCLE ICON WITH RED GLOW) ====

  // ==== BEGIN SCOPED PDA/PC MARKET PATCH ====

  // Track seen rows to prevent double effects
  var seenRows = new WeakSet();

  function flashAndAttackPatch() {
    document.querySelectorAll('[class*="rowWrapper"]').forEach(function(row) {
      // FLASH: Highlight only new rows
      if (!seenRows.has(row)) {
        seenRows.add(row);
        row.style.transition = "background 2.5s cubic-bezier(.4,0,.2,1)";
        row.style.background = "#ff3e30";
        setTimeout(function() {
          row.style.background = "";
        }, 1200);
      }

      // ATTACK BUTTON: Prevent double-insert
      if (row.querySelector('.ff-attack-btn')) return;

      // Look for a profile link (for seller XID)
      var profileLink = row.querySelector('a[href*="profiles.php?XID="]');
      if (!profileLink) return; // skip anonymous sellers

      var xidMatch = profileLink.getAttribute('href').match(/XID=(\d+)/);
      if (!xidMatch) return;
      var xid = xidMatch[1];

      // Use <a> for best mobile support
      var a = document.createElement('a');
      a.href = 'https://www.torn.com/loader.php?sid=attack&user2ID=' + xid;
      a.target = '_blank';
      a.className = 'ff-attack-btn';
      a.title = 'Attack this player';
      a.style.marginLeft = '5px';
      a.style.background = 'transparent';
      a.style.border = 'none';
      a.style.padding = '0';
      a.style.cursor = 'pointer';
      a.style.verticalAlign = 'middle';
      a.style.display = 'inline-block';

      var icon = document.createElement('img');
      icon.src = 'https://github.com/infodump01/LE-Scouter/raw/main/circle.png';
      icon.alt = 'Attack';
      icon.style.width = '16px';
      icon.style.height = '16px';
      icon.style.display = 'inline-block';
      icon.style.filter = 'drop-shadow(0 0 5px #ff1744) drop-shadow(0 0 6px #c62828)';
      icon.style.transition = 'filter 0.2s';

      a.appendChild(icon);

      // Insert after the profile link (you can tweak this if you want)
      profileLink.parentElement.appendChild(a);
    });
  }

  // Initial run and observer for dynamic page/app loads
  flashAndAttackPatch();
  var marketobs = new MutationObserver(flashAndAttackPatch);
  marketobs.observe(document.body, {childList: true, subtree: true});

  // ==== END SCOPED PDA/PC MARKET PATCH ====


// ==== NEW: Extra styles for countdown chips & collision badges ====
GM_addStyle(`
  .ff-countdown-chip {
    position: absolute;
    right: 24px;
    bottom: 2px;
    padding: 1px 4px;
    font-size: 10px;
    line-height: 12px;
    background: rgba(0,0,0,0.65);
    color: #fff;
    border-radius: 3px;
    z-index: 2147483647 !important;
    pointer-events: none;
    font-weight: 600;
  }
  .ff-collide-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    margin-left: 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: #ffeb3b;
    color: #000;
    box-shadow: 0 0 8px rgba(255,235,59,0.6);
  }
  .ff-collide-badge::before {
    content: "⚠";
  }
`);

// ==== NEW: Lightweight status countdown chips (Travel / Abroad / Hospital) ====
(function(){

  const COUNTDOWN_ATTR = 'data-ff-until'; // epoch ms, stored on chip
  const CHIPPED_ATTR = 'data-ff-chipped';

  function parseMinutesFromText(txt){
    if (!txt) return null;
    // e.g., "In a Switzerland hospital for 31 mins" / "Traveling to Japan (3 mins)"
    const m = String(txt).match(/(\d+)\s*min/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function ensureCountdownForIcon(icon){
    try {
      if (!icon || icon.getAttribute(CHIPPED_ATTR) === '1') return;

      const honorTextWrap = icon.closest('.honor-text-wrap') || icon.closest('div[class*="honorWrap"]');
      if (!honorTextWrap) return;

      let untilMs = null;

      // Prefer an explicit until attribute if present (seconds or ms since epoch)
      const untilAttr = icon.getAttribute('data-ff-until') || icon.getAttribute(COUNTDOWN_ATTR);
      if (untilAttr) {
        const raw = parseInt(untilAttr, 10);
        if (!Number.isNaN(raw) && raw > 0) {
          // If value looks like seconds, convert to ms; if already ms, keep as-is
          untilMs = raw < 1e12 ? raw * 1000 : raw;
        }
      }

      // Fallback: estimate from description text on the icon
      if (!untilMs) {
        const desc = icon.getAttribute('data-ff-desc') || '';
        const mins = parseMinutesFromText(desc);
        if (mins != null) {
          untilMs = Date.now() + mins * 60 * 1000;
        }
      }

      if (!untilMs) return;

      // Build or update chip
      let chip = honorTextWrap.querySelector('.ff-countdown-chip');
      if (!chip) {
        chip = document.createElement('span');
        chip.className = 'ff-countdown-chip';
        honorTextWrap.appendChild(chip);
      }
      chip.setAttribute(COUNTDOWN_ATTR, String(untilMs));
      icon.setAttribute(CHIPPED_ATTR, '1');
      // Initial render
      updateCountdownChip(chip);
    } catch(e){ /*ignore*/ }
  }

  function updateCountdownChip(chip){
    const until = parseInt(chip.getAttribute(COUNTDOWN_ATTR) || '0', 10);
    if (!until) { chip.textContent = ''; return; }
    let remaining = Math.max(0, until - Date.now());
    const s = Math.floor(remaining/1000);
    const hh = String(Math.floor(s/3600)).padStart(2,'0');
    const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    chip.textContent = `${hh}:${mm}:${ss}`;
  }

  function updateAllCountdowns(){
    document.querySelectorAll('.ff-countdown-chip').forEach(updateCountdownChip);
  }

  // Watch for new status icons and attach chips
  const iconObserver = new MutationObserver(() => {
    document.querySelectorAll('.ff-hospital-icon').forEach(ensureCountdownForIcon);
  });
  iconObserver.observe(document.body, { childList:true, subtree:true });

  // Also try once on load
  setTimeout(() => {
    document.querySelectorAll('.ff-hospital-icon').forEach(ensureCountdownForIcon);
  }, 800);

  // Tick
  setInterval(updateAllCountdowns, 1000);
})();

})();

// (replaced by micro-badge module)


// Replaced micro-badge module (v1.3.5)


// ==== NEW: Travel/Return/Abroad micro-badge anchored to the plane icon (no API) ====
(function(){

  GM_addStyle(`
    .ff-loc-badge {
      position: absolute;
      right: 22px;    /* to the LEFT of the plane (plane is at right: 4px) */
      bottom: 2px;
      padding: 0 2px;
      font-size: 9px;           /* matches hospital chip scale */
      line-height: 11px;
      background: rgba(0,0,0,0.65);
      color: #fff;
      border-radius: 2px;
      font-weight: 700;
      z-index: 2147483647 !important;
      pointer-events: none;
      letter-spacing: .2px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .ff-loc-badge[data-kind="travel"] { outline: 1px solid rgba(33,150,243,.9); }
    .ff-loc-badge[data-kind="return"] { outline: 1px solid rgba(3,169,244,.9); }
    .ff-loc-badge[data-kind="abroad"] { outline: 1px solid rgba(139,195,74,.9); }
  `);

  const LOC2CC = {
    "China":"CN","Japan":"JP","Mexico":"MX","Canada":"CA","United Kingdom":"GB","UK":"GB",
    "Argentina":"AR","UAE":"AE","United Arab Emirates":"AE","Dubai":"AE",
    "Switzerland":"CH","South Africa":"ZA","Hawaii":"HW","Hawai'i":"HW"
  };

  function abbrev(loc){
    if (!loc) return '';
    if (LOC2CC[loc]) return LOC2CC[loc];
    const u = String(loc).toUpperCase();
    const w = u.split(/\s+/)[0];
    return (w.slice(0,3) || u.slice(0,3)).replace(/[^A-Z]/g,'');
  }

  function parseInfo(desc){
    if (!desc) return null;
    let m;
    if ((m = desc.match(/^Traveling to\s+(.+)$/i)))  return {kind:'travel', loc:m[1].trim()};
    if ((m = desc.match(/^Returning to Torn from\s+(.+)$/i))) return {kind:'return', loc:m[1].trim()};
    if ((m = desc.match(/^In\s+(.+)$/i)))            return {kind:'abroad', loc:m[1].trim()};
    return null;
  }

  function attachBadge(icon){
    try {
      const parent = icon.parentElement || icon;
      if (parent.querySelector('.ff-loc-badge')) return;

      const desc = icon.getAttribute('data-ff-desc') || '';
      const info = parseInfo(desc);
      if (!info) return;

      // Ensure the wrapper can host absolutely positioned children
      const prevPos = parent.style.position;
      if (!prevPos || prevPos === 'static') parent.style.position = 'relative';

      const badge = document.createElement('span');
      badge.className = 'ff-loc-badge';
      badge.dataset.kind = info.kind;
      const arrow = info.kind === 'travel' ? '→ ' : info.kind === 'return' ? '← ' : '';
      badge.textContent = arrow + abbrev(info.loc);
      parent.appendChild(badge);
    } catch(e){ /*noop*/ }
  }

  const obs = new MutationObserver(() => {
    document.querySelectorAll('.ff-travel-icon').forEach(attachBadge);
  });
  obs.observe(document.body, { childList:true, subtree:true });

  setTimeout(() => {
    document.querySelectorAll('.ff-travel-icon').forEach(attachBadge);
  }, 600);

})();

// ==== NEW: Keep badges/timers in sync with icon lifecycle ====
(function(){
  function pruneOrphans(){
    // For each name-banner container, if the corresponding icon is gone, remove our overlays
    const wraps = document.querySelectorAll('.honor-text-wrap, div[class*="honorWrap"]');
    wraps.forEach(wrap => {
      const hasTravel = !!wrap.querySelector('.ff-travel-icon');
      const hasHosp   = !!wrap.querySelector('.ff-hospital-icon');
      if (!hasTravel) wrap.querySelectorAll('.ff-loc-badge').forEach(n => n.remove());
      if (!hasHosp)   wrap.querySelectorAll('.ff-countdown-chip').forEach(n => n.remove());
    });
  }

  // Run often but cheap
  const obs = new MutationObserver(pruneOrphans);
  obs.observe(document.body, { childList:true, subtree:true });
  setInterval(pruneOrphans, 2000);

  // After hover-driven refreshes, sweep once more
  document.body.addEventListener('mouseenter', (e) => {
    const t = e.target;
    if (t && (t.matches && (t.matches('.ff-travel-icon') || t.matches('.ff-hospital-icon')))) {
      setTimeout(pruneOrphans, 600);
    }
  }, true);

  // First sweep
  setTimeout(pruneOrphans, 800);
})();


// == ATK Scouter: compact cluster CSS (icon top-right, chip bottom-right) ==
(function(){
  GM_addStyle(`
    /* Smaller, compact plane/hospital icons at top-right */
    .honor-text-wrap .ff-travel-icon,
    .honor-text-wrap .ff-hospital-icon,
    div[class*="honorWrap"] .ff-travel-icon,
    div[class*="honorWrap"] .ff-hospital-icon {
      width: 12px !important;
      height: 12px !important;
      top: -1px !important;
      right: 4px !important;
      left: auto !important;
      bottom: auto !important;
      z-index: 2147483647 !important;
    }

    /* Data chip (country or hospital timer) bottom-right under icon */
    .honor-text-wrap .ff-countdown-chip,
    div[class*="honorWrap"] .ff-countdown-chip,
    .honor-text-wrap .ff-loc-badge,
    div[class*="honorWrap"] .ff-loc-badge {
      font-size: 9px !important;
      line-height: 10px !important;
      padding: 0 3px !important;
      right: 4px !important;
      left: auto !important;
      top: auto !important;
      bottom: -1px !important;
      background: rgba(0,0,0,0.65) !important;
      border-radius: 3px !important;
      z-index: 2147483647 !important;
    }

    /* Allow slight -1px offsets to render cleanly */
    .honor-text-wrap, div[class*="honorWrap"] { overflow: visible !important; }
  `);
})();


// == ATK Scouter: NO-PADDING anti-overlap (shift only our icons if a column intrudes) ==
(function(){
  GM_addStyle(`.ff-anti-overlap{ z-index:2147483647 !important; will-change: transform; pointer-events:none; }`);

  function rect(el){ try{ return el.getBoundingClientRect(); } catch(e){ return null; } }

  function findBannerCell(wrap){
    return wrap.closest('.table-cell') || wrap.closest('td,th') || wrap.parentElement;
  }
  function siblingsRight(cell){
    if (!cell || !cell.parentElement) return [];
    return Array.from(cell.parentElement.children).filter(el => el!==cell && (el.matches && (el.matches('.table-cell') || el.matches('td,th'))));
  }

  function findBarriers(wrap){
    const barriers=[];
    const w=rect(wrap);
    if(!w) return barriers;

    const cell=findBannerCell(wrap);
    for(const sib of siblingsRight(cell)){
      const r=rect(sib);
      if(!r||!r.width) continue;
      if(r.left<=w.right && r.left>=w.left) barriers.push(r.left);
    }

    const row=cell && cell.parentElement;
    if(row){
      const injected=row.querySelectorAll('.ff-scouter-ff-visible, .ff-scouter-est-hidden, .positionCol, .lvl, .lvlCol');
      injected.forEach(el=>{
        if(wrap.contains(el)) return;
        const r=rect(el);
        if(!r || r.width<4) return;
        const intr=r.left<=w.right && r.left>=w.left && !(r.bottom<=w.top || r.top>=w.bottom);
        if(intr) barriers.push(r.left);
      });
    }
    return barriers;
  }

  function adjustWrap(wrap){
    const w=rect(wrap);
    if(!w) return;
    const barriers=findBarriers(wrap);
    let shift=0;
    if(barriers.length){
      const inside=barriers.filter(x=>x<w.right);
      const target=inside.length ? Math.max(...inside) : null;
      if(target!==null) shift=Math.ceil(w.right - target)+6;
    }
    wrap.querySelectorAll('.ff-travel-icon, .ff-hospital-icon, .ff-loc-badge, .ff-countdown-chip').forEach(el=>{
      el.classList.add('ff-anti-overlap');
      el.style.transform = shift ? `translateX(${-shift}px)` : '';
    });
  }

  function run(){ document.querySelectorAll('.honor-text-wrap, div[class*="honorWrap"]').forEach(adjustWrap); }
  const mo=new MutationObserver(run);
  mo.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',run);
  setTimeout(run,400);
  setInterval(run,1500);
})();



// == ATK Scouter: CSS overrides (spacing + yellow Abroad pill) ==
(function(){
  GM_addStyle(`
    /* Extra vertical separation:
       - Lift icon a bit higher
       - Drop chip a bit lower
       This stacks cleanly in ~20–22px banners without touching name text. */
    .honor-text-wrap .ff-travel-icon,
    .honor-text-wrap .ff-hospital-icon,
    div[class*="honorWrap"] .ff-travel-icon,
    div[class*="honorWrap"] .ff-hospital-icon {
      top: -2px !important;
      right: 4px !important;
    }
    .honor-text-wrap .ff-countdown-chip,
    div[class*="honorWrap"] .ff-countdown-chip,
    .honor-text-wrap .ff-loc-badge,
    div[class*="honorWrap"] .ff-loc-badge {
      bottom: -4px !important;       /* was closer; this creates clear breathing room */
      right: 4px !important;
    }
    /* Abroad pill should match the yellow plane when "In <location>" */
    .ff-loc-badge[data-kind="abroad"] {
      background: #ffb300 !important;   /* amber 600 */
      color: #111 !important;
      outline: 1px solid #ffd54f !important; /* amber 300 */
      box-shadow: 0 0 6px rgba(255,179,0,.45);
    }
    /* Ensure tiny negative offsets render */
    .honor-text-wrap, div[class*="honorWrap"] { overflow: visible !important; }
  `);
})();


// == ATK Scouter: CSS-only hotfix (spacing + yellow/white Abroad pill) ==
(function(){
  GM_addStyle(`
    /* Guarantee separation between top-right icon and bottom-right pill */
    .honor-text-wrap .ff-travel-icon,
    .honor-text-wrap .ff-hospital-icon,
    div[class*="honorWrap"] .ff-travel-icon,
    div[class*="honorWrap"] .ff-hospital-icon {
      top: -2px !important;
      right: 4px !important;
    }
    .honor-text-wrap .ff-countdown-chip,
    div[class*="honorWrap"] .ff-countdown-chip,
    .honor-text-wrap .ff-loc-badge,
    div[class*="honorWrap"] .ff-loc-badge {
      bottom: -4px !important;
      right: 4px !important;
      color: #fff !important; /* ensure pill text matches other chips */
    }
    /* Abroad (in-location) pill matches yellow plane */
    .ff-loc-badge[data-kind="abroad"] {
      background: #ffb300 !important;    /* amber */
      outline: 1px solid #ffd54f !important;
      box-shadow: 0 0 6px rgba(255,179,0,.45);
    }
    /* Allow tiny negative offsets to render */
    .honor-text-wrap, div[class*="honorWrap"] { overflow: visible !important; }
  `);
})();



// ATK Scouter: modal z-index override
GM_addStyle(`
/* ATK Scouter: force settings modal above all icons/tooltips */
.ff-modal-backdrop {
  z-index: 2147483645 !important;
}
.ff-modal {
  z-index: 2147483648 !important;
}
`);
