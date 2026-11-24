let currentUser = null;

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

function openAuth(register = false) {
  $("#authModal").classList.remove("hidden");
  if (register) renderRegister();
  else renderAuth();
}

function closeAuth() {
  $("#authModal").classList.add("hidden");
}

function renderAuth() {
  $("#authContent").innerHTML = `
    <p class="eyebrow">ACCOUNT</p>
    <h2>Войти</h2>
    <form id="loginForm" class="form">
      <label>Username или email<input name="login" required></label>
      <label>Пароль<input name="password" type="password" required></label>
      <button class="button" type="submit">Войти</button>
    </form>
    <p class="switch">Нет аккаунта? <button onclick="renderRegister()">Создать</button></p>
  `;

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form))
      });
      await loadMe();
      closeAuth();
      toast("Вы вошли в аккаунт.");
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderRegister() {
  $("#authContent").innerHTML = `
    <p class="eyebrow">ACCOUNT</p>
    <h2>Создать аккаунт</h2>
    <form id="registerForm" class="form">
      <label>Username<input name="username" minlength="3" maxlength="24" required></label>
      <label>Email<input name="email" type="email" required></label>
      <label>Пароль<input name="password" type="password" minlength="8" required></label>
      <button class="button" type="submit">Зарегистрироваться</button>
    </form>
    <p class="switch">Уже есть аккаунт? <button onclick="renderAuth()">Войти</button></p>
  `;

  $("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form))
      });
      await loadMe();
      closeAuth();
      toast("Аккаунт создан.");
    } catch (err) {
      toast(err.message);
    }
  });
}

async function loadMe() {
  const data = await api("/api/me");
  currentUser = data.user;
  renderAuthArea();
}

function renderAuthArea() {
  const area = $("#authArea");
  const heroRegister = $("#heroRegister");
  if (heroRegister) heroRegister.classList.toggle("hidden", Boolean(currentUser));

  if (!currentUser) {
    area.innerHTML = `
      <button class="ghost" onclick="openAuth()">Войти</button>
      <button class="button authRegister" onclick="openAuth(true)">Создать аккаунт</button>
    `;
    return;
  }

  area.innerHTML = `
    <span class="userBadge">@${escapeHtml(currentUser.username)}</span>
    <button class="ghost" onclick="logout()">Выйти</button>
  `;
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  currentUser = null;
  renderAuthArea();
  toast("Вы вышли.");
}

let latestAlbumId = null;

async function loadAlbums() {
  try {
    const data = await api("/api/albums");
    const album = data.albums?.[0];
    const card = $("#featuredRelease");

    if (!album) {
      latestAlbumId = null;
      $("#featuredTitle").textContent = "Пока нет релизов";
      $("#featuredArtist").textContent = "Здесь появится первый релиз";
      $("#featuredScore").textContent = "?/90";
      $("#featuredCover").style.backgroundImage = "";
      card?.classList.add("isEmpty");
      return;
    }

    latestAlbumId = album.id;
    card?.classList.remove("isEmpty");
    $("#featuredTitle").textContent = album.title;
    $("#featuredArtist").textContent = album.artist_name;
    const score = album.average_rating == null ? "?" : (Number(album.average_rating) * 9).toFixed(1).replace(/\.0$/, "");
    $("#featuredScore").textContent = `${score}/90`;
    const cover = $("#featuredCover");
    cover.style.setProperty("--cover-image", album.cover_url ? `url("${String(album.cover_url).replace(/["\\]/g, "\\$&")}")` : "none");
    cover.classList.remove("coverLoaded");
    if (album.cover_url) {
      const preload = new Image();
      preload.onload = () => cover.classList.add("coverLoaded");
      preload.onerror = () => cover.classList.remove("coverLoaded");
      preload.src = album.cover_url;
    }
    const placeholder = cover.querySelector(".coverPlaceholder");
    if (placeholder) placeholder.textContent = album.cover_url ? "" : "ROM";
  } catch (err) {
    $("#featuredTitle").textContent = "Не удалось загрузить релиз";
    $("#featuredArtist").textContent = "Попробуйте обновить страницу";
    $("#featuredScore").textContent = "?/90";
  }
}

function listenLatestRelease() {
  if (!latestAlbumId) {
    toast("Пока нет опубликованных релизов.");
    return;
  }
  openAlbum(latestAlbumId);
}

function setActiveNav(page) {
  document.querySelectorAll('nav a[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
}

function navigatePage(event, page) {
  event.preventDefault();
  renderPage(page);
  history.pushState({ page }, '', `/#${page}`);
}

function albumCard(album) {
  const score = album.average_rating == null
    ? '—'
    : `${(Number(album.average_rating) * 9).toFixed(1).replace(/\.0$/, '')}/90`;
  const cover = album.cover_url
    ? `<div class="catalogCover" style="background-image:url('${escapeAttr(album.cover_url)}')"></div>`
    : `<div class="catalogCover catalogPlaceholder">${escapeHtml(String(album.title || 'R').slice(0, 1).toUpperCase())}</div>`;
  return `<article class="catalogCard" role="button" tabindex="0" onclick="openAlbum(${Number(album.id)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openAlbum(${Number(album.id)})}">
    ${cover}<div class="catalogInfo"><h3>${escapeHtml(album.title)}</h3><p>${escapeHtml(album.artist_name)}</p><div class="catalogScore"><strong>${score}</strong><span>${Number(album.rating_count || 0)} оценок</span></div></div>
  </article>`;
}

async function renderPage(page) {
  $('#homeView').classList.add('hidden');
  $('#releasePage').classList.add('hidden');
  $('#pageView').classList.remove('hidden');
  document.body.classList.remove('releaseOpen');
  setActiveNav(page);
  window.scrollTo(0, 0);

  const pages = {
    best: { eyebrow: 'COMMUNITY RANKING', title: 'Лучшие релизы', intro: 'Альбомы, которые получили самые высокие оценки сообщества.' },
    new: { eyebrow: 'FRESH DROPS', title: 'Новые релизы', intro: 'Последние альбомы, добавленные в каталог ROM.' },
    news: { eyebrow: 'ROM JOURNAL', title: 'Новости', intro: 'Обновления платформы и важные события музыкального сообщества.' },
    about: { eyebrow: 'ABOUT THE PROJECT', title: 'Музыка — это мнение.', intro: 'ROM (Rate Our Music) — независимая площадка, где слушатели оценивают альбомы, пишут рецензии и формируют общую музыкальную картину.' }
  };
  const meta = pages[page] || pages.new;
  const root = $('#pageView');
  root.innerHTML = `<section class="pageIntro"><p class="eyebrow">${meta.eyebrow}</p><h1>${meta.title}</h1><p>${meta.intro}</p></section><section id="pageBody" class="pageBody"><div class="empty">Загружаем…</div></section>`;

  if (page === 'about') {
    $('#pageBody').innerHTML = `<div class="aboutGrid">
      <article class="aboutTile"><span>01 / DISCOVER</span><h2>Открывай новое</h2><p>Находи альбомы и артистов за пределами привычного плейлиста.</p></article>
      <article class="aboutTile"><span>02 / RATE</span><h2>Оценивай честно</h2><p>Ставь оценки и помогай формировать рейтинг релизов.</p></article>
      <article class="aboutTile"><span>03 / DISCUSS</span><h2>Обсуждай музыку</h2><p>Публикуй рецензии и знакомься с мнениями других слушателей.</p></article>
    </div><div class="aboutNote"><span class="aboutMark">ROM.</span><p>Наша идея проста: у каждого альбома есть своя история, а у каждого слушателя — собственное мнение. ROM собирает их в одном месте.</p></div>`;
    return;
  }

  if (page === 'news') {
    $('#pageBody').innerHTML = `<div class="emptyState"><span class="emptyIcon">✳</span><h2>Пока без новостей</h2><p>Здесь будут появляться обновления ROM, анонсы и заметки о музыкальном сообществе.</p></div>`;
    return;
  }

  try {
    const data = await api('/api/albums');
    let albums = [...(data.albums || [])];
    if (page === 'best') {
      albums.sort((a, b) => (Number(b.average_rating ?? -1) - Number(a.average_rating ?? -1)) || Number(b.rating_count || 0) - Number(a.rating_count || 0));
    }
    if (!albums.length) {
      $('#pageBody').innerHTML = `<div class="emptyState"><span class="emptyIcon">♫</span><h2>Каталог пока пуст</h2><p>Когда в ROM появятся релизы, они будут отображаться здесь.</p></div>`;
      return;
    }
    $('#pageBody').innerHTML = `<div class="catalogToolbar"><span>${albums.length} ${albums.length === 1 ? 'релиз' : 'релизов'}</span><span>${page === 'best' ? 'Сортировка: по оценке' : 'Сначала новые'}</span></div><div class="catalogGrid">${albums.map(albumCard).join('')}</div>`;
  } catch (err) {
    $('#pageBody').innerHTML = `<div class="emptyState"><h2>Не удалось загрузить каталог</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function goHome() {
  $('#releasePage').classList.add('hidden');
  $('#pageView').classList.add('hidden');
  $('#homeView').classList.remove('hidden');
  document.body.classList.remove('releaseOpen');
  setActiveNav('');
  history.replaceState({}, '', '/');
  window.scrollTo(0, 0);
}

async function openAlbum(id) {
  try {
    const data = await api(`/api/albums/${id}`);
    const a = data.album;

    $("#releaseContent").innerHTML = `
      <div class="albumDetail">
        <div class="detailCover ${a.cover_url ? "hasImage" : ""}"
             ${a.cover_url ? `style="background-image:url('${escapeAttr(a.cover_url)}')"` : ""}>
          ${a.cover_url ? "" : `<span>${escapeHtml(a.title.slice(0, 1))}</span>`}
        </div>
        <div>
          <p class="eyebrow">${escapeHtml(a.artist_name)}</p>
          <h2>${escapeHtml(a.title)}</h2>
          <div class="bigRating">${a.average_rating ?? "—"}</div>
          <p>${a.rating_count} оценок</p>
          ${currentUser ? `
            <form id="ratingForm" class="inlineForm">
              <select name="rating">
                ${Array.from({length: 21}, (_, i) => {
                  const v = i / 2;
                  return `<option value="${v}">${v.toFixed(1)}</option>`;
                }).join("")}
              </select>
              <button class="button" type="submit">Оценить</button>
            </form>
          ` : `<button class="button" onclick="openAuth()">Войдите, чтобы оценить</button>`}
        </div>
      </div>

      <div class="trackList">
        <h3>Треки</h3>
        ${data.tracks.length ? data.tracks.map(t => `
          <div class="track">
            <span>${t.track_number}</span>
            <strong>${escapeHtml(t.title)}</strong>
            <small>${formatDuration(t.duration_seconds)}</small>
          </div>
        `).join("") : `<div class="empty">Треклист пока не добавлен.</div>`}
      </div>

      <div class="reviews">
        <div class="sectionHead compact">
          <h3>Рецензии</h3>
        </div>
        ${data.reviews.length ? data.reviews.map(r => `
          <article class="review">
            <div class="reviewTop">
              <div>
                <strong>@${escapeHtml(r.username)}</strong>
                <span>${escapeHtml(r.title)}</span>
              </div>
              <b>${Number(r.rating).toFixed(1)}</b>
            </div>
            <p>${escapeHtml(r.body)}</p>
          </article>
        `).join("") : `<div class="empty">Пока нет рецензий.</div>`}
      </div>
    `;

    const form = $("#ratingForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const rating = Number(new FormData(form).get("rating"));
        try {
          await api("/api/ratings", {
            method: "POST",
            body: JSON.stringify({ album_id: id, rating })
          });
          toast("Оценка сохранена.");
          await openAlbum(id);
          await loadAlbums();
        } catch (err) {
          toast(err.message);
        }
      });
    }

    $("#homeView").classList.add("hidden");
    $("#pageView").classList.add("hidden");
    $("#releasePage").classList.remove("hidden");
    setActiveNav('');
    document.body.classList.add("releaseOpen");
    history.pushState({ albumId: id }, "", `/#album-${id}`);
    window.scrollTo(0, 0);
  } catch (err) {
    toast(err.message);
  }
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

window.addEventListener("popstate", () => {
  if (location.hash.startsWith("#album-")) {
    const id = Number(location.hash.slice(7));
    if (id) openAlbum(id);
  } else if (['best', 'new', 'news', 'about'].includes(location.hash.slice(1))) {
    renderPage(location.hash.slice(1));
  } else {
    $('#releasePage').classList.add('hidden');
    $('#pageView').classList.add('hidden');
    $('#homeView').classList.remove('hidden');
    document.body.classList.remove('releaseOpen');
    setActiveNav('');
  }
});

(async function init() {
  await loadMe();
  await loadAlbums();
})();
