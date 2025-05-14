
# LE Scouter Base v1.0

LE_Scouter_Working Prototype.js is the current usable and stable .js file for both TORN PDA and PC using TamperMonkey

**LE Scouter** is a userscript that overlays a real‑time RSI (Relative Strength Index) risk score onto user profiles and account listings across Torn.com. Designed for both desktop (Tampermonkey / Violentmonkey) and Torn PDA mobile users, it helps you quickly gauge how safe—or dangerous—it would be to attack any given opponent.

---

## 🔥 Features

* **Profile Badges**: Appends a colored `RSI xx.xx% — [Advantage|Moderate risk|High risk]` badge next to the user’s header on any profile page.
* **List Overlays**: Renders an arrow inside every account listing (faction page, market, chat, etc.) positioned proportionally by RSI (green=low risk, yellow=moderate, red=high risk).
* **Life Adjustment**: If a target is wounded (life < 100%), the script automatically boosts (up to +10%) their raw RSI and highlights their badge/arrow with a glowing red effect and warning symbol.
* **Universal Coverage**: Automatically scans and injects on any page containing account links (`profiles.php?XID=`), including:

  * Faction member lists
  * Market listings
  * Chat/user mentions
  * Any custom Torn PDA page with JS injection
* **Single API Key Prompt**: Prompts once for your Torn API key via `prompt()`, stores it securely in localStorage, and reuses it across pages.
* **Auto‑Update Support**: Includes `@updateURL` and `@downloadURL` for seamless script updates from GitHub.

Arrows on profiles are an indicator of RISK
Risk goes from left to right, far left = less risk to attack and far right = more risk to attack
RED = High Risk
YELLOW = Moderate Risk
GREEN = Low Risk
A highlighted risk arrow = account is currently wounded

![image](https://github.com/user-attachments/assets/c0072979-63b6-4836-a05a-5073aac203bd)

At 100% the algo suggests that you are about equal in power and thus moderate risk. 50% is very dangerous, and 150% should be relatively easy and not risky to attack. The account below is about equal in power, and is already wounded as indicated by the Red border and warning symbol 

![image](https://github.com/user-attachments/assets/fa653f07-a7ea-4d71-9c42-d2868d7ff05d)


---

## ⚙️ Installation

1. **Desktop (Tampermonkey / Violentmonkey):**

   * Add new script and then paste code from GitHub raw script URL (see below).
   * Make sure the script is enable, turned on in the Tampermonkey interface
   * The first time you load a Torn page after installation, you’ll be prompted for your Torn API key.

2. **Torn PDA Mobile App:**

   * In the PDA script menu, add a new script, configure the "remote load" and then add the raw script URL (see below)
   * Click "Fetch" and then Load"
   * Set **Injection time** to **END**.
   * Save and reload; you’ll receive the same API‑key prompt once.

**Remote Update URL:**

```
https://raw.githubusercontent.com/infodump01/LE-Scouter/main/LE_Scouter_Base_v1.0.user.js
```

---

## 🔑 Configuration

* **Tweak Life Weight**: In the code, adjust the `lifeWeight = 0.1` value in the badge/arrow logic to increase or decrease how much being wounded affects the final score.

---

## 🧮 Scoring Metrics

The RSI is computed by first estimating each player’s **Battle Power** via:

1. **ELO** × 2
2. √(attackdamage / 1000) × 1.5
3. √(max(attackswon − attackslost, 0)) × 1.2
4. √(xantaken) × 0.5
5. Win rate (won / total) × 100
6. Crit rate × 100
7. Net worth: log₁₀(networth + 1) × 5
8. Account age: log₁₀(days since signup + 1) × 5
9. Activity: log₁₀(useractivity + 1) × 2

The ratio (you ÷ opponent) × 100 yields a **raw RSI %**.
**Life Adjustment:** If opponent’s life < 100%:

```js
boost = (1 − lifePct) × (1 − |rawRSI−100|/100) × lifeWeight
adjRSI = rawRSI × (1 + boost)
```

---

## 🛠️ Troubleshooting

* **No API prompt**: Clear your browser/PDA local storage for `api_key` / clear browser cache 
* **No arrows or badges**: Check that your manager’s injection time is set to **END** on Torn PDA, refresh page
* **Script not updating**: Verify the `@updateURL` and `@downloadURL` lines point to the raw GitHub URL above.

---

## 📄 License

MIT © 2025 Legitimate Enterprises

---

*Made with ❤️ for the Torn community*





















































