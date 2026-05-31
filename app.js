/**
 * NERVE — Reaction Horror Game
 * Complete game engine: state machine, asset preloading, Web Audio API,
 * reaction grid logic, jumpscare trigger, and responsive input handling.
 */

/* ==========================================================
   1. CONFIGURATION
   ========================================================== */
const CONFIG = {
    SCORE_PER_TILE: 10,
    TIME_BONUS_MULTIPLIER: 5,      // Bonus points per remaining second
    SCARE_IMAGE_PATH: 'assets/jan.jpg',
    JUMPSCARE_DURATION_MS: 2800,   // How long the scare image shows
    AUDIO_SAMPLE_RATE: 44100,
    AUDIO_DURATION: 2.0,
    START_TIMER_MS: 5000,          // Timer starts at 5 seconds
    TIMER_REDUCTION_MS: 1000,      // Reduce by 1s every 2 tiles
    MIN_TIMER_MS: 100,             // Minimum allowed time (0.1s)
};

/* ==========================================================
   2. GAME STATES
   ========================================================== */
const GameState = Object.freeze({
    LOADING: 'LOADING',
    MENU:    'MENU',
    PLAYING: 'PLAYING',
    JUMPSCARE: 'JUMPSCARE',
    GAME_OVER: 'GAME_OVER',
});

/* ==========================================================
   3. DOM REFERENCES
   ========================================================== */
const DOM = {
    /* screens */
    loadingScreen:   document.getElementById('loading-screen'),
    menuScreen:      document.getElementById('menu-screen'),
    gameScreen:      document.getElementById('game-screen'),
    jumpscareScreen: document.getElementById('jumpscare-screen'),
    gameoverScreen:  document.getElementById('gameover-screen'),
    /* loading */
    loadingBar:      document.getElementById('loading-bar'),
    /* menu */
    startBtn:        document.getElementById('start-btn'),
    howToPlayBtn:    document.getElementById('how-to-play-btn'),
    howToPlayModal:  document.getElementById('how-to-play-modal'),
    closeModalBtn:   document.getElementById('close-modal-btn'),
    /* game HUD */
    scoreDisplay:    document.getElementById('score-display'),
    levelDisplay:    document.getElementById('level-display'),
    timerBar:        document.getElementById('timer-bar'),
    timerText:       document.getElementById('timer-text'),
    gridContainer:   document.getElementById('grid-container'),
    tensionFill:     document.getElementById('tension-fill'),
    tensionValue:    document.getElementById('tension-value'),
    gameVignette:    document.getElementById('game-vignette'),
    /* jumpscare */
    jumpscareImage:  document.getElementById('jumpscare-image'),
    /* game over */
    gameoverTitle:   document.getElementById('gameover-title'),
    gameoverSubtitle:document.getElementById('gameover-subtitle'),
    finalScore:      document.getElementById('final-score'),
    finalLevel:      document.getElementById('final-level'),
    finalCleared:    document.getElementById('final-cleared'),
    finalCause:      document.getElementById('final-cause'),
    retryBtn:        document.getElementById('retry-btn'),
};

/* ==========================================================
   4. AUDIO ENGINE — Web Audio API Synthesizer
   Generates a jarring screech in-memory for zero-latency playback.
   ========================================================== */
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.scareBuffer = null;
        this.activeSource = null;
    }

    /** Initialise AudioContext (must be called from a user gesture) */
    init() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
    }

    /** Pre-render the jumpscare screech into an AudioBuffer */
    synthesizeScare() {
        this.init();
        const sr = this.ctx.sampleRate;
        const dur = CONFIG.AUDIO_DURATION;
        const len = Math.floor(sr * dur);
        const buf = this.ctx.createBuffer(2, len, sr);

        for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                /* Layered dissonant tones with noise */
                let sample = 0;
                sample += Math.sin(2 * Math.PI * 220 * t) * 0.25;             // low growl
                sample += Math.sin(2 * Math.PI * 666 * t * (1 + t * 2)) * 0.3; // rising dissonant
                sample += Math.sin(2 * Math.PI * 1400 * t) * 0.2;             // piercing high
                sample += (Math.random() * 2 - 1) * 0.25;                     // white noise
                /* Sharp attack, slow decay envelope */
                const env = Math.exp(-t * 1.5) * Math.min(1, t * 200);
                data[i] = sample * env * 0.85;
            }
        }
        this.scareBuffer = buf;
    }

    /** Play the pre-rendered scare sound immediately */
    playScare() {
        if (!this.ctx || !this.scareBuffer) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.stop();
        const src = this.ctx.createBufferSource();
        src.buffer = this.scareBuffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 1.0;
        src.connect(gain).connect(this.ctx.destination);
        src.start(0);
        this.activeSource = src;
    }

    /** Stop any currently playing audio */
    stop() {
        if (this.activeSource) {
            try { this.activeSource.stop(); } catch (_) { /* already stopped */ }
            this.activeSource = null;
        }
    }
}

/* ==========================================================
   5. ASSET PRE-LOADER
   Caches the scare image and synthesizes the audio buffer
   before the game becomes interactive.
   ========================================================== */
class AssetPreloader {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.scareImage = new Image();
    }

    /**
     * Load all assets and report progress via callback.
     * @param {(progress: number) => void} onProgress  0-100
     * @returns {Promise<void>}
     */
    async loadAll(onProgress) {
        const tasks = [
            this._loadImage(onProgress),
            this._loadAudio(onProgress),
        ];
        await Promise.all(tasks);
        onProgress(100);
    }

    /** Pre-load the scare image into a cached Image object */
    _loadImage(onProgress) {
        return new Promise((resolve) => {
            this.scareImage.onload = () => { onProgress(50); resolve(); };
            this.scareImage.onerror = () => { console.warn('Scare image failed to load — using fallback.'); resolve(); };
            this.scareImage.src = CONFIG.SCARE_IMAGE_PATH;
        });
    }

    /** Synthesize the scare audio buffer */
    _loadAudio(onProgress) {
        return new Promise((resolve) => {
            try {
                this.audioEngine.init();
                this.audioEngine.synthesizeScare();
            } catch (e) { console.warn('Audio synthesis failed:', e); }
            onProgress(80);
            resolve();
        });
    }
}

/* ==========================================================
   6. SCREEN MANAGER — handles transitions between screens
   ========================================================== */
class ScreenManager {
    constructor() {
        this.screens = {
            [GameState.LOADING]:   DOM.loadingScreen,
            [GameState.MENU]:      DOM.menuScreen,
            [GameState.PLAYING]:   DOM.gameScreen,
            [GameState.JUMPSCARE]: DOM.jumpscareScreen,
            [GameState.GAME_OVER]: DOM.gameoverScreen,
        };
    }

    /** Activate one screen, deactivate all others */
    show(state) {
        Object.entries(this.screens).forEach(([key, el]) => {
            if (key === state) { el.classList.add('active'); }
            else { el.classList.remove('active'); }
        });
    }
}

/* ==========================================================
   7. GAME ENGINE — Core Logic
   ========================================================== */
class GameEngine {
    constructor(audioEngine, preloader) {
        this.audio = audioEngine;
        this.preloader = preloader;
        this.screenMgr = new ScreenManager();

        /* Game state */
        this.state = GameState.LOADING;
        this.score = 0;
        this.tilesCleared = 0;
        this.scareChance = 0;
        this.startTime = 0;
        this.elapsedTime = 0;
        this.activeTileIndex = -1;
        this.tiles = [];
        this.unclickedTiles = [];
        this.currentLevel = 1;
        this.currentTimerLimit = CONFIG.START_TIMER_MS;

        /* Timer state */
        this.tileDeadline = 0;
        this.timerRAF = null;

        /* Bind methods for event listeners */
        this._onTilePointerDown = this._onTilePointerDown.bind(this);
        this._tickTimer = this._tickTimer.bind(this);
    }

    /* ------ Initialisation ------ */
    async init() {
        this._bindMenuEvents();
        this.screenMgr.show(GameState.LOADING);

        await this.preloader.loadAll((p) => {
            DOM.loadingBar.style.width = p + '%';
        });

        /* Brief pause so the user sees 100% */
        await this._sleep(400);
        this.setState(GameState.MENU);
    }

    /* ------ State Machine ------ */
    setState(newState) {
        const prev = this.state;
        this.state = newState;
        this.screenMgr.show(newState);

        switch (newState) {
            case GameState.MENU:     this._enterMenu(); break;
            case GameState.PLAYING:  this._enterPlaying(); break;
            case GameState.JUMPSCARE:this._enterJumpscare(); break;
            case GameState.GAME_OVER:this._enterGameOver(prev); break;
        }
    }

    /* ------ MENU ------ */
    _enterMenu() {
        this._resetGameData();
    }

    _bindMenuEvents() {
        DOM.startBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            /* AudioContext must be resumed from a user gesture */
            this.audio.init();
            this.setState(GameState.PLAYING);
        });
        
        DOM.howToPlayBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            DOM.howToPlayModal.classList.add('active');
        });
        
        DOM.closeModalBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            DOM.howToPlayModal.classList.remove('active');
        });

        DOM.retryBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.setState(GameState.MENU);
        });
    }

    /* ------ PLAYING ------ */
    _enterPlaying() {
        this._resetGameData();
        this.startTime = performance.now();
        this._buildGrid();
        this._highlightNextTile();
    }

    _resetGameData() {
        this.score = 0;
        this.tilesCleared = 0;
        this.currentLevel = 1;
        this.currentTimerLimit = CONFIG.START_TIMER_MS;
        this.scareChance = 0;
        this.activeTileIndex = -1;
        this.elapsedTime = 0;
        this._cancelTimer();
        this._updateHUD();
    }

    /* ------ GRID ------ */
    _buildGrid() {
        DOM.gridContainer.innerHTML = '';
        this.tiles = [];
        this.unclickedTiles = [];
        
        let cols, rows;
        if (this.currentLevel === 1) { cols = 4; rows = 4; }
        else if (this.currentLevel === 2) { cols = 6; rows = 6; }
        else { cols = 8; rows = 8; }
        
        DOM.gridContainer.style.setProperty('--grid-cols', cols);
        const total = cols * rows;

        for (let i = 0; i < total; i++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            tile.dataset.index = i;
            tile.setAttribute('role', 'gridcell');
            tile.addEventListener('pointerdown', this._onTilePointerDown);
            DOM.gridContainer.appendChild(tile);
            this.tiles.push(tile);
            this.unclickedTiles.push(i);
        }
    }

    /* ------ TILE HIGHLIGHTING ------ */
    _highlightNextTile() {
        /* Clear previous active tile */
        if (this.activeTileIndex >= 0 && this.tiles[this.activeTileIndex]) {
            this.tiles[this.activeTileIndex].classList.remove('active');
        }

        if (this.unclickedTiles.length === 0) {
            // Level complete
            this.currentLevel++;
            this._buildGrid();
            this._updateHUD();
            setTimeout(() => {
                if (this.state === GameState.PLAYING) this._highlightNextTile();
            }, 500);
            return;
        }

        /* Pick a random tile from unclicked */
        const randIdx = Math.floor(Math.random() * this.unclickedTiles.length);
        const next = this.unclickedTiles[randIdx];
        this.unclickedTiles.splice(randIdx, 1);

        this.activeTileIndex = next;
        this.tiles[next].classList.remove('success', 'miss');
        this.tiles[next].classList.add('active');

        /* Start the countdown for this tile */
        this._startTileTimer();
    }

    /* ------ TILE INPUT HANDLING ------ */
    _onTilePointerDown(e) {
        e.preventDefault();
        if (this.state !== GameState.PLAYING) return;

        const idx = parseInt(e.currentTarget.dataset.index, 10);
        if (idx !== this.activeTileIndex) return; // wrong tile — ignore

        this._cancelTimer();

        /* Calculate time-based bonus */
        const remaining = Math.max(0, this.tileDeadline - performance.now());
        const timeBonus = Math.round((remaining / 1000) * CONFIG.TIME_BONUS_MULTIPLIER);
        this.score += CONFIG.SCORE_PER_TILE + timeBonus;
        this.tilesCleared++;

        /* Visual feedback */
        this.tiles[idx].classList.remove('active');
        this.tiles[idx].classList.add('success', 'clicked');

        /* Decrease timer: only on Level 2 (the impossible part), subtract 1s every 2 tiles */
        if (this.currentLevel >= 2 && this.tilesCleared % 2 === 0) {
            this.currentTimerLimit = Math.max(CONFIG.MIN_TIMER_MS, this.currentTimerLimit - CONFIG.TIMER_REDUCTION_MS);
        }

        /* Increase tension */
        this.scareChance += 0.05;

        this._updateHUD();

        /* Next tile after a brief success flash */
        setTimeout(() => {
            if (this.state === GameState.PLAYING) {
                this.tiles[idx].classList.remove('success');
                this._highlightNextTile();
            }
        }, 300);
    }

    /* ------ TILE TIMER ------ */
    _startTileTimer() {
        this.tileDeadline = performance.now() + this.currentTimerLimit;
        DOM.timerBar.style.width = '100%';
        DOM.timerBar.classList.remove('warning', 'critical');
        this._tickTimer();
    }

    _tickTimer() {
        if (this.state !== GameState.PLAYING) return;

        const now = performance.now();
        const remaining = Math.max(0, this.tileDeadline - now);
        const pct = (remaining / this.currentTimerLimit) * 100;

        DOM.timerBar.style.width = pct + '%';
        DOM.timerText.textContent = (remaining / 1000).toFixed(2) + 's';

        /* Color thresholds */
        DOM.timerBar.classList.toggle('warning', pct < 50 && pct >= 25);
        DOM.timerBar.classList.toggle('critical', pct < 25);

        if (remaining <= 0) {
            /* Time expired — mark tile as missed, trigger jumpscare */
            if (this.activeTileIndex >= 0) {
                this.tiles[this.activeTileIndex].classList.remove('active');
                this.tiles[this.activeTileIndex].classList.add('miss');
            }
            this.elapsedTime = (now - this.startTime) / 1000;
            setTimeout(() => this.setState(GameState.JUMPSCARE), 100);
            return;
        }

        this.timerRAF = requestAnimationFrame(this._tickTimer);
    }

    _cancelTimer() {
        if (this.timerRAF) {
            cancelAnimationFrame(this.timerRAF);
            this.timerRAF = null;
        }
    }

    /* ------ HUD UPDATE ------ */
    _updateHUD() {
        DOM.scoreDisplay.textContent = this.score;
        if (DOM.levelDisplay) DOM.levelDisplay.textContent = this.currentLevel;

        const dangerPct = Math.min(100, Math.round(this.scareChance * 100));
        DOM.tensionFill.style.width = dangerPct + '%';
        DOM.tensionValue.textContent = dangerPct + '%';

        /* Intensify vignette as danger increases */
        if (DOM.gameVignette) {
            const intensity = 0.7 + (this.scareChance * 0.3);
            DOM.gameVignette.style.background =
                `radial-gradient(ellipse at center, transparent ${50 - dangerPct * 0.3}%, rgba(0,0,0,${intensity}) 100%)`;
        }
    }

    /* ------ JUMPSCARE ------ */
    _enterJumpscare() {
        this._cancelTimer();
        this.elapsedTime = (performance.now() - this.startTime) / 1000;

        /* Set the pre-loaded image */
        DOM.jumpscareImage.src = this.preloader.scareImage.src || CONFIG.SCARE_IMAGE_PATH;

        /* Request fullscreen for maximum immersion */
        this._requestFullscreen();

        /* Screen shake */
        DOM.jumpscareScreen.classList.add('shake');

        /* Play the scare sound after a brief delay (shake a little then sound) */
        setTimeout(() => {
            this.audio.playScare();
        }, 300);

        /* Transition to game over after the scare duration */
        setTimeout(() => {
            DOM.jumpscareScreen.classList.remove('shake');
            this.audio.stop();
            this._exitFullscreen();
            this.setState(GameState.GAME_OVER);
        }, CONFIG.JUMPSCARE_DURATION_MS);
    }

    /* ------ GAME OVER ------ */
    _enterGameOver(previousState) {
        const wasScared = previousState === GameState.JUMPSCARE;

        DOM.gameoverTitle.textContent = wasScared ? 'YOU WERE TAKEN' : 'TIME\'S UP';
        DOM.gameoverSubtitle.textContent = wasScared
            ? 'Your nerves failed you.'
            : 'You couldn\'t keep up.';
        DOM.finalScore.textContent = this.score;
        DOM.finalLevel.textContent = this.currentLevel;
        DOM.finalCleared.textContent = this.tilesCleared;
        DOM.finalCause.textContent = wasScared ? 'Jumpscared' : 'Too Slow';
    }

    /* ------ FULLSCREEN API HELPERS ------ */
    _requestFullscreen() {
        const el = document.documentElement;
        const rfs = el.requestFullscreen
            || el.webkitRequestFullscreen
            || el.msRequestFullscreen;
        if (rfs) {
            try { rfs.call(el); } catch (_) { /* fullscreen denied — continue */ }
        }
    }

    _exitFullscreen() {
        const efs = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.msExitFullscreen;
        if (efs && document.fullscreenElement) {
            try { efs.call(document); } catch (_) { /* ignore */ }
        }
    }

    /* ------ UTILITY ------ */
    _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
}

/* ==========================================================
   8. APPLICATION BOOTSTRAP
   ========================================================== */
(function bootstrap() {
    const audioEngine = new AudioEngine();
    const preloader = new AssetPreloader(audioEngine);
    const game = new GameEngine(audioEngine, preloader);
    game.init();
})();
