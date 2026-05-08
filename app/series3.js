const WATCHED_KEY = 'watched_' + SERIE.id;
let watchedMap = JSON.parse(localStorage.getItem(WATCHED_KEY) || '{}');
// Estructura: { seasons: { "0": { "1": true, "2": true }, "1": { "1": true } } }
const isWatched = (s, e) => !!(watchedMap.seasons?.[s]?.[e]);
const setWatched = (s, e, val) => {
    if (!watchedMap.seasons) watchedMap.seasons = {};
    if (!watchedMap.seasons[s]) watchedMap.seasons[s] = {};
    if (val) watchedMap.seasons[s][e] = true;
    else delete watchedMap.seasons[s][e];
    localStorage.setItem(WATCHED_KEY, JSON.stringify(watchedMap));
};

// Invertir o reordenar temporadas si es necesario (ej: por ID)
if (SERIE.seasons) {
    SERIE.seasons.sort((a, b) => (a.id || 0) - (b.id || 0));
}

let activeSeason = 0;
document.getElementById('header-title').textContent = SERIE.title;
document.title = SERIE.title;

const btnBack = document.getElementById('btn-back');
if (btnBack) {
    btnBack.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            // Fallback si no hay historial (ej: abierto directo)
            location.href = 'go:home';
        }
    });
}

function renderTabs() {
    const tabs = document.getElementById('seasons-tabs');
    tabs.innerHTML = SERIE.seasons.map((s, i) => {
        const name = s.label || `Temporada ${s.num}`;
        return `<button class="season-tab${i === activeSeason ? ' active' : ''}" data-i="${i}">${name}</button>`;
    }).join('');
    tabs.querySelectorAll('.season-tab').forEach(btn =>
        btn.addEventListener('click', () => {
            activeSeason = +btn.dataset.i;
            renderTabs();
            renderEpisodes(true);
        })
    );
}

function renderEpisodes(animate) {
    const eps = SERIE.seasons[activeSeason].episodes;
    const list = document.getElementById('episodes-list');
    list.innerHTML = eps.map(ep => {
        const thumbStyle = ep.thumb
            ? `background-image:url('${ep.thumb}')`
            : `background:linear-gradient(135deg,#0a1628,#001a0d)`;
        const watched = isWatched(activeSeason, ep.num);
        const playerUrl = ep.url || 'player.html';
        return `<div class="ep-card" data-url="${playerUrl}" data-s="${activeSeason}" data-e="${ep.num}">
      <div class="ep-thumb">
        <div class="ep-thumb-img" style="${thumbStyle}"></div>
        <div class="ep-thumb-play">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white" opacity="0.85"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <div class="ep-thumb-num">EP ${ep.num}</div>
      </div>
      <div class="ep-body">
        <div class="ep-num">Episodio ${ep.num}</div>
        <div class="ep-title">${ep.title}</div>
        <div class="ep-duration">${ep.duration}</div>
        ${ep.synopsis ? `<div class="ep-synopsis">${ep.synopsis}</div>` : ''}
        <div class="ep-switch-row">
          <label class="ep-switch" data-s="${activeSeason}" data-e="${ep.num}">
            <input type="checkbox" ${watched ? 'checked' : ''}>
            <span class="ep-switch-track"></span>
            <span class="ep-switch-thumb"></span>
          </label>
          <span class="ep-switch-label${watched ? ' on' : ''}" id="lbl-${activeSeason}-${ep.num}">${watched ? 'Visto' : 'No visto'}</span>
        </div>
      </div>
    </div>`;
    }).join('');

    list.querySelectorAll('.ep-card').forEach(c =>
        c.addEventListener('click', e => {
            if (e.target.closest('.ep-switch')) return;
            if (localStorage.getItem('auto_watched') === '1') {
                const s = +c.dataset.s, ep = +c.dataset.e;
                const input = c.querySelector('.ep-switch input');
                if (input && !input.checked) {
                    input.checked = true;
                    setWatched(s, ep, true);
                    const lbl = document.getElementById(`lbl-${s}-${ep}`);
                    if (lbl) { lbl.textContent = 'Visto'; lbl.classList.add('on'); }
                }
            }
            location.href = c.dataset.url;
        })
    );

    list.querySelectorAll('.ep-switch').forEach(sw =>
        sw.addEventListener('change', () => {
            const s = +sw.dataset.s, ep = +sw.dataset.e;
            const val = sw.querySelector('input').checked;
            setWatched(s, ep, val);
            const lbl = document.getElementById(`lbl-${s}-${ep}`);
            if (lbl) { lbl.textContent = val ? 'Visto' : 'No visto'; lbl.classList.toggle('on', val); }
        })
    );

    if (animate) {
        list.classList.remove('season-change');
        void list.offsetWidth; // reflow para reiniciar animación
        list.classList.add('season-change');
    }
}

renderTabs();
renderEpisodes();
