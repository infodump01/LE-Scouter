// ==UserScript==
// @name         LE Scouter Base v1.2.4
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @match        https://pda.torn.com/*
// @version      1.2.4
// @description  RSI arrow and live-updating plane icon (blue/orange) for travel status; custom tooltip only (never double); RSI banner restored for profile pages
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
  `);

  function apiGet(ep, cb) {
    if (!API_KEY) return;
    rD_xmlhttpRequest({
      method: 'GET',
      url: `https://api.torn.com${ep}&key=${API_KEY}`,
      onload: r => {
        try {
          const d = JSON.parse(r.responseText);
          if (!d.error) cb(d);
        } catch(e){}
      },
      onerror: console.error
    });
  }

  function baseCalc(ps,b) {
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
        // Remove any existing triangle/plane
        Array.from(honorTextWrap.querySelectorAll('.ff-list-arrow-img, .ff-travel-icon')).forEach(el => el.remove());

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

        // PLANE ICON if Traveling/Abroad, with live update:
        function addPlaneIcon(statusData, triggerEvt) {
          // Remove old icons
          Array.from(honorTextWrap.querySelectorAll('.ff-travel-icon')).forEach(el => el.remove());
          if (statusData.status && (statusData.status.state === "Traveling" || statusData.status.state === "Abroad")) {
            const plane = document.createElement('img');
            plane.src = PLANE_ICON_URL;
            plane.className = 'ff-travel-icon' + (statusData.status.state === "Traveling"
              ? ' ff-traveling'
              : ' ff-abroad');
            // No .title set here!
            plane.alt = statusData.status.state;
            plane.setAttribute('draggable', 'false');

            const updatePlaneStatus = (ev) => {
              apiGet(`/user/${userId}?selections=basic`, newStatus => {
                addPlaneIcon(newStatus, ev);
                if (newStatus.status && (newStatus.status.state === "Traveling" || newStatus.status.state === "Abroad")) {
                  showTooltipAt(ev.pageX, ev.pageY, newStatus.status.description || newStatus.status.state);
                } else {
                  hideTooltip();
                }
              });
            };

            plane.addEventListener('mouseenter', updatePlaneStatus);
            plane.addEventListener('mousemove', function(ev2){
              showTooltipAt(ev2.pageX, ev2.pageY, statusData.status.description || statusData.status.state);
            });
            plane.addEventListener('mouseleave', hideTooltip);
            plane.addEventListener('click', function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              updatePlaneStatus(ev);
            });
            honorTextWrap.appendChild(plane);
            if (triggerEvt && triggerEvt.pageX) showTooltipAt(triggerEvt.pageX, triggerEvt.pageY, statusData.status.description || statusData.status.state);
          } else {
            hideTooltip();
          }
        }
        apiGet(`/user/${userId}?selections=basic`, statusData => addPlaneIcon(statusData));
      });
    });
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
    <h3>LE Scouter Settings</h3>
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
  injectAll();
  window.addEventListener('popstate', injectAll);
  new MutationObserver(m => m.forEach(r => injectAll()))
    .observe(document.body, { childList:true, subtree:true });

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

// ==== BEGIN PDA MOBILE NEW SELLER FLASH + ATTACK BUTTON PATCH ====

// Track which seller rows have already been seen/flashed
let seenRows = new WeakSet();

function pdaFlashAndAttack() {
  document.querySelectorAll('tr,div').forEach(row => {
    // Look for a seller (profile link)
    const profileLink = row.querySelector('a[href*="profiles.php?XID="]');
    if (!profileLink) return;

    // --- NEW SELLER FLASH EFFECT ---
    if (!seenRows.has(row)) {
      seenRows.add(row);
      // Try to pick a child cell or use the row itself
      // (You can target a specific cell if you find a better selector)
      row.style.transition = "background 2.5s cubic-bezier(.4,0,.2,1)";
      row.style.background = "#ff3e30"; // Bright red
      setTimeout(() => {
        row.style.background = "";
      }, 1200);
    }

    // --- ATTACK BUTTON ---
    if (row.querySelector('.ff-attack-btn')) return; // Prevent duplicates
    const xidMatch = profileLink.getAttribute('href').match(/XID=(\d+)/);
    if (!xidMatch) return;
    const xid = xidMatch[1];

    const btn = document.createElement('button');
    btn.className = 'ff-attack-btn';
    btn.title = 'Attack this player';
    btn.style.marginLeft = '5px';
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.padding = '0';
    btn.style.cursor = 'pointer';
    btn.style.verticalAlign = 'middle';

    const icon = document.createElement('img');
    icon.src = 'https://github.com/infodump01/LE-Scouter/raw/main/circle.png';
    icon.alt = 'Attack';
    icon.style.width = '16px';
    icon.style.height = '16px';
    icon.style.display = 'inline-block';
    icon.style.filter = 'drop-shadow(0 0 5px #ff1744) drop-shadow(0 0 6px #c62828)';
    icon.style.transition = 'filter 0.2s';

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
  });
}

// Run initially and observe for new rows
pdaFlashAndAttack();
const obsPDA = new MutationObserver(pdaFlashAndAttack);
obsPDA.observe(document.body, {childList: true, subtree: true});

// ==== END PDA MOBILE NEW SELLER FLASH + ATTACK BUTTON PATCH ====


})();
