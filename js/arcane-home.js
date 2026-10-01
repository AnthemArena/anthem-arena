// Keep your REAL, full playlist IDs here (the ones currently in your file).
const SITE_CONFIG = {
  links: {
    youtube: "https://www.youtube.com/@theundercityedit",
    kofi: "https://ko-fi.com/arcanemoments",
    tiktok: "https://www.tiktok.com/@arcanemoments",
    instagram: "https://www.instagram.com/rollingrealm/",
    x: "https://x.com/ArcaneMoment",
    tumblr: "https://www.tumblr.com/arcanemoments"
  },
  playlists: [
    { title: "Arcane Moments | Season 1", subtitle: "", id: "PLDWd0_FOU4I0" },
    { title: "Vi Moments | Arcane", subtitle: "", id: "PLRGGq2SYHtWc" },
    { title: "Powder & Jinx Moments", subtitle: "", id: "PLcbksQ4sGEAg" },
    { title: "Action Moments", subtitle: "", id: "PLCV9IPghewvY" }
  ]
};

const SOCIALS = [
  { key: "youtube", label: "YouTube", icon: "fa-brands fa-youtube" },
  { key: "tiktok", label: "TikTok", icon: "fa-brands fa-tiktok" },
  { key: "instagram", label: "Instagram", icon: "fa-brands fa-instagram" },
  { key: "x", label: "X", icon: "fa-brands fa-x-twitter" },
  { key: "tumblr", label: "Tumblr", icon: "fa-brands fa-tumblr" }
];

const esc = (v) => String(v == null ? "" : v)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const fmtDate = (v) => {
  const d = new Date(v);
  return v && !Number.isNaN(d.getTime())
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d) : "";
};

function applyConfiguredLinks() {
  const L = SITE_CONFIG.links;
  [["youtube-cta", L.youtube], ["channel-link", L.youtube], ["kofi-link", L.kofi]].forEach(([id, url]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.href = url || "#";
    if (!url) el.classList.add("is-disabled");
  });
  document.getElementById("social-links").innerHTML = SOCIALS.map((s) => {
    const url = L[s.key];
    return `<a class="social-link${url ? "" : " is-disabled"}" href="${url || "#"}" ${url ? 'target="_blank" rel="noopener"' : 'aria-disabled="true"'} aria-label="${s.label}" title="${s.label}"><i class="${s.icon}" aria-hidden="true"></i></a>`;
  }).join("");
}

async function fetchPlaylist(id) {
  const res = await fetch("/.netlify/functions/arcane-playlist?playlistId=" + encodeURIComponent(id));
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request failed: " + res.status);
  return { description: data.description || "", items: Array.isArray(data.items) ? data.items : [] };
}

/* ---------- Player (vertical Shorts modal) ---------- */
let queue = [], idx = -1, lastFocus = null, modal;

function buildModal() {
  modal = document.createElement("div");
  modal.className = "player-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Video player");
  modal.innerHTML =
    '<div class="player-backdrop" data-close></div>' +
    '<div class="player-stage">' +
    '<button class="player-btn player-close" data-close aria-label="Close player"><i class="fa-solid fa-xmark"></i></button>' +
    '<button class="player-btn player-prev" aria-label="Previous video"><i class="fa-solid fa-chevron-up"></i></button>' +
    '<div class="player-frame"></div>' +
    '<button class="player-btn player-next" aria-label="Next video"><i class="fa-solid fa-chevron-down"></i></button>' +
    '<a class="player-yt" target="_blank" rel="noopener">Open on YouTube</a></div>';
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closePlayer(); });
  modal.querySelector(".player-prev").addEventListener("click", () => step(-1));
  modal.querySelector(".player-next").addEventListener("click", () => step(1));

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") closePlayer();
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") step(-1);
  });
}

function showVideo() {
  const v = queue[idx];
  modal.querySelector(".player-frame").innerHTML =
    `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.videoId)}?autoplay=1&playsinline=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  modal.querySelector(".player-yt").href = "https://www.youtube.com/shorts/" + encodeURIComponent(v.videoId);
  modal.querySelector(".player-prev").disabled = idx === 0;
  modal.querySelector(".player-next").disabled = idx === queue.length - 1;
  history.replaceState(null, "", "?v=" + encodeURIComponent(v.videoId));
}

function step(d) {
  const n = idx + d;
  if (n < 0 || n >= queue.length) return;
  idx = n;
  showVideo();
}

function openPlayer(list, i) {
  if (!modal) buildModal();
  queue = list; idx = i;
  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  showVideo();
  modal.querySelector(".player-close").focus();
}

function closePlayer() {
  modal.hidden = true;
  modal.querySelector(".player-frame").innerHTML = ""; // stops playback
  document.body.classList.remove("modal-open");
  history.replaceState(null, "", location.pathname);
  if (lastFocus) lastFocus.focus();
}

/* ---------- Rows ---------- */
const allRows = new Map();

function renderRow(playlist, data) {
  const section = document.createElement("section");
  section.className = "playlist-row";
  const cards = data.items.map((v, i) =>
    `<button type="button" class="video-card" data-i="${i}" aria-label="Play: ${esc(v.title)}">` +
    `<span class="thumb-wrap"><img class="video-thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy"><span class="play-badge" aria-hidden="true"><i class="fa-solid fa-play"></i></span></span>` +
    `<span class="video-card-body"><span class="video-card-title">${esc(v.title)}</span>` +
    `<span class="video-card-meta">${esc(fmtDate(v.publishedAt))}</span></span></button>`
  ).join("");
  section.innerHTML =
    `<div class="playlist-row-header"><div><h3 class="playlist-row-title">${esc(playlist.title)}</h3>` +
    `<p class="playlist-row-subtitle">${esc(data.description || playlist.subtitle)}</p></div>` +
    `<a class="playlist-link" href="https://www.youtube.com/playlist?list=${encodeURIComponent(playlist.id)}" target="_blank" rel="noopener">Open playlist <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></div>` +
    `<div class="video-scroller">${cards}</div>`;
  section.querySelector(".video-scroller").addEventListener("click", (e) => {
    const card = e.target.closest(".video-card");
    if (card) openPlayer(data.items, Number(card.dataset.i));
  });
  return section;
}

function renderError(playlist, section) {
  section.innerHTML =
    `<div class="playlist-row-header"><div><h3 class="playlist-row-title">${esc(playlist.title)}</h3>` +
    `<p class="playlist-row-subtitle">Couldn't load this playlist.</p></div>` +
    `<button type="button" class="playlist-link retry-btn">Try again</button></div>`;
  section.querySelector(".retry-btn").addEventListener("click", () => loadRow(playlist, section));
}

async function loadRow(playlist, section) {
  section.innerHTML = '<div class="loading-state"><span class="loading-dot"></span><span>Loading…</span></div>';
  try {
    const data = await fetchPlaylist(playlist.id);
    if (!data.items.length) return section.remove();
    allRows.set(playlist.id, data.items);
    section.replaceWith(renderRow(playlist, data));
  } catch (err) {
    console.error("Failed to load " + playlist.title, err);
    renderError(playlist, section);
  }
}

async function renderPlaylists() {
  const container = document.getElementById("playlist-rows");
  const configured = SITE_CONFIG.playlists.filter((p) => p.id);
  if (!configured.length) {
    container.innerHTML = '<div class="empty-state">Add playlist IDs in <code>/js/arcane-home.js</code>.</div>';
    return;
  }
  container.innerHTML = "";
  // Rows are created in config order and loaded in parallel
  await Promise.all(configured.map((p) => {
    const section = document.createElement("section");
    section.className = "playlist-row";
    container.appendChild(section);
    return loadRow(p, section);
  }));

  // Deep link: ?v=VIDEOID opens straight into the player
  const wanted = new URLSearchParams(location.search).get("v");
  if (wanted) {
    for (const items of allRows.values()) {
      const i = items.findIndex((v) => v.videoId === wanted);
      if (i > -1) return openPlayer(items, i);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  applyConfiguredLinks();
  renderPlaylists();
});