// ==UserScript==
// @name         FF Scouter Enhanced v10.5
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @version      10.5
// @description  RSI badges on profile pages and overlays on all account listings with correct inverted scaling
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// ==/UserScript==

(() => {
    const API_BASE = "https://api.torn.com";

    //---- Key Management ----
    let API_KEY = GM_getValue("api_key", null);
    GM_registerMenuCommand("FF Scouter: Change API Key", () => {
        GM_deleteValue("api_key"); API_KEY = null; location.reload();
    });
    if (!API_KEY) {
        const key = prompt("Enter your TORN API Key:");
        if (!key) { alert("API Key required"); throw new Error("No API key"); }
        GM_setValue("api_key", key); API_KEY = key; location.reload();
    }

    //---- Styles ----
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

    //---- API GET ----
    function apiGet(endpoint, cb) {
        GM_xmlhttpRequest({ method:'GET', url:`${API_BASE}${endpoint}&key=${API_KEY}`, onload: r => {
            try { const d = JSON.parse(r.responseText); if (!d.error) cb(d); } catch(e){console.error('apiGet error', e, r.responseText);} }
        });
    }

    //---- Estimator ----
    function estimateBP(ps, basic) {
        const elo = ps.elo*2;
        const dmg = Math.sqrt(ps.attackdamage/1000)*1.5;
        const win = Math.sqrt(Math.max(ps.attackswon-ps.attackslost,0))*1.2;
        const xan = Math.sqrt(ps.xantaken||0)*0.5;
        const wr  = (ps.attackswon+ps.attackslost)>0? ps.attackswon/(ps.attackswon+ps.attackslost):0;
        const cr  = ps.attackhits>0? ps.attackcriticalhits/ps.attackhits:0;
        const wealth = Math.log10((ps.networth||0)+1)*5;
        const now = Date.now()/1000;
        const joined = basic&&basic.joined?basic.joined:now;
        const age = Math.log10(((now-joined)/86400)+1)*5;
        const act = Math.log10((ps.useractivity||0)+1)*2;
        return elo+dmg+win+xan+wr*100+cr*100+wealth+age+act;
    }
    function calculateRSI(a,b) { return b>0?((a/b)*100).toFixed(2):"N/A"; }

    //---- Global USER_BP ----
    let USER_BP = null;
    apiGet('/user/?selections=personalstats,basic', me => { USER_BP = estimateBP(me.personalstats, me.basic); });

    //==== Profile Page Badge ====
    function getOpponentId() {
        const m = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
        return m?Number(m[1]):null;
    }
    function runProfileScouter(opId) {
        apiGet(`/user/${opId}?selections=personalstats,basic`, od => {
            const oppBP = estimateBP(od.personalstats, od.basic);
            const rsi = calculateRSI(USER_BP, oppBP);
            const pct = parseFloat(rsi);
            let cls='low', note='Advantage';
            if(pct<100){cls='high';note='High risk';}
            else if(pct<120){cls='med';note='Moderate risk';}
            const h4 = document.querySelector('h4');
            if(h4 && !h4.dataset.ffProfile){
                h4.dataset.ffProfile='true';
                const sp = document.createElement('span');
                sp.className=`ff-score-badge ${cls}`;
                sp.textContent=`RSI ${rsi}% — ${note}`;
                h4.appendChild(sp);
            }
        });
    }

    //==== Universal Overlay ====
    function processAccountNode(node) {
        if(!USER_BP || node.dataset.ffInjected) return;
        const link = node.querySelector('a[href*="profiles.php?XID="]');
        if(!link) return;
        const m = link.href.match(/XID=(\d+)/);
        if(!m) return;
        node.dataset.ffInjected = 'true';
        node.style.position = 'relative';
        apiGet(`/user/${m[1]}?selections=personalstats,basic`, info => {
            const oppBP = estimateBP(info.personalstats, info.basic);
            const rawPct = parseFloat(calculateRSI(USER_BP, oppBP));
            // scale 0-150% to 0-100% and invert for placement
            const scaled = Math.min(rawPct,150)/150*100;
            const cls = rawPct<100?'high':rawPct<120?'med':'low';
            const arrow = document.createElement('span');
            arrow.className = `ff-list-arrow ${cls}`;
            arrow.style.left = (100 - scaled) + '%';
            node.appendChild(arrow);
        });
    }

    function scanAndInjectLinks(root=document) {
        root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(link => {
            let node = link.closest('tr, li, div, td'); if(!node) node = link.parentElement;
            processAccountNode(node);
        });
    }

    const observer = new MutationObserver(records => { records.forEach(r => scanAndInjectLinks(r.target)); });
    observer.observe(document.body, { childList:true, subtree:true });

    window.addEventListener('load', () => {
        const pid = getOpponentId();
        if(pid) runProfileScouter(pid);
        scanAndInjectLinks();
    });
})();
