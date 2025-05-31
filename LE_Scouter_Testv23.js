// ==UserScript==
// @name         LE Scouter Base v1.2.1 + Life% & Last Action + Larger Tooltip Arrows (PDA Fixed, No Double Desktop Inject)
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @match        https://pda.torn.com/*
// @version      1.2.1-life-action-relative-tooltips-larger-pdafix-nodouble
// @description  Two-tab dark GUI; injured+drug indicators; on profiles show Life% & “Last action” (shortened); on list pages inject larger 20×20px RSI arrows into honorWrap with tooltips that follow the cursor—now also runs on TORN PDA. DOES NOT duplicate the desktop banner on subsequent loads, and on PDA it inserts directly under the “.title-black” heading.
// @updateURL    https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_v1.2.1_life_action_relative_tooltips_larger_pdafix_nodouble.js
// @downloadURL  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_v1.2.1_life_action_relative_tooltips_larger_pdafix_nodouble.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==
(() => {
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

  // ---- Config & Defaults ----
  let API_KEY = rD_getValue('api_key','');
  const defaults = { lowHigh:100, highMed:120, lifeWeight:0.1, drugWeight:0.1 };
  const settings = {
    lowHigh:    +rD_getValue('threshold_lowHigh', defaults.lowHigh),
    highMed:    +rD_getValue('threshold_highMed', defaults.highMed),
    lifeWeight: +rD_getValue('lifeWeight', defaults.lifeWeight),
    drugWeight: +rD_getValue('drugWeight', defaults.drugWeight)
  };

  // ---- Styles (larger 20×20 arrow; enable pointer-events; tooltip; red Cancel button) ----
  GM_addStyle(`
    /* Score badges */
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

    /* Larger Triangle arrows (20px tall = 10px top + 10px bottom; 20px wide) */
    .ff-list-arrow {
      position:absolute;
      top:50%;
      transform:translate(-50%,-50%);
      width:0;
      height:0;
      border-top:10px solid transparent;
      border-bottom:10px solid transparent;
      border-right:20px solid #2e7d32; /* default “low” */
      pointer-events:auto;
      z-index:10;
    }
    .ff-list-arrow.med    { border-right-color:#f9a825; }
    .ff-list-arrow.high   { border-right-color:#c62828; }
    .ff-list-arrow.wounded {
      box-shadow:0 0 6px 2px rgba(229,57,53,0.8);
    }

    /* Tooltip floating in viewport */
    .ff-tooltip-viewport {
      position: absolute;
      background: rgba(0,0,0,0.85);
      color: #fff;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      line-height: 1.2em;
      white-space: nowrap;
      z-index: 30000; /* above everything */
      pointer-events: none;
    }

    /* Floating action button */
    .ff-fab {
      position:fixed; bottom:20px; left:20px;
      width:50px; height:50px; border-radius:25px;
      background:#222; color:#eee; font-size:26px; line-height:50px;
      text-align:center; cursor:pointer; z-index:10000;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
      transition:background .2s;
    }
    .ff-fab:hover { background:#333; }

    /* Modal backdrop */
    .ff-modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,0.7);
      z-index:9998; display:none;
    }

    /* Modal window */
    .ff-modal {
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:#2b2b2b; color:#eee; padding:20px; border-radius:8px;
      z-index:9999; min-width:360px; display:none;
      box-shadow:0 8px 24px rgba(0,0,0,0.6);
      font-family:sans-serif;
    }
    .ff-modal h3 {
      margin:0 0 12px; font-size:1.3em; display:flex; align-items:center;
    }
    .ff-modal h3::before { content:"🛠️"; margin-right:8px; }

    /* Tabs */
    .ff-tabs { display:flex; margin-bottom:12px; }
    .ff-tab {
      flex:1; padding:8px; text-align:center; cursor:pointer;
      color:#aaa; border-bottom:2px solid transparent;
      user-select:none; transition:color .2s, border-color .2s;
    }
    .ff-tab.active {
      color:#fff; border-color:#fff;
    }

    /* Tab content */
    .ff-tab-content { display:none; }
    .ff-tab-content.active { display:block; }

    /* Form fields */
    .ff-modal label {
      display:block; margin:12px 0 4px; font-size:0.9em; color:#ccc;
    }
    .ff-modal input {
      width:100%; padding:6px; border:1px solid #444;
      border-radius:4px; background:#333; color:#eee;
      font-size:1em;
    }

    /* Buttons */
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
      background:#c62828; color:#fff; /* red */
    }
    .ff-modal .btn-cancel:hover { background:#e53935; }
    .ff-modal .btn-clear {
      background:#555; color:#fff; margin-left:8px;
    }
    .ff-modal .btn-clear:hover { background:#666; }
  `);

  // ---- API GET helper ----
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

  // ---- Base BP calc (pre-gym/drug) ----
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

  // ---- Gym multiplier ----
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

  // ---- User state ----
  let ME_STATS         = null,
      ME_DRUGS         = null,
      USER_BP          = null,
      USER_DRUG_DEBUFF = 0;

  // fetch our own stats
  apiGet('/user/?selections=personalstats,basic', d => { ME_STATS = d; initIfReady(); });
  apiGet('/user/?selections=battlestats',       d => { ME_DRUGS = d; initIfReady(); });

  function initIfReady() {
    if (!ME_STATS || !ME_DRUGS) return;

    // compute drug debuff
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

    // compute our BP
    USER_BP = baseCalc(ME_STATS.personalstats, ME_STATS.basic)
            * getGymMultiplier(ME_STATS.personalstats.xantaken || 0)
            * (1 - USER_DRUG_DEBUFF * settings.drugWeight);

    // kick things off
    injectAll();
    window.addEventListener('popstate', injectAll);
    new MutationObserver(m => m.forEach(r => injectAll()))
      .observe(document.body, { childList:true, subtree:true });
  }

  // ---- Utility: show/hide a single floating tooltip at cursor page coords ----
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
      // Center horizontally on pageX:
      let left = pageX - rect.width / 2;
      left = Math.max(4, Math.min(left, document.documentElement.clientWidth - rect.width - 4));
      // Place ~12px above the cursor’s Y
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

  // ---- Injection: Profile (short last_action.relative) + List (into honorWrap) ----
  function injectProfile() {
    const m = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
    if (!m || USER_BP === null) return;
    const userId = m[1];

    // 1) Try to find desktop‐style heading (h1–h4) containing “[ID]”
    let heading = document.querySelector('h4');
    if (!heading || !heading.textContent.includes(userId)) {
      heading = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
                     .find(h => h.textContent.includes(userId));
    }

    // — If we *did* find a desktop heading, and we have not injected before, insert here once and return —
    if (heading && !heading.dataset.ff) {
      heading.dataset.ff = '1';
      apiGet(`/user/${userId}?selections=personalstats,basic,profile`, o => {
        const oppBP = baseCalc(o.personalstats, o.basic)
                    * getGymMultiplier(o.personalstats.xantaken || 0),
              raw   = (USER_BP / oppBP) * 100,
              wp    = 1 - (o.life.current / o.life.maximum || 1),
              fair  = Math.min(raw/100, 1),
              boost = wp * settings.lifeWeight * fair,
              adj   = raw * (1 + boost),
              pct   = parseFloat(adj.toFixed(2));

        let cls  = 'low', note = 'Advantage';
        if (pct < settings.lowHigh)     { cls = 'high'; note = 'High risk'; }
        else if (pct < settings.highMed) { cls = 'med';  note = 'Moderate risk'; }

        // Compute Life % (if available)
        let lifePct = null;
        if (o.life && typeof o.life.current === 'number' && o.life.maximum) {
          lifePct = Math.round((o.life.current / o.life.maximum) * 100);
        }

        // Find any last_action
        let lastObj = null;
        if (o.last_action && typeof o.last_action === 'object') {
          lastObj = o.last_action;
        } else if (o.profile && o.profile.last_action && typeof o.profile.last_action === 'object') {
          lastObj = o.profile.last_action;
        } else if (o.basic && o.basic.last_action && typeof o.basic.last_action === 'object') {
          lastObj = o.basic.last_action;
        }

        // Convert “32 minutes ago” → “32m”, “2 hours ago” → “2h”, “5 days ago” → “5d”
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

        // Build “extra” text: “ (L xx% · A yy)”
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
        heading.appendChild(sp);
      });
      return;
    }

    // — If *any* heading was found (even if data‐ff was already set), bail out now —
    if (heading) {
      return;
    }

    // 2) If *no* desktop heading was found, try to insert under the mobile “.title-black” heading
    //    (only once). On Torn PDA, the player’s profile name appears in:
    //    <div class="title-black m-top10 titleToggle__…">Aeyroth’s Profile</div>
    const mobileHeading = document.querySelector('.title-black');
    if (mobileHeading && /Profile$/.test(mobileHeading.textContent) && !mobileHeading.dataset.ffMobile) {
      mobileHeading.dataset.ffMobile = '1';
      apiGet(`/user/${userId}?selections=personalstats,basic,profile`, o => {
        const oppBP = baseCalc(o.personalstats, o.basic)
                    * getGymMultiplier(o.personalstats.xantaken || 0),
              raw   = (USER_BP / oppBP) * 100,
              wp    = 1 - (o.life.current / o.life.maximum || 1),
              fair  = Math.min(raw/100, 1),
              boost = wp * settings.lifeWeight * fair,
              adj   = raw * (1 + boost),
              pct   = parseFloat(adj.toFixed(2));

        let cls  = 'low', note = 'Advantage';
        if (pct < settings.lowHigh)     { cls = 'high'; note = 'High risk'; }
        else if (pct < settings.highMed) { cls = 'med';  note = 'Moderate risk'; }

        // Compute Life % (if available)
        let lifePct = null;
        if (o.life && typeof o.life.current === 'number' && o.life.maximum) {
          lifePct = Math.round((o.life.current / o.life.maximum) * 100);
        }

        // Find any last_action
        let lastObj = null;
        if (o.last_action && typeof o.last_action === 'object') {
          lastObj = o.last_action;
        } else if (o.profile && o.profile.last_action && typeof o.profile.last_action === 'object') {
          lastObj = o.profile.last_action;
        } else if (o.basic && o.basic.last_action && typeof o.basic.last_action === 'object') {
          lastObj = o.basic.last_action;
        }

        // Convert “32 minutes ago” → “32m”, “2 hours ago” → “2h”, “5 days ago” → “5d”
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

        // Build “extra” text: “ (L xx% · A yy)”
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
        // Insert immediately after the “.title-black” element on PDA
        mobileHeading.insertAdjacentElement('afterend', sp);
      });
      return;
    }

    // 3) As a last resort (if neither <h4> nor “.title-black” was found), prepend at top of wrapper
    let mobileWrapper = document.querySelector('.bodyWrap__dnkU')
                     || document.querySelector('#appWrap')
                     || document.querySelector('main')
                     || document.body;
    if (mobileWrapper.dataset.ffProfile) return;
    mobileWrapper.dataset.ffProfile = '1';

    apiGet(`/user/${userId}?selections=personalstats,basic,profile`, o => {
      const oppBP = baseCalc(o.personalstats, o.basic)
                  * getGymMultiplier(o.personalstats.xantaken || 0),
            raw   = (USER_BP / oppBP) * 100,
            wp    = 1 - (o.life.current / o.life.maximum || 1),
            fair  = Math.min(raw/100, 1),
            boost = wp * settings.lifeWeight * fair,
            adj   = raw * (1 + boost),
            pct   = parseFloat(adj.toFixed(2));

      let cls  = 'low', note = 'Advantage';
      if (pct < settings.lowHigh)     { cls = 'high'; note = 'High risk'; }
      else if (pct < settings.highMed) { cls = 'med';  note = 'Moderate risk'; }

      // Compute Life % (if available)
      let lifePct = null;
      if (o.life && typeof o.life.current === 'number' && o.life.maximum) {
        lifePct = Math.round((o.life.current / o.life.maximum) * 100);
      }

      // Find any last_action
      let lastObj = null;
      if (o.last_action && typeof o.last_action === 'object') {
        lastObj = o.last_action;
      } else if (o.profile && o.profile.last_action && typeof o.profile.last_action === 'object') {
        lastObj = o.profile.last_action;
      } else if (o.basic && o.basic.last_action && typeof o.basic.last_action === 'object') {
        lastObj = o.basic.last_action;
      }

      // Convert “32 minutes ago” → “32m”, “2 hours ago” → “2h”, “5 days ago” → “5d”
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

      // Build “extra” text: “ (L xx% · A yy)”
      let extra = '';
      if (lifePct !== null && rel !== null) {
        extra = ` (L ${lifePct}% · A ${rel})`;
      } else if (lifePct !== null) {
        extra = ` (L ${lifePct}%)`;
      } else if (rel !== null) {
        extra = ` (A ${rel})`;
      }

      // Create and prepend at top of wrapper
      const sp = document.createElement('div');
      sp.className = `ff-score-badge ${cls}` + (wp > 0 ? ' wounded' : '');
      sp.style.display = 'inline-block';
      sp.style.margin = '8px 0';
      sp.innerHTML = `
        RSI ${pct}% — ${note}${extra}
        ${wp > 0 ? `<span style="margin-left:6px; color:#fff;">✚</span>` : ''}
        ${USER_DRUG_DEBUFF > 0
          ? `<img src="https://raw.githubusercontent.com/infodump01/LE-Scouter/main/pill-icon-2048x2048.png"
                style="width:12px;height:12px;vertical-align:middle;margin-left:6px;">`
          : ''
        }
      `;
      mobileWrapper.prepend(sp);
    });
  }

  function injectList(root = document) {
    injectProfile();

    // On list pages, for each <a href="profiles.php?XID=">…</a>:
    root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(a => {
      // 1) Find the nearest honorWrap DIV:
      const honorWrap = a.closest('div[class*="honorWrap"]');
      if (!honorWrap) return;
      if (honorWrap.dataset.ff) return;
      honorWrap.dataset.ff = '1';

      // Force honorWrap to position:relative if it was “static”
      const computed = window.getComputedStyle(honorWrap);
      if (computed.position === 'static') {
        honorWrap.style.position = 'relative';
      }

      // 2) Extract user ID:
      const userIdMatch = a.href.match(/XID=(\d+)/);
      if (!userIdMatch) return;
      const userId = userIdMatch[1];

      apiGet(`/user/${userId}?selections=personalstats,basic,profile`, d => {
        const oppBP = baseCalc(d.personalstats, d.basic)
                    * getGymMultiplier(d.personalstats.xantaken || 0),
              raw   = (USER_BP / oppBP) * 100,
              wp    = 1 - (d.life.current / d.life.maximum || 1),
              fair  = Math.min(raw/100, 1),
              boost = wp * settings.lifeWeight * fair,
              adj   = raw * (1 + boost),
              cls   = adj < settings.lowHigh ? 'high'
                    : adj < settings.highMed ? 'med'
                    : 'low',
              pct   = parseFloat(adj.toFixed(2));

        // Determine horizontal position percentage across banner
        const pos = (100 - Math.min(adj, 200)/200 * 100) + '%';

        // Compute Life % if available
        let lifePct = null;
        if (d.life && typeof d.life.current === 'number' && d.life.maximum) {
          lifePct = Math.round((d.life.current / d.life.maximum) * 100);
        }

        // Find last_action (unshortened)
        let lastObj = null;
        if (d.last_action && typeof d.last_action === 'object') {
          lastObj = d.last_action;
        } else if (d.profile && d.profile.last_action && typeof d.profile.last_action === 'object') {
          lastObj = d.profile.last_action;
        } else if (d.basic && d.basic.last_action && typeof d.basic.last_action === 'object') {
          lastObj = d.basic.last_action;
        }

        // Build tooltip HTML:
        let tooltipHtml = `RSI: ${pct.toFixed(2)}%`;
        if (lifePct !== null) {
          tooltipHtml += `<br>Life: ${lifePct}%`;
        }
        if (lastObj && typeof lastObj.relative === 'string') {
          tooltipHtml += `<br>Last action: ${lastObj.relative}`;
        }

        // 3) Create the larger arrow inside honorWrap:
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.top      = '50%';
        wrapper.style.transform= 'translate(-50%,-50%)';
        wrapper.style.left     = pos;
        wrapper.style.zIndex   = '10';

        const el = document.createElement('span');
        el.className = `ff-list-arrow ${cls}` + (wp > 0 ? ' wounded' : '');

        // 4) Attach cursor-anchored tooltip handlers:
        el.addEventListener('mouseenter', e => {
          showTooltipAt(e.pageX, e.pageY, tooltipHtml);
        });
        el.addEventListener('mousemove', e => {
          showTooltipAt(e.pageX, e.pageY, tooltipHtml);
        });
        el.addEventListener('mouseleave', () => {
          hideTooltip();
        });
        // On mobile tap: show for 2s
        el.addEventListener('click', e => {
          e.preventDefault();
          showTooltipAt(e.pageX, e.pageY, tooltipHtml);
          setTimeout(hideTooltip, 2000);
        });

        wrapper.appendChild(el);
        honorWrap.appendChild(wrapper);
      });
    });
  }

  function injectAll() {
    injectList();
  }

  // ---- Build GUI (Cancel remains red) ----
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

  // Tab switching
  modal.querySelectorAll('.ff-tab').forEach(tab => {
    tab.onclick = () => {
      modal.querySelectorAll('.ff-tab, .ff-tab-content')
           .forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelector('#tab-' + tab.dataset.tab).classList.add('active');
    };
  });

  // Open/close modal
  fab.onclick = () => { backdrop.style.display = 'block'; modal.style.display = 'block'; };
  backdrop.onclick = closeModal;
  modal.querySelector('#ff-cancel').onclick = closeModal;
  function closeModal() {
    modal.style.display = 'none';
    backdrop.style.display = 'none';
  }

  // Clear Key
  modal.querySelector('#ff-clear-key').onclick = () => {
    rD_deleteValue('api_key');
    API_KEY = '';
    modal.querySelector('#ff-key').value = '';
    alert('API key cleared');
  };

  // Save & Reload
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

  // Auto-open API tab if no key
  if (!API_KEY) {
    fab.click();
    modal.querySelector('[data-tab=apikey]').click();
  }

  // Kick off initial injection & observe for AJAX navigation
  injectAll();
  window.addEventListener('popstate', injectAll);
  new MutationObserver(m => m.forEach(r => injectAll()))
    .observe(document.body, { childList:true, subtree:true });
})();
