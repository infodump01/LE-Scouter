// ==UserScript==
// @name         LE Scouter Base v1.0
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @version      1.0
// @description  Base release: RSI badges on profiles with life-adjustment and overlays on all account listings; compatible with Tampermonkey and Torn PDA
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// @updateURL    https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Base_v1.0.user.js
// @downloadURL  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Base_v1.0.user.js
// ==/UserScript==

(() => {
    // ---- Environment Adapter ----
    if (typeof PDA_httpGet === 'function') {
        window.rD_xmlhttpRequest = details =>
            details.method.toLowerCase() === 'get'
                ? PDA_httpGet(details.url).then(details.onload).catch(details.onerror)
                : PDA_httpPost(details.url, details.headers, details.data).then(details.onload).catch(details.onerror);
        window.rD_setValue = (k, v) => localStorage.setItem(k, v);
        window.rD_getValue = (k, d) => localStorage.getItem(k) || d;
        window.rD_deleteValue = k => localStorage.removeItem(k);
        window.rD_registerMenuCommand = () => {};
    } else {
        window.rD_xmlhttpRequest = GM_xmlhttpRequest;
        window.rD_setValue = GM_setValue;
        window.rD_getValue = GM_getValue;
        window.rD_deleteValue = GM_deleteValue;
        window.rD_registerMenuCommand = GM_registerMenuCommand;
    }

    // ---- Key & Settings Management ----
    let API_KEY = rD_getValue('api_key', null);
    // Change API Key
    rD_registerMenuCommand('LE Scouter: Change API Key', () => {
        rD_deleteValue('api_key'); API_KEY = null;
        alert('API key cleared. Reload to enter new key.'); location.reload();
    });
    // Configure Settings (placeholder)
    function configureSettings() {
        alert('No configurable settings available yet.');
    }
    rD_registerMenuCommand('LE Scouter: Configure Settings', configureSettings);

    if (!API_KEY) {
        const key = prompt('Enter your TORN API Key:');
        if (!key) { alert('API Key required'); throw new Error('No API key'); }
        rD_setValue('api_key', key); API_KEY = key;
        alert('API key saved. Reloading...'); location.reload();
    }

    // ---- Styles ----
    GM_addStyle(`
        .ff-score-badge { display:inline-block; margin-left:8px; padding:4px 8px; border-radius:6px; font-size:0.95em; font-weight:bold; color:#fff; }
        .ff-score-badge.high { background:#c62828; }
        .ff-score-badge.med  { background:#f9a825; }
        .ff-score-badge.low  { background:#2e7d32; }
        .ff-score-badge.wounded { box-shadow:0 0 6px 2px rgba(229,57,53,0.8); }
        .ff-list-arrow { position:absolute; top:50%; transform:translate(-50%,-50%); width:0; height:0; border-top:8px solid transparent; border-bottom:8px solid transparent; pointer-events:none; }
        .ff-list-arrow.low  { border-right:12px solid #2e7d32; }
        .ff-list-arrow.med  { border-right:12px solid #f9a825; }
        .ff-list-arrow.high { border-right:12px solid #c62828; }
        .ff-list-arrow.wounded { box-shadow:0 0 6px 2px rgba(229,57,53,0.8); }
        .ff-settings-btn { position:fixed; top:8px; right:8px; cursor:pointer; font-size:1.2em; opacity:0.6; transition:opacity .2s; z-index:1000; }
        .ff-settings-btn:hover { opacity:1; }
    `);

    // ---- API GET ----
    function apiGet(endpoint, cb) {
        rD_xmlhttpRequest({ method:'GET', url:`https://api.torn.com${endpoint}&key=${API_KEY}`,
            onload: resp => {
                try { const data = JSON.parse(resp.responseText); if (!data.error) cb(data); }
                catch(e){ console.error('apiGet error', e); }
            }
        });
    }

    // ---- Estimator & RSI ----
    function estimateBP(ps, basic) {
        const elo = ps.elo * 2;
        const dmg = Math.sqrt(ps.attackdamage/1000) * 1.5;
        const win = Math.sqrt(Math.max(ps.attackswon-ps.attackslost,0)) * 1.2;
        const xan = Math.sqrt(ps.xantaken||0) * 0.5;
        const winRate = (ps.attackswon+ps.attackslost)>0 ? ps.attackswon/(ps.attackswon+ps.attackslost) : 0;
        const critRate = ps.attackhits>0 ? ps.attackcriticalhits/ps.attackhits : 0;
        const wealth = Math.log10((ps.networth||0)+1)*5;
        const now = Date.now()/1000;
        const joined = basic&&basic.joined?basic.joined:now;
        const age = Math.log10(((now-joined)/86400)+1)*5;
        const act = Math.log10((ps.useractivity||0)+1)*2;
        return elo+dmg+win+xan+winRate*100+critRate*100+wealth+age+act;
    }

    // ---- Global USER_BP ----
    let USER_BP = null;
    apiGet('/user/?selections=personalstats,basic', me=>{ USER_BP=estimateBP(me.personalstats,me.basic); });

    // ---- Inject Profile Badge & Overlay Arrows ----
    function waitForHeader() {
        const m = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
        if (!m||!USER_BP) return;
        const h4 = document.querySelector('h4');
        if (!h4 || h4.dataset.ffInjected) return;
        h4.dataset.ffInjected = 'true';
        const id = m[1];
        apiGet(`/user/${id}?selections=personalstats,basic,profile`, od=>{
            const oppBP = estimateBP(od.personalstats, od.basic);
            const raw = (USER_BP/oppBP)*100;
            const lp = od.life.current/od.life.maximum || 1;
            const inv = 1-lp;
            const dist = Math.abs(raw-100);
            const closeness = Math.max(0,1-dist/100);
            const boost = inv*closeness*0.1;
            const adj = raw*(1+boost);
            const pct = parseFloat(adj.toFixed(2));
            let cls='low', note='Advantage';
            if (pct<100){cls='high';note='High risk';}
            else if (pct<120){cls='med';note='Moderate risk';}
            const span=document.createElement('span');
            span.className=`ff-score-badge ${cls}`;
            span.textContent=`RSI ${pct}% — ${note}`;
            if (lp<1){span.classList.add('wounded'); span.textContent+=' ⚠️';}
            h4.appendChild(span);
        });
    }
    function processAccountNode(node){
        if (!USER_BP||node.dataset.ffArrow) return;
        const link = node.querySelector('a[href*="profiles.php?XID="]');
        if (!link) return;
        const id=(link.href.match(/XID=(\d+)/)||[])[1];
        if (!id) return;
        node.dataset.ffArrow='true'; node.style.position='relative';
        apiGet(`/user/${id}?selections=personalstats,basic,profile`, info=>{
            const oppBP=estimateBP(info.personalstats,info.basic);
            const raw=(USER_BP/oppBP)*100;
            const lp=info.life.current/info.life.maximum||1;
            const inv=1-lp; const dist=Math.abs(raw-100);
            const closeness=Math.max(0,1-dist/100);
            const boost=inv*closeness*0.1;
            const adj=raw*(1+boost);
            const cls=adj<100?'high':adj<120?'med':'low';
            const pos=(100-Math.min(adj,150)/150*100)+'%';
            const arrow=document.createElement('span');
            arrow.className=`ff-list-arrow ${cls}`+(lp<1?' wounded':'');
            arrow.style.left=pos; node.appendChild(arrow);
        });
    }
    function scanAndInject(root=document){
        waitForHeader();
        root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(link=>{
            let node=link.closest('tr, li, div, td'); if(!node) node=link.parentElement;
            processAccountNode(node);
        });
    }

    // ---- Hooks & Gear Button ----
    window.addEventListener('load',()=>{
        scanAndInject();
        const btn=document.createElement('div'); btn.className='ff-settings-btn'; btn.innerHTML='⚙️';
        document.body.appendChild(btn);
        btn.addEventListener('click',configureSettings);
    });
    window.addEventListener('popstate',()=>scanAndInject());
    new MutationObserver(ms=>ms.forEach(r=>scanAndInject(r.target))).observe(document.body,{childList:true,subtree:true});
})();
