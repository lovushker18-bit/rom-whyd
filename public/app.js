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
      <label>Электронная почта<input name="email" type="email" required></label>
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
      <label>Ник<input name="username" minlength="3" maxlength="24" required></label>
      <label>Почта<input name="email" type="email" required></label>
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
      toast("Аккаунт создан! Проверь почту для подтверждения.");
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

  const avatar = currentUser.avatar_url ? `<img src="${escapeAttr(currentUser.avatar_url)}" alt="">` : escapeHtml(currentUser.username.slice(0,1).toUpperCase());
  area.innerHTML = `<div class="profileMenuWrap">
    <button class="avatarButton" onclick="toggleProfileMenu(event)" aria-label="Меню профиля">${avatar}</button>
    <div id="profileMenu" class="profileDropdown hidden">
      <div class="menuUsername">@${escapeHtml(currentUser.username)} ${currentUser.is_verified?'✓':''}</div>
      <button onclick="showProfile();closeProfileMenu()">Аккаунт</button>
      <button onclick="showSettings();closeProfileMenu()">Настройки</button>
      <button onclick="logout();closeProfileMenu()">Выйти</button>
    </div>
  </div>`;
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
          ${currentUser?.email_verified ? `
            <form id="ratingForm" class="inlineForm">
              <select name="rating">
                ${Array.from({length: 21}, (_, i) => {
                  const v = i / 2;
                  return `<option value="${v}">${v.toFixed(1)}</option>`;
                }).join("")}
              </select>
              <button class="button" type="submit">Оценить</button>
            </form>
          ` : currentUser ? `<button class="button secondary" onclick="showSettings()">Подтверди почту, чтобы оценивать</button>` : `<button class="button" onclick="openAuth()">Войдите, чтобы оценить</button>`}
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
        ${currentUser?.email_verified ? `<form id="reviewForm" class="reviewComposer"><h4>Написать рецензию</h4><input name="title" placeholder="Заголовок" maxlength="150" required><textarea name="body" placeholder="Твои впечатления от релиза" rows="4" required></textarea><label>Оценка <select name="rating">${Array.from({length:21},(_,i)=>`<option value="${i/2}">${(i/2).toFixed(1)}</option>`).join('')}</select></label><button class="button" type="submit">Опубликовать рецензию</button></form>` : ''}
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

    const reviewForm = $("#reviewForm");
    if (reviewForm) reviewForm.addEventListener("submit",async e=>{e.preventDefault();try{await api('/api/reviews',{method:'POST',body:JSON.stringify({album_id:id,...Object.fromEntries(new FormData(reviewForm))})});toast('Рецензия опубликована');await openAlbum(id);}catch(err){toast(err.message)}});
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


function toggleProfileMenu(event){event.stopPropagation();$('#profileMenu')?.classList.toggle('hidden')}
function closeProfileMenu(){$('#profileMenu')?.classList.add('hidden')}
document.addEventListener('click',e=>{if(!e.target.closest('.profileMenuWrap'))closeProfileMenu()});
function showProfile(){if(!currentUser)return openAuth();renderUserPage(currentUser)}
function showSettings(){if(!currentUser)return openAuth();renderAccountSettings()}
function accountPage(title,body){$('#homeView').classList.add('hidden');$('#releasePage').classList.add('hidden');$('#pageView').classList.remove('hidden');document.body.classList.remove('releaseOpen');setActiveNav('');$('#pageView').innerHTML=`<section class="accountPage"><button class="ghost" onclick="goHome()">← Главная</button><h1>${title}</h1>${body}</section>`;window.scrollTo(0,0)}
function renderUserPage(u){accountPage('Аккаунт',`<div class="accountCard"><div class="accountAvatar">${u.avatar_url?`<img src="${escapeAttr(u.avatar_url)}" alt="">`:escapeHtml(u.username.slice(0,1).toUpperCase())}</div><div><h2>@${escapeHtml(u.username)} ${u.is_verified?'<span class="verifiedMark" title="Подтверждённый автор">✓</span>':''}</h2><p>${escapeHtml(u.bio||'Пока без описания')}</p><p class="accountStatus">${u.email_verified?'✓ Почта подтверждена':'◌ Почта не подтверждена'}</p></div></div>${u.is_verified||u.is_admin?'<button class="button" onclick="showAddRelease()">+ Добавить релиз</button>':''}`)}
function renderAccountSettings(){accountPage('Настройки',`<div class="settingsCard"><h2>Профиль</h2><form id="settingsForm" class="form"><label>Ссылка на аватар (HTTPS)<input name="avatar_url" type="url" value="${escapeAttr(currentUser.avatar_url||'')}" placeholder="https://..."></label><label>О себе<textarea name="bio" rows="4" maxlength="500">${escapeHtml(currentUser.bio||'')}</textarea></label><button class="button">Сохранить</button></form><hr><h2>Электронная почта</h2><p>${escapeHtml(currentUser.email)}</p><p>${currentUser.email_verified?'✓ Почта подтверждена':'Подтверди почту, чтобы оценивать музыку и писать рецензии.'}</p>${currentUser.email_verified?'':'<button class="button secondary" id="resendEmail">Отправить письмо повторно</button>'}</div>`);$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});currentUser=d.user;renderAuthArea();toast('Сохранено');renderAccountSettings()}catch(err){toast(err.message)}});$('#resendEmail')?.addEventListener('click',async()=>{try{await api('/api/resend-verification',{method:'POST'});toast('Письмо отправлено')}catch(err){toast(err.message)}})}
async function showAddRelease(){if(!currentUser?.is_verified&&!currentUser?.is_admin)return toast('Нужна галочка подтверждённого автора');let artists=[];try{artists=(await api('/api/artists')).artists||[]}catch(e){return toast(e.message)}accountPage('Добавить релиз',`<div class="settingsCard"><form id="addReleaseForm" class="form"><label>Исполнитель<select name="artist_id" required>${artists.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Название<input name="title" required maxlength="200"></label><label>Обложка (HTTPS URL)<input name="cover_url" type="url"></label><label>Дата релиза<input name="release_date" type="date"></label><label>Описание<textarea name="description" rows="4"></textarea></label><button class="button">Опубликовать</button></form>${artists.length?'':'<p>В базе пока нет исполнителей. Их нужно добавить через базу данных.</p>'}</div>`);$('#addReleaseForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await api('/api/albums',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Релиз опубликован');await loadAlbums();openAlbum(r.id)}catch(err){toast(err.message)}})}

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
  try{await loadMe()}catch(e){toast('Не удалось подключиться к API: '+e.message)}
  await loadAlbums();
  const verify = new URLSearchParams(location.search).get('verify');
  if(verify==='success'){toast('Почта подтверждена!');await loadMe();history.replaceState({},'','/')}
  if(verify==='invalid'){toast('Ссылка подтверждения недействительна или устарела');history.replaceState({},'','/')}
})();
