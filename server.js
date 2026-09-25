import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(path.join(__dirname, "versi.db"));
const PORT = Number(process.env.PORT || 10000);
const SECRET = process.env.JWT_SECRET || "cambia-questa-chiave-in-produzione";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('writer','reader')),
 bio TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poems(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 mood TEXT NOT NULL,
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS likes(
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,poem_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(poem_id) REFERENCES poems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saves(
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,poem_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(poem_id) REFERENCES poems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites(
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,poem_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(poem_id) REFERENCES poems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collections(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_items(
 collection_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(collection_id,poem_id),
 FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE,
 FOREIGN KEY(poem_id) REFERENCES poems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS follows(
 follower_id INTEGER NOT NULL,
 following_id INTEGER NOT NULL,
 PRIMARY KEY(follower_id,following_id),
 FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(poem_id) REFERENCES poems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 actor_id INTEGER,
 type TEXT NOT NULL,
 poem_id INTEGER,
 read INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(poem_id) REFERENCES poems(id) ON DELETE CASCADE
);
`);

const MOODS = new Set([
  "Amore",
  "Nostalgia",
  "Solitudine",
  "Rinascita",
  "Felicità",
  "Dolore",
  "Libertà"
]);

const VISIBILITIES = new Set(["public", "followers", "private"]);

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(id) {
  return db.prepare(`
    SELECT id,username,display_name,role,bio,created_at
    FROM users
    WHERE id=?
  `).get(id);
}

function auth(req, res, next) {
  const raw = String(req.headers.authorization || "");
  const value = raw.startsWith("Bearer ") ? raw.slice(7) : "";

  if (!value) {
    return res.status(401).json({ error: "Accedi per continuare." });
  }

  try {
    req.user = jwt.verify(value, SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "La sessione è scaduta. Accedi di nuovo."
    });
  }
}

function isFollowing(followerId, followingId) {
  return !!db.prepare(`
    SELECT 1
    FROM follows
    WHERE follower_id=? AND following_id=?
  `).get(followerId, followingId);
}

function canViewPoem(p, viewerId) {
  if (!p) return false;

  if (p.visibility === "public") return true;
  if (p.user_id === viewerId) return true;

  return (
    p.visibility === "followers" &&
    isFollowing(viewerId, p.user_id)
  );
}

function poem(id, viewerId = 0) {
  const p = db.prepare(`
    SELECT
      p.*,
      u.username,
      u.display_name,
      u.role,

      (SELECT COUNT(*)
       FROM likes
       WHERE poem_id=p.id) AS likes,

      (SELECT COUNT(*)
       FROM saves
       WHERE poem_id=p.id) AS saves,

      (SELECT COUNT(*)
       FROM comments
       WHERE poem_id=p.id) AS comments

    FROM poems p
    JOIN users u ON u.id=p.user_id
    WHERE p.id=?
  `).get(id);

  if (!p || !canViewPoem(p, viewerId)) return null;

  return {
    ...p,

    liked: !!db.prepare(`
      SELECT 1
      FROM likes
      WHERE user_id=? AND poem_id=?
    `).get(viewerId, id),

    saved: !!db.prepare(`
      SELECT 1
      FROM saves
      WHERE user_id=? AND poem_id=?
    `).get(viewerId, id),

    favorited: !!db.prepare(`
      SELECT 1
      FROM favorites
      WHERE user_id=? AND poem_id=?
    `).get(viewerId, id),

    following: isFollowing(viewerId, p.user_id)
  };
}

function userStats(userId) {
  return {
    poems: db.prepare(`
      SELECT COUNT(*) n
      FROM poems
      WHERE user_id=?
    `).get(userId).n,

    followers: db.prepare(`
      SELECT COUNT(*) n
      FROM follows
      WHERE following_id=?
    `).get(userId).n,

    following: db.prepare(`
      SELECT COUNT(*) n
      FROM follows
      WHERE follower_id=?
    `).get(userId).n,

    likes: db.prepare(`
      SELECT COUNT(*) n
      FROM likes l
      JOIN poems p ON p.id=l.poem_id
      WHERE p.user_id=?
    `).get(userId).n
  };
}

function profilePayload(userId, viewerId) {
  const user = publicUser(userId);

  if (!user) return null;

  const own = userId === viewerId;

  const ids = db.prepare(
    own
      ? `
        SELECT id
        FROM poems
        WHERE user_id=?
        ORDER BY created_at DESC
      `
      : `
        SELECT id
        FROM poems
        WHERE user_id=?
        AND visibility='public'
        ORDER BY created_at DESC
      `
  ).all(userId).map(x => x.id);

  return {
    ...user,
    ...userStats(userId),
    followed: isFollowing(viewerId, userId),
    poems: ids.map(id => poem(id, viewerId)).filter(Boolean)
  };
}

/* =========================
   AUTH
========================= */

app.post("/api/register", (req, res, next) => {
  try {
    const displayName = String(req.body.displayName || "").trim();
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = req.body.role;

    if (!displayName) {
      return res.status(400).json({
        error: "Inserisci il nome visualizzato."
      });
    }

    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      return res.status(400).json({
        error: "Lo username deve contenere 3-24 caratteri: lettere, numeri, punto, trattino o underscore."
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        error: "Inserisci un indirizzo email valido."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "La password deve avere almeno 8 caratteri."
      });
    }

    if (!["writer", "reader"].includes(role)) {
      return res.status(400).json({
        error: "Scegli se vuoi essere Scrittore o Lettore."
      });
    }

    if (db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) {
      return res.status(409).json({
        error: "Questo username è già utilizzato."
      });
    }

    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) {
      return res.status(409).json({
        error: "Questa email è già associata a un account."
      });
    }

    const hash = bcrypt.hashSync(password, 12);

    const r = db.prepare(`
      INSERT INTO users(
        username,
        email,
        password,
        display_name,
        role
      )
      VALUES(?,?,?,?,?)
    `).run(
      username,
      email,
      hash,
      displayName,
      role
    );

    const user = publicUser(r.lastInsertRowid);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username
      },
      SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      ok: true,
      token,
      user
    });

  } catch (e) {
    next(e);
  }
});

app.post("/api/login", (req, res) => {
  const identifier = String(
    req.body.identifier || ""
  ).trim().toLowerCase();

  const password = String(req.body.password || "");

  if (!identifier || !password) {
    return res.status(400).json({
      error: "Inserisci email/username e password."
    });
  }

  const u = db.prepare(`
    SELECT *
    FROM users
    WHERE email=? OR username=?
  `).get(identifier, identifier);

  if (!u || !bcrypt.compareSync(password, u.password)) {
    return res.status(401).json({
      error: "Email/username o password non corretti."
    });
  }

  const token = jwt.sign(
    {
      id: u.id,
      username: u.username
    },
    SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    ok: true,
    token,
    user: publicUser(u.id)
  });
});

/* =========================
   PROFILE
========================= */

app.get("/api/me", auth, (req, res) => {
  const user = publicUser(req.user.id);

  if (!user) {
    return res.status(401).json({
      error: "Account non trovato."
    });
  }

  res.json({
    ...user,
    stats: userStats(user.id)
  });
});

app.patch("/api/me", auth, (req, res, next) => {
  try {
    const current = publicUser(req.user.id);

    if (!current) {
      return res.status(404).json({
        error: "Account non trovato."
      });
    }

    const displayName = String(
      req.body.displayName ?? current.display_name
    ).trim();

    const bio = String(
      req.body.bio ?? current.bio ?? ""
    ).trim();

    const username = normalizeUsername(
      req.body.username ?? current.username
    );

    if (!displayName) {
      return res.status(400).json({
        error: "Il nome visualizzato non può essere vuoto."
      });
    }

    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      return res.status(400).json({
        error: "Username non valido. Usa 3-24 caratteri: lettere, numeri, punto, trattino o underscore."
      });
    }

    if (bio.length > 300) {
      return res.status(400).json({
        error: "La bio può contenere al massimo 300 caratteri."
      });
    }

    const duplicate = db.prepare(`
      SELECT id
      FROM users
      WHERE username=? AND id<>?
    `).get(username, req.user.id);

    if (duplicate) {
      return res.status(409).json({
        error: "Questo username è già utilizzato."
      });
    }

    db.prepare(`
      UPDATE users
      SET display_name=?, username=?, bio=?
      WHERE id=?
    `).run(
      displayName,
      username,
      bio,
      req.user.id
    );

    const user = publicUser(req.user.id);

    res.json({
      ok: true,
      user: {
        ...user,
        stats: userStats(user.id)
      }
    });

  } catch (e) {
    next(e);
  }
});

/* =========================
   POEMS
========================= */

app.get("/api/poems", auth, (req, res) => {
  const mood = String(req.query.mood || "");
  const q = String(req.query.q || "").trim();

  if (mood && !MOODS.has(mood)) {
    return res.status(400).json({
      error: "Emozione non valida."
    });
  }

  const ids = db.prepare(`
    SELECT p.id
    FROM poems p
    JOIN users u ON u.id=p.user_id

    WHERE (
      p.visibility='public'
      OR p.user_id=?
      OR (
        p.visibility='followers'
        AND EXISTS(
          SELECT 1
          FROM follows f
          WHERE f.follower_id=?
          AND f.following_id=p.user_id
        )
      )
    )

    AND (?='' OR p.mood=?)

    AND (
      ?=''
      OR lower(
        p.title||' '||
        p.body||' '||
        u.display_name||' '||
        u.username
      ) LIKE lower(?)
    )

    ORDER BY p.created_at DESC
    LIMIT 100
  `).all(
    req.user.id,
    req.user.id,
    mood,
    mood,
    q,
    `%${q}%`
  ).map(x => x.id);

  res.json(
    ids
      .map(id => poem(id, req.user.id))
      .filter(Boolean)
  );
});

app.post("/api/poems", auth, (req, res, next) => {
  try {
    const user = publicUser(req.user.id);

    if (!user) {
      return res.status(401).json({
        error: "Account non trovato."
      });
    }

    if (user.role !== "writer") {
      return res.status(403).json({
        error: "Solo gli Scrittori possono pubblicare poesie."
      });
    }

    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    const mood = String(req.body.mood || "").trim();
    const visibility = String(
      req.body.visibility || "public"
    );

    if (!title) {
      return res.status(400).json({
        error: "Inserisci un titolo."
      });
    }

    if (!body) {
      return res.status(400).json({
        error: "Scrivi il testo della poesia."
      });
    }

    if (title.length > 120) {
      return res.status(400).json({
        error: "Il titolo è troppo lungo."
      });
    }

    if (body.length > 12000) {
      return res.status(400).json({
        error: "La poesia è troppo lunga."
      });
    }

    if (!MOODS.has(mood)) {
      return res.status(400).json({
        error: "Scegli un'emozione."
      });
    }

    if (!VISIBILITIES.has(visibility)) {
      return res.status(400).json({
        error: "Scegli una visibilità valida."
      });
    }

    const r = db.prepare(`
      INSERT INTO poems(
        user_id,
        title,
        body,
        mood,
        visibility
      )
      VALUES(?,?,?,?,?)
    `).run(
      req.user.id,
      title,
      body,
      mood,
      visibility
    );

    res.status(201).json({
      ok: true,
      message: "Poesia pubblicata.",
      poem: poem(r.lastInsertRowid, req.user.id)
    });

  } catch (e) {
    next(e);
  }
});

app.get("/api/poems/:id", auth, (req, res) => {
  const p = poem(req.params.id, req.user.id);

  p
    ? res.json(p)
    : res.status(404).json({
        error: "Poesia non trovata o non disponibile."
      });
});

app.delete("/api/poems/:id", auth, (req, res, next) => {
  try {
    const p = db.prepare(`
      SELECT *
      FROM poems
      WHERE id=?
    `).get(req.params.id);

    if (!p) {
      return res.status(404).json({
        error: "Poesia non trovata."
      });
    }

    if (p.user_id !== req.user.id) {
      return res.status(403).json({
        error: "Puoi eliminare solo le tue poesie."
      });
    }

    db.prepare(`
      DELETE FROM poems
      WHERE id=?
    `).run(req.params.id);

    res.json({
      ok: true,
      message: "Poesia eliminata."
    });

  } catch (e) {
    next(e);
  }
});

/* =========================
   LIKE / SAVE / FAVORITE
========================= */

function toggle(table, userId, poemId) {
  const p = db.prepare(`
    SELECT *
    FROM poems
    WHERE id=?
  `).get(poemId);

  if (!p || !canViewPoem(p, userId)) {
    return {
      error: "Poesia non disponibile."
    };
  }

  const exists = db.prepare(`
    SELECT 1
    FROM ${table}
    WHERE user_id=? AND poem_id=?
  `).get(userId, poemId);

  if (exists) {
    db.prepare(`
      DELETE FROM ${table}
      WHERE user_id=? AND poem_id=?
    `).run(userId, poemId);
  } else {
    db.prepare(`
      INSERT INTO ${table}(user_id,poem_id)
      VALUES(?,?)
    `).run(userId, poemId);
  }

  return {
    poem: poem(poemId, userId)
  };
}

app.post("/api/poems/:id/like", auth, (req, res) => {
  const result = toggle(
    "likes",
    req.user.id,
    req.params.id
  );

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json({
    ok: true,
    ...result
  });
});

app.post("/api/poems/:id/save", auth, (req, res) => {
  const result = toggle(
    "saves",
    req.user.id,
    req.params.id
  );

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json({
    ok: true,
    ...result
  });
});

app.post("/api/poems/:id/favorite", auth, (req, res) => {
  const result = toggle(
    "favorites",
    req.user.id,
    req.params.id
  );

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json({
    ok: true,
    ...result
  });
});

/* =========================
   LIBRARY
========================= */

app.get("/api/library", auth, (req, res, next) => {
  try {
    const savedIds = db.prepare(`
      SELECT poem_id
      FROM saves
      WHERE user_id=?
      ORDER BY rowid DESC
    `).all(req.user.id).map(x => x.poem_id);

    const favoriteIds = db.prepare(`
      SELECT poem_id
      FROM favorites
      WHERE user_id=?
      ORDER BY rowid DESC
    `).all(req.user.id).map(x => x.poem_id);

    const collections = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.created_at,
        COUNT(ci.poem_id) AS count
      FROM collections c
      LEFT JOIN collection_items ci
        ON ci.collection_id=c.id
      WHERE c.user_id=?
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all(req.user.id);

    res.json({
      saved: savedIds
        .map(id => poem(id, req.user.id))
        .filter(Boolean),

      favorites: favoriteIds
        .map(id => poem(id, req.user.id))
        .filter(Boolean),

      collections
    });

  } catch (e) {
    next(e);
  }
});

app.post("/api/collections", auth, (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        error: "Inserisci un nome per la raccolta."
      });
    }

    if (name.length > 60) {
      return res.status(400).json({
        error: "Il nome della raccolta può contenere al massimo 60 caratteri."
      });
    }

    const r = db.prepare(`
      INSERT INTO collections(user_id,name)
      VALUES(?,?)
    `).run(
      req.user.id,
      name
    );

    res.status(201).json({
      ok: true,
      collection: {
        id: r.lastInsertRowid,
        name,
        count: 0
      }
    });

  } catch (e) {
    next(e);
  }
});

app.get("/api/collections/:id", auth, (req, res, next) => {
  try {
    const collection = db.prepare(`
      SELECT id,name,created_at
      FROM collections
      WHERE id=? AND user_id=?
    `).get(
      req.params.id,
      req.user.id
    );

    if (!collection) {
      return res.status(404).json({
        error: "Raccolta non trovata."
      });
    }

    const ids = db.prepare(`
      SELECT poem_id
      FROM collection_items
      WHERE collection_id=?
      ORDER BY created_at DESC
    `).all(collection.id).map(x => x.poem_id);

    res.json({
      ...collection,
      count: ids.length,
      poems: ids
        .map(id => poem(id, req.user.id))
        .filter(Boolean)
    });

  } catch (e) {
    next(e);
  }
});

app.post(
  "/api/collections/:id/poems/:poemId",
  auth,
  (req, res, next) => {
    try {
      const collection = db.prepare(`
        SELECT id
        FROM collections
        WHERE id=? AND user_id=?
      `).get(
        req.params.id,
        req.user.id
      );

      if (!collection) {
        return res.status(404).json({
          error: "Raccolta non trovata."
        });
      }

      const p = db.prepare(`
        SELECT *
        FROM poems
        WHERE id=?
      `).get(req.params.poemId);

      if (!p || !canViewPoem(p, req.user.id)) {
        return res.status(404).json({
          error: "Poesia non disponibile."
        });
      }

      const exists = db.prepare(`
        SELECT 1
        FROM collection_items
        WHERE collection_id=? AND poem_id=?
      `).get(
        collection.id,
        p.id
      );

      if (exists) {
        return res.status(409).json({
          error: "Questa poesia è già nella raccolta."
        });
      }

      db.prepare(`
        INSERT INTO collection_items(
          collection_id,
          poem_id
        )
        VALUES(?,?)
      `).run(
        collection.id,
        p.id
      );

      res.json({
        ok: true,
        message: "Poesia aggiunta alla raccolta."
      });

    } catch (e) {
      next(e);
    }
  }
);

app.delete(
  "/api/collections/:id/poems/:poemId",
  auth,
  (req, res, next) => {
    try {
      const collection = db.prepare(`
        SELECT id
        FROM collections
        WHERE id=? AND user_id=?
      `).get(
        req.params.id,
        req.user.id
      );

      if (!collection) {
        return res.status(404).json({
          error: "Raccolta non trovata."
        });
      }

      db.prepare(`
        DELETE FROM collection_items
        WHERE collection_id=? AND poem_id=?
      `).run(
        collection.id,
        req.params.poemId
      );

      res.json({
        ok: true,
        message: "Poesia rimossa dalla raccolta."
      });

    } catch (e) {
      next(e);
    }
  }
);

app.delete("/api/collections/:id", auth, (req, res, next) => {
  try {
    const collection = db.prepare(`
      SELECT id
      FROM collections
      WHERE id=? AND user_id=?
    `).get(
      req.params.id,
      req.user.id
    );

    if (!collection) {
      return res.status(404).json({
        error: "Raccolta non trovata."
      });
    }

    db.prepare(`
      DELETE FROM collections
      WHERE id=?
    `).run(collection.id);

    res.json({
      ok: true,
      message: "Raccolta eliminata."
    });

  } catch (e) {
    next(e);
  }
});

/* =========================
   FOLLOWS
========================= */

app.post("/api/users/:id/follow", auth, (req, res) => {
  const target = Number(req.params.id);

  if (!Number.isInteger(target)) {
    return res.status(400).json({
      error: "Utente non valido."
    });
  }

  if (target === req.user.id) {
    return res.status(400).json({
      error: "Non puoi seguire te stesso."
    });
  }

  if (!publicUser(target)) {
    return res.status(404).json({
      error: "Utente non trovato."
    });
  }

  const exists = isFollowing(
    req.user.id,
    target
  );

  if (exists) {
    db.prepare(`
      DELETE FROM follows
      WHERE follower_id=? AND following_id=?
    `).run(
      req.user.id,
      target
    );
  } else {
    db.prepare(`
      INSERT INTO follows(
        follower_id,
        following_id
      )
      VALUES(?,?)
    `).run(
      req.user.id,
      target
    );

    db.prepare(`
      INSERT INTO notifications(
        user_id,
        actor_id,
        type
      )
      VALUES(?,?,?)
    `).run(
      target,
      req.user.id,
      "follow"
    );
  }

  res.json({
    ok: true,
    following: !exists
  });
});

/* =========================
   COMMENTS
========================= */

app.get("/api/poems/:id/comments", auth, (req, res) => {
  if (!poem(req.params.id, req.user.id)) {
    return res.status(404).json({
      error: "Poesia non disponibile."
    });
  }

  res.json(
    db.prepare(`
      SELECT
        c.id,
        c.body,
        c.created_at,
        u.username,
        u.display_name
      FROM comments c
      JOIN users u ON u.id=c.user_id
      WHERE c.poem_id=?
      ORDER BY c.created_at ASC
    `).all(req.params.id)
  );
});

app.post("/api/poems/:id/comments", auth, (req, res, next) => {
  try {
    const p = db.prepare(`
      SELECT *
      FROM poems
      WHERE id=?
    `).get(req.params.id);

    if (!p || !canViewPoem(p, req.user.id)) {
      return res.status(404).json({
        error: "Poesia non disponibile."
      });
    }

    const body = String(
      req.body.body || ""
    ).trim();

    if (!body) {
      return res.status(400).json({
        error: "Scrivi un commento prima di inviare."
      });
    }

    if (body.length > 1000) {
      return res.status(400).json({
        error: "Il commento è troppo lungo."
      });
    }

    const r = db.prepare(`
      INSERT INTO comments(
        user_id,
        poem_id,
        body
      )
      VALUES(?,?,?)
    `).run(
      req.user.id,
      req.params.id,
      body
    );

    if (p.user_id !== req.user.id) {
      db.prepare(`
        INSERT INTO notifications(
          user_id,
          actor_id,
          type,
          poem_id
        )
        VALUES(?,?,?,?)
      `).run(
        p.user_id,
        req.user.id,
        "comment",
        req.params.id
      );
    }

    res.status(201).json({
      ok: true,
      comment: db.prepare(`
        SELECT
          c.id,
          c.body,
          c.created_at,
          u.username,
          u.display_name
        FROM comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.id=?
      `).get(r.lastInsertRowid)
    });

  } catch (e) {
    next(e);
  }
});

/* =========================
   NOTIFICATIONS
========================= */

app.get("/api/notifications", auth, (req, res) => {
  res.json(
    db.prepare(`
      SELECT
        n.*,
        u.username,
        u.display_name
      FROM notifications n
      LEFT JOIN users u ON u.id=n.actor_id
      WHERE n.user_id=?
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all(req.user.id)
  );
});

app.post("/api/notifications/read", auth, (req, res) => {
  db.prepare(`
    UPDATE notifications
    SET read=1
    WHERE user_id=?
  `).run(req.user.id);

  res.json({
    ok: true
  });
});

/* =========================
   PUBLIC PROFILES
========================= */

app.get("/api/users/:username", auth, (req, res) => {
  const username = normalizeUsername(
    req.params.username
  );

  const u = db.prepare(`
    SELECT id
    FROM users
    WHERE username=?
  `).get(username);

  if (!u) {
    return res.status(404).json({
      error: "Utente non trovato."
    });
  }

  res.json(
    profilePayload(
      u.id,
      req.user.id
    )
  );
});

app.get("/api/profile", auth, (req, res) => {
  res.json(
    profilePayload(
      req.user.id,
      req.user.id
    )
  );
});

/* =========================
   ERROR / START
========================= */

app.use("/api", (err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Abbiamo avuto un problema temporaneo. Riprova tra poco."
  });
});

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(
  PORT,
  "0.0.0.0",
  () => console.log(
    `VERSI avviato sulla porta ${PORT}`
  )
);