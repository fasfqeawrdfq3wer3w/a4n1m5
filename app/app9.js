(function () {
  'use strict';

  const DATA = window.DATA || [];
  const CFG = window.CONFIG || {};

  // Aplicar configuración
  (function applyConfig() {
    const name = CFG.appName || 'ANiGo';
    document.title = name;

    // Header: logo imagen o texto
    const logoEl = document.querySelector('.logo');
    if (logoEl) {
      if (CFG.headerLogoUrl) {
        logoEl.innerHTML = `<img src="${CFG.headerLogoUrl}" alt="${name}" style="height:32px;object-fit:contain;vertical-align:middle">`;
      } else {
        logoEl.textContent = name;
      }
    }

    // Banner hero
    if (CFG.bannerUrl) {
      const hero = document.querySelector('.hero');
      if (hero) {
        hero.style.backgroundImage = `url('${CFG.bannerUrl}')`;
        hero.style.backgroundSize = 'cover';
        hero.style.backgroundPosition = 'center';
      }
    }

    // Hero configurable
    const h = CFG.hero || {};
    const heroBg = document.getElementById('hero-bg');
    if (heroBg) {
      if (h.backgroundUrl) {
        heroBg.style.backgroundImage = `url('${h.backgroundUrl}')`;
      }
    }
    const heroBadgeEl = document.getElementById('hero-badge');
    if (heroBadgeEl) {
      if (h.badge) { heroBadgeEl.textContent = h.badge; heroBadgeEl.style.display = ''; }
      else heroBadgeEl.style.display = 'none';
    }
    const heroTitleEl = document.getElementById('hero-title');
    if (heroTitleEl) heroTitleEl.textContent = h.title || '';
    const heroSubEl = document.getElementById('hero-subtitle');
    if (heroSubEl) heroSubEl.textContent = h.subtitle || '';
    const heroCta = document.getElementById('hero-cta-primary');
    const heroCtaLabel = document.getElementById('hero-cta-label');
    if (heroCtaLabel) heroCtaLabel.textContent = h.ctaLabel || 'Explorar';
    if (heroCta) {
      heroCta.dataset.heroNav = h.ctaNav || 'search';
      heroCta.style.display = h.ctaLabel ? '' : 'none';
    }
    const heroCta2 = document.getElementById('hero-cta-secondary');
    const heroCta2Label = document.getElementById('hero-cta2-label');
    if (heroCta2Label) heroCta2Label.textContent = h.cta2Label || '';
    if (heroCta2) {
      heroCta2.dataset.heroNav = h.cta2Nav || 'categories';
      heroCta2.style.display = h.cta2Label ? '' : 'none';
    }

    // Banner de perfil
    const profileBanner = document.getElementById('profile-banner');
    if (profileBanner) {
      if (CFG.profileBannerUrl) {
        profileBanner.style.backgroundImage = `url('${CFG.profileBannerUrl}')`;
      }
    }

    // Foto y nombre de perfil
    const avatar = document.getElementById('profile-avatar');
    if (avatar) {
      if (CFG.profilePhotoUrl) {
        avatar.innerHTML = `<img src="${CFG.profilePhotoUrl}" alt="perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        avatar.textContent = (CFG.profileName || name).charAt(0).toUpperCase();
      }
    }
    const profileNameEl = document.querySelector('.profile-hero h2');
    if (profileNameEl) profileNameEl.textContent = CFG.profileName || 'Otaku User';

    const memberLabel = document.getElementById('profile-member-label');
    if (memberLabel) memberLabel.textContent = `Miembro de ${name}`;
  })();
  const FAVS_KEY = 'favorites_v1';
  const WATCH_STATUS_KEY = 'watch_status_v1';
  let favs = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
  // watchStatus: { [id]: 'Viendo' | 'Completado' | 'Pendiente' }
  let watchStatus = JSON.parse(localStorage.getItem(WATCH_STATUS_KEY) || '{}');
  const APP_STATE_KEY = 'wolfanime_last_state';
  let state = { view: null, prev: null, detail: null, catFilter: null, searchQ: '', favFilter: 'all' };

  const saveWatchStatus = () => localStorage.setItem(WATCH_STATUS_KEY, JSON.stringify(watchStatus));
  const getWatchStatus = id => watchStatus[id] || null;
  const setWatchStatus = (id, status) => {
    if (status) watchStatus[id] = status;
    else delete watchStatus[id];
    saveWatchStatus();
  };

  const $ = id => document.getElementById(id);
  const saveFavs = () => localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  const isFav = id => favs.includes(id);
  const toggleFav = id => {
    favs = isFav(id) ? favs.filter(f => f !== id) : [...favs, id];
    saveFavs();
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(params.entries());
  }

  function updateURL(newParams = {}) {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();

    // Preserve some persistent state if needed, or just clear and set new ones
    Object.entries(newParams).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params.set(k, v);
    });

    const newUrl = params.toString() ? `${url.pathname}?${params.toString()}` : url.pathname;
    window.history.replaceState({}, '', newUrl);

    // Save to localStorage too
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(newParams));
  }

  function handleURLParams() {
    let p = getURLParams();

    // If no URL params, try localStorage
    if (Object.keys(p).length === 0) {
      const saved = localStorage.getItem(APP_STATE_KEY);
      if (saved) {
        try { p = JSON.parse(saved); } catch (e) { }
      }
    }

    if (p.id) {
      openDetail(+p.id);
      return true;
    }
    if (p.cat) {
      state.catFilter = p.cat;
      renderCatLibrary(p.cat);
      navigateTo('cat-library');
      return true;
    }
    if (p.q) {
      if ($('search-input')) $('search-input').value = p.q;
      renderSearch(p.q, p.cat || null);
      navigateTo('search');
      return true;
    }
    if (p.view) {
      navigateTo(p.view);
      return true;
    }
    return false;
  }

  const CATS_CFG = window.CATEGORIES_CONFIG || [];
  const CATEGORIES = CATS_CFG.filter(c => !c.isH).map(c => c.name);
  const CAT_COLORS = Object.fromEntries(CATS_CFG.map(c => [c.name, c.color]));
  const CAT_ACCENT = Object.fromEntries(CATS_CFG.map(c => [c.name, c.accent]));
  const CAT_ICONS_MAP = Object.fromEntries(CATS_CFG.map(c => [c.name, c.icon]));

  let hCatEnabled = localStorage.getItem('h_enabled') === '1';
  let autoWatched = localStorage.getItem('auto_watched') === '1';

  const isH = item => {
    if (!item || !item.category) return false;
    return item.category.split(/,\s*/).map(c => c.trim()).includes('H');
  };

  const visibleDATA = () => hCatEnabled ? DATA : DATA.filter(d => {
    const cats = d.category ? d.category.split(/,\s*/).map(c => c.trim()) : [];
    return !cats.includes('H');
  });
  const saveHEnabled = () => localStorage.setItem('h_enabled', hCatEnabled ? '1' : '0');

  function formatAdded(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
  }

  function getStatusClass(s) {
    if (!s) return 'status-off';
    if (s === 'En emisión') return 'status-on';
    if (s === 'En pausa') return 'status-pause';
    return 'status-off';
  }

  // Helpers para imágenes: usan poster/backdrop si existen, sino el gradiente image
  function posterBg(item) {
    if (item.poster) return `url('${item.poster}') center/cover no-repeat`;
    return item.image;
  }
  function backdropBg(item) {
    if (item.backdrop) return `url('${item.backdrop}') center/cover no-repeat`;
    if (item.poster) return `url('${item.poster}') center/cover no-repeat`;
    return item.image;
  }

  function cardHTML(item, mini = false) {
    const fav = isFav(item.id);
    const h = isH(item);
    if (mini) {
      return `<div class="mini-card${h ? ' scard-h' : ''}" data-id="${item.id}">
      <div class="mini-card-img" style="background:${posterBg(item)}"></div>
      <div class="mini-card-body">
        <div class="mini-card-title">${item.title}</div>
        <div style="font-size:11px;color:var(--text3)">${item.episodes} eps</div>
      </div>
    </div>`;
    }
    return `<div class="card${h ? ' card-h' : ''}" data-id="${item.id}">
    <div class="card-img" style="background:${posterBg(item)}">
      <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);border-radius:20px;padding:3px 8px;font-size:11px;font-weight:600;color:#fff">${item.status}</div>
      ${item.addedDate ? `<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,230,118,0.18);border:1px solid rgba(0,230,118,0.35);border-radius:20px;padding:3px 8px;font-size:10px;font-weight:600;color:#00E676">+ ${formatAdded(item.addedDate)}</div>` : ''}
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-meta">
        <div class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${item.readTime}</div>
        <div class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>${item.episodes} eps</div>
        <div class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>${item.source}</div>
      </div>
      <div class="card-desc">${item.description}</div>
      <div class="card-actions">
        <button class="cta-btn" data-cta="${item.id}">Ver anime</button>
        <button class="mylist-add-btn${(isFav(item.id) || getWatchStatus(item.id)) ? ' in-list' : ''}" data-mylist="${item.id}" aria-label="Agregar a Mi Lista">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>${(isFav(item.id) || getWatchStatus(item.id)) ? 'En Mi Lista' : 'Mi Lista'}</span>
        </button>
      </div>
    </div>
  </div>`;
  }

  let _sliderAutoTimer = null;

  function renderHome() {
    const featured = visibleDATA().filter(d => d.featured);

    // Limpiar timer anterior
    clearInterval(_sliderAutoTimer);
    _sliderAutoTimer = null;

    // Clonar track para eliminar listeners acumulados
    const oldTrack = $('slider-track');
    const newTrack = oldTrack.cloneNode(false);
    oldTrack.parentNode.replaceChild(newTrack, oldTrack);
    const track = newTrack;

    const dotsEl = $('slider-dots');
    const frag = document.createDocumentFragment();
    featured.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'slider-card';
      div.dataset.id = item.id;
      const statusColor = item.status === 'En emisión' ? '#00e676' : item.status === 'En pausa' ? '#ffb300' : '#aaa';
      div.innerHTML = `<div class="slider-poster">
      <div class="slider-poster-bg" style="background:${posterBg(item)}"></div>
      <div class="slider-poster-overlay"></div>
      <span class="slider-poster-eps">${item.episodes} eps</span>
      <div class="slider-poster-info">
        <div class="slider-poster-title">${item.title}</div>
        <div class="slider-poster-meta">
          <span class="slider-poster-status" style="color:${statusColor}">${item.status}</span>
        </div>
      </div>
      <div class="slider-poster-num">${String(i + 1).padStart(2, '0')}</div>
    </div>`;
      frag.appendChild(div);
    });
    track.appendChild(frag);
    // Numeración estilo "01 / 06" con barra de progreso
    dotsEl.innerHTML = `
      <div class="slider-counter">
        <span class="slider-counter-current">01</span>
        <span class="slider-counter-sep">/</span>
        <span class="slider-counter-total">${String(featured.length).padStart(2, '0')}</span>
      </div>
      <div class="slider-progress-bar"><div class="slider-progress-fill"></div></div>
      <div class="slider-dots-row">${featured.map((_, i) => `<div class="dot${i === 0 ? ' active' : ''}" data-dot="${i}"></div>`).join('')}</div>
    `;

    let autoIdx = 0;

    function getCardW() {
      return (track.querySelector('.slider-card')?.offsetWidth || 120) + 12;
    }

    function getScrollLeft(idx) {
      const card = track.querySelectorAll('.slider-card')[idx];
      if (!card) return idx * getCardW();
      return card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
    }

    function goTo(idx) {
      autoIdx = (idx + featured.length) % featured.length;
      track.scrollTo({ left: getScrollLeft(autoIdx), behavior: 'smooth' });
      dotsEl.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === autoIdx));
      const cur = dotsEl.querySelector('.slider-counter-current');
      if (cur) {
        cur.classList.remove('animating');
        void cur.offsetWidth; // reflow para reiniciar animación
        cur.textContent = String(autoIdx + 1).padStart(2, '0');
        cur.classList.add('animating');
      }
      const fill = dotsEl.querySelector('.slider-progress-fill');
      if (fill) fill.style.width = ((autoIdx + 1) / featured.length * 100) + '%';
    }

    function startAuto() {
      clearInterval(_sliderAutoTimer);
      _sliderAutoTimer = setInterval(() => goTo(autoIdx + 1), 3000);
    }

    track.addEventListener('scroll', debounce(() => {
      const center = track.scrollLeft + track.clientWidth / 2;
      const cards = [...track.querySelectorAll('.slider-card')];
      let idx = 0, minDist = Infinity;
      cards.forEach((c, i) => {
        const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
        if (dist < minDist) { minDist = dist; idx = i; }
      });
      if (idx !== autoIdx) {
        autoIdx = idx;
        dotsEl.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === autoIdx));
        const cur = dotsEl.querySelector('.slider-counter-current');
        if (cur) {
          cur.classList.remove('animating');
          void cur.offsetWidth;
          cur.textContent = String(autoIdx + 1).padStart(2, '0');
          cur.classList.add('animating');
        }
        const fill = dotsEl.querySelector('.slider-progress-fill');
        if (fill) fill.style.width = ((autoIdx + 1) / featured.length * 100) + '%';
      }
    }, 80), { passive: true });

    track.addEventListener('touchstart', () => clearInterval(_sliderAutoTimer), { passive: true });
    track.addEventListener('touchend', () => startAuto(), { passive: true });

    track._sliderGoTo = goTo;

    startAuto();

    const grid = $('home-grid');
    const sorted = [...visibleDATA()].sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || '')).slice(0, 5);
    grid.innerHTML = sorted.map((d, i) => recentCardHTML(d, i + 1)).join('');
    renderHomeFavs();
  }

  function recentCardHTML(item, num) {
    const h = isH(item);
    return `<div class="recent-card${h ? ' recent-card-h' : ''}" data-id="${item.id}">
    <div class="recent-poster">
      <div class="recent-poster-img" style="background:${posterBg(item)}"></div>
      <div class="recent-poster-num">#${num}</div>
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="recent-body">
      <div class="recent-title">${item.title}</div>
      <div class="recent-meta">
        <span class="recent-pill">${item.episodes} eps</span>
      </div>
      <div class="recent-date">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${formatAdded(item.addedDate)}
      </div>
    </div>
  </div>`;
  }

  function renderHomeFavs() {
    const container = $('home-favs');
    if (!container) return;
    const favItems = visibleDATA().filter(d => isFav(d.id));
    if (!favItems.length) {
      container.innerHTML = '<div style="padding:8px 0;font-size:13px;color:var(--text3)">Aún no tienes favoritos</div>';
      return;
    }
    container.innerHTML = favItems.map(d => cardHTML(d, true)).join('');
  }



  function searchCardHTML(item, purple = false) {
    const h = purple || isH(item);
    return `<div class="scard${h ? ' scard-h' : ''}" data-id="${item.id}">
    <div class="scard-poster" style="background:${posterBg(item)}">
      <div class="scard-status ${getStatusClass(item.status)}">${item.status}</div>
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="scard-body">
      <div class="scard-title">${item.title}</div>
      <div class="scard-pills">
        <span class="scard-pill">${item.episodes} eps</span>
        <span class="scard-pill">${item.readTime}</span>
        <span class="scard-pill">${item.date ? item.date.slice(0, 4) : ''}</span>
      </div>
    </div>
  </div>`;
  }

  function renderSearch(q = '', cat = null) {
    const lower = q.toLowerCase();
    let results = visibleDATA();
    if (q) results = results.filter(d =>
      d.title.toLowerCase().includes(lower) ||
      d.description.toLowerCase().includes(lower) ||
      d.tags.some(t => t.toLowerCase().includes(lower)) ||
      d.category.toLowerCase().includes(lower)
    );
    if (cat) results = results.filter(d => d.category === cat);
    const grid = $('search-grid');
    const empty = $('search-empty');
    const meta = $('search-meta');
    if (!results.length) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
      meta.textContent = '';
    } else {
      empty.style.display = 'none';
      grid.innerHTML = results.map(d => searchCardHTML(d)).join('');
      meta.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}${q ? ' para "' + q + '"' : ''}`;
    }
  }

  function renderCategories() {
    const catGrid = $('cat-grid');
    const visibleCats = hCatEnabled ? [...CATEGORIES, 'H'] : CATEGORIES;
    catGrid.innerHTML = visibleCats.map(cat => {
      const count = visibleDATA().filter(d => d.category === cat || (d.category && d.category.split(/,\s*/).map(c => c.trim()).includes(cat))).length;
      const bg = CAT_COLORS[cat] || 'linear-gradient(135deg,#2d3436,#636e72)';
      const accent = CAT_ACCENT[cat] || '#fff';
      const icon = CAT_ICONS_MAP[cat] || '';
      return `<div class="cat-card" data-cat="${cat}">
      <div class="cat-card-overlay"></div>
      <div class="cat-card-icon" style="color:${accent};background:rgba(0,0,0,0.25);border-color:${accent}33">${icon}</div>
      <div class="cat-card-info">
        <h3>${cat}</h3>
        <span>${count} serie${count !== 1 ? 's' : ''}</span>
      </div>
    </div>`;
    }).join('');
  }

  function renderCatLibrary(cat) {
    $('cat-library-title').textContent = cat === 'H' ? 'Contenido H' : cat;
    const items = visibleDATA().filter(d => d.category === cat || (d.category && d.category.split(/,\s*/).map(c => c.trim()).includes(cat)));
    if (items.length === 0) {
      $('cat-library-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:60px 20px;text-align:center">
        <span style="font-size:48px">📭</span>
        <p style="margin-top:12px;font-size:16px;font-weight:700;color:var(--text2)">Sin contenido aún</p>
        <small style="color:var(--text3);font-size:13px">No hay series en esta categoría todavía</small>
      </div>`;
    } else {
      $('cat-library-grid').innerHTML = items.map(d => searchCardHTML(d, cat === 'H')).join('');
    }
  }

  function renderAllLibrary() {
    const sorted = [...visibleDATA()].sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || ''));
    $('all-library-grid').innerHTML = sorted.map(d => searchCardHTML(d)).join('');
  }

  function myListCardHTML(item) {
    const ws = getWatchStatus(item.id);
    const fav = isFav(item.id);
    const h = isH(item);
    return `<div class="scard${h ? ' scard-h' : ''}" data-id="${item.id}">
    <div class="scard-poster" style="background:${posterBg(item)}">
      <div class="scard-status ${getStatusClass(item.status)}">${item.status}</div>
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="scard-body">
      <div class="scard-title">${item.title}</div>
      <div class="scard-pills">
        <span class="scard-pill">${item.episodes} eps</span>
        <span class="scard-pill">${item.readTime}</span>
        <span class="scard-pill">${item.date ? item.date.slice(0, 4) : ''}</span>
      </div>
      <div class="fav-watch-btns">
        <button class="ws-btn${ws === 'Viendo' ? ' active' : ''}" data-ws="Viendo" data-ws-item="${item.id}">▶ Viendo</button>
        <button class="ws-btn${ws === 'Completado' ? ' active' : ''}" data-ws="Completado" data-ws-item="${item.id}">✓ Completado</button>
        <button class="ws-btn${ws === 'Pendiente' ? ' active' : ''}" data-ws="Pendiente" data-ws-item="${item.id}">⏳ Pendiente</button>
      </div>
    </div>
    <button class="mylist-remove-btn" data-remove="${item.id}" aria-label="Eliminar de Mi Lista">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
    </button>
  </div>`;
  }

  function renderFavorites() {
    const grid = $('fav-grid');
    const empty = $('fav-empty');
    const countEl = $('mylist-count');

    // Un item aparece en Mi Lista si tiene favorito O tiene estado de seguimiento
    let items = visibleDATA().filter(d => isFav(d.id) || getWatchStatus(d.id));

    const filter = state.favFilter;
    if (filter === 'fav') {
      items = items.filter(d => isFav(d.id));
    } else if (filter === 'Viendo' || filter === 'Completado' || filter === 'Pendiente') {
      items = items.filter(d => getWatchStatus(d.id) === filter);
    }

    if (countEl) countEl.textContent = items.length ? `${items.length} serie${items.length !== 1 ? 's' : ''}` : '';

    if (!items.length) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
    } else {
      empty.style.display = 'none';
      grid.innerHTML = items.map(d => myListCardHTML(d)).join('');
    }
  }

  function renderProfile() {
    const favCount = favs.length;
    $('fav-badge-profile').textContent = favCount;

    // Contar categorías visibles (incluir H solo si está habilitado)
    const visibleCategories = hCatEnabled
      ? CATS_CFG.map(c => c.name)
      : CATS_CFG.filter(c => !c.isH).map(c => c.name);

    const stats = $('profile-stats');
    stats.innerHTML = `
    <div class="stat-item"><div class="stat-num">${visibleDATA().length}</div><div class="stat-label">Series</div></div>
    <div class="stat-item"><div class="stat-num">${favCount}</div><div class="stat-label">Favoritos</div></div>
    <div class="stat-item"><div class="stat-num">${visibleCategories.length}</div><div class="stat-label">Géneros</div></div>
  `;
    const pill = $('h-toggle-pill');
    if (pill) pill.classList.toggle('active', hCatEnabled);
    const awPill = $('autowatched-toggle-pill');
    if (awPill) awPill.classList.toggle('active', autoWatched);
    const versionEl = $('profile-version');
    if (versionEl) versionEl.textContent = CFG.version || '1.0.0';
    // Botón solicitar contenido
    const reqBtn = $('request-content-btn');
    if (reqBtn) {
      if (CFG.requestContentUrl) {
        reqBtn.style.display = '';
        reqBtn.onclick = () => location.href = CFG.requestContentUrl;
      } else {
        reqBtn.style.display = 'none';
      }
    }
  }

  function renderDetail(item) {
    const fav = isFav(item.id);
    const castHTML = item.cast && item.cast.length
      ? item.cast.map(c => {
        const [name, role] = c.split('(');
        return `<div class="cast-item">
          <div class="cast-avatar">${name.trim().charAt(0)}</div>
          <div class="cast-info">
            <div class="cast-name">${name.trim()}</div>
            ${role ? `<div class="cast-role">${role.replace(')', '')}</div>` : ''}
          </div>
        </div>`;
      }).join('')
      : `<div class="detail-cast-empty"><span>🎭</span><p>Sin reparto disponible</p></div>`;

    $('detail-inner').innerHTML = `
    <div class="cat-library-header">
      <button class="detail-back" id="detail-back-btn" aria-label="Volver">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </div>
    <div class="detail-img" style="background:${backdropBg(item)}">
      <div class="detail-poster" style="background:${posterBg(item)}"></div>
      <button class="detail-fav-btn${fav ? ' active' : ''}" id="detail-fav-btn" aria-label="Favorito">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
    </div>
    <div class="detail-content">
      <div class="detail-badges">
        ${isH(item) ? '<span class="detail-h-badge">🔞 18+</span>' : ''}
        <span class="detail-badge ${getStatusClass(item.status)}">${item.status}</span>
        <span class="detail-badge status-off">${item.date ? item.date.slice(0, 4) : ''}</span>
      </div>
      <h1 class="detail-title">${item.title}</h1>
      <div class="detail-cta">
        <button class="detail-cta-main" id="detail-cta-main">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Reproducir
        </button>
        <button class="detail-mylist-btn${getWatchStatus(item.id) ? ' in-list' : ''}" id="detail-mylist-btn" data-mylist="${item.id}" aria-label="Añadir a Mi Lista">
          ${getWatchStatus(item.id)
        ? `${{ Viendo: '▶', Completado: '✓', Pendiente: '⏳' }[getWatchStatus(item.id)] || ''} ${getWatchStatus(item.id)}`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Añadir a Mi Lista`}
        </button>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab active" data-tab="synopsis">Sinopsis</button>
        <button class="detail-tab" data-tab="cast">Reparto</button>
        <button class="detail-tab" data-tab="info">Información</button>
      </div>

      <div class="detail-tab-panel" id="tab-synopsis">
        <div class="detail-tags">${(() => {
        const maxTags = 5;
        const visibleTags = item.tags.slice(0, maxTags);
        const hiddenTags = item.tags.slice(maxTags);
        let html = visibleTags.map(t => `<span class="tag">${t}</span>`).join('');
        if (hiddenTags.length > 0) {
          html += hiddenTags.map(t => `<span class="tag tag-hidden">${t}</span>`).join('');
          html += `<button class="tag-show-more" data-show-tags>Ver más (${hiddenTags.length})</button>`;
        }
        return html;
      })()}</div>
        <p class="detail-desc">${item.description}</p>
      </div>

      <div class="detail-tab-panel" id="tab-cast" style="display:none">
        <div class="cast-list">${castHTML}</div>
      </div>

      <div class="detail-tab-panel" id="tab-info" style="display:none">
        <div class="detail-meta-grid">
          <div class="detail-meta-item"><div class="val">${item.episodes}</div><div class="lbl">Episodios</div></div>
          <div class="detail-meta-item"><div class="val">${item.readTime}</div><div class="lbl">Duración</div></div>
          <div class="detail-meta-item"><div class="val">${item.date ? item.date.slice(0, 4) : '—'}</div><div class="lbl">Año</div></div>
        </div>
        <div class="detail-info-list">
          <div class="detail-info-row detail-info-genres">
            <span>Géneros</span>
            <div class="detail-genres-tags">
              ${(() => {
        // Separar el campo genre por diferentes separadores posibles
        let genres = [];
        if (item.genre.includes(' / ')) {
          genres = item.genre.split(' / ').map(g => g.trim());
        } else if (item.genre.includes('/')) {
          genres = item.genre.split('/').map(g => g.trim());
        } else if (item.genre.includes(',')) {
          genres = item.genre.split(',').map(g => g.trim());
        } else {
          // Si no hay separador, es un solo género
          genres = [item.genre];
        }

        const maxGenres = 3;
        const visibleGenres = genres.slice(0, maxGenres);
        const hiddenGenres = genres.slice(maxGenres);

        let html = visibleGenres.map(g => `<span class="tag">${g}</span>`).join('');
        if (hiddenGenres.length > 0) {
          html += hiddenGenres.map(g => `<span class="tag tag-hidden">${g}</span>`).join('');
          html += `<button class="tag-show-more" data-show-genres>Ver más (${hiddenGenres.length})</button>`;
        }
        return html;
      })()}
            </div>
          </div>
          <div class="detail-info-row"><span>Estado</span><span>${item.status}</span></div>
          <div class="detail-info-row"><span>Estreno</span><span>${item.date}</span></div>
          <div class="detail-info-row"><span>Fuente</span><span>${item.source}</span></div>
        </div>
      </div>
    </div>`;

    $('detail-inner').querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $('detail-inner').querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        $('detail-inner').querySelectorAll('.detail-tab-panel').forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).style.display = '';
      });
    });

    document.getElementById('detail-back-btn').addEventListener('click', () => navigateTo(state.prev || 'home', true));
    document.getElementById('detail-cta-main').addEventListener('click', () => { location.href = item.url; });

    document.getElementById('detail-fav-btn').addEventListener('click', () => {
      toggleFav(item.id);
      const btn = document.getElementById('detail-fav-btn');
      const active = isFav(item.id);
      btn.classList.toggle('active', active);
      btn.querySelector('svg').setAttribute('fill', active ? 'currentColor' : 'none');
    });

    document.getElementById('detail-mylist-btn').addEventListener('click', () => {
      openMyListModal(item.id);
    });

    // Event listeners para botones "Ver más" de tags y géneros
    const showTagsBtn = $('detail-inner').querySelector('[data-show-tags]');
    if (showTagsBtn) {
      showTagsBtn.addEventListener('click', (e) => {
        const btn = e.target;
        const container = btn.parentElement;
        const allTags = Array.from(container.querySelectorAll('.tag')).filter(t => !t.classList.contains('tag-show-more'));
        const maxVisible = 5;
        const isExpanded = btn.dataset.expanded === 'true';

        if (isExpanded) {
          // Colapsar: ocultar tags después del máximo
          allTags.forEach((tag, index) => {
            if (index >= maxVisible) {
              tag.classList.add('tag-hidden');
            }
          });
          btn.textContent = `Ver más (${allTags.length - maxVisible})`;
          btn.dataset.expanded = 'false';
        } else {
          // Expandir: mostrar todos los tags
          allTags.forEach(tag => tag.classList.remove('tag-hidden'));
          btn.textContent = 'Ver menos';
          btn.dataset.expanded = 'true';
        }
      });
    }

    const showGenresBtn = $('detail-inner').querySelector('[data-show-genres]');
    if (showGenresBtn) {
      showGenresBtn.addEventListener('click', (e) => {
        const btn = e.target;
        const container = btn.parentElement;
        const allTags = Array.from(container.querySelectorAll('.tag')).filter(t => !t.classList.contains('tag-show-more'));
        const maxVisible = 3;
        const isExpanded = btn.dataset.expanded === 'true';

        if (isExpanded) {
          // Colapsar: ocultar géneros después del máximo
          allTags.forEach((tag, index) => {
            if (index >= maxVisible) {
              tag.classList.add('tag-hidden');
            }
          });
          btn.textContent = `Ver más (${allTags.length - maxVisible})`;
          btn.dataset.expanded = 'false';
        } else {
          // Expandir: mostrar todos los géneros
          allTags.forEach(tag => tag.classList.remove('tag-hidden'));
          btn.textContent = 'Ver menos';
          btn.dataset.expanded = 'true';
        }
      });
    }
  }

  function navigateTo(view, back = false) {
    const views = document.querySelectorAll('.view');
    const current = state.view ? document.getElementById('view-' + state.view) : null;
    const next = document.getElementById('view-' + view);
    if (!next || (state.view === view && next.classList.contains('active'))) return;

    if (current) {
      if (back) {
        current.classList.remove('active');
        current.classList.add('slide-left');
        setTimeout(() => { current.classList.remove('slide-left'); }, 300);
      } else {
        current.classList.remove('active');
      }
    }

    state.prev = state.view;
    state.view = view;
    next.classList.add('active');
    next.scrollTop = 0;

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view || (view === 'cat-library' && b.dataset.nav === 'categories') || (view === 'all-library' && b.dataset.nav === 'home')));

    const header = document.getElementById('header');
    const main = document.getElementById('main');
    if (view === 'search' || view === 'cat-library' || view === 'all-library' || view === 'detail' || view === 'favorites') {
      header.style.display = 'none';
      main.style.marginTop = '0';
    } else {
      header.style.display = '';
      main.style.marginTop = '';
    }

    if (view === 'home') renderHomeFavs();
    if (view === 'search') renderSearch($('search-input').value, state.catFilter);
    if (view === 'categories') renderCategories();
    if (view === 'favorites') renderFavorites();
    if (view === 'profile') renderProfile();

    // Update URL
    const params = { view: view };
    if (view === 'search' && $('search-input')?.value) params.q = $('search-input').value;
    if (view === 'cat-library') params.cat = state.catFilter;
    if (view === 'detail' && state.detail) params.id = state.detail.id;
    updateURL(params);
  }

  function openDetail(id) {
    const item = DATA.find(d => d.id === id);
    if (!item) return;
    state.detail = item;
    renderDetail(item);
    navigateTo('detail');
  }

  // ── Modal Mi Lista ──────────────────────────────────────────
  let modalItemId = null;
  let modalPendingStatus = undefined; // undefined = sin cambio, null = quitar, string = nuevo estado

  function openMyListModal(id) {
    const item = DATA.find(d => d.id === id);
    if (!item) return;
    modalItemId = id;
    modalPendingStatus = undefined;

    document.getElementById('modal-poster').style.background = posterBg(item);
    document.getElementById('modal-title').textContent = item.title;
    document.getElementById('modal-genre').textContent = item.genre;

    updateModalChecks();

    const overlay = $('mylist-modal-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function updateModalChecks() {
    const ws = modalPendingStatus !== undefined ? modalPendingStatus : getWatchStatus(modalItemId);
    const keys = ['Viendo', 'Completado', 'Pendiente'];
    keys.forEach(key => {
      const btn = document.querySelector(`[data-modal-ws="${key}"]`);
      const radio = document.getElementById(`modal-check-${key}`);
      if (!btn || !radio) return;
      const active = ws === key;
      btn.classList.toggle('active', active);
      radio.classList.toggle('checked', active);
    });
    // Habilitar confirmar solo si hay un cambio respecto al estado guardado
    const saved = getWatchStatus(modalItemId);
    const confirmBtn = $('modal-confirm-btn');
    if (confirmBtn) {
      const hasChange = modalPendingStatus !== undefined && modalPendingStatus !== saved;
      confirmBtn.disabled = !hasChange;
    }
  }

  function closeMyListModal() {
    const overlay = $('mylist-modal-overlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (state.view === 'favorites') renderFavorites();
    if (state.view === 'home') renderHome();
    if (state.view === 'search') renderSearch($('search-input').value, state.catFilter);
    renderProfile();
    // Actualizar botón de Mi Lista en la vista de detalle si está abierta
    if (state.view === 'detail' && state.detail) {
      const btn = document.getElementById('detail-mylist-btn');
      if (btn) {
        const ws = getWatchStatus(state.detail.id);
        const statusIcons = { Viendo: '▶', Completado: '✓', Pendiente: '⏳' };
        btn.classList.toggle('in-list', !!ws);
        btn.innerHTML = ws
          ? `${statusIcons[ws] || ''} ${ws}`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Añadir a Mi Lista`;
      }
    }
    modalItemId = null;
    modalPendingStatus = undefined;
  }

  $('mylist-modal-overlay').addEventListener('click', e => {
    if (e.target === $('mylist-modal-overlay')) closeMyListModal();
  });
  $('modal-close-btn').addEventListener('click', closeMyListModal);

  document.getElementById('mylist-modal').addEventListener('click', e => {
    const opt = e.target.closest('[data-modal-ws]');
    if (!opt || modalItemId === null) return;
    const key = opt.dataset.modalWs;
    const saved = getWatchStatus(modalItemId);
    // Si ya está seleccionado (pendiente o guardado), deseleccionar
    const current = modalPendingStatus !== undefined ? modalPendingStatus : saved;
    modalPendingStatus = current === key ? null : key;
    updateModalChecks();
  });

  $('modal-confirm-btn').addEventListener('click', () => {
    if (modalItemId === null || modalPendingStatus === undefined) return;
    setWatchStatus(modalItemId, modalPendingStatus || null);
    closeMyListModal();
  });
  // ────────────────────────────────────────────────────────────

  function renderFilterChips() {
    const chips = $('filter-chips');
    const visibleCats = hCatEnabled ? [...CATEGORIES, 'H'] : CATEGORIES;
    // Si el filtro activo era H y se desactivó, resetear
    if (!hCatEnabled && state.catFilter === 'H') state.catFilter = null;
    chips.innerHTML = `<div class="chip${!state.catFilter ? ' active' : ''}" data-chip="">Todos</div>` +
      visibleCats.map(c => {
        const cfg = CATS_CFG.find(x => x.name === c);
        const accent = cfg ? cfg.accent : '#fff';
        const active = state.catFilter === c ? ' active' : '';
        return `<div class="chip${active}" data-chip="${c}" style="--chip-accent:${accent}">${c}</div>`;
      }).join('');
  }

  // ── Modal Confirmar Eliminación (declaración adelantada) ──
  let _removeTargetId = null;
  let _removeSelFav = false;
  let _removeSelWs = false;

  function _updateRemoveAcceptBtn() {
    const btn = document.getElementById('remove-confirm-accept');
    if (btn) btn.disabled = !_removeSelFav && !_removeSelWs;
  }

  function openRemoveConfirm(id) {
    const item = DATA.find(d => d.id === id);
    if (!item) return;
    _removeTargetId = id;
    const hasFav = isFav(id);
    const hasWs = !!getWatchStatus(id);
    const filter = state.favFilter;

    const desc = document.getElementById('remove-confirm-desc');
    if (desc) desc.textContent = item.title;

    const title = document.querySelector('.remove-confirm-title');
    const optFav = document.getElementById('remove-opt-fav');
    const optWs = document.getElementById('remove-opt-ws');
    const wsLabel = document.getElementById('remove-opt-ws-label');
    const acceptBtn = document.getElementById('remove-confirm-accept');
    const options = document.getElementById('remove-confirm-options');

    const tabNames = { fav: 'Favoritos', Viendo: 'Viendo', Completado: 'Completado', Pendiente: 'Pendiente' };

    if (filter !== 'all') {
      // Tab específico: título directo, sin opciones
      if (title) title.textContent = `¿Eliminar de ${tabNames[filter] || filter}?`;
      if (options) options.style.display = 'none';
      if (acceptBtn) { acceptBtn.textContent = 'Eliminar'; acceptBtn.disabled = false; }
      _removeSelFav = filter === 'fav';
      _removeSelWs = filter !== 'fav';
    } else {
      // Tab "Todos": opciones con checkboxes
      if (title) title.textContent = '¿Qué deseas eliminar?';
      if (options) options.style.display = '';
      if (optFav) optFav.style.display = hasFav ? '' : 'none';
      if (optWs) optWs.style.display = hasWs ? '' : 'none';
      if (wsLabel && hasWs) wsLabel.textContent = `Quitar estado "${getWatchStatus(id)}"`;
      _removeSelFav = hasFav;
      _removeSelWs = hasWs;
      const chkFav = document.getElementById('remove-chk-fav');
      const chkWs = document.getElementById('remove-chk-ws');
      if (chkFav) chkFav.classList.toggle('checked', _removeSelFav);
      if (chkWs) chkWs.classList.toggle('checked', _removeSelWs);
      if (acceptBtn) acceptBtn.textContent = 'Eliminar';
      _updateRemoveAcceptBtn();
    }

    const o = document.getElementById('remove-confirm-overlay');
    o.classList.add('open');
    o.setAttribute('aria-hidden', 'false');
  }
  function closeRemoveConfirm() {
    const o = document.getElementById('remove-confirm-overlay');
    o.classList.remove('open');
    o.setAttribute('aria-hidden', 'true');
    _removeTargetId = null;
    _removeSelFav = false;
    _removeSelWs = false;
  }

  document.addEventListener('click', e => {
    const heroBtn = e.target.closest('[data-hero-nav]');
    if (heroBtn) { navigateTo(heroBtn.dataset.heroNav); return; }

    const navBtn = e.target.closest('.nav-btn');
    if (navBtn) { navigateTo(navBtn.dataset.nav); return; }

    const seeAll = e.target.closest('.see-all');
    if (seeAll) {
      if (seeAll.dataset.nav === 'all-library') {
        renderAllLibrary();
      }
      navigateTo(seeAll.dataset.nav);
      return;
    }

    const mylistBtn = e.target.closest('[data-mylist]');
    if (mylistBtn) {
      e.stopPropagation();
      openMyListModal(+mylistBtn.dataset.mylist);
      return;
    }

    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      const id = +favBtn.dataset.fav;
      toggleFav(id);
      const active = isFav(id);
      favBtn.classList.toggle('active', active);
      favBtn.querySelector('svg').setAttribute('fill', active ? 'currentColor' : 'none');
      if (state.view === 'favorites') renderFavorites();
      renderProfile();
      return;
    }

    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      e.stopPropagation();
      openRemoveConfirm(+removeBtn.dataset.remove);
      return;
    }

    const ctaBtn = e.target.closest('[data-cta]');
    if (ctaBtn) {
      e.stopPropagation();
      const item = DATA.find(d => d.id === +ctaBtn.dataset.cta);
      if (item) openDetail(item.id);
      return;
    }

    const card = e.target.closest('.card, .slider-card, .mini-card, .recent-card, .scard');
    if (card && card.dataset.id) { openDetail(+card.dataset.id); return; }

    const catCard = e.target.closest('.cat-card');
    if (catCard) {
      state.catFilter = catCard.dataset.cat;
      renderCatLibrary(state.catFilter);
      navigateTo('cat-library');
      return;
    }

    const chip = e.target.closest('[data-chip]');
    if (chip) {
      state.catFilter = chip.dataset.chip || null;
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.chip === (chip.dataset.chip)));
      renderSearch($('search-input').value, state.catFilter);
      return;
    }

    const favChip = e.target.closest('[data-fav-filter]');
    if (favChip) {
      state.favFilter = favChip.dataset.favFilter || 'all';
      document.querySelectorAll('[data-fav-filter]').forEach(c => c.classList.toggle('active', c.dataset.favFilter === favChip.dataset.favFilter));
      renderFavorites();
      return;
    }

    const wsBtn = e.target.closest('[data-ws]');
    if (wsBtn) {
      e.stopPropagation();
      const id = +wsBtn.dataset.wsItem;
      const newStatus = wsBtn.dataset.ws;
      const current = getWatchStatus(id);
      setWatchStatus(id, current === newStatus ? null : newStatus);
      // Si ya no tiene ni fav ni estado, sale de Mi Lista — re-render
      renderFavorites();
      renderProfile();
      return;
    }

    const dot = e.target.closest('[data-dot]');
    if (dot) {
      const idx = +dot.dataset.dot;
      const track = $('slider-track');
      if (track._sliderGoTo) track._sliderGoTo(idx);
      return;
    }
  });

  const searchInputEl = $('search-input');
  const searchClearEl = $('search-clear');

  // Ocultar X nativa del navegador
  if (searchInputEl) {
    searchInputEl.setAttribute('type', 'text');
    // Prevenir que el navegador agregue su propia X
    searchInputEl.addEventListener('search', (e) => e.preventDefault());
  }

  searchInputEl.addEventListener('input', debounce(e => {
    const q = e.target.value;
    searchClearEl.classList.toggle('visible', q.length > 0);
    renderSearch(q, state.catFilter);
    if (state.view === 'search') {
      updateURL({ view: 'search', q: q, cat: state.catFilter });
    }
  }, 300));
  searchClearEl.addEventListener('click', () => {
    searchInputEl.value = '';
    searchClearEl.classList.remove('visible');
    renderSearch('', state.catFilter);
    if (state.view === 'search') {
      updateURL({ view: 'search', q: '', cat: state.catFilter });
    }
    searchInputEl.focus();
  });

  function init() {
    renderFilterChips();
    renderHome();
    renderSearch();
    renderCategories();
    renderFavorites();
    renderProfile();

    // Default view if no params handle it
    if (!handleURLParams()) {
      navigateTo('home');
    }

    document.getElementById('cat-library-back').addEventListener('click', () => navigateTo('categories', true));
    document.getElementById('all-library-back').addEventListener('click', () => navigateTo('home', true));

    // Toggle H desde perfil — con modal de confirmación
    function applyHToggle() {
      saveHEnabled();
      renderProfile();
      renderCategories();
      renderFilterChips();
      renderHome();
      renderSearch($('search-input').value, state.catFilter);
      renderFavorites();
      // Si la vista actual es cat-library de H y se desactivó, volver a categorías
      if (!hCatEnabled && state.view === 'cat-library' && state.catFilter === 'H') {
        navigateTo('categories', true);
      }
      // Si la vista actual es all-library, refrescar
      if (state.view === 'all-library') renderAllLibrary();
    }

    document.getElementById('h-toggle-item').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (hCatEnabled) {
        hCatEnabled = false;
        applyHToggle();
      } else {
        const o = $('h-confirm-overlay');
        o.classList.add('open');
        o.setAttribute('aria-hidden', 'false');
      }

      return false;
    });

    document.getElementById('h-confirm-accept').addEventListener('click', () => {
      hCatEnabled = true;
      const o = $('h-confirm-overlay');
      o.classList.remove('open');
      o.setAttribute('aria-hidden', 'true');
      applyHToggle();
    });

    document.getElementById('h-confirm-cancel').addEventListener('click', () => {
      const o = $('h-confirm-overlay');
      o.classList.remove('open');
      o.setAttribute('aria-hidden', 'true');
    });

    $('h-confirm-overlay').addEventListener('click', e => {
      if (e.target === $('h-confirm-overlay')) {
        $('h-confirm-overlay').classList.remove('open');
        $('h-confirm-overlay').setAttribute('aria-hidden', 'true');
      }
    });

    // ── Modal Confirmar Eliminación ──────────────────────────
    $('remove-confirm-cancel').addEventListener('click', closeRemoveConfirm);
    $('remove-confirm-overlay').addEventListener('click', e => {
      if (e.target === $('remove-confirm-overlay')) closeRemoveConfirm();
    });

    // Checkboxes del modal de eliminación
    document.getElementById('remove-opt-fav').addEventListener('click', () => {
      _removeSelFav = !_removeSelFav;
      document.getElementById('remove-chk-fav').classList.toggle('checked', _removeSelFav);
      _updateRemoveAcceptBtn();
    });
    document.getElementById('remove-opt-ws').addEventListener('click', () => {
      _removeSelWs = !_removeSelWs;
      document.getElementById('remove-chk-ws').classList.toggle('checked', _removeSelWs);
      _updateRemoveAcceptBtn();
    });

    $('remove-confirm-accept').addEventListener('click', () => {
      if (_removeTargetId === null) return;
      if (_removeSelFav) {
        favs = favs.filter(f => f !== _removeTargetId);
        saveFavs();
      }
      if (_removeSelWs) {
        delete watchStatus[_removeTargetId];
        saveWatchStatus();
      }
      closeRemoveConfirm();
      renderFavorites();
      renderProfile();
    });
    // ────────────────────────────────────────────────────────

    // Modal Acerca de
    document.getElementById('about-btn').addEventListener('click', () => {
      const o = $('about-modal-overlay');
      const appName = CFG.appName || 'ANiGo';
      // Logo: imagen o texto con estilo del header
      const aboutIcon = o.querySelector('.about-icon');
      if (aboutIcon) {
        if (CFG.aboutLogoUrl) {
          aboutIcon.innerHTML = `<img src="${CFG.aboutLogoUrl}" alt="${appName}" style="height:36px;object-fit:contain;vertical-align:middle">`;
          aboutIcon.style.background = 'none';
        } else {
          aboutIcon.innerHTML = `<span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;background:linear-gradient(90deg,var(--accent),#69ffb4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${appName}</span>`;
          aboutIcon.style.background = 'none';
        }
      }
      const aboutTitle = o.querySelector('.modal-title');
      const aboutDesc = o.querySelector('.about-body > p');
      const aboutFooter = o.querySelector('.about-footer');
      if (aboutTitle) aboutTitle.textContent = appName;
      if (aboutDesc) aboutDesc.textContent = CFG.aboutDescription || `${appName} es tu plataforma personal para descubrir, organizar y seguir el anime que más te gusta.`;
      if (aboutFooter) aboutFooter.textContent = `Desarrollado por ${CFG.developerName || 'ANiGo Team'}`;
      // Características dinámicas
      const featuresEl = o.querySelector('.about-features');
      if (featuresEl && CFG.aboutFeatures && CFG.aboutFeatures.length) {
        featuresEl.innerHTML = CFG.aboutFeatures.map(f =>
          `<div class="about-feature">${f.icon || ''}<span>${f.text || f}</span></div>`
        ).join('');
      }
      // Versión en el subtítulo del modal
      const aboutVersion = o.querySelector('.modal-genre');
      if (aboutVersion) aboutVersion.textContent = `v${CFG.version || '1.0.0'}`;
      o.classList.add('open');
      o.setAttribute('aria-hidden', 'false');
    });
    document.getElementById('about-close-btn').addEventListener('click', () => {
      const o = $('about-modal-overlay');
      o.classList.remove('open');
      o.setAttribute('aria-hidden', 'true');
    });
    $('about-modal-overlay').addEventListener('click', e => {
      if (e.target === $('about-modal-overlay')) {
        $('about-modal-overlay').classList.remove('open');
        $('about-modal-overlay').setAttribute('aria-hidden', 'true');
      }
    });

    // Trigger secreto: 5 taps en el título "Categorías"
    let hTaps = 0, hTimer;
    document.getElementById('cat-page-title').addEventListener('click', () => {
      hTaps++;
      clearTimeout(hTimer);
      hTimer = setTimeout(() => { hTaps = 0; }, 1500);
      if (hTaps >= 5) {
        hTaps = 0;
        hCatEnabled = !hCatEnabled;
        applyHToggle();
      }
    });
  }

  init();
})();
