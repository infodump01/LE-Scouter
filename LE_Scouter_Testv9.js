// ==UserScript==
// @name         FF Scouter Enhanced v11.0
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @version      11.0
// @description  RSI badges on profiles, includes life-adjusted score and improved PDA support
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
    const isPDA = typeof PDA_httpGet === 'function';
    const rD_xmlhttpRequest = isPDA
        ? details => details.method.toLowerCase() === 'get'
            ? PDA_httpGet(details.url).then(details.onload).catch(details.onerror)
            : PDA_httpPost(details.url, details.headers, details.data).then(details.onload).catch(details.onerror)
        : GM_xmlhttpRequest;
    const rD_setValue = isPDA ? (k,v) => localStorage.setItem(k,v) : GM_setValue;
    const rD_getValue = isPDA ? (k,d) => localStorage.getItem(k) || d : GM_getValue;
    const rD_deleteValue = isPDA ? k => localStorage.removeItem(k) : GM_deleteValue;
    const rD_registerMenuCommand = GM_registerMenuCommand;

    // ---- Key Management ----
    let API_KEY = rD_getValue('api_key', null);
    rD_registerMenuCommand('FF Scouter: Change API Key', () => {
        rD_deleteValue('api_key'); API_KEY = null;
        alert('API key cleared. Reload to enter new key.'); location.reload();
    });
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
        .ff-list-arrow { position:absolute; top:50%; transform:translate(-50%,-50%); width:0; height:0; border-top:8px solid transparent; border-bottom:8px solid transparent; pointer-events:none; }
        .ff-list-arrow.low  { border-right:12px solid #2e7d32; }
        .ff-list-arrow.med  { border-right:12px solid #f9a825; }
        .ff-list-arrow.high { border-right:12px solid #c62828; }
    `);

    // ---- API Helper ----
    function apiGet(endpoint, cb) {
        rD_xmlhttpRequest({ method:'GET', url:`https://api.torn.com${endpoint}&key=${API_KEY}`, onload:resp=>{
            try { const data = JSON.parse(resp.responseText); if (!data.error) cb(data); } catch(e){ console.error('apiGet error',e); }
        }});
    }

    // ---- Calculations ----
    function estimateBP(ps,basic) {
        const elo = ps.elo*2;
        const dmg = Math.sqrt(ps.attackdamage/1000)*1.5;
        const win = Math.sqrt(Math.max(ps.attackswon-ps.attackslost,0))*1.2;
        const xan = Math.sqrt(ps.xantaken||0)*0.5;
        const wr  = (ps.attackswon+ps.attackslost)>0 ? ps.attackswon/(ps.attackswon+ps.attackslost) : 0;
        const cr  = ps.attackhits>0 ? ps.attackcriticalhits/ps.attackhits : 0;
        const wealth = Math.log10((ps.networth||0)+1)*5;
        const now = Date.now()/1000;
        const joined = basic&&basic.joined?basic.joined:now;
        const age = Math.log10(((now-joined)/86400)+1)*5;
        const act = Math.log10((ps.useractivity||0)+1)*2;
        return elo + dmg + win + xan + wr*100 + cr*100 + wealth + age + act;
    }
    function calculateRSI(a,b){
        return b>0?((a/b)*100).toFixed(2):'N/A';
    }

    // ---- Global USER_BP ----
    let USER_BP=null;
    apiGet('/user/?selections=personalstats,basic', me=>{ USER_BP = estimateBP(me.personalstats, me.basic); });

    // ---- Wait & Inject Profile Badge (with life) ----
    function waitForHeader() {
        const match = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
        if (!match || !USER_BP) return;
        const h4 = document.querySelector('h4');
        if (!h4 || h4.dataset.ffInjected) return;
        h4.dataset.ffInjected='true';
        const id = match[1];
        apiGet(`/user/${id}?selections=personalstats,basic,profile`, od=>{
            const oppBP = estimateBP(od.personalstats, od.basic);
            const rawRSI = (USER_BP/oppBP)*100;
            // life adjustment
            const profile = od.profile || {};
            const lifePct = profile.life ? profile.life.current/profile.life.maximum : 1;
            const dist = Math.abs(rawRSI-100);
            const closeness = Math.max(0,1 - dist/100);
            const invLife = 1 - lifePct;
            const lifeWeight = 0.1;
            const scaledLife = invLife * closeness * lifeWeight;
            const adjRSI = (rawRSI * (1+scaledLife)).toFixed(2);
            const pct = parseFloat(adjRSI);
            let cls='low',note='Advantage';
            if(pct<100){cls='high';note='High risk';}
            else if(pct<120){cls='med';note='Moderate risk';}
            const span=document.createElement('span');
            span.className=`ff-score-badge ${cls}`;
            span.textContent=`RSI ${adjRSI}% — ${note}`;
            h4.appendChild(span);
        });
    }

    // ---- Overlay Arrows ----
    function processAccountNode(node){
        if(!USER_BP||node.dataset.ffArrow) return;
        const link = node.querySelector('a[href*="profiles.php?XID="]'); if(!link)return;
        const id = (link.href.match(/XID=(\d+)/)||[])[1]; if(!id)return;
        node.dataset.ffArrow='true'; node.style.position='relative';
        apiGet(`/user/${id}?selections=personalstats,basic`, info=>{
            const oppBP = estimateBP(info.personalstats, info.basic);
            const rsi=parseFloat(calculateRSI(USER_BP,oppBP));
            const scaled=Math.min(rsi,150)/150*100;
            const cls=rsi<100?'high':rsi<120?'med':'low';
            const arrow=document.createElement('span'); arrow.className=`ff-list-arrow ${cls}`;
            arrow.style.left=(100-scaled)+'%'; node.appendChild(arrow);
        });
    }
    function scanAndInject(root=document){
        waitForHeader();
        root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(link=>{
            let node=link.closest('tr,li,div,td'); if(!node) node=link.parentElement;
            processAccountNode(node);
        });
    }

    // ---- Hooks ----
    window.addEventListener('load',()=>{
        scanAndInject();
        // container-based observer for profiles
        const container = document.querySelector('#profileContent')||document.body;
        new MutationObserver(()=>waitForHeader()).observe(container,{childList:true,subtree:true});
    });
    window.addEventListener('popstate',()=>scanAndInject());
    new MutationObserver(recs=>recs.forEach(r=>scanAndInject(r.target)))
        .observe(document.body,{childList:true,subtree:true});
})();
