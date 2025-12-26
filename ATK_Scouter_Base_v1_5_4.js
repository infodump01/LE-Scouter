// ==UserScript==
// @name         ATK Scouter Base v1.5.4
// @namespace    Violentmonkey Scripts
// @match        https://www.torn.com/*
// @match        https://pda.torn.com/*
// @version      1.5.4
// @description  RSI combat analysis + fight intelligence + auto-learning
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

  const VERSION = '1.5.4';

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
    drugWeight: 0.1,
    // Bounty Sniper defaults
    sniperEnabled: false,
    sniperMinReward: 100000,
    sniperMaxLevel: 100,
    sniperRsiMin: 80,
    sniperRsiMax: 200,
    sniperShowOkay: true,
    sniperShowHospital: true,
    sniperHospitalMins: 1,
    sniperShowTraveling: false,
    sniperApiBudget: 10,
    sniperSoundAlert: false,
    sniperSortBy: 'value', // 'value', 'reward', 'rsi', 'beaten'
    sniperFetchInterval: 45
  };

  let API_KEY = Env.getValue('api_key', '');
  const settings = {
    lowHigh:    +Env.getValue('threshold_lowHigh', DEFAULTS.lowHigh),
    highMed:    +Env.getValue('threshold_highMed', DEFAULTS.highMed),
    lifeWeight: +Env.getValue('lifeWeight', DEFAULTS.lifeWeight),
    drugWeight: +Env.getValue('drugWeight', DEFAULTS.drugWeight),
    // Bounty Sniper settings
    sniperEnabled:      Env.getValue('sniperEnabled', DEFAULTS.sniperEnabled) === true || Env.getValue('sniperEnabled', DEFAULTS.sniperEnabled) === 'true',
    sniperMinReward:    +Env.getValue('sniperMinReward', DEFAULTS.sniperMinReward),
    sniperMaxLevel:     +Env.getValue('sniperMaxLevel', DEFAULTS.sniperMaxLevel),
    sniperRsiMin:       +Env.getValue('sniperRsiMin', DEFAULTS.sniperRsiMin),
    sniperRsiMax:       +Env.getValue('sniperRsiMax', DEFAULTS.sniperRsiMax),
    sniperShowOkay:     Env.getValue('sniperShowOkay', DEFAULTS.sniperShowOkay) === true || Env.getValue('sniperShowOkay', DEFAULTS.sniperShowOkay) === 'true',
    sniperShowHospital: Env.getValue('sniperShowHospital', DEFAULTS.sniperShowHospital) === true || Env.getValue('sniperShowHospital', DEFAULTS.sniperShowHospital) === 'true',
    sniperHospitalMins: +Env.getValue('sniperHospitalMins', DEFAULTS.sniperHospitalMins),
    sniperShowTraveling: Env.getValue('sniperShowTraveling', DEFAULTS.sniperShowTraveling) === true || Env.getValue('sniperShowTraveling', DEFAULTS.sniperShowTraveling) === 'true',
    sniperApiBudget:    +Env.getValue('sniperApiBudget', DEFAULTS.sniperApiBudget),
    sniperSoundAlert:   Env.getValue('sniperSoundAlert', DEFAULTS.sniperSoundAlert) === true || Env.getValue('sniperSoundAlert', DEFAULTS.sniperSoundAlert) === 'true',
    sniperSortBy:       Env.getValue('sniperSortBy', DEFAULTS.sniperSortBy),
    sniperFetchInterval: +Env.getValue('sniperFetchInterval', DEFAULTS.sniperFetchInterval)
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

    /* Bounty page uses same positioning as faction pages */
    li[data-ff-bounty="1"] > div {
      position: relative !important;
      overflow: visible !important;
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

    /* Bounty Sniper Panel - Mobile Optimized & Draggable */
    .ff-sniper-panel {
      position: fixed;
      bottom: 20px;
      left: 80px;
      width: 220px;
      max-height: 220px;
      background: linear-gradient(135deg, rgba(25,25,35,0.98) 0%, rgba(15,15,25,0.98) 100%);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-size: 12px;
      color: #e0e0e0;
      overflow: hidden;
      transition: max-height 0.2s, width 0.2s, box-shadow 0.2s;
      touch-action: none;
    }
    .ff-sniper-panel.dragging {
      box-shadow: 0 8px 32px rgba(79,195,247,0.3);
      opacity: 0.95;
    }
    .ff-sniper-panel.collapsed {
      width: auto;
      min-width: 110px;
      max-height: 44px;
    }
    .ff-sniper-panel.follower {
      border-color: rgba(255,193,7,0.4);
    }
    .ff-sniper-panel.follower .ff-sniper-title::after {
      content: ' 📡';
      font-size: 10px;
    }
    .ff-sniper-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: rgba(0,0,0,0.3);
      cursor: grab;
      user-select: none;
      min-height: 44px;
      box-sizing: border-box;
    }
    .ff-sniper-header:active {
      cursor: grabbing;
    }
    .ff-sniper-header:hover {
      background: rgba(255,255,255,0.05);
    }
    .ff-sniper-title {
      font-weight: 600;
      color: #4fc3f7;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .ff-sniper-badge {
      background: #4caf50;
      color: #fff;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 700;
      min-width: 18px;
      text-align: center;
    }
    .ff-sniper-badge.empty {
      background: #666;
    }
    .ff-sniper-toggle {
      font-size: 14px;
      color: #888;
      padding: 8px;
      margin: -8px;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ff-sniper-list {
      max-height: 140px;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .ff-sniper-item {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      gap: 8px;
      min-height: 40px;
    }
    .ff-sniper-item:last-child {
      border-bottom: none;
    }
    .ff-sniper-item:hover {
      background: rgba(255,255,255,0.05);
    }
    .ff-sniper-rsi {
      font-size: 11px;
      padding: 3px 6px;
      border-radius: 4px;
      font-weight: 600;
      min-width: 36px;
      text-align: center;
    }
    .ff-sniper-rsi.low { background: rgba(76,175,80,0.3); color: #81c784; }
    .ff-sniper-rsi.med { background: rgba(255,193,7,0.3); color: #ffd54f; }
    .ff-sniper-rsi.high { background: rgba(198,40,40,0.3); color: #ef5350; }
    .ff-sniper-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
    }
    .ff-sniper-name a {
      color: #e0e0e0;
      text-decoration: none;
    }
    .ff-sniper-name a:hover {
      color: #4fc3f7;
    }
    .ff-sniper-reward {
      font-size: 11px;
      color: #81c784;
      font-weight: 600;
    }
    .ff-sniper-beaten {
      font-size: 10px;
      color: #ffd700;
    }
    .ff-sniper-atk {
      background: #c62828;
      color: #fff;
      font-size: 11px;
      padding: 6px 10px;
      border-radius: 4px;
      text-decoration: none;
      font-weight: 600;
      cursor: pointer;
      min-width: 44px;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ff-sniper-atk:hover {
      background: #e53935;
    }
    .ff-sniper-status {
      padding: 6px 10px;
      font-size: 10px;
      color: #888;
      text-align: center;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .ff-sniper-status .scanning {
      color: #4fc3f7;
    }
    .ff-sniper-status .leader {
      color: #81c784;
    }
    .ff-sniper-status .follower {
      color: #ffd54f;
    }
    
    /* Mobile-specific adjustments */
    @media (max-width: 768px) {
      .ff-sniper-panel {
        width: 200px;
        bottom: 70px;
        left: 10px;
        font-size: 13px;
      }
      .ff-sniper-panel.collapsed {
        min-width: 100px;
      }
      .ff-sniper-header {
        padding: 12px;
      }
      .ff-sniper-item {
        padding: 10px;
        min-height: 48px;
      }
      .ff-sniper-atk {
        padding: 8px 12px;
        font-size: 12px;
      }
    }

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

    /* BOUNTY PAGE SPECIFIC - tighter spacing for smaller cells */
    li[data-ff-bounty="1"] .ff-travel-icon,
    li[data-ff-bounty="1"] .ff-hospital-icon {
      top: 2px;
    }
    li[data-ff-bounty="1"] .ff-countdown-chip,
    li[data-ff-bounty="1"] .ff-loc-badge {
      bottom: 2px;
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

    /* Fight Intelligence Panel */
    #ff-intel-panel {
      margin-top: 8px;
      background: linear-gradient(135deg, rgba(30,30,40,0.95) 0%, rgba(20,20,30,0.95) 100%);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 12px 14px;
      color: #e6e6e6;
      font-size: 12px;
    }
    #ff-intel-panel .ff-intel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    #ff-intel-panel .ff-intel-title {
      font-weight: 600;
      font-size: 13px;
      color: #4fc3f7;
    }
    #ff-intel-panel .ff-intel-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    #ff-intel-panel .ff-intel-row:last-child {
      border-bottom: none;
    }
    #ff-intel-panel .ff-intel-label {
      color: #aaa;
      font-size: 11px;
    }
    #ff-intel-panel .ff-intel-value {
      font-weight: 600;
      font-size: 13px;
    }
    #ff-intel-panel .ff-intel-value.positive { color: #4caf50; }
    #ff-intel-panel .ff-intel-value.warning { color: #f9a825; }
    #ff-intel-panel .ff-intel-value.danger { color: #ef5350; }
    #ff-intel-panel .ff-intel-value.neutral { color: #90a4ae; }
    #ff-intel-panel .ff-win-chance-bar {
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    #ff-intel-panel .ff-win-chance-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    #ff-intel-panel .ff-history-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 4px;
    }
    #ff-intel-panel .ff-history-tag.win {
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
      border: 1px solid rgba(76, 175, 80, 0.3);
    }
    #ff-intel-panel .ff-history-tag.loss {
      background: rgba(239, 83, 80, 0.2);
      color: #ef5350;
      border: 1px solid rgba(239, 83, 80, 0.3);
    }
    #ff-intel-panel .ff-no-data {
      color: #666;
      font-style: italic;
      text-align: center;
      padding: 8px;
    }
    #ff-intel-panel .ff-confidence {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      margin-left: 6px;
      background: rgba(255,255,255,0.1);
      color: #888;
    }
    #ff-intel-panel .ff-confidence.high {
      background: rgba(76, 175, 80, 0.15);
      color: #81c784;
    }
    #ff-intel-panel .ff-confidence.medium {
      background: rgba(255, 193, 7, 0.15);
      color: #ffd54f;
    }
    #ff-intel-panel .ff-confidence.low {
      background: rgba(158, 158, 158, 0.15);
      color: #9e9e9e;
    }

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
      color: #e0e0e0;
    }
    .ff-calibration-table th,
    .ff-calibration-table td {
      padding: 6px 8px;
      text-align: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      color: #e0e0e0;
    }
    .ff-calibration-table th {
      color: #aaa;
      font-weight: 600;
    }
    .ff-calibration-table td {
      color: #ccc;
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
      color: #ccc;
    }
    .ff-fight-row:hover {
      background: rgba(255,255,255,0.03);
    }
    .ff-fight-row span {
      color: #ccc;
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

    /**
     * Gets win rate for a specific RSI value (finds the appropriate bucket)
     * Returns: { winRate, totalFights, wins, losses, confidence }
     */
    async function getWinRateForRSI(rsiValue) {
      const fights = await getAllFights();
      
      // Find fights in a range around this RSI (±15%)
      const margin = 15;
      const lower = rsiValue - margin;
      const upper = rsiValue + margin;
      
      let wins = 0, losses = 0, total = 0;
      
      for (const fight of fights) {
        const rsi = fight.rsiAdjusted || fight.rsiRaw;
        if (rsi === null || rsi === undefined) continue;
        
        if (rsi >= lower && rsi < upper) {
          total++;
          if (fight.outcome === 'win') wins++;
          else if (fight.outcome === 'loss') losses++;
        }
      }
      
      // Determine confidence level
      let confidence = 'none';
      if (total >= 20) confidence = 'high';
      else if (total >= 10) confidence = 'medium';
      else if (total >= 3) confidence = 'low';
      
      return {
        winRate: total > 0 ? (wins / total) * 100 : null,
        totalFights: total,
        wins,
        losses,
        confidence,
        rsiRange: `${Math.round(lower)}-${Math.round(upper)}%`
      };
    }

    /**
     * Auto-update learned RSI parameters when a fight is logged
     * Uses online logistic regression update
     */
    function updateLearnedRSI(rsiValue, isWin) {
      try {
        // Get current parameters
        let theta0 = Number(Env.getValue('ff_lrsi_theta0', 0));
        let theta1 = Number(Env.getValue('ff_lrsi_theta1', 0.12));
        let hist = Env.getValue('ff_lrsi_hist', []) || [];
        
        // Add to history
        const xRaw = rsiValue - 100; // Center around 100%
        const y = isWin ? 1 : 0;
        hist.push({ x: xRaw, y, ts: Date.now() });
        
        // Keep only last 500 entries
        if (hist.length > 500) {
          hist = hist.slice(-500);
        }
        
        // Perform gradient descent update (learning rate = 0.01)
        const lr = 0.01;
        const pWin = 1 / (1 + Math.exp(-(theta0 + theta1 * xRaw)));
        const error = y - pWin;
        
        theta0 += lr * error;
        theta1 += lr * error * xRaw;
        
        // Clamp theta1 to reasonable bounds
        theta1 = Math.max(0.01, Math.min(0.5, theta1));
        
        // Save updated parameters
        Env.setValue('ff_lrsi_theta0', theta0);
        Env.setValue('ff_lrsi_theta1', theta1);
        Env.setValue('ff_lrsi_hist', hist);
        Env.setValue('ff_lrsi_meta', { n: hist.length, ts: Date.now() });
        
        console.log(`Win Chance model updated: θ0=${theta0.toFixed(4)}, θ1=${theta1.toFixed(4)}, n=${hist.length}`);
        
        return { theta0, theta1, historyLength: hist.length };
      } catch (e) {
        console.error('FightDB: Error updating learned RSI', e);
        return null;
      }
    }

    /**
     * Gets learned RSI win probability for a given RSI value
     */
    function getLearnedWinProbability(rsiValue) {
      const theta0 = Number(Env.getValue('ff_lrsi_theta0', 0));
      const theta1 = Number(Env.getValue('ff_lrsi_theta1', 0.12));
      const hist = Env.getValue('ff_lrsi_hist', []) || [];
      
      const xRaw = rsiValue - 100;
      const pWin = 1 / (1 + Math.exp(-(theta0 + theta1 * xRaw)));
      
      return {
        probability: pWin * 100,
        theta0,
        theta1,
        dataPoints: hist.length,
        confidence: hist.length >= 50 ? 'high' : hist.length >= 20 ? 'medium' : hist.length >= 5 ? 'low' : 'none'
      };
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
      isAvailable,
      getWinRateForRSI,
      updateLearnedRSI,
      getLearnedWinProbability
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
        
        // Auto-update learned RSI if we have RSI data
        if (fightRecord.rsiAdjusted || fightRecord.rsiRaw) {
          const rsiValue = fightRecord.rsiAdjusted || fightRecord.rsiRaw;
          const isWin = outcome === 'win';
          FightDB.updateLearnedRSI(rsiValue, isWin);
          console.log('FightCapture: Auto-updated Win Chance model with', { rsiValue, isWin });
        }
        
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

    // Start Bounty Sniper if enabled
    if (settings.sniperEnabled && API_KEY) {
      // Small delay to let page settle
      setTimeout(() => {
        BountySniper.start();
      }, 2000);
    }
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

      // Win Chance model: logistic regression on RSI
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
      summary.textContent = 'RSI+ Details';
      summary.style.cssText = 'cursor:pointer;color:#e6e6e6;font-weight:600;font-size:12px;';
      wrap.appendChild(summary);

      const div = document.createElement('div');
      div.innerHTML = `
        <div style="margin-top:6px;font-size:12px;line-height:1.35">
          <div style="margin-bottom:6px;">
            <b>Adjusted RSI:</b> ${adj.toFixed(2)}%
            <span style="margin-left:10px;"><b>Win Chance (Learned):</b> <span id="ff-lrsi-value">${(pWin * 100).toFixed(1)}%</span></span>
            <span id="ff-lrsi-msg" class="ff-note"></span>
          </div>
          <div class="ff-lrsi-controls">
            <b>Learning controls:</b>
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

    wrap.querySelector('#ff-refit')?.addEventListener('click', async () => {
      try {
        // Pull fights from IndexedDB instead of old manual log
        const fights = await FightDB.getAllFights();
        
        if (!fights || fights.length === 0) {
          flash('no fights in database');
          return;
        }
        
        // Convert fights to learning format
        const samples = [];
        for (const fight of fights) {
          const rsi = fight.rsiAdjusted || fight.rsiRaw;
          if (rsi === null || rsi === undefined) continue;
          if (fight.outcome !== 'win' && fight.outcome !== 'loss') continue;
          
          samples.push({
            x: rsi - 100, // Center around 100%
            y: fight.outcome === 'win' ? 1 : 0,
            ts: fight.capturedAt || Date.now()
          });
        }
        
        if (samples.length === 0) {
          flash('no fights with RSI data');
          return;
        }
        
        // Refit using the converted samples
        const fitted = refit(samples);
        
        // Also save samples to the learning history
        Env.setValue('ff_lrsi_hist', samples);
        Env.setValue('ff_lrsi_meta', { n: samples.length, ts: Date.now() });
        
        refreshAll();
        flash(fitted ? `re-fit from ${samples.length} fights: θ0=${fitted.t0.toFixed(3)}, θ1=${fitted.t1.toFixed(3)}` : 'fit failed');
      } catch (e) {
        console.error('Re-fit error:', e);
        flash('error: ' + e.message);
      }
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
  // FIGHT INTELLIGENCE PANEL
  // ============================================================================

  async function buildFightIntelPanel(headerEl, opponentId, opponentName, currentRSI) {
    try {
      // Don't duplicate
      if (document.getElementById('ff-intel-panel')) return;
      
      // Get data from database
      const [opponentHistory, winRateData, learnedData] = await Promise.all([
        FightDB.getOpponentHistory(opponentId),
        FightDB.getWinRateForRSI(currentRSI),
        Promise.resolve(FightDB.getLearnedWinProbability(currentRSI))
      ]);
      
      // Calculate opponent-specific stats
      const oppWins = opponentHistory.filter(f => f.outcome === 'win').length;
      const oppLosses = opponentHistory.filter(f => f.outcome === 'loss').length;
      const oppTotal = opponentHistory.length;
      
      // Determine win chance data
      const hasLearnedData = learnedData.dataPoints >= 5;
      const hasHistoricalData = winRateData.totalFights >= 3;
      
      let winChance = null;
      let confidenceClass = 'none';
      let confidenceShort = '';
      
      if (hasLearnedData && learnedData.confidence !== 'none') {
        winChance = learnedData.probability;
        confidenceClass = learnedData.confidence;
        confidenceShort = learnedData.confidence === 'high' ? '✓' : learnedData.confidence === 'medium' ? '📊' : '⚠️';
      } else if (hasHistoricalData) {
        winChance = winRateData.winRate;
        confidenceClass = winRateData.confidence;
        confidenceShort = winRateData.confidence === 'high' ? '✓' : winRateData.confidence === 'medium' ? '📊' : '⚠️';
      }
      
      // Build summary line for collapsed state
      let summaryParts = [];
      
      // Win chance summary
      if (winChance !== null) {
        const wcColor = winChance >= 70 ? '#4caf50' : winChance >= 50 ? '#f9a825' : '#ef5350';
        summaryParts.push(`<span style="color:${wcColor};font-weight:600;">${winChance.toFixed(0)}%</span> win ${confidenceShort}`);
      } else {
        summaryParts.push('<span style="color:#666;">No prediction</span>');
      }
      
      // Opponent history summary
      if (oppTotal > 0) {
        const histColor = oppWins > oppLosses ? '#4caf50' : oppLosses > oppWins ? '#ef5350' : '#90a4ae';
        summaryParts.push(`<span style="color:${histColor};">${oppWins}W-${oppLosses}L</span> vs ${escapeHtml(opponentName || 'them')}`);
      } else {
        summaryParts.push(`<span style="color:#666;">Never fought</span>`);
      }
      
      // Create collapsible panel
      const panel = document.createElement('details');
      panel.id = 'ff-intel-panel';
      panel.style.cssText = 'margin-top:6px;background:linear-gradient(135deg,rgba(30,30,40,0.92) 0%,rgba(20,20,30,0.92) 100%);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:12px;color:#e6e6e6;';
      
      // Summary header (always visible)
      const summary = document.createElement('summary');
      summary.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;list-style:none;';
      summary.innerHTML = `
        <span style="color:#4fc3f7;font-weight:600;">⚔️ Intel</span>
        <span style="color:#888;">—</span>
        ${summaryParts.join(' <span style="color:#444;margin:0 4px;">·</span> ')}
      `;
      panel.appendChild(summary);
      
      // Expanded content container
      const content = document.createElement('div');
      content.style.cssText = 'padding:0 12px 10px 12px;border-top:1px solid rgba(255,255,255,0.08);';
      
      let contentHtml = '';
      
      // Win Chance Section (only if data exists)
      if (winChance !== null) {
        let valueClass = winChance >= 70 ? 'positive' : winChance >= 50 ? 'warning' : 'danger';
        let barColor = winChance >= 70 ? '#4caf50' : winChance >= 50 ? '#f9a825' : '#ef5350';
        
        let confidenceNote = '';
        if (confidenceClass === 'low') {
          confidenceNote = '⚠️ Low confidence — need more fights';
        } else if (confidenceClass === 'medium') {
          confidenceNote = '📊 Medium confidence';
        } else if (confidenceClass === 'high') {
          confidenceNote = '✓ High confidence';
        }
        
        const dataPointsLabel = hasLearnedData ? `${learnedData.dataPoints} fights` : `${winRateData.totalFights} similar`;
        
        contentHtml += `
          <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="color:#aaa;font-size:11px;">Est. Win Chance</span>
              <span style="font-weight:600;color:${barColor};">${winChance.toFixed(1)}%</span>
            </div>
            <div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(winChance, 100)}%;background:${barColor};border-radius:3px;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#666;">
              <span>${dataPointsLabel}</span>
              <span>${confidenceNote}</span>
            </div>
          </div>
        `;
      }
      
      // Historical Win Rate (only show if different from learned data source AND has data)
      if (hasHistoricalData && hasLearnedData) {
        let wrColor = winRateData.winRate >= 70 ? '#4caf50' : winRateData.winRate >= 50 ? '#f9a825' : '#ef5350';
        contentHtml += `
          <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#aaa;font-size:11px;">At RSI ${winRateData.rsiRange}</span>
            <span style="color:${wrColor};font-weight:600;">${winRateData.wins}W ${winRateData.losses}L</span>
          </div>
        `;
      }
      
      // Opponent History Section (only if fought before)
      if (oppTotal > 0) {
        let recordColor = oppWins > oppLosses ? '#4caf50' : oppLosses > oppWins ? '#ef5350' : '#90a4ae';
        
        const recentFights = opponentHistory
          .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))
          .slice(0, 5);
        
        let tagsHtml = recentFights.map(f => {
          const cls = f.outcome === 'win' ? 'background:rgba(76,175,80,0.2);color:#4caf50;border:1px solid rgba(76,175,80,0.3);' 
                    : f.outcome === 'loss' ? 'background:rgba(239,83,80,0.2);color:#ef5350;border:1px solid rgba(239,83,80,0.3);' 
                    : 'background:rgba(158,158,158,0.2);color:#9e9e9e;';
          const txt = f.outcome === 'win' ? 'W' : f.outcome === 'loss' ? 'L' : '?';
          return `<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600;${cls}">${txt}</span>`;
        }).join('');
        
        let lastFightInfo = '';
        if (recentFights[0]) {
          const timeAgo = formatTimeAgo(recentFights[0].capturedAt);
          lastFightInfo = `<span style="font-size:10px;color:#666;margin-left:8px;">Last: ${timeAgo}</span>`;
        }
        
        contentHtml += `
          <div style="padding:8px 0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="color:#aaa;font-size:11px;">vs ${escapeHtml(opponentName || 'this player')}</span>
              <span style="color:${recordColor};font-weight:600;">${oppWins}W - ${oppLosses}L</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              ${tagsHtml}
              ${lastFightInfo}
            </div>
          </div>
        `;
      }
      
      // If no meaningful expanded content, show a minimal message
      if (!contentHtml) {
        contentHtml = `
          <div style="padding:10px 0;text-align:center;color:#666;font-style:italic;">
            Fight opponents to build intelligence data
          </div>
        `;
      }
      
      content.innerHTML = contentHtml;
      panel.appendChild(content);
      
      // Insert after the h4 header (or after RSI+ panel if it exists)
      const rsiPlusPanel = document.getElementById('ff-exp-panel');
      if (rsiPlusPanel) {
        rsiPlusPanel.after(panel);
      } else {
        headerEl.after(panel);
      }
      
    } catch (e) {
      console.error('FightIntel: Error building panel', e);
    }
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

    ApiManager.get(`/user/${userId}?selections=personalstats,basic,profile`, async (o) => {
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
      
      // Build Fight Intelligence panel
      buildFightIntelPanel(h, parseInt(userId, 10), o.name || o.basic?.name, pct);
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
  // BOUNTY PAGE INJECTION
  // ============================================================================

  function injectBountyItem(listItem) {
    if (listItem.getAttribute('data-ff-bounty') === '1') return;
    listItem.setAttribute('data-ff-bounty', '1');

    // Find the profile link (target name)
    const profileLink = listItem.querySelector('a[href*="profiles.php?XID="]');
    if (!profileLink) return;

    const userIdMatch = profileLink.href.match(/XID=(\d+)/);
    if (!userIdMatch) return;
    const userId = userIdMatch[1];

    // Find the cell/container that holds the name - this becomes our positioning parent
    // On bounty page, the structure is: li > div.target_left > a
    let container = profileLink.parentElement;
    
    // Make container a positioning context (like honor-text-wrap on faction pages)
    container.style.position = 'relative';
    container.style.overflow = 'visible';

    ApiManager.get(`/user/${userId}?selections=personalstats,basic,profile`, d => {
      if (!d) return;

      // Clear existing indicators from this container
      container.querySelectorAll('.ff-list-arrow-img, .ff-travel-icon, .ff-hospital-icon, .ff-loc-badge, .ff-countdown-chip')
        .forEach(el => el.remove());

      const rsi = calcRSI(USER_BP, d.personalstats, d.basic, d.life);
      const pct = parseFloat(rsi.adjusted.toFixed(2));

      const cls = rsi.adjusted < settings.lowHigh ? 'high'
        : rsi.adjusted < settings.highMed ? 'med'
        : 'low';

      // Position on 0-200% scale (same as faction pages)
      const pos = (100 - Math.min(rsi.adjusted, 200) / 200 * 100) + '%';

      const lifePct = d.life?.maximum
        ? Math.round((d.life.current / d.life.maximum) * 100)
        : null;

      const lastAction = d.last_action || d.profile?.last_action || d.basic?.last_action;

      // Build tooltip
      let tooltipHtml = `RSI: ${escapeHtml(pct.toFixed(2))}%`;
      if (lifePct !== null) tooltipHtml += `<br>Life: ${escapeHtml(String(lifePct))}%`;
      if (d.status?.description) tooltipHtml += `<br>Status: ${escapeHtml(d.status.description)}`;
      if (lastAction?.relative) tooltipHtml += `<br>Last action: ${escapeHtml(lastAction.relative)}`;

      // Create triangle indicator using same class as faction pages (.ff-list-arrow-img)
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

      container.appendChild(img);

      // Add status icons using the SAME function as faction pages
      addStatusIcon(d, container, userId);
    });
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
  // BOUNTY SNIPER MODULE
  // With cross-tab sync, draggable panel, and mobile optimization
  // ============================================================================

  const BountySniper = (() => {
    // State
    let isEnabled = false;
    let targets = [];  // Current sniper targets (shown in panel)
    let rsiCache = new Map();  // userId -> {rsi, timestamp}
    let beatenCache = new Map();  // userId -> {wins, losses}
    let apiCallsThisMinute = 0;
    let lastMinuteReset = Date.now();
    let scanInterval = null;
    let heartbeatInterval = null;
    let panelEl = null;
    let isCollapsed = false;
    
    // Progressive scanning state
    let cachedBounties = [];  // Full bounty list from page scraping
    let cachedCandidates = [];  // Filtered candidates awaiting API check
    let lastBountyFetch = 0;  // Timestamp of last bounty page fetch
    let scanIndex = 0;  // Current position in candidate list
    let verifiedTargets = new Map();  // userId -> bounty object (API-verified good targets)

    // Target verification
    let targetLastVerified = new Map();  // userId -> timestamp
    
    // Cross-tab sync state
    const TAB_ID = Math.random().toString(36).substr(2, 9);
    let isLeader = false;
    const LEADER_TIMEOUT = 5000;  // 5 seconds without heartbeat = leader lost
    const HEARTBEAT_INTERVAL = 2000;  // Send heartbeat every 2 seconds
    const STORAGE_KEY_TARGETS = 'ff_sniper_targets';
    const STORAGE_KEY_LEADER = 'ff_sniper_leader';
    const STORAGE_KEY_HEARTBEAT = 'ff_sniper_heartbeat';
    const STORAGE_KEY_POSITION = 'ff_sniper_position';
    const STORAGE_KEY_COLLAPSED = 'ff_sniper_collapsed';
    const STORAGE_KEY_SCAN_STATE = 'ff_sniper_scan_state';
    
    // Drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panelStartX = 0;
    let panelStartY = 0;

    const RSI_CACHE_TTL = 10 * 60 * 1000;  // 10 minutes for general cache
    const TARGET_VERIFY_TTL = 60 * 1000;  // 60 seconds - re-verify panel targets more frequently
    const BOUNTY_REFRESH_INTERVAL = 90 * 1000;  // Refresh bounty pages every 90 seconds
    const MAX_TARGETS = 5;

    // Check if a page-scraped status matches user's enabled preferences
    function statusMatchesPrefs(status) {
      if (status === 'Okay' && settings.sniperShowOkay) return true;
      if (status === 'Hospital' && settings.sniperShowHospital) return true;
      if (status === 'Traveling' && settings.sniperShowTraveling) return true;
      return false;
    }

    // =========================================================================
    // CROSS-TAB SYNC
    // =========================================================================

    // Try to become leader
    function tryBecomeLeader() {
      const now = Date.now();
      const lastHeartbeat = parseInt(localStorage.getItem(STORAGE_KEY_HEARTBEAT) || '0', 10);
      const currentLeader = localStorage.getItem(STORAGE_KEY_LEADER);
      
      // Become leader if: no leader, leader timed out, or we are already leader
      if (!currentLeader || currentLeader === TAB_ID || (now - lastHeartbeat) > LEADER_TIMEOUT) {
        localStorage.setItem(STORAGE_KEY_LEADER, TAB_ID);
        localStorage.setItem(STORAGE_KEY_HEARTBEAT, now.toString());
        
        if (!isLeader) {
          isLeader = true;
          console.log(`BountySniper: Tab ${TAB_ID} became LEADER`);
          restoreScanState();
          updatePanelRole();
        }
        return true;
      }
      
      if (isLeader) {
        isLeader = false;
        updatePanelRole();
      }
      return false;
    }

    // Send leader heartbeat
    function sendHeartbeat() {
      if (isLeader) {
        localStorage.setItem(STORAGE_KEY_HEARTBEAT, Date.now().toString());
      }
    }

    // Check if current leader is still alive
    function checkLeader() {
      const now = Date.now();
      const lastHeartbeat = parseInt(localStorage.getItem(STORAGE_KEY_HEARTBEAT) || '0', 10);
      const currentLeader = localStorage.getItem(STORAGE_KEY_LEADER);
      
      if (currentLeader === TAB_ID) {
        // We are leader, send heartbeat
        sendHeartbeat();
        return;
      }
      
      // Check if leader timed out
      if ((now - lastHeartbeat) > LEADER_TIMEOUT) {
        console.log('BountySniper: Leader timed out, trying to take over...');
        tryBecomeLeader();
      }
    }

    // Broadcast targets to other tabs
    function broadcastTargets() {
      if (!isLeader) return;
      
      const data = {
        targets: targets,
        timestamp: Date.now(),
        scanIndex: scanIndex,
        cachedCandidatesCount: cachedCandidates.length,
        progress: cachedCandidates.length > 0 ? Math.round((getCheckedCount() / cachedCandidates.length) * 100) : 0
      };
      
      localStorage.setItem(STORAGE_KEY_TARGETS, JSON.stringify(data));
    }

    // Broadcast scan state for other tabs to continue if they become leader
    function broadcastScanState() {
      if (!isLeader) return;
      
      const state = {
        scanIndex,
        lastBountyFetch,
        verifiedTargets: Array.from(verifiedTargets.entries()),
        rsiCache: Array.from(rsiCache.entries()).slice(0, 100)
      };
      
      try {
        localStorage.setItem(STORAGE_KEY_SCAN_STATE, JSON.stringify(state));
      } catch (e) {
        // localStorage full
        console.log('BountySniper: localStorage full, clearing old scan state');
      }
    }

    // Receive targets from leader tab
    function receiveTargets() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY_TARGETS) || '{}');
        if (data.targets && Array.isArray(data.targets)) {
          targets = data.targets;
          renderPanel();
          updateStatusFromSync(data);
        }
      } catch (e) {
        // Invalid data
      }
    }

    // Update status display from synced data
    function updateStatusFromSync(data) {
      if (!panelEl) return;
      const status = panelEl.querySelector('.ff-sniper-status');
      if (status && data.progress !== undefined) {
        status.innerHTML = `<span class="follower">●</span> Synced | ${data.progress}% scanned`;
      }
    }

    // Restore scan state when becoming leader
    function restoreScanState() {
      try {
        const state = JSON.parse(localStorage.getItem(STORAGE_KEY_SCAN_STATE) || '{}');
        if (state.scanIndex !== undefined) {
          scanIndex = state.scanIndex;
        }
        if (state.lastBountyFetch) {
          lastBountyFetch = state.lastBountyFetch;
        }
        if (state.verifiedTargets) {
          verifiedTargets = new Map(state.verifiedTargets);
        }
        if (state.rsiCache) {
          rsiCache = new Map(state.rsiCache);
        }
        console.log(`BountySniper: Restored scan state - index: ${scanIndex}, verified: ${verifiedTargets.size}`);
      } catch (e) {
        console.log('BountySniper: Could not restore scan state');
      }
    }

    // Listen for storage changes (other tabs updating)
    function setupStorageListener() {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_TARGETS && !isLeader) {
          receiveTargets();
        }
        if (e.key === STORAGE_KEY_LEADER) {
          // Leader changed
          const newLeader = e.newValue;
          if (newLeader !== TAB_ID && isLeader) {
            isLeader = false;
            updatePanelRole();
          }
        }
        if (e.key === STORAGE_KEY_POSITION) {
          // Position changed from another tab, apply it
          try {
            const pos = JSON.parse(e.newValue || '{}');
            if (pos.x !== undefined && pos.y !== undefined) {
              applyPosition(pos.x, pos.y);
            }
          } catch (err) {}
        }
        if (e.key === STORAGE_KEY_COLLAPSED) {
          // Collapsed state changed
          try {
            const collapsed = JSON.parse(e.newValue || 'false');
            if (isCollapsed !== collapsed) {
              isCollapsed = collapsed;
              if (panelEl) {
                panelEl.classList.toggle('collapsed', isCollapsed);
                panelEl.querySelector('.ff-sniper-toggle').textContent = isCollapsed ? '▶' : '▼';
              }
            }
          } catch (err) {}
        }
      });
    }

    // Update panel to show if leader or follower
    function updatePanelRole() {
      if (!panelEl) return;
      
      panelEl.classList.toggle('follower', !isLeader);
    }

    // =========================================================================
    // DRAG FUNCTIONALITY
    // =========================================================================

    // Get saved position or default
    function getSavedPosition() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_POSITION) || '{}');
        if (saved.x !== undefined && saved.y !== undefined) {
          return saved;
        }
      } catch (e) {}
      
      // Default position - bottom left, accounting for mobile
      const isMobile = window.innerWidth < 768;
      return {
        x: isMobile ? 10 : 80,
        y: window.innerHeight - (isMobile ? 290 : 240)
      };
    }

    // Save position to localStorage
    function savePosition(x, y) {
      try {
        localStorage.setItem(STORAGE_KEY_POSITION, JSON.stringify({ x, y }));
      } catch (e) {}
    }

    // Apply position to panel
    function applyPosition(x, y) {
      if (!panelEl) return;
      
      // Bounds checking
      const rect = panelEl.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 10;
      const maxY = window.innerHeight - rect.height - 10;
      
      x = Math.max(10, Math.min(x, maxX));
      y = Math.max(10, Math.min(y, maxY));
      
      panelEl.style.left = x + 'px';
      panelEl.style.top = y + 'px';
      panelEl.style.bottom = 'auto';
      panelEl.style.right = 'auto';
    }

    // Handle drag start (mouse)
    function onMouseDown(e) {
      // Only drag from header, not toggle button
      if (e.target.closest('.ff-sniper-toggle')) return;
      if (!e.target.closest('.ff-sniper-header')) return;
      
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      moveDrag(e.clientX, e.clientY);
    }

    function onMouseUp() {
      endDrag();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    // Handle drag start (touch)
    function onTouchStart(e) {
      // Only drag from header, not toggle button
      if (e.target.closest('.ff-sniper-toggle')) return;
      if (!e.target.closest('.ff-sniper-header')) return;
      
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
    }

    function onTouchMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      const touch = e.touches[0];
      moveDrag(touch.clientX, touch.clientY);
    }

    function onTouchEnd() {
      endDrag();
    }

    // Common drag functions
    function startDrag(clientX, clientY) {
      isDragging = true;
      dragStartX = clientX;
      dragStartY = clientY;
      
      const rect = panelEl.getBoundingClientRect();
      panelStartX = rect.left;
      panelStartY = rect.top;
      
      panelEl.classList.add('dragging');
    }

    function moveDrag(clientX, clientY) {
      const deltaX = clientX - dragStartX;
      const deltaY = clientY - dragStartY;
      
      applyPosition(panelStartX + deltaX, panelStartY + deltaY);
    }

    function endDrag() {
      if (!isDragging) return;
      
      isDragging = false;
      panelEl.classList.remove('dragging');
      
      // Save position
      const rect = panelEl.getBoundingClientRect();
      savePosition(rect.left, rect.top);
    }

    // Reset position on double-click
    function onDoubleClick(e) {
      if (!e.target.closest('.ff-sniper-header')) return;
      if (e.target.closest('.ff-sniper-toggle')) return;
      
      // Reset to default position
      localStorage.removeItem(STORAGE_KEY_POSITION);
      const pos = getSavedPosition();
      applyPosition(pos.x, pos.y);
      savePosition(pos.x, pos.y);
    }

    // Setup all drag event listeners
    function setupDragListeners() {
      if (!panelEl) return;
      
      // Mouse events
      panelEl.addEventListener('mousedown', onMouseDown);
      
      // Touch events
      panelEl.addEventListener('touchstart', onTouchStart, { passive: true });
      panelEl.addEventListener('touchmove', onTouchMove, { passive: false });
      panelEl.addEventListener('touchend', onTouchEnd);
      
      // Double-click to reset
      panelEl.addEventListener('dblclick', onDoubleClick);
    }

    // Parse bounty data from HTML string
    function parseBountyHtml(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bounties = [];

      // Debug: log what we're working with
      const allLis = doc.querySelectorAll('li');
      console.log('BountySniper: Found', allLis.length, 'list items in HTML');

      // Try multiple selectors for bounty rows
      const selectors = [
        'ul.bounties-list > li',
        'ul[class*="bounty"] > li',
        '.bounties-wrap li',
        'li[class*="bounty"]',
        'li'  // fallback to all li elements
      ];

      let foundItems = [];
      for (const sel of selectors) {
        const items = doc.querySelectorAll(sel);
        if (items.length > 0) {
          console.log('BountySniper: Selector', sel, 'matched', items.length, 'items');
          // Only use this selector if it found items with profile links
          const withLinks = Array.from(items).filter(li => li.querySelector('a[href*="profiles.php?XID="]'));
          if (withLinks.length > 0) {
            foundItems = withLinks;
            break;
          }
        }
      }

      console.log('BountySniper: Processing', foundItems.length, 'items with profile links');

      foundItems.forEach(li => {
        const profileLink = li.querySelector('a[href*="profiles.php?XID="]');
        if (!profileLink) return;

        const userIdMatch = profileLink.href.match(/XID=(\d+)/);
        if (!userIdMatch) return;

        const userId = userIdMatch[1];
        const name = profileLink.textContent.trim();

        // Extract level - look for the level column
        let level = 0;
        const levelEl = li.querySelector('[class*="level"]') || li.querySelector('div:nth-child(3)');
        if (levelEl) {
          const levelMatch = levelEl.textContent.match(/(\d+)/);
          if (levelMatch) level = parseInt(levelMatch[1], 10);
        }
        // Fallback: search all text for a standalone number that looks like level
        if (!level) {
          const allText = li.textContent;
          const matches = allText.match(/\b([1-9]\d?|100)\b/g);
          if (matches && matches.length > 0) {
            // Usually level is a small number, pick first reasonable one
            for (const m of matches) {
              const n = parseInt(m, 10);
              if (n >= 1 && n <= 100) { level = n; break; }
            }
          }
        }

        // Extract reward
        let reward = 0;
        const rewardEl = li.querySelector('[class*="reward"]') || li.querySelector('div:first-child');
        if (rewardEl) {
          const rewardText = rewardEl.textContent.replace(/[,$]/g, '');
          const rewardMatch = rewardText.match(/([\d,]+)/);
          if (rewardMatch) reward = parseInt(rewardMatch[1].replace(/,/g, ''), 10);
        }
        // Fallback: search for dollar amounts
        if (!reward) {
          const dollarMatch = li.textContent.match(/\$?([\d,]+)/);
          if (dollarMatch) reward = parseInt(dollarMatch[1].replace(/,/g, ''), 10);
        }

        // Extract status - look for status column/link
        let status = 'Okay';
        let hospitalTime = null;  // null = unknown, 0 = just released, >0 = time remaining in minutes
        
        // Look for status link/text
        const statusLink = li.querySelector('a[href*="hospitalview"]');
        const travelingLink = li.querySelector('a[href*="travelagency"], a[class*="traveling"], a[class*="abroad"]');
        const statusEl = li.querySelector('[class*="status"]');
        const liText = li.textContent;
        
        if (statusLink || /hospital/i.test(liText)) {
          status = 'Hospital';
          // Try to extract hospital time - formats: "HH:MM:SS" or "MM:SS" or "X hrs Y mins" etc.
          const timePatterns = [
            /(\d+):(\d+):(\d+)/,  // HH:MM:SS
            /(\d+):(\d+)/,        // MM:SS
            /(\d+)\s*h(?:r|our)?s?\s*(\d+)?\s*m/i,  // "X hrs Y mins"
            /(\d+)\s*m(?:in)?s?/i  // "X mins"
          ];
          
          for (const pattern of timePatterns) {
            const match = liText.match(pattern);
            if (match) {
              if (match[3] !== undefined) {
                // HH:MM:SS format
                hospitalTime = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + (parseInt(match[3], 10) / 60);
              } else if (match[2] !== undefined && match[0].includes(':')) {
                // MM:SS format
                hospitalTime = parseInt(match[1], 10) + (parseInt(match[2], 10) / 60);
              } else if (match[2] !== undefined) {
                // X hrs Y mins format
                hospitalTime = parseInt(match[1], 10) * 60 + (parseInt(match[2], 10) || 0);
              } else {
                // Just minutes
                hospitalTime = parseInt(match[1], 10);
              }
              break;
            }
          }
          
          // If we couldn't parse time, assume they're in for a while
          if (hospitalTime === null) hospitalTime = 999;
          
        } else if (travelingLink || /travel|abroad|flying/i.test(liText)) {
          status = 'Traveling';
        }

        bounties.push({
          id: userId,
          userId,
          name,
          level,
          reward,
          status,
          hospitalTime,
          rsi: null,
          beaten: null,
          valueScore: 0
        });
      });

      return bounties;
    }

    // Parse bounties from current page DOM (when on bounty page)
    function parseBountyDOM() {
      const bounties = [];

      // More comprehensive selectors for bounty rows
      const rows = document.querySelectorAll('ul.bounties-list > li, [class*="bounties"] li, ul.item > li');
      
      console.log('BountySniper: Found', rows.length, 'potential bounty rows');

      rows.forEach(li => {
        const profileLink = li.querySelector('a[href*="profiles.php?XID="]');
        if (!profileLink) return;

        const userIdMatch = profileLink.href.match(/XID=(\d+)/);
        if (!userIdMatch) return;

        const userId = userIdMatch[1];
        const name = profileLink.textContent.trim();
        const liText = li.textContent;

        // Get data from table cells
        const cells = li.querySelectorAll('div');
        let level = 0, reward = 0;

        cells.forEach(cell => {
          const text = cell.textContent.trim();
          
          // Check for reward (has $ or large number)
          if (/^\$?[\d,]+$/.test(text.replace(/,/g, ''))) {
            const num = parseInt(text.replace(/[$,]/g, ''), 10);
            if (num > 10000) reward = num;
            else if (num >= 1 && num <= 100 && !level) level = num;
          }
        });

        // Check status - look for status column specifically
        let status = 'Okay';  // Default to Okay
        let hospitalTime = null;
        
        // Look for status-related elements
        const statusLink = li.querySelector('a[href*="hospitalview"]');
        const travelLink = li.querySelector('a[class*="traveling"], a[class*="abroad"]');
        const okayLink = li.querySelector('a[class*="okay"], span[class*="okay"]');
        
        // Check the STATUS column text
        const statusTexts = ['Hospital', 'Traveling', 'Abroad', 'Okay'];
        for (const cell of cells) {
          const cellText = cell.textContent.trim();
          for (const st of statusTexts) {
            if (cellText.toLowerCase() === st.toLowerCase()) {
              if (st === 'Hospital') {
                status = 'Hospital';
              } else if (st === 'Traveling' || st === 'Abroad') {
                status = 'Traveling';
              } else if (st === 'Okay') {
                status = 'Okay';
              }
              break;
            }
          }
        }
        
        // Fallback detection
        if (statusLink) {
          status = 'Hospital';
        } else if (travelLink) {
          status = 'Traveling';
        }
        
        // Parse hospital time if applicable
        if (status === 'Hospital') {
          const timePatterns = [
            /(\d+):(\d+):(\d+)/,  // HH:MM:SS
            /(\d+):(\d+)/         // MM:SS or HH:MM
          ];
          
          for (const pattern of timePatterns) {
            const match = liText.match(pattern);
            if (match) {
              if (match[3] !== undefined) {
                hospitalTime = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
              } else {
                const first = parseInt(match[1], 10);
                const second = parseInt(match[2], 10);
                hospitalTime = first * 60 + second;  // Assume HH:MM
              }
              break;
            }
          }
          if (hospitalTime === null) hospitalTime = 999;  // Unknown, assume long
        }

        // Get level from specific position if available
        const lvlCell = li.querySelector('[class*="lvl"], [class*="level"]');
        if (lvlCell) {
          const m = lvlCell.textContent.match(/(\d+)/);
          if (m) level = parseInt(m[1], 10);
        }

        bounties.push({
          id: userId,
          userId,
          name,
          level,
          reward,
          status,
          hospitalTime,
          rsi: null,
          beaten: null,
          valueScore: 0
        });
      });

      // Log status breakdown
      const statusCounts = { Okay: 0, Hospital: 0, Traveling: 0 };
      bounties.forEach(b => statusCounts[b.status] = (statusCounts[b.status] || 0) + 1);
      console.log('BountySniper: Status breakdown:', statusCounts);

      return bounties;
    }

    // Fetch bounty data using hidden iframe (needed because TORN uses React/SPA)
    // Scans multiple pages and uses "Hide Unavailable" filter
    async function fetchBountyPage() {
      const MAX_PAGES_TO_SCAN = 10;  // Scan up to 10 pages to find good targets
      const BOUNTIES_PER_PAGE = 20;  // TORN shows 20 bounties per page
      const allBounties = [];
      const seenIds = new Set();

      for (let page = 1; page <= MAX_PAGES_TO_SCAN; page++) {
        console.log(`BountySniper: Loading page ${page}/${MAX_PAGES_TO_SCAN}...`);
        updateStatus(`Loading page ${page}/${MAX_PAGES_TO_SCAN}...`);
        
        try {
          const pageBounties = await fetchBountyPageSingle(page);
          
          // Add unique bounties
          let newCount = 0;
          for (const b of pageBounties) {
            if (!seenIds.has(b.id)) {
              seenIds.add(b.id);
              allBounties.push(b);
              newCount++;
            }
          }
          
          console.log(`BountySniper: Page ${page} found ${pageBounties.length} bounties, ${newCount} new, total: ${allBounties.length}`);
          
          // If we got very few bounties, might be at end of filtered results
          if (pageBounties.length < 5) {
            console.log('BountySniper: Few results on page, stopping pagination');
            break;
          }
          
          // Small delay between page loads to not hammer server
          if (page < MAX_PAGES_TO_SCAN) {
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (err) {
          console.error(`BountySniper: Error loading page ${page}:`, err);
          break;
        }
      }

      // Log status breakdown from iframe fetching
      const statusCounts = { Okay: 0, Hospital: 0, Traveling: 0, Unknown: 0 };
      allBounties.forEach(b => {
        statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
      });
      console.log('BountySniper: Iframe total status breakdown:', statusCounts);

      return allBounties;
    }

    // Fetch a single page of bounties
    async function fetchBountyPageSingle(pageNum = 1) {
      return new Promise((resolve, reject) => {
        // Create hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1024px;height:768px;visibility:hidden;';
        
        // TORN pagination uses: #/!p=main&start=X where X = (page-1) * 20
        const start = (pageNum - 1) * 20;
        const url = `https://www.torn.com/bounties.php#/!p=main&start=${start}`;
        console.log(`BountySniper: Loading iframe URL: ${url}`);
        iframe.src = url;
        
        let resolved = false;
        let checkInterval = null;
        let clickedHideUnavailable = false;
        
        const cleanup = () => {
          if (checkInterval) clearInterval(checkInterval);
          if (iframe.parentNode) iframe.remove();
        };
        
        const tryClickHideUnavailable = (doc) => {
          if (clickedHideUnavailable) return false;
          try {
            // Look for "Hide Unavailable" checkbox and click it
            const labels = doc.querySelectorAll('label');
            for (const label of labels) {
              if (label.textContent.includes('Hide Unavailable')) {
                const checkbox = label.querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.checked) {
                  console.log('BountySniper: Clicking Hide Unavailable checkbox');
                  checkbox.click();
                  clickedHideUnavailable = true;
                  return true;  // Will need to wait for re-render
                } else if (checkbox && checkbox.checked) {
                  clickedHideUnavailable = true;  // Already checked
                }
              }
            }
            // Also try by finding any checkbox near "Hide" text
            const allCheckboxes = doc.querySelectorAll('input[type="checkbox"]');
            for (const cb of allCheckboxes) {
              const parent = cb.closest('label') || cb.parentElement;
              if (parent && /hide.*unavailable/i.test(parent.textContent)) {
                if (!cb.checked) {
                  cb.click();
                  clickedHideUnavailable = true;
                  return true;
                }
                clickedHideUnavailable = true;
              }
            }
          } catch (e) {
            console.log('BountySniper: Could not click Hide Unavailable:', e);
          }
          return false;
        };
        
        const tryParse = () => {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) return null;
            
            // Look for profile links - if found, page has rendered
            const profileLinks = doc.querySelectorAll('a[href*="profiles.php?XID="]');
            if (profileLinks.length > 0) {
              return doc;
            }
          } catch (e) {
            // Cross-origin error - shouldn't happen since same domain
          }
          return null;
        };
        
        // Timeout after 30 seconds per page
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            console.log(`BountySniper: Iframe timeout for page ${pageNum}`);
            reject(new Error('Iframe timeout'));
          }
        }, 30000);
        
        iframe.onload = () => {
          let attempts = 0;
          let waitingForRerender = false;
          
          checkInterval = setInterval(() => {
            attempts++;
            const doc = tryParse();
            
            if (doc) {
              // Try to click Hide Unavailable on first detection
              if (!clickedHideUnavailable) {
                const clicked = tryClickHideUnavailable(doc);
                if (clicked) {
                  // Wait for page to re-render after clicking
                  waitingForRerender = true;
                  attempts = 0;  // Reset attempts counter
                  return;
                }
              }
              
              // If we clicked the checkbox, wait a bit for re-render
              if (waitingForRerender && attempts < 8) {
                return;  // Wait 4 more seconds (8 * 500ms)
              }
              
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                
                // Parse bounties from iframe DOM
                const bounties = parseBountyFromDoc(doc);
                console.log(`BountySniper: Page ${pageNum} parsed ${bounties.length} bounties`);
                
                cleanup();
                resolve(bounties);
              }
            } else if (attempts > 50) {
              // Give up after 25 seconds
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                cleanup();
                console.log(`BountySniper: Page ${pageNum} content never rendered`);
                reject(new Error('Content not rendered'));
              }
            }
          }, 500);
        };
        
        iframe.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            cleanup();
            reject(new Error('Iframe load error'));
          }
        };
        
        document.body.appendChild(iframe);
      });
    }

    // Parse bounties from a document (iframe or current page)
    function parseBountyFromDoc(doc) {
      const bounties = [];

      // Find all list items with profile links
      const rows = doc.querySelectorAll('li');
      
      rows.forEach(li => {
        const profileLink = li.querySelector('a[href*="profiles.php?XID="]');
        if (!profileLink) return;

        const userIdMatch = profileLink.href.match(/XID=(\d+)/);
        if (!userIdMatch) return;

        const userId = userIdMatch[1];
        const name = profileLink.textContent.trim();
        const liText = li.textContent.toLowerCase();

        // Extract level
        let level = 0;
        const cells = li.querySelectorAll('div');
        cells.forEach(cell => {
          const text = cell.textContent.trim();
          if (/^\d+$/.test(text)) {
            const num = parseInt(text, 10);
            if (num >= 1 && num <= 100 && !level) level = num;
          }
        });

        // Extract reward
        let reward = 0;
        const rewardMatch = li.textContent.match(/\$?([\d,]+)/);
        if (rewardMatch) {
          const num = parseInt(rewardMatch[1].replace(/,/g, ''), 10);
          if (num > 10000) reward = num;
        }

        // Extract status - be very explicit about detection
        let status = 'Unknown';  // Default to Unknown, not Okay
        let hospitalTime = null;
        
        // Method 1: Look for status links
        const hospitalLink = li.querySelector('a[href*="hospitalview"], a[class*="hospital"]');
        const travelLink = li.querySelector('a[href*="abroad"], a[class*="traveling"], a[class*="abroad"]');
        const okayLink = li.querySelector('a[class*="okay"], span[class*="okay"]');
        
        // Method 2: Check for status text in cells
        for (const cell of cells) {
          const cellText = cell.textContent.trim().toLowerCase();
          if (cellText === 'hospital') {
            status = 'Hospital';
            break;
          } else if (cellText === 'traveling' || cellText === 'abroad') {
            status = 'Traveling';
            break;
          } else if (cellText === 'okay') {
            status = 'Okay';
            break;
          }
        }
        
        // Method 3: Check links if text didn't match
        if (status === 'Unknown') {
          if (hospitalLink) {
            status = 'Hospital';
          } else if (travelLink) {
            status = 'Traveling';
          } else if (okayLink) {
            status = 'Okay';
          }
        }
        
        // Method 4: Check full row text for keywords
        if (status === 'Unknown') {
          if (liText.includes('hospital')) {
            status = 'Hospital';
          } else if (liText.includes('traveling') || liText.includes('abroad')) {
            status = 'Traveling';
          } else if (liText.includes('okay')) {
            status = 'Okay';
          }
        }
        
        // Parse hospital time if applicable
        if (status === 'Hospital') {
          const timeMatch = li.textContent.match(/(\d+):(\d+):(\d+)/);
          if (timeMatch) {
            hospitalTime = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
          } else {
            hospitalTime = 999;  // Unknown, assume long
          }
        }

        bounties.push({
          id: userId,
          userId,
          name,
          level,
          reward,
          status,
          hospitalTime,
          rsi: null,
          beaten: null,
          valueScore: 0
        });
      });

      // Log status breakdown for this page
      const statusCounts = { Okay: 0, Hospital: 0, Traveling: 0, Unknown: 0 };
      bounties.forEach(b => statusCounts[b.status] = (statusCounts[b.status] || 0) + 1);
      console.log('BountySniper: Page status breakdown:', statusCounts);

      return bounties;
    }

    // Check if we've beaten this player before
    async function checkBeatenStatus(userId) {
      if (beatenCache.has(userId)) {
        return beatenCache.get(userId);
      }

      try {
        const history = await FightDB.getOpponentHistory(userId);
        const wins = history.filter(f => f.outcome === 'win').length;
        const losses = history.filter(f => f.outcome === 'loss').length;
        const result = { wins, losses, total: history.length };
        beatenCache.set(userId, result);
        return result;
      } catch (e) {
        return { wins: 0, losses: 0, total: 0 };
      }
    }

    // Get RSI from cache or fetch - also returns status info
    async function getRsi(userId) {
      const cached = rsiCache.get(userId);
      if (cached && (Date.now() - cached.timestamp) < RSI_CACHE_TTL) {
        return cached.rsi;
      }

      // Check API budget
      if (!canUseApi()) {
        return null;
      }

      return new Promise((resolve) => {
        apiCallsThisMinute++;
        ApiManager.get(`/user/${userId}?selections=personalstats,basic,profile`, d => {
          if (!d) {
            resolve(null);
            return;
          }
          const rsi = calcRSI(USER_BP, d.personalstats, d.basic, d.life);
          
          // Extract status info including hospital time
          const stateStr = d.status?.state || 'Okay';
          let statusInfo = {
            state: stateStr,
            until: d.status?.until || 0,
            description: d.status?.description || ''
          };
          
          // Normalize status - API returns various strings
          let normalizedStatus = 'Okay';
          if (/hospital/i.test(stateStr)) {
            normalizedStatus = 'Hospital';
          } else if (/traveling|abroad|flying/i.test(stateStr)) {
            normalizedStatus = 'Traveling';
          } else if (/okay|online|offline|idle/i.test(stateStr)) {
            normalizedStatus = 'Okay';
          }
          
          // Calculate hospital time remaining in minutes
          let hospitalMins = null;
          if (normalizedStatus === 'Hospital' && statusInfo.until) {
            const remainingMs = (statusInfo.until * 1000) - Date.now();
            hospitalMins = Math.max(0, remainingMs / 60000);
          }
          
          const result = {
            adjusted: rsi.adjusted,
            raw: rsi.raw,
            life: d.life?.maximum ? Math.round((d.life.current / d.life.maximum) * 100) : 100,
            status: normalizedStatus,
            hospitalTime: hospitalMins,
            statusDescription: statusInfo.description
          };
          
          console.log(`BountySniper: API status for ${d.name || userId}: ${stateStr} -> ${normalizedStatus}`);
          
          rsiCache.set(userId, { rsi: result, timestamp: Date.now() });
          resolve(result);
        });
      });
    }

    // Check if we can make an API call within budget
    function canUseApi() {
      // Reset counter every minute
      if (Date.now() - lastMinuteReset > 60000) {
        apiCallsThisMinute = 0;
        lastMinuteReset = Date.now();
      }
      return apiCallsThisMinute < settings.sniperApiBudget;
    }

    // Calculate value score for a bounty
    function calculateValueScore(bounty) {
      // Base score from reward (normalized to 0-100)
      const rewardScore = Math.min(bounty.reward / 1000000, 1) * 40;  // Max 40 points for $1M+

      // RSI score (higher RSI = easier = better)
      let rsiScore = 0;
      if (bounty.rsi) {
        // RSI 100 = 50% win, RSI 150 = ~90% win, RSI 200+ = 100% win
        const winProb = Math.min(bounty.rsi.adjusted / 150, 1);
        rsiScore = winProb * 30;  // Max 30 points
      }

      // Beaten bonus
      let beatenScore = 0;
      if (bounty.beaten && bounty.beaten.wins > 0) {
        const winRate = bounty.beaten.wins / (bounty.beaten.total || 1);
        beatenScore = winRate * 20;  // Max 20 points
      }

      // Status penalty
      let statusPenalty = 0;
      if (bounty.status === 'Hospital') statusPenalty = 5;
      if (bounty.status === 'Traveling') statusPenalty = 15;

      return rewardScore + rsiScore + beatenScore - statusPenalty;
    }

    // Apply filters to bounty list
    // Pass 1 (strictHospitalFilter=false): Only filter by reward/level, let all statuses through for API verification
    // Pass 2 (strictHospitalFilter=true): Apply full status filters after API verification
    function filterBounties(bounties, strictHospitalFilter = false) {
      return bounties.filter(b => {
        // Reward filter - always apply
        if (b.reward < settings.sniperMinReward) return false;

        // Level filter - always apply
        if (b.level > settings.sniperMaxLevel && b.level > 0) return false;

        // RSI filter - only if we have RSI data
        if (b.rsi) {
          if (b.rsi.adjusted < settings.sniperRsiMin) return false;
          if (b.rsi.adjusted > settings.sniperRsiMax) return false;
        }

        // STATUS FILTERS - Only apply in strict mode (after API verification)
        // Page-scraped status is unreliable, so we let everything through initially
        if (!strictHospitalFilter) {
          // Non-strict mode: let all statuses through for API verification
          // Only filter out if we KNOW it's bad (has API data already)
          if (b.rsi && b.rsi.status) {
            // We have API-verified status, can apply some filters
            if (b.rsi.status === 'Traveling' && !settings.sniperShowTraveling) {
              return false;
            }
          }
          return true;
        }

        // STRICT MODE - Apply full status filters (after API verification)
        
        // Unknown status after API check = filter out
        if (b.status === 'Unknown') {
          console.log(`BountySniper: Filtering out ${b.name} - unknown status`);
          return false;
        }
        
        // Okay status
        if (b.status === 'Okay') {
          if (!settings.sniperShowOkay) {
            console.log(`BountySniper: Filtering out ${b.name} - okay (setting disabled)`);
            return false;
          }
        }
        
        // Hospital status
        if (b.status === 'Hospital') {
          if (!settings.sniperShowHospital) {
            console.log(`BountySniper: Filtering out ${b.name} - hospital (setting disabled)`);
            return false;
          }
          // Hospital time filter
          if (b.hospitalTime !== null && b.hospitalTime > settings.sniperHospitalMins) {
            console.log(`BountySniper: Filtering out ${b.name} - hospital time ${b.hospitalTime.toFixed(1)} mins > ${settings.sniperHospitalMins} threshold`);
            return false;
          }
          // If we still don't have hospital time after API check, filter out
          if (b.hospitalTime === null || b.hospitalTime === 999) {
            console.log(`BountySniper: Filtering out ${b.name} - hospital time unknown`);
            return false;
          }
        }
        
        // Traveling status
        if (b.status === 'Traveling') {
          if (!settings.sniperShowTraveling) {
            console.log(`BountySniper: Filtering out ${b.name} - traveling (setting disabled)`);
            return false;
          }
        }

        return true;
      });
    }

    // Sort targets based on user preference
    function sortTargets(targets) {
      const sortBy = settings.sniperSortBy;
      return targets.sort((a, b) => {
        switch (sortBy) {
          case 'reward':
            return b.reward - a.reward;
          case 'rsi':
            return (b.rsi?.adjusted || 0) - (a.rsi?.adjusted || 0);
          case 'beaten':
            return (b.beaten?.wins || 0) - (a.beaten?.wins || 0);
          case 'value':
          default:
            return b.valueScore - a.valueScore;
        }
      });
    }

    // Main scan function - uses progressive scanning
    async function scan() {
      if (!isEnabled || !API_KEY) {
        console.log('BountySniper: Not scanning - disabled or no API key');
        return;
      }

      try {
        const now = Date.now();
        const needsBountyRefresh = (now - lastBountyFetch) > BOUNTY_REFRESH_INTERVAL || cachedCandidates.length === 0;
        
        // PHASE 1: Refresh bounty list if needed (every 3 minutes or if empty)
        if (needsBountyRefresh) {
          updateStatus('Refreshing bounty list...');
          console.log('BountySniper: Refreshing bounty list...');
          
          let bounties;
          
          // If on bounty page, scrape DOM directly (fastest)
          if (location.href.includes('bounties.php')) {
            console.log('BountySniper: Scraping bounty page DOM');
            bounties = parseBountyDOM();
          } else {
            // Use iframe to load bounty page and scrape after React renders
            console.log('BountySniper: Loading bounty page via iframe...');
            try {
              bounties = await fetchBountyPage();
            } catch (fetchErr) {
              console.error('BountySniper: Fetch failed:', fetchErr);
              updateStatus('Fetch failed');
              return;
            }
          }

          console.log('BountySniper: Parsed', bounties.length, 'bounties');

          if (bounties.length === 0) {
            updateStatus('No bounties found');
            renderPanel();
            return;
          }

          // Deduplicate by userId (keep highest reward entry)
          const bountyMap = new Map();
          for (const b of bounties) {
            const existing = bountyMap.get(b.userId);
            if (!existing || b.reward > existing.reward) {
              bountyMap.set(b.userId, b);
            }
          }
          cachedBounties = Array.from(bountyMap.values());
          console.log('BountySniper: After deduplication:', cachedBounties.length, 'unique bounties');

          // Apply initial filter (non-strict, lets unknown hospital times through)
          cachedCandidates = filterBounties(cachedBounties, false);
          console.log('BountySniper: After initial filtering:', cachedCandidates.length, 'candidates');

          // Check beaten status for all candidates (uses local DB, no API)
          for (const bounty of cachedCandidates) {
            bounty.beaten = await checkBeatenStatus(bounty.userId);
          }

          // Sort candidates for processing order
          // 1. Prioritize candidates matching user's enabled statuses (page-scraped hint)
          // 2. Not yet checked (no RSI cache)
          // 3. Okay status first  
          // 4. Beaten before
          // 5. By reward
          cachedCandidates.sort((a, b) => {
            // First: prioritize candidates matching enabled status settings
            // This uses page-scraped status as a HINT (not a filter)
            const aMatchesPrefs = statusMatchesPrefs(a.status);
            const bMatchesPrefs = statusMatchesPrefs(b.status);
            if (aMatchesPrefs && !bMatchesPrefs) return -1;
            if (!aMatchesPrefs && bMatchesPrefs) return 1;
            
            // Then: unchecked candidates
            const aHasCache = rsiCache.has(a.userId) && (now - rsiCache.get(a.userId).timestamp) < RSI_CACHE_TTL;
            const bHasCache = rsiCache.has(b.userId) && (now - rsiCache.get(b.userId).timestamp) < RSI_CACHE_TTL;
            if (!aHasCache && bHasCache) return -1;
            if (aHasCache && !bHasCache) return 1;
            
            // Okay status gets priority
            if (a.status === 'Okay' && b.status !== 'Okay') return -1;
            if (a.status !== 'Okay' && b.status === 'Okay') return 1;
            // Then beaten before
            if (a.beaten?.wins && !b.beaten?.wins) return -1;
            if (!a.beaten?.wins && b.beaten?.wins) return 1;
            // Then by reward
            return b.reward - a.reward;
          });

          // Reset scan index on refresh
          scanIndex = 0;
          lastBountyFetch = now;
          
          // Clean up verified targets - remove those no longer on bounty list
          const currentUserIds = new Set(cachedBounties.map(b => b.userId));
          for (const userId of verifiedTargets.keys()) {
            if (!currentUserIds.has(userId)) {
              verifiedTargets.delete(userId);
            }
          }
        }

        // PHASE 1.5: Verify existing panel targets are still valid
        // This runs FIRST to ensure panel accuracy (uses up to 5 API calls for 5 targets)
        if (verifiedTargets.size > 0) {
          updateStatus('Verifying targets...');
          const verifyApiCalls = await verifyPanelTargets();
          console.log(`BountySniper: Target verification used ${verifyApiCalls} API calls`);
        }

        // PHASE 2: Progressive API checking from current scan position
        if (cachedCandidates.length === 0) {
          updateStatus('No candidates');
          renderPanel();
          return;
        }

        const budget = settings.sniperApiBudget;
        let apiCallsMade = 0;
        let checkedThisCycle = 0;
        const startIndex = scanIndex;
        
        console.log(`BountySniper: Starting API check from index ${scanIndex}/${cachedCandidates.length}, budget: ${budget}`);
        updateStatus(`Checking ${scanIndex}/${cachedCandidates.length}...`);

        // Process candidates starting from scanIndex
        while (checkedThisCycle < cachedCandidates.length && canUseApi()) {
          const idx = (startIndex + checkedThisCycle) % cachedCandidates.length;
          const bounty = cachedCandidates[idx];
          checkedThisCycle++;
          
          // Check if already cached
          const cached = rsiCache.get(bounty.userId);
          if (cached && (Date.now() - cached.timestamp) < RSI_CACHE_TTL) {
            // Use cached data
            bounty.rsi = cached.rsi;
            bounty.status = cached.rsi.status || bounty.status;
            bounty.hospitalTime = cached.rsi.hospitalTime;
            
            // If this is a verified good target, update in verified map
            const result = isGoodTarget(bounty);
            if (result.valid) {
              bounty.valueScore = calculateValueScore(bounty);
              verifiedTargets.set(bounty.userId, bounty);
            } else {
              verifiedTargets.delete(bounty.userId);
            }
            continue;
          }

          // Need to make API call
          bounty.rsi = await getRsi(bounty.userId);
          apiCallsMade++;
          
          if (bounty.rsi) {
            bounty.status = bounty.rsi.status || bounty.status;
            bounty.hospitalTime = bounty.rsi.hospitalTime;
            
            // Check if this is a good target
            const result = isGoodTarget(bounty);
            if (result.valid) {
              bounty.valueScore = calculateValueScore(bounty);
              verifiedTargets.set(bounty.userId, bounty);
              console.log(`BountySniper: ✓ Good target: ${bounty.name} (${bounty.status}, RSI: ${bounty.rsi.adjusted.toFixed(0)}%)`);
            } else {
              verifiedTargets.delete(bounty.userId);
              console.log(`BountySniper: ✗ Filtered: ${bounty.name} - ${result.reason}`);
            }
          }
          
          // Small delay between API calls
          await new Promise(r => setTimeout(r, 100));
        }

        // Update scan index for next cycle
        scanIndex = (startIndex + checkedThisCycle) % cachedCandidates.length;
        
        const progress = Math.round((getCheckedCount() / cachedCandidates.length) * 100);
        console.log(`BountySniper: Made ${apiCallsMade} API calls, checked ${checkedThisCycle} candidates, progress: ${progress}%`);

        // PHASE 3: Build targets from verified targets
        const verifiedArray = Array.from(verifiedTargets.values());
        targets = sortTargets(verifiedArray).slice(0, MAX_TARGETS);

        // Check for new targets (for sound alert)
        const previousIds = new Set(targets.map(t => t.userId));
        const newGoodTargets = verifiedArray.filter(t => !previousIds.has(t.userId));
        if (newGoodTargets.length > 0 && settings.sniperSoundAlert && apiCallsMade > 0) {
          playAlertSound();
        }

        // Update status
        const statusMsg = `${targets.length} targets | ${progress}% scanned`;
        updateStatus(statusMsg);

        // Broadcast targets to other tabs
        broadcastTargets();

        // Update UI
        renderPanel();

      } catch (e) {
        console.error('BountySniper: Scan error', e);
        updateStatus('Error: ' + (e.message || 'Unknown'));
      }
    }

    // Check if a bounty passes all filters (after API verification)
    function isGoodTarget(bounty) {
      // Must have RSI data
      if (!bounty.rsi) {
        return { valid: false, reason: 'no RSI data' };
      }
      
      // RSI filter
      if (bounty.rsi.adjusted < settings.sniperRsiMin) {
        return { valid: false, reason: `RSI ${bounty.rsi.adjusted.toFixed(0)}% < ${settings.sniperRsiMin}% min` };
      }
      if (bounty.rsi.adjusted > settings.sniperRsiMax) {
        return { valid: false, reason: `RSI ${bounty.rsi.adjusted.toFixed(0)}% > ${settings.sniperRsiMax}% max` };
      }
      
      // Status filter
      if (bounty.status === 'Unknown') {
        return { valid: false, reason: 'unknown status' };
      }
      
      if (bounty.status === 'Okay') {
        if (!settings.sniperShowOkay) {
          return { valid: false, reason: 'Okay (setting disabled)' };
        }
      }
      
      if (bounty.status === 'Hospital') {
        if (!settings.sniperShowHospital) {
          return { valid: false, reason: 'Hospital (setting disabled)' };
        }
        if (bounty.hospitalTime === null || bounty.hospitalTime > settings.sniperHospitalMins) {
          return { valid: false, reason: `Hospital ${bounty.hospitalTime?.toFixed(0) || '?'} mins > ${settings.sniperHospitalMins} threshold` };
        }
      }
      
      if (bounty.status === 'Traveling') {
        if (!settings.sniperShowTraveling) {
          return { valid: false, reason: 'Traveling (setting disabled)' };
        }
      }
      
      return { valid: true, reason: null };
    }

    // Count how many candidates have been checked (have fresh cache)
    function getCheckedCount() {
      const now = Date.now();
      return cachedCandidates.filter(c => {
        const cached = rsiCache.get(c.userId);
        return cached && (now - cached.timestamp) < RSI_CACHE_TTL;
      }).length;
    }

    // Verify targets currently in panel are still valid
    // Returns number of API calls made
    async function verifyPanelTargets() {
      const now = Date.now();
      let apiCallsMade = 0;
      const targetsToRemove = [];

      for (const [userId, target] of verifiedTargets) {
        // Check if target needs re-verification (every 60 seconds)
        const lastVerified = targetLastVerified.get(userId) || 0;
        if ((now - lastVerified) < TARGET_VERIFY_TTL) {
          continue;  // Recently verified, skip
        }

        // Check API budget
        if (!canUseApi()) {
          console.log('BountySniper: API budget exhausted during target verification');
          break;
        }

        // Re-fetch player data
        console.log(`BountySniper: Verifying target: ${target.name}`);
        const rsi = await getRsi(userId);
        apiCallsMade++;
        targetLastVerified.set(userId, now);

        if (!rsi) {
          console.log(`BountySniper: ⚠ Could not verify ${target.name} - API error`);
          continue;  // Keep target for now, will retry next cycle
        }

        // Update target data
        target.rsi = rsi;
        target.status = rsi.status || target.status;
        target.hospitalTime = rsi.hospitalTime;

        // Check if still valid
        const result = isGoodTarget(target);
        if (!result.valid) {
          console.log(`BountySniper: 🔴 Target no longer valid: ${target.name} - ${result.reason}`);
          targetsToRemove.push(userId);
        } else {
          console.log(`BountySniper: ✅ Target still valid: ${target.name} (${target.status}, RSI: ${rsi.adjusted.toFixed(0)}%)`);
          target.valueScore = calculateValueScore(target);
        }

        // Small delay between API calls
        await new Promise(r => setTimeout(r, 100));
      }

      // Remove invalid targets
      for (const userId of targetsToRemove) {
        verifiedTargets.delete(userId);
        targetLastVerified.delete(userId);
      }

      return apiCallsMade;
    }

    // Play alert sound
    function playAlertSound() {
      try {
        // Simple beep using Web Audio API
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch (e) {
        // Audio not available
      }
    }

    // Format reward for display
    function formatReward(reward) {
      if (reward >= 1000000) return `$${(reward / 1000000).toFixed(1)}M`;
      if (reward >= 1000) return `$${Math.round(reward / 1000)}k`;
      return `$${reward}`;
    }

    // Update status text in panel
    function updateStatus(text) {
      if (!panelEl) return;
      const status = panelEl.querySelector('.ff-sniper-status');
      if (status) {
        const roleIndicator = isLeader ? '<span class="leader">●</span>' : '<span class="follower">●</span>';
        const budget = `${apiCallsThisMinute}/${settings.sniperApiBudget}`;
        status.innerHTML = `${roleIndicator} ${text} | API: ${budget}/min`;
      }
    }

    // Render the sniper panel UI
    function renderPanel() {
      if (!panelEl) {
        createPanel();
      }

      const badge = panelEl.querySelector('.ff-sniper-badge');
      const list = panelEl.querySelector('.ff-sniper-list');
      const status = panelEl.querySelector('.ff-sniper-status');

      // Update badge count
      if (badge) {
        badge.textContent = targets.length;
        badge.className = `ff-sniper-badge${targets.length === 0 ? ' empty' : ''}`;
      }

      // Update list
      if (list) {
        if (targets.length === 0) {
          list.innerHTML = '<div style="padding:10px;text-align:center;color:#666;font-style:italic;">No targets found</div>';
        } else {
          list.innerHTML = targets.map(t => {
            const rsiClass = !t.rsi ? '' : t.rsi.adjusted < settings.lowHigh ? 'high' : t.rsi.adjusted < settings.highMed ? 'med' : 'low';
            const rsiText = t.rsi ? `${Math.round(t.rsi.adjusted)}%` : '...';
            const beatenIcon = t.beaten?.wins > 0 ? `<span class="ff-sniper-beaten" title="Beat ${t.beaten.wins}x">⭐</span>` : '';
            
            return `
              <div class="ff-sniper-item">
                <span class="ff-sniper-rsi ${rsiClass}">${rsiText}</span>
                <span class="ff-sniper-name">
                  <a href="https://www.torn.com/profiles.php?XID=${t.userId}" target="_blank">${escapeHtml(t.name)}</a>
                  ${beatenIcon}
                </span>
                <span class="ff-sniper-reward">${formatReward(t.reward)}</span>
                <a class="ff-sniper-atk" href="https://www.torn.com/loader.php?sid=attack&user2ID=${t.userId}" target="_blank">ATK</a>
              </div>
            `;
          }).join('');
        }
      }

      // Update status
      if (status) {
        const budget = `${apiCallsThisMinute}/${settings.sniperApiBudget}`;
        status.innerHTML = `<span class="scanning">Scanning</span> | API: ${budget}/min`;
      }
    }

    // Create the panel element
    function createPanel() {
      // Load saved collapsed state
      try {
        const savedCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED);
        if (savedCollapsed !== null) {
          isCollapsed = JSON.parse(savedCollapsed);
        }
      } catch (e) {}
      
      panelEl = document.createElement('div');
      panelEl.className = 'ff-sniper-panel' + (isCollapsed ? ' collapsed' : '') + (!isLeader ? ' follower' : '');
      panelEl.innerHTML = `
        <div class="ff-sniper-header">
          <span class="ff-sniper-title">
            🎯 <span>Sniper</span>
            <span class="ff-sniper-badge empty">0</span>
          </span>
          <span class="ff-sniper-toggle">${isCollapsed ? '▶' : '▼'}</span>
        </div>
        <div class="ff-sniper-list"></div>
        <div class="ff-sniper-status">Initializing...</div>
      `;

      // Toggle collapse on toggle button click only (not whole header - that's for drag)
      const toggle = panelEl.querySelector('.ff-sniper-toggle');
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        isCollapsed = !isCollapsed;
        panelEl.classList.toggle('collapsed', isCollapsed);
        toggle.textContent = isCollapsed ? '▶' : '▼';
        // Save collapsed state
        try {
          localStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify(isCollapsed));
        } catch (err) {}
      });

      document.body.appendChild(panelEl);
      
      // Apply saved position
      const pos = getSavedPosition();
      applyPosition(pos.x, pos.y);
      
      // Setup drag listeners
      setupDragListeners();
      
      // Update role display
      updatePanelRole();
    }

    // Start the sniper
    function start() {
      if (!settings.sniperEnabled) return;
      
      isEnabled = true;
      
      // Setup cross-tab sync
      setupStorageListener();
      
      // Try to become leader
      tryBecomeLeader();
      
      // Create panel if needed
      if (!panelEl) {
        createPanel();
      }
      panelEl.style.display = 'block';

      // Start heartbeat interval (check leader status)
      heartbeatInterval = setInterval(() => {
        checkLeader();
      }, HEARTBEAT_INTERVAL);

      // Only scan if we're the leader
      if (isLeader) {
        scan();
        
        // Set up scan interval
        const intervalMs = settings.sniperFetchInterval * 1000;
        scanInterval = setInterval(() => {
          if (isLeader) {
            scan();
            broadcastScanState();
          }
        }, intervalMs);
        
        console.log(`BountySniper: Started as LEADER (interval: ${settings.sniperFetchInterval}s, budget: ${settings.sniperApiBudget}/min)`);
      } else {
        // Follower - just receive updates
        receiveTargets();
        console.log(`BountySniper: Started as FOLLOWER - syncing from leader`);
      }
    }

    // Stop the sniper
    function stop() {
      isEnabled = false;
      
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      // If we were leader, clear leadership so another tab can take over
      if (isLeader) {
        localStorage.removeItem(STORAGE_KEY_LEADER);
        isLeader = false;
      }
      
      if (panelEl) {
        panelEl.style.display = 'none';
      }
      console.log('BountySniper: Stopped');
    }

    // Toggle sniper on/off
    function toggle(enabled) {
      if (enabled) {
        start();
      } else {
        stop();
      }
    }

    // Cleanup when tab is closing
    function cleanup() {
      if (isLeader) {
        // Give up leadership so other tabs can take over
        localStorage.removeItem(STORAGE_KEY_LEADER);
        console.log('BountySniper: Released leadership on tab close');
      }
    }

    // Listen for tab close/unload
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    // Public API
    return {
      start,
      stop,
      toggle,
      scan,
      getTargets: () => targets,
      isRunning: () => isEnabled,
      isLeader: () => isLeader,
      getTabId: () => TAB_ID
    };
  })();

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

      // List items (faction, user lists)
      document.querySelectorAll('div[class*="honorWrap"]').forEach(injectListItem);

      // Bounty page injection
      if (location.href.includes('bounties.php')) {
        // Find all list items that contain profile links
        document.querySelectorAll('li').forEach(li => {
          const profileLink = li.querySelector('a[href*="profiles.php?XID="]');
          if (profileLink && li.getAttribute('data-ff-bounty') !== '1') {
            injectBountyItem(li);
          }
        });
        
        // Also check for any profile links in table-like structures
        document.querySelectorAll('a[href*="profiles.php?XID="]').forEach(link => {
          // Find the row container (li, tr, or div)
          const row = link.closest('li') || link.closest('tr') || link.closest('[class*="row"]');
          if (row && row.getAttribute('data-ff-bounty') !== '1') {
            injectBountyItem(row);
          }
        });
      }

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
        <div class="ff-tab" data-tab="sniper">🎯 Sniper</div>
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
      <div class="ff-tab-content" id="tab-sniper">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input type="checkbox" id="ff-sniper-enabled" ${settings.sniperEnabled ? 'checked' : ''}>
          <span style="font-weight:600;">Enable Bounty Sniper</span>
        </label>
        <hr style="border:none;border-top:1px solid #444;margin:10px 0;">
        <label>Min Reward ($)</label>
        <input type="number" id="ff-sniper-minreward" value="${settings.sniperMinReward}" min="0" step="10000">
        <label>Max Level</label>
        <input type="number" id="ff-sniper-maxlevel" value="${settings.sniperMaxLevel}" min="1" max="100">
        <div style="display:flex;gap:10px;">
          <div style="flex:1;">
            <label>RSI Min (%)</label>
            <input type="number" id="ff-sniper-rsimin" value="${settings.sniperRsiMin}" min="0" max="500">
          </div>
          <div style="flex:1;">
            <label>RSI Max (%)</label>
            <input type="number" id="ff-sniper-rsimax" value="${settings.sniperRsiMax}" min="0" max="500">
          </div>
        </div>
        <hr style="border:none;border-top:1px solid #444;margin:10px 0;">
        <label>Status Filters</label>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin:8px 0;">
          <label style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="ff-sniper-showokay" ${settings.sniperShowOkay ? 'checked' : ''}>
            <span>Okay</span>
          </label>
          <label style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="ff-sniper-showhospital" ${settings.sniperShowHospital ? 'checked' : ''}>
            <span>Hospital</span>
          </label>
          <label style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="ff-sniper-showtraveling" ${settings.sniperShowTraveling ? 'checked' : ''}>
            <span>Traveling</span>
          </label>
        </div>
        <label>Hospital threshold (mins) - show if less than:</label>
        <input type="number" id="ff-sniper-hospitalmins" value="${settings.sniperHospitalMins}" min="0" max="60">
        <hr style="border:none;border-top:1px solid #444;margin:10px 0;">
        <label>API Budget (calls/min)</label>
        <input type="number" id="ff-sniper-apibudget" value="${settings.sniperApiBudget}" min="1" max="50">
        <label>Sort By</label>
        <select id="ff-sniper-sortby" style="width:100%;padding:6px;background:#333;color:#eee;border:1px solid #555;border-radius:4px;">
          <option value="value" ${settings.sniperSortBy === 'value' ? 'selected' : ''}>Value Score (recommended)</option>
          <option value="reward" ${settings.sniperSortBy === 'reward' ? 'selected' : ''}>Highest Reward</option>
          <option value="rsi" ${settings.sniperSortBy === 'rsi' ? 'selected' : ''}>Highest RSI</option>
          <option value="beaten" ${settings.sniperSortBy === 'beaten' ? 'selected' : ''}>Previously Beaten</option>
        </select>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
          <input type="checkbox" id="ff-sniper-soundalert" ${settings.sniperSoundAlert ? 'checked' : ''}>
          <span>Sound alert for new targets</span>
        </label>
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

      // Save sniper settings
      Env.setValue('sniperEnabled', modal.querySelector('#ff-sniper-enabled')?.checked || false);
      Env.setValue('sniperMinReward', parseInt(modal.querySelector('#ff-sniper-minreward')?.value) || DEFAULTS.sniperMinReward);
      Env.setValue('sniperMaxLevel', parseInt(modal.querySelector('#ff-sniper-maxlevel')?.value) || DEFAULTS.sniperMaxLevel);
      Env.setValue('sniperRsiMin', parseInt(modal.querySelector('#ff-sniper-rsimin')?.value) || DEFAULTS.sniperRsiMin);
      Env.setValue('sniperRsiMax', parseInt(modal.querySelector('#ff-sniper-rsimax')?.value) || DEFAULTS.sniperRsiMax);
      Env.setValue('sniperShowOkay', modal.querySelector('#ff-sniper-showokay')?.checked || false);
      Env.setValue('sniperShowHospital', modal.querySelector('#ff-sniper-showhospital')?.checked || false);
      Env.setValue('sniperShowTraveling', modal.querySelector('#ff-sniper-showtraveling')?.checked || false);
      Env.setValue('sniperHospitalMins', parseInt(modal.querySelector('#ff-sniper-hospitalmins')?.value) || DEFAULTS.sniperHospitalMins);
      Env.setValue('sniperApiBudget', parseInt(modal.querySelector('#ff-sniper-apibudget')?.value) || DEFAULTS.sniperApiBudget);
      Env.setValue('sniperSortBy', modal.querySelector('#ff-sniper-sortby')?.value || DEFAULTS.sniperSortBy);
      Env.setValue('sniperSoundAlert', modal.querySelector('#ff-sniper-soundalert')?.checked || false);

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

  /**
   * Auto-sync learning model from IndexedDB fights
   * Runs once on startup if learning model is empty but fights exist
   */
  async function autoSyncLearningModel() {
    try {
      const hist = Env.getValue('ff_lrsi_hist', []) || [];
      
      // Only auto-sync if learning model is empty
      if (hist.length > 0) return;
      
      const fights = await FightDB.getAllFights();
      if (!fights || fights.length < 3) return; // Need at least 3 fights
      
      // Convert fights to learning format
      const samples = [];
      for (const fight of fights) {
        const rsi = fight.rsiAdjusted || fight.rsiRaw;
        if (rsi === null || rsi === undefined) continue;
        if (fight.outcome !== 'win' && fight.outcome !== 'loss') continue;
        
        samples.push({
          x: rsi - 100,
          y: fight.outcome === 'win' ? 1 : 0,
          ts: fight.capturedAt || Date.now()
        });
      }
      
      if (samples.length < 3) return;
      
      // Perform logistic regression fit
      let t0 = 0, t1 = 0.12;
      const lr = 0.05;
      for (let iter = 0; iter < 100; iter++) {
        let g0 = 0, g1 = 0;
        for (const s of samples) {
          const p = 1 / (1 + Math.exp(-(t0 + t1 * s.x)));
          const err = s.y - p;
          g0 += err;
          g1 += err * s.x;
        }
        t0 += lr * g0 / samples.length;
        t1 += lr * g1 / samples.length;
      }
      t1 = Math.max(0.01, Math.min(0.5, t1));
      
      // Save to learning model
      Env.setValue('ff_lrsi_theta0', t0);
      Env.setValue('ff_lrsi_theta1', t1);
      Env.setValue('ff_lrsi_hist', samples);
      Env.setValue('ff_lrsi_meta', { n: samples.length, ts: Date.now() });
      
      console.log(`ATK Scouter: Auto-synced learning model from ${samples.length} fights (θ0=${t0.toFixed(3)}, θ1=${t1.toFixed(3)})`);
    } catch (e) {
      console.error('ATK Scouter: Auto-sync failed', e);
    }
  }

  function init() {
    console.log('ATK Scouter v' + VERSION + ' initializing...');
    
    createSettingsUI();
    initUserState();

    // Check if on attack-related page immediately
    FightCapture.setupAttackPageObserver();
    
    // Auto-sync learning model from IndexedDB (runs async in background)
    autoSyncLearningModel();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
