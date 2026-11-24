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

function openAuth() {
  $("#authModal").classList.remove("hidden");
  renderAuth();
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
  if (!currentUser) {
    area.innerHTML = `<button class="ghost" onclick="openAuth()">Войти</button>`;
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

async function loadAlbums() {
  const grid = $("#albumGrid");
  grid.innerHTML = `<div class="empty">Загрузка…</div>`;

  try {
    const data = await api("/api/albums");
    if (!data.albums.length) {
      grid.innerHTML = `
        <div class="empty wide">
          Пока нет релизов. После подключения базы сюда будут добавляться альбомы.
        </div>`;
      return;
    }

    grid.innerHTML = data.albums.map(album => `
      <article class="albumCard" onclick="openAlbum(${album.id})">
        <div class="cover ${album.cover_url ? "hasImage" : ""}"
             ${album.cover_url ? `style="background-image:url('${escapeAttr(album.cover_url)}')"` : ""}>
          ${album.cover_url ? "" : `<span>${escapeHtml(album.title.slice(0, 1))}</span>`}
        </div>
        <div class="albumInfo">
          <h3>${escapeHtml(album.title)}</h3>
          <p>${escapeHtml(album.artist_name)}</p>
          <div class="rating">
            <strong>${album.average_rating ?? "—"}</strong>
            <span>${album.rating_count} оценок</span>
          </div>
        </div>
      </article>
    `).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty">Не удалось загрузить релизы.</div>`;
  }
}

async function openAlbum(id) {
  try {
    const data = await api(`/api/albums/${id}`);
    const a = data.album;

    $("#reviewFeed").innerHTML = `
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

    location.hash = "reviews";
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

(async function init() {
  await loadMe();
  await loadAlbums();
})();
