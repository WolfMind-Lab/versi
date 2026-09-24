const API = "/api";

let token = localStorage.getItem("versi_token");
let currentUser = null;
let currentMood = "";

const $ = (id) => document.getElementById(id);

function show(id) {
  $(id)?.classList.remove("hidden");
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

function message(id, text, error = false) {
  const el = $(id);
  if (!el) return;

  el.textContent = text;
  el.className = `message ${error ? "error" : "success"}`;

  setTimeout(() => {
    el.textContent = "";
    el.className = "message";
  }, 3500);
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(API + url, {
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


/* =========================
   AUTENTICAZIONE
========================= */

function setAuthenticated(data) {
  token = data.token;
  currentUser = data.user;

  localStorage.setItem("versi_token", token);

  hide("auth-screen");
  show("app");

  loadHome();
  loadProfile();
}

function logout() {
  token = null;
  currentUser = null;

  localStorage.removeItem("versi_token");

  hide("app");
  show("auth-screen");

  $("login-password").value = "";
}


/* LOGIN */

$("login-btn")?.addEventListener("click", async () => {
  const identifier = $("login-identifier").value.trim();
  const password = $("login-password").value;

  if (!identifier || !password) {
    message("auth-message", "Inserisci username/email e password.", true);
    return;
  }

  try {
    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password
      })
    });

    setAuthenticated(data);

  } catch (error) {
    message("auth-message", error.message, true);
  }
});


/* REGISTRAZIONE */

$("register-btn")?.addEventListener("click", async () => {

  const displayName = $("register-display").value.trim();
  const username = $("register-username").value.trim();
  const email = $("register-email").value.trim();
  const password = $("register-password").value;

  const role =
    document.querySelector('input[name="role"]:checked')?.value ||
    "reader";

  if (!displayName || !username || !email || !password) {
    message(
      "auth-message",
      "Compila tutti i campi.",
      true
    );
    return;
  }

  try {

    const data = await api("/register", {
      method: "POST",
      body: JSON.stringify({
        displayName,
        username,
        email,
        password,
        role
      })
    });

    setAuthenticated(data);

  } catch (error) {
    message("auth-message", error.message, true);
  }
});


/* CAMBIO LOGIN / REGISTRAZIONE */

$("show-register")?.addEventListener("click", () => {
  hide("login-box");
  show("register-box");
});

$("show-login")?.addEventListener("click", () => {
  hide("register-box");
  show("login-box");
});

$("logout-btn")?.addEventListener("click", logout);


/* =========================
   NAVIGAZIONE
========================= */

document.querySelectorAll(".nav-btn").forEach(button => {

  button.addEventListener("click", () => {

    const viewId = button.dataset.view;

    document.querySelectorAll(".view").forEach(view => {
      view.classList.remove("active");
    });

    $(viewId)?.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");

    if (viewId === "home-view") {
      loadHome();
    }

    if (viewId === "profile-view") {
      loadProfile();
    }

    if (viewId === "notifications-view") {
      loadNotifications();
    }

  });

});


/* =========================
   FEED
========================= */

async function loadHome() {

  const feed = $("feed");

  if (!feed) return;

  feed.innerHTML = `
    <div class="loading">
      Sto cercando parole per te...
    </div>
  `;

  try {

    const query =
      currentMood
        ? `?mood=${encodeURIComponent(currentMood)}`
        : "";

    const poems = await api(`/poems${query}`);

    renderPoems(feed, poems);

  } catch (error) {

    feed.innerHTML = `
      <div class="empty">
        <h3>Non riesco a caricare le poesie.</h3>
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

  }
}


/* FILTRI EMOZIONI */

document.querySelectorAll(".mood").forEach(button => {

  button.addEventListener("click", () => {

    document.querySelectorAll(".mood").forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");

    currentMood = button.dataset.mood || "";

    loadHome();
  });

});


/* =========================
   RENDER POESIE
========================= */

function renderPoems(container, poems) {

  container.innerHTML = "";

  if (!poems.length) {

    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">♡</div>
        <h3>Ancora nessun verso.</h3>
        <p>
          Potrebbe essere il momento giusto
          per scriverne uno.
        </p>
      </div>
    `;

    return;
  }

  poems.forEach(poem => {

    const template = $("poem-template");

    if (!template) return;

    const card =
      template.content.cloneNode(true);

    const article =
      card.querySelector(".poem-card");

    article.dataset.id = poem.id;

    const avatar =
      card.querySelector(".avatar");

    avatar.textContent =
      (poem.display_name || poem.username || "?")
        .charAt(0)
        .toUpperCase();

    card.querySelector(".author-name").textContent =
      poem.display_name;

    card.querySelector(".author-username").textContent =
      "@" + poem.username;

    card.querySelector(".poem-mood").textContent =
      poem.mood;

    card.querySelector(".poem-title").textContent =
      poem.title;

    card.querySelector(".poem-body").textContent =
      poem.body;

    card.querySelector(".like-count").textContent =
      poem.likes || 0;

    card.querySelector(".comment-count").textContent =
      poem.comments || 0;

    card.querySelector(".save-count").textContent =
      poem.saves || 0;


    /* LIKE */

    const likeButton =
      card.querySelector(".like-btn");

    if (poem.liked) {
      likeButton.classList.add("active");
      likeButton.firstChild.textContent = "♥ ";
    }

    likeButton.addEventListener("click", async () => {

      try {

        const updated =
          await api(`/poems/${poem.id}/like`, {
            method: "POST"
          });

        likeButton.classList.toggle(
          "active",
          updated.liked
        );

        likeButton.firstChild.textContent =
          updated.liked ? "♥ " : "♡ ";

        likeButton.querySelector(
          ".like-count"
        ).textContent = updated.likes;

      } catch (error) {
        alert(error.message);
      }

    });


    /* SALVA */

    const saveButton =
      card.querySelector(".save-btn");

    if (poem.saved) {
      saveButton.classList.add("active");
    }

    saveButton.addEventListener("click", async () => {

      try {

        const updated =
          await api(`/poems/${poem.id}/save`, {
            method: "POST"
          });

        saveButton.classList.toggle(
          "active",
          updated.saved
        );

        saveButton.querySelector(
          ".save-count"
        ).textContent = updated.saves;

      } catch (error) {
        alert(error.message);
      }

    });


    /* FOLLOW */

    const followButton =
      card.querySelector(".follow-btn");

    if (poem.user_id === currentUser?.id) {

      followButton.style.display = "none";

    } else {

      if (poem.following) {
        followButton.textContent = "Segui già";
        followButton.classList.add("following");
      }

      followButton.addEventListener("click", async () => {

        try {

          const result =
            await api(`/users/${poem.user_id}/follow`, {
              method: "POST"
            });

          followButton.textContent =
            result.following
              ? "Segui già"
              : "Segui";

          followButton.classList.toggle(
            "following",
            result.following
          );

        } catch (error) {
          alert(error.message);
        }

      });

    }


    /* COMMENTI */

    const commentButton =
      card.querySelector(".comment-btn");

    const commentsBox =
      card.querySelector(".comments");

    commentButton.addEventListener("click", async () => {

      commentsBox.classList.toggle("hidden");

      if (!commentsBox.classList.contains("hidden")) {
        await loadComments(
          poem.id,
          commentsBox
        );
      }

    });


    const commentForm =
      card.querySelector(".comment-form");

    commentForm.addEventListener("submit", async event => {

      event.preventDefault();

      const input =
        commentForm.querySelector("input");

      const body =
        input.value.trim();

      if (!body) return;

      try {

        await api(`/poems/${poem.id}/comments`, {
          method: "POST",
          body: JSON.stringify({ body })
        });

        input.value = "";

        await loadComments(
          poem.id,
          commentsBox
        );

        const count =
          commentsBox
            .closest(".poem-card")
            .querySelector(".comment-count");

        count.textContent =
          Number(count.textContent) + 1;

      } catch (error) {
        alert(error.message);
      }

    });


    container.appendChild(card);

  });

}


/* =========================
   COMMENTI
========================= */

async function loadComments(poemId, box) {

  const list =
    box.querySelector(".comments-list");

  list.innerHTML = `
    <div class="loading-small">
      Caricamento...
    </div>
  `;

  try {

    const comments =
      await api(`/poems/${poemId}/comments`);

    list.innerHTML = "";

    if (!comments.length) {

      list.innerHTML = `
        <p class="no-comments">
          Ancora nessun commento.
        </p>
      `;

      return;
    }

    comments.forEach(comment => {

      const item =
        document.createElement("div");

      item.className = "comment";

      item.innerHTML = `
        <strong>${escapeHTML(comment.display_name)}</strong>
        <p>${escapeHTML(comment.body)}</p>
      `;

      list.appendChild(item);

    });

  } catch (error) {

    list.innerHTML = `
      <p class="error">${escapeHTML(error.message)}</p>
    `;

  }

}


/* =========================
   PUBBLICAZIONE
========================= */

$("poem-form")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const title =
      $("poem-title").value.trim();

    const body =
      $("poem-body").value.trim();

    const mood =
      $("poem-mood").value;

    const visibility =
      $("poem-visibility").value;

    if (!title || !body || !mood) {

      message(
        "poem-message",
        "Inserisci titolo, testo ed emozione.",
        true
      );

      return;
    }

    try {

      await api("/poems", {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          mood,
          visibility
        })
      });

      $("poem-form").reset();

      message(
        "poem-message",
        "La tua poesia è stata pubblicata."
      );

      setTimeout(() => {

        document
          .querySelector('[data-view="home-view"]')
          ?.click();

      }, 800);

    } catch (error) {

      message(
        "poem-message",
        error.message,
        true
      );

    }

  }
);


/* =========================
   RICERCA
========================= */

$("search-btn")?.addEventListener(
  "click",
  search
);

$("search-input")?.addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {
      search();
    }

  }
);


async function search() {

  const input =
    $("search-input");

  const value =
    input.value.trim();

  const container =
    $("discover-results");

  if (!value) {

    container.innerHTML = `
      <div class="empty">
        <h3>Cosa stai cercando?</h3>
        <p>
          Cerca una parola, un titolo
          o il nome di un autore.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="loading">
      Sto cercando...
    </div>
  `;

  try {

    const poems =
      await api(
        `/poems?q=${encodeURIComponent(value)}`
      );

    renderPoems(container, poems);

  } catch (error) {

    container.innerHTML = `
      <div class="empty">
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

  }

}


/* =========================
   PROFILO
========================= */

async function loadProfile() {

  if (!currentUser) return;

  const container =
    $("profile-content");

  container.innerHTML = `
    <div class="loading">
      Caricamento profilo...
    </div>
  `;

  try {

    const profile =
      await api(
        `/users/${encodeURIComponent(currentUser.username)}`
      );

    container.innerHTML = `
      <div class="profile-header">

        <div class="profile-avatar">
          ${escapeHTML(
            profile.display_name.charAt(0).toUpperCase()
          )}
        </div>

        <h1>${escapeHTML(profile.display_name)}</h1>

        <p class="profile-username">
          @${escapeHTML(profile.username)}
        </p>

        <span class="profile-role">
          ${
            profile.role === "writer"
              ? "✍️ Scrittore"
              : "📖 Lettore"
          }
        </span>

        <p class="profile-bio">
          ${escapeHTML(profile.bio || "Ancora nessuna biografia.")}
        </p>

        <div class="profile-stats">

          <div>
            <strong>${profile.poems.length}</strong>
            <span>Poesie</span>
          </div>

          <div>
            <strong>${profile.followers}</strong>
            <span>Follower</span>
          </div>

          <div>
            <strong>${profile.following}</strong>
            <span>Seguiti</span>
          </div>

        </div>

      </div>

      <div class="profile-poems">
        <h2>Le mie poesie</h2>
        <div id="my-poems" class="feed"></div>
      </div>
    `;

    renderPoems(
      $("my-poems"),
      profile.poems
    );

  } catch (error) {

    container.innerHTML = `
      <div class="empty">
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

  }

}


/* =========================
   NOTIFICHE
========================= */

$("notification-btn")?.addEventListener(
  "click",
  () => {
    document
      .querySelector('[data-view="notifications-view"]')
      ?.click();
  }
);


async function loadNotifications() {

  const list =
    $("notifications-list");

  if (!list) return;

  list.innerHTML = `
    <div class="loading">
      Caricamento...
    </div>
  `;

  try {

    const notifications =
      await api("/notifications");

    list.innerHTML = "";

    if (!notifications.length) {

      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">♡</div>
          <h3>Nessuna attività.</h3>
          <p>
            Quando qualcuno interagirà
            con te, apparirà qui.
          </p>
        </div>
      `;

      return;
    }

    notifications.forEach(notification => {

      const item =
        document.createElement("div");

      item.className = "notification";

      let text = "ha interagito con te.";

      if (notification.type === "follow") {
        text = "ha iniziato a seguirti.";
      }

      if (notification.type === "comment") {
        text = "ha commentato una tua poesia.";
      }

      item.innerHTML = `
        <div class="notification-avatar">
          ${escapeHTML(
            (notification.display_name || "?")
              .charAt(0)
              .toUpperCase()
          )}
        </div>

        <div>
          <strong>
            ${escapeHTML(
              notification.display_name || "Qualcuno"
            )}
          </strong>

          <p>${text}</p>
        </div>
      `;

      list.appendChild(item);

    });

  } catch (error) {

    list.innerHTML = `
      <div class="empty">
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

  }

}


/* =========================
   UTILITY
========================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================
   AVVIO
========================= */

async function init() {

  if (!token) {
    show("auth-screen");
    hide("app");
    return;
  }

  try {

    currentUser =
      await api("/me");

    hide("auth-screen");
    show("app");

    await loadHome();
    await loadProfile();

  } catch {

    logout();

  }

}

init();