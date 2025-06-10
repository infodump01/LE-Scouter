---

# LE Scouter Base

**Version:** 1.2.4
**For:** Torn City (Web & PDA)
**Repository:** [infodump01/LE-Scouter](https://github.com/infodump01/LE-Scouter)
**Raw Script:** [`LE_Scouter_Working_Prototype.js`](https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js)

---

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

### 1. **Desktop (Browser)**

* **Prerequisites:**

  * Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) browser extension.
* **Install the Script:**

  * [Click here to install LE Scouter](https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js) *(opens raw script for direct install)*
* **API Key:**

  * On first use, you’ll be prompted for your Torn API key.

    > *You only need “personalstats”, “battlestats”, and “basic” permissions (full key not required).*
* **Settings:**

  * Use the ⚙️ button in the bottom left to adjust options or update your API key any time.

---

### 2. **Mobile (Torn PDA)**

* Open the Torn PDA app’s script manager.
* Add a new script using this raw URL:

  ```
  https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
  ```
* **Set injection time** to `END`.
* Save and reload Torn PDA.
* When prompted, enter your Torn API key (see above for required permissions).

> **Note:** On PDA, all features (RSI, arrows, tooltips, attack buttons, live travel icons, settings panel) are supported and sized for mobile.

---

## How It Works: RSI Calculation

* **Battle Power Estimation:**

  * Script estimates your “BP” (battle power) and compares it to every target, using Torn API’s personal stats plus derived metrics:

    * ELO, Damage, Wins/Losses, Xanax taken (for gym unlocks), Networth, Activity, Crit rate, Win rate, Account age, etc.
  * *Your own drug debuffs and gym multipliers (from Xanax use) are included automatically.*
* **Risk Class (RSI %):**

  * If you have a strong advantage, arrow/badge is **green**; moderate is **yellow**; high risk is **red**.
  * Life %: Opponent’s current health further adjusts their risk score (wounded enemies are easier).
  * **Tooltip:** All calculations are visible—hover (or tap) for numbers and stats.
* **Everything is customizable**:

  * Risk thresholds and weighting can be adjusted in the settings panel.

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
* Inspired by FF Scouter

Contributions, bug reports, and suggestions are welcome—open an [issue](https://github.com/infodump01/LE-Scouter/issues) or submit a PR!

---

## License

[MIT](LICENSE)

---

*Enjoy fast, accurate, and visually enhanced scouting on every Torn page—desktop or PDA!*

---

Let me know if you want anything changed, more technical install/troubleshooting, or a “for developers” section!
























































