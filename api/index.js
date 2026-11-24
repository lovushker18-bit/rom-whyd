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
const safe=u=>u&&({id:u.id,username:u.username,email:u.email,bio:u.bio,avatar_url:u.avatar_url,email_verified:u.email_verified,is_verified:u.is_verified,is_admin:u.is_admin});
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
const profile=path.match(/^\/api\/users\/([^/]+)$/);if(profile&&method==='GET'){const r=await q('SELECT id,username,bio,avatar_url,email_verified,is_verified,created_at FROM users WHERE LOWER(username)=LOWER($1)',[decodeURIComponent(profile[1])]);return r.rowCount?send(res,200,{user:r.rows[0]}):send(res,404,{error:'Профиль не найден.'});}
if(path==='/api/artists'&&method==='GET'){const r=await q('SELECT * FROM artists ORDER BY name');return send(res,200,{artists:r.rows});}
if(path==='/api/albums'&&method==='GET'){const r=await q(`${albumsSql} GROUP BY a.id,ar.name ORDER BY a.created_at DESC LIMIT 300`);return send(res,200,{albums:r.rows});}
const album=path.match(/^\/api\/albums\/(\d+)$/);if(album&&method==='GET'){const r=await q(`${albumsSql} WHERE a.id=$1 GROUP BY a.id,ar.name`,[album[1]]);if(!r.rowCount)return send(res,404,{error:'Релиз не найден.'});const tracks=await q('SELECT * FROM tracks WHERE album_id=$1 ORDER BY track_number',[album[1]]);const reviews=await q('SELECT r.*,u.username FROM reviews r JOIN users u ON u.id=r.user_id WHERE album_id=$1 ORDER BY r.created_at DESC',[album[1]]);return send(res,200,{album:r.rows[0],tracks:tracks.rows,reviews:reviews.rows});}
if(path==='/api/albums'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.is_verified&&!u.is_admin)return send(res,403,{error:'Добавлять релизы могут только пользователи с галочкой.'});if(!b.title||!b.artist_id)return send(res,400,{error:'Укажи название и исполнителя.'});const r=await q('INSERT INTO albums(artist_id,title,cover_url,release_date,description) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.artist_id,String(b.title).slice(0,200),String(b.cover_url||''),String(b.release_date||''),String(b.description||'')]);return send(res,201,{id:r.rows[0].id});}
if(path==='/api/ratings'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту, чтобы ставить оценки.'});if(!validRating(b.rating)||!Number.isInteger(Number(b.album_id)))return send(res,400,{error:'Оценка от 0 до 10 с шагом 0.5.'});await q('INSERT INTO ratings(user_id,album_id,rating) VALUES($1,$2,$3) ON CONFLICT(user_id,album_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=NOW()',[u.id,b.album_id,b.rating]);return send(res,200,{ok:true});}
if(path==='/api/reviews'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту, чтобы писать рецензии.'});if(!validRating(b.rating)||!b.album_id||!String(b.title||'').trim()||!String(b.body||'').trim())return send(res,400,{error:'Заполни оценку, заголовок и текст.'});const r=await q('INSERT INTO reviews(user_id,album_id,rating,title,body) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.id,b.album_id,b.rating,String(b.title).slice(0,150),String(b.body).slice(0,10000)]);return send(res,201,{id:r.rows[0].id});}
if(path==='/api/comments'&&method==='POST'){const u=await me(req);if(!u)return send(res,401,{error:'Войди в аккаунт.'});if(!u.email_verified)return send(res,403,{error:'Подтверди почту.'});if(!b.review_id||!String(b.body||'').trim())return send(res,400,{error:'Напиши комментарий.'});const r=await q('INSERT INTO comments(user_id,review_id,parent_id,body) VALUES($1,$2,$3,$4) RETURNING id',[u.id,b.review_id,b.parent_id||null,String(b.body).slice(0,2000)]);return send(res,201,{id:r.rows[0].id});}
return send(res,404,{error:'API endpoint не найден.'});
}catch(e){console.error(e);return send(res,500,{error:e.code==='23503'?'Связанный релиз или исполнитель не найден.':'Ошибка сервера. Проверь базу данных и настройки Vercel.'});}}
