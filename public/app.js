const root = document.querySelector("#app");

let token = localStorage.getItem("versi_token");
let me = null;

let mood = "";
let commentPoem = null;
let isPublishing = false;
let discoverTimer = null;
let currentScreen = "home";

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

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const headers = {
    ...(options.body
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      "Connessione non disponibile. Controlla la rete e riprova."
    );
  }

  let data = {};

  const contentType =
    response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        data.error ||
        "La sessione è scaduta. Accedi nuovamente."
      );
    }

    if (response.status === 404) {
      throw new Error(
        data.error ||
        "La risorsa richiesta non è disponibile."
      );
    }

    throw new Error(
      data.error ||
      `Richiesta non riuscita (${response.status}).`
    );
  }

  return data;
}


/* =========================================================
   UTILITÀ
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function initials(name) {
  const value = String(name || "V")
    .trim()
    .charAt(0);

  return escapeHTML(
    (value || "V").toUpperCase()
  );
}


function toast(text, type = "normal") {
  document
    .querySelectorAll(".toast")
    .forEach(element => element.remove());

  const element =
    document.createElement("div");

  element.className =
    `toast ${type}`;

  element.textContent = text;

  document.body.appendChild(element);

  setTimeout(() => {
    element.remove();
  }, 2600);
}


function emptyState(
  icon,
  title,
  text,
  buttonText = "",
  action = ""
) {
  return `
    <div class="empty-state">

      <div class="empty-icon">
        ${icon}
      </div>

      <h3>
        ${escapeHTML(title)}
      </h3>

      <p>
        ${escapeHTML(text)}
      </p>

      ${
        buttonText
          ? `
            <button
              class="secondary"
              onclick="${action}"
            >
              ${escapeHTML(buttonText)}
            </button>
          `
          : ""
      }

    </div>
  `;
}


function loadingState(text = "Caricamento...") {
  return `
    <div class="loading-state">

      <span></span>

      <p>
        ${escapeHTML(text)}
      </p>

    </div>
  `;
}


/* =========================================================
   AVVIO
========================================================= */

async function boot() {
  if (!token) {
    renderAuth();
    return;
  }

  try {
    me = await api("/api/me");

    renderApp();

    await loadFeed();

  } catch (error) {

    /*
      IMPORTANTE:
      non eliminiamo automaticamente la sessione per qualsiasi
      errore del server.

      La sessione viene eliminata soltanto se riceviamo
      effettivamente un errore di autenticazione.
    */

    if (
      error.message.includes("sessione") ||
      error.message.includes("Accedi") ||
      error.message.includes("Account non trovato")
    ) {
      logout(false);
      return;
    }

    renderApp();

    showScreenError(
      "home",
      error.message
    );
  }
}


/* =========================================================
   AUTENTICAZIONE
========================================================= */

function renderAuth() {

  root.innerHTML = `
    <main class="auth-page">

      <div class="auth-card">

        <div class="logo">
          VERSI
        </div>

        <div class="auth-mark">
          “
        </div>

        <h1>
          Le parole che restano.
        </h1>

        <p class="auth-intro">
          Un luogo dedicato a chi scrive,
          a chi legge e a tutto ciò che
          le parole riescono a dire.
        </p>


        <!-- LOGIN -->

        <div
          id="loginBox"
          class="auth-form"
        >

          <label>
            Email o username

            <input
              id="identifier"
              autocomplete="username"
              placeholder="es. luna_test_2026"
            >
          </label>


          <label>
            Password

            <input
              id="password"
              type="password"
              autocomplete="current-password"
              placeholder="La tua password"
            >
          </label>


          <div id="loginMessage"></div>


          <button
            id="loginBtn"
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


        <!-- REGISTRAZIONE -->

        <div
          id="registerBox"
          class="auth-form"
          style="display:none"
        >

          <label>
            Nome visualizzato

            <input
              id="rname"
              maxlength="60"
              autocomplete="name"
              placeholder="Puoi usare anche uno pseudonimo"
            >
          </label>


          <label>
            Username

            <input
              id="ruser"
              maxlength="24"
              autocomplete="username"
              placeholder="es. luna_test_2026"
            >

            <small class="field-hint">
              3-24 caratteri. Lettere, numeri,
              punto, trattino o underscore.
            </small>
          </label>


          <label>
            Email

            <input
              id="remail"
              type="email"
              autocomplete="email"
              placeholder="La tua email"
            >
          </label>


          <label>
            Password

            <input
              id="rpass"
              type="password"
              minlength="8"
              autocomplete="new-password"
              placeholder="Almeno 8 caratteri"
            >

            <small class="field-hint">
              Minimo 8 caratteri.
            </small>
          </label>


          <div class="role-title">
            Come vuoi vivere VERSI?
          </div>


          <div class="roles">

            <button
              id="rw"
              type="button"
              class="role"
              onclick="pickRole('writer')"
            >
              ✍️

              <strong>
                Scrittore
              </strong>

              <small>
                Pubblica e condividi poesie
              </small>
            </button>


            <button
              id="rr"
              type="button"
              class="role"
              onclick="pickRole('reader')"
            >
              📖

              <strong>
                Lettore
              </strong>

              <small>
                Scopri, salva e segui autori
              </small>
            </button>

          </div>


          <div id="registerMessage"></div>


          <button
            id="registerBtn"
            class="primary"
            onclick="register()"
          >
            Crea il mio account
          </button>


          <button
            class="secondary"
            onclick="showLogin()"
          >
            Ho già un account
          </button>

        </div>

      </div>

    </main>
  `;

  pickRole("reader");

  bindAuthEnterKeys();
}


let chosenRole = "reader";


function pickRole(role) {

  chosenRole = role;

  document
    .getElementById("rw")
    ?.classList.toggle(
      "selected",
      role === "writer"
    );

  document
    .getElementById("rr")
    ?.classList.toggle(
      "selected",
      role === "reader"
    );
}


function showAuthMessage(
  message,
  type = "error",
  target = "auto"
) {

  let id = "loginMessage";

  if (target === "register") {
    id = "registerMessage";
  }

  if (target === "auto") {

    const registerOpen =
      document.getElementById("registerBox")
        ?.style.display !== "none";

    id = registerOpen
      ? "registerMessage"
      : "loginMessage";
  }

  const box =
    document.getElementById(id);

  if (!box) return;

  box.innerHTML = message
    ? `
      <div class="inline-message ${type}">
        ${escapeHTML(message)}
      </div>
    `
    : "";
}


function showRegister() {

  document
    .getElementById("loginBox")
    .style.display = "none";

  document
    .getElementById("registerBox")
    .style.display = "grid";

  showAuthMessage(
    "",
    "error",
    "login"
  );

  showAuthMessage(
    "",
    "error",
    "register"
  );

  pickRole("reader");
}


function showLogin() {

  document
    .getElementById("loginBox")
    .style.display = "grid";

  document
    .getElementById("registerBox")
    .style.display = "none";

  showAuthMessage(
    "",
    "error",
    "login"
  );
}


function bindAuthEnterKeys() {

  const loginInputs = [
    document.getElementById("identifier"),
    document.getElementById("password")
  ];

  loginInputs.forEach(input => {

    input?.addEventListener(
      "keydown",
      event => {

        if (event.key === "Enter") {
          event.preventDefault();
          login();
        }

      }
    );

  });


  const registerInputs = [
    document.getElementById("rname"),
    document.getElementById("ruser"),
    document.getElementById("remail"),
    document.getElementById("rpass")
  ];

  registerInputs.forEach(input => {

    input?.addEventListener(
      "keydown",
      event => {

        if (event.key === "Enter") {
          event.preventDefault();
          register();
        }

      }
    );

  });
}


/* =========================================================
   LOGIN
========================================================= */

async function login() {

  showAuthMessage(
    "",
    "error",
    "login"
  );

  const identifier =
    document
      .getElementById("identifier")
      ?.value
      .trim();

  const password =
    document
      .getElementById("password")
      ?.value || "";

  if (!identifier || !password) {

    showAuthMessage(
      "Inserisci email/username e password.",
      "error",
      "login"
    );

    return;
  }


  const button =
    document.getElementById("loginBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Accesso...";
  }


  try {

    const data =
      await api(
        "/api/login",
        {
          method: "POST",

          body: JSON.stringify({
            identifier,
            password
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

    toast(
      "Bentornata in VERSI ✨",
      "success"
    );

  } catch (error) {

    showAuthMessage(
      error.message,
      "error",
      "login"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Accedi";
    }

  }
}


/* =========================================================
   REGISTRAZIONE
========================================================= */

async function register() {

  showAuthMessage(
    "",
    "error",
    "register"
  );

  const displayName =
    document
      .getElementById("rname")
      ?.value
      .trim();

  const username =
    document
      .getElementById("ruser")
      ?.value
      .trim();

  const email =
    document
      .getElementById("remail")
      ?.value
      .trim();

  const password =
    document
      .getElementById("rpass")
      ?.value || "";


  if (
    !displayName ||
    !username ||
    !email ||
    !password
  ) {

    showAuthMessage(
      "Completa tutti i campi per creare l'account.",
      "error",
      "register"
    );

    return;
  }


  if (password.length < 8) {

    showAuthMessage(
      "La password deve avere almeno 8 caratteri.",
      "error",
      "register"
    );

    return;
  }


  if (
    !/^[a-zA-Z0-9._-]{3,24}$/.test(username)
  ) {

    showAuthMessage(
      "Username non valido. Usa 3-24 caratteri: lettere, numeri, punto, trattino o underscore.",
      "error",
      "register"
    );

    return;
  }


  if (
    !/^\S+@\S+\.\S+$/.test(email)
  ) {

    showAuthMessage(
      "Inserisci un indirizzo email valido.",
      "error",
      "register"
    );

    return;
  }


  const button =
    document.getElementById("registerBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Creazione account...";
  }


  try {

    const data =
      await api(
        "/api/register",
        {
          method: "POST",

          body: JSON.stringify({
            displayName,
            username,
            email,
            password,
            role: chosenRole
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

    toast(
      "Benvenuta in VERSI ✨",
      "success"
    );

  } catch (error) {

    showAuthMessage(
      error.message,
      "error",
      "register"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Crea il mio account";
    }

  }
}


/* =========================================================
   APP PRINCIPALE
========================================================= */

function renderApp() {

  root.innerHTML = `

    <div class="app-shell">

      <header class="topbar">

        <button
          class="icon-btn"
          onclick="go('discover')"
          aria-label="Cerca"
        >
          ⌕
        </button>


        <div class="brand">
          VERSI
        </div>


        <button
          class="icon-btn"
          onclick="go('activity')"
          aria-label="Attività"
        >
          ♡
        </button>

      </header>


      <main class="app-main">


        <!-- HOME -->

        <section
          id="home"
          class="screen active"
        >

          <div class="screen-inner">

            <div class="hero">

              <span class="eyebrow">
                IL TUO SPAZIO POETICO
              </span>

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


            <div class="section-label">

              <span>
                Dal mondo di VERSI
              </span>

              <button
                onclick="loadFeed()"
              >
                Aggiorna
              </button>

            </div>


            <div id="feed"></div>

          </div>

        </section>


        <!-- SCOPRI -->

        <section
          id="discover"
          class="screen"
        >

          <div class="screen-inner">

            <div class="page-heading">

              <span class="eyebrow">
                ESPLORA
              </span>

              <h1>
                Scopri
              </h1>

              <p>
                Trova poesie e parole che
                parlano di te.
              </p>

            </div>


            <div class="search-box">

              <span>
                ⌕
              </span>

              <input
                id="search"
                oninput="scheduleDiscover()"
                placeholder="Cerca poesie, autori, parole..."
              >

            </div>


            <div class="discover-title">
              Esplora per emozione
            </div>


            <div class="mood-grid">

              <button
                onclick="setMood('Amore')"
              >
                ❤️
                <strong>Amore</strong>
                <small>
                  Parole del cuore
                </small>
              </button>


              <button
                onclick="setMood('Nostalgia')"
              >
                🌙
                <strong>Nostalgia</strong>
                <small>
                  Ciò che manca
                </small>
              </button>


              <button
                onclick="setMood('Rinascita')"
              >
                🌱
                <strong>Rinascita</strong>
                <small>
                  Ricominciarsi
                </small>
              </button>


              <button
                onclick="setMood('Solitudine')"
              >
                🖤
                <strong>Solitudine</strong>
                <small>
                  Quando pesa
                </small>
              </button>

            </div>


            <div id="discoverResults"></div>

          </div>

        </section>


        <!-- CREA -->

        <section
          id="create"
          class="screen"
        >

          <div class="screen-inner">

            <div class="page-heading">

              <span class="eyebrow">
                SCRIVI
              </span>

              <h1>
                Metti in parole
                ciò che senti.
              </h1>

              <p>
                Non serve trovare la frase perfetta.
                Serve trovare la tua.
              </p>

            </div>


            <button
              class="create-card"
              onclick="openEditor()"
            >

              <span class="create-icon">
                ＋
              </span>

              <span>

                <strong>
                  Nuova poesia
                </strong>

                <small>
                  Apri l'editor e inizia a scrivere
                </small>

              </span>

              <b>
                ›
              </b>

            </button>


            <div class="challenge">

              <span>
                🎯 SFIDA DEL GIORNO
              </span>

              <strong>
                pioggia · telefono · addio
              </strong>

              <p>
                Tre parole. Una poesia.
                Il resto lo decidi tu.
              </p>

              <button
                class="secondary"
                onclick="openEditor('Sfida: pioggia, telefono, addio')"
              >
                Partecipa alla sfida
              </button>

            </div>

          </div>

        </section>


        <!-- ATTIVITÀ -->

        <section
          id="activity"
          class="screen"
        >

          <div class="screen-inner">

            <div class="page-heading">

              <span class="eyebrow">
                LE TUE INTERAZIONI
              </span>

              <h1>
                Attività
              </h1>

              <p>
                Qui trovi ciò che succede
                intorno alle tue parole.
              </p>

            </div>


            <div id="activities"></div>

          </div>

        </section>


        <!-- PROFILO -->

        <section
          id="profile"
          class="screen"
        >

          <div class="screen-inner">

            <div id="profileHeader"></div>

            <div id="myProfile"></div>

          </div>

        </section>

      </main>


      <!-- NAVIGAZIONE -->

      <nav class="bottom-nav">

        <button
          class="nav active"
          onclick="go('home')"
        >
          <span>⌂</span>
          <small>Home</small>
        </button>


        <button
          class="nav"
          onclick="go('discover')"
        >
          <span>⌕</span>
          <small>Scopri</small>
        </button>


        <button
          class="write-nav"
          onclick="openEditor()"
        >
          <span>＋</span>
          <small>Scrivi</small>
        </button>


        <button
          class="nav"
          onclick="go('activity')"
        >
          <span>♡</span>
          <small>Attività</small>
        </button>


        <button
          class="nav"
          onclick="go('profile')"
        >
          <span>◯</span>
          <small>Profilo</small>
        </button>

      </nav>

    </div>


    <!-- EDITOR -->

    <div
      id="editor"
      class="modal"
    >

      <div class="sheet editor-sheet">

        <button
          class="close"
          onclick="closeM('editor')"
        >
          ×
        </button>


        <div class="modal-heading">

          <span class="eyebrow">
            NUOVO TESTO
          </span>

          <h2>
            Scrivi la tua poesia
          </h2>

          <p>
            Lascia che le parole facciano il resto.
          </p>

        </div>


        <label class="field">

          <span>
            TITOLO
          </span>

          <input
            id="pt"
            maxlength="120"
            placeholder="Dai un titolo alle tue parole"
          >

        </label>


        <label class="field">

          <span>
            TESTO
          </span>

          <textarea
            id="pb"
            maxlength="12000"
            placeholder="Scrivi qui la tua poesia..."
          ></textarea>

          <small id="bodyCount">
            0 / 12000
          </small>

        </label>


        <label class="field">

          <span>
            COME TI SENTI?
          </span>

          <select id="pm">

            ${moods
              .filter(
                x => x !== "Tutte"
              )
              .map(
                x =>
                  `<option>${x}</option>`
              )
              .join("")}

          </select>

        </label>


        <div class="visibility-options">

          <span class="field-label">
            CHI PUÒ LEGGERLA?
          </span>


          <button
            type="button"
            data-visibility="public"
            class="visibility-option selected"
            onclick="pickVisibility('public')"
          >
            🌎

            <strong>
              Tutti
            </strong>

            <small>
              La poesia entra nel feed pubblico.
            </small>
          </button>


          <button
            type="button"
            data-visibility="followers"
            class="visibility-option"
            onclick="pickVisibility('followers')"
          >
            👥

            <strong>
              I miei follower
            </strong>

            <small>
              Solo chi ti segue può leggerla.
            </small>
          </button>


          <button
            type="button"
            data-visibility="private"
            class="visibility-option"
            onclick="pickVisibility('private')"
          >
            🔒

            <strong>
              Solo io
            </strong>

            <small>
              Resta nella tua area personale.
            </small>
          </button>

        </div>


        <input
          id="pv"
          type="hidden"
          value="public"
        >


        <div id="publishMessage"></div>


        <button
          id="publishBtn"
          class="primary publish-btn"
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


        <div class="modal-heading">

          <span class="eyebrow">
            CONVERSAZIONE
          </span>

          <h2>
            Commenti
          </h2>

        </div>


        <div id="commentList"></div>


        <div class="comment-form">

          <input
            id="commentText"
            maxlength="1000"
            placeholder="Scrivi un pensiero..."
          >

          <button
            onclick="comment()"
          >
            Invia
          </button>

        </div>

      </div>

    </div>

  `;


  currentScreen = "home";

  renderChips();
  renderProfileHeader();
  bindEditor();
}


/* =========================================================
   EDITOR
========================================================= */

function bindEditor() {

  const textarea =
    document.getElementById("pb");

  textarea?.addEventListener(
    "input",
    event => {

      const counter =
        document.getElementById(
          "bodyCount"
        );

      if (!counter) return;

      counter.textContent =
        `${event.target.value.length} / 12000`;

    }
  );


  textarea?.addEventListener(
    "keydown",
    event => {

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter"
      ) {

        event.preventDefault();

        publish();

      }

    }
  );
}


/* =========================================================
   VISIBILITÀ
========================================================= */

function pickVisibility(value) {

  const input =
    document.getElementById("pv");

  if (!input) return;

  input.value = value;


  document
    .querySelectorAll(
      ".visibility-option"
    )
    .forEach(button => {

      button.classList.toggle(
        "selected",
        button.dataset.visibility === value
      );

    });
}


/* =========================================================
   CHIPS / EMOZIONI
========================================================= */

function renderChips() {

  const element =
    document.getElementById("chips");

  if (!element) return;


  element.innerHTML =
    moods
      .map(
        value => `
          <button
            class="chip ${
              value === mood ||
              (!mood && value === "Tutte")
                ? "on"
                : ""
            }"
            onclick="setMood('${value}')"
          >
            ${escapeHTML(value)}
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

  if (
    document
      .getElementById("discover")
      ?.classList.contains("active")
  ) {
    loadDiscover();
  }
}


/* =========================================================
   FEED
========================================================= */

async function loadFeed() {

  const feed =
    document.getElementById("feed");

  if (!feed) return;


  feed.innerHTML =
    loadingState(
      "Sto cercando le parole giuste..."
    );


  try {

    const poems =
      await api(
        `/api/poems?mood=${encodeURIComponent(mood)}`
      );


    if (!poems.length) {

      feed.innerHTML =
        emptyState(
          "✍️",
          "Il feed è ancora vuoto.",
          "Potresti essere tu a lasciare il primo verso.",
          me?.role === "writer"
            ? "Scrivi una poesia"
            : "Esplora le emozioni",
          me?.role === "writer"
            ? "openEditor()"
            : "go('discover')"
        );

      return;
    }


    feed.innerHTML =
      poems
        .map(card)
        .join("");

  } catch (error) {

    feed.innerHTML =
      emptyState(
        "☁️",
        "Non riesco a caricare il feed.",
        error.message,
        "Riprova",
        "loadFeed()"
      );
  }
}


/* =========================================================
   CARD POESIA
========================================================= */

function card(poem) {

  const canFollow =
    me &&
    poem.user_id !== me.id;


  return `
    <article class="poem-card">

      <div class="poem-author">

        <div class="avatar">
          ${initials(poem.display_name)}
        </div>


        <div class="author-copy">

          <strong>
            ${escapeHTML(
              poem.display_name
            )}
          </strong>

          <span>
            @${escapeHTML(
              poem.username
            )}
          </span>

        </div>


        ${
          canFollow
            ? `
              <button
                class="follow-btn ${
                  poem.following
                    ? "following"
                    : ""
                }"
                onclick="follow(${poem.user_id})"
              >
                ${
                  poem.following
                    ? "Seguito"
                    : "Segui"
                }
              </button>
            `
            : ""
        }

      </div>


      <div class="poem-content">

        <span class="poem-mood">
          ${escapeHTML(
            poem.mood
          )}
        </span>


        <h2>
          ${escapeHTML(
            poem.title
          )}
        </h2>


        <p class="poem-body">
          ${escapeHTML(
            poem.body
          )}
        </p>

      </div>


      <div class="poem-actions">

        <button
          class="${
            poem.liked
              ? "active"
              : ""
          }"
          onclick="like(${poem.id})"
        >
          ${
            poem.liked
              ? "♥"
              : "♡"
          }

          ${poem.likes}
        </button>


        <button
          onclick="openComments(${poem.id})"
        >
          💬
          ${poem.comments}
        </button>


        <button
          class="${
            poem.saved
              ? "active"
              : ""
          }"
          onclick="save(${poem.id})"
        >
          🔖
          ${poem.saves}
        </button>


        <button
          onclick="sharePoem(${poem.id})"
        >
          ↗
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   LIKE
========================================================= */

async function like(id) {

  try {

    const result =
      await api(
        `/api/poems/${id}/like`,
        {
          method: "POST"
        }
      );

    await loadFeed();

  } catch (error) {

    handleActionError(error);

  }
}


/* =========================================================
   SALVA
========================================================= */

async function save(id) {

  try {

    await api(
      `/api/poems/${id}/save`,
      {
        method: "POST"
      }
    );

    await loadFeed();

    toast(
      "Salvata nella tua biblioteca.",
      "success"
    );

  } catch (error) {

    handleActionError(error);

  }
}


/* =========================================================
   FOLLOW
========================================================= */

async function follow(id) {

  try {

    const result =
      await api(
        `/api/users/${id}/follow`,
        {
          method: "POST"
        }
      );


    await loadFeed();


    toast(
      result.following
        ? "Ora segui questo autore."
        : "Hai smesso di seguirlo.",
      "success"
    );

  } catch (error) {

    handleActionError(error);

  }
}


/* =========================================================
   SCOPRI
========================================================= */

function scheduleDiscover() {

  clearTimeout(
    discoverTimer
  );

  discoverTimer =
    setTimeout(
      loadDiscover,
      300
    );
}


async function loadDiscover() {

  const input =
    document.getElementById(
      "search"
    );

  const results =
    document.getElementById(
      "discoverResults"
    );

  if (!input || !results) {
    return;
  }


  const query =
    input.value.trim();


  results.innerHTML =
    loadingState(
      "Ricerca in corso..."
    );


  try {

    const poems =
      await api(
        `/api/poems?q=${encodeURIComponent(query)}&mood=${encodeURIComponent(mood)}`
      );


    if (!poems.length) {

      results.innerHTML =
        emptyState(
          "⌕",
          "Nessun risultato.",
          query
            ? "Prova un'altra parola o un'emozione."
            : "Qui compariranno le poesie che potrai scoprire."
        );

      return;
    }


    results.innerHTML = `

      <div class="result-heading">

        ${
          query
            ? `Risultati per “${escapeHTML(query)}”`
            : "Ultime poesie"
        }

      </div>

      ${poems
        .map(card)
        .join("")}

    `;

  } catch (error) {

    results.innerHTML =
      emptyState(
        "☁️",
        "Ricerca non disponibile.",
        error.message,
        "Riprova",
        "loadDiscover()"
      );
  }
}


/* =========================================================
   EDITOR
========================================================= */

function openEditor(
  prefill = ""
) {

  if (!me) {
    toast(
      "Accedi per scrivere."
    );

    return;
  }


  if (
    me.role !== "writer"
  ) {

    toast(
      "Per pubblicare devi avere un profilo Scrittore."
    );

    return;
  }


  const editor =
    document.getElementById(
      "editor"
    );

  if (!editor) return;


  editor.classList.add(
    "open"
  );


  const title =
    document.getElementById("pt");

  const body =
    document.getElementById("pb");

  const moodInput =
    document.getElementById("pm");

  const message =
    document.getElementById(
      "publishMessage"
    );


  if (title) {
    title.value =
      prefill;
  }


  if (body) {
    body.value = "";
  }


  if (moodInput) {
    moodInput.value =
      "Amore";
  }


  pickVisibility(
    "public"
  );


  if (message) {
    message.innerHTML = "";
  }


  const counter =
    document.getElementById(
      "bodyCount"
    );

  if (counter) {
    counter.textContent =
      "0 / 12000";
  }


  setTimeout(
    () => title?.focus(),
    150
  );
}


/* =========================================================
   PUBBLICAZIONE
========================================================= */

async function publish() {

  if (isPublishing) {
    return;
  }


  const title =
    document
      .getElementById("pt")
      ?.value
      .trim();

  const body =
    document
      .getElementById("pb")
      ?.value
      .trim();

  const poemMood =
    document
      .getElementById("pm")
      ?.value;

  const visibility =
    document
      .getElementById("pv")
      ?.value ||
    "public";


  const message =
    document.getElementById(
      "publishMessage"
    );


  if (!title) {

    if (message) {
      message.innerHTML = `
        <div class="inline-message error">
          Inserisci un titolo.
        </div>
      `;
    }

    return;
  }


  if (!body) {

    if (message) {
      message.innerHTML = `
        <div class="inline-message error">
          Scrivi il testo della poesia.
        </div>
      `;
    }

    return;
  }


  if (!poemMood) {

    if (message) {
      message.innerHTML = `
        <div class="inline-message error">
          Scegli un'emozione.
        </div>
      `;
    }

    return;
  }


  isPublishing = true;


  const button =
    document.getElementById(
      "publishBtn"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "Pubblicazione...";
  }


  if (message) {
    message.innerHTML = "";
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


    closeM(
      "editor"
    );


    if (
      document.getElementById("pt")
    ) {
      document.getElementById(
        "pt"
      ).value = "";
    }


    if (
      document.getElementById("pb")
    ) {
      document.getElementById(
        "pb"
      ).value = "";
    }


    mood = "";

    renderChips();


    go("home");


    await loadFeed();


    if (visibility === "public") {

      toast(
        "Poesia pubblicata nel feed ✨",
        "success"
      );

    } else if (
      visibility === "followers"
    ) {

      toast(
        "Poesia pubblicata per i tuoi follower.",
        "success"
      );

    } else {

      toast(
        "Poesia salvata nella tua area privata.",
        "success"
      );

    }

  } catch (error) {

    if (message) {

      message.innerHTML = `
        <div class="inline-message error">
          ${escapeHTML(
            error.message
          )}
        </div>
      `;

    }

  } finally {

    isPublishing = false;

    if (button) {
      button.disabled = false;
      button.textContent =
        "Pubblica poesia";
    }

  }
}


/* =========================================================
   COMMENTI
========================================================= */

async function openComments(
  id
) {

  commentPoem = id;


  const list =
    document.getElementById(
      "commentList"
    );


  if (!list) return;


  list.innerHTML =
    loadingState(
      "Caricamento commenti..."
    );


  try {

    const comments =
      await api(
        `/api/poems/${id}/comments`
      );


    if (!comments.length) {

      list.innerHTML =
        emptyState(
          "💬",
          "Ancora nessun commento.",
          "Puoi essere il primo a lasciare un pensiero."
        );

    } else {

      list.innerHTML =
        comments
          .map(
            comment => `
              <div class="comment">

                <strong>
                  ${escapeHTML(
                    comment.display_name
                  )}
                </strong>

                <p>
                  ${escapeHTML(
                    comment.body
                  )}
                </p>

              </div>
            `
          )
          .join("");

    }


    document
      .getElementById("comments")
      ?.classList.add("open");


  } catch (error) {

    toast(
      error.message
    );

  }
}


async function comment() {

  const input =
    document.getElementById(
      "commentText"
    );

  if (!input || !commentPoem) {
    return;
  }


  const value =
    input.value.trim();


  if (!value) {

    toast(
      "Scrivi prima un commento."
    );

    return;
  }


  try {

    await api(
      `/api/poems/${commentPoem}/comments`,
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


    await loadFeed();


  } catch (error) {

    handleActionError(
      error
    );

  }
}


/* =========================================================
   PROFILO
========================================================= */

function renderProfileHeader() {

  const element =
    document.getElementById(
      "profileHeader"
    );

  if (!element || !me) {
    return;
  }


  const stats =
    me.stats || {};


  element.innerHTML = `

    <div class="profile-header">

      <div class="profile-top">

        <div class="profile-avatar">
          ${initials(
            me.display_name
          )}
        </div>


        <div class="profile-info">

          <span class="eyebrow">
            ${
              me.role === "writer"
                ? "SCRITTORE"
                : "LETTORE"
            }
          </span>

          <h1>
            ${escapeHTML(
              me.display_name
            )}
          </h1>

          <p>
            @${escapeHTML(
              me.username
            )}
          </p>

        </div>


        <button
          class="secondary compact"
          onclick="logout()"
        >
          Esci
        </button>

      </div>


      <p class="profile-bio">

        ${escapeHTML(
          me.bio ||
          "Scrivo ciò che non riesco a dire."
        )}

      </p>


      <div class="profile-stats">

        <div>
          <strong>
            ${stats.poems || 0}
          </strong>

          <span>
            Poesie
          </span>
        </div>


        <div>
          <strong>
            ${stats.followers || 0}
          </strong>

          <span>
            Follower
          </span>
        </div>


        <div>
          <strong>
            ${stats.following || 0}
          </strong>

          <span>
            Seguiti
          </span>
        </div>

      </div>

    </div>
  `;
}


async function loadProfile() {

  const container =
    document.getElementById(
      "myProfile"
    );


  if (!container || !me) {
    return;
  }


  container.innerHTML =
    loadingState(
      "Caricamento del profilo..."
    );


  try {

    /*
      Usiamo l'endpoint già presente
      nel server attuale, così non rendiamo
      l'app dipendente da una nuova API.
    */

    const profile =
      await api(
        `/api/users/${encodeURIComponent(
          me.username
        )}`
      );


    me = {
      ...me,
      ...profile
    };


    renderProfileHeader();


    const poems =
      Array.isArray(
        profile.poems
      )
        ? profile.poems
        : [];


    container.innerHTML = `

      <div class="profile-section-title">

        <span>
          Le mie poesie
        </span>

        ${
          me.role === "writer"
            ? `
              <button
                onclick="openEditor()"
              >
                ＋ Scrivi
              </button>
            `
            : ""
        }

      </div>


      ${
        poems.length
          ? poems
              .map(card)
              .join("")
          : emptyState(
              "📝",
              "Non hai ancora pubblicato poesie.",
              "Il tuo profilo è pronto. Manca solo il primo verso.",
              me.role === "writer"
                ? "Scrivi la prima poesia"
                : ""
              ,
              me.role === "writer"
                ? "openEditor()"
                : ""
            )
      }

    `;


  } catch (error) {

    container.innerHTML =
      emptyState(
        "☁️",
        "Profilo non disponibile.",
        error.message,
        "Riprova",
        "loadProfile()"
      );

  }
}


/* =========================================================
   ATTIVITÀ
========================================================= */

async function loadActivity() {

  const container =
    document.getElementById(
      "activities"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingState(
      "Caricamento attività..."
    );


  try {

    const notifications =
      await api(
        "/api/notifications"
      );


    if (!notifications.length) {

      container.innerHTML =
        emptyState(
          "♡",
          "Nessuna attività ancora.",
          "Quando qualcuno interagirà con le tue parole, lo vedrai qui."
        );

    } else {

      container.innerHTML =
        notifications
          .map(
            notification => `

              <div class="notification">

                <div class="notification-avatar">
                  ${initials(
                    notification.display_name ||
                    "V"
                  )}
                </div>


                <div>

                  <strong>
                    ${escapeHTML(
                      notification.display_name ||
                      "Qualcuno"
                    )}
                  </strong>


                  <p>

                    ${
                      notification.type ===
                      "follow"
                        ? "ha iniziato a seguirti."
                        : "ha interagito con una tua poesia."
                    }

                  </p>

                </div>

              </div>

            `
          )
          .join("");

    }


    /*
      Segniamo le notifiche come lette.
      Se questa API non è ancora presente
      sul server, l'errore viene ignorato.
    */

    api(
      "/api/notifications/read",
      {
        method: "POST"
      }
    ).catch(() => {});


  } catch (error) {

    container.innerHTML =
      emptyState(
        "☁️",
        "Attività non disponibile.",
        error.message,
        "Riprova",
        "loadActivity()"
      );

  }
}


/* =========================================================
   NAVIGAZIONE
========================================================= */

function go(id) {

  const target =
    document.getElementById(id);

  if (!target) {
    return;
  }


  document
    .querySelectorAll(".screen")
    .forEach(
      screen =>
        screen.classList.remove(
          "active"
        )
    );


  target.classList.add(
    "active"
  );


  currentScreen = id;


  document
    .querySelectorAll(".nav")
    .forEach(
      button =>
        button.classList.remove(
          "active"
        )
    );


  const indexes = {
    home: 0,
    discover: 1,
    activity: 3,
    profile: 4
  };


  if (
    indexes[id] !== undefined
  ) {

    document
      .querySelectorAll(".nav")
      [indexes[id]]
      ?.classList.add(
        "active"
      );

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


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


/* =========================================================
   MODALI
========================================================= */

function closeM(id) {

  document
    .getElementById(id)
    ?.classList.remove(
      "open"
    );


  if (id === "comments") {
    commentPoem = null;
  }
}


/* =========================================================
   CONDIVISIONE
========================================================= */

async function sharePoem(id) {

  /*
    Per ora creiamo un link che identifica
    la poesia. Il prossimo step sarà aprire
    direttamente la poesia dal link.
  */

  const url =
    `${window.location.origin}/?poem=${id}`;


  try {

    if (
      navigator.share
    ) {

      await navigator.share({
        title: "VERSI",
        text: "Guarda questa poesia su VERSI.",
        url
      });

      return;
    }


    if (
      navigator.clipboard
    ) {

      await navigator.clipboard.writeText(
        url
      );

      toast(
        "Link copiato.",
        "success"
      );

      return;
    }


    toast(
      "Non riesco a condividere il link."
    );

  } catch (error) {

    /*
      L'utente può semplicemente aver chiuso
      il pannello di condivisione.
    */

    if (
      error?.name !==
      "AbortError"
    ) {

      toast(
        "Condivisione non disponibile."
      );

    }

  }
}


/* =========================================================
   LOGOUT
========================================================= */

function logout(
  showMessage = true
) {

  localStorage.removeItem(
    "versi_token"
  );

  token = null;
  me = null;
  mood = "";
  commentPoem = null;


  if (showMessage) {

    toast(
      "Hai effettuato il logout.",
      "success"
    );

  }


  renderAuth();
}


/* =========================================================
   ERRORI
========================================================= */

function handleActionError(
  error
) {

  const message =
    error?.message ||
    "Si è verificato un problema.";


  toast(
    message
  );


  /*
    Se la sessione è davvero scaduta,
    riportiamo l'utente al login.
  */

  if (
    message.includes("sessione") ||
    message.includes("Accedi nuovamente")
  ) {

    setTimeout(
      () => logout(false),
      500
    );

  }
}


function showScreenError(
  screenId,
  message
) {

  const screen =
    document.getElementById(
      screenId
    );

  if (!screen) return;


  const existing =
    screen.querySelector(
      ".screen-inner"
    );

  if (!existing) return;


  const current =
    existing.querySelector(
      ".temporary-screen-error"
    );


  if (current) {
    current.remove();
  }


  const box =
    document.createElement(
      "div"
    );


  box.className =
    "temporary-screen-error inline-message error";


  box.innerHTML =
    escapeHTML(message);


  existing.prepend(box);
}


/* =========================================================
   CHIUSURA MODALI CON ESC
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape"
    ) {

      document
        .querySelectorAll(
          ".modal.open"
        )
        .forEach(
          modal =>
            modal.classList.remove(
              "open"
            )
        );

      commentPoem = null;
    }

  }
);


/* =========================================================
   CHIUSURA MODALI CLICCANDO FUORI
========================================================= */

document.addEventListener(
  "click",
  event => {

    if (
      event.target.classList.contains(
        "modal"
      )
    ) {

      event.target.classList.remove(
        "open"
      );

      if (
        event.target.id ===
        "comments"
      ) {
        commentPoem = null;
      }

    }

  }
);


/* =========================================================
   AVVIO FINALE
========================================================= */

boot();