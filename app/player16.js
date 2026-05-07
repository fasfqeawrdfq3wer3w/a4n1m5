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
  // La clave ahora solo incluye serie, temporada, episodio y idioma
  // para que el progreso se comparta entre servidores del mismo idioma
  function resumeKey() {
    const ep = window.EPISODE;
    const langName = ep.langs[activeLang].name;
    return 'resume_' + ep.serieId + '_s' + (ep.seasonIdx ?? 0) + '_e' + ep.num + '_' + langName;
  }

  function saveProgress(currentTime, duration) {
    if (!duration || currentTime < 5) return;
    if (currentTime / duration > 0.95) {
      localStorage.removeItem(resumeKey());
      return;
    }
    localStorage.setItem(resumeKey(), String(Math.floor(currentTime)));
  }

  function getSavedTime() {
    const t = parseInt(localStorage.getItem(resumeKey()) || '0', 10);
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

  // ── Reproductor con Wolf Player ──────────────────────────────
  let wolfInstance = null;

  function buildVideoPlayer(wrap, url, poster, videoType) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (wolfInstance)  { wolfInstance = null; }
    Array.from(wrap.children).forEach(c => {
      if (!c.classList.contains('vp-loading')) c.remove();
    });

    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const ep = window.EPISODE || {};

    // Contenedor que Wolf Player usará como raíz
    const container = document.createElement('div');
    container.className = 'vp-wolf-wrap';
    container.id = 'wolf-player-container';
    wrap.appendChild(container);

    // Ocultar loader cuando el video esté listo
    const vidLoader = createLoadingOverlay(container);
    let loaderHidden = false;
    function hideLoader() { if (loaderHidden) return; loaderHidden = true; vidLoader.hide(); }
    setTimeout(hideLoader, 10000);

    // Verificar si Wolf Player está disponible
    if (typeof window.WolfPlayer !== 'undefined') {
      // Usar Wolf Player
      wolfInstance = new window.WolfPlayer('#wolf-player-container', {
        src: url,
        poster: poster || '',
        autoplay: false,
        color: '#00E676',
        title: '',
        volume: 0.8
      });

      setTimeout(hideLoader, 2000);

      // Acceder al elemento de video interno para guardar progreso
      setTimeout(() => {
        const v = container.querySelector('video');
        if (v) {
          let saveInterval = null;
          v.addEventListener('loadedmetadata', () => {
            const saved = getSavedTime();
            if (saved > 0 && v.duration > 0 && saved < v.duration * 0.95) {
              showResumeToast(saved, () => { v.currentTime = saved; }, () => {});
            }
            saveInterval = setInterval(() => {
              if (!v.paused && !v.ended) saveProgress(v.currentTime, v.duration);
            }, 5000);
          });
          v.addEventListener('ended', () => { 
            clearInterval(saveInterval); 
            localStorage.removeItem(resumeKey()); 
          });

          // Botón saltar intro
          const introEnd = ep.introEnd;
          if (introEnd > 0) {
            const skipBtn = document.createElement('button');
            skipBtn.id = 'vp-skip-intro';
            skipBtn.textContent = 'Omitir intro';
            skipBtn.style.cssText = 'position:absolute;bottom:80px;right:20px;padding:8px 16px;background:rgba(0,230,118,0.9);color:#000;border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;opacity:0;transition:opacity 0.3s;z-index:100;pointer-events:auto';
            wrap.appendChild(skipBtn);

            skipBtn.addEventListener('click', () => {
              v.currentTime = introEnd;
              skipBtn.style.opacity = '0';
            });
            v.addEventListener('play', () => {
              if (v.currentTime < introEnd) skipBtn.style.opacity = '1';
            });
            v.addEventListener('timeupdate', () => {
              if (v.currentTime >= introEnd) skipBtn.style.opacity = '0';
            });
          }
        }
      }, 1000);

      console.log('🐺 Wolf Player inicializado con:', url);
    } else {
      // Fallback a reproductor nativo HTML5 si Wolf Player no está disponible
      console.warn('Wolf Player no disponible, usando reproductor nativo HTML5');
      
      const video = document.createElement('video');
      video.controls = true;
      video.preload = isMobile ? 'metadata' : 'auto';
      video.poster = poster || '';
      video.playsInline = true;
      video.style.cssText = 'width:100%;height:100%;background:#000;object-fit:contain';
      
      // Detectar si es HLS
      if (videoType === 'hls' || isHLS(url)) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari nativo soporta HLS
          video.src = url;
        } else if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
          // Usar HLS.js para otros navegadores
          const hls = new window.Hls({
            maxBufferLength: isMobile ? 8 : 30,
            maxMaxBufferLength: isMobile ? 16 : 60,
            startLevel: isMobile ? 0 : -1,
            capLevelToPlayerSize: true,
            autoStartLoad: !isMobile
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          
          if (isMobile) {
            video.addEventListener('play', () => hls.startLoad(), { once: true });
          }
          
          hls.on(window.Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                setTimeout(() => hls.startLoad(), 2000);
              } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              }
            }
          });
          
          hlsInstance = hls;
        } else {
          video.src = url;
        }
      } else {
        video.src = url;
      }
      
      container.appendChild(video);
      
      // Ocultar loader
      video.addEventListener('canplay', () => hideLoader(), { once: true });
      setTimeout(() => hideLoader(), 10000);
      
      // Guardar progreso
      let saveInterval = null;
      video.addEventListener('loadedmetadata', () => {
        const saved = getSavedTime();
        if (saved > 0 && video.duration > 0 && saved < video.duration * 0.95) {
          showResumeToast(saved, () => { video.currentTime = saved; }, () => {});
        }
        saveInterval = setInterval(() => {
          if (!video.paused && !video.ended) saveProgress(video.currentTime, video.duration);
        }, 5000);
      });
      video.addEventListener('ended', () => { 
        clearInterval(saveInterval); 
        localStorage.removeItem(resumeKey()); 
      });

      // Botón saltar intro
      const introEnd = ep.introEnd;
      if (introEnd > 0) {
        const skipBtn = document.createElement('button');
        skipBtn.id = 'vp-skip-intro';
        skipBtn.textContent = 'Omitir intro';
        skipBtn.style.cssText = 'position:absolute;bottom:80px;right:20px;padding:8px 16px;background:rgba(0,230,118,0.9);color:#000;border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;opacity:0;transition:opacity 0.3s;z-index:100;pointer-events:auto';
        wrap.appendChild(skipBtn);

        skipBtn.addEventListener('click', () => {
          video.currentTime = introEnd;
          skipBtn.style.opacity = '0';
        });
        video.addEventListener('play', () => {
          if (video.currentTime < introEnd) skipBtn.style.opacity = '1';
        });
        video.addEventListener('timeupdate', () => {
          if (video.currentTime >= introEnd) skipBtn.style.opacity = '0';
        });
      }

      console.log('Reproductor HTML5 nativo inicializado con:', url);
    }
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
