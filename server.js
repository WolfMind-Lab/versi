import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createHash, randomBytes } from "crypto";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 10000);
const SECRET = process.env.JWT_SECRET;
const APP_URL = String(process.env.APP_URL || "https://versi-yzot.onrender.com").replace(/\/$/, "");
const mailConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = mailConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || "true") === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL non configurata.");
  process.exit(1);
}
if (!SECRET) {
  console.error("JWT_SECRET non configurata.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});


function tokenHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[ch]));
}

async function sendMail({ to, subject, text, html }) {
  if (!mailer) throw new Error("Servizio email non configurato.");
  return mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, text, html
  });
}

function verificationMessage(displayName, url) {
  return {
    subject: "Conferma la tua email — VERSI",
    text: `Ciao ${displayName},\n\nconferma il tuo indirizzo email per VERSI aprendo questo link:\n${url}\n\nIl link è valido 24 ore.\n\nSe non hai creato tu questo account, puoi ignorare questa email.`,
    html: `<p>Ciao ${escapeHTML(displayName)},</p><p>conferma il tuo indirizzo email per VERSI cliccando qui:</p><p><a href="${url}">Conferma email</a></p><p>Il link è valido 24 ore.</p><p>Se non hai creato tu questo account, puoi ignorare questa email.</p>`
  };
}

function resetMessage(displayName, url) {
  return {
    subject: "Reimposta la password — VERSI",
    text: `Ciao ${displayName},\n\nper reimpostare la password di VERSI apri questo link:\n${url}\n\nIl link è valido 30 minuti.\n\nSe non hai richiesto tu questa operazione, puoi ignorare questa email.`,
    html: `<p>Ciao ${escapeHTML(displayName)},</p><p>per reimpostare la password di VERSI clicca qui:</p><p><a href="${url}">Reimposta password</a></p><p>Il link è valido 30 minuti.</p><p>Se non hai richiesto tu questa operazione, puoi ignorare questa email.</p>`
  };
}

async function query(text, params = []) {
  return pool.query(text, params);
}
async function one(text, params = []) {
  const r = await query(text, params);
  return r.rows[0] || null;
}
async function many(text, params = []) {
  const r = await query(text, params);
  return r.rows;
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MOODS = new Set(["Amore","Nostalgia","Solitudine","Rinascita","Felicità","Dolore","Libertà"]);
const VISIBILITIES = new Set(["public","followers","private"]);

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('writer','reader')),
      bio TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS poems(
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      mood TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public'
        CHECK(visibility IN ('public','followers','private')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS likes(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, poem_id)
    );

    CREATE TABLE IF NOT EXISTS saves(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, poem_id)
    );

    CREATE TABLE IF NOT EXISTS favorites(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, poem_id)
    );

    CREATE TABLE IF NOT EXISTS collections(
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS collection_items(
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(collection_id, poem_id)
    );

    CREATE TABLE IF NOT EXISTS follows(
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS comments(
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications(
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      poem_id INTEGER REFERENCES poems(id) ON DELETE CASCADE,
      read INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_poems_created ON poems(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_poems_user ON poems(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_poem ON comments(poem_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id, created_at DESC);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token_hash);
    CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token_hash);
  `);
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
async function publicUser(id) {
  return one(`
    SELECT id, username, display_name, role, bio, email_verified, created_at
    FROM users WHERE id=$1
  `,[id]);
}
function auth(req,res,next) {
  const raw=String(req.headers.authorization||"");
  const value=raw.startsWith("Bearer ")?raw.slice(7):"";
  if(!value) return res.status(401).json({error:"Accedi per continuare."});
  try { req.user=jwt.verify(value,SECRET); next(); }
  catch { return res.status(401).json({error:"La sessione è scaduta. Accedi di nuovo."}); }
}
async function isFollowing(followerId, followingId) {
  return !!await one(`SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2`,[followerId,followingId]);
}
async function canViewPoem(p,viewerId) {
  if(!p) return false;
  if(p.visibility==="public" || Number(p.user_id)===Number(viewerId)) return true;
  return p.visibility==="followers" && await isFollowing(viewerId,p.user_id);
}
async function poem(id,viewerId=0) {
  const p=await one(`
    SELECT p.*,u.username,u.display_name,u.role,
      (SELECT COUNT(*) FROM likes WHERE poem_id=p.id)::int AS likes,
      (SELECT COUNT(*) FROM saves WHERE poem_id=p.id)::int AS saves,
      (SELECT COUNT(*) FROM comments WHERE poem_id=p.id)::int AS comments
    FROM poems p JOIN users u ON u.id=p.user_id WHERE p.id=$1
  `,[id]);
  if(!p || !(await canViewPoem(p,viewerId))) return null;
  const [liked,saved,favorited,following]=await Promise.all([
    one(`SELECT 1 FROM likes WHERE user_id=$1 AND poem_id=$2`,[viewerId,id]),
    one(`SELECT 1 FROM saves WHERE user_id=$1 AND poem_id=$2`,[viewerId,id]),
    one(`SELECT 1 FROM favorites WHERE user_id=$1 AND poem_id=$2`,[viewerId,id]),
    isFollowing(viewerId,p.user_id)
  ]);
  return {...p,liked:!!liked,saved:!!saved,favorited:!!favorited,following};
}
async function userStats(userId) {
  const [poems,followers,following,likes]=await Promise.all([
    one(`SELECT COUNT(*)::int AS n FROM poems WHERE user_id=$1`,[userId]),
    one(`SELECT COUNT(*)::int AS n FROM follows WHERE following_id=$1`,[userId]),
    one(`SELECT COUNT(*)::int AS n FROM follows WHERE follower_id=$1`,[userId]),
    one(`SELECT COUNT(*)::int AS n FROM likes l JOIN poems p ON p.id=l.poem_id WHERE p.user_id=$1`,[userId])
  ]);
  return {poems:poems.n,followers:followers.n,following:following.n,likes:likes.n};
}
async function profilePayload(userId,viewerId) {
  const user=await publicUser(userId);
  if(!user) return null;
  const own=Number(userId)===Number(viewerId);
  const rows=await many(
    own
      ? `SELECT id FROM poems WHERE user_id=$1 ORDER BY created_at DESC`
      : `SELECT id FROM poems WHERE user_id=$1 AND visibility='public' ORDER BY created_at DESC`,
    [userId]
  );
  const poems=(await Promise.all(rows.map(x=>poem(x.id,viewerId)))).filter(Boolean);
  return {...user,...await userStats(userId),followed:await isFollowing(viewerId,userId),poems};
}

app.post("/api/register",async(req,res,next)=>{
  try {
    const displayName=String(req.body.displayName||"").trim();
    const username=normalizeUsername(req.body.username);
    const email=normalizeEmail(req.body.email);
    const password=String(req.body.password||"");
    const passwordConfirm=String(req.body.passwordConfirm||"");
    const role=req.body.role;
    if(!displayName) return res.status(400).json({error:"Inserisci il nome visualizzato."});
    if(!/^[a-z0-9._-]{3,24}$/.test(username)) return res.status(400).json({error:"Lo username deve contenere 3-24 caratteri: lettere, numeri, punto, trattino o underscore."});
    if(!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:"Inserisci un indirizzo email valido."});
    if(password.length<8) return res.status(400).json({error:"La password deve avere almeno 8 caratteri."});
    if(password!==passwordConfirm) return res.status(400).json({error:"Le password non coincidono."});
    if(!["writer","reader"].includes(role)) return res.status(400).json({error:"Scegli se vuoi essere Scrittore o Lettore."});
    if(await one(`SELECT 1 FROM users WHERE username=$1`,[username])) return res.status(409).json({error:"Questo username è già utilizzato."});
    if(await one(`SELECT 1 FROM users WHERE email=$1`,[email])) return res.status(409).json({error:"Questa email è già associata a un account."});
    const hash=await bcrypt.hash(password,12);
    const verificationToken=randomBytes(32).toString("hex");
    const verificationHash=tokenHash(verificationToken);
    const created=await one(`INSERT INTO users(username,email,password_hash,display_name,role,verification_token_hash,verification_token_expires_at) VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '24 hours') RETURNING id`,[username,email,hash,displayName,role,verificationHash]);
    const user=await publicUser(created.id);
    const verifyUrl=`${APP_URL}/?verify=${verificationToken}`;
    let emailVerificationSent=false;
    if(mailer) {
      try {
        const mail=verificationMessage(displayName,verifyUrl);
        await sendMail({to:email,...mail});
        emailVerificationSent=true;
      } catch(emailError) {
        console.error("Invio verifica email fallito:",emailError);
      }
    }
    const token=jwt.sign({id:user.id,username:user.username},SECRET,{expiresIn:"30d"});
    res.status(201).json({ok:true,token,user,emailVerificationSent});
  } catch(e){next(e);}
});

app.post("/api/login",async(req,res)=>{
  const identifier=String(req.body.identifier||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  if(!identifier||!password) return res.status(400).json({error:"Inserisci email/username e password."});
  const user=await one(`SELECT * FROM users WHERE email=$1 OR username=$2`,[identifier,identifier]);
  if(!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Email/username o password non corretti."});
  const token=jwt.sign({id:user.id,username:user.username},SECRET,{expiresIn:"30d"});
  res.json({ok:true,token,user:await publicUser(user.id)});
});

app.post("/api/auth/forgot-password",async(req,res)=>{
  const email=normalizeEmail(req.body.email);
  const generic={ok:true,message:"Se l'email è associata a un account, riceverai un link per reimpostare la password."};
  if(!/^\S+@\S+\.\S+$/.test(email)) return res.json(generic);
  try {
    const user=await one(`SELECT id,display_name,email FROM users WHERE email=$1`,[email]);
    if(!user || !mailer) return res.json(generic);
    const resetToken=randomBytes(32).toString("hex");
    await query(`UPDATE users SET reset_token_hash=$1,reset_token_expires_at=NOW()+INTERVAL '30 minutes' WHERE id=$2`,[tokenHash(resetToken),user.id]);
    const resetUrl=`${APP_URL}/?reset=${resetToken}`;
    await sendMail({to:user.email,...resetMessage(user.display_name,resetUrl)});
    res.json(generic);
  } catch(e) { console.error("Forgot password:",e); res.json(generic); }
});

app.post("/api/auth/reset-password",async(req,res,next)=>{
  try {
    const resetToken=String(req.body.token||"").trim();
    const password=String(req.body.password||"");
    const passwordConfirm=String(req.body.passwordConfirm||"");
    if(!resetToken) return res.status(400).json({error:"Link di recupero non valido."});
    if(password.length<8) return res.status(400).json({error:"La password deve avere almeno 8 caratteri."});
    if(password!==passwordConfirm) return res.status(400).json({error:"Le password non coincidono."});
    const user=await one(`SELECT id FROM users WHERE reset_token_hash=$1 AND reset_token_expires_at>NOW()`,[tokenHash(resetToken)]);
    if(!user) return res.status(400).json({error:"Il link di recupero non è valido o è scaduto."});
    const hash=await bcrypt.hash(password,12);
    await query(`UPDATE users SET password_hash=$1,reset_token_hash=NULL,reset_token_expires_at=NULL WHERE id=$2`,[hash,user.id]);
    res.json({ok:true,message:"Password aggiornata. Ora puoi accedere a VERSI."});
  } catch(e){next(e);}
});

app.get("/api/auth/verify-email",async(req,res,next)=>{
  try {
    const verificationToken=String(req.query.token||"").trim();
    if(!verificationToken) return res.status(400).json({error:"Token di verifica non valido."});
    const user=await one(`SELECT id FROM users WHERE verification_token_hash=$1 AND verification_token_expires_at>NOW()`,[tokenHash(verificationToken)]);
    if(!user) return res.status(400).json({error:"Il link di verifica non è valido o è scaduto."});
    await query(`UPDATE users SET email_verified=TRUE,verification_token_hash=NULL,verification_token_expires_at=NULL WHERE id=$1`,[user.id]);
    res.json({ok:true,message:"Email verificata. Grazie per aver confermato il tuo indirizzo email."});
  } catch(e){next(e);}
});

app.post("/api/auth/resend-verification",auth,async(req,res,next)=>{
  try {
    const user=await one(`SELECT id,email,display_name,email_verified FROM users WHERE id=$1`,[req.user.id]);
    if(!user) return res.status(404).json({error:"Account non trovato."});
    if(user.email_verified) return res.json({ok:true,message:"La tua email è già verificata."});
    if(!mailer) return res.status(503).json({error:"Servizio email non configurato."});
    const verificationToken=randomBytes(32).toString("hex");
    await query(`UPDATE users SET verification_token_hash=$1,verification_token_expires_at=NOW()+INTERVAL '24 hours' WHERE id=$2`,[tokenHash(verificationToken),user.id]);
    const verifyUrl=`${APP_URL}/?verify=${verificationToken}`;
    await sendMail({to:user.email,...verificationMessage(user.display_name,verifyUrl)});
    res.json({ok:true,message:"Nuova email di verifica inviata."});
  } catch(e){next(e);}
});

app.get("/api/me",auth,async(req,res)=>{
  const user=await publicUser(req.user.id);
  if(!user) return res.status(401).json({error:"Account non trovato."});
  res.json({...user,stats:await userStats(user.id)});
});

app.patch("/api/me",auth,async(req,res,next)=>{
  try {
    const current=await publicUser(req.user.id);
    if(!current) return res.status(404).json({error:"Account non trovato."});
    const displayName=String(req.body.displayName??current.display_name).trim();
    const bio=String(req.body.bio??current.bio??"").trim();
    const username=normalizeUsername(req.body.username??current.username);
    if(!displayName) return res.status(400).json({error:"Il nome visualizzato non può essere vuoto."});
    if(!/^[a-z0-9._-]{3,24}$/.test(username)) return res.status(400).json({error:"Username non valido. Usa 3-24 caratteri: lettere, numeri, punto, trattino o underscore."});
    if(bio.length>300) return res.status(400).json({error:"La bio può contenere al massimo 300 caratteri."});
    if(await one(`SELECT id FROM users WHERE username=$1 AND id<>$2`,[username,req.user.id])) return res.status(409).json({error:"Questo username è già utilizzato."});
    await query(`UPDATE users SET display_name=$1,username=$2,bio=$3 WHERE id=$4`,[displayName,username,bio,req.user.id]);
    const user=await publicUser(req.user.id);
    res.json({ok:true,user:{...user,stats:await userStats(user.id)}});
  } catch(e){next(e);}
});

app.get("/api/poems",auth,async(req,res,next)=>{
  try {
    const mood=String(req.query.mood||"");
    const q=String(req.query.q||"").trim();
    if(mood&&!MOODS.has(mood)) return res.status(400).json({error:"Emozione non valida."});
    const ids=await many(`
      SELECT p.id FROM poems p JOIN users u ON u.id=p.user_id
      WHERE (
        p.visibility='public' OR p.user_id=$1 OR
        (p.visibility='followers' AND EXISTS(
          SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id
        ))
      )
      AND ($3='' OR p.mood=$3)
      AND ($4='' OR lower(p.title||' '||p.body||' '||u.display_name||' '||u.username) LIKE lower($5))
      ORDER BY p.created_at DESC LIMIT 100
    `,[req.user.id,req.user.id,mood,q,`%${q}%`]);
    res.json((await Promise.all(ids.map(x=>poem(x.id,req.user.id)))).filter(Boolean));
  } catch(e){next(e);}
});

app.post("/api/poems",auth,async(req,res,next)=>{
  try {
    const user=await publicUser(req.user.id);
    if(!user) return res.status(401).json({error:"Account non trovato."});
    if(user.role!=="writer") return res.status(403).json({error:"Solo gli Scrittori possono pubblicare poesie."});
    const title=String(req.body.title||"").trim(), body=String(req.body.body||"").trim();
    const mood=String(req.body.mood||"").trim(), visibility=String(req.body.visibility||"public");
    if(!title) return res.status(400).json({error:"Inserisci un titolo."});
    if(!body) return res.status(400).json({error:"Scrivi il testo della poesia."});
    if(title.length>120) return res.status(400).json({error:"Il titolo è troppo lungo."});
    if(body.length>12000) return res.status(400).json({error:"La poesia è troppo lunga."});
    if(!MOODS.has(mood)) return res.status(400).json({error:"Scegli un'emozione."});
    if(!VISIBILITIES.has(visibility)) return res.status(400).json({error:"Scegli una visibilità valida."});
    const created=await one(`INSERT INTO poems(user_id,title,body,mood,visibility) VALUES($1,$2,$3,$4,$5) RETURNING id`,[req.user.id,title,body,mood,visibility]);
    res.status(201).json({ok:true,message:"Poesia pubblicata.",poem:await poem(created.id,req.user.id)});
  } catch(e){next(e);}
});

app.get("/api/poems/:id",auth,async(req,res)=>{
  const p=await poem(req.params.id,req.user.id);
  if(!p) return res.status(404).json({error:"Poesia non trovata o non disponibile."});
  res.json(p);
});

app.delete("/api/poems/:id",auth,async(req,res,next)=>{
  try {
    const p=await one(`SELECT * FROM poems WHERE id=$1`,[req.params.id]);
    if(!p) return res.status(404).json({error:"Poesia non trovata."});
    if(Number(p.user_id)!==Number(req.user.id)) return res.status(403).json({error:"Puoi eliminare solo le tue poesie."});
    await query(`DELETE FROM poems WHERE id=$1`,[req.params.id]);
    res.json({ok:true,message:"Poesia eliminata."});
  } catch(e){next(e);}
});

async function toggle(table,userId,poemId) {
  const allowed=["likes","saves","favorites"];
  if(!allowed.includes(table)) return {error:"Operazione non valida."};
  const p=await one(`SELECT * FROM poems WHERE id=$1`,[poemId]);
  if(!p || !(await canViewPoem(p,userId))) return {error:"Poesia non disponibile."};
  const exists=await one(`SELECT 1 FROM ${table} WHERE user_id=$1 AND poem_id=$2`,[userId,poemId]);
  if(exists) await query(`DELETE FROM ${table} WHERE user_id=$1 AND poem_id=$2`,[userId,poemId]);
  else await query(`INSERT INTO ${table}(user_id,poem_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[userId,poemId]);
  return {poem:await poem(poemId,userId)};
}
for(const [route,table] of [["like","likes"],["save","saves"],["favorite","favorites"]]){
  app.post(`/api/poems/:id/${route}`,auth,async(req,res,next)=>{
    try {
      const result=await toggle(table,req.user.id,req.params.id);
      if(result.error) return res.status(404).json(result);
      res.json({ok:true,...result});
    } catch(e){next(e);}
  });
}

app.get("/api/library",auth,async(req,res,next)=>{
  try {
    const saved=await many(`SELECT poem_id FROM saves WHERE user_id=$1 ORDER BY poem_id DESC`,[req.user.id]);
    const favorites=await many(`SELECT poem_id FROM favorites WHERE user_id=$1 ORDER BY poem_id DESC`,[req.user.id]);
    const collections=await many(`
      SELECT c.id,c.name,c.created_at,COUNT(ci.poem_id)::int AS count
      FROM collections c LEFT JOIN collection_items ci ON ci.collection_id=c.id
      WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC
    `,[req.user.id]);
    res.json({
      saved:(await Promise.all(saved.map(x=>poem(x.poem_id,req.user.id)))).filter(Boolean),
      favorites:(await Promise.all(favorites.map(x=>poem(x.poem_id,req.user.id)))).filter(Boolean),
      collections
    });
  }catch(e){next(e);}
});

app.post("/api/collections",auth,async(req,res,next)=>{
  try {
    const name=String(req.body.name||"").trim();
    if(!name) return res.status(400).json({error:"Inserisci un nome per la raccolta."});
    if(name.length>60) return res.status(400).json({error:"Il nome della raccolta può contenere al massimo 60 caratteri."});
    const c=await one(`INSERT INTO collections(user_id,name) VALUES($1,$2) RETURNING id,created_at`,[req.user.id,name]);
    res.status(201).json({ok:true,collection:{id:c.id,name,count:0,created_at:c.created_at}});
  }catch(e){next(e);}
});

app.get("/api/collections/:id",auth,async(req,res,next)=>{
  try {
    const c=await one(`SELECT id,name,created_at FROM collections WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
    if(!c) return res.status(404).json({error:"Raccolta non trovata."});
    const ids=await many(`SELECT poem_id FROM collection_items WHERE collection_id=$1 ORDER BY created_at DESC`,[c.id]);
    res.json({...c,count:ids.length,poems:(await Promise.all(ids.map(x=>poem(x.poem_id,req.user.id)))).filter(Boolean)});
  }catch(e){next(e);}
});

app.post("/api/collections/:id/poems/:poemId",auth,async(req,res,next)=>{
  try {
    const c=await one(`SELECT id FROM collections WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
    if(!c) return res.status(404).json({error:"Raccolta non trovata."});
    const p=await one(`SELECT * FROM poems WHERE id=$1`,[req.params.poemId]);
    if(!p || !(await canViewPoem(p,req.user.id))) return res.status(404).json({error:"Poesia non disponibile."});
    if(await one(`SELECT 1 FROM collection_items WHERE collection_id=$1 AND poem_id=$2`,[c.id,p.id])) return res.status(409).json({error:"Questa poesia è già nella raccolta."});
    await query(`INSERT INTO collection_items(collection_id,poem_id) VALUES($1,$2)`,[c.id,p.id]);
    res.json({ok:true,message:"Poesia aggiunta alla raccolta."});
  }catch(e){next(e);}
});

app.delete("/api/collections/:id/poems/:poemId",auth,async(req,res,next)=>{
  try {
    const c=await one(`SELECT id FROM collections WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
    if(!c) return res.status(404).json({error:"Raccolta non trovata."});
    await query(`DELETE FROM collection_items WHERE collection_id=$1 AND poem_id=$2`,[c.id,req.params.poemId]);
    res.json({ok:true,message:"Poesia rimossa dalla raccolta."});
  }catch(e){next(e);}
});

app.delete("/api/collections/:id",auth,async(req,res,next)=>{
  try {
    const c=await one(`SELECT id FROM collections WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
    if(!c) return res.status(404).json({error:"Raccolta non trovata."});
    await query(`DELETE FROM collections WHERE id=$1`,[c.id]);
    res.json({ok:true,message:"Raccolta eliminata."});
  }catch(e){next(e);}
});

app.post("/api/users/:id/follow",auth,async(req,res,next)=>{
  try {
    const target=Number(req.params.id);
    if(!Number.isInteger(target)) return res.status(400).json({error:"Utente non valido."});
    if(target===req.user.id) return res.status(400).json({error:"Non puoi seguire te stesso."});
    if(!await publicUser(target)) return res.status(404).json({error:"Utente non trovato."});
    const exists=await isFollowing(req.user.id,target);
    if(exists) {
      await query(`DELETE FROM follows WHERE follower_id=$1 AND following_id=$2`,[req.user.id,target]);
    } else {
      await query(`INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.user.id,target]);
      await query(`INSERT INTO notifications(user_id,actor_id,type) VALUES($1,$2,$3)`,[target,req.user.id,"follow"]);
    }
    res.json({ok:true,following:!exists});
  }catch(e){next(e);}
});

app.get("/api/poems/:id/comments",auth,async(req,res,next)=>{
  try {
    if(!await poem(req.params.id,req.user.id)) return res.status(404).json({error:"Poesia non disponibile."});
    res.json(await many(`
      SELECT c.id,c.body,c.created_at,u.username,u.display_name
      FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.poem_id=$1 ORDER BY c.created_at ASC
    `,[req.params.id]));
  }catch(e){next(e);}
});

app.post("/api/poems/:id/comments",auth,async(req,res,next)=>{
  try {
    const p=await one(`SELECT * FROM poems WHERE id=$1`,[req.params.id]);
    if(!p || !(await canViewPoem(p,req.user.id))) return res.status(404).json({error:"Poesia non disponibile."});
    const body=String(req.body.body||"").trim();
    if(!body) return res.status(400).json({error:"Scrivi un commento prima di inviare."});
    if(body.length>1000) return res.status(400).json({error:"Il commento è troppo lungo."});
    const c=await one(`INSERT INTO comments(user_id,poem_id,body) VALUES($1,$2,$3) RETURNING id`,[req.user.id,req.params.id,body]);
    if(Number(p.user_id)!==Number(req.user.id)) await query(`INSERT INTO notifications(user_id,actor_id,type,poem_id) VALUES($1,$2,$3,$4)`,[p.user_id,req.user.id,"comment",req.params.id]);
    const comment=await one(`
      SELECT c.id,c.body,c.created_at,u.username,u.display_name
      FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=$1
    `,[c.id]);
    res.status(201).json({ok:true,comment});
  }catch(e){next(e);}
});

app.get("/api/notifications",auth,async(req,res,next)=>{
  try {
    res.json(await many(`
      SELECT n.*,u.username,u.display_name
      FROM notifications n LEFT JOIN users u ON u.id=n.actor_id
      WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 50
    `,[req.user.id]));
  }catch(e){next(e);}
});

app.post("/api/notifications/read",auth,async(req,res,next)=>{
  try { await query(`UPDATE notifications SET read=1 WHERE user_id=$1`,[req.user.id]); res.json({ok:true}); }
  catch(e){next(e);}
});

app.get("/api/users/:username",auth,async(req,res)=>{
  const username=normalizeUsername(req.params.username);
  const user=await one(`SELECT id FROM users WHERE username=$1`,[username]);
  if(!user) return res.status(404).json({error:"Utente non trovato."});
  res.json(await profilePayload(user.id,req.user.id));
});

app.get("/api/profile",auth,async(req,res)=>{
  res.json(await profilePayload(req.user.id,req.user.id));
});

app.get("/api/health",async(req,res)=>{
  try {
    const r=await one(`SELECT NOW() AS now`);
    res.json({ok:true,database:"postgresql",time:r.now});
  }catch(e){res.status(503).json({ok:false,database:"unavailable"});}
});

app.use("/api",(error,req,res,next)=>{
  console.error(error);
  res.status(500).json({error:"Abbiamo avuto un problema temporaneo. Riprova tra poco."});
});

app.get("/{*splat}",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

async function start(){
  try {
    await initDb();
    await query("SELECT 1");
    app.listen(PORT,"0.0.0.0",()=>console.log(`VERSI avviato sulla porta ${PORT} — PostgreSQL/Neon connesso.`));
  } catch(error) {
    console.error("Avvio VERSI fallito:",error);
    process.exit(1);
  }
}
start();
