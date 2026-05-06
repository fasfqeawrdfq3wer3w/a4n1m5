(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // UA de escritorio para que los servidores sirvan contenido de mayor calidad
  const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  function proxyFetch(url, timeoutMs) {
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url)
                + '&user_agent=' + encodeURIComponent(DESKTOP_UA);
    const opts = timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {};
    return fetch(proxy, opts).then(r => r.json());
  }

  function isDirectVideo(url) {
    // Extensión al final o tipo en el path (ej: /m3u8/hash, /mp4/hash)
    return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url) ||
           /[\/=](mp4|webm|ogg|m3u8)[\/\?&]?/i.test(url);
  }
  function isHLS(url) {
    return /\.m3u8(\?.*)?$/i.test(url) ||
           /[\/=]m3u8[\/\?&]?/i.test(url);
  }

  // Detecta el tipo real de una URL haciendo HEAD request cuando
  // la extensión no es suficiente para determinarlo
  function detectVideoType(url) {
    // Si la URL ya tiene extensión reconocible, no hace falta fetch
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return Promise.resolve('mp4');
    if (/\.m3u8(\?.*)?$/i.test(url)) return Promise.resolve('hls');

    // Si parece un player embed (dominio con /play/, /embed/, /player/, etc.)
    // no intentar fetch — es una página web, no un archivo de video
    if (/\/(play|embed|player|watch|stream|video)\//i.test(url)) return Promise.resolve('iframe');
    if (/\/(play|embed|player|watch)\b/i.test(url)) return Promise.resolve('iframe');

    // Intentar HEAD request directo (sin proxy) para ver Content-Type
    return fetch(url, { method: 'HEAD', mode: 'no-cors' })
      .then(() => {
        return proxyFetch(url, 5000)
          .then(data => {
            const ct = (data.content_type || '').toLowerCase();
            if (ct.includes('mpegurl') || ct.includes('x-mpegurl') || ct.includes('m3u8')) return 'hls';
            if (ct.includes('mp4') || ct.includes('video/') || ct.includes('octet-stream')) return 'mp4';
            const body = (data.contents || '').trimStart();
            if (body.startsWith('#EXTM3U')) return 'hls';
            return 'iframe';
          });
      })
      .catch(() => 'iframe'); // Si falla cualquier fetch → tratar como iframe
  }

  // ── Desofuscador / extractor de URL real ──────────────────
  function resolveUrl(server) {
    const url = server.url;
    if (!url) return Promise.resolve('');
    if (!server.deobfuscate) return Promise.resolve(url);

    return proxyFetch(url)
      .then(data => {
        let code = data.contents || '';
        if (!code) return url;
        for (let i = 0; i < 10; i++) {
          const decoded = tryUnpack(code);
          if (!decoded || decoded === code) break;
          code = decoded;
        }
        return extractVideoUrl(code) || url;
      })
      .catch(() => url);
  }

  function extractVideoUrl(code) {
    const patterns = [
      /["']?(?:file|src|url|source|hls|mp4|stream|video)["']?\s*:\s*["'`](https?:\/\/[^"'`\s,}]+)/i,
      /(?:file|src|url|source)\s*=\s*["'`](https?:\/\/[^"'`\s]+)/i,
      /(https?:\/\/[^\s"'`]+\.(?:m3u8|mp4|webm|ogg)(?:\?[^\s"'`]*)?)/i,
    ];
    for (const re of patterns) {
      const m = code.match(re);
      if (m) return m[1];
    }
    return null;
  }

  function tryUnpack(code) {
    const packed = unpackPACKED(code);
    if (packed) return packed;
    const b64m = code.match(/eval\s*\(\s*atob\s*\(\s*['"`]([\s\S]+?)['"`]\s*\)\s*\)/);
    if (b64m) { try { return atob(b64m[1]); } catch {} }
    const urim = code.match(/eval\s*\(\s*decodeURIComponent\s*\(\s*['"`]([\s\S]+?)['"`]\s*\)\s*\)/);
    if (urim) { try { return decodeURIComponent(urim[1]); } catch {} }
    const strm = code.match(/^[\s]*eval\s*\(\s*(['"`])([\s\S]*)\1\s*\)\s*;?\s*$/);
    if (strm) return strm[2]
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (/\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}/.test(code))
      return code
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return null;
  }

  function unpackPACKED(code) {
    const m = code.match(/eval\s*\(\s*function\s*\(p,a,c,k,e[^)]*\)\s*\{[\s\S]*?\}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'[\s\S]*?\)\s*\)/);
    if (!m) return null;
    try {
      const p = m[1], a = parseInt(m[2]), c = parseInt(m[3]), k = m[4].split('|');
      let result = p;
      for (let i = c - 1; i >= 0; i--) {
        if (k[i]) result = result.replace(new RegExp('\\b' + i.toString(a) + '\\b', 'g'), k[i]);
      }
      return result;
    } catch { return null; }
  }

  function fmtTime(s) {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return m + ':' + ss;
  }

  let activeLang   = 0;
  let activeServer = 0;
  let hlsInstance  = null;
  let hideTimer    = null;

  // ── Progreso / continuar viendo ───────────────────────────
  // La clave incluye un hash de la URL para que el progreso sea
  // exclusivo del video exacto (servidor + idioma). Si cambia la URL
  // no aparece el toast de continuar viendo.
  function urlHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return (h >>> 0).toString(36);
  }

  function resumeKey(url) {
    const ep = window.EPISODE;
    const base = 'resume_' + ep.serieId + '_s' + (ep.seasonIdx ?? 0) + '_e' + ep.num;
    return url ? base + '_' + urlHash(url) : base;
  }

  function saveProgress(url, currentTime, duration) {
    if (!url || !duration || currentTime < 5) return;
    if (currentTime / duration > 0.95) {
      localStorage.removeItem(resumeKey(url));
      return;
    }
    localStorage.setItem(resumeKey(url), String(Math.floor(currentTime)));
  }

  function getSavedTime(url) {
    if (!url) return 0;
    const t = parseInt(localStorage.getItem(resumeKey(url)) || '0', 10);
    return t > 5 ? t : 0;
  }

  function showResumeToast(savedTime, onResume, onDismiss) {
    const existing = document.getElementById('vp-resume-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vp-resume-overlay';
    overlay.innerHTML = `
      <div id="vp-resume-modal">
        <div class="vp-resume-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="vp-resume-title">Continuar viendo</div>
        <div class="vp-resume-sub">Quedaste en <strong>${fmtTime(savedTime)}</strong></div>
        <div class="vp-resume-btns">
          <button class="vp-resume-btn vp-resume-yes">Continuar</button>
          <button class="vp-resume-btn vp-resume-no">Desde el inicio</button>
        </div>
      </div>`;
    document.getElementById('player-wrap').appendChild(overlay);

    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

    const dismissTimer = setTimeout(() => dismiss(true), 10000);

    function dismiss(doResume) {
      clearTimeout(dismissTimer);
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 280);
      if (doResume) onResume();
      else onDismiss();
    }

    overlay.querySelector('.vp-resume-yes').addEventListener('click', () => dismiss(true));
    overlay.querySelector('.vp-resume-no').addEventListener('click',  () => dismiss(false));
  }

  function buildSelects() {
    // se usa picker nativo
  }

  function openPicker(type) {
    const ep = window.EPISODE;
    const isLang = type === 'lang';
    const items = isLang
      ? ep.langs.map((l, i) => ({ label: l.name, idx: i }))
      : ep.langs[activeLang].servers.map((s, i) => ({ label: s.name, idx: i }));
    const current = isLang ? activeLang : activeServer;

    const sel = document.createElement('select');
    sel.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:0;left:0';
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = String(it.idx);
      opt.textContent = it.label;
      if (it.idx === current) opt.selected = true;
      sel.appendChild(opt);
    });
    document.body.appendChild(sel);

    sel.addEventListener('change', () => {
      const idx = +sel.value;
      if (isLang) { activeLang = idx; activeServer = 0; } else { activeServer = idx; }
      updateLabels();
      renderPlayer(true);
      sel.remove();
    });
    sel.addEventListener('blur', () => setTimeout(() => sel.remove(), 300));
    try { sel.showPicker(); } catch { sel.focus(); sel.click(); }
  }

  // ── Overlay cargando servidor ─────────────────────────────
  function createLoadingOverlay(parent) {
    const el = document.createElement('div');
    el.className = 'vp-loading';
    el.innerHTML = `
      <div class="vp-loading-ring">
        <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/></svg>
      </div>
      <span class="vp-loading-text">Cargando servidor...</span>`;
    parent.appendChild(el);
    return {
      hide() {
        el.classList.add('done');
        setTimeout(() => el.remove(), 420);
      }
    };
  }

  // ── Reproductor nativo ligero ─────────────────────────────
  function buildVideoPlayer(wrap, url, poster, videoType) {
    // HLS ya fue destruido en renderPlayer; solo limpiar si hay contenido residual
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    // Limpiar solo nodos que no sean el loader (ya visible)
    Array.from(wrap.children).forEach(c => {
      if (!c.classList.contains('vp-loading')) c.remove();
    });

    const container = document.createElement('div');
    container.className = 'vp-wrap';
    wrap.appendChild(container);

    // Video
    const v = document.createElement('video');
    v.id = 'player-video';
    v.setAttribute('playsinline', '');
    if (poster) v.poster = poster;
    container.appendChild(v);

    // HLS o src directo
    if ((videoType === 'hls' || isHLS(url)) && window.Hls && window.Hls.isSupported()) {
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      hlsInstance = new window.Hls({
        maxBufferLength:            isMobile ? 6   : 30,
        maxMaxBufferLength:         isMobile ? 12  : 60,
        maxBufferSize:              isMobile ? 10 * 1000 * 1000 : 60 * 1000 * 1000,
        maxBufferHole:              0.5,
        highBufferWatchdogPeriod:   1,
        nudgeOffset:                0.3,
        nudgeMaxRetry:              8,
        startLevel:                 isMobile ? 0  : -1,
        abrEwmaDefaultEstimate:     isMobile ? 200000 : 1500000,
        abrBandWidthFactor:         isMobile ? 0.5 : 0.9,
        abrBandWidthUpFactor:       isMobile ? 0.3 : 0.7,
        capLevelToPlayerSize:       true,
        fragLoadingMaxRetry:        8,
        fragLoadingRetryDelay:      300,
        fragLoadingMaxRetryTimeout: 3000,
        manifestLoadingMaxRetry:    4,
        levelLoadingMaxRetry:       4,
        autoStartLoad:              true,
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(v);

      // ── Watchdog: detecta video congelado y fuerza recovery ──
      let lastTime = 0, frozenMs = 0, mediaErrCount = 0;
      let stallLevel = -1; // nivel al que se bajó por stall
      const FROZEN_THRESHOLD = 1500; // ms sin avanzar antes de actuar
      const watchdog = setInterval(() => {
        if (v.paused || v.ended || !hlsInstance) return;
        if (v.currentTime !== lastTime) {
          lastTime = v.currentTime;
          frozenMs = 0;
          return;
        }
        frozenMs += 500;
        if (frozenMs < FROZEN_THRESHOLD) return;
        frozenMs = 0;

        // Paso 1: hay buffer adelante → micro-salto para desatascar el decoder
        if (v.buffered.length) {
          const ahead = v.buffered.end(v.buffered.length - 1) - v.currentTime;
          if (ahead > 0.3) {
            v.currentTime += 0.2;
            return;
          }
        }

        // Paso 2: bajar calidad si no estamos ya en la más baja
        const cur = hlsInstance.currentLevel;
        if (cur > 0) {
          stallLevel = cur - 1;
          hlsInstance.currentLevel = stallLevel;
          hlsInstance.startLoad();
          return;
        }

        // Paso 3: recovery de media error
        if (mediaErrCount < 3) {
          mediaErrCount++;
          hlsInstance.recoverMediaError();
          return;
        }

        // Paso 4: reinicio completo como último recurso
        mediaErrCount = 0;
        const t = v.currentTime;
        hlsInstance.destroy();
        hlsInstance = new window.Hls({ autoStartLoad: true, startLevel: 0 });
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(v);
        hlsInstance.once(window.Hls.Events.MANIFEST_PARSED, () => {
          v.currentTime = t;
          v.play().catch(() => {});
        });
      }, 500);

      // Limpiar watchdog cuando se destruya el player
      v.addEventListener('emptied', () => clearInterval(watchdog), { once: true });

      // Recovery de errores fatales HLS
      hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          setTimeout(() => hlsInstance && hlsInstance.startLoad(), 1000);
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          hlsInstance.recoverMediaError();
        } else {
          clearInterval(watchdog);
          hlsInstance.destroy();
          hlsInstance = null;
          v.src = url;
        }
      });

    } else if ((videoType === 'hls' || isHLS(url)) && v.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS soporta HLS nativo
      v.src = url;
    } else {
      v.src = url;
    }

    // Zonas de doble tap
    const tapL = document.createElement('div'); tapL.className = 'vp-tap-left';
    const tapR = document.createElement('div'); tapR.className = 'vp-tap-right';
    const ripL = document.createElement('div'); ripL.className = 'vp-seek-ripple';
    ripL.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6"/></svg><span>-10s</span>`;
    const ripR = document.createElement('div'); ripR.className = 'vp-seek-ripple';
    ripR.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/><polyline points="15 18 21 12 15 6"/></svg><span>+10s</span>`;
    tapL.appendChild(ripL); tapR.appendChild(ripR);
    container.appendChild(tapL); container.appendChild(tapR);

    // Controles overlay
    const ctrl = document.createElement('div');
    ctrl.className = 'vp-controls';
    ctrl.innerHTML = `
      <div class="vp-play-center" id="vp-play-center">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div class="vp-bottom">
        <div class="vp-progress" id="vp-progress">
          <div class="vp-progress-buffer" id="vp-buffer"></div>
          <div class="vp-progress-fill" id="vp-fill" style="width:0%"></div>
        </div>
        <div class="vp-row">
          <button class="vp-btn" id="vp-play-btn" aria-label="Play/Pausa">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <span class="vp-time" id="vp-time">0:00 / 0:00</span>
          <div class="vp-spacer"></div>
          <button class="vp-btn" id="vp-fit-btn" aria-label="Ajuste de imagen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2"/></svg>
          </button>
          <button class="vp-btn" id="vp-mute-btn" aria-label="Silenciar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
          <button class="vp-btn" id="vp-fs-btn" aria-label="Pantalla completa">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>`;
    container.appendChild(ctrl);

    // Loader inicial
    const vidLoader = createLoadingOverlay(container);
    let loaderHidden = false;
    function hideLoader() {
      if (loaderHidden) return;
      loaderHidden = true;
      vidLoader.hide();
    }
    v.addEventListener('canplay', hideLoader, { once: true });
    const loaderFallback = setTimeout(hideLoader, 10000);

    // Spinner de buffering
    const spinner = document.createElement('div');
    spinner.className = 'vp-spinner';
    spinner.style.display = 'none';
    spinner.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/></svg>`;
    container.appendChild(spinner);

    // Badge de modo ajuste
    const fitBadge = document.createElement('div');
    fitBadge.className = 'vp-fit-badge';
    container.appendChild(fitBadge);

    const playCenter = ctrl.querySelector('#vp-play-center');
    const playBtn    = ctrl.querySelector('#vp-play-btn');
    const muteBtn    = ctrl.querySelector('#vp-mute-btn');
    const fsBtn      = ctrl.querySelector('#vp-fs-btn');
    const fitBtn     = ctrl.querySelector('#vp-fit-btn');
    const progress   = ctrl.querySelector('#vp-progress');
    const fill       = ctrl.querySelector('#vp-fill');
    const buffer     = ctrl.querySelector('#vp-buffer');
    const timeEl     = ctrl.querySelector('#vp-time');

    const PLAY_SVG  = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const PAUSE_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    const FS_SVG    = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    const EXIT_FS   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>`;
    const FIT_COVER_SVG   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="5" width="22" height="14" rx="1"/><line x1="1" y1="12" x2="23" y2="12" stroke-dasharray="2 2"/></svg>`;
    const FIT_CONTAIN_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2"/></svg>`;

    // ── Modo ajuste: contain (normal) ↔ cover (ancho completo) ──
    let fitMode = 'contain';
    function applyFit(mode, showBadge) {
      fitMode = mode;
      v.style.objectFit = mode;
      fitBtn.innerHTML = mode === 'cover' ? FIT_COVER_SVG : FIT_CONTAIN_SVG;
      if (showBadge) {
        fitBadge.textContent = mode === 'cover' ? 'Ancho completo' : 'Normal';
        fitBadge.classList.add('show');
        clearTimeout(fitBadge._t);
        fitBadge._t = setTimeout(() => fitBadge.classList.remove('show'), 1400);
      }
    }
    applyFit('contain', false);

    fitBtn.addEventListener('click', e => {
      e.stopPropagation();
      applyFit(fitMode === 'contain' ? 'cover' : 'contain', true);
      showControls();
    });

    function updatePlayIcon() {
      const svg = v.paused ? PLAY_SVG : PAUSE_SVG;
      playBtn.innerHTML = svg;
      playCenter.innerHTML = svg;
    }

    function showControls() {
      ctrl.classList.remove('hidden');
      clearTimeout(hideTimer);
      if (!v.paused) hideTimer = setTimeout(() => ctrl.classList.add('hidden'), 3000);
    }

    function togglePlay() { v.paused ? v.play() : v.pause(); showControls(); }

    playCenter.addEventListener('click', togglePlay);
    playBtn.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });

    v.addEventListener('play',    () => { updatePlayIcon(); spinner.style.display = 'none'; showControls(); });
    v.addEventListener('pause',   () => { updatePlayIcon(); showControls(); });
    v.addEventListener('waiting', () => { spinner.style.display = ''; });
    v.addEventListener('stalled', () => { spinner.style.display = ''; });
    v.addEventListener('canplay', () => { clearTimeout(loaderFallback); spinner.style.display = 'none'; });
    v.addEventListener('playing', () => { spinner.style.display = 'none'; });

    // ── Continuar viendo ──
    let saveInterval = null;
    let pendingResume = 0; // tiempo a restaurar cuando el video esté listo

    function applyResume(t) {
      // readyState >= 1 (HAVE_METADATA) y duration conocida → puede hacer seek
      if (v.duration > 0 && isFinite(v.duration)) {
        v.currentTime = t;
        pendingResume = 0;
      } else {
        // Reintentar cuando haya metadata
        pendingResume = t;
      }
    }

    v.addEventListener('loadedmetadata', () => {
      const saved = getSavedTime(url);
      if (saved > 0 && v.duration > 0 && saved < v.duration * 0.95) {
        showResumeToast(
          saved,
          () => applyResume(saved),
          () => {}
        );
      } else if (pendingResume > 0) {
        applyResume(pendingResume);
      }
      saveInterval = setInterval(() => {
        if (!v.paused && !v.ended) saveProgress(url, v.currentTime, v.duration);
      }, 5000);
    });

    // Para HLS: duration puede llegar tarde, reintentar el seek pendiente
    v.addEventListener('durationchange', () => {
      if (pendingResume > 0 && v.duration > 0 && isFinite(v.duration)) {
        if (pendingResume < v.duration * 0.95) {
          v.currentTime = pendingResume;
        }
        pendingResume = 0;
      }
    });

    // Fallback: si al primer canplay aún hay seek pendiente, aplicarlo
    v.addEventListener('canplay', () => {
      if (pendingResume > 0 && v.duration > 0) {
        if (pendingResume < v.duration * 0.95) v.currentTime = pendingResume;
        pendingResume = 0;
      }
    }, { once: true });
    v.addEventListener('ended', () => {
      clearInterval(saveInterval);
      localStorage.removeItem(resumeKey(url));
    });

    v.addEventListener('timeupdate', () => {
      if (!v.duration) return;
      fill.style.width = (v.currentTime / v.duration * 100) + '%';
      timeEl.textContent = fmtTime(v.currentTime) + ' / ' + fmtTime(v.duration);
    });

    v.addEventListener('progress', () => {
      if (!v.duration || !v.buffered.length) return;
      buffer.style.width = (v.buffered.end(v.buffered.length - 1) / v.duration * 100) + '%';
    });

    // Progreso — drag
    let dragging = false;
    function seekTo(e) {
      const rect = progress.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      if (v.duration) v.currentTime = pct * v.duration;
      fill.style.width = (pct * 100) + '%';
    }
    progress.addEventListener('mousedown',  e => { dragging = true; progress.classList.add('dragging'); seekTo(e); });
    progress.addEventListener('touchstart', e => { dragging = true; progress.classList.add('dragging'); seekTo(e); }, { passive: true });
    document.addEventListener('mousemove',  e => { if (dragging) seekTo(e); });
    document.addEventListener('touchmove',  e => { if (dragging) seekTo(e); }, { passive: true });
    document.addEventListener('mouseup',    () => { dragging = false; progress.classList.remove('dragging'); });
    document.addEventListener('touchend',   () => { dragging = false; progress.classList.remove('dragging'); });

    // Mute
    muteBtn.addEventListener('click', e => { e.stopPropagation(); v.muted = !v.muted; updateMuteIcon(); });
    function updateMuteIcon() {
      muteBtn.innerHTML = v.muted
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    }

    // Fullscreen
    fsBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!document.fullscreenElement) {
        (container.requestFullscreen || container.webkitRequestFullscreen).call(container);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fsBtn.innerHTML = document.fullscreenElement ? EXIT_FS : FS_SVG;
    });

    // Tap central: toggle controles
    container.addEventListener('click', e => {
      if (e.target.closest('.vp-btn, .vp-progress, .vp-tap-left, .vp-tap-right, .vp-play-center')) return;
      ctrl.classList.contains('hidden') ? showControls() : ctrl.classList.add('hidden');
    });

    // Doble tap: -10s izquierda, +10s derecha
    function doubleTapSeek(zone, seconds, ripple) {
      let taps = 0, tapTimer;
      zone.addEventListener('click', e => {
        e.stopPropagation();
        taps++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
          if (taps >= 2) {
            v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
            ripple.classList.add('show');
            setTimeout(() => ripple.classList.remove('show'), 700);
          } else {
            ctrl.classList.contains('hidden') ? showControls() : ctrl.classList.add('hidden');
          }
          taps = 0;
        }, 260);
      });
    }
    doubleTapSeek(tapL, -10, ripL);
    doubleTapSeek(tapR, +10, ripR);

    // ── Pinch: alterna contain ↔ cover ──
    let pinchStartDist = 0, pinchTriggered = false;
    container.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        pinchTriggered = false;
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && !pinchTriggered) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const delta = newDist - pinchStartDist;
        if (Math.abs(delta) > 30) {
          pinchTriggered = true;
          applyFit(delta > 0 ? 'cover' : 'contain', true);
        }
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchend', () => {
      pinchTriggered = false;
    });

    showControls();
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    if (!window.EPISODE) return;
    const ep = window.EPISODE;

    document.title = ep.title + ' - ANiGo';
    $('header-title').textContent = ep.serieTitle + ' · Ep. ' + ep.num;

    const backUrl = ep.serieUrl || 'serie.html';
    $('btn-back').onclick = () => { location.href = backUrl; };

    buildSelects();
    $('btn-lang').onclick = () => openPicker('lang');
    $('btn-srv').onclick  = () => openPicker('srv');

    const prevBtn = $('btn-prev');
    const nextBtn = $('btn-next');
    if (ep.type === 'movie') {
      $('player-footer').style.display = 'none';
    } else {
      prevBtn.disabled = !ep.prevUrl;
      prevBtn.onclick  = () => { if (ep.prevUrl) location.href = ep.prevUrl; };
      nextBtn.disabled = !ep.nextUrl;
      nextBtn.onclick  = () => { if (ep.nextUrl) location.href = ep.nextUrl; };
    }

    updateLabels();
    renderPlayer(false);
  }

  function updateLabels() {
    const ep   = window.EPISODE;
    const lang = ep.langs[activeLang];
    $('btn-lang-label').textContent = lang.name;
    $('btn-srv-label').textContent  = lang.servers[activeServer].name;
  }

  function updateCast(url) {
    const castBtn = $('btn-cast');
    if (!url) { castBtn.classList.add('hidden'); return; }
    castBtn.classList.remove('hidden');
    castBtn._castUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=${url.startsWith('https') ? 'https' : 'http'};package=com.instantbits.cast.webvideo;end`;
    castBtn.onclick = () => { window.location.href = castBtn._castUrl; };
  }

  function loadIframe(wrap, url, server, loader) {
    const f = document.createElement('iframe');
    f.id = 'player-frame';
    f.src = url;
    f.allowFullscreen = true;
    f.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#000';
    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    f.setAttribute('scrolling', 'no');
    if (server && server.sandbox) {
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-fullscreen');
    }
    const iframeWrap = document.createElement('div');
    iframeWrap.style.cssText = 'position:relative;width:100%;height:100%';
    const adBlocker = document.createElement('div');
    adBlocker.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none';
    const origOpen = window.open;
    window.open = () => null;
    iframeWrap.appendChild(f);
    iframeWrap.appendChild(adBlocker);
    wrap.appendChild(iframeWrap);
    f.addEventListener('load', () => { loader.hide(); window.open = origOpen; }, { once: true });
    setTimeout(() => { loader.hide(); window.open = origOpen; }, 15000);
  }

  function renderPlayer(animate) {
    const ep   = window.EPISODE;
    const wrap = $('player-wrap');

    // Destruir HLS anterior inmediatamente para liberar recursos
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

    // Mostrar loader ANTES de limpiar el contenido, así nunca hay pantalla negra
    wrap.innerHTML = '';
    wrap.classList.remove('loaded', 'switching');
    const loader = createLoadingOverlay(wrap);

    const doRender = () => {
      const server = ep.langs[activeLang].servers[activeServer];

      resolveUrl(server).then(resolved => {
        const url    = typeof resolved === 'object' ? resolved.url    : resolved;
        const poster = typeof resolved === 'object' ? resolved.poster : (ep.poster || '');

        updateCast(url);

        if (!url) {
          loader.hide();
          wrap.innerHTML = `<div class="player-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <p>Sin URL — elige otro servidor</p>
          </div>`;
          wrap.classList.add('loaded'); return;
        }

        if (isDirectVideo(url)) {
          loader.hide();
          buildVideoPlayer(wrap, url, poster, isHLS(url) ? 'hls' : 'mp4');
        } else if (/^https?:\/\//i.test(url)) {
          detectVideoType(url).then(videoType => {
            loader.hide();
            if (videoType === 'hls' || videoType === 'mp4') {
              buildVideoPlayer(wrap, url, poster, videoType);
            } else {
              loadIframe(wrap, url, server, loader);
            }
          });
        } else {
          loadIframe(wrap, url, server, loader);
        }

        requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('loaded')));

        if (localStorage.getItem('auto_watched') === '1') {
          const key = 'watched_' + ep.serieId;
          const map = JSON.parse(localStorage.getItem(key) || '{}');
          if (!map.seasons) map.seasons = {};
          if (!map.seasons[ep.seasonIdx]) map.seasons[ep.seasonIdx] = {};
          map.seasons[ep.seasonIdx][ep.num] = true;
          localStorage.setItem(key, JSON.stringify(map));
        }
      });
    };

    // El loader ya está visible, el delay solo es para la animación de salida
    animate ? setTimeout(doRender, 120) : doRender();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
