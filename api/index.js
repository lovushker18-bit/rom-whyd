import {handleUpload} from '@vercel/blob/client';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import {randomBytes,createHash} from 'node:crypto';
const {Pool}=pg;
let pool;
function db(){if(!process.env.DATABASE_URL)throw Error('DATABASE_URL не настроен в Vercel');return pool ||= new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:3});}
const q=(sql,params=[])=>db().query(sql,params);
const token=()=>randomBytes(32).toString('hex');
const sha=s=>createHash('sha256').update(s).digest('hex');
const cookie=(value,age)=>`rom_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=').slice(0,2)).filter(x=>x.length===2));}
const send=(res,status,data)=>res.status(status).json(data);
const safe=u=>u&&({id:u.id,public_id:u.public_id,username:u.username,email:u.email,bio:u.bio,avatar_url:u.avatar_url,avatar_decoration:u.avatar_decoration,avatar_bg_color:u.avatar_bg_color,email_verified:u.email_verified,is_verified:u.is_verified,is_admin:u.is_admin,is_artist:u.is_artist,background_theme:u.background_theme,background_color:u.background_color});
async function me(req){const t=cookies(req).rom_session;if(!t)return null;const r=await q(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>NOW()`,[sha(t)]);return r.rows[0]||null;}
async function session(res,user){const t=token();await q(`INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')`,[sha(t),user.id]);res.setHeader('Set-Cookie',cookie(t,2592000));}
async function sendVerification(user){
 if(!process.env.GMAIL_USER||!process.env.GMAIL_APP_PASSWORD)throw Error('Настрой GMAIL_USER и GMAIL_APP_PASSWORD в Vercel');
 const code=String(randomBytes(4).readUInt32BE(0)%1000000).padStart(6,'0');
 const codeHash=sha(`${user.id}:${code}`);
 const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:15000});
 // Only store the code after Gmail accepts the message. Previous code remains valid on failure.
 await transport.sendMail({from:`ROM <${process.env.GMAIL_USER}>`,to:user.email,subject:'Код подтверждения ROM',text:`Твой код подтверждения ROM: ${code}\n\nКод действует 10 минут. Если ты не регистрировался на ROM, игнорируй письмо.`,html:`<div style="font-family:Arial,sans-serif;background:#101410;color:#f5f5f5;padding:28px;border-radius:16px"><h2>Подтверждение почты ROM</h2><p>Введи этот код на сайте:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#b7ff6b">${code}</p><p>Код действует 10 минут. Если ты не регистрировался, игнорируй письмо.</p></div>`});
 await q('DELETE FROM email_tokens WHERE user_id=$1',[user.id]);
 await q(`INSERT INTO email_tokens(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')`,[codeHash,user.id]);
}

const validRating=x=>Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=90;
const albumsSql=`SELECT a.*,ar.name artist_name,ROUND(AVG(r.rating),2) average_rating,COUNT(r.id)::int rating_count FROM albums a JOIN artists ar ON ar.id=a.artist_id LEFT JOIN ratings r ON r.album_id=a.id`;
export default async function handler(req,res){try{
const path=new URL(req.url,'https://rom.local').pathname,method=req.method,b=req.body||{};
if(path==='/api/blob-upload'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.email_verified)return send(res,403,{error:'Подтверди почту.'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'Не найден BLOB_READ_WRITE_TOKEN. Подключи Blob Store к этому проекту в Vercel и сделай Redeploy.'});
 try{
  const blobBody=typeof b==='string'?JSON.parse(b):b;
  const result=await handleUpload({body:blobBody,request:req,onBeforeGenerateToken:async(pathname,clientPayload)=>{
   const kind=String(pathname).startsWith('covers/')?'cover':String(pathname).startsWith('audio/')?'audio':String(pathname).startsWith('avatars/')?'avatar':String(pathname).startsWith('decorations/')?'decoration':null;
   if(!kind)throw Error('Недопустимый путь загрузки.');
   if(kind==='decoration'&&!u.is_admin)throw Error('Только администратор может загружать украшения.');
   if(kind==='avatar'&&!u.email_verified)throw Error('Подтверди почту для загрузки аватара.');
   if(kind==='audio'&&!u.is_artist&&!u.is_verified&&!u.is_admin)throw Error('Аудио могут загружать только артисты.');
   if(kind==='cover'&&!u.is_artist&&!u.is_verified&&!u.is_admin)throw Error('Нет доступа к загрузке обложек.');
   return {allowedContentTypes:kind==='decoration'?['image/png']:kind==='cover'||kind==='avatar'?['image/png','image/jpeg']:['audio/mpeg','audio/mp3','audio/flac','audio/x-flac','audio/wav','audio/wave','audio/x-wav'],maximumSizeInBytes:kind==='decoration'?4*1024*1024:kind==='avatar'?2*1024*1024:kind==='cover'?4*1024*1024:40*1024*1024,addRandomSuffix:true,tokenPayload:JSON.stringify({userId:u.id,kind})};
  },onUploadCompleted:async()=>{}});
  return send(res,200,result);
 }catch(e){console.error('Blob upload error:',e);return send(res,400,{error:'Ошибка загрузки Blob: '+e.message});}
}
if(path==='/api/verify-code'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(u.email_verified)return send(res,200,{ok:true});
 const code=String(b.code||'').trim();if(!/^\d{6}$/.test(code))return send(res,400,{error:'Введи 6 цифр из письма.'});
 const result=await q(`DELETE FROM email_tokens WHERE user_id=$1 AND token_hash=$2 AND expires_at>NOW() RETURNING user_id`,[u.id,sha(`${u.id}:${code}`)]);
 if(!result.rowCount)return send(res,400,{error:'Неверный или просроченный код. Запроси новый.'});
 await q('UPDATE users SET email_verified=TRUE WHERE id=$1',[u.id]);return send(res,200,{ok:true});
}
if(path==='/api/faq'&&method==='GET'){
 const category=new URL(req.url,'https://rom.local').searchParams.get('category');
 if(!['user','artist'].includes(category))return send(res,400,{error:'Неизвестная категория FAQ.'});
 const r=await q('SELECT id,question,answer FROM faq_entries WHERE category=$1 ORDER BY sort_order,id',[category]);return send(res,200,{items:r.rows});
}
if(path==='/api/admin/faq'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const category=new URL(req.url,'https://rom.local').searchParams.get('category');
 if(!['user','artist'].includes(category))return send(res,400,{error:'Неизвестная категория FAQ.'});
 const r=await q('SELECT * FROM faq_entries WHERE category=$1 ORDER BY sort_order,id',[category]);return send(res,200,{items:r.rows});
}
if(path==='/api/admin/faq'&&method==='POST'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const category=String(b.category||''),question=String(b.question||'').trim(),answer=String(b.answer||'').trim();
 if(!['user','artist'].includes(category)||!question||question.length>250||!answer||answer.length>5000)return send(res,400,{error:'Проверь вопрос и ответ.'});
 const r=await q('INSERT INTO faq_entries(category,question,answer) VALUES($1,$2,$3) RETURNING *',[category,question,answer]);return send(res,201,{item:r.rows[0]});
}
const faqItem=path.match(/^\/api\/admin\/faq\/(\d+)$/);
if(faqItem&&['PATCH','DELETE'].includes(method)){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(method==='DELETE'){const r=await q('DELETE FROM faq_entries WHERE id=$1 RETURNING id',[faqItem[1]]);return r.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Вопрос не найден.'});}
 const category=String(b.category||''),question=String(b.question||'').trim(),answer=String(b.answer||'').trim();
 if(!['user','artist'].includes(category)||!question||question.length>250||!answer||answer.length>5000)return send(res,400,{error:'Проверь вопрос и ответ.'});
 const r=await q('UPDATE faq_entries SET category=$1,question=$2,answer=$3,updated_at=NOW() WHERE id=$4 RETURNING *',[category,question,answer,faqItem[1]]);return r.rowCount?send(res,200,{item:r.rows[0]}):send(res,404,{error:'Вопрос не найден.'});
}
if(path==='/api/news'&&method==='GET'){
 const r=await q('SELECT id,title,summary,body,cover_url,created_at,updated_at FROM news_posts WHERE published=TRUE ORDER BY created_at DESC LIMIT 60');
 return send(res,200,{posts:r.rows});
}
if(path==='/api/admin/news'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q('SELECT * FROM news_posts ORDER BY created_at DESC LIMIT 100');return send(res,200,{posts:r.rows});
}
if(path==='/api/admin/news'&&method==='POST'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const title=String(b.title||'').trim(),summary=String(b.summary||'').trim(),body=String(b.body||'').trim(),cover=String(b.cover_url||'').trim();
 if(title.length<3||title.length>180||summary.length>500||body.length<3||body.length>20000||cover.length>1000||cover&&!/^https:\/\//.test(cover))return send(res,400,{error:'Проверь заголовок, текст и обложку.'});
 const r=await q('INSERT INTO news_posts(title,summary,body,cover_url,published,author_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[title,summary,body,cover,b.published===true,u.id]);return send(res,201,{post:r.rows[0]});
}
const newsItem=path.match(/^\/api\/admin\/news\/(\d+)$/);
if(newsItem&&method==='DELETE'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 await q('DELETE FROM news_posts WHERE id=$1',[newsItem[1]]);return send(res,200,{ok:true});
}
if(newsItem&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const title=String(b.title||'').trim(),summary=String(b.summary||'').trim(),body=String(b.body||'').trim(),cover=String(b.cover_url||'').trim();
 if(title.length<3||title.length>180||summary.length>500||body.length<3||body.length>20000||cover.length>1000||cover&&!/^https:\/\//.test(cover))return send(res,400,{error:'Проверь заголовок, текст и обложку.'});
 const r=await q('UPDATE news_posts SET title=$1,summary=$2,body=$3,cover_url=$4,published=$5,updated_at=NOW() WHERE id=$6 RETURNING *',[title,summary,body,cover,b.published===true,newsItem[1]]);
 return r.rowCount?send(res,200,{post:r.rows[0]}):send(res,404,{error:'Новость не найдена.'});
}
if(path==='/api/me'&&method==='GET')return send(res,200,{user:safe(await me(req))});
if(path==='/api/register'&&method==='POST'){const username=String(b.username||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||password.length>128)return send(res,400,{error:'Ник 3–24 символа, корректная почта и пароль от 8 символов обязательны.'});if(!process.env.GMAIL_USER||!process.env.GMAIL_APP_PASSWORD)return send(res,503,{error:'Администратор ещё не настроил отправку писем.'});const hash=await bcrypt.hash(password,12);let r;try{r=await q('INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING *',[username,email,hash]);}catch(e){if(e.code==='23505')return send(res,409,{error:'Этот ник или адрес электронной почты уже зарегистрирован. Выбери другой.'});throw e;}await session(res,r.rows[0]);try{await sendVerification(r.rows[0]);}catch(e){return send(res,201,{user:safe(r.rows[0]),email_sent:false,message:'Аккаунт создан, но письмо не отправлено. Повтори отправку в настройках.'});}return send(res,201,{user:safe(r.rows[0]),email_sent:true});}
if(path==='/api/login'&&method==='POST'){const email=String(b.email||b.login||'').trim().toLowerCase();const r=await q('SELECT * FROM users WHERE LOWER(email)=$1',[email]);if(!r.rowCount||!await bcrypt.compare(String(b.password||''),r.rows[0].password_hash))return send(res,401,{error:'Неверная почта или пароль.'});await session(res,r.rows[0]);return send(res,200,{user:safe(r.rows[0])});}
if(path==='/api/logout'&&method==='POST'){const t=cookies(req).rom_session;if(t)await q('DELETE FROM sessions WHERE id=$1',[sha(t)]);res.setHeader('Set-Cookie',cookie('',0));return send(res,200,{ok:true});}
if(path==='/api/resend-verification'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(u.email_verified)return send(res,400,{error:'Почта уже подтверждена.'});const last=await q(`SELECT 1 FROM email_tokens WHERE user_id=$1 AND expires_at>NOW()+INTERVAL '9 minutes'`,[u.id]);if(last.rowCount)return send(res,429,{error:'Код уже отправлен. Подожди минуту и попробуй снова.'});try{await sendVerification(u);return send(res,200,{ok:true});}catch(err){console.error('Gmail verification error:',err.message);return send(res,502,{error:'Не удалось отправить письмо. Проверь настройки Gmail в Vercel и логи сервера.'});}}
if(path==='/api/decorations'&&method==='GET'){
 const u=await me(req);
 const r=await q(`SELECT d.id,d.name,d.description,d.image_url AS image,d.reviews_required,
 (SELECT COUNT(*)::int FROM reviews WHERE user_id=$1) AS review_count
 FROM avatar_decorations d WHERE d.active=TRUE ORDER BY d.created_at,d.id`,[u?.id||0]);
 return send(res,200,{decorations:r.rows.map(d=>({id:d.id,reviews_required:d.reviews_required,review_count:d.review_count,locked:d.review_count<d.reviews_required,name:d.review_count<d.reviews_required?'Секретное украшение':d.name,description:d.review_count<d.reviews_required?'Напиши '+d.reviews_required+' рецензий, чтобы открыть украшение.':d.description,image:d.review_count<d.reviews_required?null:d.image}))});
}
if(path==='/api/admin/decorations'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q('SELECT id,name,description,image_url AS image,reviews_required,active,created_at FROM avatar_decorations ORDER BY created_at DESC,id DESC');
 return send(res,200,{decorations:r.rows});
}
if(path==='/api/admin/decorations'&&method==='POST'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const name=String(b.name||'').trim(),description=String(b.description||'').trim(),image=String(b.image||'').trim(),reviewsRequired=Number(b.reviews_required||0);
 if(name.length<2||name.length>80||description.length>300||!Number.isInteger(reviewsRequired)||reviewsRequired<0||reviewsRequired>10000||!/^https:\/\/[^\s]{1,1500}$/i.test(image))return send(res,400,{error:'Проверь название, описание и PNG.'});
 const r=await q('INSERT INTO avatar_decorations(name,description,image_url,reviews_required) VALUES($1,$2,$3,$4) RETURNING id',[name,description,image,reviewsRequired]);
 return send(res,201,{id:r.rows[0].id});
}
const decorItem=path.match(/^\/api\/admin\/decorations\/(\d+)$/);
if(decorItem&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(typeof b.active!=='boolean')return send(res,400,{error:'Нужно указать active.'});
 const r=await q('UPDATE avatar_decorations SET active=$1 WHERE id=$2 RETURNING id',[b.active,decorItem[1]]);
 return r.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Украшение не найдено.'});
}
if(decorItem&&method==='DELETE'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q('DELETE FROM avatar_decorations WHERE id=$1 RETURNING id',[decorItem[1]]);
 return r.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Украшение не найдено.'});
}
if(path==='/api/profile/decoration'&&method==='PATCH'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});const decoration=b.decoration==null?null:String(b.decoration);if(decoration!==null){const exists=await q('SELECT reviews_required FROM avatar_decorations WHERE id::text=$1 AND active=TRUE',[decoration]);if(!exists.rowCount)return send(res,400,{error:'Украшение недоступно.'});const count=await q('SELECT COUNT(*)::int AS n FROM reviews WHERE user_id=$1',[u.id]);if(count.rows[0].n<exists.rows[0].reviews_required)return send(res,403,{error:'Секретное украшение пока не открыто.'});}const r=await q('UPDATE users SET avatar_decoration=$1 WHERE id=$2 RETURNING *',[decoration,u.id]);return send(res,200,{user:safe(r.rows[0])});}
if(path==='/api/profile/avatar'&&method==='PATCH'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 const avatar=String(b.avatar_url||'').trim(),color=String(b.avatar_bg_color||'#555555');
 if(avatar.length>1000||avatar&&!/^https:\/\//i.test(avatar))return send(res,400,{error:'Некорректная ссылка на аватар.'});
 if(!/^#[0-9a-f]{6}$/i.test(color))return send(res,400,{error:'Некорректный цвет.'});
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 if(Math.max(...rgb)>200||rgb.reduce((x,y)=>x+y,0)>490)return send(res,400,{error:'Выбери более тёмный цвет фона (не белый).'});
 const r=await q('UPDATE users SET avatar_url=$1,avatar_bg_color=$2 WHERE id=$3 RETURNING *',[avatar,color,u.id]);
 return send(res,200,{user:safe(r.rows[0])});
}
if(path==='/api/profile'&&method==='PATCH'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});const bio=String(b.bio||'').trim(),avatar=String(b.avatar_url||'').trim(),color=String(b.background_color||'#8bff72');if(!/^#[0-9a-f]{6}$/i.test(color))return send(res,400,{error:'Некорректный цвет фона.'});if(bio.length>500||avatar.length>500||avatar&&!/^https:\/\//.test(avatar))return send(res,400,{error:'Описание до 500 символов; аватар — HTTPS-ссылка.'});const r=await q('UPDATE users SET bio=$1,avatar_url=$2,background_color=$3 WHERE id=$4 RETURNING *',[bio,avatar,color,u.id]);return send(res,200,{user:safe(r.rows[0])});}
const profileById=path.match(/^\/api\/users\/id\/(\d+)$/);if(profileById&&method==='GET'){const r=await q('SELECT id,username,bio,avatar_url,avatar_decoration,avatar_bg_color,email_verified,is_verified,is_artist,background_theme,background_color,created_at FROM users WHERE id=$1',[profileById[1]]);return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Профиль не найден.'});}
const profile=path.match(/^\/api\/users\/([^/]+)$/);if(profile&&method==='GET'){const r=await q('SELECT id,username,bio,avatar_url,avatar_decoration,avatar_bg_color,email_verified,is_verified,is_artist,background_theme,background_color,created_at FROM users WHERE LOWER(username)=LOWER($1)',[decodeURIComponent(profile[1])]);return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Профиль не найден.'});}
const activity=path.match(/^\/api\/users\/(\d+)\/activity$/);
if(activity&&method==='GET'){
 const userId=Number(activity[1]);
 const person=await q('SELECT id,username FROM users WHERE id=$1',[userId]);
 if(!person.rowCount)return send(res,404,{error:'Пользователь не найден.'});
 const reviews=await q(`SELECT rv.id,rv.album_id,rv.title,rv.rating,rv.created_at,a.title AS album_title,a.cover_url,ar.name AS artist_name
 FROM reviews rv JOIN albums a ON a.id=rv.album_id JOIN artists ar ON ar.id=a.artist_id
 WHERE rv.user_id=$1 AND NULLIF(TRIM(rv.body),'') IS NOT NULL ORDER BY rv.created_at DESC LIMIT 100`,[userId]);
 const ratings=await q('SELECT rating FROM ratings WHERE user_id=$1',[userId]);
 const releases=await q('SELECT COUNT(*)::int AS count FROM albums a JOIN artists ar ON ar.id=a.artist_id WHERE LOWER(ar.name)=LOWER($1)',[person.rows[0].username]);
 const bins=Array(9).fill(0);
 for(const row of ratings.rows){const v=Number(row.rating);if(v>=1&&v<=90)bins[Math.min(8,Math.floor((v-1)/10))]++}
 return send(res,200,{reviews:reviews.rows,review_count:reviews.rows.length,rating_count:ratings.rowCount,release_count:releases.rows[0].count,distribution:bins});
}
if(path==='/api/help'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт, чтобы отправить вопрос.'});
 const subject=String(b.subject||'').trim(),message=String(b.message||'').trim();
 if(!subject||!message||subject.length>50||message.length>300)return send(res,400,{error:'Заполни тему и вопрос.'});
 await q('INSERT INTO help_requests(user_id,subject,message) VALUES($1,$2,$3)',[u.id,subject,message]);
 return send(res,201,{ok:true});
}
if(path==='/api/admin/help'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q(`SELECT h.id,h.subject,h.message,h.status,h.created_at,u.username,u.public_id FROM help_requests h JOIN users u ON u.id=h.user_id ORDER BY (h.status='pending') DESC,h.created_at DESC LIMIT 200`);
 return send(res,200,{requests:r.rows});
}
const helpAction=path.match(/^\/api\/admin\/help\/(\d+)$/);
if(helpAction&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(b.status!=='closed')return send(res,400,{error:'Неверный статус.'});
 const r=await q('UPDATE help_requests SET status=$1,reviewed_at=NOW() WHERE id=$2 RETURNING id',['closed',helpAction[1]]);
 return r.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Обращение не найдено.'});
}
if(path==='/api/notifications'&&method==='GET'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 const unread=await q('SELECT COUNT(*)::int AS count FROM user_notifications WHERE user_id=$1 AND read_at IS NULL',[u.id]);
 if(new URL(req.url,'https://rom.local').searchParams.get('count')==='1')return send(res,200,{unread:unread.rows[0].count});
 const items=await q(`SELECT n.id,n.kind,n.album_id,n.review_id,n.created_at,n.read_at,u.username AS actor_username,a.title AS album_title
 FROM user_notifications n JOIN users u ON u.id=n.actor_id JOIN albums a ON a.id=n.album_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 80`,[u.id]);
 return send(res,200,{unread:unread.rows[0].count,items:items.rows});
}
const notificationRead=path.match(/^\/api\/notifications\/(\d+)\/read$/);
if(notificationRead&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 await q('UPDATE user_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2',[notificationRead[1],u.id]);
 return send(res,200,{ok:true});
}
if(path==='/api/admin/pending-count'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q("SELECT (SELECT COUNT(*) FROM track_submissions WHERE status='pending') + (SELECT COUNT(*) FROM username_change_requests WHERE status='pending') + (SELECT COUNT(*) FROM help_requests WHERE status='pending') AS count");
 return send(res,200,{count:Number(r.rows[0].count)});
}
if(path==='/api/username-request'&&method==='GET'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 const r=await q('SELECT id,requested_username,status,created_at,reviewed_at FROM username_change_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5',[u.id]);
 return send(res,200,{requests:r.rows});
}
if(path==='/api/username-request'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.email_verified)return send(res,403,{error:'Сначала подтверди почту.'});
 const name=String(b.username||'').trim();
 if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(name))return send(res,400,{error:'Ник должен содержать 3–24 буквы, цифры, _ или -.'});
 if(name.toLowerCase()===u.username.toLowerCase())return send(res,400,{error:'Это уже твой ник.'});
 const found=await q('SELECT 1 FROM users WHERE LOWER(username)=LOWER($1)',[name]);
 if(found.rowCount)return send(res,409,{error:'Этот ник уже занят.'});
 try{const r=await q('INSERT INTO username_change_requests(user_id,requested_username) VALUES($1,$2) RETURNING id,status',[u.id,name]);return send(res,201,{request:r.rows[0]});}
 catch(e){if(e.code==='23505')return send(res,409,{error:'У тебя уже есть ожидающая заявка.'});throw e}
}
if(path==='/api/admin/username-requests'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q(`SELECT r.id,r.user_id,r.requested_username,r.status,r.created_at,r.reviewed_at,u.username AS current_username,u.public_id FROM username_change_requests r JOIN users u ON u.id=r.user_id ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100`);
 return send(res,200,{requests:r.rows});
}
const nameRequest=path.match(/^\/api\/admin\/username-requests\/(\d+)$/);
if(nameRequest&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(!['approved','rejected'].includes(b.status))return send(res,400,{error:'Укажи решение: approved или rejected.'});
 const client=await db().connect();try{
  await client.query('BEGIN');
  const r=await client.query("SELECT * FROM username_change_requests WHERE id=$1 FOR UPDATE",[nameRequest[1]]);
  if(!r.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Заявка не найдена.'})}
  if(r.rows[0].status!=='pending'){await client.query('ROLLBACK');return send(res,409,{error:'Заявка уже обработана.'})}
  if(b.status==='approved')await client.query('UPDATE users SET username=$1 WHERE id=$2',[r.rows[0].requested_username,r.rows[0].user_id]);
  await client.query('UPDATE username_change_requests SET status=$1,reviewed_by=$2,reviewed_at=NOW() WHERE id=$3',[b.status,u.id,nameRequest[1]]);
  await client.query('COMMIT');return send(res,200,{ok:true});
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return send(res,409,{error:'Этот ник уже занят другим пользователем.'});throw e}finally{client.release()}
}
if(path==='/api/submissions'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.email_verified)return send(res,403,{error:'Сначала подтверди почту.'});
 if(!u.is_artist)return send(res,403,{error:'Отправлять треки могут только артисты с зелёной ноткой.'});
 const title=String(b.title||'').trim(),artist=String(b.artist_name||'').trim(),featuring=String(b.featuring||'').trim(),cover=String(b.cover_url||'').trim(),description=String(b.description||'').trim(),kind=String(b.release_type||'single'),tracks=b.tracks,color=String(b.background_color||'#8bff72');
 if(!title||title.length>150||!artist||artist.length>120||featuring.length>250||description.length>2000||cover&&(!/^https:\/\/[^\s]+$/i.test(cover)||cover.length>1500))return send(res,400,{error:'Проверь данные релиза.'});
 if(!/^#[0-9a-f]{6}$/i.test(color))return send(res,400,{error:'Некорректный цвет фона.'});
 if(!Array.isArray(tracks)||tracks.length<1||tracks.length>30||!['single','multi_single','ep','album'].includes(kind)||kind==='single'&&tracks.length!==1||kind==='multi_single'&&tracks.length!==2)return send(res,400,{error:'Тип релиза не соответствует количеству треков.'});
 const clean=[];
 for(const t of tracks){const name=String(t.title||'').trim(),ft=String(t.featuring||'').trim(),url=String(t.audio_url||'').trim();if(!name||name.length>200||ft.length>250||!/^https:\/\/[^\s]+$/i.test(url)||url.length>1500)return send(res,400,{error:'Проверь название и аудиофайл каждого трека.'});clean.push({title:name,featuring:ft,audio_url:url});}
 const count=await q(`SELECT COUNT(*)::int n FROM track_submissions WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 day'`,[u.id]);if(count.rows[0].n>=10)return send(res,429,{error:'Не больше 10 заявок в сутки.'});
 const r=await q('INSERT INTO track_submissions(user_id,title,artist_name,audio_url,cover_url,description,featuring,release_type,release_date,tracks_json,background_color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING id',[u.id,title,artist,clean[0].audio_url,cover,description,featuring,kind,String(b.release_date||''),JSON.stringify(clean),color]);
 return send(res,201,{id:r.rows[0].id,status:'pending'});
}
if(path==='/api/submissions'&&method==='GET'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 const r=await q(`SELECT s.*,u.username FROM track_submissions s JOIN users u ON u.id=s.user_id WHERE ${u.is_admin?'TRUE':'s.user_id=$1'} ORDER BY s.created_at DESC LIMIT 100`,u.is_admin?[]:[u.id]);return send(res,200,{submissions:r.rows});
}
const submission=path.match(/^\/api\/submissions\/(\d+)$/);
if(submission&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(!['approved','rejected'].includes(b.status))return send(res,400,{error:'Некорректный статус.'});
 const client=await db().connect();try{
  await client.query('BEGIN');
  const check=await client.query('SELECT * FROM track_submissions WHERE id=$1 FOR UPDATE',[submission[1]]);
  if(!check.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Заявка не найдена.'})}
  const t=check.rows[0];
  if(t.published_album_id){await client.query('ROLLBACK');return send(res,409,{error:'Эта заявка уже опубликована.'})}
  if(t.status==='rejected'){await client.query('ROLLBACK');return send(res,409,{error:'Отклонённую заявку нельзя опубликовать. Попроси отправить её заново.'})}
  if(b.status==='rejected'){
   if(t.status!=='pending'){await client.query('ROLLBACK');return send(res,409,{error:'Можно отклонять только ожидающие заявки.'})}
   await client.query("UPDATE track_submissions SET status='rejected',reviewed_at=NOW(),reviewed_by=$1 WHERE id=$2",[u.id,submission[1]]);
   await client.query('COMMIT');return send(res,200,{id:t.id,status:'rejected'});
  }
  // Publish atomically; a row lock prevents duplicate albums on concurrent approvals.
  const tracks=Array.isArray(t.tracks_json)&&t.tracks_json.length?t.tracks_json:[{title:t.title,featuring:t.featuring||'',audio_url:t.audio_url}];
  if(tracks.length<1||tracks.length>30)throw Error('В заявке неверное количество треков.');
  for(const track of tracks)if(!String(track.title||'').trim()||!/^https:\/\/[^\s]+$/i.test(String(track.audio_url||'')))throw Error('В заявке отсутствует название или аудио трека.');
  const kind=['single','multi_single','ep','album'].includes(t.release_type)?t.release_type:'single';
  const actualKind=kind==='single'&&tracks.length===2?'multi_single':kind;
  if(actualKind==='single'&&tracks.length!==1||actualKind==='multi_single'&&tracks.length!==2)throw Error('Тип релиза не соответствует числу треков.');
  const ar=await client.query('INSERT INTO artists(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[t.artist_name]);
  const album=await client.query(`INSERT INTO albums(artist_id,title,cover_url,release_date,description,featuring,audio_url,release_type,background_color)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[ar.rows[0].id,t.title,t.cover_url||'',t.release_date||'',t.description||'',t.featuring||'',tracks[0].audio_url,actualKind,t.background_color||'#8bff72']);
  const albumId=album.rows[0].id;
  for(let i=0;i<tracks.length;i++)await client.query('INSERT INTO tracks(album_id,title,track_number,featuring,audio_url) VALUES($1,$2,$3,$4,$5)',[albumId,String(tracks[i].title).trim(),i+1,String(tracks[i].featuring||''),String(tracks[i].audio_url)]);
  await client.query("UPDATE track_submissions SET status='approved',reviewed_at=NOW(),reviewed_by=$1,published_album_id=$2 WHERE id=$3",[u.id,albumId,submission[1]]);
  await client.query('COMMIT');return send(res,200,{id:t.id,status:'approved',album_id:albumId});
 }catch(e){await client.query('ROLLBACK');console.error('Publish submission failed',e);return send(res,400,{error:'Публикация не удалась: '+e.message})}finally{client.release()}
}
if(path==='/api/admin/users'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q('SELECT id,public_id,username,email,email_verified,is_artist,is_admin,created_at FROM users ORDER BY created_at DESC LIMIT 100');return send(res,200,{users:r.rows});
}
const adminUser=path.match(/^\/api\/admin\/users\/(\d{6})\/artist$/);
if(adminUser&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(typeof b.is_artist!=='boolean')return send(res,400,{error:'Укажи is_artist.'});
 const r=await q('UPDATE users SET is_artist=$1 WHERE public_id=$2 RETURNING id,public_id,username,is_artist',[b.is_artist,adminUser[1]]);return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Пользователь не найден.'});
}
// Administration: moderator actions are always validated server-side.
const adminVerify=path.match(/^\/api\/admin\/users\/(\d{6})\/verification$/);
if(adminVerify&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(typeof b.is_verified!=='boolean')return send(res,400,{error:'Укажи статус верификации.'});
 const r=await q('UPDATE users SET is_verified=$1 WHERE public_id=$2 RETURNING id,public_id,username,is_verified',[b.is_verified,adminVerify[1]]);
 return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Пользователь с таким ID не найден.'});
}
const adminRating=path.match(/^\/api\/admin\/ratings\/(\d+)\/(\d+)$/);
if(adminRating&&method==='DELETE'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const client=await db().connect();try{await client.query('BEGIN');await client.query('DELETE FROM reviews WHERE user_id=$1 AND album_id=$2',[adminRating[1],adminRating[2]]);await client.query('DELETE FROM ratings WHERE user_id=$1 AND album_id=$2',[adminRating[1],adminRating[2]]);await client.query('COMMIT');return send(res,200,{ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
const adminReview=path.match(/^\/api\/admin\/reviews\/(\d+)$/);
if(adminReview&&method==='DELETE'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const r=await client.query('DELETE FROM reviews WHERE id=$1 RETURNING id,album_id,user_id',[adminReview[1]]);
  if(!r.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Рецензия не найдена.'});}
  await client.query('DELETE FROM ratings WHERE user_id=$1 AND album_id=$2',[r.rows[0].user_id,r.rows[0].album_id]);
  await client.query('COMMIT');
  return send(res,200,{ok:true,album_id:r.rows[0].album_id});
 }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}
if(adminReview&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const title=String(b.title||'').trim(),body=String(b.body||'').trim(),rating=Number(b.rating);
 if(title.length>150||!body||body.length>10000||!Number.isInteger(rating)||rating<1||rating>90)return send(res,400,{error:'Нужен текст рецензии и целая оценка от 1 до 90.'});
 const client=await db().connect();try{
  await client.query('BEGIN');
  const r=await client.query('UPDATE reviews SET title=$1,body=$2,rating=$3 WHERE id=$4 RETURNING id,album_id,user_id',[title,body,rating,adminReview[1]]);
  if(!r.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Рецензия не найдена.'})}
  await client.query('UPDATE ratings SET rating=$1,updated_at=NOW() WHERE album_id=$2 AND user_id=$3',[rating,r.rows[0].album_id,r.rows[0].user_id]);
  await client.query('COMMIT');return send(res,200,{ok:true});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
if(path==='/api/admin/reviews'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q(`SELECT r.id,r.album_id,r.user_id,r.title,r.body,r.rating,r.created_at,u.username,a.title AS album_title,a.cover_url,ar.name AS artist_name
 FROM reviews r JOIN users u ON u.id=r.user_id JOIN albums a ON a.id=r.album_id JOIN artists ar ON ar.id=a.artist_id ORDER BY r.created_at DESC LIMIT 200`);
 const standalone=await q(`SELECT 0::bigint AS id,rt.album_id,rt.user_id,''::text AS title,''::text AS body,rt.rating,rt.updated_at AS created_at,u.username,a.title AS album_title,a.cover_url,ar.name AS artist_name FROM ratings rt JOIN users u ON u.id=rt.user_id JOIN albums a ON a.id=rt.album_id JOIN artists ar ON ar.id=a.artist_id WHERE NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.user_id=rt.user_id AND rv.album_id=rt.album_id) ORDER BY rt.updated_at DESC LIMIT 200`);
 return send(res,200,{reviews:[...r.rows,...standalone.rows]});

}
if(path==='/api/admin/users/by-id'&&method==='POST'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const id=String(b.id||'').trim();if(!/^\d{6}$/.test(id))return send(res,400,{error:'Введи шестизначный ID пользователя.'});
 const r=await q('SELECT id,public_id,username,is_artist,is_verified,email_verified FROM users WHERE public_id=$1',[id]);
 return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Аккаунт с таким ID не найден.'});
}
const adminAlbumDelete=path.match(/^\/api\/admin\/albums\/(\d+)$/);
if(adminAlbumDelete&&method==='DELETE'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const client=await db().connect();try{
  await client.query('BEGIN');
  // Reviews/ratings have cascade on album_id; remove the release in one transaction.
  const r=await client.query('DELETE FROM albums WHERE id=$1 RETURNING id',[adminAlbumDelete[1]]);
  await client.query('COMMIT');
  return r.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Релиз не найден.'});
 }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
if(path==='/api/artists'&&method==='GET'){const r=await q('SELECT * FROM artists ORDER BY name');return send(res,200,{artists:r.rows});}
if(path==='/api/albums'&&method==='GET'){const r=await q(`${albumsSql} GROUP BY a.id,ar.name ORDER BY a.created_at DESC LIMIT 300`);return send(res,200,{albums:r.rows});}
const album=path.match(/^\/api\/albums\/(\d+)$/);if(album&&method==='GET'){const r=await q(`${albumsSql} WHERE a.id=$1 GROUP BY a.id,ar.name`,[album[1]]);if(!r.rowCount)return send(res,404,{error:'Релиз не найден.'});const tracks=await q('SELECT * FROM tracks WHERE album_id=$1 ORDER BY track_number',[album[1]]);const reviews=await q(`SELECT r.id,r.user_id,r.album_id,r.rating,r.title,r.body,r.created_at,u.username,u.is_artist,u.avatar_url,u.avatar_bg_color FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.album_id=$1 UNION ALL SELECT 0 AS id,rt.user_id,rt.album_id,rt.rating,'' AS title,'' AS body,rt.updated_at AS created_at,u.username,u.is_artist,u.avatar_url,u.avatar_bg_color FROM ratings rt JOIN users u ON u.id=rt.user_id WHERE rt.album_id=$1 AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.album_id=rt.album_id AND rv.user_id=rt.user_id) ORDER BY created_at DESC`,[album[1]]);const reviewIds=reviews.rows.filter(x=>Number(x.id)>0).map(x=>Number(x.id));
 const comments=reviewIds.length?await q(`SELECT c.id,c.review_id,c.user_id,c.body,c.created_at,u.username,u.avatar_url,u.is_artist FROM comments c JOIN users u ON u.id=c.user_id WHERE c.review_id=ANY($1::bigint[]) ORDER BY c.created_at ASC LIMIT 500`,[reviewIds]):{rows:[]};
 const reactions=reviewIds.length?await q(`SELECT review_id,COUNT(*) FILTER(WHERE reaction=1)::int likes,COUNT(*) FILTER(WHERE reaction=-1)::int dislikes FROM review_reactions WHERE review_id=ANY($1::bigint[]) GROUP BY review_id`,[reviewIds]):{rows:[]};
 const viewer=await me(req);
 const myReactions=viewer&&reviewIds.length?await q('SELECT review_id,reaction FROM review_reactions WHERE user_id=$1 AND review_id=ANY($2::bigint[])',[viewer.id,reviewIds]):{rows:[]};
 return send(res,200,{album:r.rows[0],tracks:tracks.rows,reviews:reviews.rows,comments:comments.rows,reactions:reactions.rows,my_reactions:myReactions.rows});}
if(path==='/api/admin/albums'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q('SELECT a.id,a.title,a.cover_url,a.release_type,ar.name artist_name FROM albums a JOIN artists ar ON ar.id=a.artist_id ORDER BY a.created_at DESC LIMIT 300');return send(res,200,{albums:r.rows});
}
if(album&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const title=String(b.title||'').trim(),artist=String(b.artist_name||'').trim(),featuring=String(b.featuring||'').trim(),cover=String(b.cover_url||'').trim(),color=String(b.background_color||'#8bff72');
 if(!title||title.length>200||!artist||artist.length>120||featuring.length>250)return send(res,400,{error:'Проверь данные релиза.'});
 if(cover&&!/^https:\/\/[^\s]+$/i.test(cover))return send(res,400,{error:'Неверный адрес обложки.'});
 if(!/^#[0-9a-f]{6}$/i.test(color))return send(res,400,{error:'Некорректный цвет фона.'});
 const tracks=b.tracks,kind=String(b.release_type||'');
 if(!Array.isArray(tracks)||tracks.length<1||tracks.length>30||!['single','multi_single','ep','album'].includes(kind)||kind==='single'&&tracks.length!==1||kind==='multi_single'&&tracks.length!==2)return send(res,400,{error:'Проверь тип релиза и треклист.'});
 for(const t of tracks){if(!t||!String(t.title||'').trim()||String(t.title).length>200||String(t.featuring||'').length>250||!/^https:\/\/[^\s]+$/i.test(String(t.audio_url||'')))return send(res,400,{error:'У каждого трека должны быть название и аудиофайл.'});}
 const client=await db().connect();try{await client.query('BEGIN');
 const exists=await client.query('SELECT id FROM albums WHERE id=$1 FOR UPDATE',[album[1]]);if(!exists.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Релиз не найден.'})}
 const ar=await client.query('INSERT INTO artists(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[artist]);
 await client.query('UPDATE albums SET artist_id=$1,title=$2,cover_url=$3,release_date=$4,description=$5,featuring=$6,audio_url=$7,release_type=$8,background_color=$9 WHERE id=$10',[ar.rows[0].id,title,cover,String(b.release_date||'').slice(0,30),String(b.description||'').slice(0,5000),featuring,tracks[0].audio_url,kind,color,album[1]]);
 await client.query('DELETE FROM tracks WHERE album_id=$1',[album[1]]);
 for(let i=0;i<tracks.length;i++)await client.query('INSERT INTO tracks(album_id,title,track_number,featuring,audio_url) VALUES($1,$2,$3,$4,$5)',[album[1],String(tracks[i].title).trim(),i+1,String(tracks[i].featuring||'').trim(),String(tracks[i].audio_url)]);
 await client.query('COMMIT');return send(res,200,{id:Number(album[1])});}catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
if(path==='/api/albums'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.is_admin)return send(res,403,{error:'Публиковать релизы напрямую может только администратор. Артисты отправляют их на модерацию.'});
 const title=String(b.title||'').trim(),artist=String(b.artist_name||'').trim(),featuring=String(b.featuring||'').trim(),cover=String(b.cover_url||'').trim();
 const tracks=b.tracks,kind=b.release_type,color=String(b.background_color||'#8bff72');if(!/^#[0-9a-f]{6}$/i.test(color))return send(res,400,{error:'Некорректный цвет фона.'});
 if(!title||title.length>200||!artist||artist.length>120||featuring.length>250)return send(res,400,{error:'Укажи название и исполнителя. Проверь длину полей.'});
 if(cover&&!/^https:\/\/[^\s]+$/i.test(cover))return send(res,400,{error:'Некорректная ссылка на обложку.'});
 if(!Array.isArray(tracks)||tracks.length<1||tracks.length>30)return send(res,400,{error:'Треклист должен содержать от 1 до 30 треков.'});
 if(!['single','multi_single','ep','album'].includes(kind)||kind==='single'&&tracks.length!==1||kind==='multi_single'&&tracks.length!==2)return send(res,400,{error:'Тип релиза не соответствует количеству треков.'});
 for(const t of tracks){if(!t||typeof t!=='object'||!String(t.title||'').trim()||String(t.title).length>200||String(t.featuring||'').length>250||!/^https:\/\/[^\s]+$/i.test(String(t.audio_url||''))||String(t.audio_url).length>1500)return send(res,400,{error:'Проверь названия и аудиофайлы всех треков.'});}
 const client=await db().connect();try{
  await client.query('BEGIN');
  const ar=await client.query('INSERT INTO artists(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[artist]);
  const r=await client.query('INSERT INTO albums(artist_id,title,cover_url,release_date,description,featuring,audio_url,release_type,background_color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[ar.rows[0].id,title,cover,String(b.release_date||''),String(b.description||'').slice(0,5000),featuring,tracks[0].audio_url,kind,color]);
  for(let i=0;i<tracks.length;i++)await client.query('INSERT INTO tracks(album_id,title,track_number,featuring,audio_url) VALUES($1,$2,$3,$4,$5)',[r.rows[0].id,String(tracks[i].title).trim(),i+1,String(tracks[i].featuring||'').trim(),tracks[i].audio_url]);
  await client.query('COMMIT');return send(res,201,{id:r.rows[0].id});
 }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}

}
if(path==='/api/ratings'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!validRating(b.rating)||!Number.isInteger(Number(b.album_id)))return send(res,400,{error:'Оценка от 1 до 90.'});await q('INSERT INTO ratings(user_id,album_id,rating) VALUES($1,$2,$3) ON CONFLICT(user_id,album_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=NOW()',[u.id,b.album_id,b.rating]);return send(res,200,{ok:true});}
if(path==='/api/reviews'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified&&(String(b.title||'').trim()||String(b.body||'').trim()))return send(res,403,{error:'Подтверди почту, чтобы писать рецензии.'});
 const rating=Number(b.rating),albumId=Number(b.album_id),title=String(b.title||'').trim(),body=String(b.body||'').trim();
 if(!validRating(rating)||!Number.isInteger(albumId)||albumId<1)return send(res,400,{error:'Введи целую оценку от 1 до 90.'});
 if(title&&!body)return send(res,400,{error:'Если указан заголовок, добавь текст рецензии или очисти заголовок.'});
 const client=await db().connect();try{await client.query('BEGIN');await client.query('INSERT INTO ratings(user_id,album_id,rating) VALUES($1,$2,$3) ON CONFLICT(user_id,album_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=NOW()',[u.id,albumId,rating]);await client.query('DELETE FROM reviews WHERE user_id=$1 AND album_id=$2',[u.id,albumId]);if(body){const created=await client.query('INSERT INTO reviews(user_id,album_id,rating,title,body) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.id,albumId,rating,title.slice(0,150),body.slice(0,10000)]);await client.query(`INSERT INTO user_notifications(user_id,actor_id,album_id,review_id,kind)
 SELECT DISTINCT rt.user_id,$1,$2,$3,'review' FROM ratings rt WHERE rt.album_id=$2 AND rt.user_id<>$1`,[u.id,albumId,created.rows[0].id]);}await client.query('COMMIT');return send(res,201,{ok:true})}catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
const reviewReaction=path.match(/^\/api\/reviews\/(\d+)\/reaction$/);
if(reviewReaction&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 const reaction=Number(b.reaction),reviewId=Number(reviewReaction[1]);
 if(![-1,0,1].includes(reaction))return send(res,400,{error:'Некорректная реакция.'});
 const exists=await q('SELECT id FROM reviews WHERE id=$1',[reviewId]);if(!exists.rowCount)return send(res,404,{error:'Рецензия не найдена.'});
 if(reaction===0)await q('DELETE FROM review_reactions WHERE review_id=$1 AND user_id=$2',[reviewId,u.id]);
 else await q('INSERT INTO review_reactions(review_id,user_id,reaction) VALUES($1,$2,$3) ON CONFLICT(review_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction',[reviewId,u.id,reaction]);
 const counts=await q('SELECT COUNT(*) FILTER(WHERE reaction=1)::int likes,COUNT(*) FILTER(WHERE reaction=-1)::int dislikes FROM review_reactions WHERE review_id=$1',[reviewId]);
 return send(res,200,{...counts.rows[0],reaction});
}
if(path==='/api/comments'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту.'});const reviewId=Number(b.review_id),body=String(b.body||'').trim();if(!Number.isSafeInteger(reviewId)||reviewId<1||!body||body.length>2000)return send(res,400,{error:'Напиши комментарий до 2000 символов.'});const client=await db().connect();try{await client.query('BEGIN');const r=await client.query('INSERT INTO comments(user_id,review_id,parent_id,body) VALUES($1,$2,NULL,$3) RETURNING id',[u.id,reviewId,body]);await client.query(`INSERT INTO user_notifications(user_id,actor_id,album_id,review_id,kind)
 SELECT DISTINCT target.user_id,$1,rv.album_id,$2,'comment' FROM reviews rv
 JOIN LATERAL (SELECT rv.user_id UNION SELECT c.user_id FROM comments c WHERE c.review_id=rv.id) target ON TRUE
 WHERE rv.id=$2 AND target.user_id<>$1`,[u.id,reviewId]);await client.query('COMMIT');return send(res,201,{id:r.rows[0].id})}catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}}
return send(res,404,{error:'API endpoint не найден.'});
}catch(e){console.error(e);return send(res,500,{error:e.code==='23503'?'Связанный релиз или исполнитель не найден.':'Ошибка сервера. Проверь базу данных и настройки Vercel.'});}}
