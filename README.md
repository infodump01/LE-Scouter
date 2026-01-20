# ATK Scouter

> **Advanced Combat Intelligence & Automation for Torn City**

ATK Scouter is a comprehensive userscript that transforms your Torn City combat experience with intelligent fight analysis, real-time status tracking, automated sniping features, and machine learning-powered predictions. Designed for both desktop browsers and Torn PDA mobile app.

[![Version](https://img.shields.io/badge/version-2.1.12-blue.svg)](https://github.com/yourusername/atk-scouter/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Torn City](https://img.shields.io/badge/Torn%20City-Compatible-red.svg)](https://www.torn.com)

---

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Core Systems](#-core-systems)
- [Configuration](#-configuration)
- [FAQ](#-faq)
- [Troubleshooting](#-troubleshooting)
- [Changelog](#-changelog)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🎯 RSI Analysis System
- **Relative Strength Index (RSI)** calculation comparing your combat power to opponents
- **Visual indicators** on faction pages:
  - 🟢 Green triangle: Low risk (you're significantly stronger)
  - 🟡 Yellow triangle: Medium risk (fairly matched)
  - 🔴 Red triangle: High risk (opponent is stronger)
- **Intelligent caching** with 7-day persistence (saves 60-80% of API calls on reloads)
- **Confidence indicators** showing cache freshness
- **Background refresh** keeps data current without manual reloads

### 🧠 Fight Intelligence
- **Win/Loss tracking** with automatic fight outcome detection
- **Machine learning predictions** based on historical fight data
- **Win probability calculations** displayed before attacking
- **Auto-learning** from every fight to improve accuracy
- **Detailed statistics** panel showing:
  - Total fights, wins, losses
  - Win rate percentages
  - Learned RSI thresholds
  - Fight history trends

### 📊 Real-Time Status Tracking
- **Hospital status** indicators (🏥) with time remaining
- **Travel status** indicators (✈️ blue for traveling, 🌍 orange for abroad)
- **3-minute status cache** with automatic background refresh
- **Smart refresh logic** prevents redundant API calls
- **Visual tooltips** on hover showing detailed status information

### 🎯 Bounty Sniper
- **Automated bounty scanning** across multiple pages
- **RSI-based filtering** (only shows targets you can beat)
- **Status filtering** (exclude hospitalized/traveling targets)
- **Reward filtering** (minimum bounty amount)
- **Level filtering** (target level range)
- **Real-time updates** with configurable scan intervals
- **Sound alerts** for new targets
- **Drag & drop** positioning on screen

### 🚔 Bust Sniper
- **Automated jail scanning** for bust opportunities
- **Sentence filtering** (minimum/maximum jail time in hours)
- **Level filtering** (target level range)
- **Faction selection** (Normal Jail / Federal Jail)
- **Maximum targets** limit (prevent overwhelming display)
- **Real-time updates** with configurable intervals
- **Sound alerts** for new bust opportunities
- **Smart sorting** (by level, sentence, or respect gain)

### 📈 API Budget Management
- **Visual API counter** (e.g., "42/100") overlays settings cog
- **Color-coded warnings**:
  - 🟢 Green: Normal usage (< 60%)
  - 🟠 Orange: Warning (60-80%)
  - 🔴 Red: Danger (> 80%)
- **Intelligent rate limiting** prevents API key bans
- **Per-minute tracking** (100 calls/minute limit)
- **Real-time updates** every 2 seconds

### ⚙️ Advanced Settings Panel
- **Multi-tab interface**:
  - Settings: Core RSI and API configuration
  - Sniper: Bounty hunting automation
  - Bust: Jail busting automation
  - Cache: RSI cache management and statistics
  - Stats: Fight Intelligence data and insights
- **Live save & reload** functionality
- **Clear data options** for fresh starts
- **Mobile-optimized** interface for Torn PDA

---

## 📥 Installation

### Desktop (Chrome, Firefox, Edge)

#### Prerequisites
Install a userscript manager:
- **[Violentmonkey](https://violentmonkey.github.io/)** (Recommended)
- **[Tampermonkey](https://www.tampermonkey.net/)**
- **[Greasemonkey](https://www.greasespot.net/)** (Firefox only)

#### Install Script
1. **Click to install**: [LE_Scouter_Working_Prototype.js](https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js)
2. Your userscript manager will prompt you to install
3. Click **"Install"** or **"Confirm installation"**
4. Navigate to [Torn City](https://www.torn.com)
5. You'll be prompted to enter your API key on first use

#### Alternative: Manual Installation
1. Download the latest [LE_Scouter_Working_Prototype.js](https://github.com/infodump01/LE-Scouter/blob/main/)
2. Open your userscript manager dashboard
3. Click **"Add new script"** or **"+"**
4. Copy and paste the entire script
5. Save and refresh Torn City

---

### Mobile (Torn PDA)

#### Prerequisites
- Install **[Torn PDA](https://www.torn.com/forums.php#/p=threads&f=67&t=16163503)** app (iOS/Android)
- Torn PDA Premium (optional but recommended for best experience)

#### Install Script
1. Open **Torn PDA** app
2. Go to **Settings** → **Scripts**
3. Tap **"+"** to add new script
4. **Script URL**: 
   ```
   https://raw.githubusercontent.com/yourusername/atk-scouter/main/ATK_Scouter_v2_1_12_FINAL.js
   ```
5. **Injection time**: `END` (important!)
6. **Name**: ATK Scouter
7. Save and reload app
8. Enter API key when prompted

---

## 🚀 Quick Start

### 1. Get Your API Key

1. Go to [Torn Settings → API Key](https://www.torn.com/preferences.php#tab=api)
2. Create a new key with **"Limited Access"**
3. Required permissions:
   - ✅ **Basic** (user level, status)
   - ✅ **Personal Stats** (battle stats)
   - ✅ **Battle Stats** (for RSI calculations)
   - ❌ **Full Access** NOT required!
4. Copy your API key

### 2. Configure ATK Scouter

1. Look for **⚙️ settings cog** in bottom-left corner
2. Click to open settings panel
3. Paste your API key in the **"Settings"** tab
4. Click **"💾 Save & Reload"**

### 3. Start Scouting!

**On Faction Pages:**
- See colored triangles (🟢🟡🔴) under each member's honor bar
- Hover for detailed RSI, life %, and status tooltips
- Status icons (🏥✈️) appear automatically

**On Attack Pages:**
- After winning/losing a fight, outcome is automatically logged
- Fight Intelligence panel tracks your performance
- Win predictions improve over time

**View Statistics:**
- Open settings (⚙️) → **Stats** tab
- See win/loss records, learned RSI thresholds
- Clear data if you want to start fresh

**Enable Snipers (Optional):**
- Settings → **Sniper** tab → Enable Bounty Sniper
- Settings → **Bust** tab → Enable Bust Sniper
- Configure filters and scan settings
- Snipers appear as draggable panels on relevant pages

---

## 🔧 Core Systems

### RSI Calculation

ATK Scouter calculates **Relative Strength Index** using multiple factors:

```
RSI Components:
├─ Base Stats (Strength, Speed, Defense, Dexterity)
├─ Battle Stats (Total, Rank, Score)
├─ Derived Metrics
│  ├─ ELO rating (from wins/losses)
│  ├─ Win rate
│  ├─ Critical hit rate
│  ├─ Account age multiplier
│  ├─ Net worth indicator
│  └─ Activity level
├─ Life Percentage (real-time health)
└─ Drug Effects (Xanax → gym unlocks)

Final RSI = (Your BP / Opponent BP) × 100%
```

**Risk Classifications:**
- **RSI < 40%**: 🔴 Red (High Risk) - Opponent is significantly stronger
- **RSI 40-70%**: 🟡 Yellow (Medium Risk) - Fairly matched
- **RSI > 70%**: 🟢 Green (Low Risk) - You have the advantage

### Caching Architecture

**Three-Layer Cache System:**

```
┌─────────────────────────────────────┐
│   LastCheck Cache (3 min TTL)      │
│   Prevents duplicate page reloads   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Status Cache (3 min TTL)          │
│   Hospital/Travel/Life data         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   RSI Cache (7 day TTL)             │
│   IndexedDB persistent storage      │
└─────────────────────────────────────┘
```

**Benefits:**
- 60-80% reduction in API calls
- Instant page loads
- Background refresh keeps data current
- Survives browser restarts

### Fight Intelligence ML

**Machine Learning Model:**
1. **Data Collection**: Every fight outcome (win/loss) logged with RSI value
2. **Pattern Analysis**: Identifies RSI thresholds where win probability changes
3. **Probability Calculation**: `Win Rate = Wins / (Wins + Losses)` at similar RSI levels
4. **Adaptive Learning**: Model improves accuracy with more fight data
5. **Confidence Scoring**: More data = higher confidence in predictions

**Example:**
```
Your RSI vs Opponent: 65%
Historical fights at 60-70% RSI: 15 wins, 5 losses
Predicted Win Probability: 75%
Confidence: High (20 data points)
```

---

## ⚙️ Configuration

### Settings Tab

| Setting | Default | Description |
|---------|---------|-------------|
| **API Key** | (none) | Your Torn API key |
| **RSI Low→High** | 40% | Threshold for red→yellow triangle |
| **RSI High→Med** | 70% | Threshold for yellow→green triangle |
| **Life Weight** | 0.8 | Impact of opponent's life % on RSI |
| **Drug Weight** | 0.2 | Impact of drug effects on RSI |

### Sniper Tab (Bounty Hunting)

| Setting | Default | Description |
|---------|---------|-------------|
| **Enable Sniper** | Off | Activate bounty scanning |
| **Min Reward** | $100k | Minimum bounty amount |
| **Max Level** | 100 | Maximum target level |
| **RSI Min/Max** | 50-150% | RSI range filter |
| **Show Hospital** | Off | Include hospitalized targets |
| **Show Traveling** | Off | Include traveling targets |
| **Hospital Mins** | 30 | Min hospital time to show |
| **Pages to Scan** | 5 | How many bounty pages to check |
| **API Budget** | 20 | Max API calls per scan cycle |
| **Sort By** | Reward | Sort order (Reward/Level/RSI) |
| **Sound Alert** | Off | Audio notification for new targets |

### Bust Tab (Jail Busting)

| Setting | Default | Description |
|---------|---------|-------------|
| **Enable Bust Sniper** | Off | Activate jail scanning |
| **Min Level** | 1 | Minimum target level |
| **Max Level** | 100 | Maximum target level |
| **Min Sentence** | 1 hour | Minimum jail time |
| **Max Sentence** | 100 hours | Maximum jail time |
| **Pages to Scan** | 3 | How many jail pages to check |
| **Show Normal Jail** | On | Include normal jail inmates |
| **Show Federal Jail** | On | Include federal jail inmates |
| **Max Targets** | 10 | Maximum targets to display |
| **Fetch Interval** | 60s | Time between scan cycles |
| **Sort By** | Level | Sort order (Level/Sentence/Respect) |
| **Sound Alert** | Off | Audio notification for new targets |

### Cache Tab

| Feature | Description |
|---------|-------------|
| **Cache Enabled** | Toggle RSI caching on/off |
| **Show Confidence** | Display cache freshness indicators |
| **Background Refresh** | Auto-refresh cache every 3 minutes |
| **Cache Statistics** | View hit/miss rates, API savings |
| **Refresh Cache** | Manually update all cached data |

### Stats Tab (Fight Intelligence)

| Feature | Description |
|---------|-------------|
| **Win/Loss Record** | Total fights and win percentage |
| **Learned RSI Thresholds** | ML model's confidence zones |
| **Fight History** | Recent fight outcomes |
| **Clear All Data** | Reset fight intelligence database |

---

## ❓ FAQ

### General Questions

**Q: What API key permissions do I need?**
A: You only need **"Limited Access"** with Basic, Personal Stats, and Battle Stats. Full access is NOT required and not recommended for security.

**Q: Will this get me banned?**
A: No. The script respects Torn's API rate limits (100 calls/minute) and only uses publicly available data. Thousands of players use similar scripts.

**Q: Does it work on mobile?**
A: Yes! Fully compatible with Torn PDA. All features work on mobile with optimized UI.

**Q: How much does it cost?**
A: ATK Scouter is completely free and open-source.

---

### Installation Issues

**Q: Script not appearing after installation?**
A: 
1. Hard refresh: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
2. Check userscript manager is enabled
3. Verify script is active (green icon in toolbar)
4. Clear browser cache and reload

**Q: "Auto-reload failed" error when saving settings?**
A: This is normal on some mobile browsers. Just manually refresh the page (pull down or F5) after saving.

**Q: API counter flickering on mobile?**
A: Update to v2.1.12 or later. This was fixed by preventing multiple refresh timers.

---

### Feature Questions

**Q: Why aren't triangles showing on faction page?**
A: 
1. Ensure API key is valid (Settings → test key)
2. Check RSI Cache is enabled (Settings → Cache tab)
3. Wait for initial data load (first visit may take 10-30 seconds)
4. Check browser console for errors (F12)

**Q: Fight Intelligence not tracking fights?**
A: 
1. Only tracks fights from v2.1.7+ (previous fights not recorded)
2. Check you're on the attack log page after fight completes
3. Verify IndexedDB is enabled (not in private browsing mode)
4. Try clearing fight data and starting fresh (Settings → Stats → Clear All Data)

**Q: Status icons not appearing?**
A: 
1. Status cache requires players to be hospital/traveling/abroad
2. Only shows on faction pages, bounty pages
3. First load may take a few seconds to populate
4. Refresh cache manually (Settings → Cache → Refresh Cache)

**Q: How do I disable Bounty/Bust Sniper?**
A: Settings → Sniper/Bust tab → Uncheck "Enable" → Save & Reload

---

### Performance Questions

**Q: How many API calls does this use?**
A: 
- **First load**: 20-50 calls (depends on faction size)
- **Subsequent loads**: 0-5 calls (cached data)
- **API savings**: 60-80% reduction with caching enabled
- **Monitor usage**: Check API counter in bottom-left

**Q: Will this slow down my browser?**
A: No. Caching and efficient algorithms keep CPU/memory usage minimal. Most processing happens once per page load.

**Q: How much storage does it use?**
A: 
- RSI Cache: ~2-5 MB (IndexedDB)
- Status Cache: < 1 MB (sessionStorage)
- Fight Intelligence: ~1-2 MB (IndexedDB)
- Total: < 10 MB

---

## 🔧 Troubleshooting

### Common Issues

#### Issue: Blank Screen or Script Not Loading

**Solutions:**
1. Check JavaScript is enabled in browser
2. Disable conflicting userscripts (try disabling all others)
3. Clear browser cache: `Ctrl+Shift+Delete`
4. Reinstall userscript manager
5. Check browser console (F12) for specific errors

#### Issue: "Maximum Cycles Reached" Error

**Solution:**
- Fixed in v2.1.11+
- Update to latest version
- If persists, disable other Torn scripts temporarily

#### Issue: Settings Won't Save

**Solutions:**
1. Ensure Violentmonkey/Tampermonkey has storage permissions
2. Not in private/incognito mode (localStorage disabled)
3. Try different browser
4. Check browser storage isn't full

#### Issue: Duplicate Fight Logging

**Solution:**
- Fixed in v2.1.7+
- Update to latest version
- Clear fight data: Settings → Stats → Clear All Data

#### Issue: API Counter Hidden Behind Cog

**Solution:**
- Fixed in v2.1.10+
- Update to latest version
- Hard refresh after updating

---

### Debug Mode

Enable detailed console logging:

1. Open browser console (F12)
2. Look for messages starting with:
   - `RSI Cache:` - Cache operations
   - `Status Cache:` - Status tracking
   - `FightCapture:` - Fight logging
   - `APIBudgetTracker:` - API usage
3. Report errors with console screenshots to issues page

---

### Getting Help

**Before asking for help, please:**
1. Update to latest version
2. Check FAQ above
3. Search existing [GitHub Issues](https://github.com/yourusername/atk-scouter/issues)
4. Have ready: Browser version, script version, error messages

**Submit a bug report:**
- Use [GitHub Issues](https://github.com/yourusername/atk-scouter/issues/new)
- Include: Browser, script version, steps to reproduce
- Attach: Screenshots, console errors (F12)

---

## 📝 Changelog

### v2.1.12 (Current) - 2026-01-20
**🐛 Fixes:**
- Fixed API counter flickering on mobile (Torn PDA)
- Prevented multiple setInterval timers from running simultaneously
- Improved mobile performance and battery life

### v2.1.11 - 2026-01-20
**🐛 Fixes:**
- Fixed "Maximum cycles reached" error when saving settings
- Added reload guard to prevent multiple simultaneous reload attempts
- Simplified reload logic with sequential fallbacks

### v2.1.10 - 2026-01-20
**🎨 UI Improvements:**
- Fixed API counter text visibility (was hidden behind cog icon)
- Removed "API:" prefix for cleaner display
- Increased transparency for better glass-morphism effect

### v2.1.9 - 2026-01-20
**🎨 UI Improvements:**
- Implemented translucent overlay style for API counter
- Counter now overlays top portion of settings cog
- Added backdrop blur effect for modern aesthetic

### v2.1.8 - 2026-01-20
**🎨 UI Improvements:**
- Attempted arc-style API counter (reverted in v2.1.9)

### v2.1.7 - 2026-01-20
**🐛 Critical Fix:**
- Fixed duplicate fight logging (wins/losses logged twice)
- Only process attackLog pages, not attack pages
- Affects both wins AND losses

### v2.1.6 - 2026-01-19
**🐛 Critical Fix:**
- Fixed Fight Intelligence panel not appearing on mobile
- Incremented IndexedDB version to force schema recreation
- Added graceful error handling for database queries

### v2.1.3 - 2026-01-19
**🎨 UI Improvements:**
- Moved API counter from top-right to bottom-left (below settings cog)
- Improved mobile usability
- Better vertical layout for mobile screens

### v2.1.2 - 2026-01-19
**🐛 Mobile Fix:**
- Fixed "Save & Reload" button not working on mobile browsers
- Added multiple aggressive reload methods
- Shows loading indicator during reload process

### v2.1.1 - 2026-01-19
**🐛 Fixes:**
- Fixed status icons disappearing between refreshes
- Extended Status Cache TTL to 180 seconds
- Aligned with LastCheck interval (both 3 minutes)

### v2.1.0 - 2026-01-19
**✨ New Features:**
- Added LastCheck cache manager
- Background timer for automatic status updates
- Massive API call reduction (60-80% savings)

### v2.0.0 - 2026-01-18
**🎉 Major Release:**
- Complete rewrite with modern architecture
- IndexedDB persistent caching
- Fight Intelligence machine learning
- Bounty Sniper automation
- Bust Sniper automation
- Multi-tab settings panel
- Status tracking system
- API budget management

[View full changelog](CHANGELOG.md)

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Bugs
1. Check [existing issues](https://github.com/yourusername/atk-scouter/issues)
2. Create detailed bug report with:
   - Browser and version
   - Script version
   - Steps to reproduce
   - Screenshots/console errors

### Suggesting Features
1. Open a [feature request](https://github.com/yourusername/atk-scouter/issues/new?labels=enhancement)
2. Describe the feature and use case
3. Explain why it would benefit users

### Pull Requests
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly (both desktop and mobile)
5. Submit PR with clear description

### Development Setup
```bash
git clone https://github.com/yourusername/atk-scouter.git
cd atk-scouter
# Edit ATK_Scouter_v2_1_12_FINAL.js
# Install in browser for testing
# Test on both desktop and Torn PDA
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

**TL;DR:** Free to use, modify, and distribute. No warranty.

---

## 🙏 Credits

### Created By
- **Lord Panzer** - Original developer and maintainer

### Inspired By
- Torn Scouter community
- FF Scouter
- Torn City scripting community

### Special Thanks
- Torn City developers for providing robust API
- Torn PDA team for mobile integration
- All beta testers and bug reporters
- Claude AI for development assistance

---

## 📞 Support

- **GitHub Issues**: [Report bugs](https://github.com/yourusername/atk-scouter/issues)
- **Torn Forums**: [Discussion thread](https://www.torn.com/forums.php)
- **Discord**: [Torn City Scripts](https://discord.gg/torn-scripts)

---

## ⚡ Quick Links

- [Download Latest Release](https://github.com/yourusername/atk-scouter/releases/latest)
- [Installation Guide](#-installation)
- [Configuration Guide](#-configuration)
- [FAQ](#-faq)
- [Changelog](#-changelog)
- [Report Bug](https://github.com/yourusername/atk-scouter/issues/new?labels=bug)
- [Request Feature](https://github.com/yourusername/atk-scouter/issues/new?labels=enhancement)

---

<div align="center">

**Made with ❤️ for the Torn City community**

[⭐ Star this repo](https://github.com/yourusername/atk-scouter) if you find it useful!

</div>





















































## Overview

**LE Scouter Base** overlays *Relative Strength Index (RSI)* risk banners and arrows onto Torn City profiles, factions, and market pages, allowing instant, accurate risk assessment for PVP, wars, and trading.
It’s designed for both desktop web and Torn PDA, adding features like attack buttons on the market, live travel/abroad status icons, and a full-featured settings GUI.

---

## Features

* **Profile RSI Banners**

  * Adds a colored badge (“RSI xx% — risk class”) under the player profile header, showing your risk compared to the viewed player.
  * Life % and last action (short form, e.g. `A 32m`) included on the badge.
  * Drug debuffs and “wounded” (low health) indicators shown directly.

* **Faction/List RSI Arrows**

  * Shows a green, yellow, or red triangle under each player’s honor bar on all lists (faction, job, companies, search, etc.).
  * Tooltip on hover/tap shows:

    * Exact RSI%
    * Player’s Life %
    * Last Action time
  * Plane icon appears (blue for Traveling, orange for Abroad) if user is out of Torn; tooltip shows travel state live.

* **Settings & Customization**

  * ⚙️ Floating action button (bottom-left) opens a dark-themed settings GUI.
  * Adjust risk thresholds (for RSI color classes), life/drug weighting, and manage your API key with ease.

* **Market Seller Tools**

  * Every seller in the Item Market gets an instant “Attack” button (glowing red circle) next to their name—click to open the attack screen in a new tab.
  * New/updated seller rows “flash” bright red so you spot live changes immediately.

* **Desktop and PDA Support**

  * Adapts fully for Torn PDA’s script manager and limited storage model.
  * Optimized icon sizing and positioning for mobile and web.

---

## Installation

### 1. Desktop (Browser)

* **Prerequisites:**
  Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) browser extension.
* **Install the Script:**
  [Click here to install LE Scouter](https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js) *(opens raw script for direct install)*
* **API Key:**
  On first use, you’ll be prompted for your Torn API key.

  > *You only need “personalstats”, “battlestats”, and “basic” permissions (full key not required).*
* **Settings:**
  Use the ⚙️ button in the bottom left to adjust options or update your API key any time.

---

### 2. Mobile (Torn PDA)

* Open the Torn PDA app’s script manager.
* Add a new script using this raw URL:

  ```
  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
  ```
* **Set injection time** to **END**.
* Save and reload Torn PDA.
* When prompted, enter your Torn API key (see above for required permissions).

> **Note:** On PDA, all features (RSI, arrows, tooltips, attack buttons, live travel icons, settings panel) are supported and sized for mobile.

---

## How It Works: RSI Calculation

* **Battle Power Estimation:**
  Script estimates your “BP” (battle power) and compares it to every target, using Torn API’s personal stats plus derived metrics:

  * ELO, Damage, Wins/Losses, Xanax taken (for gym unlocks), Networth, Activity, Crit rate, Win rate, Account age, etc.
    *Your own drug debuffs and gym multipliers (from Xanax use) are included automatically.*
* **Risk Class (RSI %):**

  * If you have a strong advantage, arrow/badge is **green**; moderate is **yellow**; high risk is **red**.
  * Life %: Opponent’s current health further adjusts their risk score (wounded enemies are easier).
  * **Tooltip:** All calculations are visible—hover (or tap) for numbers and stats.
* **Everything is customizable**:
  Risk thresholds and weighting can be adjusted in the settings panel.

---

## FAQ

**Q: What API key permissions do I need?**
A: Only “personalstats”, “battlestats”, and “basic”. You do not need a full-access key.

**Q: Where’s the settings panel?**
A: Click the ⚙️ button in the bottom left at any time. Switch between settings and API key tabs.

**Q: What are the attack icons and red flashes on the market?**
A: Any new/updated seller flashes red for 1.2s. Every seller has an attack button (red circle) that opens the attack window for fast PVP.

**Q: How do I update or reset my API key?**
A: Open the settings panel (⚙️), go to the API Key tab, and clear or paste a new key.

**Q: Is my API key stored securely?**
A: Yes, it’s only stored locally on your device/browser.

---

## Changelog

### v1.2.4 (Market Madness)

* **New:** Attack buttons & row flashes for market sellers (PC & PDA).
* **Update:** Plane/travel icon, RSI tooltips, and badge rendering tuned for all device sizes.
* **Bugfixes:** Improved PDA support and compatibility.

### v1.2.3 and earlier

* Plane icon overlays for live travel/abroad status.
* Full feature parity on PDA.
* Settings GUI.

*See GitHub releases for full version history.*

---

## Credits

* Script by [infodump01](https://github.com/infodump01)
* Inspired by the Torn Scouter, FF Scouter, and Torn scripting communities.

Contributions, bug reports, and suggestions are welcome—open an [issue](https://github.com/infodump01/LE-Scouter/issues) or submit a PR!

---

## License

[MIT](LICENSE)

---

*Enjoy fast, accurate, and visually enhanced scouting on every Torn page—desktop or PDA!*

---

If you want a **“for developers”** or API reference section, just let me know!
