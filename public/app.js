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
    cover.style.backgroundImage = album.cover_url
      ? `url("${String(album.cover_url).replace(/["\\]/g, "\\$&")}")`
      : "";
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

function showComingSoon(event) {
  event.preventDefault();
  toast("Этот раздел скоро появится.");
}

function goHome() {
  $("#releasePage").classList.add("hidden");
  $("#homeView").classList.remove("hidden");
  document.body.classList.remove("releaseOpen");
  history.replaceState(null, "", "/");
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
    $("#releasePage").classList.remove("hidden");
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
  } else {
    goHome();
  }
});

$("#featuredRelease")?.addEventListener("click", listenLatestRelease);

(async function init() {
  await loadMe();
  await loadAlbums();
})();
