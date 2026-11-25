let currentUser = null;
let romPendingTimer = null;

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
  refreshPendingBadge();
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
  area.innerHTML = `${currentUser.is_admin?'<button class="romNotificationBell" id="romNotificationBell" onclick="showSubmissions()" aria-label="Заявки на модерацию" title="Заявки на модерацию"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="romBellCount hidden" id="romBellCount">0</span></button>':''}${currentUser.is_artist?'<button class="uploadTrackTop" onclick="showTrackSubmission()">Загрузить трек</button>':''}<div class="profileMenuWrap">
    <button class="avatarButton" onclick="toggleProfileMenu(event)" aria-label="Меню профиля">${avatar}</button>
    <div id="profileMenu" class="profileDropdown hidden">
      <div class="menuUsername">@${escapeHtml(currentUser.username)} ${currentUser.is_artist?artistBadge():''} ${currentUser.is_verified?'✓':''}</div>
      <button onclick="showProfile();closeProfileMenu()">Аккаунт</button>
      <button onclick="showSettings();closeProfileMenu()">Настройки</button>
      <button onclick="logout();closeProfileMenu()">Выйти</button>
    </div>
  </div>`;
}

async function refreshPendingBadge(){
 if(romPendingTimer){clearInterval(romPendingTimer);romPendingTimer=null}
 if(!currentUser?.is_admin)return;
 const update=async()=>{try{const d=await api('/api/admin/pending-count'),badge=document.querySelector('#romBellCount');if(!badge)return;badge.textContent=d.count>99?'99+':String(d.count);badge.classList.toggle('hidden',!d.count);document.querySelector('#romNotificationBell')?.setAttribute('title',`${d.count} заявок на модерацию`)}catch(e){console.warn('Notifications:',e.message)}};
 await update();romPendingTimer=setInterval(()=>{if(document.visibilityState==='visible')update()},45000);
}
async function logout() {
  await api("/api/logout", { method: "POST" });
  currentUser = null;
  renderAuthArea();
  refreshPendingBadge();
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
    const score = album.average_rating == null ? "?" : Number(album.average_rating).toFixed(1).replace(/\.0$/, "");
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
    : `${Number(album.average_rating).toFixed(1).replace(/\.0$/, '')}/90`;
  const cover = album.cover_url
    ? `<div class="catalogCover" style="background-image:url('${escapeAttr(album.cover_url)}')"></div>`
    : `<div class="catalogCover catalogPlaceholder">${escapeHtml(String(album.title || 'R').slice(0, 1).toUpperCase())}</div>`;
  return `<article class="catalogCard" role="button" tabindex="0" onclick="openAlbum(${Number(album.id)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openAlbum(${Number(album.id)})}">
    ${cover}<div class="catalogInfo"><h3>${escapeHtml(album.title)}</h3><p>${escapeHtml(album.artist_name)}</p><div class="catalogScore"><strong>${score}</strong><span>${Number(album.rating_count || 0)} оценок</span></div></div>
  </article>`;
}

let romPageRequest = 0;
async function renderPage(page) {
  const requestId=++romPageRequest;
  $('#homeView').classList.add('hidden');
  $('#releasePage').classList.add('hidden');
  $('#pageView').classList.remove('hidden');
  document.body.classList.remove('releaseOpen');
  setActiveNav(page);
  window.scrollTo(0, 0);romScheduleBackground();

  const pages = {
    best: { eyebrow: 'COMMUNITY RANKING', title: 'Лучшие релизы', intro: 'Альбомы, которые получили самые высокие оценки сообщества.' },
    new: { eyebrow: 'FRESH DROPS', title: 'Новые релизы', intro: 'Последние альбомы, добавленные в каталог ROM.' },
    news: { eyebrow: 'ROM JOURNAL', title: 'Новости', intro: 'Обновления платформы и важные события музыкального сообщества.' },
    about: { eyebrow: 'ABOUT THE PROJECT', title: 'Музыка — это мнение.', intro: 'ROM (Rate Our Music) — независимая площадка, где слушатели оценивают альбомы, пишут рецензии и формируют общую музыкальную картину.' }
  };
  const meta = pages[page] || pages.new;
  const root = $('#pageView');
  root.dataset.publicPage='true';
  root.innerHTML = `<section class="pageIntro"><p class="eyebrow">${meta.eyebrow}</p><h1>${meta.title}</h1><p>${meta.intro}</p></section><section id="pageBody" class="pageBody"><div class="empty">Загружаем…</div></section>`;
  romEnterPage('#pageView');

  if (page === 'about') {
    $('#pageBody').innerHTML = `<div class="aboutGrid">
      <article class="aboutTile"><span>01 / DISCOVER</span><h2>Открывай новое</h2><p>Находи альбомы и артистов за пределами привычного плейлиста.</p></article>
      <article class="aboutTile"><span>02 / RATE</span><h2>Оценивай честно</h2><p>Ставь оценки и помогай формировать рейтинг релизов.</p></article>
      <article class="aboutTile"><span>03 / DISCUSS</span><h2>Обсуждай музыку</h2><p>Публикуй рецензии и знакомься с мнениями других слушателей.</p></article>
    </div><div class="aboutNote"><span class="aboutMark">ROM.</span><p>Наша идея проста: у каждого альбома есть своя история, а у каждого слушателя — собственное мнение. ROM собирает их в одном месте.</p></div>`;
    return;
  }

  if (page === 'news') {
    try{
      const {posts}=await api('/api/news');if(requestId!==romPageRequest)return;window.romNewsCache=posts;
      $('#pageBody').innerHTML=posts.length?`<div class="romNewsGrid">${posts.map(n=>`<article class="romNewsCard">${n.cover_url?`<img src="${escapeAttr(n.cover_url)}" alt="" loading="lazy">`:''}<div class="romNewsCardBody"><time>${new Date(n.created_at).toLocaleDateString('ru-RU')}</time><h2>${escapeHtml(n.title)}</h2><p>${escapeHtml(n.summary||n.body.slice(0,160))}</p><button class="button secondary" onclick="romReadNews(${Number(n.id)})">Читать</button></div></article>`).join('')}</div>`:'<div class="emptyState"><h2>Пока без новостей</h2><p>Здесь появятся публикации ROM.</p></div>';
    }catch(e){if(requestId!==romPageRequest)return;$('#pageBody').innerHTML=`<div class="emptyState"><h2>Новости пока недоступны</h2><p>${escapeHtml(e.message)}</p></div>`}
    return;
  }

  try {
    const data = await api('/api/albums');
    if(requestId!==romPageRequest)return;
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
    if(requestId!==romPageRequest)return;
    $('#pageBody').innerHTML = `<div class="emptyState"><h2>Не удалось загрузить каталог</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function romEnterPage(selector){
 // Animate inner content only. Never animate the page container: opacity/transform
 // on the container caused intermittent invisible reviews after interactions.
 const root=document.querySelector(selector);
 if(!root||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=root.matches('#releasePage')?root.querySelector('#releaseContent'):root.matches('#pageView')?root.querySelector('.pageBody, .romProfilePage, .romNewsArticle'):root.querySelector('.hero');
 if(!target)return;
 target.classList.remove('romContentReveal');
 void target.offsetWidth;
 target.classList.add('romContentReveal');
 target.addEventListener('animationend',()=>target.classList.remove('romContentReveal'),{once:true});
}
function romBackgroundMode(){
 const release=!$('#releasePage').classList.contains('hidden');
 const home=!$('#homeView').classList.contains('hidden');
 const page=!$('#pageView').classList.contains('hidden');
 const profile=page&&Boolean($('#pageView .romProfilePage'));
 const catalog=page&&($('#pageView').dataset.publicPage==='true'||Boolean($('#pageView .romNewsArticle')));
 document.body.classList.toggle('romGridActive',release||home||profile||catalog);
 if(home||catalog)document.body.style.setProperty('--rom-grid-color','#8bff72');
}
function romScheduleBackground(){requestAnimationFrame(romBackgroundMode)}
function goHome() {
  ++romPageRequest;
  $('#releasePage').classList.add('hidden');
  $('#pageView').classList.add('hidden');
  $('#homeView').classList.remove('hidden');
  document.body.classList.remove('releaseOpen');
  setActiveNav('');
  history.replaceState({}, '', '/');
  window.scrollTo(0, 0);romEnterPage('#homeView');romScheduleBackground();
}

let romActiveAudio=null;
function romTime(sec){if(!Number.isFinite(sec))return '0:00';const v=Math.floor(sec);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`}
function romPlay(btn){
 const row=btn.closest('.romPlayer'),audio=row.querySelector('audio');
 if(romActiveAudio&&romActiveAudio!==audio){romActiveAudio.pause();romActiveAudio.closest('.romPlayer')?.classList.remove('is-open')}
 row.classList.add('is-open');
 if(audio.paused){audio.play().catch(()=>toast('Не удалось воспроизвести аудио'));romActiveAudio=audio}
 else audio.pause();
}
function romAudioInit(){
 document.querySelectorAll('.romPlayer').forEach(row=>{
  const a=row.querySelector('audio'),b=row.querySelector('.romPlay'),seek=row.querySelector('.romSeek'),vol=row.querySelector('.romVolume'),clock=row.querySelector('.romClock');
  a.addEventListener('play',()=>{b.textContent='❚❚';b.setAttribute('aria-label','Пауза');row.classList.add('is-playing','is-open')});
  a.addEventListener('pause',()=>{b.textContent='▶';b.setAttribute('aria-label','Воспроизвести');row.classList.remove('is-playing')});
  a.addEventListener('ended',()=>{b.textContent='▶';row.classList.remove('is-playing')});
  a.addEventListener('loadedmetadata',()=>clock.textContent=`0:00 / ${romTime(a.duration)}`);
  a.addEventListener('timeupdate',()=>{seek.value=a.duration?String(a.currentTime/a.duration*100):'0';clock.textContent=`${romTime(a.currentTime)} / ${romTime(a.duration)}`;seek.style.setProperty('--progress',`${seek.value}%`)});
  seek.addEventListener('input',()=>{if(a.duration)a.currentTime=Number(seek.value)/100*a.duration});
  vol.addEventListener('input',()=>a.volume=Number(vol.value)/100);
 });
}
function romRatingColor(score){const n=Math.max(1,Math.min(90,Number(score)||1));const hue=Math.round((n-1)/89*120);return `hsl(${hue} 95% 53%)`}
function romTheme(theme){return ['none','aurora','glow','waves'].includes(theme)?theme:'none'}
function romBrightenColor(hex){
 const safe=romSafeColor(hex);
 return '#'+[1,3,5].map(i=>Math.min(255,parseInt(safe.slice(i,i+2),16)*2).toString(16).padStart(2,'0')).join('');
}
function romSafeColor(color){return /^#[0-9a-f]{6}$/i.test(String(color||''))?String(color).toLowerCase():'#8bff72'}
function romClampReleaseRgb(hex){
 const safe=romSafeColor(hex);
 return '#'+[1,3,5].map(i=>Math.min(100,parseInt(safe.slice(i,i+2),16)).toString(16).padStart(2,'0')).join('');
}
function romRgbControls(color='#466446'){
 const c=romSafeColor(color);
 const [r,g,b]=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
 return `<fieldset class="romRgbEditor"><legend>Цвет фона релиза</legend><p class="romRgbDescription">Выбери оттенок на палитре. Максимум 100 для каждого канала RGB.</p><label class="romRgbPreview"><input class="romRgbHex" type="color" aria-label="Выбрать цвет фона" value="${c}" oninput="romRgbFromColor(this)" onchange="romRgbFromColor(this)"><span class="romRgbDisplay"><strong class="romRgbCode">${c.toUpperCase()}</strong><small class="romRgbNumbers">R ${r} · G ${g} · B ${b}</small></span></label><input name="background_color" type="hidden" value="${c}"></fieldset>`;
}
function romRgbFromColor(input){
 const root=input.closest('.romRgbEditor');if(!root)return;
 const color=romClampReleaseRgb(input.value);
 input.value=color;
 root.querySelector('[name="background_color"]').value=color;
 root.querySelector('.romRgbCode').textContent=color.toUpperCase();
 const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 root.querySelector('.romRgbNumbers').textContent=`R ${r} · G ${g} · B ${b}`;
}

function romGoBack(){if(history.length>1){history.back()}else goHome()}
function romReleaseDate(value){
 if(!value)return 'Не указана';
 const raw=String(value).trim(),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
 if(m)return `${m[3]}.${m[2]}.${m[1]}`;
 const d=new Date(raw);
 return Number.isNaN(d.getTime())?raw:d.toLocaleDateString('ru-RU');
}
function romOpenRating(){const composer=document.querySelector('#ratingComposer');if(composer){composer.classList.toggle('hidden');if(!composer.classList.contains('hidden'))composer.querySelector('[name="rating"]').focus()}}
async function openAlbum(id) {
 ++romPageRequest;
 const albumRequest=romPageRequest;
 if(romActiveAudio){romActiveAudio.pause();romActiveAudio=null;}
 try {
  const data=await api(`/api/albums/${id}`),a=data.album;
  if(albumRequest!==romPageRequest)return;
  const average=a.average_rating==null?'—':Number(a.average_rating).toFixed(1).replace(/\.0$/,'');
  $('#releasePage').style.setProperty('--page-glow',romSafeColor(a.background_color));
  document.body.style.setProperty('--rom-grid-color',romBrightenColor(a.background_color));
  const reviews=(data.reviews||[]).sort((x,y)=>Number(Boolean(y.body?.trim()))-Number(Boolean(x.body?.trim()))||new Date(y.created_at)-new Date(x.created_at));
  $('#releaseContent').innerHTML=`
  <div class="romReleaseHeading"><div class="romReleaseHeadingArtist">${escapeHtml(a.artist_name)}</div><h1>${escapeHtml(a.title)}</h1></div>
  <div class="romReleaseHero">
    <div class="romReleaseCover">${a.cover_url?`<img src="${escapeAttr(a.cover_url)}" alt="Обложка ${escapeAttr(a.title)}">`:'<span>ROM</span>'}</div>
    <div class="romReleaseSidebar">
      <div class="romOverviewPanel">
        <div class="romOverviewBlock romOverviewRating">
          <span class="romOverviewLabel">ОЦЕНКА ПОЛЬЗОВАТЕЛЕЙ</span>
          <div class="romOverviewRatingRow"><strong>${average}</strong><div class="romOverviewRatingDetails"><span>из 90 баллов</span><span>${Number(a.rating_count||0)} оценок</span></div></div>
          <div class="romOverviewMeter"><span style="width:${a.average_rating==null?0:Math.max(0,Math.min(100,Number(a.average_rating)/90*100))}%;background:${romRatingColor(a.average_rating)}!important"></span></div>
        </div>
        <div class="romOverviewBlock romOverviewFacts">
          <span class="romOverviewLabel">ИНФОРМАЦИЯ О РЕЛИЗЕ</span>
          <dl><div><dt>Тип релиза</dt><dd>${({single:'Сингл',multi_single:'Мульти-сингл',ep:'EP',album:'Альбом'})[a.release_type]||'Релиз'}</dd></div><div><dt>Дата релиза</dt><dd>${escapeHtml(romReleaseDate(a.release_date))}</dd></div></dl>
        </div>
      </div>
      <div class="romOverviewAction">${currentUser?.email_verified?`<button class="button romRateButton" onclick="romOpenRating()">Оценить релиз</button>`:currentUser?`<button class="button secondary" onclick="showSettings()">Подтверди почту для оценки</button>`:`<button class="button" onclick="openAuth()">Войти, чтобы оценить</button>`}</div>
    </div>
  </div>
  ${currentUser?.email_verified?`<form id="ratingComposer" class="romComposer hidden"><div class="romComposerHeading"><div><span class="eyebrow">ТВОЯ ОЦЕНКА</span><h3>Оценить ${escapeHtml(a.title)}</h3></div><button type="button" class="romClose" onclick="romOpenRating()" aria-label="Закрыть">✕</button></div><label>Оценка от 1 до 90<input name="rating" type="number" min="1" max="90" step="1" inputmode="numeric" placeholder="Например, 75" required></label><label>Заголовок рецензии <span class="romOptional">необязательно</span><input name="title" maxlength="150" placeholder="Что думаешь о релизе?"></label><label>Текст рецензии <span class="romOptional">необязательно</span><textarea name="body" rows="5" maxlength="10000" placeholder="Поделись впечатлениями или оставь только оценку"></textarea></label><button class="button" type="submit">Опубликовать оценку</button></form>`:''}
  <section class="romSection"><div class="romSectionTitle"><h2>Треклист</h2><span>${data.tracks.length} тр.</span></div><div class="romTrackList">${data.tracks.length?data.tracks.map(t=>`<div class="romTrack"><span class="romTrackIndex">${Number(t.track_number)}</span><div class="romTrackTitle"><strong>${escapeHtml(t.title)}</strong>${t.featuring?`<small>feat. ${escapeHtml(t.featuring)}</small>`:''}</div>${t.audio_url?`<div class="romPlayer"><audio preload="metadata" src="${escapeAttr(t.audio_url)}"></audio><button type="button" class="romPlay" onclick="romPlay(this)" aria-label="Воспроизвести">▶</button><div class="romPlayerExpanded"><span class="romClock">0:00 / 0:00</span><input class="romSeek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Перемотка"><span class="romVolumeIcon">♫</span><input class="romVolume" type="range" min="0" max="100" value="100" aria-label="Громкость"></div></div>`:`<span class="romTrackMissing">Аудио недоступно</span>`}</div>`).join(''):'<p class="empty">Треков пока нет.</p>'}</div></section>
  <section class="romSection"><div class="romSectionTitle"><h2>Оценки и рецензии</h2><span>${reviews.length}</span></div><div class="romReviews">${reviews.length?reviews.map(r=>`<article class="romReview ${r.body?.trim()?'romTextReview':'romOnlyRating'}"><div class="romReviewUser"><button type="button" class="romReviewAvatar romProfileLink" onclick="openUserProfile(${Number(r.user_id)})" title="Профиль ${escapeAttr(r.username)}">${r.avatar_url?`<img src="${escapeAttr(r.avatar_url)}" alt="">`:escapeHtml(String(r.username||'?').slice(0,1).toUpperCase())}</button><div class="romReviewIdentity"><strong><button type="button" class="romUsernameLink" onclick="openUserProfile(${Number(r.user_id)})">${escapeHtml(r.username)}</button> ${r.is_artist?artistBadge():''}</strong><small>${new Date(r.created_at).toLocaleDateString('ru-RU')}</small></div><strong class="romReviewScore" style="color:${romRatingColor(Number(r.rating))}">${Number(r.rating).toFixed(0)}<small>/90</small></strong></div>${r.body?.trim()?`<div class="romReviewBody">${r.title?`<h3>${escapeHtml(r.title)}</h3>`:''}<p>${escapeHtml(r.body)}</p></div>`:''}</article>`).join(''):'<div class="romNoReviews">Пока никто не оценил этот релиз. Будь первым!</div>'}</div></section>`;
  romAudioInit();
  const composer=$('#ratingComposer');if(composer)composer.addEventListener('submit',async e=>{e.preventDefault();const btn=composer.querySelector('[type="submit"]');btn.disabled=true;try{const f=new FormData(composer);await api('/api/reviews',{method:'POST',body:JSON.stringify({album_id:id,rating:Number(f.get('rating')),title:String(f.get('title')||'').trim(),body:String(f.get('body')||'').trim()})});toast('Оценка опубликована!');await openAlbum(id);await loadAlbums()}catch(err){toast(err.message)}finally{btn.disabled=false}});
  $('#homeView').classList.add('hidden');$('#pageView').classList.add('hidden');$('#releasePage').classList.remove('hidden');$('#releasePage').classList.remove('romPageEnter');setActiveNav('');document.body.classList.add('releaseOpen');history.replaceState({albumId:id},'',`/#album-${id}`);window.scrollTo(0,0);romEnterPage('#releasePage');romScheduleBackground();
 }catch(err){if(albumRequest===romPageRequest)toast('Не удалось загрузить релиз: '+err.message)}
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


function artistBadge(profile=false){
 const klass=profile?'romProfileArtistMark':'artistBadge';
 return `<span class="${klass}" title="Артист ROM" role="img" aria-label="Артист"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.5 6.8 18.2 4.5v11.2M9.5 6.8v11.9" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><ellipse cx="6.5" cy="19" rx="3.5" ry="2.4" transform="rotate(-18 6.5 19)" fill="currentColor"/><ellipse cx="15.2" cy="16" rx="3.5" ry="2.4" transform="rotate(-18 15.2 16)" fill="currentColor"/></svg></span>`;
}
function toggleProfileMenu(event){event.stopPropagation();$('#profileMenu')?.classList.toggle('hidden')}
function closeProfileMenu(){$('#profileMenu')?.classList.add('hidden')}
document.addEventListener('click',e=>{if(!e.target.closest('.profileMenuWrap'))closeProfileMenu()});
function showProfile(){if(!currentUser)return openAuth();renderUserPage(currentUser)}
async function openUserProfile(userId){
 try{const result=await api(`/api/users/id/${Number(userId)}`);await renderUserPage(result.user)}
 catch(err){toast(err.message)}
}
function showSettings(){if(!currentUser)return openAuth();renderAccountSettings()}
function accountPage(title,body,clean=false){++romPageRequest;$('#pageView').dataset.publicPage='false';$('#homeView').classList.add('hidden');$('#releasePage').classList.add('hidden');$('#pageView').classList.remove('hidden');document.body.classList.remove('releaseOpen');setActiveNav('');$('#pageView').innerHTML=`<section class="accountPage ${clean?'romProfilePage':''}">${clean?'':`<button class="ghost" onclick="goHome()">← Главная</button><h1>${title}</h1>`}${body}</section>`;window.scrollTo(0,0);if(clean)romEnterPage('#pageView .romProfilePage');romScheduleBackground()}
async function renderUserPage(u){
 accountPage('',`<div class="romProfileTop"><div class="romProfileAvatar">${u.avatar_url?`<img src="${escapeAttr(u.avatar_url)}" alt="">`:escapeHtml(u.username.slice(0,1).toUpperCase())}</div><div class="romProfileIntro"><h1><span class="romProfileName">${escapeHtml(u.username)}</span>${u.is_artist?artistBadge(true):''}${u.is_verified?'<span class="verifiedMark" title="Подтверждённый автор">✓</span>':''}</h1><p>${escapeHtml(u.bio||'Пока без описания')}</p></div></div>
 <div class="romProfileStats" id="romProfileStats"><div><span>Рецензии</span><strong>—</strong></div><div><span>Релизы</span><strong>—</strong></div><div><span>Оценки</span><strong>—</strong></div></div>
 <div class="romProfileGrid"><section class="romProfilePanel"><div class="romProfilePanelTitle"><h2>Написанные рецензии</h2></div><div id="romProfileReviews" class="romProfileReviews"><p class="mutedSmall">Загружаем рецензии…</p></div></section><aside class="romProfilePanel"><div class="romProfilePanelTitle"><h2>Распределение оценок</h2></div><div id="romProfileDistribution" class="romDistribution"><p class="mutedSmall">Загрузка…</p></div></aside></div>
 <div class="romProfileActions" id="romProfileActions">${u.is_artist?'<button class="button" onclick="showTrackSubmission()">Отправить трек</button>':''}${u.is_verified||u.is_admin?'<button class="button secondary" onclick="showAddRelease()">Добавить релиз</button>':''}${u.is_artist||u.is_admin?'<button class="button secondary" onclick="showSubmissions()">Заявки / модерация</button>':''}${u.is_admin?'<button class="button secondary" onclick="showTestPanel()">Панель тестирования</button>':''}</div><label class="romProfileActionsSwitch" title="Показать или скрыть кнопки управления"><span>Кнопки управления</span><input type="checkbox" id="romProfileActionsToggle" onchange="romToggleProfileActions(this.checked)" aria-label="Показывать кнопки управления"><span class="romSwitchTrack" aria-hidden="true"></span></label>`,true);
 romRestoreProfileActions();
 document.querySelector('.romProfilePage').style.setProperty('--page-glow','#8bff72');
 document.body.style.setProperty('--rom-grid-color','#8bff72');
 try{
  const d=await api(`/api/users/${Number(u.id)}/activity`);
  if(!document.getElementById('romProfileStats'))return;
  document.getElementById('romProfileStats').innerHTML=`<div><span>Рецензии</span><strong>${d.review_count}</strong></div><div><span>Релизы</span><strong>${d.release_count}</strong></div><div><span>Оценки</span><strong>${d.rating_count}</strong></div>`;
  document.getElementById('romProfileReviews').innerHTML=d.reviews.length?d.reviews.map(r=>`<button type="button" class="romProfileReviewItem" onclick="openAlbum(${Number(r.album_id)})"><span class="romProfileReviewCover">${r.cover_url?`<img src="${escapeAttr(r.cover_url)}" alt="">`:'♫'}</span><span class="romProfileReviewNames"><strong>${escapeHtml(r.album_title)}</strong><small>${escapeHtml(r.artist_name)}</small></span><span class="romProfileReviewTitle">"${escapeHtml(r.title||'Рецензия без заголовка')}"</span><strong class="romProfileReviewScore" style="color:${romRatingColor(Number(r.rating))}">${Number(r.rating).toFixed(0)}<small>/90</small></strong></button>`).join(''):'<p class="romProfileEmpty">Пока нет написанных рецензий.</p>';
  const max=Math.max(1,...d.distribution);
  document.getElementById('romProfileDistribution').innerHTML=[...d.distribution].map((count,i)=>({label:i===8?'81–90':`${i*10+1}–${i*10+10}`,count})).reverse().map(item=>`<div class="romDistributionRow"><span>${item.label}</span><small>${item.count}</small><div class="romDistributionTrack"><div style="width:${item.count/max*100}%"></div></div></div>`).join('');
 }catch(err){const el=document.getElementById('romProfileReviews');if(el)el.textContent='Не удалось загрузить рецензии: '+err.message}
}
function romToggleProfileActions(visible){
 const actions=document.getElementById('romProfileActions');
 if(actions)actions.classList.toggle('romProfileActionsHidden',!visible);
 try{localStorage.setItem('romShowProfileActions',visible?'1':'0')}catch{}
}
function romRestoreProfileActions(){
 const actions=document.getElementById('romProfileActions');
 const toggle=document.getElementById('romProfileActionsToggle');
 if(!actions||!toggle)return;
 const buttons=actions.querySelectorAll('button');
 if(!buttons.length){toggle.closest('.romProfileActionsSwitch').hidden=true;return}
 let visible=true;try{visible=localStorage.getItem('romShowProfileActions')!=='0'}catch{}
 toggle.checked=visible;
 actions.classList.toggle('romProfileActionsHidden',!visible);
}
function romReadNews(id){
 const n=(window.romNewsCache||[]).find(n=>Number(n.id)===Number(id));if(!n)return;
 accountPage('',`<article class="romNewsArticle"><button class="ghost" onclick="renderPage('news')">← Новости</button><time>${new Date(n.created_at).toLocaleDateString('ru-RU')}</time><h1>${escapeHtml(n.title)}</h1>${n.cover_url?`<img src="${escapeAttr(n.cover_url)}" alt="">`:''}<p class="romNewsSummary">${escapeHtml(n.summary)}</p><div class="romNewsText">${escapeHtml(n.body).replace(/\n/g,'<br>')}</div></article>`,true);
}
function renderAccountSettings(){accountPage('Настройки',`<div class="settingsCard"><h2>Профиль</h2><form id="settingsForm" class="form"><label>Аватар · PNG/JPG до 2 МБ<input name="avatar_file" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg"></label><div class="romAvatarSettingsPreview">${currentUser.avatar_url?`<img src="${escapeAttr(currentUser.avatar_url)}" alt="Текущий аватар">`:'<span>Нет аватара</span>'}</div><label>О себе<textarea name="bio" rows="4" maxlength="500">${escapeHtml(currentUser.bio||'')}</textarea></label><button class="button">Сохранить</button></form><hr><h2>Электронная почта</h2><p>${escapeHtml(currentUser.email)}</p><p>${currentUser.email_verified?'✓ Почта подтверждена':'Подтверди почту, чтобы оценивать музыку и писать рецензии.'}</p>${currentUser.email_verified?'':`<form class="form codeVerifyForm" onsubmit="verifyEmailCode(event)"><label>Код из письма<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" placeholder="000000" required></label><button class="button" type="submit">Подтвердить почту</button></form>`}${currentUser.email_verified?'':'<button class="button verifyButton" id="resendEmail">Отправить код повторно</button><p class="verifyHelp">Введи шестизначный код из письма. Проверь папку «Спам».</p>'}</div>`);$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{const formData=new FormData(e.target),file=formData.get('avatar_file');let avatar_url=currentUser.avatar_url||'';
if(file instanceof File&&file.size){avatar_url=await uploadRomFile(file,'avatar',e.target.querySelector('button[type="submit"],button'))}
const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify({bio:String(formData.get('bio')||''),avatar_url})});currentUser=d.user;renderAuthArea();toast('Сохранено');renderAccountSettings()}catch(err){toast(err.message)}});$('#resendEmail')?.addEventListener('click',e=>resendVerification(e.currentTarget))}
async function verifyEmailCode(event){event.preventDefault();const form=event.currentTarget;const btn=form.querySelector('button');btn.disabled=true;try{await api('/api/verify-code',{method:'POST',body:JSON.stringify({code:new FormData(form).get('code')})});await loadMe();toast('Почта подтверждена!');renderAccountSettings()}catch(err){toast(err.message)}finally{btn.disabled=false}}
async function resendVerification(button){if(!currentUser)return openAuth();if(button){button.disabled=true;button.textContent='Отправляем…'}try{await api('/api/resend-verification',{method:'POST'});toast('Код отправлен! Проверь входящие и спам.');if(button)button.textContent='Код отправлен'}catch(err){toast(err.message);if(button){button.disabled=false;button.textContent='Повторить отправку кода'}}}
// Client-side direct upload to Vercel Blob: files never pass through the Vercel function body.
async function uploadRomFile(file,kind,button){
 if(!file)return '';
 const image=kind==='cover'||kind==='avatar',limit=(kind==='avatar'?2:image?4:40)*1024*1024;
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(!((image&&['png','jpg','jpeg'].includes(ext))||(!image&&['mp3','flac','wav'].includes(ext))))throw Error(image?'Обложка: только PNG или JPG.':'Аудио: только MP3, FLAC или WAV.');
 if(file.size>limit)throw Error(`Файл превышает ${kind==='avatar'?2:image?4:40} МБ.`);
 const allowed=image?['image/png','image/jpeg']:['audio/mpeg','audio/mp3','audio/flac','audio/x-flac','audio/wav','audio/wave','audio/x-wav'];
 if(file.type&&!allowed.includes(file.type))throw Error('Некорректный формат файла.');
 if(!window.romBlobUpload)throw Error('Модуль загрузки не подключён. Обнови страницу.');
 const name=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
 const original=button?.textContent;
 try{
  const blob=await window.romBlobUpload(`${kind==='avatar'?'avatars':image?'covers':'audio'}/${name}`,file,{
   access:'public',handleUploadUrl:'/api/blob-upload',multipart:!image,
   onUploadProgress:({percentage})=>{if(button)button.textContent=`Загрузка ${Math.round(percentage)}%…`}
  });
  return blob.url;
 }finally{if(button)button.textContent=original;}
}
function setReleaseToday(button){
 const input=button.closest('.releaseDateRow')?.querySelector('input[type="date"]');
 if(!input)return;
 const now=new Date();const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
 input.value=local.toISOString().slice(0,10);input.dispatchEvent(new Event('change',{bubbles:true}));
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
 if(endpoint==='/api/albums'||endpoint==='/api/submissions'){
  const rows=[...form.querySelectorAll('[data-track-row]')];if(!rows.length||rows.length>30)throw Error('Добавь от 1 до 30 треков.');
  const kind=form.elements.release_type.value;if(kind==='single'&&rows.length>2)throw Error('У сингла максимум два трека.');
  const tracks=[];for(let i=0;i<rows.length;i++){const row=rows[i],file=row.querySelector('[name="track_audio"]').files[0];if(!file)throw Error(`Загрузи аудио для трека ${i+1}`);tracks.push({title:row.querySelector('[name="track_title"]').value.trim(),featuring:row.querySelector('[name="track_featuring"]').value.trim(),file})}
  data.cover_url=cover?await uploadRomFile(cover,'cover',btn):'';
  data.tracks=[];for(let i=0;i<tracks.length;i++){btn.textContent=`Трек ${i+1} из ${tracks.length}…`;const t=tracks[i];data.tracks.push({title:t.title,featuring:t.featuring,audio_url:await uploadRomFile(t.file,'audio',btn)})}
  data.release_type=kind==='single'&&tracks.length===2?'multi_single':kind;
  delete data.cover_file;delete data.track_title;delete data.track_featuring;delete data.track_audio;
 }
 const r=await api(endpoint,{method:'POST',body:JSON.stringify(data)});toast(endpoint==='/api/albums'?'Релиз опубликован!':'Релиз отправлен на рассмотрение!');if(endpoint==='/api/albums'){await loadAlbums();openAlbum(r.id)}else await showSubmissions();
 }catch(err){toast(err.message);alert(err.message)}finally{btn.disabled=false;btn.textContent=endpoint==='/api/albums'?'Опубликовать':'Отправить на рассмотрение →'}
}
async function showAddRelease(){
 if(!currentUser?.is_verified&&!currentUser?.is_admin)return toast('Нужна галочка подтверждённого автора');
 accountPage('Добавить релиз',`<p class="studioLead">Заполни данные релиза и добавь треки, как в кабинете музыкального дистрибьютора.</p><div class="studioGrid"><form id="addReleaseForm" class="settingsCard form studioForm">${releaseFormHtml(false)}<label>Тип релиза<select name="release_type" onchange="changeReleaseType()"><option value="single">Сингл</option><option value="ep">EP</option><option value="album">Альбом</option></select></label><div class="releaseTypeInfo"><span id="releaseTypeEffective">Сингл</span><p id="releaseTypeHint"></p></div><label>Дата релиза<div class="releaseDateRow"><input name="release_date" type="date"><button type="button" class="todayButton" onclick="setReleaseToday(this)">Сегодня</button></div></label>${romRgbControls()}<label>Описание<textarea name="description" rows="4" maxlength="5000"></textarea></label><div class="releaseTracksTitle"><h3>Треклист</h3><span>До 40 МБ на трек</span></div><div id="releaseTracks">${releaseTrackRow(1)}</div><button class="addTrackButton" id="addTrackButton" type="button" onclick="addReleaseTrack()">＋ Добавить трек</button><button class="button" type="submit">Опубликовать</button></form><div class="previewPanel"><p class="eyebrow">ПРЕДПРОСМОТР ОБЛОЖКИ</p><img id="uploadCoverPreview" class="previewImage hidden" alt="Обложка"><div class="previewPlaceholder">♫</div><p class="mutedSmall">PNG/JPG · до 4 МБ. Аудио MP3/FLAC/WAV · до 40 МБ на трек.</p></div></div>`);
 updateReleaseTracks();$('#addReleaseForm').addEventListener('submit',e=>submitRomUpload(e,'/api/albums'));
}


function imagePreview(input,target){const img=document.querySelector(target);if(!img)return;const url=input.value.trim();if(/^https:\/\/[^\s]+$/i.test(url)){img.src=url;img.classList.remove('hidden')}else{img.removeAttribute('src');img.classList.add('hidden')}}
function showTrackSubmission(){
 if(!currentUser)return openAuth();if(!currentUser.is_artist)return toast('Загрузка доступна только артистам с зелёной ноткой.');
 accountPage('Отправить релиз',`<p class="studioLead">Заполни данные релиза и загрузи треки. После отправки заявка появится у модератора ROM — автоматической публикации нет.</p><div class="studioGrid"><form id="addReleaseForm" class="settingsCard form studioForm">${releaseFormHtml(false)}<label>Тип релиза<select name="release_type" onchange="changeReleaseType()"><option value="single">Сингл</option><option value="ep">EP</option><option value="album">Альбом</option></select></label><div class="releaseTypeInfo"><span id="releaseTypeEffective">Сингл</span><p id="releaseTypeHint"></p></div><label>Дата релиза<div class="releaseDateRow"><input name="release_date" type="date"><button type="button" class="todayButton" onclick="setReleaseToday(this)">Сегодня</button></div></label>${romRgbControls()}<label>Описание<textarea name="description" rows="4" maxlength="2000"></textarea></label><div class="releaseTracksTitle"><h3>Треклист</h3><span>До 40 МБ на трек</span></div><div id="releaseTracks">${releaseTrackRow(1)}</div><button class="addTrackButton" id="addTrackButton" type="button" onclick="addReleaseTrack()">＋ Добавить трек</button><button class="button" type="submit">Отправить на рассмотрение</button></form><div class="previewPanel"><p class="eyebrow">ПРЕДПРОСМОТР ОБЛОЖКИ</p><img id="uploadCoverPreview" class="previewImage hidden" alt="Обложка"><div class="previewPlaceholder">♫</div><p class="mutedSmall">Обложка PNG/JPG до 4 МБ. MP3/FLAC/WAV до 40 МБ на трек. Релиз проверяется администрацией.</p></div></div>`);
 updateReleaseTracks();$('#addReleaseForm').addEventListener('submit',e=>submitRomUpload(e,'/api/submissions'));
}

async function showSubmissions(){if(!currentUser)return openAuth();accountPage(currentUser.is_admin?'Модерация треков':'Мои заявки','<div class="empty">Загружаем заявки…</div>');try{const {submissions}=await api('/api/submissions');accountPage(currentUser.is_admin?'Модерация треков':'Мои заявки',`<div class="studioList">${submissions.length?submissions.map(t=>`<article class="submissionCard"><div class="submissionThumb">${t.cover_url?`<img src="${escapeAttr(t.cover_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'♫'}</div><div class="submissionInfo"><div class="submissionMeta">${escapeHtml(t.artist_name)} ${t.featuring?`feat. ${escapeHtml(t.featuring)}`:""} · ${escapeHtml(t.username)}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description||'Без описания')}</p><p class="mutedSmall">${escapeHtml(({single:'Сингл',multi_single:'Мульти-сингл',ep:'EP',album:'Альбом'})[t.release_type]||'Сингл')} · ${escapeHtml(t.release_date||'Дата не указана')}</p><div class="romSubmissionTracks">${(Array.isArray(t.tracks_json)&&t.tracks_json.length?t.tracks_json:[{title:t.title,audio_url:t.audio_url}]).map((track,i)=>`<div><span>${i+1}. ${escapeHtml(track.title)} ${track.featuring?`· feat. ${escapeHtml(track.featuring)}`:''}</span><a href="${escapeAttr(track.audio_url)}" target="_blank" rel="noopener noreferrer">Аудио ↗</a></div>`).join('')}</div></div><div class="submissionActions"><span class="submissionStatus ${escapeAttr(t.status)}">${{pending:'На рассмотрении',approved:'Одобрено',rejected:'Отклонено'}[t.status]||escapeHtml(t.status)}</span>${currentUser.is_admin?`<button class="button" onclick="moderateTrack(${Number(t.id)},'approved')">Одобрить</button><button class="button secondary" onclick="moderateTrack(${Number(t.id)},'rejected')">Отклонить</button>`:''}</div></article>`).join(''):'<div class="emptyState"><h2>Пока нет заявок</h2><p>Здесь появятся отправленные треки.</p></div>'}</div>`)}catch(e){toast(e.message)}}
async function moderateTrack(id,status){try{await api(`/api/submissions/${id}`,{method:'PATCH',body:JSON.stringify({status})});toast('Статус обновлён');refreshPendingBadge();showSubmissions()}catch(e){toast(e.message)}}
async function showAdminAlbums(){
 if(!currentUser?.is_admin)return toast('Только администратор');
 accountPage('Редактирование релизов','<div class="settingsCard"><h2>Все релизы</h2><div id="romAdminAlbums">Загрузка…</div></div>');
 try{const {albums}=await api('/api/admin/albums');document.querySelector('#romAdminAlbums').innerHTML=albums.map(a=>`<button type="button" class="romAdminAlbumItem" onclick="editAdminAlbum(${Number(a.id)})">${a.cover_url?`<img src="${escapeAttr(a.cover_url)}" alt="">`:''}<span><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.artist_name)}</small></span><span>Редактировать →</span></button>`).join('')||'<p>Релизов пока нет.</p>'}catch(e){toast(e.message)}
}
async function editAdminAlbum(id){
 if(!currentUser?.is_admin)return;
 try{
 const {album:a,tracks}=await api(`/api/albums/${id}`);
 accountPage('Изменить релиз',`<div class="studioGrid"><form id="romEditAlbumForm" class="settingsCard form studioForm"><label>Исполнитель<input name="artist_name" maxlength="120" required value="${escapeAttr(a.artist_name)}"></label><label>Название<input name="title" maxlength="200" required value="${escapeAttr(a.title)}"></label><label>Featuring<input name="featuring" maxlength="250" value="${escapeAttr(a.featuring||'')}"></label><label>Обложка PNG/JPG<input type="file" name="cover_file" accept=".png,.jpg,.jpeg"></label><label>Тип релиза<select name="release_type"><option value="single">Сингл</option><option value="ep">EP</option><option value="album">Альбом</option></select></label><label>Дата релиза<input name="release_date" type="date" value="${escapeAttr(a.release_date||'')}"></label>${romRgbControls(a.background_color)}<label>Описание<textarea name="description" rows="4">${escapeHtml(a.description||'')}</textarea></label><h3>Треклист</h3><div id="romEditTracks"></div><button type="button" class="addTrackButton" onclick="romAddEditTrack()">＋ Добавить трек</button><button type="submit" class="button">Сохранить изменения</button><button type="button" class="button secondary" onclick="showAdminAlbums()">К списку</button></form><div class="previewPanel"><p class="eyebrow">ОБЛОЖКА</p>${a.cover_url?`<img class="previewImage" src="${escapeAttr(a.cover_url)}" alt="">`:''}<p class="mutedSmall">Можно сохранить старые аудиофайлы или загрузить новые. Оценки и рецензии останутся на месте.</p></div></div>`);
 const f=document.querySelector('#romEditAlbumForm');f.elements.release_type.value=a.release_type==='multi_single'?'single':a.release_type;
 f.dataset.cover=a.cover_url||'';
 f.dataset.albumId=id;
 tracks.forEach(tr=>romAddEditTrack(tr));
 f.addEventListener('submit',romSaveEditAlbum);
 }catch(e){toast(e.message)}
}
function romAddEditTrack(tr={}){
 const target=document.querySelector('#romEditTracks');if(!target)return;
 if(target.children.length>=30)return toast('Максимум 30 треков');
 target.insertAdjacentHTML('beforeend',`<div class="romEditTrackRow" data-audio="${escapeAttr(tr.audio_url||'')}"><label>Название трека<input name="edit_title" required maxlength="200" value="${escapeAttr(tr.title||'')}"></label><label>Featuring<input name="edit_feat" maxlength="250" value="${escapeAttr(tr.featuring||'')}"></label><label>Заменить аудио · MP3/FLAC/WAV<input name="edit_audio" type="file" accept="${AUDIO_ACCEPT}"></label><button type="button" class="button secondary" onclick="this.closest('.romEditTrackRow').remove()">Удалить трек</button></div>`);
}
async function romSaveEditAlbum(e){
 e.preventDefault();const f=e.currentTarget,btn=f.querySelector('[type="submit"]');btn.disabled=true;
 try{
 const data=new FormData(f),cover=data.get('cover_file'),rows=[...f.querySelectorAll('.romEditTrackRow')];if(!rows.length)throw Error('Добавь хотя бы один трек.');
 const cover_url=cover instanceof File&&cover.size?await uploadRomFile(cover,'cover',btn):f.dataset.cover;
 const tracks=[];for(let i=0;i<rows.length;i++){
 const row=rows[i],file=row.querySelector('[name="edit_audio"]').files[0];const audio_url=file&&file.size?await uploadRomFile(file,'audio',btn):row.dataset.audio;
 if(!audio_url)throw Error(`Нужен аудиофайл для трека ${i+1}`);
 tracks.push({title:row.querySelector('[name="edit_title"]').value.trim(),featuring:row.querySelector('[name="edit_feat"]').value.trim(),audio_url});
 }
 let release_type=String(data.get('release_type'));if(release_type==='single'&&tracks.length>2)throw Error('Для сингла максимум 2 трека.');if(release_type==='single'&&tracks.length===2)release_type='multi_single';
 await api(`/api/albums/${f.dataset.albumId}`,{method:'PATCH',body:JSON.stringify({artist_name:data.get('artist_name'),title:data.get('title'),featuring:data.get('featuring'),release_date:data.get('release_date'),description:data.get('description'),background_color:data.get('background_color'),cover_url,release_type,tracks})});
 toast('Релиз обновлён');await loadAlbums();await openAlbum(Number(f.dataset.albumId));
 }catch(e){toast(e.message)}finally{btn.disabled=false}
}
async function showTestPanel(){if(!currentUser?.is_admin)return toast('Только администратор');accountPage('Панель тестирования',`<div class="studioGrid"><div class="romAdminShortcuts"><button class="button" onclick="showSubmissions()">Заявки на модерацию</button><button class="button" onclick="showAdminNews()">Управление новостями</button><button class="button" onclick="showAdminAlbums()">Редактировать релизы</button></div><div class="settingsCard"><h2>Роли пользователей</h2><p>Выдавай зелёную нотку артистам. Доступ проверяется сервером.</p><div id="adminUsers">Загрузка…</div></div></div>`);try{const {users}=await api('/api/admin/users');$('#adminUsers').innerHTML=users.map(u=>`<div class="adminUserRow"><span>@${escapeHtml(u.username)} ${u.is_artist?artistBadge():''}<small>${u.email_verified?' · Email ✓':' · Email не подтверждён'}</small></span><button class="button secondary" onclick="setArtist(${Number(u.id)},${!u.is_artist})">${u.is_artist?'Снять нотку':'Выдать нотку'}</button></div>`).join('')}catch(e){toast(e.message)}}
async function showAdminNews(){
 if(!currentUser?.is_admin)return toast('Только администратор');
 accountPage('Управление новостями',`<div class="romNewsAdminGrid"><form id="romNewsForm" class="settingsCard form"><h2 id="romNewsFormTitle">Новая публикация</h2><input type="hidden" name="post_id"><label>Заголовок<input name="title" maxlength="180" required></label><label>Краткое описание<input name="summary" maxlength="500"></label><label>Текст новости<textarea name="body" rows="10" required></textarea></label><label>Обложка · PNG/JPG до 4 МБ<input type="file" name="cover_file" accept=".png,.jpg,.jpeg"></label><label class="romNewsPublish"><input type="checkbox" name="published" checked> Опубликовать сразу</label><button class="button" type="submit">Сохранить новость</button><button class="button secondary" type="button" onclick="showAdminNews()">Очистить форму</button></form><div class="settingsCard"><h2>Публикации</h2><div id="romAdminNewsList">Загрузка…</div></div></div>`);
 document.querySelector('#romNewsForm').addEventListener('submit',romSaveNews);
 try{const d=await api('/api/admin/news');window.romAdminNewsCache=d.posts;document.querySelector('#romAdminNewsList').innerHTML=d.posts.length?d.posts.map(n=>`<div class="romAdminNewsRow"><div><strong>${escapeHtml(n.title)}</strong><small>${n.published?'Опубликовано':'Черновик'} · ${new Date(n.created_at).toLocaleDateString('ru-RU')}</small></div><div><button type="button" class="button secondary" onclick="romEditNews(${Number(n.id)})">Изменить</button><button type="button" class="button secondary" onclick="romDeleteNews(${Number(n.id)})">Удалить</button></div></div>`).join(''):'<p class="mutedSmall">Пока нет новостей.</p>'}catch(e){toast(e.message)}
}
function romEditNews(id){
 const n=(window.romAdminNewsCache||[]).find(x=>Number(x.id)===Number(id));if(!n)return;
 const f=document.querySelector('#romNewsForm');if(!f)return;
 f.elements.post_id.value=n.id;f.elements.title.value=n.title;f.elements.summary.value=n.summary;f.elements.body.value=n.body;f.elements.published.checked=n.published;
 f.dataset.cover=n.cover_url||'';document.querySelector('#romNewsFormTitle').textContent='Редактирование новости';f.scrollIntoView({behavior:'smooth',block:'start'});
}
async function romSaveNews(e){
 e.preventDefault();const f=e.currentTarget,btn=f.querySelector('[type="submit"]');btn.disabled=true;
 try{
  const data=new FormData(f),file=data.get('cover_file'),id=Number(data.get('post_id')||0);
  let cover_url=f.dataset.cover||'';
  if(file instanceof File&&file.size)cover_url=await uploadRomFile(file,'cover',btn);
  const payload={title:data.get('title'),summary:data.get('summary'),body:data.get('body'),cover_url,published:data.get('published')==='on'};
  await api(id?`/api/admin/news/${id}`:'/api/admin/news',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
  toast('Новость сохранена');showAdminNews();
 }catch(err){toast(err.message)}finally{btn.disabled=false}
}
async function romDeleteNews(id){
 if(!confirm('Удалить новость без возможности восстановления?'))return;
 try{await api(`/api/admin/news/${id}`,{method:'DELETE'});toast('Новость удалена');showAdminNews()}catch(err){toast(err.message)}
}
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
  romScheduleBackground();
});

(async function init() {
  try{await loadMe()}catch(e){toast('Не удалось подключиться к API: '+e.message)}
  await loadAlbums();
  const initialHash=location.hash.slice(1);
  if(/^album-\d+$/.test(initialHash))await openAlbum(Number(initialHash.slice(6)));
  else if(['best','new','news','about'].includes(initialHash))await renderPage(initialHash);
  romScheduleBackground();
  const verify = new URLSearchParams(location.search).get('verify');
  if(verify==='success'){toast('Почта подтверждена!');await loadMe();history.replaceState({},'','/')}
  if(verify==='invalid'){toast('Ссылка подтверждения недействительна или устарела');history.replaceState({},'','/')}
})();
