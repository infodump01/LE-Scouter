# LE Scouter

**Version:** v1.1.2

A lightweight userscript that overlays *Relative Strength Index* (RSI) risk indicators across Torn City web interfaces (desktop via Tampermonkey and mobile via Torn PDA). It calculates and displays a risk score for opponents based on battle power estimates, gym-tier multipliers, Xanax use, and current life.

## Features

* **Cross-Platform**: Works on both desktop browsers (Tampermonkey/Greasemonkey) and the Torn PDA mobile app.
* **RSI Badge**: Displays a colored badge on individual profile pages showing:

  * RSI % (user vs. opponent battle power)
  * Risk category: **High**, **Moderate**, or **Advantage**.
  * Medical indicator (✚) if the opponent is wounded (life < max).
* **Faction & List Arrows**: Overlays colored arrows on any page listing profiles (faction pages, market, message boards, etc.) pointing across the avatar/badge area:

  * Position reflects RSI% (0% on right, up to 200% on left).
  * Arrow color indicates risk category.
  * Wounded opponents have a red glow around arrows.
* **Gym-Tier Multiplier**: Estimates battle power boosted by Xanax stacking, using gym-tier energy thresholds to model diminishing returns.
* **Life Weighting**: Applies a configurable penalty boost for injured opponents, scaled by how close RSI is to parity.
* **Configurable Settings**: In-script GUI accessible via a floating ⚙️ button:

  1. **High → Med cutoff (%)**: threshold where risk goes from High to Moderate.
  2. **Med → Low cutoff (%)**: threshold where risk goes from Moderate to Advantage.
  3. **Life Weight (0–1)**: strength of wounded penalty.
  4. **API Key Management**: enter, clear, or change your Torn API key without editing the script.
* **Auto-Update**: Uses `@updateURL` and `@downloadURL` pointing to the raw GitHub script for easy version tracking.

## Installation

1. **Desktop (Tampermonkey/Greasemonkey)**

   * Install [Tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.
   * Create a new userscript and paste in the contents of `LE_Scouter_Working_Prototype.js` from GitHub raw.
   * Save and ensure it’s enabled. Visit any Torn page to trigger the API key prompt.

2. **Mobile (Torn PDA)**

   * Open the Torn PDA app’s script manager.
   * Add a new script using the raw URL:

     ```
     https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Working_Prototype.js
     ```
   * Set injection time to **END**.
   * Save and reload Torn PDA; you’ll be prompted to enter your API key.

## Usage

* **First-time Setup**: On initial load, the floating gear menu auto-opens to the **API Key** tab—paste your Torn API key and save.
* **Viewing Risk**:

  * Navigate to any user profile—look for the RSI badge under the name header.
  * On multi-user lists (factions, market, etc.), watch for colored arrows overlaid on profile badges.
* **Adjust Settings**: Click the ⚙️ button to open the settings modal, tweak thresholds or life weight, then save & reload.

## Under the Hood

1. **Battle Power Estimation**:

   * Combines ELO, attack damage, win/loss ratios, crit rates, net worth, account age, and activity.
   * Multiplies by a gym-tier factor based on `xantaken * 250` energy to model stat boosts.
2. **RSI Calculation**:

   ```js
   raw = (USER_BP / opp_BP) * 100;
   boost = woundedPct * lifeWeight * Math.min(raw/100, 1);
   adjusted = raw * (1 + boost);
   RSI = clamp(adjusted, 0, 200);
   ```
3. **Wounded Indicator**:

   * If `opp.life.current < opp.life.maximum`, a red glow and ✚ icon appear on the badge/arrow.
4. **DOM Injection**:

   * Uses a `MutationObserver` to watch for new user links (`profiles.php?XID=`) and inject arrows in real time.

## Troubleshooting
* **No arrows or badges**: Check that your manager’s injection time is set to **END** on Torn PDA, refresh page
* **Script not updating**: Verify the `@updateURL` and `@downloadURL` lines point to the raw GitHub URL above.

## Contributing

Issues and pull requests are welcome! Feel free to suggest new metrics, UI improvements, or platform-specific tweaks.

## License

MIT © 2025 Infodump

---

*Made with ❤️ for the Torn community*































-----



Arrows on profiles are an indicator of RISK.
Risk goes from left to right, far left = less risk to attack and far right = more risk to attack.
RED = High Risk.
YELLOW = Moderate Risk.
GREEN = Low Risk.
A highlighted risk arrow = account is currently wounded.

![image](https://github.com/user-attachments/assets/c0072979-63b6-4836-a05a-5073aac203bd)

At 100% the algo suggests that you are about equal in power and thus moderate risk. 50% is very dangerous, and 150% should be relatively easy and not risky to attack. The account below is about equal in power, and is already wounded as indicated by the Red border and warning symbol.

![image](https://github.com/user-attachments/assets/fa653f07-a7ea-4d71-9c42-d2868d7ff05d)






















































