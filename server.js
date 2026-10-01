import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) throw new Error("DATABASE_URL non configurata.");
if (!JWT_SECRET) throw new Error("JWT_SECRET non configurata.");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const MOODS = ["Amore","Nostalgia","Solitudine","Rinascita","Felicità","Dolore","Libertà"];
const VISIBILITIES = ["public","followers","private"];
const ROLES = ["reader","writer"];

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const q = (text, params=[]) => pool.query(text, params);
const one = async (text, params=[]) => (await q(text, params)).rows[0] || null;
const many = async (text, params=[]) => (await q(text, params)).rows;

async function initDb(){
  await q(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'reader' CHECK(role IN ('reader','writer')),
    bio TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS poems (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    mood TEXT NOT NULL CHECK(mood IN ('Amore','Nostalgia','Solitudine','Rinascita','Felicità','Dolore','Libertà')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,poem_id))`);
  await q(`CREATE TABLE IF NOT EXISTS saves (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,poem_id))`);
  await q(`CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,poem_id))`);
  await q(`CREATE TABLE IF NOT EXISTS collections (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,name))`);
  await q(`CREATE TABLE IF NOT EXISTS collection_items (collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE, poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(collection_id,poem_id))`);
  await q(`CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(follower_id,following_id), CHECK(follower_id<>following_id))`);
  await q(`CREATE TABLE IF NOT EXISTS comments (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL, type TEXT NOT NULL, poem_id INTEGER REFERENCES poems(id) ON DELETE CASCADE, comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE, message TEXT NOT NULL, read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await q("CREATE INDEX IF NOT EXISTS idx_poems_created ON poems(created_at DESC)");
  await q("CREATE INDEX IF NOT EXISTS idx_poems_user ON poems(user_id,created_at DESC)");
  await q("CREATE INDEX IF NOT EXISTS idx_comments_poem ON comments(poem_id,created_at ASC)");
  await q("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,read,created_at DESC)");
}

function cleanUsername(v){ return String(v||"").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, ""); }
function cleanEmail(v){ return String(v||"").trim().toLowerCase(); }
function tokenFor(user){ return jwt.sign({ id:user.id }, JWT_SECRET, { expiresIn:"30d" }); }
function auth(req,res,next){
  const raw = String(req.headers.authorization||"");
  if(!raw.startsWith("Bearer ")) return res.status(401).json({error:"Autenticazione richiesta."});
  try { req.user = jwt.verify(raw.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Sessione scaduta. Accedi di nuovo."}); }
}
function optionalAuth(req,_res,next){
  const raw = String(req.headers.authorization||"");
  if(raw.startsWith("Bearer ")) { try { req.user = jwt.verify(raw.slice(7), JWT_SECRET); } catch {} }
  next();
}
async function isFollowing(followerId, followingId){
  if(!followerId || !followingId) return false;
  return !!await one("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",[followerId,followingId]);
}
async function canViewPoem(poem, viewerId){
  if(poem.visibility === "public") return true;
  if(!viewerId) return false;
  if(poem.user_id === viewerId) return true;
  if(poem.visibility === "followers") return isFollowing(viewerId, poem.user_id);
  return false;
}
async function poemPayload(poemId, viewerId=0){
  const p = await one(`SELECT p.*,u.username,u.display_name,u.bio,
    (SELECT COUNT(*)::int FROM likes WHERE poem_id=p.id) AS likes_count,
    (SELECT COUNT(*)::int FROM comments WHERE poem_id=p.id) AS comments_count,
    EXISTS(SELECT 1 FROM likes WHERE poem_id=p.id AND user_id=$2) AS liked,
    EXISTS(SELECT 1 FROM saves WHERE poem_id=p.id AND user_id=$2) AS saved,
    EXISTS(SELECT 1 FROM favorites WHERE poem_id=p.id AND user_id=$2) AS favorited
    FROM poems p JOIN users u ON u.id=p.user_id WHERE p.id=$1`,[poemId,viewerId]);
  if(!p) return null;
  p.liked=!!p.liked; p.saved=!!p.saved; p.favorited=!!p.favorited;
  return p;
}
async function notify(userId, actorId, type, poemId, message, commentId=null){
  if(!userId || userId===actorId) return;
  await q(`INSERT INTO notifications(user_id,actor_id,type,poem_id,comment_id,message) VALUES($1,$2,$3,$4,$5,$6)`,[userId,actorId,type,poemId,commentId,message]);
}

app.get("/api/health", async (_req,res)=>{
  try { await q("SELECT 1"); res.json({ok:true,database:"postgresql",service:"VERSI"}); }
  catch { res.status(503).json({ok:false,database:"unavailable"}); }
});

app.post("/api/register", async (req,res,next)=>{
  try{
    const displayName=String(req.body.displayName||"").trim();
    const username=cleanUsername(req.body.username);
    const email=cleanEmail(req.body.email);
    const password=String(req.body.password||"");
    const passwordConfirm=String(req.body.passwordConfirm||"");
    const role=ROLES.includes(req.body.role)?req.body.role:"reader";
    if(displayName.length<2) return res.status(400).json({error:"Inserisci un nome valido."});
    if(username.length<3) return res.status(400).json({error:"Username non valido."});
    if(!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:"Email non valida."});
    if(password.length<8) return res.status(400).json({error:"La password deve avere almeno 8 caratteri."});
    if(password!==passwordConfirm) return res.status(400).json({error:"Le password non coincidono."});
    const exists=await one("SELECT id FROM users WHERE email=$1 OR username=$2",[email,username]);
    if(exists) return res.status(409).json({error:"Email o username già utilizzati."});
    const hash=await bcrypt.hash(password,12);
    const user=await one(`INSERT INTO users(display_name,username,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,display_name,username,email,role,bio,created_at`,[displayName,username,email,hash,role]);
    res.status(201).json({token:tokenFor(user),user});
  }catch(e){next(e)}
});

app.post("/api/login", async (req,res,next)=>{
  try{
    const login=String(req.body.login||req.body.email||req.body.username||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const user=await one("SELECT * FROM users WHERE email=$1 OR username=$1",[login]);
    if(!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Credenziali non valide."});
    const {password_hash,...safe}=user;
    res.json({token:tokenFor(user),user:safe});
  }catch(e){next(e)}
});

app.get("/api/me",auth,async(req,res,next)=>{try{const u=await one("SELECT id,display_name,username,email,role,bio,created_at FROM users WHERE id=$1",[req.user.id]); if(!u)return res.status(404).json({error:"Utente non trovato."}); res.json(u)}catch(e){next(e)}});
app.patch("/api/me",auth,async(req,res,next)=>{try{const displayName=String(req.body.displayName??"").trim();const bio=String(req.body.bio??"").trim(); if(displayName.length<2)return res.status(400).json({error:"Nome non valido."}); const u=await one("UPDATE users SET display_name=$1,bio=$2 WHERE id=$3 RETURNING id,display_name,username,email,role,bio,created_at",[displayName,bio,req.user.id]);res.json(u)}catch(e){next(e)}});

app.get("/api/poems",optionalAuth,async(req,res,next)=>{
  try{
    const viewer=req.user?.id||0; const mood=String(req.query.mood||"").trim(); const search=String(req.query.search||"").trim(); const mine=req.query.mine==="1";
    const params=[viewer]; let where=`(p.visibility='public' OR p.user_id=$1 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id)))`;
    if(mood && MOODS.includes(mood)){params.push(mood);where+=` AND p.mood=$${params.length}`;}
    if(search){params.push(`%${search}%`);where+=` AND (p.title ILIKE $${params.length} OR p.body ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`;}
    if(mine){where+=` AND p.user_id=$1`;}
    const rows=await many(`SELECT p.*,u.username,u.display_name,u.bio,(SELECT COUNT(*)::int FROM likes WHERE poem_id=p.id) likes_count,(SELECT COUNT(*)::int FROM comments WHERE poem_id=p.id) comments_count,EXISTS(SELECT 1 FROM likes WHERE poem_id=p.id AND user_id=$1) liked,EXISTS(SELECT 1 FROM saves WHERE poem_id=p.id AND user_id=$1) saved,EXISTS(SELECT 1 FROM favorites WHERE poem_id=p.id AND user_id=$1) favorited FROM poems p JOIN users u ON u.id=p.user_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 100`,params);
    res.json(rows);
  }catch(e){next(e)}
});
app.post("/api/poems",auth,async(req,res,next)=>{try{const title=String(req.body.title||"").trim();const body=String(req.body.body||"").trim();const mood=String(req.body.mood||"");const visibility=String(req.body.visibility||"public");if(!title||!body)return res.status(400).json({error:"Titolo e testo sono obbligatori."});if(!MOODS.includes(mood))return res.status(400).json({error:"Categoria non valida."});if(!VISIBILITIES.includes(visibility))return res.status(400).json({error:"Visibilità non valida."});const p=await one("INSERT INTO poems(user_id,title,body,mood,visibility) VALUES($1,$2,$3,$4,$5) RETURNING id",[req.user.id,title,body,mood,visibility]);res.status(201).json(await poemPayload(p.id,req.user.id))}catch(e){next(e)}});
app.patch("/api/poems/:id",auth,async(req,res,next)=>{try{const id=Number(req.params.id);const old=await one("SELECT * FROM poems WHERE id=$1",[id]);if(!old)return res.status(404).json({error:"Poesia non trovata."});if(old.user_id!==req.user.id)return res.status(403).json({error:"Non autorizzato."});const title=String(req.body.title??old.title).trim();const body=String(req.body.body??old.body).trim();const mood=String(req.body.mood??old.mood);const visibility=String(req.body.visibility??old.visibility);if(!title||!body||!MOODS.includes(mood)||!VISIBILITIES.includes(visibility))return res.status(400).json({error:"Dati non validi."});await q("UPDATE poems SET title=$1,body=$2,mood=$3,visibility=$4,updated_at=NOW() WHERE id=$5",[title,body,mood,visibility,id]);res.json(await poemPayload(id,req.user.id))}catch(e){next(e)}});
app.delete("/api/poems/:id",auth,async(req,res,next)=>{try{const p=await one("SELECT user_id FROM poems WHERE id=$1",[Number(req.params.id)]);if(!p)return res.status(404).json({error:"Poesia non trovata."});if(p.user_id!==req.user.id)return res.status(403).json({error:"Non autorizzato."});await q("DELETE FROM poems WHERE id=$1",[Number(req.params.id)]);res.json({ok:true})}catch(e){next(e)}});

async function toggle(table,userId,poemId){const exists=await one(`SELECT 1 FROM ${table} WHERE user_id=$1 AND poem_id=$2`,[userId,poemId]);if(exists){await q(`DELETE FROM ${table} WHERE user_id=$1 AND poem_id=$2`,[userId,poemId]);return false;}await q(`INSERT INTO ${table}(user_id,poem_id) VALUES($1,$2)`,[userId,poemId]);return true;}
async function toggleRoute(table,type,req,res,next){try{const poem=await one("SELECT * FROM poems WHERE id=$1",[Number(req.params.id)]);if(!poem)return res.status(404).json({error:"Poesia non trovata."});if(!(await canViewPoem(poem,req.user.id)))return res.status(403).json({error:"Non puoi interagire con questa poesia."});const active=await toggle(table,req.user.id,poem.id);if(active){await notify(poem.user_id,req.user.id,type,poem.id,type==="like"?"Ha messo Mi piace alla tua poesia.":type==="save"?"Ha salvato la tua poesia.":"Ha aggiunto la tua poesia ai preferiti.");}res.json({active})}catch(e){next(e)}}
app.post("/api/poems/:id/like",auth,(req,res,next)=>toggleRoute("likes","like",req,res,next));
app.post("/api/poems/:id/save",auth,(req,res,next)=>toggleRoute("saves","save",req,res,next));
app.post("/api/poems/:id/favorite",auth,(req,res,next)=>toggleRoute("favorites","favorite",req,res,next));

app.get("/api/library",auth,async(req,res,next)=>{try{const rows=await many(`SELECT p.*,u.username,u.display_name,(SELECT COUNT(*)::int FROM likes WHERE poem_id=p.id) likes_count,(SELECT COUNT(*)::int FROM comments WHERE poem_id=p.id) comments_count,true liked FROM poems p JOIN users u ON u.id=p.user_id WHERE EXISTS(SELECT 1 FROM saves s WHERE s.poem_id=p.id AND s.user_id=$1) ORDER BY p.created_at DESC`,[req.user.id]);const fav=await many(`SELECT p.*,u.username,u.display_name,(SELECT COUNT(*)::int FROM likes WHERE poem_id=p.id) likes_count,(SELECT COUNT(*)::int FROM comments WHERE poem_id=p.id) comments_count,true favorited FROM poems p JOIN users u ON u.id=p.user_id WHERE EXISTS(SELECT 1 FROM favorites f WHERE f.poem_id=p.id AND f.user_id=$1) ORDER BY p.created_at DESC`,[req.user.id]);res.json({saved:rows,favorites:fav})}catch(e){next(e)}});

app.get("/api/collections",auth,async(req,res,next)=>{try{res.json(await many(`SELECT c.*,COUNT(ci.poem_id)::int item_count FROM collections c LEFT JOIN collection_items ci ON ci.collection_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC`,[req.user.id]))}catch(e){next(e)}});
app.post("/api/collections",auth,async(req,res,next)=>{try{const name=String(req.body.name||"").trim();if(!name)return res.status(400).json({error:"Nome raccolta obbligatorio."});const c=await one("INSERT INTO collections(user_id,name) VALUES($1,$2) ON CONFLICT(user_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name",[req.user.id,name]);res.status(201).json(c)}catch(e){next(e)}});
app.post("/api/collections/:id/items",auth,async(req,res,next)=>{try{const cid=Number(req.params.id),pid=Number(req.body.poemId);const c=await one("SELECT id FROM collections WHERE id=$1 AND user_id=$2",[cid,req.user.id]);if(!c)return res.status(404).json({error:"Raccolta non trovata."});await q("INSERT INTO collection_items(collection_id,poem_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[cid,pid]);res.json({ok:true})}catch(e){next(e)}});
app.delete("/api/collections/:id/items/:poemId",auth,async(req,res,next)=>{try{await q("DELETE FROM collection_items WHERE collection_id=$1 AND poem_id=$2 AND EXISTS(SELECT 1 FROM collections WHERE id=$1 AND user_id=$3)",[Number(req.params.id),Number(req.params.poemId),req.user.id]);res.json({ok:true})}catch(e){next(e)}});
app.delete("/api/collections/:id",auth,async(req,res,next)=>{try{await q("DELETE FROM collections WHERE id=$1 AND user_id=$2",[Number(req.params.id),req.user.id]);res.json({ok:true})}catch(e){next(e)}});

app.post("/api/users/:id/follow",auth,async(req,res,next)=>{try{const target=Number(req.params.id);if(target===req.user.id)return res.status(400).json({error:"Non puoi seguire te stesso."});const u=await one("SELECT id,username FROM users WHERE id=$1",[target]);if(!u)return res.status(404).json({error:"Utente non trovato."});const exists=await one("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",[req.user.id,target]);if(exists){await q("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2",[req.user.id,target]);return res.json({following:false})}await q("INSERT INTO follows(follower_id,following_id) VALUES($1,$2)",[req.user.id,target]);await notify(target,req.user.id,"follow",null,"Ha iniziato a seguirti.");res.json({following:true})}catch(e){next(e)}});

app.get("/api/users/:username",optionalAuth,async(req,res,next)=>{try{const u=await one("SELECT id,display_name,username,bio,role,created_at FROM users WHERE username=$1",[cleanUsername(req.params.username)]);if(!u)return res.status(404).json({error:"Profilo non trovato."});const [poems,followers,following]=await Promise.all([many(`SELECT p.*,u.username,u.display_name,(SELECT COUNT(*)::int FROM likes WHERE poem_id=p.id) likes_count,(SELECT COUNT(*)::int FROM comments WHERE poem_id=p.id) comments_count,EXISTS(SELECT 1 FROM likes WHERE poem_id=p.id AND user_id=$2) liked,EXISTS(SELECT 1 FROM saves WHERE poem_id=p.id AND user_id=$2) saved FROM poems p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND (p.visibility='public' OR p.user_id=$2 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id))) ORDER BY p.created_at DESC`,[u.id,req.user?.id||0]),one("SELECT COUNT(*)::int n FROM follows WHERE following_id=$1",[u.id]),one("SELECT COUNT(*)::int n FROM follows WHERE follower_id=$1",[u.id])]);res.json({...u,following_count:following.n,followers_count:followers.n,is_following:await isFollowing(req.user?.id||0,u.id),poems})}catch(e){next(e)}});

app.get("/api/poems/:id/comments",optionalAuth,async(req,res,next)=>{try{const p=await one("SELECT * FROM poems WHERE id=$1",[Number(req.params.id)]);if(!p)return res.status(404).json({error:"Poesia non trovata."});if(!(await canViewPoem(p,req.user?.id)))return res.status(403).json({error:"Contenuto non disponibile."});res.json(await many(`SELECT c.id,c.body,c.created_at,u.id user_id,u.username,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.poem_id=$1 ORDER BY c.created_at ASC`,[p.id]))}catch(e){next(e)}});
app.post("/api/poems/:id/comments",auth,async(req,res,next)=>{try{const p=await one("SELECT * FROM poems WHERE id=$1",[Number(req.params.id)]);const body=String(req.body.body||"").trim();if(!p)return res.status(404).json({error:"Poesia non trovata."});if(!body)return res.status(400).json({error:"Il commento è vuoto."});if(!(await canViewPoem(p,req.user.id)))return res.status(403).json({error:"Non puoi commentare questa poesia."});const c=await one(`INSERT INTO comments(user_id,poem_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at`,[req.user.id,p.id,body]);await notify(p.user_id,req.user.id,"comment",p.id,"Ha commentato la tua poesia.",c.id);res.status(201).json({...c,user_id:req.user.id})}catch(e){next(e)}});

app.get("/api/notifications",auth,async(req,res,next)=>{try{res.json(await many(`SELECT n.*,u.username actor_username,u.display_name actor_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 100`,[req.user.id]))}catch(e){next(e)}});
app.post("/api/notifications/read",auth,async(req,res,next)=>{try{if(req.body.id)await q("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2",[Number(req.body.id),req.user.id]);else await q("UPDATE notifications SET read=true WHERE user_id=$1",[req.user.id]);res.json({ok:true})}catch(e){next(e)}});

app.use("/api",(err,_req,res,_next)=>{console.error(err);if(err.code==="23505")return res.status(409).json({error:"Dato già esistente."});res.status(500).json({error:"Errore interno del server."})});
app.get("/{*splat}",(_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

async function start(){try{await initDb();await q("SELECT 1");app.listen(PORT,"0.0.0.0",()=>console.log(`VERSI avviato sulla porta ${PORT} — PostgreSQL/Neon connesso.`));}catch(e){console.error("Avvio VERSI fallito:",e);process.exit(1)}}
start();
