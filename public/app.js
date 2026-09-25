const root = document.querySelector("#app");
let token = localStorage.getItem("versi_token");
let me = null;
let mood = "";
let commentPoem = null;
let isPublishing = false;
let discoverTimer = null;

const moods = ["Tutte","Amore","Nostalgia","Solitudine","Rinascita","Felicità","Dolore","Libertà"];

async function api(url, options = {}) {
  const headers = { ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try { response = await fetch(url,{...options,headers}); }
  catch { throw new Error("Connessione non disponibile. Controlla la rete e riprova."); }
  let data = {};
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) { try { data = await response.json(); } catch {} }
  if (!response.ok) throw new Error(data.error || `Richiesta non riuscita (${response.status}).`);
  return data;
}

function escapeHTML(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function toast(text, type="normal") {
  document.querySelectorAll(".toast").forEach(x=>x.remove());
  const element=document.createElement("div"); element.className=`toast ${type}`; element.textContent=text; document.body.appendChild(element);
  setTimeout(()=>element.remove(),2600);
}
function emptyState(icon,title,text,buttonText="",action="") { return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>${buttonText?`<button class="secondary" onclick="${action}">${escapeHTML(buttonText)}</button>`:""}</div>`; }
function initials(name){ return escapeHTML((String(name||"V").trim()[0]||"V").toUpperCase()); }

async function boot(){
  if(!token){ renderAuth(); return; }
  try { me=await api("/api/me"); renderApp(); await loadFeed(); }
  catch { localStorage.removeItem("versi_token"); token=null; me=null; renderAuth(); }
}

function renderAuth(){
  root.innerHTML=`<main class="auth-page"><div class="auth-card">
    <div class="logo">VERSI</div><div class="auth-mark">“</div>
    <h1>Le parole che restano.</h1><p class="auth-intro">Un luogo dedicato a chi scrive, a chi legge e a tutto ciò che le parole riescono a dire.</p>
    <div id="loginBox" class="auth-form">
      <label>Email o username<input id="identifier" autocomplete="username" placeholder="es. luna_test_2026"></label>
      <label>Password<input id="password" type="password" autocomplete="current-password" placeholder="La tua password"></label>
      <div id="loginMessage"></div>
      <button class="primary" onclick="login()">Accedi</button>
      <button class="secondary" onclick="showRegister()">Crea account</button>
    </div>
    <div id="registerBox" class="auth-form" style="display:none">
      <label>Nome visualizzato<input id="rname" maxlength="60" placeholder="Puoi usare anche uno pseudonimo"></label>
      <label>Username<input id="ruser" maxlength="24" autocomplete="username" placeholder="es. luna_test_2026"></label>
      <label>Email<input id="remail" type="email" autocomplete="email" placeholder="La tua email"></label>
      <label>Password<input id="rpass" type="password" minlength="8" autocomplete="new-password" placeholder="Almeno 8 caratteri"><small class="field-hint">Minimo 8 caratteri.</small></label>
      <div class="role-title">Come vuoi vivere VERSI?</div><div class="roles">
        <button id="rw" class="role" onclick="pickRole('writer')">✍️<strong>Scrittore</strong><small>Pubblica e condividi poesie</small></button>
        <button id="rr" class="role" onclick="pickRole('reader')">📖<strong>Lettore</strong><small>Scopri, salva e segui autori</small></button>
      </div>
      <div id="registerMessage"></div><button class="primary" onclick="register()">Crea il mio account</button><button class="secondary" onclick="showLogin()">Ho già un account</button>
    </div>
  </div></main>`;
  pickRole("reader");
}
let chosenRole="reader";
function pickRole(role){ chosenRole=role; document.getElementById("rw")?.classList.toggle("selected",role==="writer"); document.getElementById("rr")?.classList.toggle("selected",role==="reader"); }
function showAuthMessage(message,type="error",target="loginMessage"){ const box=document.getElementById(target); if(box) box.innerHTML=message?`<div class="inline-message ${type}">${escapeHTML(message)}</div>`:""; }
function showRegister(){ document.getElementById("loginBox").style.display="none"; document.getElementById("registerBox").style.display="block"; pickRole("reader"); }
function showLogin(){ document.getElementById("loginBox").style.display="block"; document.getElementById("registerBox").style.display="none"; }
async function login(){
  showAuthMessage("","error","loginMessage"); const identifier=document.getElementById("identifier").value.trim(), password=document.getElementById("password").value;
  if(!identifier||!password){ showAuthMessage("Inserisci email/username e password.","error","loginMessage"); return; }
  try{ const data=await api("/api/login",{method:"POST",body:JSON.stringify({identifier,password})}); token=data.token; localStorage.setItem("versi_token",token); me=data.user; renderApp(); await loadFeed(); }
  catch(error){ showAuthMessage(error.message,"error","loginMessage"); }
}
async function register(){
  showAuthMessage("","error","registerMessage"); const displayName=document.getElementById("rname").value.trim(), username=document.getElementById("ruser").value.trim(), email=document.getElementById("remail").value.trim(), password=document.getElementById("rpass").value;
  if(!displayName||!username||!email||!password){ showAuthMessage("Completa tutti i campi per creare l'account.","error","registerMessage"); return; }
  if(password.length<8){ showAuthMessage("La password deve avere almeno 8 caratteri.","error","registerMessage"); return; }
  try{ const data=await api("/api/register",{method:"POST",body:JSON.stringify({displayName,username,email,password,role:chosenRole})}); token=data.token; localStorage.setItem("versi_token",token); me=data.user; renderApp(); await loadFeed(); toast("Benvenuta in VERSI ✨","success"); }
  catch(error){ showAuthMessage(error.message,"error","registerMessage"); }
}

function renderApp(){
  root.innerHTML=`<div class="app-shell">
    <header class="topbar"><button class="icon-btn" onclick="go('discover')" aria-label="Cerca">⌕</button><div class="brand">VERSI</div><button class="icon-btn" onclick="go('activity')" aria-label="Attività">♡</button></header>
    <main class="app-main">
      <section id="home" class="screen active"><div class="screen-inner">
        <div class="hero"><span class="eyebrow">IL TUO SPAZIO POETICO</span><h1>Cosa senti oggi?</h1><p>Trova le parole che assomigliano a ciò che provi.</p></div>
        <div id="chips" class="chips"></div><div class="section-label"><span>Dal mondo di VERSI</span><button onclick="loadFeed()">Aggiorna</button></div><div id="feed"></div>
      </div></section>
      <section id="discover" class="screen"><div class="screen-inner"><div class="page-heading"><span class="eyebrow">ESPLORA</span><h1>Scopri</h1><p>Trova poesie e parole che parlano di te.</p></div><div class="search-box"><span>⌕</span><input id="search" oninput="scheduleDiscover()" placeholder="Cerca poesie, autori, parole..." /></div><div class="discover-title">Esplora per emozione</div><div class="mood-grid">
        <button onclick="setMood('Amore')">❤️<strong>Amore</strong><small>Parole del cuore</small></button><button onclick="setMood('Nostalgia')">🌙<strong>Nostalgia</strong><small>Ciò che manca</small></button><button onclick="setMood('Rinascita')">🌱<strong>Rinascita</strong><small>Ricominciarsi</small></button><button onclick="setMood('Solitudine')">🖤<strong>Solitudine</strong><small>Quando pesa</small></button>
      </div><div id="discoverResults"></div></div></section>
      <section id="create" class="screen"><div class="screen-inner"><div class="page-heading"><span class="eyebrow">SCRIVI</span><h1>Metti in parole ciò che senti.</h1><p>Non serve trovare la frase perfetta. Serve trovare la tua.</p></div><button class="create-card" onclick="openEditor()"><span class="create-icon">＋</span><span><strong>Nuova poesia</strong><small>Apri l'editor e inizia a scrivere</small></span><b>›</b></button><div class="challenge"><span>🎯 SFIDA DEL GIORNO</span><strong>pioggia · telefono · addio</strong><p>Tre parole. Una poesia. Il resto lo decidi tu.</p><button class="secondary" onclick="openEditor('Sfida: pioggia, telefono, addio')">Partecipa alla sfida</button></div></div></section>
      <section id="activity" class="screen"><div class="screen-inner"><div class="page-heading"><span class="eyebrow">LE TUE INTERAZIONI</span><h1>Attività</h1><p>Qui trovi ciò che succede intorno alle tue parole.</p></div><div id="activities"></div></div></section>
      <section id="profile" class="screen"><div class="screen-inner"><div id="profileHeader"></div><div id="myProfile"></div></div></section>
    </main>
    <nav class="bottom-nav"><button class="nav active" onclick="go('home')"><span>⌂</span><small>Home</small></button><button class="nav" onclick="go('discover')"><span>⌕</span><small>Scopri</small></button><button class="write-nav" onclick="openEditor()"><span>＋</span><small>Scrivi</small></button><button class="nav" onclick="go('activity')"><span>♡</span><small>Attività</small></button><button class="nav" onclick="go('profile')"><span>◯</span><small>Profilo</small></button></nav>
  </div>
  <div id="profileEditor" class="modal"><div class="sheet">
    <button class="close" onclick="closeM('profileEditor')">×</button>
    <div class="modal-heading">
      <span class="eyebrow">IL TUO PROFILO</span>
      <h2>Modifica profilo</h2>
      <p>Aggiorna le informazioni che vuoi mostrare su VERSI.</p>
    </div>
    <label class="field"><span>NOME VISUALIZZATO</span>
      <input id="profileName" maxlength="60" placeholder="Il tuo nome">
    </label>
    <label class="field"><span>USERNAME</span>
      <input id="profileUsername" maxlength="24" placeholder="il_tuo_username">
      <small class="field-hint">3-24 caratteri: lettere, numeri, punto, trattino o underscore.</small>
    </label>
    <label class="field"><span>BIO</span>
      <textarea id="profileBio" maxlength="300" rows="5" placeholder="Racconta qualcosa di te..."></textarea>
      <small class="field-hint">Massimo 300 caratteri.</small>
    </label>
    <div id="profileEditorMessage"></div>
    <button id="saveProfileBtn" class="primary publish-btn" onclick="saveProfile()">Salva modifiche</button>
  </div></div>

  <div id="editor" class="modal"><div class="sheet editor-sheet"><button class="close" onclick="closeM('editor')">×</button><div class="modal-heading"><span class="eyebrow">NUOVO TESTO</span><h2>Scrivi la tua poesia</h2><p>Lascia che le parole facciano il resto.</p></div><label class="field"><span>TITOLO</span><input id="pt" maxlength="120" placeholder="Dai un titolo alle tue parole"></label><label class="field"><span>TESTO</span><textarea id="pb" maxlength="12000" placeholder="Scrivi qui la tua poesia..."></textarea><small id="bodyCount">0 / 12000</small></label><label class="field"><span>COME TI SENTI?</span><select id="pm">${moods.filter(x=>x!=="Tutte").map(x=>`<option>${x}</option>`).join("")}</select></label><div class="visibility-options"><span class="field-label">CHI PUÒ LEGGERLA?</span><button type="button" data-visibility="public" class="visibility-option selected" onclick="pickVisibility('public')">🌎<strong>Tutti</strong><small>La poesia entra nel feed pubblico.</small></button><button type="button" data-visibility="followers" class="visibility-option" onclick="pickVisibility('followers')">👥<strong>I miei follower</strong><small>Solo chi ti segue può leggerla.</small></button><button type="button" data-visibility="private" class="visibility-option" onclick="pickVisibility('private')">🔒<strong>Solo io</strong><small>Resta nella tua area personale.</small></button></div><input id="pv" type="hidden" value="public"><div id="publishMessage"></div><button id="publishBtn" class="primary publish-btn" onclick="publish()">Pubblica poesia</button></div></div>
  <div id="comments" class="modal"><div class="sheet"><button class="close" onclick="closeM('comments')">×</button><div class="modal-heading"><span class="eyebrow">CONVERSAZIONE</span><h2>Commenti</h2></div><div id="commentList"></div><div class="comment-form"><input id="commentText" maxlength="1000" placeholder="Scrivi un pensiero..."><button onclick="comment()">Invia</button></div></div></div>`;
  renderChips(); renderProfileHeader(); bindEditor();
}
function bindEditor(){ document.getElementById("pb")?.addEventListener("input",e=>{const c=document.getElementById("bodyCount"); if(c)c.textContent=`${e.target.value.length} / 12000`;}); }
function renderProfileHeader(){
  const el=document.getElementById("profileHeader"); if(!el||!me)return;
  const stats=me.stats||{};
  el.innerHTML=`<div class="profile-header">
    <div class="profile-top">
      <div class="profile-avatar">${initials(me.display_name)}</div>
      <div class="profile-info">
        <span class="eyebrow">${me.role==="writer"?"SCRITTORE":"LETTORE"}</span>
        <h1>${escapeHTML(me.display_name)}</h1>
        <p>@${escapeHTML(me.username)}</p>
      </div>
      <div class="profile-actions">
        <button class="secondary compact" onclick="openProfileEditor()">Modifica</button>
        <button class="secondary compact" onclick="logout()">Esci</button>
      </div>
    </div>
    <p class="profile-bio">${escapeHTML(me.bio||"Scrivo ciò che non riesco a dire.")}</p>
    <div class="profile-stats">
      <div><strong>${stats.poems||0}</strong><span>Poesie</span></div>
      <div><strong>${stats.followers||0}</strong><span>Follower</span></div>
      <div><strong>${stats.following||0}</strong><span>Seguiti</span></div>
    </div>
  </div>`;
}

function openProfileEditor(){
  if(!me)return;
  const modal=document.getElementById("profileEditor");
  if(!modal)return;
  document.getElementById("profileName").value=me.display_name||"";
  document.getElementById("profileUsername").value=me.username||"";
  document.getElementById("profileBio").value=me.bio||"";
  document.getElementById("profileEditorMessage").innerHTML="";
  modal.classList.add("open");
  setTimeout(()=>document.getElementById("profileName")?.focus(),100);
}

async function saveProfile(){
  const button=document.getElementById("saveProfileBtn");
  const message=document.getElementById("profileEditorMessage");
  const displayName=document.getElementById("profileName")?.value.trim()||"";
  const username=document.getElementById("profileUsername")?.value.trim()||"";
  const bio=document.getElementById("profileBio")?.value.trim()||"";

  if(!displayName||!username){
    if(message)message.innerHTML=`<div class="inline-message error">Nome e username sono obbligatori.</div>`;
    return;
  }

  if(bio.length>300){
    if(message)message.innerHTML=`<div class="inline-message error">La bio può contenere al massimo 300 caratteri.</div>`;
    return;
  }

  if(button){button.disabled=true;button.textContent="Salvataggio...";}
  if(message)message.innerHTML="";

  try{
    const data=await api("/api/me",{
      method:"PATCH",
      body:JSON.stringify({displayName,username,bio})
    });

    me=data.user;
    closeM("profileEditor");
    renderProfileHeader();
    await loadProfile();
    toast("Profilo aggiornato ✨","success");
  }catch(error){
    if(message)message.innerHTML=`<div class="inline-message error">${escapeHTML(error.message)}</div>`;
  }finally{
    if(button){button.disabled=false;button.textContent="Salva modifiche";}
  }
}
function renderChips(){ const el=document.getElementById("chips"); if(!el)return; el.innerHTML=moods.map(x=>`<button class="chip ${x===mood||(!mood&&x==="Tutte")?"on":""}" onclick="setMood('${x}')">${x}</button>`).join(""); }
function goDiscover(){ go("discover"); }
function setMood(value){ mood=value==="Tutte"?"":value; renderChips(); loadFeed(); if(document.getElementById("discover")?.classList.contains("active")) loadDiscover(); }

async function loadFeed(){
  const feed=document.getElementById("feed"); if(!feed)return; feed.innerHTML=`<div class="loading-state"><span></span><p>Sto cercando le parole giuste...</p></div>`;
  try{ const poems=await api(`/api/poems?mood=${encodeURIComponent(mood)}`); feed.innerHTML=poems.length?poems.map(card).join(""):emptyState("✍️","Il feed è ancora vuoto.","Potresti essere tu a lasciare il primo verso.",me?.role==="writer"?"Scrivi una poesia":"Esplora le emozioni",me?.role==="writer"?"openEditor()":"goDiscover()"); }
  catch(error){ feed.innerHTML=emptyState("☁️","Non riesco a caricare il feed.",error.message,"Riprova","loadFeed()"); }
}
function card(p){
  const canFollow=p.user_id!==me.id; return `<article class="poem-card"><div class="poem-author"><div class="avatar">${initials(p.display_name)}</div><div class="author-copy"><strong>${escapeHTML(p.display_name)}</strong><span>@${escapeHTML(p.username)}</span></div>${canFollow?`<button class="follow-btn ${p.following?"following":""}" onclick="follow(${p.user_id})">${p.following?"Seguito":"Segui"}</button>`:""}</div><div class="poem-content"><span class="poem-mood">${escapeHTML(p.mood)}</span><h2>${escapeHTML(p.title)}</h2><p class="poem-body">${escapeHTML(p.body)}</p></div><div class="poem-actions"><button class="${p.liked?"active":""}" onclick="like(${p.id})">${p.liked?"♥":"♡"} ${p.likes}</button><button onclick="openComments(${p.id})">💬 ${p.comments}</button><button class="${p.saved?"active":""}" onclick="save(${p.id})">🔖 ${p.saves}</button><button onclick="sharePoem(${p.id})">↗</button></div></article>`;
}
async function like(id){try{await api(`/api/poems/${id}/like`,{method:"POST"}); await loadFeed();}catch(e){toast(e.message);}}
async function save(id){try{await api(`/api/poems/${id}/save`,{method:"POST"}); await loadFeed(); toast("Salvata nella tua biblioteca.","success");}catch(e){toast(e.message);}}
async function follow(id){try{const r=await api(`/api/users/${id}/follow`,{method:"POST"}); await loadFeed(); toast(r.following?"Ora segui questo autore.":"Hai smesso di seguirlo.","success");}catch(e){toast(e.message);}}

function scheduleDiscover(){ clearTimeout(discoverTimer); discoverTimer=setTimeout(loadDiscover,250); }
async function loadDiscover(){
  const input=document.getElementById("search"), results=document.getElementById("discoverResults"); if(!input||!results)return;
  const q=input.value.trim(); results.innerHTML=`<div class="loading-state"><span></span><p>Ricerca in corso...</p></div>`;
  try{const poems=await api(`/api/poems?q=${encodeURIComponent(q)}&mood=${encodeURIComponent(mood)}`); results.innerHTML=poems.length?`<div class="result-heading">${q?`Risultati per “${escapeHTML(q)}”`:`Ultime poesie`}</div>${poems.map(card).join("")}`:emptyState("⌕","Nessun risultato.",q?"Prova un'altra parola o un'emozione.":"Qui compariranno le poesie che potrai scoprire.");}
  catch(e){results.innerHTML=emptyState("☁️","Ricerca non disponibile.",e.message,"Riprova","loadDiscover()");}
}

function openEditor(prefill=""){ if(me?.role!=="writer"){toast("Per pubblicare devi avere un profilo Scrittore.");return;} const editor=document.getElementById("editor"); editor?.classList.add("open"); document.getElementById("pt").value=prefill; document.getElementById("pb").value=""; document.getElementById("pm").value="Amore"; pickVisibility("public"); document.getElementById("publishMessage").innerHTML=""; document.getElementById("bodyCount").textContent="0 / 12000"; }
function pickVisibility(value){ document.getElementById("pv").value=value; document.querySelectorAll(".visibility-option").forEach(b=>b.classList.toggle("selected",b.dataset.visibility===value)); }
async function publish(){
  if(isPublishing)return; const title=document.getElementById("pt").value.trim(), body=document.getElementById("pb").value.trim(), poemMood=document.getElementById("pm").value, visibility=document.getElementById("pv").value, msg=document.getElementById("publishMessage");
  if(!title){msg.innerHTML=`<div class="inline-message error">Inserisci un titolo.</div>`;return;} if(!body){msg.innerHTML=`<div class="inline-message error">Scrivi il testo della poesia.</div>`;return;}
  isPublishing=true; const btn=document.getElementById("publishBtn"); btn.disabled=true; btn.textContent="Pubblicazione..."; msg.innerHTML="";
  try{const result=await api("/api/poems",{method:"POST",body:JSON.stringify({title,body,mood:poemMood,visibility})}); closeM("editor"); document.getElementById("pt").value=""; document.getElementById("pb").value=""; mood=""; renderChips(); go("home"); await loadFeed(); if(visibility==="public")toast("Poesia pubblicata nel feed ✨","success"); else toast(visibility==="followers"?"Poesia pubblicata per i tuoi follower.":"Poesia salvata nella tua area privata.","success"); return result;}
  catch(e){msg.innerHTML=`<div class="inline-message error">${escapeHTML(e.message)}</div>`;}
  finally{isPublishing=false; btn.disabled=false; btn.textContent="Pubblica poesia";}
}

async function openComments(id){
  commentPoem=id; const list=document.getElementById("commentList"); list.innerHTML=`<div class="loading-small">Caricamento commenti...</div>`;
  try{const comments=await api(`/api/poems/${id}/comments`); list.innerHTML=comments.length?comments.map(c=>`<div class="comment"><strong>${escapeHTML(c.display_name)}</strong><p>${escapeHTML(c.body)}</p></div>`).join(""):emptyState("💬","Ancora nessun commento.","Puoi essere il primo a lasciare un pensiero."); document.getElementById("comments").classList.add("open");}
  catch(e){toast(e.message);}
}
async function comment(){const input=document.getElementById("commentText"),value=input.value.trim();if(!value||!commentPoem)return;try{await api(`/api/poems/${commentPoem}/comments`,{method:"POST",body:JSON.stringify({body:value})});input.value="";await openComments(commentPoem);await loadFeed();}catch(e){toast(e.message);}}

async function loadProfile(){
  const container=document.getElementById("myProfile"); if(!container)return; container.innerHTML=`<div class="loading-state"><span></span><p>Caricamento del profilo...</p></div>`;
  try{const profile=await api("/api/profile"); me={...me, ...profile}; renderProfileHeader(); container.innerHTML=`<div class="profile-section-title"><span>Le mie poesie</span><button onclick="openEditor()">＋ Scrivi</button></div>${profile.poems.length?profile.poems.map(card).join(""):emptyState("📝","Non hai ancora pubblicato poesie.","Il tuo profilo è pronto. Manca solo il primo verso.","Scrivi la prima poesia","openEditor()")}`;}
  catch(e){container.innerHTML=emptyState("☁️","Profilo non disponibile.",e.message,"Riprova","loadProfile()");}
}
async function loadActivity(){const c=document.getElementById("activities");if(!c)return;c.innerHTML=`<div class="loading-state"><span></span><p>Caricamento attività...</p></div>`;try{const n=await api("/api/notifications");c.innerHTML=n.length?n.map(x=>`<div class="notification"><div class="notification-avatar">${initials(x.display_name||"V")}</div><div><strong>${escapeHTML(x.display_name||"Qualcuno")}</strong><p>${x.type==="follow"?"ha iniziato a seguirti.":"ha interagito con una tua poesia."}</p></div></div>`).join(""):emptyState("♡","Nessuna attività ancora.","Quando qualcuno interagirà con le tue parole, lo vedrai qui."); if(n.length)api("/api/notifications/read",{method:"POST"}).catch(()=>{});}catch(e){c.innerHTML=emptyState("☁️","Attività non disponibile.",e.message,"Riprova","loadActivity()");}}

function go(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));document.getElementById(id)?.classList.add("active");document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));const map={home:0,discover:1,activity:3,profile:4};if(map[id]!==undefined)document.querySelectorAll(".nav")[map[id]]?.classList.add("active");if(id==="discover")loadDiscover();if(id==="activity")loadActivity();if(id==="profile")loadProfile();}
function closeM(id){document.getElementById(id)?.classList.remove("open");}
async function sharePoem(id){const url=`${window.location.origin}/?poem=${id}`;try{await navigator.clipboard.writeText(url);toast("Link copiato.","success");}catch{toast("Non riesco a copiare il link.");}}
function logout(){localStorage.removeItem("versi_token");token=null;me=null;mood="";renderAuth();}

document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal.open").forEach(m=>m.classList.remove("open"));});
boot();
