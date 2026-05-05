(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  function isDirectVideo(url) {
    return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url);
  }
  function isHLS(url) {
    return /\.m3u8(\?.*)?$/i.test(url);
  }

  // ── Desofuscador / extractor de URL real ──────────────────
  function resolveUrl(server) {
    const url = server.url;
    if (!url) return Promise.resolve('');

    // Sin desofuscación — usar URL directamente
    if (!server.deobfuscate) return Promise.resolve(url);

    // Con deobfuscate:true — fetchear via proxy y desofuscar
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    return fetch(proxyUrl)
      .then(r => r.json())
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
    // Patrones comunes: file, src, url, source, hls, mp4, stream
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

  // ── Selects nativos ───────────────────────────────────────
  let selLang, selSrv;

  function buildSelects() {
    // selects eliminados — se usa prompt nativo
  }

  function openPicker(type) {
    const ep = window.EPISODE;
    const isLang = type === 'lang';
    const items = isLang
      ? ep.langs.map((l, i) => ({ label: l.name, idx: i }))
      : ep.langs[activeLang].servers.map((s, i) => ({ label: s.name, idx: i }));
    const current = isLang ? activeLang : activeServer;

    // Crear select oculto, poblarlo y abrir picker nativo
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

  // ── Reproductor custom ────────────────────────────────────
  function buildVideoPlayer(wrap, url, poster) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

    wrap.innerHTML = '';

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
    if (isHLS(url) && window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls();
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(v);
    } else {
      v.src = url;
    }

    // Zonas doble tap
    const tapL = document.createElement('div'); tapL.className = 'vp-tap-left';
    const tapR = document.createElement('div'); tapR.className = 'vp-tap-right';
    const ripL = document.createElement('div'); ripL.className = 'vp-seek-ripple';
    ripL.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6"/></svg><span>-10s</span>`;
    const ripR = document.createElement('div'); ripR.className = 'vp-seek-ripple';
    ripR.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/><polyline points="15 18 21 12 15 6"/></svg><span>+10s</span>`;
    tapL.appendChild(ripL); tapR.appendChild(ripR);
    container.appendChild(tapL); container.appendChild(tapR);

    // Controles overlay
    const ctrl = document.createElement('div');
    ctrl.className = 'vp-controls';
    ctrl.innerHTML = `
      <div class="vp-play-center" id="vp-play-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
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
          <div class="vp-vol-wrap">
            <button class="vp-btn" id="vp-mute-btn" aria-label="Mute">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </button>
            <input class="vp-vol-slider" id="vp-vol" type="range" min="0" max="1" step="0.05" value="1">
          </div>
          <button class="vp-btn" id="vp-fs-btn" aria-label="Pantalla completa">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>`;
    container.appendChild(ctrl);

    // Loader encima de todo — se oculta cuando hay duración disponible
    const vidLoader = createLoadingOverlay(container);
    let loaderHidden = false;
    function hideLoader() {
      if (loaderHidden) return;
      loaderHidden = true;
      vidLoader.hide();
    }
    // En móvil loadedmetadata puede no tener duración aún, usamos canplay como señal segura
    v.addEventListener('canplay', hideLoader, { once: true });
    // Fallback por si canplay nunca llega (error de red, formato no soportado)
    const loaderFallback = setTimeout(hideLoader, 10000);

    // Spinner (buffering mid-play)
    const spinner = document.createElement('div');
    spinner.className = 'vp-spinner';
    spinner.style.display = 'none';
    spinner.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/></svg>`;
    container.appendChild(spinner);

    const playCenter = ctrl.querySelector('#vp-play-center');
    const playBtn    = ctrl.querySelector('#vp-play-btn');
    const muteBtn    = ctrl.querySelector('#vp-mute-btn');
    const fsBtn      = ctrl.querySelector('#vp-fs-btn');
    const progress   = ctrl.querySelector('#vp-progress');
    const fill       = ctrl.querySelector('#vp-fill');
    const buffer     = ctrl.querySelector('#vp-buffer');
    const timeEl     = ctrl.querySelector('#vp-time');
    const volSlider  = ctrl.querySelector('#vp-vol');

    const PLAY_SVG  = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const PAUSE_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    const FS_SVG    = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    const EXIT_FS   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>`;

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
    playBtn.addEventListener('click', togglePlay);

    v.addEventListener('play',  () => { updatePlayIcon(); spinner.style.display = 'none'; showControls(); });
    v.addEventListener('pause', () => { updatePlayIcon(); showControls(); });
    v.addEventListener('waiting', () => { spinner.style.display = ''; });
    v.addEventListener('canplay', () => { clearTimeout(loaderFallback); spinner.style.display = 'none'; });

    v.addEventListener('timeupdate', () => {
      if (!v.duration) return;
      const pct = (v.currentTime / v.duration) * 100;
      fill.style.width = pct + '%';
      timeEl.textContent = fmtTime(v.currentTime) + ' / ' + fmtTime(v.duration);
    });

    v.addEventListener('progress', () => {
      if (!v.duration || !v.buffered.length) return;
      buffer.style.width = ((v.buffered.end(v.buffered.length - 1) / v.duration) * 100) + '%';
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

    // Volumen
    volSlider.addEventListener('input', () => { v.volume = +volSlider.value; v.muted = v.volume === 0; updateMuteIcon(); });
    muteBtn.addEventListener('click', () => { v.muted = !v.muted; updateMuteIcon(); });
    function updateMuteIcon() {
      muteBtn.innerHTML = v.muted || v.volume === 0
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    }

    // Fullscreen
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        (container.requestFullscreen || container.webkitRequestFullscreen).call(container);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fsBtn.innerHTML = document.fullscreenElement ? EXIT_FS : FS_SVG;
    });

    // Tap para mostrar/ocultar controles
    let lastTap = 0;
    container.addEventListener('click', e => {
      if (e.target.closest('.vp-btn, .vp-progress, .vp-vol-slider, .vp-play-center')) return;
      const now = Date.now();
      if (now - lastTap < 300) return; // ignorar doble tap aquí
      lastTap = now;
      ctrl.classList.contains('hidden') ? showControls() : ctrl.classList.add('hidden');
    });

    // Doble tap seek
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
            // tap simple: toggle controles
            ctrl.classList.contains('hidden') ? showControls() : ctrl.classList.add('hidden');
          }
          taps = 0;
        }, 250);
      });
    }
    doubleTapSeek(tapL, -10, ripL);
    doubleTapSeek(tapR, +10, ripR);

    // ── Pinch to zoom + pan ──
    let scale = 1, panX = 0, panY = 0;
    let initDist = 0, initScale = 1;
    let initPanX = 0, initPanY = 0;
    let midX = 0, midY = 0;
    let isPinching = false;

    // Indicador de zoom
    const zoomBadge = document.createElement('div');
    zoomBadge.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:#00E676;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;pointer-events:none;opacity:0;transition:opacity 0.3s;z-index:6;backdrop-filter:blur(4px)';
    container.appendChild(zoomBadge);
    let zoomBadgeTimer;
    function showZoomBadge() {
      zoomBadge.textContent = Math.round(scale * 10) / 10 + 'x';
      zoomBadge.style.opacity = '1';
      clearTimeout(zoomBadgeTimer);
      zoomBadgeTimer = setTimeout(() => { zoomBadge.style.opacity = '0'; }, 1200);
    }

    function applyTransform() {
      // Limitar pan según el zoom actual
      const maxX = (scale - 1) * container.clientWidth  / 2;
      const maxY = (scale - 1) * container.clientHeight / 2;
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
      v.style.transform = `scale(${scale}) translate(${panX / scale}px, ${panY / scale}px)`;
      v.style.transformOrigin = 'center center';
    }

    function dist(t) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    container.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        isPinching = true;
        initDist  = dist(e.touches);
        initScale = scale;
        initPanX  = panX;
        initPanY  = panY;
        midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && isPinching) {
        const newDist = dist(e.touches);
        scale = Math.max(1, Math.min(4, initScale * (newDist / initDist)));
        // Pan proporcional al movimiento del centro
        const newMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const newMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        panX = initPanX + (newMidX - midX);
        panY = initPanY + (newMidY - midY);
        applyTransform();
        showZoomBadge();
        e.preventDefault();
      } else if (e.touches.length === 1 && scale > 1 && !dragging) {
        // Pan con un dedo cuando está zoomeado
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchend', e => {
      if (e.touches.length < 2) {
        isPinching = false;
        // Snap a 1x si está muy cerca
        if (scale < 1.1) { scale = 1; panX = 0; panY = 0; applyTransform(); showZoomBadge(); }
      }
    });

    // Pan con un dedo cuando está zoomeado
    let panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0, isPanning = false;
    container.addEventListener('touchstart', e => {
      if (e.touches.length === 1 && scale > 1) {
        isPanning = true;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        panStartPanX = panX;
        panStartPanY = panY;
      }
    }, { passive: true });
    container.addEventListener('touchmove', e => {
      if (isPanning && e.touches.length === 1 && scale > 1 && !dragging) {
        panX = panStartPanX + (e.touches[0].clientX - panStartX);
        panY = panStartPanY + (e.touches[0].clientY - panStartY);
        applyTransform();
      }
    }, { passive: true });
    container.addEventListener('touchend', () => { isPanning = false; });

    // Doble tap para reset zoom
    container.addEventListener('dblclick', e => {
      if (e.target.closest('.vp-btn, .vp-progress, .vp-vol-slider')) return;
      if (scale > 1) { scale = 1; panX = 0; panY = 0; applyTransform(); showZoomBadge(); }
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

  function updateCast(url, isDirect) {
    const castBtn = $('btn-cast');
    if (!url) { castBtn.classList.add('hidden'); return; }
    castBtn.classList.remove('hidden');
    castBtn._castUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=${url.startsWith('https') ? 'https' : 'http'};package=com.instantbits.cast.webvideo;end`;
    castBtn.onclick = () => {
      window.location.href = castBtn._castUrl;
    };
  }

  function renderPlayer(animate) {
    const ep   = window.EPISODE;
    const wrap = $('player-wrap');

    if (animate) { wrap.classList.remove('loaded'); wrap.classList.add('switching'); }

    const doRender = () => {
      wrap.innerHTML = '';
      wrap.classList.remove('switching');

      const server = ep.langs[activeLang].servers[activeServer];

      // Mostrar loading mientras resuelve
      const loader = createLoadingOverlay(wrap);

      resolveUrl(server).then(resolved => {
        const url    = typeof resolved === 'object' ? resolved.url    : resolved;
        const poster = typeof resolved === 'object' ? resolved.poster : (ep.poster || '');

        updateCast(url, isDirectVideo(url));

        if (!url) {
          loader.hide();
          wrap.innerHTML = `<div class="player-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <p>Sin URL — elige otro servidor</p>
          </div>`;
          wrap.classList.add('loaded'); return;
        }

        if (isDirectVideo(url)) {
          // buildVideoPlayer limpia wrap y crea su propio loader interno
          loader.hide();
          buildVideoPlayer(wrap, url, poster);
        } else {
          const f = document.createElement('iframe');
          f.id = 'player-frame';
          f.src = url;
          f.allowFullscreen = true;
          f.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#000';
          // allow autoplay y fullscreen; sin downloads ni popups
          f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
          f.setAttribute('scrolling', 'no');
          if (server.sandbox) {
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-fullscreen');
          }

          const iframeWrap = document.createElement('div');
          iframeWrap.style.cssText = 'position:relative;width:100%;height:100%';

          // Capa bloqueadora de clics en zonas de anuncios (bordes del iframe)
          const adBlocker = document.createElement('div');
          adBlocker.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none';
          // Interceptar intentos de abrir ventanas desde el iframe
          const origOpen = window.open;
          window.open = () => null;

          iframeWrap.appendChild(f);
          iframeWrap.appendChild(adBlocker);
          wrap.appendChild(iframeWrap);

          f.addEventListener('load', () => {
            loader.hide();
            window.open = origOpen;
          }, { once: true });
          setTimeout(() => { loader.hide(); window.open = origOpen; }, 15000);
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

    animate ? setTimeout(doRender, 150) : doRender();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
