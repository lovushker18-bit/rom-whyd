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
const safe=u=>u&&({id:u.id,username:u.username,email:u.email,bio:u.bio,avatar_url:u.avatar_url,email_verified:u.email_verified,is_verified:u.is_verified,is_admin:u.is_admin,is_artist:u.is_artist});
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

const validRating=x=>Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<=10&&Number(x)*2%1===0;
const albumsSql=`SELECT a.*,ar.name artist_name,ROUND(AVG(r.rating),2) average_rating,COUNT(r.id)::int rating_count FROM albums a JOIN artists ar ON ar.id=a.artist_id LEFT JOIN ratings r ON r.album_id=a.id`;
export default async function handler(req,res){try{
const path=new URL(req.url,'https://rom.local').pathname,method=req.method,b=req.body||{};
if(path==='/api/blob-upload'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.email_verified)return send(res,403,{error:'Подтверди почту.'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'Администратор не подключил Vercel Blob.'});
 try{
  const result=await handleUpload({body:b,request:req,onBeforeGenerateToken:async(pathname,clientPayload)=>{
   const kind=String(pathname).startsWith('covers/')?'cover':String(pathname).startsWith('audio/')?'audio':null;
   if(!kind)throw Error('Недопустимый путь загрузки.');
   if(kind==='audio'&&!u.is_artist&&!u.is_verified&&!u.is_admin)throw Error('Аудио могут загружать только артисты.');
   if(kind==='cover'&&!u.is_artist&&!u.is_verified&&!u.is_admin)throw Error('Нет доступа к загрузке обложек.');
   return {allowedContentTypes:kind==='cover'?['image/png','image/jpeg']:['audio/mpeg','audio/mp3','audio/flac','audio/x-flac','audio/wav','audio/wave','audio/x-wav'],maximumSizeInBytes:kind==='cover'?4*1024*1024:40*1024*1024,addRandomSuffix:true,tokenPayload:JSON.stringify({userId:u.id,kind})};
  },onUploadCompleted:async()=>{}});
  return send(res,200,result);
 }catch(e){console.error('Blob upload error:',e.message);return send(res,400,{error:'Ошибка загрузки: '+e.message});}
}
if(path==='/api/verify-code'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(u.email_verified)return send(res,200,{ok:true});
 const code=String(b.code||'').trim();if(!/^\d{6}$/.test(code))return send(res,400,{error:'Введи 6 цифр из письма.'});
 const result=await q(`DELETE FROM email_tokens WHERE user_id=$1 AND token_hash=$2 AND expires_at>NOW() RETURNING user_id`,[u.id,sha(`${u.id}:${code}`)]);
 if(!result.rowCount)return send(res,400,{error:'Неверный или просроченный код. Запроси новый.'});
 await q('UPDATE users SET email_verified=TRUE WHERE id=$1',[u.id]);return send(res,200,{ok:true});
}
if(path==='/api/me'&&method==='GET')return send(res,200,{user:safe(await me(req))});
if(path==='/api/register'&&method==='POST'){const username=String(b.username||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||password.length>128)return send(res,400,{error:'Ник 3–24 символа, корректная почта и пароль от 8 символов обязательны.'});if(!process.env.GMAIL_USER||!process.env.GMAIL_APP_PASSWORD)return send(res,503,{error:'Администратор ещё не настроил отправку писем.'});const hash=await bcrypt.hash(password,12);let r;try{r=await q('INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING *',[username,email,hash]);}catch(e){if(e.code==='23505')return send(res,409,{error:'Ник или почта уже заняты.'});throw e;}await session(res,r.rows[0]);try{await sendVerification(r.rows[0]);}catch(e){return send(res,201,{user:safe(r.rows[0]),email_sent:false,message:'Аккаунт создан, но письмо не отправлено. Повтори отправку в настройках.'});}return send(res,201,{user:safe(r.rows[0]),email_sent:true});}
if(path==='/api/login'&&method==='POST'){const email=String(b.email||b.login||'').trim().toLowerCase();const r=await q('SELECT * FROM users WHERE LOWER(email)=$1',[email]);if(!r.rowCount||!await bcrypt.compare(String(b.password||''),r.rows[0].password_hash))return send(res,401,{error:'Неверная почта или пароль.'});await session(res,r.rows[0]);return send(res,200,{user:safe(r.rows[0])});}
if(path==='/api/logout'&&method==='POST'){const t=cookies(req).rom_session;if(t)await q('DELETE FROM sessions WHERE id=$1',[sha(t)]);res.setHeader('Set-Cookie',cookie('',0));return send(res,200,{ok:true});}
if(path==='/api/resend-verification'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(u.email_verified)return send(res,400,{error:'Почта уже подтверждена.'});const last=await q(`SELECT 1 FROM email_tokens WHERE user_id=$1 AND expires_at>NOW()+INTERVAL '9 minutes'`,[u.id]);if(last.rowCount)return send(res,429,{error:'Код уже отправлен. Подожди минуту и попробуй снова.'});try{await sendVerification(u);return send(res,200,{ok:true});}catch(err){console.error('Gmail verification error:',err.message);return send(res,502,{error:'Не удалось отправить письмо. Проверь настройки Gmail в Vercel и логи сервера.'});}}
if(path==='/api/profile'&&method==='PATCH'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});const bio=String(b.bio||'').trim(),avatar=String(b.avatar_url||'').trim();if(bio.length>500||avatar.length>500||avatar&&!/^https:\/\//.test(avatar))return send(res,400,{error:'Описание до 500 символов; аватар — HTTPS-ссылка.'});const r=await q('UPDATE users SET bio=$1,avatar_url=$2 WHERE id=$3 RETURNING *',[bio,avatar,u.id]);return send(res,200,{user:safe(r.rows[0])});}
const profile=path.match(/^\/api\/users\/([^/]+)$/);if(profile&&method==='GET'){const r=await q('SELECT id,username,bio,avatar_url,email_verified,is_verified,is_artist,created_at FROM users WHERE LOWER(username)=LOWER($1)',[decodeURIComponent(profile[1])]);return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Профиль не найден.'});}
if(path==='/api/submissions'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.email_verified)return send(res,403,{error:'Сначала подтверди почту.'});
 if(!u.is_artist)return send(res,403,{error:'Отправлять треки могут только артисты с зелёной ноткой.'});
 const title=String(b.title||'').trim(),artist=String(b.artist_name||'').trim(),featuring=String(b.featuring||'').trim(),audio=String(b.audio_url||'').trim(),cover=String(b.cover_url||'').trim(),description=String(b.description||'').trim();
 if(!title||title.length>150||!artist||artist.length>120||featuring.length>250||description.length>2000||!/^https:\/\/[^\s]+$/i.test(audio)||audio.length>1500||cover&&(!/^https:\/\/[^\s]+$/i.test(cover)||cover.length>1500))return send(res,400,{error:'Укажи исполнителя, название и HTTPS-ссылку на трек. Проверь длину полей.'});
 const count=await q(`SELECT COUNT(*)::int n FROM track_submissions WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 day'`,[u.id]);if(count.rows[0].n>=10)return send(res,429,{error:'Не больше 10 заявок в сутки.'});
 const r=await q('INSERT INTO track_submissions(user_id,title,artist_name,audio_url,cover_url,description,featuring) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[u.id,title,artist,audio,cover,description,featuring]);return send(res,201,{id:r.rows[0].id,status:'pending'});
}
if(path==='/api/submissions'&&method==='GET'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 const r=await q(`SELECT s.*,u.username FROM track_submissions s JOIN users u ON u.id=s.user_id WHERE ${u.is_admin?'TRUE':'s.user_id=$1'} ORDER BY s.created_at DESC LIMIT 100`,u.is_admin?[]:[u.id]);return send(res,200,{submissions:r.rows});
}
const submission=path.match(/^\/api\/submissions\/(\d+)$/);
if(submission&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(!['approved','rejected','pending'].includes(b.status))return send(res,400,{error:'Некорректный статус.'});
 const r=await q('UPDATE track_submissions SET status=$1,reviewed_at=NOW(),reviewed_by=$2 WHERE id=$3 RETURNING id,status',[b.status,u.id,submission[1]]);return r.rowCount?send(res,200,r.rows[0]):send(res,404,{error:'Заявка не найдена.'});
}
if(path==='/api/admin/users'&&method==='GET'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 const r=await q('SELECT id,username,email,email_verified,is_artist,is_admin,created_at FROM users ORDER BY created_at DESC LIMIT 100');return send(res,200,{users:r.rows});
}
const adminUser=path.match(/^\/api\/admin\/users\/(\d+)\/artist$/);
if(adminUser&&method==='PATCH'){
 const u=await me(req);if(!u?.is_admin)return send(res,403,{error:'Только администратор.'});
 if(typeof b.is_artist!=='boolean')return send(res,400,{error:'Укажи is_artist.'});
 const r=await q('UPDATE users SET is_artist=$1 WHERE id=$2 RETURNING id,username,is_artist',[b.is_artist,adminUser[1]]);return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Пользователь не найден.'});
}
if(path==='/api/artists'&&method==='GET'){const r=await q('SELECT * FROM artists ORDER BY name');return send(res,200,{artists:r.rows});}
if(path==='/api/albums'&&method==='GET'){const r=await q(`${albumsSql} GROUP BY a.id,ar.name ORDER BY a.created_at DESC LIMIT 300`);return send(res,200,{albums:r.rows});}
const album=path.match(/^\/api\/albums\/(\d+)$/);if(album&&method==='GET'){const r=await q(`${albumsSql} WHERE a.id=$1 GROUP BY a.id,ar.name`,[album[1]]);if(!r.rowCount)return send(res,404,{error:'Релиз не найден.'});const tracks=await q('SELECT * FROM tracks WHERE album_id=$1 ORDER BY track_number',[album[1]]);const reviews=await q('SELECT r.*,u.username,u.is_artist FROM reviews r JOIN users u ON u.id=r.user_id WHERE album_id=$1 ORDER BY r.created_at DESC',[album[1]]);return send(res,200,{album:r.rows[0],tracks:tracks.rows,reviews:reviews.rows});}
if(path==='/api/albums'&&method==='POST'){
 const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});
 if(!u.is_verified&&!u.is_admin)return send(res,403,{error:'Добавлять релизы могут только пользователи с галочкой.'});
 const title=String(b.title||'').trim(),artist=String(b.artist_name||'').trim(),featuring=String(b.featuring||'').trim(),cover=String(b.cover_url||'').trim();
 const tracks=b.tracks,kind=b.release_type;
 if(!title||title.length>200||!artist||artist.length>120||featuring.length>250)return send(res,400,{error:'Укажи название и исполнителя. Проверь длину полей.'});
 if(cover&&!/^https:\/\/[^\s]+$/i.test(cover))return send(res,400,{error:'Некорректная ссылка на обложку.'});
 if(!Array.isArray(tracks)||tracks.length<1||tracks.length>30)return send(res,400,{error:'Треклист должен содержать от 1 до 30 треков.'});
 if(!['single','multi_single','ep','album'].includes(kind)||kind==='single'&&tracks.length!==1||kind==='multi_single'&&tracks.length!==2)return send(res,400,{error:'Тип релиза не соответствует количеству треков.'});
 for(const t of tracks){if(!t||typeof t!=='object'||!String(t.title||'').trim()||String(t.title).length>200||String(t.featuring||'').length>250||!/^https:\/\/[^\s]+$/i.test(String(t.audio_url||''))||String(t.audio_url).length>1500)return send(res,400,{error:'Проверь названия и аудиофайлы всех треков.'});}
 const client=await db().connect();try{
  await client.query('BEGIN');
  const ar=await client.query('INSERT INTO artists(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[artist]);
  const r=await client.query('INSERT INTO albums(artist_id,title,cover_url,release_date,description,featuring,audio_url,release_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[ar.rows[0].id,title,cover,String(b.release_date||''),String(b.description||'').slice(0,5000),featuring,tracks[0].audio_url,kind]);
  for(let i=0;i<tracks.length;i++)await client.query('INSERT INTO tracks(album_id,title,track_number,featuring,audio_url) VALUES($1,$2,$3,$4,$5)',[r.rows[0].id,String(tracks[i].title).trim(),i+1,String(tracks[i].featuring||'').trim(),tracks[i].audio_url]);
  await client.query('COMMIT');return send(res,201,{id:r.rows[0].id});
 }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}

}
if(path==='/api/ratings'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту, чтобы ставить оценки.'});if(!validRating(b.rating)||!Number.isInteger(Number(b.album_id)))return send(res,400,{error:'Оценка от 0 до 10 с шагом 0.5.'});await q('INSERT INTO ratings(user_id,album_id,rating) VALUES($1,$2,$3) ON CONFLICT(user_id,album_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=NOW()',[u.id,b.album_id,b.rating]);return send(res,200,{ok:true});}
if(path==='/api/reviews'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту, чтобы писать рецензии.'});if(!validRating(b.rating)||!b.album_id||!String(b.title||'').trim()||!String(b.body||'').trim())return send(res,400,{error:'Заполни оценку, заголовок и текст.'});const r=await q('INSERT INTO reviews(user_id,album_id,rating,title,body) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.id,b.album_id,b.rating,String(b.title).slice(0,150),String(b.body).slice(0,10000)]);return send(res,201,{id:r.rows[0].id});}
if(path==='/api/comments'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту.'});if(!b.review_id||!String(b.body||'').trim())return send(res,400,{error:'Напиши комментарий.'});const r=await q('INSERT INTO comments(user_id,review_id,parent_id,body) VALUES($1,$2,$3,$4) RETURNING id',[u.id,b.review_id,b.parent_id||null,String(b.body).slice(0,2000)]);return send(res,201,{id:r.rows[0].id});}
return send(res,404,{error:'API endpoint не найден.'});
}catch(e){console.error(e);return send(res,500,{error:e.code==='23503'?'Связанный релиз или исполнитель не найден.':'Ошибка сервера. Проверь базу данных и настройки Vercel.'});}}
