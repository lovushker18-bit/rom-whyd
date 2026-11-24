const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const match = raw.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

async function currentUser(request, env) {
  const token = getCookie(request, "session");
  if (!token) return null;

  const row = await env.DB.prepare(`
    SELECT users.id, users.username, users.email, users.bio, users.avatar_url
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();

  return row || null;
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    bio: user.bio,
    avatar_url: user.avatar_url
  };
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/me" && method === "GET") {
    return json({ user: safeUser(await currentUser(request, env)) });
  }

  if (path === "/api/register" && method === "POST") {
    const data = await request.json().catch(() => null);
    if (!data?.username || !data?.email || !data?.password) {
      return json({ error: "Username, email and password are required." }, 400);
    }
    if (data.username.length < 3 || data.username.length > 24) {
      return json({ error: "Username must be 3–24 characters." }, 400);
    }
    if (data.password.length < 8) {
      return json({ error: "Password must contain at least 8 characters." }, 400);
    }

    const exists = await env.DB.prepare(
      "SELECT id FROM users WHERE username = ? OR email = ?"
    ).bind(data.username.trim(), data.email.trim()).first();

    if (exists) return json({ error: "Username or email is already in use." }, 409);

    const hash = await hashPassword(data.password);
    const result = await env.DB.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"
    ).bind(data.username.trim(), data.email.trim().toLowerCase(), hash).run();

    const token = randomToken();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
    ).bind(token, result.meta.last_row_id).run();

    return json(
      { user: { id: result.meta.last_row_id, username: data.username.trim() } },
      201,
      { "Set-Cookie": cookie("session", token, 60 * 60 * 24 * 30) }
    );
  }

  if (path === "/api/login" && method === "POST") {
    const data = await request.json().catch(() => null);
    if (!data?.login || !data?.password) {
      return json({ error: "Login and password are required." }, 400);
    }

    const hash = await hashPassword(data.password);
    const user = await env.DB.prepare(`
      SELECT id, username, email, bio, avatar_url
      FROM users
      WHERE (username = ? OR email = ?) AND password_hash = ?
    `).bind(data.login.trim(), data.login.trim().toLowerCase(), hash).first();

    if (!user) return json({ error: "Invalid login or password." }, 401);

    const token = randomToken();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
    ).bind(token, user.id).run();

    return json(
      { user: safeUser(user) },
      200,
      { "Set-Cookie": cookie("session", token, 60 * 60 * 24 * 30) }
    );
  }

  if (path === "/api/logout" && method === "POST") {
    const token = getCookie(request, "session");
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
    }
    return json(
      { ok: true },
      200,
      { "Set-Cookie": cookie("session", "", 0) }
    );
  }

  if (path === "/api/artists" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM artists ORDER BY name ASC"
    ).all();
    return json({ artists: rows.results });
  }

  if (path === "/api/albums" && method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT albums.*, artists.name AS artist_name,
        ROUND(AVG(ratings.rating), 2) AS average_rating,
        COUNT(ratings.id) AS rating_count
      FROM albums
      JOIN artists ON artists.id = albums.artist_id
      LEFT JOIN ratings ON ratings.album_id = albums.id
      GROUP BY albums.id
      ORDER BY albums.created_at DESC
    `).all();
    return json({ albums: rows.results });
  }

  if (path === "/api/albums" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);

    const data = await request.json().catch(() => null);
    if (!data?.artist_id || !data?.title) {
      return json({ error: "artist_id and title are required." }, 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO albums (artist_id, title, cover_url, release_date, description)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      Number(data.artist_id),
      String(data.title),
      String(data.cover_url || ""),
      String(data.release_date || ""),
      String(data.description || "")
    ).run();

    return json({ id: result.meta.last_row_id }, 201);
  }

  const albumMatch = path.match(/^\/api\/albums\/(\d+)$/);
  if (albumMatch && method === "GET") {
    const albumId = Number(albumMatch[1]);

    const album = await env.DB.prepare(`
      SELECT albums.*, artists.name AS artist_name,
        ROUND(AVG(ratings.rating), 2) AS average_rating,
        COUNT(ratings.id) AS rating_count
      FROM albums
      JOIN artists ON artists.id = albums.artist_id
      LEFT JOIN ratings ON ratings.album_id = albums.id
      WHERE albums.id = ?
      GROUP BY albums.id
    `).bind(albumId).first();

    if (!album) return json({ error: "Album not found." }, 404);

    const tracks = await env.DB.prepare(`
      SELECT * FROM tracks WHERE album_id = ? ORDER BY track_number ASC
    `).bind(albumId).all();

    const reviews = await env.DB.prepare(`
      SELECT reviews.*, users.username
      FROM reviews
      JOIN users ON users.id = reviews.user_id
      WHERE reviews.album_id = ?
      ORDER BY reviews.created_at DESC
    `).bind(albumId).all();

    return json({ album, tracks: tracks.results, reviews: reviews.results });
  }

  if (path === "/api/ratings" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);

    const data = await request.json().catch(() => null);
    const rating = Number(data?.rating);
    const albumId = Number(data?.album_id);

    if (!albumId || !Number.isFinite(rating) || rating < 0 || rating > 10 || (rating * 2) % 1 !== 0) {
      return json({ error: "Rating must be from 0 to 10 in 0.5 increments." }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO ratings (user_id, album_id, rating)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, album_id)
      DO UPDATE SET rating = excluded.rating, updated_at = CURRENT_TIMESTAMP
    `).bind(user.id, albumId, rating).run();

    return json({ ok: true, rating });
  }

  if (path === "/api/reviews" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);

    const data = await request.json().catch(() => null);
    const rating = Number(data?.rating);
    if (!data?.album_id || !data?.title || !data?.body ||
        !Number.isFinite(rating) || rating < 0 || rating > 10 || (rating * 2) % 1 !== 0) {
      return json({ error: "Album, title, body and a valid rating are required." }, 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO reviews (user_id, album_id, rating, title, body)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      user.id,
      Number(data.album_id),
      rating,
      String(data.title).trim(),
      String(data.body).trim()
    ).run();

    return json({ id: result.meta.last_row_id }, 201);
  }

  if (path === "/api/comments" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);

    const data = await request.json().catch(() => null);
    if (!data?.review_id || !data?.body) {
      return json({ error: "Review and body are required." }, 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO comments (user_id, review_id, parent_id, body)
      VALUES (?, ?, ?, ?)
    `).bind(
      user.id,
      Number(data.review_id),
      data.parent_id ? Number(data.parent_id) : null,
      String(data.body).trim()
    ).run();

    return json({ id: result.meta.last_row_id }, 201);
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env);
      } catch (error) {
        console.error(error);
        return json({ error: "Internal server error." }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
