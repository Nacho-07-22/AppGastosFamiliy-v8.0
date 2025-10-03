/* app.js - Control de Gastos Familiar
   Cambios principales:
   - 15 categorías con iconos
   - campo tipo (Fijo / Variable)
   - reportes combinados entre usuarios
   - gráficos: por categoría (pie), mensual (bar), tendencia (line)
   - soporte opcional en la "nube" usando Firebase Auth + Firestore si se crea firebase-config.js
*/

// --- Utilidades de almacenamiento local ---
let usuarios = [];
function cargarUsuarios() {
  const data = localStorage.getItem("usuariosFamilia");
  usuarios = data ? JSON.parse(data) : [];
}
function guardarUsuarios() {
  localStorage.setItem("usuariosFamilia", JSON.stringify(usuarios));
}

let usuarioActual = null;
let gastos = {}; // { usuario: [ {desc,monto,categoria,tipo,fecha,ts,id} ] }

function cargarGastos() {
  const data = localStorage.getItem("gastosFamilia");
  gastos = data ? JSON.parse(data) : {};
}
function guardarGastos() {
  localStorage.setItem("gastosFamilia", JSON.stringify(gastos));
}

// --- Firebase (opcional) ---
let firebaseEnabled = false;
let auth = null;
let db = null;
if (typeof firebase !== "undefined" && window.firebaseConfig) {
  try {
    firebase.initializeApp(window.firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseEnabled = true;
    console.info("Firebase inicializado: sincronización en la nube activada.");
  } catch (e) {
    console.warn("No se pudo inicializar Firebase:", e);
    firebaseEnabled = false;
  }
}

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
const userGreeting = document.getElementById("user-greeting");
const logoutBtn = document.getElementById("logout-btn");

const registroSection = document.getElementById("registro-section");
const showRegistroBtn = document.getElementById("show-registro-btn");
const backLoginBtn = document.getElementById("back-login-btn");
const registroForm = document.getElementById("registro-form");
const registroError = document.getElementById("registro-error");

const navBtns = document.querySelectorAll(".nav-btn");
const pages = {
  inicio: document.getElementById("inicio-section"),
  gastos: document.getElementById("gastos-section"),
  reportes: document.getElementById("reportes-section"),
  usuarios: document.getElementById("usuarios-section"),
};

const gastoForm = document.getElementById("gasto-form");
const gastosList = document.getElementById("gastos-list");
const categoriaGasto = document.getElementById("categoria-gasto");
const tipoGasto = document.getElementById("tipo-gasto");

// Charts
let graficoCategorias = null;
let graficoMensual = null;
let graficoTrend = null;

// --- Navegación ---
navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    Object.values(pages).forEach((p) => (p.style.display = "none"));
    pages[btn.dataset.section].style.display = "block";
    if (btn.dataset.section === "reportes") mostrarReporte();
    if (btn.dataset.section === "usuarios") mostrarUsuarios();
    if (btn.dataset.section === "gastos") mostrarGastos();
  });
});

showRegistroBtn.onclick = () => {
  loginSection.style.display = "none";
  registroSection.style.display = "block";
};
backLoginBtn.onclick = () => {
  registroSection.style.display = "none";
  loginSection.style.display = "block";
};

// --- Registro ---
registroForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("new-username").value.trim();
  const email = document.getElementById("new-email").value.trim();
  const password = document.getElementById("new-password").value;
  if (!username || !email || !password) {
    registroError.textContent = "Completa todos los campos.";
    return;
  }
  cargarUsuarios();

  if (firebaseEnabled) {
    // verificar lista blanca si existe
    if (allowedUsers) {
      const allowedEmail = (allowedUsers.emails || []).includes(email);
      const allowedUsername = (allowedUsers.usernames || []).includes(username);
      if (!allowedEmail && !allowedUsername) {
        registroError.textContent =
          "No estás autorizado para registrarte en esta instancia.";
        return;
      }
    }
    // Registrar con Firebase Auth
    try {
      const userCred = await auth.createUserWithEmailAndPassword(
        email,
        password
      );
      const uid = userCred.user.uid;
      // Guardar perfil en Firestore
      await db.collection("users").doc(uid).set({
        username,
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      registroError.textContent = "";
      registroForm.reset();
      registroSection.style.display = "none";
      loginSection.style.display = "block";
      loginError.textContent =
        "Usuario registrado en la nube. Inicia sesión con tu email.";
    } catch (err) {
      registroError.textContent =
        err.message || "Error al registrar en la nube.";
    }
  } else {
    // verificar lista blanca local si existe
    if (allowedUsers) {
      const allowedEmail = (allowedUsers.emails || []).includes(email);
      const allowedUsername = (allowedUsers.usernames || []).includes(username);
      if (!allowedEmail && !allowedUsername) {
        registroError.textContent =
          "No estás autorizado para registrarte en esta instancia.";
        return;
      }
    }
    // Registro local fallback
    if (usuarios.find((u) => u.usuario === username || u.email === email)) {
      registroError.textContent = "Usuario o email ya existe.";
      return;
    }
    usuarios.push({ usuario: username, email, password });
    guardarUsuarios();
    registroError.textContent = "";
    registroForm.reset();
    registroSection.style.display = "none";
    loginSection.style.display = "block";
    loginError.textContent =
      "Usuario registrado localmente. Ahora puedes iniciar sesión.";
  }
});

// --- Login ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const identifier = document.getElementById("username").value.trim(); // puede ser email o usuario
  const password = document.getElementById("password").value;
  if (!identifier || !password) {
    loginError.textContent = "Completa ambos campos.";
    return;
  }
  if (firebaseEnabled) {
    // interpretar como email si contiene '@'
    const email = identifier.includes("@") ? identifier : null;
    // si hay lista blanca, verificar que el identificador esté permitido
    if (allowedUsers) {
      const allowedEmail = email && (allowedUsers.emails || []).includes(email);
      const allowedUsername = (allowedUsers.usernames || []).includes(
        identifier
      );
      if (!allowedEmail && !allowedUsername) {
        loginError.textContent =
          "No estás autorizado para acceder a esta instancia.";
        return;
      }
    }
    try {
      if (email) {
        await auth.signInWithEmailAndPassword(email, password);
        const uid = auth.currentUser.uid;
        const doc = await db.collection("users").doc(uid).get();
        const data = doc.exists ? doc.data() : { username: email };
        usuarioActual = data.username || identifier;
      } else {
        // buscar por username en Firestore
        const q = await db
          .collection("users")
          .where("username", "==", identifier)
          .limit(1)
          .get();
        if (!q.empty) {
          const doc = q.docs[0];
          const userEmail = doc.data().email;
          await auth.signInWithEmailAndPassword(userEmail, password);
          usuarioActual = identifier;
        } else {
          loginError.textContent = "Usuario no encontrado en la nube.";
          return;
        }
      }

      // al iniciar sesión, sincronizar datos y mostrar app
      loginSection.style.display = "none";
      appSection.style.display = "block";
      userGreeting.textContent = `Hola, ${usuarioActual}`;
      await sincronizarDesdeNube();
      mostrarGastos();
    } catch (err) {
      loginError.textContent =
        err.message || "Error al iniciar sesión en la nube.";
    }
  } else {
    // login local
    cargarUsuarios();
    const user = usuarios.find(
      (u) =>
        (u.usuario === identifier || u.email === identifier) &&
        u.password === password
    );
    if (user) {
      usuarioActual = user.usuario;
      loginSection.style.display = "none";
      appSection.style.display = "block";
      userGreeting.textContent = `Hola, ${usuarioActual}`;
      mostrarGastos();
    } else {
      loginError.textContent = "Usuario o contraseña incorrectos.";
    }
  }
});

logoutBtn.addEventListener("click", async () => {
  usuarioActual = null;
  if (firebaseEnabled && auth.currentUser) await auth.signOut();
  loginSection.style.display = "block";
  appSection.style.display = "none";
  loginForm.reset();
  loginError.textContent = "";
  // Intentar cerrar la pestaña si el navegador lo permite
  try {
    window.close();
    // Si window.close() no funciona, mostrar un mensaje suave al usuario
    setTimeout(() => {
      if (!window.closed) {
        const msg = document.createElement("div");
        msg.style.cssText =
          "position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg1);display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;z-index:9999;";
        msg.innerHTML =
          "<div><h2>Sesión cerrada</h2><p>Puedes cerrar esta pestaña de forma segura.</p></div>";
        document.body.appendChild(msg);
      }
    }, 500);
  } catch (e) {
    console.warn("No se pudo cerrar la pestaña automáticamente");
  }
});

// --- Gastos: crear, editar, eliminar ---
gastoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!usuarioActual) {
    loginError.textContent = "Inicia sesión primero.";
    return;
  }
  const desc = document.getElementById("desc-gasto").value.trim();
  const monto = parseFloat(document.getElementById("monto-gasto").value);
  const categoria = categoriaGasto.value;
  const tipo = tipoGasto ? tipoGasto.value : "Variable";
  if (!desc || isNaN(monto) || !categoria) return;
  const gasto = {
    desc,
    monto,
    categoria,
    tipo,
    fecha: new Date().toISOString(),
    ts: Date.now(),
  };

  // guardar local
  cargarGastos();
  if (!gastos[usuarioActual]) gastos[usuarioActual] = [];
  gastos[usuarioActual].push(gasto);
  guardarGastos();

  // sincronizar con la nube si está activo
  if (firebaseEnabled && auth.currentUser) {
    try {
      await db.collection("gastos").add({
        usuario: usuarioActual,
        uid: auth.currentUser.uid,
        ...gasto,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn("Error subiendo gasto a la nube:", err.message);
    }
  }

  mostrarGastos();
  gastoForm.reset();
});

function editarGasto(e) {
  const idx = e.target.dataset.idx;
  cargarGastos();
  const gasto = gastos[usuarioActual][idx];
  document.getElementById("desc-gasto").value = gasto.desc;
  document.getElementById("monto-gasto").value = gasto.monto;
  if (tipoGasto) tipoGasto.value = gasto.tipo || "Variable";
  if (categoriaGasto) categoriaGasto.value = gasto.categoria || "";
  // eliminar temporariamente; al guardar se re-crea
  gastos[usuarioActual].splice(idx, 1);
  guardarGastos();
  mostrarGastos();
}

async function eliminarGasto(e) {
  const idx = e.target.dataset.idx;
  cargarGastos();
  const gasto = gastos[usuarioActual][idx];
  if (
    !confirm(
      `¿Seguro que deseas eliminar el gasto '${gasto.desc}' de ₡${formatColones(
        gasto.monto
      )}? Esta acción no se puede deshacer.`
    )
  )
    return;
  // Eliminar de la nube si está activo primero
  if (firebaseEnabled && db && auth.currentUser) {
    try {
      // Buscar el gasto por ts y uid en Firestore
      const q = await db
        .collection("gastos")
        .where("uid", "==", auth.currentUser.uid)
        .where("ts", "==", gasto.ts)
        .limit(1)
        .get();
      if (!q.empty) {
        await db.collection("gastos").doc(q.docs[0].id).delete();
      }
    } catch (err) {
      console.warn("Error al eliminar gasto en la nube:", err.message);
    }
  }
  // Eliminar de local
  gastos[usuarioActual].splice(idx, 1);
  guardarGastos();
  // Sincronizar gastos locales con la nube (descargar de nuevo)
  if (firebaseEnabled && db && auth.currentUser) {
    await sincronizarDesdeNube();
  }
  mostrarGastos();
  await mostrarReporte();
}

// --- Mostrar gastos del usuario ---
function mostrarGastos() {
  cargarGastos();
  const lista = gastos[usuarioActual] || [];
  gastosList.innerHTML = "";
  let total = 0;
  lista.forEach((g, i) => {
    total += g.monto;
    const icono = obtenerIconoCategoria(g.categoria);
    const montoFormateado = formatColones(g.monto);
    const hora = g.fecha
      ? new Date(g.fecha).toLocaleTimeString("es-CR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const li = document.createElement("li");
    li.innerHTML = `<span>💵 ${icono} ${new Date(
      g.fecha
    ).toLocaleDateString()} ${hora} - ${escapeHtml(g.desc)} <small>(${
      g.categoria
    } · ${
      g.tipo || "Variable"
    } · ${usuarioActual})</small></span><span>₡${montoFormateado}</span> <button class='edit-btn' data-idx='${i}'>✏️</button> <button class='delete-btn' data-idx='${i}'>🗑️</button>`;
    gastosList.appendChild(li);
  });
  document.getElementById(
    "reporte-total"
  ).textContent = `Total: ₡${formatColones(total)}`;
  document
    .querySelectorAll(".edit-btn")
    .forEach((btn) => (btn.onclick = editarGasto));
  document
    .querySelectorAll(".delete-btn")
    .forEach((btn) => (btn.onclick = eliminarGasto));
}

// --- Reportes combinados y gráficos ---
async function mostrarReporte() {
  // obtener todos los gastos (local + nube si aplica)
  cargarGastos();
  let allGastos = [];
  // agregar locales
  Object.keys(gastos).forEach((u) => {
    (gastos[u] || []).forEach((g) => allGastos.push({ usuario: u, ...g }));
  });
  // si hay nube, obtener gastos de Firestore y fusionar (evitar duplicados por ts)
  if (firebaseEnabled && db) {
    try {
      const snapshot = await db.collection("gastos").get();
      const nubeGastos = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        nubeGastos.push({
          usuario: d.usuario || d.uid,
          desc: d.desc,
          monto: d.monto,
          categoria: d.categoria,
          tipo: d.tipo || "Variable",
          fecha:
            d.fecha ||
            (d.createdAt &&
              d.createdAt.toDate &&
              d.createdAt.toDate().toISOString()) ||
            new Date().toISOString(),
          ts: d.ts || Date.now(),
        });
      });
      // Filtrar duplicados y gastos eliminados
      // Solo mantener gastos que existen en la nube y no han sido eliminados localmente
      const localTs = new Set();
      Object.values(gastos).forEach((arr) =>
        arr.forEach((g) => localTs.add(g.ts))
      );
      // Si el gasto existe en la nube pero no en local, lo agregamos
      nubeGastos.forEach((g) => {
        if (!localTs.has(g.ts)) {
          allGastos.push(g);
        }
      });
    } catch (err) {
      console.warn("No se pudo leer gastos de la nube:", err.message);
    }
  }
  // Advertencia si no hay gastos
  const reporteTotal = document.getElementById("reporte-total");
  if (allGastos.length === 0) {
    reporteTotal.innerHTML =
      '<span style="color:#fdcb6e;font-size:1.2em;"><i class="fa-solid fa-house"></i> No hay gastos registrados para mostrar.</span>';
    // Limpiar gráficos
    ["grafico-gastos", "grafico-mensual", "grafico-trend"].forEach((id) => {
      const ctx = document.getElementById(id).getContext("2d");
      ctx.clearRect(0, 0, 300, 150);
      if (window[id + "_chart"]) window[id + "_chart"].destroy();
    });
    return;
  }

  // --- Agregados por categoría (para pie) ---
  const categorias = {};
  allGastos.forEach((g) => {
    categorias[g.categoria] =
      (categorias[g.categoria] || 0) + Number(g.monto || 0);
  });
  const labels = Object.keys(categorias);
  const data = Object.values(categorias);
  renderPie("grafico-gastos", labels, data);

  // --- Mensual (últimos 12 meses) ---
  const monthly = {}; // 'YYYY-MM'
  allGastos.forEach((g) => {
    const d = new Date(g.fecha);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    monthly[key] = (monthly[key] || 0) + Number(g.monto || 0);
  });
  // ordenar últimos 12 meses
  const months = lastNMonths(12);
  const monthlyData = months.map((m) => monthly[m] || 0);
  renderBar("grafico-mensual", months, monthlyData);

  // --- Tendencia (últimos 6 meses) ---
  const months6 = lastNMonths(6);
  const trendData = months6.map((m) => monthly[m] || 0);
  renderLine("grafico-trend", months6, trendData);

  // total combinado
  const totalAll = allGastos.reduce((s, g) => s + Number(g.monto || 0), 0);
  document.getElementById(
    "reporte-total"
  ).textContent = `Total combinado: ₡${formatColones(totalAll)}`;
}

function renderPie(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (window[canvasId + "_chart"]) window[canvasId + "_chart"].destroy();
  window[canvasId + "_chart"] = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data, backgroundColor: palette(labels.length) }],
    },
    options: { plugins: { legend: { position: "bottom" } } },
  });
}
function renderBar(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (window[canvasId + "_chart"]) window[canvasId + "_chart"].destroy();
  window[canvasId + "_chart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Gastos", data, backgroundColor: "#ffa99f" }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}
function renderLine(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (window[canvasId + "_chart"]) window[canvasId + "_chart"].destroy();
  window[canvasId + "_chart"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Tendencia",
          data,
          borderColor: "#2ecc71",
          backgroundColor: "rgba(46,204,113,0.2)",
          fill: true,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function lastNMonths(n) {
  const res = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return res;
}

function palette(n) {
  const base = [
    "#3498db",
    "#e67e22",
    "#2ecc71",
    "#e74c3c",
    "#9b59b6",
    "#95a5a6",
    "#f1c40f",
    "#1abc9c",
    "#e84393",
    "#fdcb6e",
    "#6c5ce7",
    "#00b894",
  ];
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}

// --- Iconos por categoría extendidos ---
function obtenerIconoCategoria(cat) {
  switch (cat) {
    case "Alimentación":
      return "🍔";
    case "Transporte":
      return "🚗";
    case "Salud":
      return "🩺";
    case "Educación":
      return "📚";
    case "Hogar":
      return "🏠";
    case "Servicios":
      return "💡";
    case "Comunicación":
      return "📱";
    case "Ropa":
      return "👗";
    case "Mascotas":
      return "🐶";
    case "Viajes":
      return "✈️";
    case "Regalos":
      return "🎁";
    case "Impuestos":
      return "🧾";
    case "Ahorro":
      return "💰";
    case "Trabajo":
      return "💼";
    case "Ocio":
      return "🎉";
    case "Otros":
      return "🛒";
    default:
      return "💵";
  }
}

// --- Formatos ---
function formatColones(monto) {
  try {
    return Number(monto).toLocaleString("es-CR");
  } catch (e) {
    return monto;
  }
}
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

// --- Sincronización con la nube (lectura inicial) ---
async function sincronizarDesdeNube() {
  if (!firebaseEnabled || !db) return;
  // traer gastos del usuario y fusionar en local
  try {
    const snapshot = await db
      .collection("gastos")
      .where("uid", "==", auth.currentUser.uid)
      .get();
    cargarGastos();
    if (!gastos[usuarioActual]) gastos[usuarioActual] = [];
    snapshot.forEach((doc) => {
      const d = doc.data();
      // evitar duplicados por ts
      if (!gastos[usuarioActual].some((x) => x.ts === d.ts)) {
        gastos[usuarioActual].push({
          desc: d.desc,
          monto: d.monto,
          categoria: d.categoria,
          tipo: d.tipo || "Variable",
          fecha: d.fecha || new Date().toISOString(),
          ts: d.ts || Date.now(),
        });
      }
    });
    guardarGastos();
  } catch (err) {
    console.warn("Error sincronizando desde la nube:", err.message);
  }
}

// --- Mostrar lista de usuarios ---
function mostrarUsuarios() {
  const ul = document.getElementById("usuarios-list");
  ul.innerHTML = "";
  cargarUsuarios();
  usuarios.forEach((u) => {
    const li = document.createElement("li");
    li.innerHTML = `<i class="fa-solid fa-user"></i> ${escapeHtml(
      u.usuario || u.email || "Usuario"
    )} <button class='delete-user-btn' data-username='${
      u.usuario
    }'>Eliminar</button>`;
    ul.appendChild(li);
  });
  document.querySelectorAll(".delete-user-btn").forEach((btn) => {
    btn.onclick = borrarUsuario;
  });
  // si firebase está activado, mostrar usuarios desde la nube (opcional)
  if (firebaseEnabled && db) {
    db.collection("users")
      .limit(50)
      .get()
      .then((snapshot) => {
        snapshot.forEach((doc) => {
          const d = doc.data();
          const li = document.createElement("li");
          li.innerHTML = `<i class=\"fa-solid fa-user\"></i> ${escapeHtml(
            d.username || d.email
          )} <button class='delete-user-btn-nube' data-uid='${
            doc.id
          }'>Eliminar</button>`;
          ul.appendChild(li);
        });
        document.querySelectorAll(".delete-user-btn-nube").forEach((btn) => {
          btn.onclick = borrarUsuarioNube;
        });
      })
      .catch(() => {});
  }
}

function borrarUsuario(e) {
  const username = e.target.dataset.username;
  if (
    !confirm(
      `¿Seguro que deseas eliminar el usuario '${username}'? Esta acción no se puede deshacer y eliminará todos sus gastos.`
    )
  )
    return;
  cargarUsuarios();
  usuarios = usuarios.filter((u) => u.usuario !== username);
  guardarUsuarios();
  // Eliminar gastos del usuario
  cargarGastos();
  delete gastos[username];
  guardarGastos();
  mostrarUsuarios();
  mostrarGastos();
  mostrarReporte();
}

async function borrarUsuarioNube(e) {
  const uid = e.target.dataset.uid;
  if (
    !confirm(
      "¿Seguro que deseas eliminar tu cuenta en la nube? Esta acción no se puede deshacer."
    )
  )
    return;
  if (firebaseEnabled && auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await auth.currentUser.delete();
      await db.collection("users").doc(uid).delete();
      alert("Tu cuenta en la nube ha sido eliminada.");
      usuarioActual = null;
      loginSection.style.display = "block";
      appSection.style.display = "none";
      mostrarUsuarios();
    } catch (err) {
      alert("Error al eliminar usuario en la nube: " + (err.message || ""));
    }
  } else {
    alert(
      "Solo puedes eliminar tu propia cuenta en la nube desde este dispositivo."
    );
  }
}

// --- Modo oscuro ---
const toggleDarkBtn = document.getElementById("toggle-dark-btn");
function aplicarModoOscuro() {
  if (localStorage.getItem("modoOscuro") === "true") {
    document.body.classList.add("dark-mode");
    toggleDarkBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  } else {
    document.body.classList.remove("dark-mode");
    toggleDarkBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
  }
}
toggleDarkBtn.onclick = () => {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("modoOscuro", isDark ? "true" : "false");
  toggleDarkBtn.innerHTML = isDark
    ? '<i class="fa-solid fa-sun"></i>'
    : '<i class="fa-solid fa-moon"></i>';
};
aplicarModoOscuro();

// --- Inicializar (cargar local y mostrar login) ---
cargarUsuarios();
cargarGastos();
// aplicar preferencia de modo oscuro si existe (ya manejado en otro bloque)

// mostrar la página de login por defecto
loginSection.style.display = "block";
appSection.style.display = "none";

// Exponer funciones para consola si es necesario
window._app = { cargarGastos, guardarGastos, mostrarGastos, mostrarReporte };

/* Fin de app.js */
