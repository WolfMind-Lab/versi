import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const db=new Database(path.join(__dirname,"versi.db"));
const SECRET=process.env.JWT_SECRET||"cambia-questa-chiave-in-produzione";

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

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
 visibility TEXT DEFAULT 'public',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS likes(
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,poem_id)
);
CREATE TABLE IF NOT EXISTS saves(
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,poem_id)
);
CREATE TABLE IF NOT EXISTS follows(
 follower_id INTEGER NOT NULL,
 following_id INTEGER NOT NULL,
 PRIMARY KEY(follower_id,following_id)
);
CREATE TABLE IF NOT EXISTS comments(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 poem_id INTEGER NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 actor_id INTEGER,
 type TEXT NOT NULL,
 poem_id INTEGER,
 read INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function auth(req,res,next){
 const h=req.headers.authorization||"";
 try{req.user=jwt.verify(h.replace("Bearer ",""),SECRET);next()}
 catch{res.status(401).json({error:"Autenticazione richiesta"})}
}
function publicUser(id){
 return db.prepare("SELECT id,username,display_name,role,bio,created_at FROM users WHERE id=?").get(id);
}
function poem(id,viewer=0){
 const p=db.prepare(`
 SELECT p.*,u.username,u.display_name,u.role,
 (SELECT COUNT(*) FROM likes WHERE poem_id=p.id) likes,
 (SELECT COUNT(*) FROM saves WHERE poem_id=p.id) saves,
 (SELECT COUNT(*) FROM comments WHERE poem_id=p.id) comments
 FROM poems p JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(id);
 if(!p)return null;
 p.liked=!!db.prepare("SELECT 1 FROM likes WHERE user_id=? AND poem_id=?").get(viewer,id);
 p.saved=!!db.prepare("SELECT 1 FROM saves WHERE user_id=? AND poem_id=?").get(viewer,id);
 p.following=!!db.prepare("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?").get(viewer,p.user_id);
 return p;
}

app.post("/api/register",(req,res)=>{
 const {username,email,password,displayName,role}=req.body;
 if(!username||!email||!password||!displayName||!["writer","reader"].includes(role))
   return res.status(400).json({error:"Dati di registrazione incompleti"});
 if(password.length<8)return res.status(400).json({error:"La password deve avere almeno 8 caratteri"});
 try{
   const hash=bcrypt.hashSync(password,12);
   const r=db.prepare("INSERT INTO users(username,email,password,display_name,role) VALUES(?,?,?,?,?)")
    .run(username.trim().toLowerCase(),email.trim().toLowerCase(),hash,displayName.trim(),role);
   const token=jwt.sign({id:r.lastInsertRowid,username},SECRET,{expiresIn:"7d"});
   res.json({token,user:publicUser(r.lastInsertRowid)});
 }catch(e){res.status(409).json({error:"Username o email già utilizzati"})}
});
app.post("/api/login",(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE email=? OR username=?").get(req.body.identifier?.trim().toLowerCase(),req.body.identifier?.trim().toLowerCase());
 if(!u||!bcrypt.compareSync(req.body.password||"",u.password))return res.status(401).json({error:"Credenziali non valide"});
 res.json({token:jwt.sign({id:u.id,username:u.username},SECRET,{expiresIn:"7d"}),user:publicUser(u.id)});
});
app.get("/api/me",auth,(req,res)=>res.json(publicUser(req.user.id)));

app.get("/api/poems",auth,(req,res)=>{
 const mood=req.query.mood||"";
 const q=req.query.q||"";
 let sql=`SELECT p.id FROM poems p JOIN users u ON u.id=p.user_id
 WHERE p.visibility='public' AND (?='' OR p.mood=?) AND
 (?='' OR lower(p.title||' '||p.body||' '||u.display_name||' '||u.username) LIKE lower(?))
 ORDER BY p.created_at DESC LIMIT 100`;
 const ids=db.prepare(sql).all(mood,mood,q,`%${q}%`).map(x=>x.id);
 res.json(ids.map(id=>poem(id,req.user.id)));
});
app.post("/api/poems",auth,(req,res)=>{
 if(req.user.id){
  const {title,body,mood,visibility="public"}=req.body;
  if(!title||!body||!mood)return res.status(400).json({error:"Titolo, testo ed emozione sono obbligatori"});
  const r=db.prepare("INSERT INTO poems(user_id,title,body,mood,visibility) VALUES(?,?,?,?,?)")
   .run(req.user.id,title.trim(),body.trim(),mood,visibility);
  return res.status(201).json(poem(r.lastInsertRowid,req.user.id));
 }
});
app.get("/api/poems/:id",auth,(req,res)=>{const p=poem(req.params.id,req.user.id);p?res.json(p):res.status(404).json({error:"Poesia non trovata"})});
app.delete("/api/poems/:id",auth,(req,res)=>{
 const p=db.prepare("SELECT * FROM poems WHERE id=?").get(req.params.id);
 if(!p||p.user_id!==req.user.id)return res.status(403).json({error:"Operazione non consentita"});
 db.prepare("DELETE FROM poems WHERE id=?").run(req.params.id);res.json({ok:true});
});
function toggle(table,userId,poemId){
 const exists=db.prepare(`SELECT 1 FROM ${table} WHERE user_id=? AND poem_id=?`).get(userId,poemId);
 if(exists)db.prepare(`DELETE FROM ${table} WHERE user_id=? AND poem_id=?`).run(userId,poemId);
 else db.prepare(`INSERT INTO ${table}(user_id,poem_id) VALUES(?,?)`).run(userId,poemId);
}
app.post("/api/poems/:id/like",auth,(req,res)=>{toggle("likes",req.user.id,req.params.id);res.json(poem(req.params.id,req.user.id))});
app.post("/api/poems/:id/save",auth,(req,res)=>{toggle("saves",req.user.id,req.params.id);res.json(poem(req.params.id,req.user.id))});
app.post("/api/users/:id/follow",auth,(req,res)=>{
 const target=Number(req.params.id);if(target===req.user.id)return res.status(400).json({error:"Non puoi seguire te stesso"});
 const e=db.prepare("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?").get(req.user.id,target);
 if(e)db.prepare("DELETE FROM follows WHERE follower_id=? AND following_id=?").run(req.user.id,target);
 else{
  db.prepare("INSERT INTO follows(follower_id,following_id) VALUES(?,?)").run(req.user.id,target);
  db.prepare("INSERT INTO notifications(user_id,actor_id,type) VALUES(?,?,?)").run(target,req.user.id,"follow");
 }
 res.json({following:!e});
});
app.get("/api/poems/:id/comments",auth,(req,res)=>res.json(db.prepare(`
 SELECT c.id,c.body,c.created_at,u.username,u.display_name FROM comments c JOIN users u ON u.id=c.user_id
 WHERE c.poem_id=? ORDER BY c.created_at ASC`).all(req.params.id)));
app.post("/api/poems/:id/comments",auth,(req,res)=>{
 const body=(req.body.body||"").trim();if(!body)return res.status(400).json({error:"Commento vuoto"});
 const p=db.prepare("SELECT user_id FROM poems WHERE id=?").get(req.params.id);
 const r=db.prepare("INSERT INTO comments(user_id,poem_id,body) VALUES(?,?,?)").run(req.user.id,req.params.id,body);
 if(p&&p.user_id!==req.user.id)db.prepare("INSERT INTO notifications(user_id,actor_id,type,poem_id) VALUES(?,?,?,?)").run(p.user_id,req.user.id,"comment",req.params.id);
 res.status(201).json(db.prepare(`SELECT c.id,c.body,c.created_at,u.username,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?`).get(r.lastInsertRowid));
});
app.get("/api/notifications",auth,(req,res)=>res.json(db.prepare(`
 SELECT n.*,u.username,u.display_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id
 WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50`).all(req.user.id)));
app.get("/api/users/:username",auth,(req,res)=>{
 const u=db.prepare("SELECT id,username,display_name,role,bio,created_at FROM users WHERE username=?").get(req.params.username);
 if(!u)return res.status(404).json({error:"Utente non trovato"});
 const poems=db.prepare("SELECT id FROM poems WHERE user_id=? AND visibility='public' ORDER BY created_at DESC").all(u.id).map(x=>poem(x.id,req.user.id));
 const followers=db.prepare("SELECT COUNT(*) n FROM follows WHERE following_id=?").get(u.id).n;
 const following=db.prepare("SELECT COUNT(*) n FROM follows WHERE follower_id=?").get(u.id).n;
 res.json({...u,followers,following,followed:!!db.prepare("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?").get(req.user.id,u.id),poems});
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("VERSI avviato su http://localhost:"+(process.env.PORT||3000)));
