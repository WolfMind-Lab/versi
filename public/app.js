const root = document.querySelector("#app");

let token = localStorage.getItem("versi_token");
let me = null;
let mood = "";

const moods = [
  "Tutte",
  "Amore",
  "Nostalgia",
  "Solitudine",
  "Rinascita",
  "Felicità",
  "Dolore",
  "Libertà"
];

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "Si è verificato un errore.");
  }

  return data;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(text) {
  const element = document.createElement("div");

  element.className = "toast show";
  element.textContent = text;

  document.body.appendChild(element);

  setTimeout(() => {
    element.remove();
  }, 1800);
}


/* =========================
   AVVIO
========================= */

async function boot() {
  if (!token) {
    renderAuth();
    return;
  }

  try {
    me = await api("/api/me");

    renderApp();

    await loadFeed();

  } catch {
    localStorage.removeItem("versi_token");

    token = null;
    me = null;

    renderAuth();
  }
}


/* =========================
   AUTENTICAZIONE
========================= */

function renderAuth() {

  root.innerHTML = `
    <main class="auth">

      <div class="logo">
        VERSI
      </div>

      <h1>
        Le parole che<br>
        restano.
      </h1>

      <p>
        Un social dedicato alla poesia.
        Scegli se vuoi scrivere o leggere.
      </p>


      <div id="loginBox">

        <input
          id="identifier"
          placeholder="Email o username"
        >

        <input
          id="password"
          type="password"
          placeholder="Password"
        >

        <button
          class="primary"
          onclick="login()"
        >
          Accedi
        </button>

        <button
          class="secondary"
          onclick="showRegister()"
        >
          Crea account
        </button>

      </div>


      <div
        id="registerBox"
        style="display:none"
      >

        <input
          id="rname"
          placeholder="Nome visualizzato"
        >

        <input
          id="ruser"
          placeholder="Username"
        >

        <input
          id="remail"
          type="email"
          placeholder="Email"
        >

        <input
          id="rpass"
          type="password"
          placeholder="Password (min. 8 caratteri)"
        >


        <div class="roles">

          <button
            id="rw"
            class="role"
            onclick="pickRole('writer')"
          >
            ✍️
            <b>Scrittore</b>
            <br>
            <small>Pubblica poesie</small>
          </button>


          <button
            id="rr"
            class="role"
            onclick="pickRole('reader')"
          >
            📖
            <b>Lettore</b>
            <br>
            <small>Scopri e salva</small>
          </button>

        </div>


        <button
          class="primary"
          style="margin-top:10px"
          onclick="register()"
        >
          Registrati
        </button>


        <button
          class="secondary"
          onclick="showLogin()"
        >
          Ho già un account
        </button>

      </div>

    </main>
  `;
}


let chosenRole = "reader";


function pickRole(role) {

  chosenRole = role;

  document
    .getElementById("rw")
    ?.classList.toggle(
      "sel",
      role === "writer"
    );

  document
    .getElementById("rr")
    ?.classList.toggle(
      "sel",
      role === "reader"
    );
}


function showRegister() {

  document.getElementById("loginBox").style.display = "none";

  document.getElementById("registerBox").style.display = "block";

  pickRole("reader");
}


function showLogin() {

  document.getElementById("loginBox").style.display = "block";

  document.getElementById("registerBox").style.display = "none";
}


async function login() {

  try {

    const data = await api(
      "/api/login",
      {
        method: "POST",

        body: JSON.stringify({
          identifier:
            document.getElementById("identifier").value,

          password:
            document.getElementById("password").value
        })
      }
    );


    token = data.token;

    localStorage.setItem(
      "versi_token",
      token
    );

    me = data.user;

    renderApp();

    await loadFeed();

  } catch (error) {

    toast(error.message);

  }
}


async function register() {

  try {

    const data = await api(
      "/api/register",
      {
        method: "POST",

        body: JSON.stringify({
          displayName:
            document.getElementById("rname").value,

          username:
            document.getElementById("ruser").value,

          email:
            document.getElementById("remail").value,

          password:
            document.getElementById("rpass").value,

          role:
            chosenRole
        })
      }
    );


    token = data.token;

    localStorage.setItem(
      "versi_token",
      token
    );

    me = data.user;

    renderApp();

    await loadFeed();

  } catch (error) {

    toast(error.message);

  }
}


/* =========================
   APP PRINCIPALE
========================= */

function renderApp() {

  root.innerHTML = `

    <div class="app">

      <header>

        <button
          class="icon"
          onclick="go('discover')"
        >
          ⌕
        </button>


        <div class="logo">
          VERSI
        </div>


        <button
          class="icon"
          onclick="go('activity')"
        >
          ♡
        </button>

      </header>


      <!-- HOME -->

      <section
        id="home"
        class="screen active"
      >

        <div class="pad">

          <div class="hero">

            <h1>
              Cosa senti oggi?
            </h1>

            <p>
              Trova le parole che assomigliano
              a ciò che provi.
            </p>

          </div>


          <div
            id="chips"
            class="chips"
          ></div>


          <div id="feed"></div>

        </div>

      </section>


      <!-- SCOPRI -->

      <section
        id="discover"
        class="screen"
      >

        <div class="pad">

          <div class="search">

            ⌕

            <input
              id="search"
              oninput="loadDiscover()"
              placeholder="Cerca poesie, autori, parole..."
            >

          </div>


          <h2
            style="font-family:Georgia;margin-top:22px"
          >
            Scopri
          </h2>


          <div class="grid">

            <div
              class="tile"
              onclick="setMood('Amore')"
            >
              ❤️
              <b>Amore</b>
              <small>Parole del cuore</small>
            </div>


            <div
              class="tile"
              onclick="setMood('Nostalgia')"
            >
              🌙
              <b>Nostalgia</b>
              <small>Ciò che manca</small>
            </div>


            <div
              class="tile"
              onclick="setMood('Rinascita')"
            >
              🌱
              <b>Rinascita</b>
              <small>Ricominciarsi</small>
            </div>


            <div
              class="tile"
              onclick="setMood('Solitudine')"
            >
              🖤
              <b>Solitudine</b>
              <small>Quando pesa</small>
            </div>

          </div>


          <div id="discoverResults"></div>

        </div>

      </section>


      <!-- CREA -->

      <section
        id="create"
        class="screen"
      >

        <div class="pad">

          <h2 style="font-family:Georgia">
            Crea
          </h2>


          <div class="card">

            <h3>
              ✍️ Nuova poesia
            </h3>

            <p class="tiny">
              Pubblica qualcosa di tuo.
            </p>

            <button
              class="primary"
              onclick="openEditor()"
            >
              Apri editor
            </button>

          </div>


          <div class="card">

            <h3>
              🎯 Sfida del giorno
            </h3>

            <p>
              pioggia · telefono · addio
            </p>

            <button
              class="secondary"
              onclick="openEditor('Sfida: pioggia, telefono, addio')"
            >
              Partecipa
            </button>

          </div>

        </div>

      </section>


      <!-- ATTIVITÀ -->

      <section
        id="activity"
        class="screen"
      >

        <div class="pad">

          <h2 style="font-family:Georgia">
            Attività
          </h2>

          <div id="activities"></div>

        </div>

      </section>


      <!-- PROFILO -->

      <section
        id="profile"
        class="screen"
      >

        <div class="pad">

          <div class="card">

            <div class="head">

              <div class="avatar">
                ${escapeHTML(
                  (me?.display_name || "V")[0]
                )}
              </div>


              <div class="grow">

                <h2
                  style="font-family:Georgia;margin:0"
                >
                  ${escapeHTML(
                    me?.display_name || "Profilo"
                  )}
                </h2>

                <div class="tiny">
                  @${escapeHTML(
                    me?.username || ""
                  )}
                </div>

              </div>


              <button
                class="secondary"
                style="width:auto;margin:0"
                onclick="logout()"
              >
                Esci
              </button>

            </div>


            <p>
              ${escapeHTML(
                me?.bio ||
                "Scrivo ciò che non riesco a dire."
              )}
            </p>


            <div class="tiny">

              Ruolo:

              ${
                me?.role === "writer"
                  ? "Scrittore"
                  : "Lettore"
              }

            </div>

          </div>


          <div id="myProfile"></div>

        </div>

      </section>


      <!-- NAVIGAZIONE -->

      <nav class="bottom">

        <button
          class="nav active"
          onclick="go('home')"
        >
          <b>⌂</b>
          Home
        </button>


        <button
          class="nav"
          onclick="go('discover')"
        >
          <b>⌕</b>
          Scopri
        </button>


        <button
          class="plus"
          onclick="openEditor()"
        >
          ＋
        </button>


        <button
          class="nav"
          onclick="go('activity')"
        >
          <b>♡</b>
          Attività
        </button>


        <button
          class="nav"
          onclick="go('profile')"
        >
          <b>◯</b>
          Profilo
        </button>

      </nav>

    </div>


    <!-- EDITOR -->

    <div
      id="editor"
      class="modal"
    >

      <div class="sheet">

        <button
          class="close"
          onclick="closeM('editor')"
        >
          ×
        </button>


        <h2 style="font-family:Georgia">
          Nuova poesia
        </h2>


        <div class="field">

          <label>TITOLO</label>

          <input id="pt">

        </div>


        <div class="field">

          <label>TESTO</label>

          <textarea id="pb"></textarea>

        </div>


        <div class="field">

          <label>EMOZIONE</label>

          <select id="pm">

            ${moods
              .filter(x => x !== "Tutte")
              .map(
                x => `<option>${x}</option>`
              )
              .join("")}

          </select>

        </div>


        <div class="field">

          <label>VISIBILITÀ</label>

          <select id="pv">

            <option value="public">
              Pubblica per tutti
            </option>

            <option value="followers">
              Solo follower
            </option>

            <option value="private">
              Privata
            </option>

          </select>

        </div>


        <button
          class="primary"
          onclick="publish()"
        >
          Pubblica poesia
        </button>

      </div>

    </div>


    <!-- COMMENTI -->

    <div
      id="comments"
      class="modal"
    >

      <div class="sheet">

        <button
          class="close"
          onclick="closeM('comments')"
        >
          ×
        </button>


        <h2 style="font-family:Georgia">
          Commenti
        </h2>


        <div id="commentList"></div>


        <div
          style="display:flex;gap:7px"
        >

          <input
            id="commentText"
            style="flex:1;border:1px solid #e8dfe8;border-radius:15px;padding:12px"
          >


          <button
            class="primary"
            style="width:auto"
            onclick="comment()"
          >
            Invia
          </button>

        </div>

      </div>

    </div>

  `;


  renderChips();

  loadProfile();
}


/* =========================
   FILTRI
========================= */

function renderChips() {

  const chips =
    document.getElementById("chips");

  if (!chips) return;


  chips.innerHTML = moods
    .map(
      x => `
        <button
          class="chip ${
            x === mood ||
            (!mood && x === "Tutte")
              ? "on"
              : ""
          }"
          onclick="setMood('${x}')"
        >
          ${x}
        </button>
      `
    )
    .join("");
}


function setMood(value) {

  mood =
    value === "Tutte"
      ? ""
      : value;

  renderChips();

  loadFeed();
}


/* =========================
   FEED
========================= */

async function loadFeed() {

  const feed =
    document.getElementById("feed");

  if (!feed) return;


  feed.innerHTML = `
    <div class="card">
      Caricamento...
    </div>
  `;


  try {

    const poems =
      await api(
        "/api/poems?mood=" +
        encodeURIComponent(mood)
      );


    feed.innerHTML =
      poems.map(card).join("") ||
      `
        <div class="card">
          Nessuna poesia trovata.
        </div>
      `;

  } catch (error) {

    feed.innerHTML = `
      <div class="card">
        ${escapeHTML(error.message)}
      </div>
    `;

  }
}


/* =========================
   CARD POESIA
========================= */

function card(poem) {

  const initial =
    poem.display_name
      ? poem.display_name.charAt(0)
      : "?";


  return `

    <article class="poem">

      <div class="head">

        <div class="avatar">
          ${escapeHTML(initial)}
        </div>


        <div class="grow">

          <b>
            ${escapeHTML(poem.display_name)}
          </b>

          <div class="tiny">
            @${escapeHTML(poem.username)}
          </div>

        </div>


        ${
          poem.user_id !== me.id
            ? `
              <button
                class="follow ${
                  poem.following
                    ? "following"
                    : ""
                }"
                onclick="follow(${poem.user_id})"
              >
                ${
                  poem.following
                    ? "Segui già"
                    : "Segui"
                }
              </button>
            `
            : ""
        }

      </div>


      <h2>
        ${escapeHTML(poem.title)}
      </h2>


      <div class="text">
        ${escapeHTML(poem.body)}
      </div>


      <div
        class="tiny"
        style="margin-top:12px"
      >
        ${escapeHTML(poem.mood)}
      </div>


      <div class="actions">

        <button
          class="action ${
            poem.liked ? "on" : ""
          }"
          onclick="like(${poem.id})"
        >
          ${poem.liked ? "♥" : "♡"}
          ${poem.likes}
        </button>


        <button
          class="action"
          onclick="openComments(${poem.id})"
        >
          💬
          ${poem.comments}
        </button>


        <button
          class="action ${
            poem.saved ? "on" : ""
          }"
          onclick="save(${poem.id})"
        >
          🔖
          ${poem.saves}
        </button>


        <button
          class="action"
          onclick="share()"
        >
          ↗
        </button>

      </div>

    </article>

  `;
}


/* =========================
   LIKE / SALVA / FOLLOW
========================= */

async function like(id) {

  try {

    await api(
      "/api/poems/" + id + "/like",
      {
        method: "POST"
      }
    );

    await loadFeed();

  } catch (error) {

    toast(error.message);

  }
}


async function save(id) {

  try {

    await api(
      "/api/poems/" + id + "/save",
      {
        method: "POST"
      }
    );

    await loadFeed();

    toast("Biblioteca aggiornata");

  } catch (error) {

    toast(error.message);

  }
}


async function follow(id) {

  try {

    await api(
      "/api/users/" + id + "/follow",
      {
        method: "POST"
      }
    );

    await loadFeed();

    toast("Seguito aggiornato");

  } catch (error) {

    toast(error.message);

  }
}


/* =========================
   SCOPRI
========================= */

async function loadDiscover() {

  const search =
    document.getElementById("search");

  const results =
    document.getElementById(
      "discoverResults"
    );

  if (!search || !results) return;


  const query =
    encodeURIComponent(
      search.value || ""
    );


  try {

    const poems =
      await api(
        "/api/poems?q=" +
        query +
        "&mood=" +
        encodeURIComponent(mood)
      );


    results.innerHTML =
      poems.map(card).join("") ||
      `
        <div class="card">
          Nessun risultato.
        </div>
      `;

  } catch (error) {

    results.innerHTML = `
      <div class="card">
        ${escapeHTML(error.message)}
      </div>
    `;

  }
}


/* =========================
   COMMENTI
========================= */

let commentPoem = null;


async function openComments(id) {

  commentPoem = id;

  const list =
    document.getElementById(
      "commentList"
    );

  try {

    const comments =
      await api(
        "/api/poems/" +
        id +
        "/comments"
      );


    list.innerHTML =
      comments.map(
        comment => `
          <div class="card">

            <b>
              ${escapeHTML(
                comment.display_name
              )}
            </b>

            <p>
              ${escapeHTML(
                comment.body
              )}
            </p>

          </div>
        `
      ).join("") ||
      `
        <p class="tiny">
          Ancora nessun commento.
        </p>
      `;


    document
      .getElementById("comments")
      .classList.add("open");

  } catch (error) {

    toast(error.message);

  }
}


async function comment() {

  const input =
    document.getElementById(
      "commentText"
    );

  const value =
    input.value.trim();


  if (!value || !commentPoem) {
    return;
  }


  try {

    await api(
      "/api/poems/" +
      commentPoem +
      "/comments",
      {
        method: "POST",

        body: JSON.stringify({
          body: value
        })
      }
    );


    input.value = "";

    await openComments(
      commentPoem
    );

  } catch (error) {

    toast(error.message);

  }
}


/* =========================
   EDITOR
========================= */

function openEditor(prefill = "") {

  const editor =
    document.getElementById(
      "editor"
    );

  editor.classList.add("open");

  document.getElementById("pt").value =
    prefill;

  document.getElementById("pb").value =
    "";
}


async function publish() {

  const title =
    document
      .getElementById("pt")
      .value
      .trim();

  const body =
    document
      .getElementById("pb")
      .value
      .trim();

  const poemMood =
    document.getElementById("pm").value;

  const visibility =
    document.getElementById("pv").value;


  if (!title || !body) {

    toast(
      "Completa titolo e testo"
    );

    return;
  }


  try {

    await api(
      "/api/poems",
      {
        method: "POST",

        body: JSON.stringify({
          title,
          body,
          mood: poemMood,
          visibility
        })
      }
    );


    closeM("editor");

    document.getElementById("pt").value = "";

    document.getElementById("pb").value = "";

    toast("Poesia pubblicata ✨");

    go("home");

  } catch (error) {

    toast(error.message);

  }
}


/* =========================
   PROFILO
========================= */

async function loadProfile() {

  if (!me) return;


  const container =
    document.getElementById(
      "myProfile"
    );

  if (!container) return;


  try {

    const profile =
      await api(
        "/api/users/" +
        encodeURIComponent(
          me.username
        )
      );


    container.innerHTML = `

      <div class="card">

        <b>
          ${profile.poems.length}
        </b>

        poesie ·

        <b>
          ${profile.followers}
        </b>

        follower ·

        <b>
          ${profile.following}
        </b>

        seguiti

      </div>


      ${profile.poems
        .map(card)
        .join("")}

    `;

  } catch (error) {

    container.innerHTML = `
      <div class="card">
        ${escapeHTML(error.message)}
      </div>
    `;

  }
}


/* =========================
   ATTIVITÀ
========================= */

async function loadActivity() {

  const container =
    document.getElementById(
      "activities"
    );

  if (!container) return;


  try {

    const notifications =
      await api(
        "/api/notifications"
      );


    container.innerHTML =
      notifications.map(
        notification => `

          <div class="card">

            🔔

            <b>
              ${escapeHTML(
                notification.display_name ||
                "VERSI"
              )}
            </b>

            ${
              notification.type === "follow"
                ? "ha iniziato a seguirti."
                : "ha interagito con una tua poesia."
            }

          </div>

        `
      ).join("") ||

      `
        <div class="card tiny">
          Nessuna nuova attività.
        </div>
      `;

  } catch (error) {

    container.innerHTML = `
      <div class="card">
        ${escapeHTML(error.message)}
      </div>
    `;

  }
}


/* =========================
   NAVIGAZIONE
========================= */

function go(id) {

  document
    .querySelectorAll(".screen")
    .forEach(
      element =>
        element.classList.remove(
          "active"
        )
    );


  const screen =
    document.getElementById(id);

  if (screen) {
    screen.classList.add("active");
  }


  document
    .querySelectorAll(".nav")
    .forEach(
      element =>
        element.classList.remove(
          "active"
        )
    );


  const index = {
    home: 0,
    discover: 1,
    activity: 3,
    profile: 4
  }[id];


  if (index !== undefined) {

    document
      .querySelectorAll(".nav")
      [index]
      ?.classList.add("active");

  }


  if (id === "discover") {
    loadDiscover();
  }


  if (id === "activity") {
    loadActivity();
  }


  if (id === "profile") {
    loadProfile();
  }
}


/* =========================
   MODALI
========================= */

function closeM(id) {

  document
    .getElementById(id)
    ?.classList.remove(
      "open"
    );
}


/* =========================
   CONDIVISIONE
========================= */

function share() {

  if (navigator.clipboard) {

    navigator.clipboard
      .writeText(
        window.location.href
      )
      .catch(() => {});

  }

  toast("Link copiato");

}


/* =========================
   LOGOUT
========================= */

function logout() {

  localStorage.removeItem(
    "versi_token"
  );

  token = null;
  me = null;

  renderAuth();
}


/* =========================
   START
========================= */

boot();