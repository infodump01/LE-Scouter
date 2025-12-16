// ==UserScript==
// @name         LE Scouter Base v1.0
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @version      1.0
// @description  Base release with floating settings GUI; RSI badges and arrows; compatible with Tampermonkey & Torn PDA
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// @updateURL    https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
// @downloadURL  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
// ==/UserScript==

(() => {
    // ---- Adapter ----
    if (typeof PDA_httpGet === 'function') {
        window.rD_xmlhttpRequest = details =>
            details.method.toLowerCase()==='get'
                ? PDA_httpGet(details.url).then(details.onload).catch(details.onerror)
                : PDA_httpPost(details.url,details.headers,details.data).then(details.onload).catch(details.onerror);
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
    let API_KEY = rD_getValue('api_key', null);
    const defaults = { lowHigh:100, highMed:120, lifeWeight:0.1 };
    const settings = {
        lowHigh: parseFloat(rD_getValue('threshold_lowHigh', defaults.lowHigh)),
        highMed: parseFloat(rD_getValue('threshold_highMed', defaults.highMed)),
        lifeWeight: parseFloat(rD_getValue('lifeWeight', defaults.lifeWeight))
    };
    if (!API_KEY) {
        const k=prompt('Enter your TORN API Key:');
        if (!k) throw new Error('API key required');
        rD_setValue('api_key',k); API_KEY=k;
        location.reload();
    }

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
        .ff-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:16px;border-radius:8px;z-index:9999;min-width:260px;display:none;}
        .ff-modal h3{margin-top:0;font-size:1.1em;}
        .ff-modal label{display:block;margin:8px 0 4px;font-size:0.9em;}
        .ff-modal input{width:100%;padding:4px;margin-bottom:8px;}
        .ff-modal button{margin-right:8px;padding:6px 12px;}
    `);

    // ---- API GET ----
    function apiGet(ep,cb){rD_xmlhttpRequest({method:'GET',url:`https://api.torn.com${ep}&key=${API_KEY}`,onload:r=>{try{const d=JSON.parse(r.responseText);!d.error&&cb(d);}catch(e){console.error(e);}},onerror:console.error});}

    // ---- Estimator ----
    function estimateBP(ps,b){const e=ps.elo*2,d=Math.sqrt(ps.attackdamage/1000)*1.5,w=Math.sqrt(Math.max(ps.attackswon-ps.attackslost,0))*1.2,x=Math.sqrt(ps.xantaken||0)*0.5,wr=(ps.attackswon+ps.attackslost)>0?ps.attackswon/(ps.attackswon+ps.attackslost):0,cr=ps.attackhits>0?ps.attackcriticalhits/ps.attackhits:0,nw=Math.log10((ps.networth||0)+1)*5,now=Date.now()/1000,j=b&&b.joined?b.joined:now,age=Math.log10(((now-j)/86400)+1)*5,act=Math.log10((ps.useractivity||0)+1)*2;return e+d+w+x+wr*100+cr*100+nw+age+act;}

    // ---- USER BP ----
    let USER_BP=null;apiGet('/user/?selections=personalstats,basic',me=>USER_BP=estimateBP(me.personalstats,me.basic));

    // ---- Injectors ----
    function injectProfile(){const m=location.href.match(/[?&](?:XID|user2ID)=(\d+)/);if(!m||!USER_BP)return;const h=document.querySelector('h4');if(!h||h.dataset.ff) return;h.dataset.ff=1;apiGet(`/user/${m[1]}?selections=personalstats,basic,profile`,o=>{const bp2=estimateBP(o.personalstats,o.basic),raw=(USER_BP/bp2)*100,lp=o.life.current/o.life.maximum||1,boost=(1-lp)*settings.lifeWeight,adj=raw*(1+boost),pct=parseFloat(adj.toFixed(2)),cls=pct<100?'high':pct<settings.highMed?'med':'low',note=pct<100?'High risk':pct<settings.highMed?'Moderate risk':'Advantage',sp=document.createElement('span');sp.className=`ff-score-badge ${cls}`;sp.textContent=`RSI ${pct}% — ${note}`;lp<1&&sp.classList.add('wounded');lp<1&&(sp.textContent+=' ⚠️');h.appendChild(sp);});}
    function injectList(root=document){injectProfile();root.querySelectorAll('a[href*="profiles.php?XID="]').forEach(a=>{const n=a.closest('tr,li,div,td')||a.parentNode;if(n.dataset.ff) return;apiGet(`/user/${a.href.match(/XID=(\d+)/)[1]}?selections=personalstats,basic,profile`,d=>{const bp2=estimateBP(d.personalstats,d.basic),raw=(USER_BP/bp2)*100,lp=d.life.current/d.life.maximum||1,boost=(1-lp)*settings.lifeWeight,adj=raw*(1+boost),cls=adj<100?'high':adj<settings.highMed?'med':'low',pos=(100-Math.min(adj,150)/150*100)+'%',el=document.createElement('span');n.dataset.ff=1;n.style.position='relative';el.className=`ff-list-arrow ${cls}`+(lp<1?' wounded':'');el.style.left=pos;n.appendChild(el);});});}

    // ---- Floating Button + GUI ----
    const fab=document.createElement('div');fab.className='ff-fab';fab.textContent='⚙️';document.body.appendChild(fab);
    const backdrop=document.createElement('div');backdrop.className='ff-modal-backdrop';document.body.appendChild(backdrop);
    const modal=document.createElement('div');modal.className='ff-modal';modal.innerHTML=`<h3>LE Scouter Settings</h3>
        <label>High→Med cutoff (%)</label><input type="number" id="ff-th1" value="${settings.lowHigh}" min="0" max="1000">
        <label>Med→Low cutoff (%)</label><input type="number" id="ff-th2" value="${settings.highMed}" min="0" max="1000">
        <label>Life weight (0–1)</label><input type="number" step="0.01" id="ff-lw" value="${settings.lifeWeight}" min="0" max="1">
        <div style="text-align:right;"><button id="ff-save">Save</button><button id="ff-cancel">Cancel</button></div>`;
    document.body.appendChild(modal);
    function openSettings(){backdrop.style.display='block';modal.style.display='block';}
    function closeSettings(){backdrop.style.display='none';modal.style.display='none';}
    fab.addEventListener('click',openSettings);
    backdrop.addEventListener('click',closeSettings);
    modal.querySelector('#ff-cancel').addEventListener('click',closeSettings);
    modal.querySelector('#ff-save').addEventListener('click',()=>{
        const v1=parseFloat(modal.querySelector('#ff-th1').value);
        const v2=parseFloat(modal.querySelector('#ff-th2').value);
        const v3=parseFloat(modal.querySelector('#ff-lw').value);
        if(!isNaN(v1)&&!isNaN(v2)&&!isNaN(v3)){
            settings.lowHigh=v1; settings.highMed=v2; settings.lifeWeight=v3;
            rD_setValue('threshold_lowHigh',v1);
            rD_setValue('threshold_highMed',v2);
            rD_setValue('lifeWeight',v3);
            alert('Saved: reload to apply'); closeSettings();
        }
    });

    // ---- Hooks ----
    window.addEventListener('load',()=>injectList());
    window.addEventListener('popstate',()=>injectList());
    new MutationObserver(ms=>ms.forEach(r=>injectList(r.target))).observe(document.body,{childList:true,subtree:true});
})();
