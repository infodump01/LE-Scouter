// ==UserScript==
// @name         LE Scouter Base v1.1.2
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @version      1.1.2
// @description  API key moved into GUI; gym-tier BP; wounded boost; medical indicator inside badge
// @updateURL    https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
// @downloadURL  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// ==/UserScript==
(() => {
    // ---- Adapter ----
    if (typeof PDA_httpGet === 'function') {
        window.rD_xmlhttpRequest = details =>
            details.method.toLowerCase()==='get'
                ? PDA_httpGet(details.url).then(details.onload).catch(details.onerror)
                : PDA_httpPost(details.url, details.headers, details.data).then(details.onload).catch(details.onerror);
        window.rD_setValue = (k,v)=>localStorage.setItem(k,v);
        window.rD_getValue = (k,d)=>localStorage.getItem(k)||d;
        window.rD_deleteValue = k=>localStorage.removeItem(k);
        window.rD_registerMenuCommand = ()=>{};
    } else {
        window.rD_xmlhttpRequest = GM_xmlhttpRequest;
        window.rD_setValue = GM_setValue;
        window.rD_getValue = GM_getValue;
        window.rD_deleteValue = GM_deleteValue;
        window.rD_registerMenuCommand = GM_registerMenuCommand;
    }

    // ---- Config ----
    let API_KEY = rD_getValue('api_key','');
    const defaults = { lowHigh:100, highMed:120, lifeWeight:0.1 };
    const settings = {
        lowHigh: parseFloat(rD_getValue('threshold_lowHigh', defaults.lowHigh)),
        highMed: parseFloat(rD_getValue('threshold_highMed', defaults.highMed)),
        lifeWeight: parseFloat(rD_getValue('lifeWeight', defaults.lifeWeight))
    };

    // ---- Styles ----
    GM_addStyle(`
        .ff-score-badge { display:inline-block; margin-left:8px; padding:4px 8px; border-radius:6px; font-size:0.95em; color:#fff; }
        .ff-score-badge.high{background:#c62828;} .ff-score-badge.med{background:#f9a825;} .ff-score-badge.low{background:#2e7d32;}
        .ff-score-badge.wounded{box-shadow:0 0 6px 2px rgba(229,57,53,0.8);}
        .ff-list-arrow{position:absolute;top:50%;transform:translate(-50%,-50%);width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;pointer-events:none;}
        .ff-list-arrow.low{border-right:12px solid #2e7d32;} .ff-list-arrow.med{border-right:12px solid #f9a825;} .ff-list-arrow.high{border-right:12px solid #c62828;}
        .ff-list-arrow.wounded{box-shadow:0 0 6px 2px rgba(229,57,53,0.8);}
        .ff-fab{position:fixed;bottom:16px;left:16px;width:48px;height:48px;border-radius:24px;background:#444;color:#fff;font-size:24px;line-height:48px;text-align:center;cursor:pointer;z-index:10000;opacity:0.8;transition:opacity .2s;}
        .ff-fab:hover{opacity:1;}
        .ff-modal-backdrop{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9998;display:none;}
        .ff-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:16px;border-radius:8px;z-index:9999;min-width:300px;display:none;}
        .ff-modal h3{margin-top:0;font-size:1.1em;}
        .ff-modal label{display:block;margin:8px 0 4px;font-size:0.9em;}
        .ff-modal input{width:100%;padding:4px;margin-bottom:8px;}
        .ff-modal button{margin-right:8px;padding:6px 12px;}
        .ff-tabs {display:flex; margin-bottom:12px;}
        .ff-tab {flex:1; text-align:center; padding:6px; cursor:pointer; border-bottom:2px solid #ccc;}
        .ff-tab.active {border-bottom:2px solid #444; font-weight:bold;}
        .ff-tab-content {display:none;}
        .ff-tab-content.active {display:block;}
    `);

    // ---- API GET ----
    function apiGet(ep, cb) {
        if (!API_KEY) return;
        rD_xmlhttpRequest({ method:'GET', url:`https://api.torn.com${ep}&key=${API_KEY}`, onload:r=>{
            try{const d=JSON.parse(r.responseText); if(!d.error) cb(d);}catch(e){console.error(e);} }, onerror:console.error });
    }

    // ---- Estimator ----
    function estimateBP(ps,b) {
        const elo=ps.elo*2;
        const dmg=Math.sqrt(ps.attackdamage/1000)*1.5;
        const win=Math.sqrt(Math.max(ps.attackswon-ps.attackslost,0))*1.2;
        const wr=(ps.attackswon+ps.attackslost)>0?ps.attackswon/(ps.attackswon+ps.attackslost):0;
        const cr=ps.attackhits>0?ps.attackcriticalhits/ps.attackhits:0;
        const nw=Math.log10((ps.networth||0)+1)*5;
        const now=Date.now()/1000;
        const joined=b&&b.joined?b.joined:now;
        const age=Math.log10(((now-joined)/86400)+1)*5;
        const act=Math.log10((ps.useractivity||0)+1)*2;
        const base=elo + dmg + win + wr*100 + cr*100 + nw + age + act;
        return base * getGymMultiplier(ps.xantaken||0);
    }

    const gymTiers = [
        {energy:0,     mul:1},
        {energy:200,   mul:1.2375},
        {energy:500,   mul:1.45},
        {energy:1000,  mul:1.6},
        {energy:2000,  mul:1.7},
        {energy:2750,  mul:1.8},
        {energy:3000,  mul:1.85},
        {energy:3500,  mul:1.85},
        {energy:4000,  mul:2},
        {energy:6000,  mul:2.175},
        {energy:7000,  mul:2.275},
        {energy:8000,  mul:2.425},
        {energy:11000, mul:2.525},
        {energy:12420, mul:2.55},
        {energy:18000, mul:2.7375},
        {energy:18100, mul:2.785},
        {energy:24140, mul:3},
        {energy:31260, mul:3.1},
        {energy:36610, mul:3.1625},
        {energy:46640, mul:3.2625},
        {energy:56520, mul:3.325},
        {energy:67775, mul:3.2875},
        {energy:84535, mul:3.35},
        {energy:106305,mul:3.45},
        {energy:100000000,mul:3.65}
    ];
    function getGymMultiplier(xan){
        const e=xan*250;
        let m=1;
        gymTiers.forEach(t=>{ if(e>=t.energy) m=t.mul; });
        return m;
    }

    // ---- User BP ----
    let USER_BP = null;
    apiGet('/user/?selections=personalstats,basic', me=>{
        USER_BP = estimateBP(me.personalstats, me.basic);
    });

    // ---- Inject ----
    function injectProfile(){
        const m = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
        if (!m || USER_BP===null) return;
        const h = document.querySelector('h4');
        if (!h || h.dataset.ff) return;
        h.dataset.ff = 1;
        apiGet(`/user/${m[1]}?selections=personalstats,basic,profile`, o=>{
            const opp  = estimateBP(o.personalstats, o.basic),
                  raw  = (USER_BP/opp)*100,
                  wp   = 1 - (o.life.current/o.life.maximum||1),
                  fair = Math.min(raw/100,1),
                  boost= wp * settings.lifeWeight * fair,
                  adj  = raw*(1+boost),
                  pct  = parseFloat(adj.toFixed(2));
            let cls='low', note='Advantage';
            if (pct < settings.lowHigh) { cls='high'; note='High risk'; }
            else if (pct < settings.highMed) { cls='med'; note='Moderate risk'; }
            const sp = document.createElement('span');
            sp.className = `ff-score-badge ${cls}` +
                           (wp>0?' wounded':'');
            // place medical cross inside:
            sp.innerHTML = `RSI ${pct}% — ${note}` +
                (wp>0?` <span style="margin-left:4px;">✚</span>`:'');
            h.appendChild(sp);
        });
    }
    function injectList(root=document){
        injectProfile();
        root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(a=>{
            const n = a.closest('tr,li,div,td')||a.parentNode;
            if (n.dataset.ff) return;
            n.dataset.ff = 1;
            n.style.position='relative';
            apiGet(`/user/${a.href.match(/XID=(\d+)/)[1]}?selections=personalstats,basic,profile`, d=>{
                const opp  = estimateBP(d.personalstats, d.basic),
                      raw  = (USER_BP/opp)*100,
                      wp   = 1 - (d.life.current/d.life.maximum||1),
                      fair = Math.min(raw/100,1),
                      boost= wp * settings.lifeWeight * fair,
                      adj  = raw*(1+boost),
                      cls  = adj<settings.lowHigh?'high':adj<settings.highMed?'med':'low',
                      pos  = (100 - Math.min(adj,200)/200*100) + '%';
                const el = document.createElement('span');
                el.className = `ff-list-arrow ${cls}` + (wp>0?' wounded':'');
                el.style.left = pos;
                n.appendChild(el);
            });
        });
    }

    // ---- GUI & Modal ----
    const fab      = document.createElement('div'); fab.className='ff-fab';      fab.textContent='⚙️'; document.body.appendChild(fab);
    const backdrop = document.createElement('div'); backdrop.className='ff-modal-backdrop'; document.body.appendChild(backdrop);
    const modal    = document.createElement('div'); modal.className='ff-modal';
    modal.innerHTML = `
      <div class="ff-tabs">
        <div class="ff-tab active" data-tab="settings">Settings</div>
        <div class="ff-tab" data-tab="apikey">API Key</div>
      </div>
      <div class="ff-tab-content active" id="tab-settings">
        <label>High→Med cutoff (%)</label><input type="number" id="ff-th1" value="${settings.lowHigh}" min="0" max="1000">
        <label>Med→Low cutoff (%)</label><input type="number" id="ff-th2" value="${settings.highMed}" min="0" max="1000">
        <label>Life weight (0–1)</label><input type="number" step="0.01" id="ff-lw" value="${settings.lifeWeight}" min="0" max="1">
      </div>
      <div class="ff-tab-content" id="tab-apikey">
        <label>API Key</label><input type="text" id="ff-key" value="${API_KEY}" placeholder="Enter API Key…">
        <button id="ff-clear-key">Clear Key</button>
      </div>
      <div style="text-align:right;">
        <button id="ff-save">Save & Reload</button>
        <button id="ff-cancel">Cancel</button>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('.ff-tab').forEach(tab=>{
      tab.onclick = ()=>{
        modal.querySelectorAll('.ff-tab, .ff-tab-content').forEach(el=>el.classList.remove('active'));
        tab.classList.add('active');
        modal.querySelector('#tab-'+tab.dataset.tab).classList.add('active');
      };
    });
    fab.onclick = ()=>{ backdrop.style.display='block'; modal.style.display='block'; };
    backdrop.onclick = cancel;
    modal.querySelector('#ff-cancel').onclick = cancel;
    function cancel(){
      backdrop.style.display='none'; modal.style.display='none';
    }
    modal.querySelector('#ff-clear-key').onclick = ()=>{
      rD_deleteValue('api_key');
      API_KEY = '';
      document.getElementById('ff-key').value = '';
      alert('API key cleared');
    };
    modal.querySelector('#ff-save').onclick = ()=>{
      const nk = document.getElementById('ff-key').value.trim();
      if (nk) { rD_setValue('api_key', nk); API_KEY = nk; }
      const v1 = parseFloat(document.getElementById('ff-th1').value);
      const v2 = parseFloat(document.getElementById('ff-th2').value);
      const v3 = parseFloat(document.getElementById('ff-lw').value);
      if (!isNaN(v1)) { settings.lowHigh = v1; rD_setValue('threshold_lowHigh', v1); }
      if (!isNaN(v2)) { settings.highMed = v2; rD_setValue('threshold_highMed', v2); }
      if (!isNaN(v3)) { settings.lifeWeight = v3; rD_setValue('lifeWeight', v3); }
      location.reload();
    };

    // Auto-open API tab if missing
    if (!API_KEY) {
      fab.click();
      modal.querySelector('[data-tab=apikey]').click();
    }

    // Hook into page changes & DOM mutations
    window.addEventListener('load',    ()=>injectList());
    window.addEventListener('popstate', ()=>injectList());
    new MutationObserver(ms=>ms.forEach(r=>injectList(r.target)))
      .observe(document.body, { childList:true, subtree:true });
})();
