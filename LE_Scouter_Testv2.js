// ==UserScript==
// @name         FF Scouter Enhanced v10.12
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @version      10.12
// @description  RSI badges on profiles and overlays on account listings; unified for Tampermonkey & Torn PDA
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// ==/UserScript==

(() => {
    // ---- Environment Adapter ----
    if (typeof PDA_httpGet === 'function') {
        window.rD_xmlhttpRequest = details => {
            if (details.method.toLowerCase() === 'get') {
                return PDA_httpGet(details.url)
                    .then(body => details.onload({ responseText: body }))
                    .catch(details.onerror);
            } else {
                return PDA_httpPost(details.url, details.headers, details.data)
                    .then(body => details.onload({ responseText: body }))
                    .catch(details.onerror);
            }
        };
        window.rD_setValue = (k,v) => localStorage.setItem(k,v);
        window.rD_getValue = (k,d) => localStorage.getItem(k) || d;
        window.rD_deleteValue = k => localStorage.removeItem(k);
        window.rD_registerMenuCommand = () => {};
    } else {
        window.rD_xmlhttpRequest = GM_xmlhttpRequest;
        window.rD_setValue = GM_setValue;
        window.rD_getValue = GM_getValue;
        window.rD_deleteValue = GM_deleteValue;
        window.rD_registerMenuCommand = GM_registerMenuCommand;
    }

    // ---- Key Management ----
    let API_KEY = rD_getValue('api_key', null);
    rD_registerMenuCommand('FF Scouter: Change API Key', () => {
        rD_deleteValue('api_key');
        API_KEY = null;
        alert('API key cleared. Reloading...');
        location.reload();
    });
    if (!API_KEY) {
        const key = prompt('Enter your TORN API Key:');
        if (!key) { alert('API Key required'); throw new Error('No API key'); }
        rD_setValue('api_key', key);
        API_KEY = key;
        alert('API key saved. Reloading...');
        location.reload();
    }

    // ---- Styles ----
    GM_addStyle(`
        .ff-score-badge { display:inline-block; margin-left:8px; padding:4px 8px; border-radius:6px; font-size:0.95em; font-weight:bold; color:#fff; }
        .ff-score-badge.high { background:#c62828; }
        .ff-score-badge.med  { background:#f9a825; }
        .ff-score-badge.low  { background:#2e7d32; }
        .ff-list-arrow { position:absolute; top:50%; transform:translate(-50%,-50%); width:0; height:0; border-top:8px solid transparent; border-bottom:8px solid transparent; pointer-events:none; }
        .ff-list-arrow.low  { border-right:12px solid #2e7d32; }
        .ff-list-arrow.med  { border-right:12px solid #f9a825; }
        .ff-list-arrow.high { border-right:12px solid #c62828; }
    `);

    // ---- API GET ----
    function apiGet(endpoint, cb) {
        rD_xmlhttpRequest({
            method: 'GET',
            url: `https://api.torn.com${endpoint}&key=${API_KEY}`,
            onload: resp => {
                try {
                    const data = JSON.parse(resp.responseText);
                    if (!data.error) cb(data);
                } catch (e) {
                    console.error('apiGet error', e);
                }
            }
        });
    }

    // ---- Estimator & RSI ----
    function estimateBP(ps,basic) {
        const elo = ps.elo*2;
        const dmg = Math.sqrt(ps.attackdamage/1000)*1.5;
        const win = Math.sqrt(Math.max(ps.attackswon - ps.attackslost,0))*1.2;
        const xan = Math.sqrt(ps.xantaken||0)*0.5;
        const wr  = (ps.attackswon + ps.attackslost)>0?ps.attackswon/(ps.attackswon+ps.attackslost):0;
        const cr  = ps.attackhits>0?ps.attackcriticalhits/ps.attackhits:0;
        const wealth = Math.log10((ps.networth||0)+1)*5;
        const now = Date.now()/1000;
        const joined = basic && basic.joined ? basic.joined : now;
        const age   = Math.log10(((now-joined)/86400)+1)*5;
        const act   = Math.log10((ps.useractivity||0)+1)*2;
        return elo + dmg + win + xan + wr*100 + cr*100 + wealth + age + act;
    }
    function calculateRSI(a,b) { return b>0?((a/b)*100).toFixed(2):'N/A'; }

    // ---- Global USER_BP ----
    let USER_BP = null;
    apiGet('/user/?selections=personalstats,basic', me => USER_BP = estimateBP(me.personalstats, me.basic));

    // ---- Wait & Inject Badge ----
    function waitForHeader() {
        const m = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
        if (!m || !USER_BP) return setTimeout(waitForHeader,300);
        const h4 = document.querySelector('h4');
        if (!h4 || h4.dataset.ffInjected) return setTimeout(waitForHeader,300);
        h4.dataset.ffInjected = 'true';
        const opId = m[1];
        apiGet(`/user/${opId}?selections=personalstats,basic`, od => {
            const oppBP = estimateBP(od.personalstats, od.basic);
            const rsi = calculateRSI(USER_BP, oppBP);
            const pct = parseFloat(rsi);
            let cls='low', note='Advantage';
            if (pct<100) { cls='high'; note='High risk'; }
            else if(pct<120) { cls='med'; note='Moderate risk'; }
            const span = document.createElement('span');
            span.className = `ff-score-badge ${cls}`;
            span.textContent = `RSI ${rsi}% — ${note}`;
            h4.appendChild(span);
        });
    }

    // ---- Overlay Arrows ----
    function processAccountNode(node) {
        if (!USER_BP || node.dataset.ffArrow) return;
        const link = node.querySelector('a[href*="profiles.php?XID="]');
        if (!link) return;
        const id = (link.href.match(/XID=(\d+)/)||[])[1];
        if (!id) return;
        node.dataset.ffArrow = 'true'; node.style.position='relative';
        apiGet(`/user/${id}?selections=personalstats,basic`, info => {
            const oppBP = estimateBP(info.personalstats, info.basic);
            const raw = parseFloat(calculateRSI(USER_BP, oppBP));
            const scaled = Math.min(raw,150)/150*100;
            const cls = raw<100?'high':raw<120?'med':'low';
            const arrow = document.createElement('span');
            arrow.className = `ff-list-arrow ${cls}`;
            arrow.style.left = (100 - scaled) + '%';
            node.appendChild(arrow);
        });
    }
    function scanOverlays(root=document) {
        root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(link=>{
            let node = link.closest('tr, li, div, td');
            if (!node) node = link.parentElement;
            processAccountNode(node);
        });
    }

    // ---- Hooks ----
    window.addEventListener('load', ()=>{ waitForHeader(); scanOverlays(); });
    window.addEventListener('popstate', ()=>{ waitForHeader(); scanOverlays(); });
    new MutationObserver(ms=> ms.forEach(m=> scanOverlays(m.target)) )
        .observe(document.body,{ childList:true, subtree:true });
})();
