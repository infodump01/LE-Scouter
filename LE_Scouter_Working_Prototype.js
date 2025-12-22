// ==UserScript==
// @name         ATK Scouter Base v1.4.5
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @match        https://pda.torn.com/*
// @version      1.4.5
// @description  RSI combat analysis + fight outcome logging + IndexedDB analytics
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
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const VERSION = '1.4.5';

  const GREEN_ARROW_UP  = "data:image/svg+xml;utf8,<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><polygon points='10,3 19,17 1,17' fill='%232e7d32'/></svg>";
  const YELLOW_ARROW_UP = "data:image/svg+xml;utf8,<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><polygon points='10,3 19,17 1,17' fill='%23f9a825'/></svg>";
  const RED_ARROW_UP    = "data:image/svg+xml;utf8,<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><polygon points='10,3 19,17 1,17' fill='%23c62828'/></svg>";

  const PLANE_ICON_URL = 'https://raw.githubusercontent.com/infodump01/LE-Scouter/main/airport-xxl.png';
  const HOSPITAL_ICON_URL = 'https://github.com/infodump01/LE-Scouter/raw/main/hospital.png';
  const CIRCLE_ICON_URL = 'https://github.com/infodump01/LE-Scouter/raw/main/circle.png';
  const PILL_ICON_URL = 'https://raw.githubusercontent.com/infodump01/LE-Scouter/main/pill-icon-2048x2048.png';

  const API_MAX_ACTIVE = 3;
  const API_MIN_DELAY = 200;
  const API_CACHE_MAX_SIZE = 500;
  const API_CACHE_TTL_BASIC = 10000;
  const API_CACHE_TTL_DEFAULT = 30000;

  // Fight logging constants
  const DB_NAME = 'ATKScouterFightLog';
  const DB_VERSION = 1;
  const PENDING_ATTACK_KEY = 'ff_pending_attack';
  const MAX_FIGHTS_STORED = 2000;

  // Gym tier multipliers based on xanax consumption → energy → multiplier
  const GYM_TIERS = [
    { energy: 0,         mul: 1.0000 },
    { energy: 200,       mul: 1.2375 },
    { energy: 500,       mul: 1.4500 },
    { energy: 1000,      mul: 1.6000 },
    { energy: 2000,      mul: 1.7000 },
    { energy: 2750,      mul: 1.8000 },
    { energy: 3000,      mul: 1.8500 },
    { energy: 3500,      mul: 1.8500 },
    { energy: 4000,      mul: 2.0000 },
    { energy: 6000,      mul: 2.1750 },
    { energy: 7000,      mul: 2.2750 },
    { energy: 8000,      mul: 2.4250 },
    { energy: 11000,     mul: 2.5250 },
    { energy: 12420,     mul: 2.5500 },
    { energy: 18000,     mul: 2.7375 },
    { energy: 18100,     mul: 2.7850 },
    { energy: 24140,     mul: 3.0000 },
    { energy: 31260,     mul: 3.1000 },
    { energy: 36610,     mul: 3.1625 },
    { energy: 46640,     mul: 3.2625 },
    { energy: 56520,     mul: 3.3250 },
    { energy: 67775,     mul: 3.2875 },
    { energy: 84535,     mul: 3.3500 },
    { energy: 106305,    mul: 3.4500 },
    { energy: 100000000, mul: 3.6500 }
  ];

  // Location abbreviation map
  const LOC_TO_CODE = {
    "China": "CN", "Japan": "JP", "Mexico": "MX", "Canada": "CA",
    "United Kingdom": "GB", "UK": "GB", "Argentina": "AR",
    "UAE": "AE", "United Arab Emirates": "AE", "Dubai": "AE",
    "Switzerland": "CH", "South Africa": "ZA", "Hawaii": "HW", "Hawai'i": "HW"
  };

  // ============================================================================
  // ENVIRONMENT ADAPTER
  // ============================================================================

  const Env = (() => {
    if (typeof PDA_httpGet === 'function') {
      return {
        httpRequest: d => d.method.toLowerCase() === 'get'
          ? PDA_httpGet(d.url).then(d.onload).catch(d.onerror)
          : PDA_httpPost(d.url, d.headers, d.data).then(d.onload).catch(d.onerror),
        setValue: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
        getValue: (k, d) => {
          try { return JSON.parse(localStorage.getItem(k)) ?? d; }
          catch { return d; }
        },
        deleteValue: k => localStorage.removeItem(k),
        isPDA: true
      };
    }
    return {
      httpRequest: GM_xmlhttpRequest,
      setValue: GM_setValue,
      getValue: GM_getValue,
      deleteValue: GM_deleteValue,
      isPDA: false
    };
  })();

  // ============================================================================
  // SETTINGS
  // ============================================================================

  const DEFAULTS = {
    lowHigh: 100,
    highMed: 120,
    lifeWeight: 0.1,
    drugWeight: 0.1
  };

  let API_KEY = Env.getValue('api_key', '');
  const settings = {
    lowHigh:    +Env.getValue('threshold_lowHigh', DEFAULTS.lowHigh),
    highMed:    +Env.getValue('threshold_highMed', DEFAULTS.highMed),
    lifeWeight: +Env.getValue('lifeWeight', DEFAULTS.lifeWeight),
    drugWeight: +Env.getValue('drugWeight', DEFAULTS.drugWeight)
  };

  // ============================================================================
  // STYLES (consolidated)
  // ============================================================================

  GM_addStyle(`
    /* Score badges */
    .ff-score-badge {
      display: inline-block;
      margin-left: 8px;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.95em;
      color: #fff;
    }
    .ff-score-badge.high { background: #c62828; }
    .ff-score-badge.med { background: #f9a825; }
    .ff-score-badge.low { background: #2e7d32; }
    .ff-score-badge.wounded {
      box-shadow: 0 0 6px 2px rgba(229, 57, 53, 0.8);
    }

    /* Honor wrap positioning */
    div[class*="honorWrap"] {
      overflow: visible !important;
      position: relative !important;
    }
    .honor-text-wrap {
      position: relative !important;
    }

    /* List arrow indicators */
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
      transition: box-shadow 0.15s;
    }
    .ff-list-arrow-img.wounded {
      box-shadow: 0 0 10px 4px #c62828, 0 0 2px 2px rgba(255, 255, 255, 0.13);
      border-radius: 5px;
    }

    /* Tooltip */
    .ff-tooltip-viewport {
      position: absolute;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      line-height: 1.2em;
      white-space: nowrap;
      z-index: 2147483647 !important;
      pointer-events: none;
    }
    .ff-tooltip-viewport a {
      color: #ff5252 !important;
      text-decoration: underline;
    }
    .ff-tooltip-viewport a:visited {
      color: #e53935 !important;
    }

    /* FAB and Modal */
    .ff-fab {
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 50px;
      height: 50px;
      border-radius: 25px;
      background: #222;
      color: #eee;
      font-size: 26px;
      line-height: 50px;
      text-align: center;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      transition: background 0.2s;
    }
    .ff-fab:hover { background: #333; }

    .ff-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2147483645 !important;
      display: none;
    }
    .ff-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2b2b2b;
      color: #eee;
      padding: 20px;
      border-radius: 8px;
      z-index: 2147483648 !important;
      min-width: 360px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      display: none;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      font-family: sans-serif;
    }
    .ff-modal h3 {
      margin: 0 0 12px;
      font-size: 1.3em;
      display: flex;
      align-items: center;
    }
    .ff-modal h3::before {
      content: "⚙️";
      margin-right: 8px;
    }
    .ff-tabs { display: flex; margin-bottom: 12px; flex-wrap: wrap; }
    .ff-tab {
      flex: 1;
      padding: 8px;
      text-align: center;
      cursor: pointer;
      color: #aaa;
      border-bottom: 2px solid transparent;
      user-select: none;
      transition: color 0.2s, border-color 0.2s;
      min-width: 80px;
    }
    .ff-tab.active { color: #fff; border-color: #fff; }
    .ff-tab-content { display: none; }
    .ff-tab-content.active { display: block; }
    .ff-modal label {
      display: block;
      margin: 12px 0 4px;
      font-size: 0.9em;
      color: #ccc;
    }
    .ff-modal input {
      width: 100%;
      padding: 6px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #333;
      color: #eee;
      font-size: 1em;
      box-sizing: border-box;
    }
    .ff-modal .btn {
      display: inline-block;
      margin-top: 16px;
      padding: 8px 14px;
      border: none;
      border-radius: 4px;
      font-size: 0.95em;
      cursor: pointer;
      transition: background 0.2s;
    }
    .ff-modal .btn-save { background: #4caf50; color: #fff; margin-right: 8px; }
    .ff-modal .btn-save:hover { background: #66bb6a; }
    .ff-modal .btn-cancel { background: #c62828; color: #fff; }
    .ff-modal .btn-cancel:hover { background: #e53935; }
    .ff-modal .btn-clear { background: #555; color: #fff; margin-left: 8px; }
    .ff-modal .btn-clear:hover { background: #666; }

    /* Status icons (travel/hospital) - consolidated positioning */
    .ff-travel-icon,
    .ff-hospital-icon {
      position: absolute;
      right: 4px;
      top: -2px;
      height: 12px !important;
      width: 12px !important;
      max-width: 12px !important;
      max-height: 12px !important;
      z-index: 2147483647 !important;
      opacity: 0.92;
      pointer-events: auto;
      transition: filter 0.15s, box-shadow 0.15s;
    }
    .ff-travel-icon {
      filter: grayscale(1) brightness(0.7);
    }
    .ff-travel-icon.ff-traveling {
      filter: grayscale(0) brightness(1) drop-shadow(0 0 3px #2094fa) drop-shadow(0 0 2px #42a5f5);
    }
    .ff-travel-icon.ff-abroad {
      filter: grayscale(0) brightness(1) drop-shadow(0 0 3px #ff9800) drop-shadow(0 0 2px #ffb300);
    }
    .ff-travel-icon:hover,
    .ff-hospital-icon:hover {
      filter: brightness(1.4) !important;
    }

    /* Countdown chips and location badges */
    .ff-countdown-chip,
    .ff-loc-badge {
      position: absolute;
      right: 4px;
      bottom: -4px;
      padding: 0 3px;
      font-size: 9px;
      line-height: 10px;
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      border-radius: 3px;
      font-weight: 700;
      z-index: 2147483647 !important;
      pointer-events: none;
      letter-spacing: 0.2px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .ff-loc-badge[data-kind="travel"] { outline: 1px solid rgba(33, 150, 243, 0.9); }
    .ff-loc-badge[data-kind="return"] { outline: 1px solid rgba(3, 169, 244, 0.9); }
    .ff-loc-badge[data-kind="abroad"] {
      background: #ffb300 !important;
      color: #111 !important;
      outline: 1px solid #ffd54f !important;
      box-shadow: 0 0 6px rgba(255, 179, 0, 0.45);
    }

    /* API warning banner */
    #ff-api-warning {
      position: fixed;
      left: 20px;
      bottom: 80px;
      max-width: 260px;
      background: rgba(33, 33, 33, 0.95);
      color: #ffeb3b;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.3;
      z-index: 2147483647;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.6);
      cursor: pointer;
    }

    /* RSI+ Experimental Panel */
    #ff-exp-panel, #ff-exp-panel * { color: #e6e6e6 !important; }
    #ff-exp-panel .ff-chip-label {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(66, 165, 245, 0.18);
      border: 1px solid rgba(66, 165, 245, 0.45);
    }
    #ff-exp-panel .ff-mini-btn {
      display: inline-block;
      margin-left: 6px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #e6e6e6;
      cursor: pointer;
      font-size: 11px;
    }
    #ff-exp-panel .ff-mini-btn:hover { background: rgba(255, 255, 255, 0.14); }
    #ff-exp-panel .ff-note { opacity: 0.8; font-size: 11px; margin-left: 6px; }

    /* Anti-overlap utility */
    .ff-anti-overlap {
      z-index: 2147483647 !important;
      will-change: transform;
      pointer-events: none;
    }

    /* Stats tab styles */
    .ff-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
      margin: 12px 0;
    }
    .ff-stat-card {
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .ff-stat-value {
      font-size: 1.8em;
      font-weight: 700;
      color: #4caf50;
      display: block;
    }
    .ff-stat-value.warning { color: #f9a825; }
    .ff-stat-value.danger { color: #c62828; }
    .ff-stat-label {
      font-size: 0.75em;
      color: #aaa;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ff-calibration-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 0.85em;
    }
    .ff-calibration-table th,
    .ff-calibration-table td {
      padding: 6px 8px;
      text-align: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .ff-calibration-table th {
      color: #aaa;
      font-weight: 600;
    }
    .ff-recent-fights {
      max-height: 200px;
      overflow-y: auto;
      margin: 12px 0;
    }
    .ff-fight-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.85em;
    }
    .ff-fight-row:hover {
      background: rgba(255,255,255,0.03);
    }
    .ff-fight-win { color: #4caf50; }
    .ff-fight-loss { color: #c62828; }
    .ff-fight-other { color: #9e9e9e; }
    .ff-btn-small {
      padding: 4px 8px;
      font-size: 0.8em;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      margin: 2px;
    }
    .ff-btn-export { background: #2196f3; color: #fff; }
    .ff-btn-export:hover { background: #42a5f5; }
    .ff-btn-danger { background: #c62828; color: #fff; }
    .ff-btn-danger:hover { background: #e53935; }
    .ff-empty-state {
      text-align: center;
      padding: 30px;
      color: #666;
    }
    .ff-log-indicator {
      position: fixed;
      bottom: 80px;
      left: 80px;
      background: rgba(76, 175, 80, 0.9);
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 10001;
      animation: ff-fade-out 3s forwards;
      pointer-events: none;
    }
    @keyframes ff-fade-out {
      0%, 70% { opacity: 1; }
      100% { opacity: 0; }
    }
  `);

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Escapes HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Gets gym multiplier based on xanax count
   */
  function getGymMultiplier(xanCount) {
    const energy = xanCount * 250;
    let multiplier = 1;
    for (const tier of GYM_TIERS) {
      if (energy >= tier.energy) multiplier = tier.mul;
    }
    return multiplier;
  }

  /**
   * Abbreviates location name to country code
   */
  function abbreviateLocation(loc) {
    if (!loc) return '';
    if (LOC_TO_CODE[loc]) return LOC_TO_CODE[loc];
    const upper = String(loc).toUpperCase();
    const firstWord = upper.split(/\s+/)[0];
    return (firstWord.slice(0, 3) || upper.slice(0, 3)).replace(/[^A-Z]/g, '');
  }

  /**
   * Parses travel info from status description
   */
  function parseTravelInfo(desc) {
    if (!desc) return null;
    let match;
    if ((match = desc.match(/^Traveling to\s+(.+)$/i))) {
      return { kind: 'travel', loc: match[1].trim() };
    }
    if ((match = desc.match(/^Returning to Torn from\s+(.+)$/i))) {
      return { kind: 'return', loc: match[1].trim() };
    }
    if ((match = desc.match(/^In\s+(.+)$/i))) {
      return { kind: 'abroad', loc: match[1].trim() };
    }
    return null;
  }

  /**
   * Parses minutes from status text
   */
  function parseMinutesFromText(txt) {
    if (!txt) return null;
    const match = String(txt).match(/(\d+)\s*min/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Shows a temporary notification
   */
  function showNotification(message, isError = false) {
    const existing = document.querySelector('.ff-log-indicator');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.className = 'ff-log-indicator';
    if (isError) notif.style.background = 'rgba(198, 40, 40, 0.9)';
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => notif.remove(), 3000);
  }

  // ============================================================================
  // INDEXEDDB FIGHT LOG
  // ============================================================================

  const FightDB = (() => {
    let db = null;
    let dbReady = false;
    let dbError = false;

    /**
     * Opens/creates the IndexedDB database
     */
    function openDatabase() {
      return new Promise((resolve, reject) => {
        if (db && dbReady) {
          resolve(db);
          return;
        }

        if (dbError) {
          reject(new Error('Database previously failed to open'));
          return;
        }

        // Check IndexedDB availability
        if (!window.indexedDB) {
          dbError = true;
          reject(new Error('IndexedDB not supported'));
          return;
        }

        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);

          request.onerror = (e) => {
            console.error('FightDB: Error opening database', e);
            dbError = true;
            reject(e.target.error);
          };

          request.onsuccess = (e) => {
            db = e.target.result;
            dbReady = true;

            // Handle connection errors
            db.onerror = (event) => {
              console.error('FightDB: Database error', event.target.error);
            };

            resolve(db);
          };

          request.onupgradeneeded = (e) => {
            const database = e.target.result;

            // Fights store
            if (!database.objectStoreNames.contains('fights')) {
              const fightStore = database.createObjectStore('fights', {
                keyPath: 'id',
                autoIncrement: true
              });
              fightStore.createIndex('timestamp', 'timestamp', { unique: false });
              fightStore.createIndex('odefinerId', 'opponentId', { unique: false });
              fightStore.createIndex('result', 'outcome', { unique: false });
              fightStore.createIndex('rsiRaw', 'rsiRaw', { unique: false });
            }

            // Players store (opponent history)
            if (!database.objectStoreNames.contains('players')) {
              const playerStore = database.createObjectStore('players', {
                keyPath: 'odefinerId'
              });
              playerStore.createIndex('lastFought', 'lastFought', { unique: false });
              playerStore.createIndex('fightCount', 'fightCount', { unique: false });
            }
          };
        } catch (e) {
          dbError = true;
          reject(e);
        }
      });
    }

    /**
     * Logs a fight to the database
     */
    async function logFight(fightData) {
      try {
        const database = await openDatabase();
        
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(['fights', 'players'], 'readwrite');
          const fightStore = transaction.objectStore('fights');
          const playerStore = transaction.objectStore('players');

          // Add fight record
          const fightRecord = {
            ...fightData,
            timestamp: Date.now()
          };

          const addRequest = fightStore.add(fightRecord);

          addRequest.onsuccess = () => {
            // Update player record
            const playerGet = playerStore.get(fightData.opponentId);
            
            playerGet.onsuccess = () => {
              const existing = playerGet.result || {
                odefinerId: fightData.opponentId,
                opponentName: fightData.opponentName,
                fightCount: 0,
                wins: 0,
                losses: 0
              };

              existing.fightCount++;
              existing.lastFought = Date.now();
              existing.opponentName = fightData.opponentName || existing.opponentName;

              if (fightData.outcome === 'win') existing.wins++;
              else if (fightData.outcome === 'loss') existing.losses++;

              playerStore.put(existing);
            };

            resolve(addRequest.result);
          };

          addRequest.onerror = () => reject(addRequest.error);

          transaction.oncomplete = () => {
            // Cleanup old records if over limit
            cleanupOldFights();
          };
        });
      } catch (e) {
        console.error('FightDB: Error logging fight', e);
        throw e;
      }
    }

    /**
     * Removes oldest fights if over the limit
     */
    async function cleanupOldFights() {
      try {
        const database = await openDatabase();
        const transaction = database.transaction('fights', 'readwrite');
        const store = transaction.objectStore('fights');
        const countRequest = store.count();

        countRequest.onsuccess = () => {
          const count = countRequest.result;
          if (count <= MAX_FIGHTS_STORED) return;

          const toDelete = count - MAX_FIGHTS_STORED;
          const index = store.index('timestamp');
          const cursor = index.openCursor();
          let deleted = 0;

          cursor.onsuccess = (e) => {
            const c = e.target.result;
            if (c && deleted < toDelete) {
              store.delete(c.primaryKey);
              deleted++;
              c.continue();
            }
          };
        };
      } catch (e) {
        console.error('FightDB: Cleanup error', e);
      }
    }

    /**
     * Gets all fights
     */
    async function getAllFights() {
      try {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction('fights', 'readonly');
          const store = transaction.objectStore('fights');
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.error('FightDB: Error getting fights', e);
        return [];
      }
    }

    /**
     * Gets recent fights (last N)
     */
    async function getRecentFights(limit = 50) {
      try {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction('fights', 'readonly');
          const store = transaction.objectStore('fights');
          const index = store.index('timestamp');
          const request = index.openCursor(null, 'prev');
          const results = [];

          request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor && results.length < limit) {
              results.push(cursor.value);
              cursor.continue();
            } else {
              resolve(results);
            }
          };
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.error('FightDB: Error getting recent fights', e);
        return [];
      }
    }

    /**
     * Gets fight history for a specific opponent
     */
    async function getOpponentHistory(opponentId) {
      try {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction('fights', 'readonly');
          const store = transaction.objectStore('fights');
          const index = store.index('odefinerId');
          const request = index.getAll(opponentId);

          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.error('FightDB: Error getting opponent history', e);
        return [];
      }
    }

    /**
     * Gets player record
     */
    async function getPlayerRecord(opponentId) {
      try {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction('players', 'readonly');
          const store = transaction.objectStore('players');
          const request = store.get(opponentId);

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.error('FightDB: Error getting player record', e);
        return null;
      }
    }

    /**
     * Gets statistics by RSI bucket
     */
    async function getStatsByRsiBucket() {
      const fights = await getAllFights();
      const buckets = {
        '0-50':    { wins: 0, losses: 0, other: 0, total: 0 },
        '50-75':   { wins: 0, losses: 0, other: 0, total: 0 },
        '75-100':  { wins: 0, losses: 0, other: 0, total: 0 },
        '100-125': { wins: 0, losses: 0, other: 0, total: 0 },
        '125-150': { wins: 0, losses: 0, other: 0, total: 0 },
        '150+':    { wins: 0, losses: 0, other: 0, total: 0 }
      };

      for (const fight of fights) {
        const rsi = fight.rsiAdjusted || fight.rsiRaw || 100;
        let bucket;
        if (rsi < 50) bucket = '0-50';
        else if (rsi < 75) bucket = '50-75';
        else if (rsi < 100) bucket = '75-100';
        else if (rsi < 125) bucket = '100-125';
        else if (rsi < 150) bucket = '125-150';
        else bucket = '150+';

        buckets[bucket].total++;
        if (fight.outcome === 'win') buckets[bucket].wins++;
        else if (fight.outcome === 'loss') buckets[bucket].losses++;
        else buckets[bucket].other++;
      }

      return buckets;
    }

    /**
     * Gets overall statistics
     */
    async function getOverallStats() {
      const fights = await getAllFights();
      const stats = {
        total: fights.length,
        wins: 0,
        losses: 0,
        other: 0,
        avgRsi: 0,
        avgRsiOnWin: 0,
        avgRsiOnLoss: 0
      };

      if (fights.length === 0) return stats;

      let rsiSum = 0, winRsiSum = 0, lossRsiSum = 0;

      for (const fight of fights) {
        const rsi = fight.rsiAdjusted || fight.rsiRaw || 100;
        rsiSum += rsi;

        if (fight.outcome === 'win') {
          stats.wins++;
          winRsiSum += rsi;
        } else if (fight.outcome === 'loss') {
          stats.losses++;
          lossRsiSum += rsi;
        } else {
          stats.other++;
        }
      }

      stats.avgRsi = rsiSum / fights.length;
      stats.avgRsiOnWin = stats.wins > 0 ? winRsiSum / stats.wins : 0;
      stats.avgRsiOnLoss = stats.losses > 0 ? lossRsiSum / stats.losses : 0;
      stats.winRate = stats.total > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 0;

      return stats;
    }

    /**
     * Exports all data as JSON
     */
    async function exportData() {
      const fights = await getAllFights();
      const database = await openDatabase();
      
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('players', 'readonly');
        const store = transaction.objectStore('players');
        const request = store.getAll();

        request.onsuccess = () => {
          resolve({
            exportDate: new Date().toISOString(),
            version: VERSION,
            fights: fights,
            players: request.result || []
          });
        };
        request.onerror = () => reject(request.error);
      });
    }

    /**
     * Clears all data
     */
    async function clearAllData() {
      try {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(['fights', 'players'], 'readwrite');
          
          transaction.objectStore('fights').clear();
          transaction.objectStore('players').clear();

          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error);
        });
      } catch (e) {
        console.error('FightDB: Error clearing data', e);
        throw e;
      }
    }

    /**
     * Check if database is available
     */
    async function isAvailable() {
      try {
        await openDatabase();
        return true;
      } catch {
        return false;
      }
    }

    return {
      logFight,
      getAllFights,
      getRecentFights,
      getOpponentHistory,
      getPlayerRecord,
      getStatsByRsiBucket,
      getOverallStats,
      exportData,
      clearAllData,
      isAvailable
    };
  })();

  // ============================================================================
  // FIGHT CAPTURE SYSTEM
  // ============================================================================

  const FightCapture = (() => {
    /**
     * Stores a pending attack prediction
     */
    function storePendingAttack(data) {
      try {
        const pending = {
          opponentId: data.opponentId,
          opponentName: data.opponentName,
          rsiRaw: data.rsiRaw,
          rsiAdjusted: data.rsiAdjusted,
          riskClass: data.riskClass,
          oppLife: data.oppLife,
          oppLevel: data.oppLevel,
          oppSnapshot: data.oppSnapshot,
          timestamp: Date.now()
        };
        sessionStorage.setItem(PENDING_ATTACK_KEY, JSON.stringify(pending));
      } catch (e) {
        console.error('FightCapture: Error storing pending attack', e);
      }
    }

    /**
     * Retrieves and clears pending attack
     */
    function getPendingAttack() {
      try {
        const data = sessionStorage.getItem(PENDING_ATTACK_KEY);
        if (!data) return null;

        const pending = JSON.parse(data);
        
        // Only valid for 5 minutes
        if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
          sessionStorage.removeItem(PENDING_ATTACK_KEY);
          return null;
        }

        return pending;
      } catch (e) {
        console.error('FightCapture: Error getting pending attack', e);
        return null;
      }
    }

    /**
     * Clears pending attack
     */
    function clearPendingAttack() {
      try {
        sessionStorage.removeItem(PENDING_ATTACK_KEY);
      } catch (e) {
        // Ignore
      }
    }

    /**
     * Checks if current page is an attack result page
     */
    function isAttackResultPage() {
      const href = location.href;
      // Attack result pages use sid=attackLog (after fight completes)
      // or sid=attack with user2ID (during/starting fight)
      return href.includes('sid=attackLog') ||
             (href.includes('sid=attack') && /user2ID=\d+/i.test(href));
    }

    /**
     * Gets the unique attack log ID from URL
     */
    function getAttackLogId() {
      // Extract the hash ID from attackLog URLs like:
      // loader.php?sid=attackLog&ID=3f7eea8c1697b01e3740d3b3c5062f55
      const match = location.href.match(/sid=attackLog[^&]*&ID=([a-f0-9]+)/i);
      return match ? match[1] : null;
    }

    /**
     * Checks if this attack log has already been processed
     */
    function isAttackLogProcessed(logId) {
      if (!logId) return false;
      try {
        const processed = JSON.parse(localStorage.getItem('ff_processed_logs') || '[]');
        return processed.includes(logId);
      } catch (e) {
        return false;
      }
    }

    /**
     * Marks an attack log as processed
     */
    function markAttackLogProcessed(logId) {
      if (!logId) return;
      try {
        let processed = JSON.parse(localStorage.getItem('ff_processed_logs') || '[]');
        if (!processed.includes(logId)) {
          processed.push(logId);
          // Keep only last 200 to prevent localStorage bloat
          if (processed.length > 200) {
            processed = processed.slice(-200);
          }
          localStorage.setItem('ff_processed_logs', JSON.stringify(processed));
        }
      } catch (e) {
        console.error('FightCapture: Error marking log processed', e);
      }
    }

    /**
     * Checks if current page is the attack log page
     */
    function isAttackLogPage() {
      return location.href.includes('attacklog.php') ||
             location.href.includes('page.php?sid=attackLog');
    }

    /**
     * Parses the attack outcome from the page
     */
    function parseAttackOutcome() {
      const bodyText = document.body.innerText || '';
      
      // Win conditions - comprehensive list of Torn attack outcomes
      if (/You attacked\s+.+\s+and won/i.test(bodyText) ||
          /hospitalized\s+.+\s+for\s+\d+/i.test(bodyText) ||
          /You mugged/i.test(bodyText) ||
          /You have taken\s+.+\s+from/i.test(bodyText) ||
          /left\s+.+\s+on the street/i.test(bodyText) ||
          /left them on the street/i.test(bodyText) ||
          /defeated\s+/i.test(bodyText) ||
          /won the fight/i.test(bodyText) ||
          /knocked out/i.test(bodyText) ||
          /beat\s+.+\s+(up|down)/i.test(bodyText)) {
        return 'win';
      }

      // Loss conditions
      if (/You lost/i.test(bodyText) ||
          /and hospitalized you/i.test(bodyText) ||
          /put you in hospital/i.test(bodyText) ||
          /defeated you/i.test(bodyText) ||
          /you were beaten/i.test(bodyText) ||
          /lost the fight/i.test(bodyText)) {
        return 'loss';
      }

      // Stalemate
      if (/stalemate/i.test(bodyText) ||
          /draw/i.test(bodyText)) {
        return 'stalemate';
      }

      // Escape
      if (/escaped/i.test(bodyText) ||
          /ran away/i.test(bodyText) ||
          /fled/i.test(bodyText)) {
        return 'escape';
      }

      // Interrupted/Assist
      if (/Someone else/i.test(bodyText) ||
          /interrupted/i.test(bodyText) ||
          /assist/i.test(bodyText)) {
        return 'assist';
      }

      // Timeout
      if (/timeout/i.test(bodyText) ||
          /timed out/i.test(bodyText)) {
        return 'timeout';
      }

      return 'unknown';
    }

    /**
     * Extracts opponent info from attack page
     */
    function extractOpponentFromPage() {
      try {
        let opponentId = null;
        let opponentName = null;
        
        // First try URL's user2ID parameter (during attack)
        const urlMatch = location.href.match(/user2ID=(\d+)/i);
        if (urlMatch) {
          opponentId = parseInt(urlMatch[1], 10);
        }
        
        // For attackLog pages, we need to find the opponent from page content
        // The opponent is the other person in the fight (not the current user)
        if (!opponentId) {
          // Get current user's name to exclude them
          const currentUserEl = document.querySelector('#sidebarroot a[href*="profiles.php"]') ||
                               document.querySelector('[class*="user-name"]') ||
                               document.querySelector('.info-name');
          const currentUserName = currentUserEl?.textContent?.trim()?.toLowerCase();
          
          // Find all profile links in the attack log
          const profileLinks = document.querySelectorAll('a[href*="profiles.php?XID="]');
          
          for (const link of profileLinks) {
            const match = link.href.match(/XID=(\d+)/);
            const linkName = link.textContent?.trim();
            
            // Skip if this is the current user
            if (currentUserName && linkName?.toLowerCase() === currentUserName) {
              continue;
            }
            
            if (match) {
              const id = parseInt(match[1], 10);
              // Validate it's a real user ID (not a tiny number)
              if (id > 100) {
                opponentId = id;
                opponentName = linkName;
                break;
              }
            }
          }
        }
        
        // Try title as fallback for name
        if (opponentId && !opponentName) {
          const titleMatch = document.title.match(/attacking\s+(.+)/i);
          if (titleMatch) {
            opponentName = titleMatch[1].trim();
          }
        }

        console.log('FightCapture: Extracted opponent - ID:', opponentId, 'Name:', opponentName);
        return { opponentId, opponentName };
      } catch (e) {
        console.error('FightCapture: Error extracting opponent info', e);
        return { opponentId: null, opponentName: null };
      }
    }

    /**
     * Processes attack result and logs it
     */
    let _processedThisPage = false;
    
    async function processAttackResult() {
      // Strict guards to prevent duplicate logging
      if (_processedThisPage) return;
      if (!isAttackResultPage()) return;
      
      // Check if this specific attack log has already been processed (persists across refreshes)
      const logId = getAttackLogId();
      if (logId && isAttackLogProcessed(logId)) {
        console.log('FightCapture: Attack log already processed:', logId);
        _processedThisPage = true; // Prevent further attempts this session
        return;
      }
      
      console.log('FightCapture: Detected attack page, waiting for content...');

      // Wait for page to fully load
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Double-check we haven't processed while waiting
      if (_processedThisPage) return;
      
      // Re-check persistent storage after wait
      if (logId && isAttackLogProcessed(logId)) {
        console.log('FightCapture: Attack log already processed (after wait):', logId);
        _processedThisPage = true;
        return;
      }

      const outcome = parseAttackOutcome();
      console.log('FightCapture: Parsed outcome:', outcome);
      
      if (outcome === 'unknown') {
        console.log('FightCapture: Could not determine outcome from page text');
        console.log('FightCapture: Page sample:', document.body.innerText?.substring(0, 300));
        return;
      }

      const pending = getPendingAttack();
      const pageInfo = extractOpponentFromPage();
      
      console.log('FightCapture: Pending attack data:', pending);
      console.log('FightCapture: Page info:', pageInfo);

      // Build fight record
      const fightRecord = {
        opponentId: pending?.opponentId || pageInfo.opponentId,
        opponentName: pending?.opponentName || pageInfo.opponentName,
        outcome: outcome,
        rsiRaw: pending?.rsiRaw || null,
        rsiAdjusted: pending?.rsiAdjusted || null,
        riskClass: pending?.riskClass || null,
        oppLife: pending?.oppLife || null,
        oppLevel: pending?.oppLevel || null,
        oppSnapshot: pending?.oppSnapshot || null,
        hadPrediction: !!pending,
        attackLogId: logId, // Store the log ID for reference
        capturedAt: Date.now()
      };

      // Only log if we have a VALID opponent ID (not just any number)
      if (!fightRecord.opponentId || fightRecord.opponentId < 100) {
        console.log('FightCapture: Invalid opponent ID:', fightRecord.opponentId, '- skipping log');
        return;
      }
      
      // Mark as processed BEFORE async operations (both session and persistent)
      _processedThisPage = true;
      if (logId) {
        markAttackLogProcessed(logId);
      }

      try {
        await FightDB.logFight(fightRecord);
        clearPendingAttack();
        showNotification(`📊 Fight logged: ${outcome.toUpperCase()}`);
        console.log('FightCapture: Successfully logged fight', fightRecord);
      } catch (e) {
        console.error('FightCapture: Failed to log fight', e);
        showNotification('Failed to log fight: ' + e.message, true);
        // Note: We don't reset _processedThisPage here because we already marked it in persistent storage
      }
    }

    /**
     * Parses fights from the attack log page
     */
    function parseAttackLogEntries() {
      const entries = [];
      
      // Look for attack log rows
      document.querySelectorAll('[class*="log-list"] li, .attack-log-item, [class*="attackLog"] [class*="row"]').forEach(row => {
        const text = row.innerText || '';
        
        // Skip if already processed
        if (row.dataset.ffProcessed) return;
        
        // Try to extract opponent ID from links
        const profileLink = row.querySelector('a[href*="profiles.php?XID="]');
        const opponentId = profileLink?.href.match(/XID=(\d+)/)?.[1];
        const opponentName = profileLink?.textContent?.trim();
        
        if (!opponentId) return;
        
        let outcome = null;
        if (/left\s+.+\s+on the street/i.test(text) ||
            /hospitalized/i.test(text) ||
            /mugged/i.test(text) ||
            /won/i.test(text)) {
          outcome = 'win';
        } else if (/lost/i.test(text) ||
                   /hospitalized you/i.test(text) ||
                   /defeated you/i.test(text)) {
          outcome = 'loss';
        }
        
        if (outcome) {
          entries.push({
            opponentId: parseInt(opponentId, 10),
            opponentName,
            outcome,
            source: 'attacklog'
          });
          row.dataset.ffProcessed = '1';
        }
      });
      
      return entries;
    }

    /**
     * Sets up attack page observer
     */
    function setupAttackPageObserver() {
      // Only run on attack result pages
      if (!isAttackResultPage()) return;
      
      // Track if we've already set up observer
      if (window.__ff_observer_setup) return;
      window.__ff_observer_setup = true;
      
      console.log('FightCapture: Attack result page detected at', location.href);
      
      // Process after a delay to let page load
      setTimeout(() => processAttackResult(), 3000);

      // Also observe for late-loading content, but with limited retries
      let retryCount = 0;
      const observer = new MutationObserver(() => {
        if (retryCount < 2 && !_processedThisPage) {
          retryCount++;
          setTimeout(() => processAttackResult(), 1000);
        }
      });

      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });

      // Stop observing after 15 seconds
      setTimeout(() => observer.disconnect(), 15000);
    }

    return {
      storePendingAttack,
      getPendingAttack,
      clearPendingAttack,
      isAttackResultPage,
      isAttackLogPage,
      parseAttackOutcome,
      processAttackResult,
      setupAttackPageObserver,
      parseAttackLogEntries
    };
  })();

  // ============================================================================
  // API LAYER (with cache eviction)
  // ============================================================================

  const ApiManager = (() => {
    const cache = new Map();
    const queue = [];
    const inFlight = new Map();
    let active = 0;
    let lastStart = 0;
    let timer = null;
    let errorShown = false;

    function evictOldEntries() {
      if (cache.size <= API_CACHE_MAX_SIZE) return;
      const entries = [...cache.entries()]
        .sort((a, b) => a[1].ts - b[1].ts);
      const toRemove = entries.slice(0, Math.floor(cache.size * 0.25));
      toRemove.forEach(([key]) => cache.delete(key));
    }

    function showBanner(text) {
      let el = document.getElementById('ff-api-warning');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ff-api-warning';
        document.body.appendChild(el);
      }
      el.textContent = text + ' (click to hide)';
      el.onclick = () => el.style.display = 'none';
      el.style.display = 'block';
    }

    function drainQueue() {
      if (!queue.length || active >= API_MAX_ACTIVE) return;

      const now = Date.now();
      const wait = API_MIN_DELAY - (now - lastStart);
      if (wait > 0) {
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            drainQueue();
          }, wait);
        }
        return;
      }

      const item = queue.shift();
      if (!item) return;
      const { ep, cbs } = item;

      inFlight.set(ep, cbs);
      active++;
      lastStart = now;

      Env.httpRequest({
        method: 'GET',
        url: `https://api.torn.com${ep}&key=${API_KEY}`,
        onload: r => {
          active--;
          const callbacks = inFlight.get(ep) || cbs;
          inFlight.delete(ep);

          try {
            const data = JSON.parse(r.responseText);
            if (!data.error) {
              cache.set(ep, { data, ts: Date.now() });
              evictOldEntries();
              callbacks.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
            } else {
              console.error('Torn API error', data.error);
              if (!errorShown) {
                errorShown = true;
                let msg = `ATK Scouter: Torn API error ${data.error.code} — ${data.error.error}`;
                if (data.error.code === 1 || data.error.code === 2) {
                  msg = 'ATK Scouter: Your Torn API key is invalid or lacks required permissions. Open the ⚙️ settings and verify the key.';
                } else if (data.error.code === 5) {
                  msg = 'ATK Scouter: Torn API rate limit reached. Some data may be delayed.';
                }
                showBanner(msg);
              }
            }
          } catch (e) {
            console.error('Torn API parse error', e);
          }
          drainQueue();
        },
        onerror: err => {
          active--;
          inFlight.delete(ep);
          console.error('Torn API request failed', err);
          drainQueue();
        }
      });
    }

    return {
      get(ep, cb) {
        if (!API_KEY) return;

        const now = Date.now();
        const ttl = /selections=basic/.test(ep) ? API_CACHE_TTL_BASIC : API_CACHE_TTL_DEFAULT;
        const cached = cache.get(ep);

        if (cached && now - cached.ts < ttl) {
          try { cb(cached.data); } catch (e) { console.error(e); }
          return;
        }

        const pending = inFlight.get(ep);
        if (pending) {
          pending.push(cb);
          return;
        }

        queue.push({ ep, cbs: [cb] });
        drainQueue();
      },

      clearCache() {
        cache.clear();
      }
    };
  })();

  // ============================================================================
  // RSI CALCULATION
  // ============================================================================

  /**
   * Calculates battle power components and total
   */
  function calcBattlePower(personalStats, basic) {
    const ps = personalStats || {};
    const b = basic || {};

    const elo = (ps.elo || 0) * 2;
    const dmg = Math.sqrt((ps.attackdamage || 0) / 1000) * 1.5;
    const winDiff = Math.max((ps.attackswon || 0) - (ps.attackslost || 0), 0);
    const win = Math.sqrt(winDiff) * 1.2;

    const totalAttacks = (ps.attackswon || 0) + (ps.attackslost || 0);
    const winRate = totalAttacks > 0 ? (ps.attackswon / totalAttacks) * 100 : 0;
    const critRate = ps.attackhits > 0 ? ((ps.attackcriticalhits || 0) / ps.attackhits) * 100 : 0;
    const networth = Math.log10((ps.networth || 0) + 1) * 5;

    const now = Date.now() / 1000;
    const joined = b.joined || now;
    const ageDays = (now - joined) / 86400;
    const age = Math.log10(ageDays + 1) * 5;
    const activity = Math.log10((ps.useractivity || 0) + 1) * 2;

    const parts = { elo, dmg, win, winRate, critRate, networth, age, activity };
    const sum = elo + dmg + win + winRate + critRate + networth + age + activity;

    return { parts, sum };
  }

  /**
   * Calculates RSI percentage
   */
  function calcRSI(userBP, oppPersonalStats, oppBasic, oppLife) {
    const oppCalc = calcBattlePower(oppPersonalStats, oppBasic);
    const oppBP = oppCalc.sum * getGymMultiplier(oppPersonalStats?.xantaken || 0);

    const raw = (userBP / oppBP) * 100;
    const lifeRatio = (oppLife?.current && oppLife?.maximum)
      ? oppLife.current / oppLife.maximum
      : 1;
    const woundPenalty = 1 - lifeRatio;
    const fairness = Math.min(raw / 100, 1);
    const boost = woundPenalty * settings.lifeWeight * fairness;
    const adjusted = raw * (1 + boost);

    return {
      raw,
      adjusted,
      woundPenalty,
      boost,
      lifeRatio,
      oppBP,
      oppCalc
    };
  }

  // ============================================================================
  // TOOLTIP MANAGER
  // ============================================================================

  const Tooltip = (() => {
    let element = null;

    function getElement() {
      if (!element) {
        element = document.createElement('div');
        element.className = 'ff-tooltip-viewport';
        document.body.appendChild(element);
      }
      return element;
    }

    return {
      show(pageX, pageY, html) {
        const tt = getElement();
        tt.innerHTML = html;  // Already sanitized by caller
        requestAnimationFrame(() => {
          const rect = tt.getBoundingClientRect();
          let left = pageX - rect.width / 2;
          left = Math.max(4, Math.min(left, document.documentElement.clientWidth - rect.width - 4));
          const top = pageY - rect.height - 12;
          tt.style.left = left + 'px';
          tt.style.top = top + 'px';
          tt.style.display = 'block';
        });
      },

      hide() {
        if (element) element.style.display = 'none';
      }
    };
  })();

  // ============================================================================
  // USER STATE
  // ============================================================================

  let ME_STATS = null;
  let ME_DRUGS = null;
  let USER_BP = null;
  let USER_DRUG_DEBUFF = 0;

  // Global references for RSI+ panel
  window.__FF_ME_STATS_OBJ = null;
  window.__FF_LAST_PROFILE_OBJ = null;

  function initUserState() {
    ApiManager.get('/user/?selections=personalstats,basic', d => {
      ME_STATS = d;
      window.__FF_ME_STATS_OBJ = d;
      tryInitComplete();
    });
    ApiManager.get('/user/?selections=battlestats', d => {
      ME_DRUGS = d;
      tryInitComplete();
    });
  }

  function tryInitComplete() {
    if (!ME_STATS || !ME_DRUGS) return;

    const modifiers = [
      ME_DRUGS.strength_modifier,
      ME_DRUGS.defense_modifier,
      ME_DRUGS.speed_modifier,
      ME_DRUGS.dexterity_modifier
    ];

    const negatives = modifiers
      .filter(x => typeof x === 'number' && x < 0)
      .map(x => -x / 100);

    USER_DRUG_DEBUFF = negatives.length
      ? negatives.reduce((a, c) => a + c, 0) / negatives.length
      : 0;

    const userCalc = calcBattlePower(ME_STATS.personalstats, ME_STATS.basic);
    USER_BP = userCalc.sum
      * getGymMultiplier(ME_STATS.personalstats?.xantaken || 0)
      * (1 - USER_DRUG_DEBUFF * settings.drugWeight);

    // Start injection after user state is ready
    ObserverManager.start();
  }

  // ============================================================================
  // RSI+ EXPERIMENTAL PANEL
  // ============================================================================

  function buildRSIPlusPanel(headerEl, meStatsObj, oppObj) {
    try {
      if (!headerEl || document.getElementById('ff-exp-panel')) return;
      if (!meStatsObj || !oppObj) return;

      const mePS = meStatsObj.personalstats || {};
      const meB = meStatsObj.basic || {};
      const oppPS = oppObj.personalstats || {};
      const oppB = oppObj.basic || oppObj.profile || {};

      const me = calcBattlePower(mePS, meB);
      const op = calcBattlePower(oppPS, oppB);

      const meGymMul = getGymMultiplier(mePS.xantaken || 0);
      const meDrugMul = 1 - USER_DRUG_DEBUFF * settings.drugWeight;
      const opGymMul = getGymMultiplier(oppPS.xantaken || 0);

      const keys = ['elo', 'dmg', 'win', 'winRate', 'critRate', 'networth', 'age', 'activity'];
      const nameMap = {
        elo: 'ELO×2',
        dmg: '√Damage×1.5',
        win: '√(W−L)×1.2',
        winRate: 'Win%×100',
        critRate: 'Crit%×100',
        networth: 'log₁₀(NW+1)×5',
        age: 'log Age×5',
        activity: 'log Activity×2'
      };

      const efficiencies = keys.map(k => {
        const you = me.parts[k] * meGymMul * meDrugMul;
        const opp = op.parts[k] * opGymMul;
        return { key: k, you, opp, delta: you - opp };
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      const oppBP = op.sum * opGymMul;
      const yourBP = (typeof USER_BP === 'number' && USER_BP > 0)
        ? USER_BP
        : (me.sum * meGymMul * meDrugMul);

      const raw = (yourBP / oppBP) * 100;
      const life = (oppObj.life?.maximum)
        ? oppObj.life.current / oppObj.life.maximum
        : 1;
      const wp = 1 - life;
      const fair = Math.min(raw / 100, 1);
      const boost = wp * settings.lifeWeight * fair;
      const adj = raw * (1 + boost);

      // Learned RSI (beta): logistic regression
      let theta0 = Number(Env.getValue('ff_lrsi_theta0', 0));
      let theta1 = Number(Env.getValue('ff_lrsi_theta1', 0.12));
      const xRaw = raw - 100;
      const pWin = 1 / (1 + Math.exp(-(theta0 + theta1 * xRaw)));

      const top3 = efficiencies.slice(0, 3).map(r => {
        const sign = r.delta >= 0 ? '+' : '−';
        return `${nameMap[r.key]} ${sign}${Math.abs(r.delta).toFixed(1)}`;
      }).join(' · ');

      const wrap = document.createElement('details');
      wrap.id = 'ff-exp-panel';
      wrap.open = false;
      wrap.style.cssText = 'margin-top:6px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px 10px;color:#e6e6e6;';

      const summary = document.createElement('summary');
      summary.textContent = 'RSI+ (Experimental) — breakdown & drivers';
      summary.style.cssText = 'cursor:pointer;color:#e6e6e6;font-weight:600;';
      wrap.appendChild(summary);

      const div = document.createElement('div');
      div.innerHTML = `
        <div style="margin-top:6px;font-size:12px;line-height:1.35">
          <div style="margin-bottom:6px;">
            <b>Adjusted RSI:</b> ${adj.toFixed(2)}%
            <span style="margin-left:10px;"><b>Learned RSI (beta):</b> <span id="ff-lrsi-value">${(pWin * 100).toFixed(1)}%</span></span>
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
          <div style="margin-top:6px;opacity:.9;"><b>Top drivers:</b> ${escapeHtml(top3)}</div>
          <div style="opacity:.8;">Raw: ${raw.toFixed(2)}% · Wound boost: ${(boost * 100).toFixed(1)}% · Life: ${(life * 100).toFixed(0)}%</div>
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
              ${efficiencies.map(r => `<tr>
                <td style="padding:3px 2px;opacity:.9;color:#e6e6e6">${escapeHtml(nameMap[r.key])}</td>
                <td style="padding:3px 2px;text-align:right;color:#e6e6e6">${r.you.toFixed(1)}</td>
                <td style="padding:3px 2px;text-align:right;color:#e6e6e6">${r.opp.toFixed(1)}</td>
                <td style="padding:3px 2px;text-align:right;color:${r.delta >= 0 ? '#9ccc65' : '#ef5350'}">${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}</td>
              </tr>`).join('')}
              <tr style="border-top:1px dotted rgba(255,255,255,.15)">
                <td style="padding:4px 2px"><span class="ff-chip-label">Gym × Drug multipliers applied</span></td>
                <td style="padding:4px 2px;text-align:right;opacity:.9;color:#e6e6e6">× ${(meGymMul * meDrugMul).toFixed(3)}</td>
                <td style="padding:4px 2px;text-align:right;opacity:.9;color:#e6e6e6">× ${opGymMul.toFixed(3)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>`;
      wrap.appendChild(div);
      headerEl.insertAdjacentElement('afterend', wrap);

      // Wire up trainer controls
      setupTrainerControls(wrap, raw);
    } catch (e) {
      console.error('RSI+ Panel error:', e);
    }
  }

  function setupTrainerControls(wrap, rawRSI) {
    const load = () => ({
      t0: Number(Env.getValue('ff_lrsi_theta0', 0)),
      t1: Number(Env.getValue('ff_lrsi_theta1', 0.12)),
      meta: Env.getValue('ff_lrsi_meta', { n: 0, ts: 0 }) || { n: 0, ts: 0 },
      hist: Env.getValue('ff_lrsi_hist', []) || []
    });

    const saveTheta = (t0, t1) => {
      Env.setValue('ff_lrsi_theta0', t0);
      Env.setValue('ff_lrsi_theta1', t1);
    };

    const saveHist = hist => {
      Env.setValue('ff_lrsi_hist', hist);
      Env.setValue('ff_lrsi_meta', { n: hist.length, ts: Date.now() });
    };

    const addSample = (hist, rsi, won) => {
      const now = Date.now();
      const ninetyDays = 90 * 24 * 3600 * 1000;
      const pruned = (hist || []).filter(h => now - h.ts <= ninetyDays);
      pruned.push({ ts: now, rsi: Number(rsi) || 0, y: won ? 1 : 0 });
      while (pruned.length > 500) pruned.shift();
      saveHist(pruned);
      return pruned;
    };

    const refit = hist => {
      if (!hist?.length) return null;
      let t0 = 0;
      let t1 = Number(Env.getValue('ff_lrsi_theta1', 0.12));
      const lr = 1e-3, reg = 1e-4, iters = 250;

      for (let it = 0; it < iters; it++) {
        let g0 = 0, g1 = 0;
        for (const h of hist) {
          const x = h.rsi - 100;
          const z = t0 + t1 * x;
          const p = 1 / (1 + Math.exp(-z));
          const e = p - (h.y ? 1 : 0);
          g0 += e;
          g1 += e * x;
        }
        g0 += reg * t0;
        g1 += reg * t1;
        t0 -= lr * g0;
        t1 -= lr * g1;
      }
      saveTheta(t0, t1);
      return { t0, t1 };
    };

    const t0El = wrap.querySelector('#ff-theta0');
    const t1El = wrap.querySelector('#ff-theta1');
    const nEl = wrap.querySelector('#ff-lrsi-n');
    const valEl = wrap.querySelector('#ff-lrsi-value');
    const msgEl = wrap.querySelector('#ff-lrsi-msg');

    const flash = msg => {
      if (!msgEl) return;
      msgEl.textContent = ` · ${msg}`;
      setTimeout(() => {
        if (msgEl.textContent === ` · ${msg}`) msgEl.textContent = '';
      }, 2000);
    };

    const showTheta = () => {
      const cur = load();
      if (t0El) t0El.textContent = cur.t0.toFixed(3);
      if (t1El) t1El.textContent = cur.t1.toFixed(3);
      if (nEl) nEl.textContent = ` · samples: ${cur.meta?.n ?? cur.hist?.length ?? 0}`;
    };

    const updateProb = () => {
      const cur = load();
      const x = rawRSI - 100;
      const p = 1 / (1 + Math.exp(-(cur.t0 + cur.t1 * x)));
      if (valEl) valEl.textContent = `${(p * 100).toFixed(1)}%`;
    };

    const refreshAll = () => { showTheta(); updateProb(); };
    refreshAll();

    wrap.querySelector('#ff-softer')?.addEventListener('click', () => {
      const cur = load();
      saveTheta(cur.t0, cur.t1 * 0.9);
      refreshAll();
      flash('slope softer');
    });

    wrap.querySelector('#ff-steeper')?.addEventListener('click', () => {
      const cur = load();
      saveTheta(cur.t0, cur.t1 * 1.1);
      refreshAll();
      flash('slope steeper');
    });

    wrap.querySelector('#ff-reset')?.addEventListener('click', () => {
      saveTheta(0, 0.12);
      Env.setValue('ff_lrsi_hist', []);
      Env.setValue('ff_lrsi_meta', { n: 0, ts: Date.now() });
      refreshAll();
      flash('reset');
    });

    wrap.querySelector('#ff-refit')?.addEventListener('click', () => {
      const cur = load();
      const fitted = refit(cur.hist);
      refreshAll();
      flash(fitted ? `re-fit: θ0=${fitted.t0.toFixed(3)}, θ1=${fitted.t1.toFixed(3)}` : 'no samples');
    });

    wrap.querySelector('#ff-clear')?.addEventListener('click', () => {
      Env.setValue('ff_lrsi_hist', []);
      Env.setValue('ff_lrsi_meta', { n: 0, ts: Date.now() });
      refreshAll();
      flash('log cleared');
    });

    const logSample = won => {
      const cur = load();
      const hist = addSample(cur.hist, rawRSI, won);
      refreshAll();
      flash(`logged ${won ? 'win' : 'loss'} (#${hist.length})`);
    };

    wrap.querySelector('#ff-logwin')?.addEventListener('click', () => logSample(true));
    wrap.querySelector('#ff-logloss')?.addEventListener('click', () => logSample(false));
  }

  // ============================================================================
  // INJECTION FUNCTIONS
  // ============================================================================

  function injectProfile() {
    const h = document.querySelector('h4');
    if (!h || h.dataset.ff) return;
    h.dataset.ff = '1';

    const match = location.href.match(/[?&](?:XID|user2ID)=(\d+)/);
    const userId = match?.[1];
    if (!userId) return;

    ApiManager.get(`/user/${userId}?selections=personalstats,basic,profile`, o => {
      const rsi = calcRSI(USER_BP, o.personalstats, o.basic, o.life);
      const pct = parseFloat(rsi.adjusted.toFixed(2));

      let cls = 'low', note = 'Advantage';
      if (pct < settings.lowHigh) { cls = 'high'; note = 'High risk'; }
      else if (pct < settings.highMed) { cls = 'med'; note = 'Moderate risk'; }

      const lifePct = o.life?.maximum
        ? Math.round((o.life.current / o.life.maximum) * 100)
        : null;

      const lastAction = o.last_action || o.profile?.last_action || o.basic?.last_action;
      let rel = null;
      if (lastAction?.relative) {
        const mm = lastAction.relative.match(/^(\d+)\s+(\w+)/);
        if (mm) {
          const num = mm[1];
          const word = mm[2].toLowerCase();
          let suffix = 'm';
          if (word.startsWith('hour')) suffix = 'h';
          else if (word.startsWith('day')) suffix = 'd';
          rel = num + suffix;
        }
      }

      let extra = '';
      if (lifePct !== null && rel !== null) extra = ` (L ${lifePct}% · A ${rel})`;
      else if (lifePct !== null) extra = ` (L ${lifePct}%)`;
      else if (rel !== null) extra = ` (A ${rel})`;

      const sp = document.createElement('span');
      sp.className = `ff-score-badge ${cls}${rsi.woundPenalty > 0 ? ' wounded' : ''}`;
      sp.innerHTML = `
        RSI ${pct}% — ${escapeHtml(note)}${escapeHtml(extra)}
        ${rsi.woundPenalty > 0 ? '<span style="margin-left:6px;color:#fff;">✚</span>' : ''}
        ${USER_DRUG_DEBUFF > 0 ? `<img src="${PILL_ICON_URL}" style="width:12px;height:12px;vertical-align:middle;margin-left:6px;">` : ''}
      `;
      h.appendChild(sp);

      // Store prediction for fight capture
      FightCapture.storePendingAttack({
        opponentId: parseInt(userId, 10),
        opponentName: o.name || o.basic?.name || null,
        rsiRaw: rsi.raw,
        rsiAdjusted: rsi.adjusted,
        riskClass: cls,
        oppLife: rsi.lifeRatio,
        oppLevel: o.level || o.basic?.level || null,
        oppSnapshot: {
          elo: o.personalstats?.elo,
          attacksWon: o.personalstats?.attackswon,
          attacksLost: o.personalstats?.attackslost,
          xantaken: o.personalstats?.xantaken,
          networth: o.personalstats?.networth
        }
      });

      window.__FF_LAST_PROFILE_OBJ = o;
      buildRSIPlusPanel(h, ME_STATS, o);
    });
  }

  function injectListItem(honorWrap) {
    if (honorWrap.dataset.ff) return;
    honorWrap.dataset.ff = '1';

    const profileLink = honorWrap.querySelector('a[href*="profiles.php?XID="]');
    if (!profileLink) return;

    const honorTextWrap = honorWrap.querySelector('.honor-text-wrap') || honorWrap;
    if (getComputedStyle(honorTextWrap).position === 'static') {
      honorTextWrap.style.position = 'relative';
    }

    const userIdMatch = profileLink.href.match(/XID=(\d+)/);
    if (!userIdMatch) return;
    const userId = userIdMatch[1];

    ApiManager.get(`/user/${userId}?selections=personalstats,basic,profile`, d => {
      // Clear existing indicators
      honorTextWrap.querySelectorAll('.ff-list-arrow-img, .ff-travel-icon, .ff-hospital-icon, .ff-loc-badge, .ff-countdown-chip')
        .forEach(el => el.remove());

      const rsi = calcRSI(USER_BP, d.personalstats, d.basic, d.life);
      const pct = parseFloat(rsi.adjusted.toFixed(2));

      const cls = rsi.adjusted < settings.lowHigh ? 'high'
        : rsi.adjusted < settings.highMed ? 'med'
        : 'low';

      const pos = (100 - Math.min(rsi.adjusted, 200) / 200 * 100) + '%';

      const lifePct = d.life?.maximum
        ? Math.round((d.life.current / d.life.maximum) * 100)
        : null;

      const lastAction = d.last_action || d.profile?.last_action || d.basic?.last_action;

      // Build sanitized tooltip HTML
      let tooltipHtml = `RSI: ${escapeHtml(pct.toFixed(2))}%`;
      if (lifePct !== null) tooltipHtml += `<br>Life: ${escapeHtml(String(lifePct))}%`;
      if (lastAction?.relative) tooltipHtml += `<br>Last action: ${escapeHtml(lastAction.relative)}`;

      // Create triangle indicator
      const img = document.createElement('img');
      img.className = 'ff-list-arrow-img';
      img.style.left = pos;
      img.src = cls === 'low' ? GREEN_ARROW_UP : cls === 'med' ? YELLOW_ARROW_UP : RED_ARROW_UP;
      img.setAttribute('width', '20');
      img.setAttribute('height', '20');
      if (rsi.woundPenalty > 0) img.classList.add('wounded');

      img.addEventListener('mouseenter', e => {
        Tooltip.show(e.pageX, e.pageY, tooltipHtml);
        // Refresh data on hover
        ApiManager.get(`/user/${userId}?selections=personalstats,basic,profile`, d2 => {
          honorTextWrap.querySelectorAll('.ff-list-arrow-img').forEach(el => el.remove());
          injectTriangle(honorTextWrap, d2, userId, e);
        });
      });
      img.addEventListener('mousemove', e => Tooltip.show(e.pageX, e.pageY, tooltipHtml));
      img.addEventListener('mouseleave', () => Tooltip.hide());
      img.addEventListener('click', e => {
        e.preventDefault();
        Tooltip.show(e.pageX, e.pageY, tooltipHtml);
        setTimeout(Tooltip.hide, 2000);
      });

      honorTextWrap.appendChild(img);

      // Add status icon (hospital/travel)
      addStatusIcon(d, honorTextWrap, userId);
    });
  }

  function injectTriangle(honorTextWrap, d, userId, event) {
    const rsi = calcRSI(USER_BP, d.personalstats, d.basic, d.life);
    const pct = parseFloat(rsi.adjusted.toFixed(2));
    const cls = rsi.adjusted < settings.lowHigh ? 'high'
      : rsi.adjusted < settings.highMed ? 'med'
      : 'low';
    const pos = (100 - Math.min(rsi.adjusted, 200) / 200 * 100) + '%';

    const lifePct = d.life?.maximum ? Math.round((d.life.current / d.life.maximum) * 100) : null;
    const lastAction = d.last_action || d.profile?.last_action || d.basic?.last_action;

    let tooltipHtml = `RSI: ${escapeHtml(pct.toFixed(2))}%`;
    if (lifePct !== null) tooltipHtml += `<br>Life: ${escapeHtml(String(lifePct))}%`;
    if (lastAction?.relative) tooltipHtml += `<br>Last action: ${escapeHtml(lastAction.relative)}`;

    const img = document.createElement('img');
    img.className = 'ff-list-arrow-img';
    img.style.left = pos;
    img.src = cls === 'low' ? GREEN_ARROW_UP : cls === 'med' ? YELLOW_ARROW_UP : RED_ARROW_UP;
    img.setAttribute('width', '20');
    img.setAttribute('height', '20');
    if (rsi.woundPenalty > 0) img.classList.add('wounded');

    img.addEventListener('mouseenter', e => Tooltip.show(e.pageX, e.pageY, tooltipHtml));
    img.addEventListener('mousemove', e => Tooltip.show(e.pageX, e.pageY, tooltipHtml));
    img.addEventListener('mouseleave', () => Tooltip.hide());
    img.addEventListener('click', e => {
      e.preventDefault();
      Tooltip.show(e.pageX, e.pageY, tooltipHtml);
      setTimeout(Tooltip.hide, 2000);
    });

    honorTextWrap.appendChild(img);
    if (event?.pageX) Tooltip.show(event.pageX, event.pageY, tooltipHtml);
  }

  function addStatusIcon(statusData, honorTextWrap, userId) {
    if (!statusData?.status) return;

    honorTextWrap.querySelectorAll('.ff-travel-icon, .ff-hospital-icon').forEach(el => el.remove());

    const makeTooltip = s => {
      let tip = escapeHtml(s.status.description || s.status.state);
      if (s.status.details) tip += `<br>${escapeHtml(s.status.details)}`;
      return tip;
    };

    // Hospital takes priority
    if (statusData.status.state === "Hospital") {
      const desc = (statusData.status.description || statusData.status.details || "").trim();
      const isAbroad = /^In a\s+.+\s+hospital\s+for\s+\d+\s+min/i.test(desc);

      const icon = document.createElement('img');
      icon.src = HOSPITAL_ICON_URL;
      icon.className = 'ff-hospital-icon';
      icon.alt = 'Hospital';
      icon.draggable = false;

      if (desc) icon.dataset.ffDesc = desc;
      if (statusData.status.until) icon.dataset.ffUntil = String(statusData.status.until);

      icon.style.filter = isAbroad
        ? 'grayscale(0) brightness(1) drop-shadow(0 0 3px #ff9800) drop-shadow(0 0 2px #ffb300)'
        : 'grayscale(0) brightness(1) drop-shadow(0 0 3px #2094fa) drop-shadow(0 0 2px #42a5f5)';

      let lastTooltip = makeTooltip(statusData);

      icon.addEventListener('mouseenter', ev => {
        Tooltip.show(ev.pageX, ev.pageY, lastTooltip);
        ApiManager.get(`/user/${userId}?selections=basic`, newStatus => {
          if (!newStatus.status) return;
          if (JSON.stringify(newStatus.status) !== JSON.stringify(statusData.status)) {
            honorTextWrap.querySelectorAll('.ff-hospital-icon, .ff-travel-icon').forEach(el => el.remove());
            addStatusIcon(newStatus, honorTextWrap, userId);
            Tooltip.show(ev.pageX, ev.pageY, makeTooltip(newStatus));
          }
        });
      });
      icon.addEventListener('mousemove', ev => Tooltip.show(ev.pageX, ev.pageY, lastTooltip));
      icon.addEventListener('mouseleave', () => Tooltip.hide());
      icon.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        Tooltip.show(ev.pageX, ev.pageY, lastTooltip);
        setTimeout(Tooltip.hide, 2000);
      });

      honorTextWrap.appendChild(icon);

      // Add countdown chip
      addCountdownChip(icon, honorTextWrap);
      return;
    }

    // Travel/Abroad
    if (statusData.status.state === "Traveling" || statusData.status.state === "Abroad") {
      const icon = document.createElement('img');
      icon.src = PLANE_ICON_URL;
      icon.className = 'ff-travel-icon ' + (statusData.status.state === "Traveling" ? 'ff-traveling' : 'ff-abroad');
      icon.alt = statusData.status.state;
      icon.draggable = false;

      const desc = (statusData.status.description || statusData.status.details || '').trim();
      if (desc) icon.dataset.ffDesc = desc;

      let lastTooltip = makeTooltip(statusData);

      icon.addEventListener('mouseenter', ev => {
        Tooltip.show(ev.pageX, ev.pageY, lastTooltip);
        ApiManager.get(`/user/${userId}?selections=basic`, newStatus => {
          if (!newStatus.status) return;
          if (JSON.stringify(newStatus.status) !== JSON.stringify(statusData.status)) {
            honorTextWrap.querySelectorAll('.ff-travel-icon, .ff-hospital-icon').forEach(el => el.remove());
            addStatusIcon(newStatus, honorTextWrap, userId);
            Tooltip.show(ev.pageX, ev.pageY, makeTooltip(newStatus));
          }
        });
      });
      icon.addEventListener('mousemove', ev => Tooltip.show(ev.pageX, ev.pageY, lastTooltip));
      icon.addEventListener('mouseleave', () => Tooltip.hide());
      icon.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        Tooltip.show(ev.pageX, ev.pageY, lastTooltip);
        setTimeout(Tooltip.hide, 2000);
      });

      honorTextWrap.appendChild(icon);

      // Add location badge
      addLocationBadge(icon, honorTextWrap);
    }
  }

  function addCountdownChip(icon, parent) {
    if (icon.dataset.ffChipped === '1') return;

    let untilMs = null;
    const untilAttr = icon.dataset.ffUntil;
    if (untilAttr) {
      const raw = parseInt(untilAttr, 10);
      if (!isNaN(raw) && raw > 0) {
        untilMs = raw < 1e12 ? raw * 1000 : raw;
      }
    }

    if (!untilMs) {
      const desc = icon.dataset.ffDesc || '';
      const mins = parseMinutesFromText(desc);
      if (mins != null) {
        untilMs = Date.now() + mins * 60 * 1000;
      }
    }

    if (!untilMs) return;

    let chip = parent.querySelector('.ff-countdown-chip');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'ff-countdown-chip';
      parent.appendChild(chip);
    }

    chip.dataset.ffUntil = String(untilMs);
    icon.dataset.ffChipped = '1';
  }

  function addLocationBadge(icon, parent) {
    if (parent.querySelector('.ff-loc-badge')) return;

    const desc = icon.dataset.ffDesc || '';
    const info = parseTravelInfo(desc);
    if (!info) return;

    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    const badge = document.createElement('span');
    badge.className = 'ff-loc-badge';
    badge.dataset.kind = info.kind;

    const arrow = info.kind === 'travel' ? '→ ' : info.kind === 'return' ? '← ' : '';
    badge.textContent = arrow + abbreviateLocation(info.loc);
    parent.appendChild(badge);
  }

  // ============================================================================
  // MARKET ATTACK BUTTONS
  // ============================================================================

  function injectMarketAttackButton(profileLink) {
    if (profileLink.parentElement?.querySelector('.ff-attack-btn')) return;

    const xidMatch = profileLink.getAttribute('href')?.match(/XID=(\d+)/);
    if (!xidMatch) return;
    const xid = xidMatch[1];

    const btn = document.createElement('a');
    btn.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${xid}`;
    btn.target = '_blank';
    btn.className = 'ff-attack-btn';
    btn.title = 'Attack this player';
    btn.style.cssText = 'margin-left:5px;background:transparent;border:none;padding:0;cursor:pointer;vertical-align:middle;display:inline-block;';

    const icon = document.createElement('img');
    icon.src = CIRCLE_ICON_URL;
    icon.alt = 'Attack';
    icon.style.cssText = 'width:16px;height:16px;display:inline-block;filter:drop-shadow(0 0 5px #ff1744) drop-shadow(0 0 6px #c62828);transition:filter 0.2s;';

    btn.appendChild(icon);
    btn.addEventListener('mouseenter', () => {
      icon.style.filter = 'drop-shadow(0 0 8px #ff1744) drop-shadow(0 0 14px #c62828)';
    });
    btn.addEventListener('mouseleave', () => {
      icon.style.filter = 'drop-shadow(0 0 5px #ff1744) drop-shadow(0 0 6px #c62828)';
    });

    profileLink.parentElement?.appendChild(btn);
  }

  // ============================================================================
  // CONSOLIDATED OBSERVER MANAGER
  // ============================================================================

  const ObserverManager = (() => {
    let observer = null;
    let debounceTimer = null;
    const seenAvailCells = new WeakSet();
    const seenMarketRows = new WeakSet();

    function processDOM() {
      // Profile injection
      injectProfile();

      // List items
      document.querySelectorAll('div[class*="honorWrap"]').forEach(injectListItem);

      // Market attack buttons (seller list)
      document.querySelectorAll('[class*="sellerListWrapper"] ul a[href*="profiles.php?XID="]')
        .forEach(injectMarketAttackButton);

      // Market rows (PDA/PC)
      document.querySelectorAll('[class*="rowWrapper"]').forEach(row => {
        if (!seenMarketRows.has(row)) {
          seenMarketRows.add(row);
          row.style.transition = 'background 2.5s cubic-bezier(.4,0,.2,1)';
          row.style.background = '#ff3e30';
          setTimeout(() => row.style.background = '', 1200);
        }

        const profileLink = row.querySelector('a[href*="profiles.php?XID="]');
        if (profileLink) injectMarketAttackButton(profileLink);
      });

      // "Available" cell highlighting (optimized selector)
      document.querySelectorAll('div').forEach(el => {
        if (el.childNodes.length === 1 && el.textContent.match(/^\d+\s*available$/)) {
          if (!seenAvailCells.has(el)) {
            seenAvailCells.add(el);
            el.style.transition = 'background 3s cubic-bezier(.4,0,.2,1)';
            el.style.background = '#ff0000';
            setTimeout(() => el.style.background = '', 1200);
          }
        }
      });

      // RSI+ panel mount fallback
      if (!document.getElementById('ff-exp-panel')) {
        const badge = document.querySelector('span.ff-score-badge');
        if (badge) {
          const h = badge.closest('h4');
          if (h && window.__FF_ME_STATS_OBJ && window.__FF_LAST_PROFILE_OBJ) {
            buildRSIPlusPanel(h, window.__FF_ME_STATS_OBJ, window.__FF_LAST_PROFILE_OBJ);
          }
        }
      }

      // Update countdown chips
      updateCountdowns();

      // Prune orphaned overlays
      pruneOrphans();

      // Anti-overlap adjustments
      adjustOverlaps();
    }

    function updateCountdowns() {
      document.querySelectorAll('.ff-countdown-chip').forEach(chip => {
        const until = parseInt(chip.dataset.ffUntil || '0', 10);
        if (!until) { chip.textContent = ''; return; }
        const remaining = Math.max(0, until - Date.now());
        const s = Math.floor(remaining / 1000);
        const hh = String(Math.floor(s / 3600)).padStart(2, '0');
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        chip.textContent = `${hh}:${mm}:${ss}`;
      });
    }

    function pruneOrphans() {
      document.querySelectorAll('.honor-text-wrap, div[class*="honorWrap"]').forEach(wrap => {
        if (!wrap.querySelector('.ff-travel-icon')) {
          wrap.querySelectorAll('.ff-loc-badge').forEach(n => n.remove());
        }
        if (!wrap.querySelector('.ff-hospital-icon')) {
          wrap.querySelectorAll('.ff-countdown-chip').forEach(n => n.remove());
        }
      });
    }

    function adjustOverlaps() {
      document.querySelectorAll('.honor-text-wrap, div[class*="honorWrap"]').forEach(wrap => {
        const wRect = wrap.getBoundingClientRect();
        if (!wRect.width) return;

        const cell = wrap.closest('.table-cell') || wrap.closest('td,th') || wrap.parentElement;
        if (!cell?.parentElement) return;

        const barriers = [];
        Array.from(cell.parentElement.children).forEach(sib => {
          if (sib === cell) return;
          const r = sib.getBoundingClientRect();
          if (r.width && r.left <= wRect.right && r.left >= wRect.left) {
            barriers.push(r.left);
          }
        });

        let shift = 0;
        if (barriers.length) {
          const inside = barriers.filter(x => x < wRect.right);
          const target = inside.length ? Math.max(...inside) : null;
          if (target !== null) shift = Math.ceil(wRect.right - target) + 6;
        }

        wrap.querySelectorAll('.ff-travel-icon, .ff-hospital-icon, .ff-loc-badge, .ff-countdown-chip')
          .forEach(el => {
            el.classList.add('ff-anti-overlap');
            el.style.transform = shift ? `translateX(${-shift}px)` : '';
          });
      });
    }

    function debouncedProcess() {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        processDOM();
      }, 100);
    }

    return {
      start() {
        processDOM();

        observer = new MutationObserver(debouncedProcess);
        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('popstate', processDOM);

        // Countdown timer
        setInterval(updateCountdowns, 1000);

        // Setup fight capture on attack pages
        FightCapture.setupAttackPageObserver();
      },

      stop() {
        observer?.disconnect();
        observer = null;
      }
    };
  })();

  // ============================================================================
  // SETTINGS UI WITH STATS TAB
  // ============================================================================

  function createSettingsUI() {
    const fab = document.createElement('div');
    fab.className = 'ff-fab';
    fab.textContent = '⚙️';

    const backdrop = document.createElement('div');
    backdrop.className = 'ff-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'ff-modal';

    modal.innerHTML = `
      <h3>ATK Scouter Settings v${VERSION}</h3>
      <div class="ff-tabs">
        <div class="ff-tab active" data-tab="settings">⚙️ Settings</div>
        <div class="ff-tab" data-tab="stats">📊 Stats</div>
        <div class="ff-tab" data-tab="apikey">🔑 API Key</div>
      </div>
      <div class="ff-tab-content active" id="tab-settings">
        <label>High→Med cutoff (%)</label>
        <input type="number" id="ff-th1" value="${settings.lowHigh}" min="0" max="1000">
        <label>Med→Low cutoff (%)</label>
        <input type="number" id="ff-th2" value="${settings.highMed}" min="0" max="1000">
        <label>Life weight (0–1)</label>
        <input type="number" step="0.01" id="ff-lw" value="${settings.lifeWeight}" min="0" max="1">
        <label>Drug weight (0–1)</label>
        <input type="number" step="0.01" id="ff-dw" value="${settings.drugWeight}" min="0" max="1">
      </div>
      <div class="ff-tab-content" id="tab-stats">
        <div id="ff-stats-content">
          <div class="ff-empty-state">Loading stats...</div>
        </div>
      </div>
      <div class="ff-tab-content" id="tab-apikey">
        <label>API Key</label>
        <input type="text" id="ff-key" value="${API_KEY ? API_KEY.slice(0, 4) + '••••••••' + API_KEY.slice(-4) : ''}" placeholder="Enter your Torn API Key…">
        <button class="btn btn-clear" id="ff-clear-key">Clear Key</button>
      </div>
      <div style="text-align:right;">
        <button class="btn btn-save" id="ff-save">💾 Save & Reload</button>
        <button class="btn btn-cancel" id="ff-cancel">❌ Cancel</button>
      </div>
    `;

    document.body.append(fab, backdrop, modal);

    // Tab switching
    modal.querySelectorAll('.ff-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.ff-tab, .ff-tab-content').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        modal.querySelector('#tab-' + tab.dataset.tab)?.classList.add('active');

        // Load stats when stats tab is shown
        if (tab.dataset.tab === 'stats') {
          loadStatsTab();
        }
      });
    });

    const closeModal = () => {
      modal.style.display = 'none';
      backdrop.style.display = 'none';
    };

    fab.addEventListener('click', () => {
      backdrop.style.display = 'block';
      modal.style.display = 'block';
    });

    backdrop.addEventListener('click', closeModal);
    modal.querySelector('#ff-cancel')?.addEventListener('click', closeModal);

    modal.querySelector('#ff-clear-key')?.addEventListener('click', () => {
      Env.deleteValue('api_key');
      API_KEY = '';
      const keyInput = modal.querySelector('#ff-key');
      if (keyInput) keyInput.value = '';
      alert('API key cleared');
    });

    modal.querySelector('#ff-save')?.addEventListener('click', () => {
      const keyInput = modal.querySelector('#ff-key');
      const newKey = keyInput?.value.trim();
      // Only save if it doesn't look like the masked key
      if (newKey && !newKey.includes('••')) {
        Env.setValue('api_key', newKey);
        API_KEY = newKey;
      }

      const v1 = parseFloat(modal.querySelector('#ff-th1')?.value);
      const v2 = parseFloat(modal.querySelector('#ff-th2')?.value);
      const v3 = parseFloat(modal.querySelector('#ff-lw')?.value);
      const v4 = parseFloat(modal.querySelector('#ff-dw')?.value);

      if (!isNaN(v1)) Env.setValue('threshold_lowHigh', v1);
      if (!isNaN(v2)) Env.setValue('threshold_highMed', v2);
      if (!isNaN(v3)) Env.setValue('lifeWeight', v3);
      if (!isNaN(v4)) Env.setValue('drugWeight', v4);

      location.reload();
    });

    // Auto-open settings if no API key
    if (!API_KEY) {
      fab.click();
      modal.querySelector('[data-tab=apikey]')?.click();
    }
  }

  /**
   * Loads the stats tab content
   */
  async function loadStatsTab() {
    const container = document.getElementById('ff-stats-content');
    if (!container) return;

    try {
      const isAvailable = await FightDB.isAvailable();
      if (!isAvailable) {
        container.innerHTML = `
          <div class="ff-empty-state">
            <p>📵 IndexedDB not available</p>
            <p style="font-size:0.85em;opacity:0.7">Fight logging requires IndexedDB support.</p>
          </div>
        `;
        return;
      }

      const [overall, buckets, recent] = await Promise.all([
        FightDB.getOverallStats(),
        FightDB.getStatsByRsiBucket(),
        FightDB.getRecentFights(20)
      ]);

      if (overall.total === 0) {
        container.innerHTML = `
          <div class="ff-empty-state">
            <p>📭 No fights logged yet</p>
            <p style="font-size:0.85em;opacity:0.7">Fight outcomes are automatically captured when you attack players.</p>
            <p style="font-size:0.85em;opacity:0.7">View a profile, then attack — the result will be logged.</p>
          </div>
        `;
        return;
      }

      const winRateClass = overall.winRate >= 60 ? '' : overall.winRate >= 40 ? 'warning' : 'danger';

      container.innerHTML = `
        <div class="ff-stats-grid">
          <div class="ff-stat-card">
            <span class="ff-stat-value">${overall.total}</span>
            <span class="ff-stat-label">Total Fights</span>
          </div>
          <div class="ff-stat-card">
            <span class="ff-stat-value ${winRateClass}">${overall.winRate.toFixed(1)}%</span>
            <span class="ff-stat-label">Win Rate</span>
          </div>
          <div class="ff-stat-card">
            <span class="ff-stat-value">${overall.wins}</span>
            <span class="ff-stat-label">Wins</span>
          </div>
          <div class="ff-stat-card">
            <span class="ff-stat-value danger">${overall.losses}</span>
            <span class="ff-stat-label">Losses</span>
          </div>
        </div>

        <h4 style="margin:16px 0 8px;font-size:0.95em;">Win Rate by RSI Bucket</h4>
        <table class="ff-calibration-table">
          <thead>
            <tr>
              <th>RSI Range</th>
              <th>Fights</th>
              <th>Wins</th>
              <th>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(buckets).map(([range, data]) => {
              const wr = data.total > 0 ? ((data.wins / data.total) * 100).toFixed(1) : '—';
              const wrClass = data.total === 0 ? '' : (data.wins / data.total >= 0.6 ? 'ff-fight-win' : data.wins / data.total < 0.4 ? 'ff-fight-loss' : '');
              return `
                <tr>
                  <td>${escapeHtml(range)}%</td>
                  <td>${data.total}</td>
                  <td>${data.wins}</td>
                  <td class="${wrClass}">${wr}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <h4 style="margin:16px 0 8px;font-size:0.95em;">Recent Fights</h4>
        <div class="ff-recent-fights">
          ${recent.length === 0 ? '<div class="ff-empty-state">No recent fights</div>' : 
            recent.map(f => {
              const outcomeClass = f.outcome === 'win' ? 'ff-fight-win' : f.outcome === 'loss' ? 'ff-fight-loss' : 'ff-fight-other';
              const rsiDisplay = f.rsiAdjusted ? f.rsiAdjusted.toFixed(1) + '%' : '—';
              const timeAgo = formatTimeAgo(f.timestamp || f.capturedAt);
              return `
                <div class="ff-fight-row">
                  <span>${escapeHtml(f.opponentName || 'Unknown')} [${f.opponentId || '?'}]</span>
                  <span>RSI: ${rsiDisplay}</span>
                  <span class="${outcomeClass}">${f.outcome?.toUpperCase() || '?'}</span>
                  <span style="opacity:0.6;font-size:0.8em">${timeAgo}</span>
                </div>
              `;
            }).join('')
          }
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="ff-btn-small ff-btn-export" id="ff-export-data">📤 Export Data</button>
          <button class="ff-btn-small ff-btn-danger" id="ff-clear-data">🗑️ Clear All Data</button>
        </div>
      `;

      // Wire up buttons
      document.getElementById('ff-export-data')?.addEventListener('click', async () => {
        try {
          const data = await FightDB.exportData();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `atk-scouter-fights-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showNotification('Data exported!');
        } catch (e) {
          showNotification('Export failed: ' + e.message, true);
        }
      });

      document.getElementById('ff-clear-data')?.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete ALL fight data? This cannot be undone.')) return;
        try {
          await FightDB.clearAllData();
          showNotification('All data cleared');
          loadStatsTab(); // Reload
        } catch (e) {
          showNotification('Clear failed: ' + e.message, true);
        }
      });

    } catch (e) {
      console.error('Error loading stats:', e);
      container.innerHTML = `
        <div class="ff-empty-state">
          <p>❌ Error loading stats</p>
          <p style="font-size:0.85em;opacity:0.7">${escapeHtml(e.message)}</p>
        </div>
      `;
    }
  }

  /**
   * Formats timestamp as relative time
   */
  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    console.log('ATK Scouter v' + VERSION + ' initializing...');
    
    createSettingsUI();
    initUserState();

    // Check if on attack-related page immediately
    FightCapture.setupAttackPageObserver();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
