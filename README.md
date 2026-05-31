# NERVE — Reaction Horror Game

NERVE is a responsive, cross-platform web-based horror game built with native web technologies. The game tests the player's reaction time by forcing them to rapidly tap highlighted tiles in a grid before a strict countdown timer expires. 

If the timer hits zero, the player is punished with a terrifying fullscreen jumpscare.

**Made by: Deghne Gabriel Agana**

---

## 🎮 Mechanics & Levels

The game relies on a structured, intensely escalating level system designed to eventually force the player to fail.

* **Level 1 (The Warmup)**
  * **Grid:** 4x4 (16 Tiles)
  * **Timer:** A generous 5 seconds per tile. The timer does not decrease, allowing the player to easily clear the board and build a false sense of security.

* **Level 2 (The Trap)**
  * **Grid:** 6x6 (36 Tiles)
  * **Timer:** Starts at 5 seconds, but **drops by 1 full second for every 2 tiles clicked**. This aggressive scaling quickly reduces the reaction window to fractions of a second (capped at 0.1s), making the level physically impossible for human reaction times and guaranteeing a timeout.

* **The Jumpscare**
  * Triggered strictly when the timer reaches zero.
  * Uses the browser's Fullscreen API to completely take over the viewport.
  * Executes a delayed sequence: violent screen shake followed by a piercing synthesized audio screech (using the Web Audio API).

---

## 🛠 Tech Stack

* **Frontend:** HTML5
* **Styling:** Vanilla CSS3 (Custom properties, CSS Grid, Flexbox, Keyframe Animations)
* **Logic:** Vanilla JavaScript (ES6+ modules, State Machine architecture)
* **APIs Used:** Web Audio API (zero-latency in-memory audio synthesis), Fullscreen API
* **No external frameworks** (No React, Vue, or Tailwind)

---

## 🚀 How to Run Locally

Because the game utilizes the Web Audio API and preloads assets, it must be served over an HTTP server rather than opening the file directly (which causes CORS/file protocol restrictions).

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Open a terminal in the project directory (`f:\Maze Game`).
3. Run a local web server, for example:
   ```bash
   npx http-server . -p 8080
   ```
4. Open your browser and navigate to `http://127.0.0.1:8080` (or whichever port is provided).

---

## 📱 Cross-Platform Support
- Designed to be fully responsive.
- Uses `pointerdown` events to flawlessly handle both desktop (mouse clicks) and mobile (touch taps) interactions.
- Mobile touch targets are strictly sized for compliance and to prevent misclicks during panic.
