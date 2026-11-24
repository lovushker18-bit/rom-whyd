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
  area.innerHTML = `${currentUser.is_artist?'<button class="uploadTrackTop" onclick="showTrackSubmission()">♫ Загрузить трек</button>':''}<div class="profileMenuWrap">
    <button class="avatarButton" onclick="toggleProfileMenu(event)" aria-label="Меню профиля">${avatar}</button>
    <div id="profileMenu" class="profileDropdown hidden">
      <div class="menuUsername">@${escapeHtml(currentUser.username)} ${currentUser.is_artist?artistBadge():''} ${currentUser.is_verified?'✓':''}</div>
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
          <p class="eyebrow">${escapeHtml(a.artist_name)} · ${({single:"Сингл",multi_single:"Мульти-сингл",ep:"EP",album:"Альбом"})[a.release_type]||"Релиз"}</p>
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
            <div class="trackDetailName"><strong>${escapeHtml(t.title)}</strong>${t.featuring?`<small>feat. ${escapeHtml(t.featuring)}</small>`:""}</div>
            ${t.audio_url?`<audio controls preload="none" src="${escapeAttr(t.audio_url)}"></audio>`:`<small>${formatDuration(t.duration_seconds)}</small>`}
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
                <strong>@${escapeHtml(r.username)} ${r.is_artist?artistBadge():''}</strong>
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


function artistBadge(){return '<span class="artistBadge" title="Артист ROM" aria-label="Артист">♫</span>'}
function toggleProfileMenu(event){event.stopPropagation();$('#profileMenu')?.classList.toggle('hidden')}
function closeProfileMenu(){$('#profileMenu')?.classList.add('hidden')}
document.addEventListener('click',e=>{if(!e.target.closest('.profileMenuWrap'))closeProfileMenu()});
function showProfile(){if(!currentUser)return openAuth();renderUserPage(currentUser)}
function showSettings(){if(!currentUser)return openAuth();renderAccountSettings()}
function accountPage(title,body){$('#homeView').classList.add('hidden');$('#releasePage').classList.add('hidden');$('#pageView').classList.remove('hidden');document.body.classList.remove('releaseOpen');setActiveNav('');$('#pageView').innerHTML=`<section class="accountPage"><button class="ghost" onclick="goHome()">← Главная</button><h1>${title}</h1>${body}</section>`;window.scrollTo(0,0)}
function renderUserPage(u){accountPage('Аккаунт',`<div class="accountCard"><div class="accountAvatar">${u.avatar_url?`<img src="${escapeAttr(u.avatar_url)}" alt="">`:escapeHtml(u.username.slice(0,1).toUpperCase())}</div><div><h2>@${escapeHtml(u.username)} ${u.is_artist?artistBadge():''} ${u.is_verified?'<span class="verifiedMark" title="Подтверждённый автор">✓</span>':''}</h2><p>${escapeHtml(u.bio||'Пока без описания')}</p><p class="accountStatus">${u.email_verified?'✓ Почта подтверждена':'◌ Почта не подтверждена'}</p>${!u.email_verified && currentUser?.id===u.id?`<form class="form codeVerifyForm" onsubmit="verifyEmailCode(event)"><label>Код из письма<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" placeholder="000000" required></label><button class="button" type="submit">Подтвердить почту</button></form>` : ''}${!u.email_verified && currentUser?.id===u.id?'<button class="button verifyButton" onclick="resendVerification(this)">Отправить код подтверждения</button>':''}</div></div>${u.is_artist?'<button class="button" onclick="showTrackSubmission()">♫ Отправить трек</button>':''}${u.is_verified||u.is_admin?'<button class="button secondary" onclick="showAddRelease()">+ Добавить релиз</button>':''}${u.is_artist||u.is_admin?'<button class="button secondary" onclick="showSubmissions()">Мои заявки / модерация</button>':''}${u.is_admin?'<button class="button secondary" onclick="showTestPanel()">Панель тестирования</button>':''}`)}
function renderAccountSettings(){accountPage('Настройки',`<div class="settingsCard"><h2>Профиль</h2><form id="settingsForm" class="form"><label>Ссылка на аватар (HTTPS)<input name="avatar_url" type="url" value="${escapeAttr(currentUser.avatar_url||'')}" placeholder="https://..."></label><label>О себе<textarea name="bio" rows="4" maxlength="500">${escapeHtml(currentUser.bio||'')}</textarea></label><button class="button">Сохранить</button></form><hr><h2>Электронная почта</h2><p>${escapeHtml(currentUser.email)}</p><p>${currentUser.email_verified?'✓ Почта подтверждена':'Подтверди почту, чтобы оценивать музыку и писать рецензии.'}</p>${currentUser.email_verified?'':`<form class="form codeVerifyForm" onsubmit="verifyEmailCode(event)"><label>Код из письма<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" placeholder="000000" required></label><button class="button" type="submit">Подтвердить почту</button></form>`}${currentUser.email_verified?'':'<button class="button verifyButton" id="resendEmail">Отправить код повторно</button><p class="verifyHelp">Введи шестизначный код из письма. Проверь папку «Спам».</p>'}</div>`);$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});currentUser=d.user;renderAuthArea();toast('Сохранено');renderAccountSettings()}catch(err){toast(err.message)}});$('#resendEmail')?.addEventListener('click',e=>resendVerification(e.currentTarget))}
async function verifyEmailCode(event){event.preventDefault();const form=event.currentTarget;const btn=form.querySelector('button');btn.disabled=true;try{await api('/api/verify-code',{method:'POST',body:JSON.stringify({code:new FormData(form).get('code')})});await loadMe();toast('Почта подтверждена!');renderAccountSettings()}catch(err){toast(err.message)}finally{btn.disabled=false}}
async function resendVerification(button){if(!currentUser)return openAuth();if(button){button.disabled=true;button.textContent='Отправляем…'}try{await api('/api/resend-verification',{method:'POST'});toast('Код отправлен! Проверь входящие и спам.');if(button)button.textContent='Код отправлен'}catch(err){toast(err.message);if(button){button.disabled=false;button.textContent='Повторить отправку кода'}}}
// Client-side direct upload to Vercel Blob: files never pass through the Vercel function body.
async function uploadRomFile(file,kind,button){
 if(!file)return '';
 const image=kind==='cover',limit=(image?4:40)*1024*1024;
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(!((image&&['png','jpg','jpeg'].includes(ext))||(!image&&['mp3','flac','wav'].includes(ext))))throw Error(image?'Обложка: только PNG или JPG.':'Аудио: только MP3, FLAC или WAV.');
 if(file.size>limit)throw Error(`Файл превышает ${image?4:40} МБ.`);
 const allowed=image?['image/png','image/jpeg']:['audio/mpeg','audio/mp3','audio/flac','audio/x-flac','audio/wav','audio/wave','audio/x-wav'];
 if(file.type&&!allowed.includes(file.type))throw Error('Некорректный формат файла.');
 if(!window.romBlobUpload)throw Error('Модуль загрузки не подключён. Обнови страницу.');
 const name=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
 const original=button?.textContent;
 try{
  const blob=await window.romBlobUpload(`${image?'covers':'audio'}/${name}`,file,{
   access:'public',handleUploadUrl:'/api/blob-upload',multipart:!image,
   onUploadProgress:({percentage})=>{if(button)button.textContent=`Загрузка ${Math.round(percentage)}%…`}
  });
  return blob.url;
 }finally{if(button)button.textContent=original;}
}
function coverFilePreview(input,target){const f=input.files?.[0],img=document.querySelector(target);if(!img)return;if(!f){img.classList.add('hidden');return}if(f.size>4*1024*1024){toast('Обложка должна быть до 4 МБ');input.value='';return}img.src=URL.createObjectURL(f);img.classList.remove('hidden')}
const AUDIO_ACCEPT='.mp3,.flac,.wav,audio/mpeg,audio/flac,audio/wav,audio/x-wav';
function releaseFormHtml(submission=false){return `<label>Исполнитель<input name="artist_name" maxlength="120" required placeholder="Имя исполнителя" value="${submission?escapeAttr(currentUser.username):''}"></label><label>Featuring (необязательно)<input name="featuring" maxlength="250" placeholder="Например: Artist A, Artist B"></label><label>Название ${submission?'трека':'релиза'}<input name="title" maxlength="${submission?150:200}" required placeholder="Название"></label><label>Обложка · PNG/JPG до 4 МБ<input type="file" name="cover_file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onchange="coverFilePreview(this,'#uploadCoverPreview')"></label>${submission?`<label>Аудио · MP3/FLAC/WAV до 40 МБ<input type="file" name="audio_file" accept="${AUDIO_ACCEPT}" required></label>`:''}`}
function releaseTrackRow(i){return `<div class="releaseTrackRow" data-track-row><div class="trackRowHead"><strong class="trackRowNumber">Трек ${i}</strong><button class="trackRemove" type="button" onclick="removeReleaseTrack(this)" aria-label="Удалить трек">✕</button></div><label>Название трека<input name="track_title" maxlength="200" required placeholder="Название композиции"></label><label>Featuring трека (необязательно)<input name="track_featuring" maxlength="250" placeholder="Приглашённый исполнитель"></label><label>Аудиофайл · MP3, FLAC или WAV до 40 МБ<input type="file" name="track_audio" accept="${AUDIO_ACCEPT}" required></label></div>`}
function updateReleaseTracks(){const form=document.querySelector('#addReleaseForm');if(!form)return;const rows=[...form.querySelectorAll('[data-track-row]')],select=form.elements.release_type,kind=select.value;rows.forEach((row,i)=>{row.querySelector('.trackRowNumber').textContent=`Трек ${i+1}`;row.querySelector('.trackRemove').disabled=rows.length===1});const effective=kind==='single'&&rows.length===2?'multi_single':kind;const hint=form.querySelector('#releaseTypeHint');hint.textContent=kind==='single'&&rows.length===2?'Два трека — релиз автоматически станет мульти-синглом.':kind==='single'?'Сингл — один трек. Добавь второй для мульти-сингла.':kind==='ep'?'EP — добавляй композиции кнопкой ниже.':'Альбом — добавляй композиции кнопкой ниже.';form.querySelector('#releaseTypeEffective').textContent=effective==='multi_single'?'Мульти-сингл':kind==='single'?'Сингл':kind==='ep'?'EP':'Альбом';form.querySelector('#addTrackButton').disabled=kind==='single'&&rows.length>=2}
function addReleaseTrack(){const form=document.querySelector('#addReleaseForm');if(!form)return;const n=form.querySelectorAll('[data-track-row]').length;if(n>=30||form.elements.release_type.value==='single'&&n>=2){toast('Для сингла максимум 2 трека. Для EP/альбома — до 30.');return}form.querySelector('#releaseTracks').insertAdjacentHTML('beforeend',releaseTrackRow(n+1));updateReleaseTracks()}
function removeReleaseTrack(btn){const form=document.querySelector('#addReleaseForm');if(form.querySelectorAll('[data-track-row]').length<=1)return;btn.closest('[data-track-row]').remove();updateReleaseTracks()}
function changeReleaseType(){const form=document.querySelector('#addReleaseForm');if(!form)return;const kind=form.elements.release_type.value;const rows=form.querySelectorAll('[data-track-row]');if(kind==='single'&&rows.length>2){if(!confirm('Для сингла допускается максимум 2 трека. Удалить остальные треки из формы?')){form.elements.release_type.value=form.dataset.previousType||'album';return}Array.from(rows).slice(2).forEach(r=>r.remove())}form.dataset.previousType=kind;updateReleaseTracks()}
async function submitRomUpload(e,endpoint){e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type=submit]');btn.disabled=true;try{
 const data=Object.fromEntries(new FormData(form));const cover=form.elements.cover_file.files[0];
 if(endpoint==='/api/albums'){
  const rows=[...form.querySelectorAll('[data-track-row]')];if(!rows.length||rows.length>30)throw Error('Добавь от 1 до 30 треков.');
  const kind=form.elements.release_type.value;if(kind==='single'&&rows.length>2)throw Error('У сингла максимум два трека.');
  const tracks=[];for(let i=0;i<rows.length;i++){const row=rows[i],file=row.querySelector('[name="track_audio"]').files[0];if(!file)throw Error(`Загрузи аудио для трека ${i+1}`);tracks.push({title:row.querySelector('[name="track_title"]').value.trim(),featuring:row.querySelector('[name="track_featuring"]').value.trim(),file})}
  data.cover_url=cover?await uploadRomFile(cover,'cover',btn):'';
  data.tracks=[];for(let i=0;i<tracks.length;i++){btn.textContent=`Трек ${i+1} из ${tracks.length}…`;const t=tracks[i];data.tracks.push({title:t.title,featuring:t.featuring,audio_url:await uploadRomFile(t.file,'audio',btn)})}
  data.release_type=kind==='single'&&tracks.length===2?'multi_single':kind;
  delete data.cover_file;delete data.track_title;delete data.track_featuring;delete data.track_audio;
 }else{
  const audio=form.elements.audio_file.files[0];if(!audio)throw Error('Выбери аудиофайл.');data.cover_url=cover?await uploadRomFile(cover,'cover',btn):'';data.audio_url=await uploadRomFile(audio,'audio',btn);delete data.cover_file;delete data.audio_file;
 }
 const r=await api(endpoint,{method:'POST',body:JSON.stringify(data)});toast(endpoint==='/api/albums'?'Релиз опубликован!':'Трек отправлен на рассмотрение!');if(endpoint==='/api/albums'){await loadAlbums();openAlbum(r.id)}else await showSubmissions();
 }catch(err){toast(err.message);alert(err.message)}finally{btn.disabled=false;btn.textContent=endpoint==='/api/albums'?'Опубликовать':'Отправить на рассмотрение →'}
}
async function showAddRelease(){
 if(!currentUser?.is_verified&&!currentUser?.is_admin)return toast('Нужна галочка подтверждённого автора');
 accountPage('Добавить релиз',`<p class="studioLead">Заполни данные релиза и добавь треки, как в кабинете музыкального дистрибьютора.</p><div class="studioGrid"><form id="addReleaseForm" class="settingsCard form studioForm">${releaseFormHtml(false)}<label>Тип релиза<select name="release_type" onchange="changeReleaseType()"><option value="single">Сингл</option><option value="ep">EP</option><option value="album">Альбом</option></select></label><div class="releaseTypeInfo"><span id="releaseTypeEffective">Сингл</span><p id="releaseTypeHint"></p></div><label>Дата релиза<input name="release_date" type="date"></label><label>Описание<textarea name="description" rows="4" maxlength="5000"></textarea></label><div class="releaseTracksTitle"><h3>Треклист</h3><span>До 40 МБ на трек</span></div><div id="releaseTracks">${releaseTrackRow(1)}</div><button class="addTrackButton" id="addTrackButton" type="button" onclick="addReleaseTrack()">＋ Добавить трек</button><button class="button" type="submit">Опубликовать</button></form><div class="previewPanel"><p class="eyebrow">ПРЕДПРОСМОТР ОБЛОЖКИ</p><img id="uploadCoverPreview" class="previewImage hidden" alt="Обложка"><div class="previewPlaceholder">♫</div><p class="mutedSmall">PNG/JPG · до 4 МБ. Аудио MP3/FLAC/WAV · до 40 МБ на трек.</p></div></div>`);
 updateReleaseTracks();$('#addReleaseForm').addEventListener('submit',e=>submitRomUpload(e,'/api/albums'));
}


function imagePreview(input,target){const img=document.querySelector(target);if(!img)return;const url=input.value.trim();if(/^https:\/\/[^\s]+$/i.test(url)){img.src=url;img.classList.remove('hidden')}else{img.removeAttribute('src');img.classList.add('hidden')}}
function showTrackSubmission(){
 if(!currentUser)return openAuth();if(!currentUser.is_artist)return toast('Загрузка доступна только артистам с зелёной ноткой.');
 accountPage('Отправить трек',`<p class="studioLead">Твой трек попадёт на рассмотрение команды ROM и не будет опубликован автоматически.</p><div class="studioGrid"><form id="trackSubmissionForm" class="settingsCard form studioForm">${releaseFormHtml(true)}<label>Описание<textarea name="description" rows="5" maxlength="2000" placeholder="Расскажи о треке"></textarea></label><button class="button" type="submit">Отправить на рассмотрение →</button></form><div class="previewPanel"><p class="eyebrow">ПРЕДПРОСМОТР ОБЛОЖКИ</p><img id="uploadCoverPreview" class="previewImage hidden" alt="Обложка"><div class="previewPlaceholder">♫</div><p class="mutedSmall">Обложка PNG/JPG до 4 МБ. Трек MP3/FLAC/WAV до 40 МБ.</p></div></div>`);
 $('#trackSubmissionForm').addEventListener('submit',e=>submitRomUpload(e,'/api/submissions'));
}

async function showSubmissions(){if(!currentUser)return openAuth();accountPage(currentUser.is_admin?'Модерация треков':'Мои заявки','<div class="empty">Загружаем заявки…</div>');try{const {submissions}=await api('/api/submissions');accountPage(currentUser.is_admin?'Модерация треков':'Мои заявки',`<div class="studioList">${submissions.length?submissions.map(t=>`<article class="submissionCard"><div class="submissionThumb">${t.cover_url?`<img src="${escapeAttr(t.cover_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'♫'}</div><div class="submissionInfo"><div class="submissionMeta">${escapeHtml(t.artist_name)} ${t.featuring?`feat. ${escapeHtml(t.featuring)}`:""} · @${escapeHtml(t.username)}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description||'Без описания')}</p><a href="${escapeAttr(t.audio_url)}" target="_blank" rel="noopener noreferrer">Открыть аудио ↗</a></div><div class="submissionActions"><span class="submissionStatus ${escapeAttr(t.status)}">${{pending:'На рассмотрении',approved:'Одобрено',rejected:'Отклонено'}[t.status]||escapeHtml(t.status)}</span>${currentUser.is_admin?`<button class="button" onclick="moderateTrack(${Number(t.id)},'approved')">Одобрить</button><button class="button secondary" onclick="moderateTrack(${Number(t.id)},'rejected')">Отклонить</button>`:''}</div></article>`).join(''):'<div class="emptyState"><h2>Пока нет заявок</h2><p>Здесь появятся отправленные треки.</p></div>'}</div>`)}catch(e){toast(e.message)}}
async function moderateTrack(id,status){try{await api(`/api/submissions/${id}`,{method:'PATCH',body:JSON.stringify({status})});toast('Статус обновлён');showSubmissions()}catch(e){toast(e.message)}}
async function showTestPanel(){if(!currentUser?.is_admin)return toast('Только администратор');accountPage('Панель тестирования',`<div class="studioGrid"><button class="button" onclick="showSubmissions()">♫ Заявки на модерацию</button><div class="settingsCard"><h2>Роли пользователей</h2><p>Выдавай зелёную нотку артистам. Доступ проверяется сервером.</p><div id="adminUsers">Загрузка…</div></div></div>`);try{const {users}=await api('/api/admin/users');$('#adminUsers').innerHTML=users.map(u=>`<div class="adminUserRow"><span>@${escapeHtml(u.username)} ${u.is_artist?artistBadge():''}<small>${u.email_verified?' · Email ✓':' · Email не подтверждён'}</small></span><button class="button secondary" onclick="setArtist(${Number(u.id)},${!u.is_artist})">${u.is_artist?'Снять нотку':'Выдать нотку'}</button></div>`).join('')}catch(e){toast(e.message)}}
async function setArtist(id,is_artist){try{await api(`/api/admin/users/${id}/artist`,{method:'PATCH',body:JSON.stringify({is_artist})});toast('Роль обновлена');await loadMe();showTestPanel()}catch(e){toast(e.message)}}

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
