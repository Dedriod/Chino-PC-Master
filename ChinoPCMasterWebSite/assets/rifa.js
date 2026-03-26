// SISTEMA DE RIFA - App Web Simplificada

// Si despliegas una nueva versión del Web App, actualiza solo esta URL base:
const RIFA_WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbyO8nLuIt9JdYOFWOT4gS409Ti0JHMWqWrtZOO1UDaWp9vmkIceDsrllKia-i99cq50Yw/exec";

// Google Apps Script a veces demora o la red bloquea la petición; sin límite el UI queda en "Cargando…" para siempre
const RIFA_FETCH_TIMEOUT_MS = 22000;

let datosRifa = {}; // Almacenar todos los datos { numero: { estado, nombre } }
let numerosSeleccionados = [];
let cfg = {};
/** Filas de la hoja Config para el modal: { row, label, value } */
let configFilasUI = [];

/** Solo filas 2–6 de Config (objeto, fecha, modalidad, WhatsApp, precio). */
const RIFA_CONFIG_FILA_DEFS = [
    { row: 2, label: "Objeto", key: "objeto" },
    { row: 3, label: "Fecha", key: "fecha" },
    { row: 4, label: "Modalidad", key: "modalidad" },
    { row: 5, label: "WhatsApp", key: "whatsapp" },
    { row: 6, label: "Precio", key: "precio" }
];

const MESES_ES = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11
};

function normalizarConfigFilasDesdeApi(rawData) {
    const arr = rawData?.configFilas;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out = [];
    for (const item of arr) {
        const row = parseInt(item.row, 10);
        if (Number.isNaN(row) || row < 2 || row > 18) continue;
        const label = item.label != null ? String(item.label).trim() : "";
        if (!label) continue;
        const value = item.value != null ? String(item.value) : "";
        out.push({ row, label, value });
    }
    return out.length ? out : null;
}

/**
 * Etiquetas desde columna A (si vienen en configFilas) + valores; siempre 5 filas 2–6.
 */
function obtenerConfigFilasParaUI(rawData) {
    const config = rawData?.config || {};
    const apiFilas = normalizarConfigFilasDesdeApi(rawData);
    const mapApi = new Map();
    if (apiFilas) {
        apiFilas.forEach(f => {
            if (f.row >= 2 && f.row <= 6) mapApi.set(f.row, f);
        });
    }
    return RIFA_CONFIG_FILA_DEFS.map(def => {
        const a = mapApi.get(def.row);
        const valueFromConfig = config[def.key] != null ? String(config[def.key]) : "";
        return {
            row: def.row,
            label: a?.label ?? def.label,
            value: a != null ? a.value : valueFromConfig
        };
    });
}

function formatFechaSpreadsheet(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(d);
}

function toISODateLocal(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
}

/** Evita el desfase UTC de `valueAsDate` en input type=date. */
function dateFromInputYMD(ymd) {
    if (!ymd || typeof ymd !== "string") return null;
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
    const [y, mo, d] = parts;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
}

function parseSpanishLongDate(str) {
    if (!str || typeof str !== "string") return null;
    const t = str.trim();
    const sinDiaSemana = t.replace(/^[a-záéíóúñü]+,?\s*/i, "");
    const m = sinDiaSemana.match(/^(\d{1,2})\s+de\s+([a-záéíóúñü]+)\s+de\s+(\d{4})$/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const mesKey = m[2].toLowerCase();
    const month = MESES_ES[mesKey];
    const year = parseInt(m[3], 10);
    if (month === undefined || !day || !year) return null;
    const d = new Date(year, month, day);
    if (d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
}

function parseFechaConfigInicial(str) {
    if (!str || typeof str !== "string") return null;
    const s = str.trim();
    const fromSpanish = parseSpanishLongDate(s);
    if (fromSpanish) return fromSpanish;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s.slice(0, 10) + "T12:00:00");
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const y = parseInt(m[3], 10);
        const dt = new Date(y, mo, d);
        return Number.isNaN(dt.getTime()) || dt.getMonth() !== mo ? null : dt;
    }
    return null;
}

function digitsOnlyWa(str) {
    return String(str || "").replace(/\D/g, "");
}

function formatWhatsApp8(digits) {
    const d = digitsOnlyWa(digits).slice(0, 8);
    if (d.length <= 4) return d;
    return `${d.slice(0, 4)}-${d.slice(4)}`;
}

function parsePrecioColon(str) {
    const n = parseInt(String(str || "").replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
}

function formatPrecioColonDisplay(amount) {
    const n = Math.max(0, Math.floor(Number(amount)) || 0);
    return `₡${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function filasDesdeObjeto(obj) {
    const claves = ["dataRifa", "data", "values", "rows", "sheet", "datos"];
    for (const k of claves) {
        if (Array.isArray(obj[k])) return obj[k];
    }
    return null;
}

function aplicaFilaArray(resultado, fila) {
    if (!fila || fila.length < 2) return;
    const numero = String(fila[0]).trim();
    const estado = String(fila[1]).trim() || "Disponible";
    const nombre = fila[2] != null && fila[2] !== "" ? String(fila[2]).trim() : "";
    resultado[numero] = { estado, nombre };
}

// CONECTAR CON API
async function conectarConRifa() {
    const url = `${RIFA_WEB_APP_URL}?action=getData`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RIFA_FETCH_TIMEOUT_MS);
    try {
        const respuesta = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!respuesta.ok) {
            throw new Error(`HTTP error! status: ${respuesta.status}`);
        }
        const texto = await respuesta.text();
        let data;
        try {
            data = JSON.parse(texto);
        } catch (parseError) {
            console.error("La respuesta no es JSON válido. ¿El Web App está desplegado como ejecutar como yo / acceso anónimo?", parseError);
            throw new Error("Respuesta del servidor no es JSON. Revisa la implementación doGet en Apps Script.");
        }
        console.log("✓ Datos de Rifa recibidos:", data);
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
            const err = new Error(
                `Tiempo de espera agotado (${RIFA_FETCH_TIMEOUT_MS / 1000}s). Comprueba red, bloqueadores o el despliegue del Web App.`
            );
            err.cause = error;
            console.error("✗ Error al conectar con API:", err);
            throw err;
        }
        console.error("✗ Error al conectar con API:", error);
        throw error;
    }
}

// PROCESAR DATOS - Maneja múltiples formatos
function procesarDatos(rawData) {
    console.log("Procesando datos...", typeof rawData, Array.isArray(rawData), rawData);

    const resultado = {};

    if (!rawData) {
        console.warn("⚠️ No hay datos para procesar");
        return resultado;
    }

    if (Array.isArray(rawData)) {
        const primera = rawData[0];
        const esMatriz = primera && Array.isArray(primera);
        const esObjetos =
            primera && typeof primera === "object" && !Array.isArray(primera) && primera.numero != null;

        if (esObjetos) {
            console.log("Detectado formato: Array de objetos (numero/estado/nombre)");
            rawData.forEach(item => {
                if (!item || item.numero == null) return;
                const numero = String(item.numero).trim();
                const estado = String(item.estado || "Disponible").trim();
                const nombre = item.nombre != null ? String(item.nombre).trim() : "";
                resultado[numero] = { estado, nombre };
            });
            console.log("✓ Datos procesados:", Object.keys(resultado).length, "números");
            return resultado;
        }

        if (esMatriz) {
            console.log("Detectado formato: Array de filas (hoja / matriz)");
            let start = 0;
            if (
                rawData[0] &&
                rawData[0][0] != null &&
                typeof rawData[0][0] === "string" &&
                rawData[0][0].trim() !== "" &&
                isNaN(Number(String(rawData[0][0]).replace(/\s/g, "")))
            ) {
                console.log("Header detectado, saltando primera fila");
                start = 1;
            }
            for (let i = start; i < rawData.length; i++) {
                aplicaFilaArray(resultado, rawData[i]);
            }
            console.log("✓ Datos procesados:", Object.keys(resultado).length, "números");
            return resultado;
        }
    }

    if (typeof rawData === "object") {
        const filas = filasDesdeObjeto(rawData);
        if (filas) {
            console.log("Detectado formato: Objeto con array de filas (dataRifa / data / …)");
            filas.forEach(item => {
                if (Array.isArray(item)) {
                    aplicaFilaArray(resultado, item);
                } else if (item && item.numero != null) {
                    const numero = String(item.numero).trim();
                    const estado = String(item.estado || "Disponible").trim();
                    const nombre = item.nombre != null ? String(item.nombre).trim() : "";
                    resultado[numero] = { estado, nombre };
                }
            });
            console.log("✓ Datos procesados:", Object.keys(resultado).length, "números");
            return resultado;
        }

        const excluir = new Set(["success", "ok", "message", "error", "status", "action"]);
        const numsRelevantes = Object.keys(rawData).filter(k => !excluir.has(k.toLowerCase()));
        if (numsRelevantes.length > 0 && numsRelevantes.every(k => /^\d+$/.test(k))) {
            console.log("Detectado formato: mapa número → estado");
            numsRelevantes.forEach(num => {
                const val = rawData[num];
                resultado[num] = {
                    estado: typeof val === "string" ? val : "Disponible",
                    nombre: ""
                };
            });
        }
    }

    console.log("✓ Datos procesados:", Object.keys(resultado).length, "números");
    console.log("Resultado final:", resultado);
    return resultado;
}

function mostrarContenidoRifa() {
    const content = document.getElementById("rifa-content");
    if (!content) return;
    content.style.pointerEvents = "auto";
}

const RIFA_SPLASH_TRANSITION_MS = 1500;

function esperarDobleAnimacionFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        });
    });
}

function finalizarRifaSplashExito() {
    const app = document.getElementById("rifa-app");
    if (!app) return;
    app.classList.remove("rifa-booting");
    app.classList.add("rifa-ready");
    const splash = document.getElementById("rifa-splash");
    if (!splash) return;
    splash.setAttribute("aria-busy", "false");
    const onEnd = e => {
        if (e.target !== splash || e.propertyName !== "opacity") return;
        splash.removeEventListener("transitionend", onEnd);
        app.classList.add("rifa-splash-done");
        splash.setAttribute("aria-hidden", "true");
    };
    splash.addEventListener("transitionend", onEnd);
    window.setTimeout(() => {
        if (!app.classList.contains("rifa-splash-done")) {
            splash.removeEventListener("transitionend", onEnd);
            app.classList.add("rifa-splash-done");
            splash.setAttribute("aria-hidden", "true");
        }
    }, RIFA_SPLASH_TRANSITION_MS + 200);
}

function aplicarConfig(config) {
    if (!config) return;
    cfg = config;

    const root = document.documentElement;

    // Solo variables de la app Rifa: no pisar los tokens globales de marca (--neon-cyan, --accent-orange),
    // porque resaltado en la hoja suele ser naranja y teñía toda la web.
    if (config.primario) root.style.setProperty("--cobalt-blue", config.primario);

    if (config.primario) root.style.setProperty("--rifa-primario", config.primario);
    if (config.secundario) root.style.setProperty("--rifa-secundario", config.secundario);
    if (config.fondo) root.style.setProperty("--rifa-fondo", config.fondo);
    if (config.resaltado) root.style.setProperty("--rifa-resaltado", config.resaltado);
    if (config.reservado) root.style.setProperty("--rifa-reservado", config.reservado);
    if (config.texto_cards) root.style.setProperty("--rifa-texto-cards", config.texto_cards);

    if (config.fuente && document.body) {
        document.body.style.fontFamily = config.fuente;
    }
}

function renderizarCanvas() {
    const canvas = document.getElementById("canvas-render");
    const grid = document.getElementById("b-grid");
    if (!canvas || !grid) return;

    // Ajustes del canvas
    canvas.style.backgroundColor = cfg.fondo || "#212121";
    canvas.style.fontFamily = cfg.fuente || "Inter";

    const bLogo = document.getElementById("b-logo");
    const bObj = document.getElementById("b-obj");
    const bPrecio = document.getElementById("b-precio");
    const bModFecha = document.getElementById("b-mod-fecha");
    const bWaIcon = document.getElementById("b-wa-icon");
    const bWaNum = document.getElementById("b-wa-num");

    if (bLogo && cfg.logo) bLogo.src = cfg.logo;
    if (bObj && cfg.objeto) bObj.innerText = cfg.objeto;
    if (bPrecio && cfg.precio != null) bPrecio.innerText = "Costo: " + cfg.precio;
    if (bModFecha && cfg.modalidad && cfg.fecha) bModFecha.innerText = cfg.modalidad + ": " + cfg.fecha;
    if (bWaIcon && cfg.icono_wa) bWaIcon.src = cfg.icono_wa;
    if (bWaNum && cfg.whatsapp != null) bWaNum.innerText = cfg.whatsapp;

    // Render grilla 00..99
    grid.innerHTML = "";
    const numeros = Object.keys(datosRifa).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    numeros.forEach(numero => {
        const entrada = datosRifa[numero];
        if (!entrada) return;

        const estado = entrada.estado;
        const n = numero.padStart(2, "0");

        const bc = document.createElement("div");
        bc.className = "b-num";

        // En el JPG: Reservado y Pagado se ven igual (ya no disponibles) — overlay "Vendido".
        // En la app interactiva la grilla sigue distinguiendo azul/naranja.
        if (estado === "Disponible") {
            bc.style.borderColor = cfg.primario;
            bc.style.backgroundColor = cfg.secundario;
            bc.style.color = cfg.texto_cards;
            bc.innerText = n;
        } else {
            bc.style.borderColor = "#FF4500";
            bc.style.backgroundColor = "#FF4500";
            bc.style.color = "white";
            const vendidoSrc = encodeURI("imagenes/Vendido Cian.png");
            bc.innerHTML = `<img src="${vendidoSrc}" class="sold-img" crossorigin="anonymous" alt="Vendido">`;
        }

        grid.appendChild(bc);
    });
}

let html2canvasLoadPromise = null;
function cargarHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve();
    if (html2canvasLoadPromise) return html2canvasLoadPromise;

    html2canvasLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://html2canvas.hertzen.com/dist/html2canvas.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("No se pudo cargar html2canvas"));
        document.head.appendChild(script);
    });

    return html2canvasLoadPromise;
}

async function descargarJpg() {
    if (!cfg || !cfg.fondo) {
        alert("La Config de la rifa aún no está lista. Intenta de nuevo.");
        return;
    }

    try {
        // Abrimos la pestaña ANTES de los awaits para evitar bloqueos de popup.
        const win = window.open("", "_blank");
        if (win) {
            win.document.title = "Rifa - JPG";
            win.document.body.style.margin = "0";
            win.document.body.innerHTML = `<div style="padding:24px;font-family:Arial; color:#fff; background:#000; min-height:100vh; display:flex; align-items:center; justify-content:center;">
                Generando imagen...
            </div>`;
        }

        renderizarCanvas();
        await cargarHtml2Canvas();

        const element = document.getElementById("canvas-render");
        const canvasImg = await window.html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: cfg.fondo
        });

        const dataUrl = canvasImg.toDataURL("image/jpeg", 0.9);

        if (win && !win.closed) {
            // Mostrar en pestaña nueva y dar descarga con extensión .jpg.
            // Convertimos a Blob para que el navegador lo trate como imagen JPEG,
            // evitando que al guardar aparezca como JFIF.
            const parts = dataUrl.split(",");
            const mimeMatch = parts[0].match(/data:(.*);base64/);
            const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

            const byteString = atob(parts[1]);
            const ab = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) ab[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            win.document.body.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;">
                    <img src="${blobUrl}" alt="Rifa_ChinoPCMaster" style="max-width:100%;height:auto;display:block;border-radius:12px;"/>
                    <a href="${blobUrl}" download="Rifa_ChinoPCMaster.jpg" style="padding:12px 18px;background:#0047AB;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;">
                        Descargar JPG
                    </a>
                </div>
            `;
        } else {
            // Fallback: si popup bloquea, descargamos
            const link = document.createElement("a");
            link.download = "Rifa_ChinoPCMaster.jpg";
            link.href = dataUrl;
            link.click();
        }
    } catch (error) {
        console.error("✗ Error generando JPG:", error);
        alert("Error generando la imagen JPG. Revisa la consola (F12).");
    }
}

let guardandoRifa = false;

function setRifaBloqueada(bloqueada, textoCarga) {
    const loading = document.getElementById("loading-indicator");
    const content = document.getElementById("rifa-content");
    if (loading) {
        if (textoCarga) loading.innerHTML = `<p>${textoCarga}</p>`;
        loading.style.display = bloqueada ? "block" : "none";
    }
    if (content) content.style.pointerEvents = bloqueada ? "none" : "auto";
}

async function postUpdateMasivo(listaCambios) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RIFA_FETCH_TIMEOUT_MS);

    try {
        const resp = await fetch(RIFA_WEB_APP_URL, {
            method: "POST",
            headers: {
                // Usamos text/plain para evitar preflight CORS (OPTIONS).
                // doPost parsea e.postData.contents como JSON, así que el contenido sigue siendo JSON.
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify({
                action: "updateMasivo",
                listaCambios
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const texto = await resp.text();
        let data;
        try {
            data = JSON.parse(texto);
        } catch (e) {
            throw new Error("Respuesta no JSON al guardar. Revisa el doPost.");
        }

        if (!resp.ok) {
            throw new Error(data?.message || `HTTP error ${resp.status}`);
        }
        if (data?.status !== "SUCCESS") {
            throw new Error(data?.message || "Error guardando en la hoja");
        }
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error?.name === "AbortError") {
            throw new Error(
                `Tiempo de espera agotado al guardar (${RIFA_FETCH_TIMEOUT_MS / 1000}s).`
            );
        }
        throw error;
    }
}

/**
 * Guarda la hoja Config. El servidor debe aceptar nuevaConfig.filas: [{ row, valor }].
 * Ver google-apps-script/configFilas-getAppData-y-actualizar.gs
 */
async function postUpdateConfig(filas) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RIFA_FETCH_TIMEOUT_MS);

    try {
        const resp = await fetch(RIFA_WEB_APP_URL, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify({
                action: "updateConfig",
                nuevaConfig: { filas }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const texto = await resp.text();
        let data;
        try {
            data = JSON.parse(texto);
        } catch (e) {
            throw new Error("Respuesta no JSON al guardar Config. Revisa doPost.");
        }

        if (!resp.ok) {
            throw new Error(data?.message || `HTTP error ${resp.status}`);
        }
        if (data?.status === "ERROR") {
            throw new Error(data?.message || "Error en el servidor");
        }
        if (data?.status !== "SUCCESS") {
            throw new Error(data?.message || "Error guardando configuración");
        }
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error?.name === "AbortError") {
            throw new Error(
                `Tiempo de espera agotado al guardar Config (${RIFA_FETCH_TIMEOUT_MS / 1000}s).`
            );
        }
        throw error;
    }
}

function renderizarCamposConfigModal() {
    const wrap = document.getElementById("rifa-config-fields");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!configFilasUI.length) {
        const p = document.createElement("p");
        p.className = "rifa-config-hint";
        p.textContent = "No se pudieron cargar los campos de configuración.";
        wrap.appendChild(p);
        return;
    }
    const frag = document.createDocumentFragment();
    configFilasUI.forEach(fila => {
        const div = document.createElement("div");
        div.className = "form-group rifa-config-field";
        div.dataset.configRow = String(fila.row);

        const idBase = `rifa-cfg-row-${fila.row}`;
        const lab = document.createElement("label");
        lab.setAttribute("for", idBase);
        lab.textContent = fila.label;

        div.appendChild(lab);

        if (fila.row === 2) {
            const input = document.createElement("input");
            input.type = "text";
            input.id = idBase;
            input.className = "rifa-config-input-corto";
            input.maxLength = 160;
            input.value = fila.value;
            input.autocomplete = "off";
            div.appendChild(input);
        } else if (fila.row === 3) {
            const dateInp = document.createElement("input");
            dateInp.type = "date";
            dateInp.id = idBase;
            dateInp.className = "rifa-cfg-date";
            const parsed = parseFechaConfigInicial(fila.value);
            if (parsed) dateInp.value = toISODateLocal(parsed);
            const preview = document.createElement("div");
            preview.className = "rifa-config-date-preview";
            preview.setAttribute("aria-live", "polite");
            const syncPreview = () => {
                if (dateInp.value) {
                    const d = dateFromInputYMD(dateInp.value);
                    if (d) {
                        preview.innerHTML =
                            "En la hoja se guardará: <strong>" +
                            formatFechaSpreadsheet(d) +
                            "</strong>";
                    } else preview.textContent = "";
                } else preview.textContent = "";
            };
            dateInp.addEventListener("change", syncPreview);
            dateInp.addEventListener("input", syncPreview);
            div.appendChild(dateInp);
            div.appendChild(preview);
            syncPreview();
        } else if (fila.row === 4) {
            const input = document.createElement("input");
            input.type = "text";
            input.id = idBase;
            input.className = "rifa-config-input-corto";
            input.maxLength = 100;
            input.value = fila.value;
            input.autocomplete = "off";
            div.appendChild(input);
        } else if (fila.row === 5) {
            const input = document.createElement("input");
            input.type = "text";
            input.id = idBase;
            input.className = "rifa-config-input-wa";
            input.inputMode = "numeric";
            input.maxLength = 9;
            input.placeholder = "0000-0000";
            input.value = formatWhatsApp8(fila.value);
            input.autocomplete = "off";
            input.addEventListener("input", () => {
                const d = digitsOnlyWa(input.value).slice(0, 8);
                input.value = formatWhatsApp8(d);
            });
            div.appendChild(input);
        } else if (fila.row === 6) {
            const input = document.createElement("input");
            input.type = "text";
            input.id = idBase;
            input.className = "rifa-config-input-precio";
            input.inputMode = "numeric";
            input.autocomplete = "off";
            const n0 = parsePrecioColon(fila.value);
            input.value = formatPrecioColonDisplay(n0);
            input.addEventListener("focus", () => {
                const n = parsePrecioColon(input.value);
                input.value = n > 0 ? String(n) : "";
            });
            input.addEventListener("blur", () => {
                const n = parsePrecioColon(input.value);
                input.value = formatPrecioColonDisplay(n);
            });
            div.appendChild(input);
        }

        frag.appendChild(div);
    });
    wrap.appendChild(frag);
}

function abrirRifaConfigModal() {
    const modal = document.getElementById("rifa-config-modal");
    if (!modal) return;
    renderizarCamposConfigModal();
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
}

function cerrarRifaConfigModal() {
    const modal = document.getElementById("rifa-config-modal");
    if (!modal) return;
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
}

let guardandoConfigRifa = false;

function leerValorCampoConfig(row) {
    const field = document.querySelector(`.rifa-config-field[data-config-row="${row}"]`);
    if (!field) return { ok: true, valor: "" };
    if (row === 2 || row === 4) {
        const inp = field.querySelector("input[type=text]");
        return { ok: true, valor: inp ? String(inp.value).trim() : "" };
    }
    if (row === 3) {
        const inp = field.querySelector("input[type=date]");
        if (!inp || !inp.value) return { ok: true, valor: "" };
        const d = dateFromInputYMD(inp.value);
        if (!d) return { ok: true, valor: "" };
        return { ok: true, valor: formatFechaSpreadsheet(d) };
    }
    if (row === 5) {
        const inp = field.querySelector("input");
        const d = digitsOnlyWa(inp?.value ?? "");
        if (d.length === 0) return { ok: true, valor: "" };
        if (d.length !== 8) {
            return { ok: false, valor: "", mensaje: "WhatsApp debe tener exactamente 8 dígitos (o déjalo vacío)." };
        }
        return { ok: true, valor: formatWhatsApp8(d) };
    }
    if (row === 6) {
        const inp = field.querySelector("input");
        const n = parsePrecioColon(inp?.value ?? "");
        return { ok: true, valor: String(n) };
    }
    return { ok: true, valor: "" };
}

async function guardarRifaConfigModal() {
    if (guardandoConfigRifa) return;
    const wrap = document.getElementById("rifa-config-fields");
    const btn = document.getElementById("rifa-config-guardar");
    if (!wrap) return;

    const ordenFilas = [2, 3, 4, 5, 6];
    const filas = [];
    for (const row of ordenFilas) {
        const r = leerValorCampoConfig(row);
        if (!r.ok) {
            alert(r.mensaje || "Revisa los datos del formulario.");
            return;
        }
        filas.push({ row, valor: r.valor });
    }

    guardandoConfigRifa = true;
    if (btn) {
        btn.disabled = true;
        btn.dataset.prevText = btn.textContent;
        btn.textContent = "Guardando…";
    }

    try {
        await postUpdateConfig(filas);
        await recargarRifaDesdeHoja();
        cerrarRifaConfigModal();
        alert("Configuración guardada correctamente.");
    } catch (e) {
        console.error(e);
        alert("No se pudo guardar la configuración: " + (e.message || e));
    } finally {
        guardandoConfigRifa = false;
        if (btn) {
            btn.disabled = false;
            if (btn.dataset.prevText) btn.textContent = btn.dataset.prevText;
        }
    }
}

async function recargarRifaDesdeHoja() {
    const rawData = await conectarConRifa();
    aplicarConfig(rawData?.config || {});
    configFilasUI = obtenerConfigFilasParaUI(rawData);
    datosRifa = procesarDatos(rawData);
    if (Object.keys(datosRifa).length === 0) {
        throw new Error("No se encontraron números en los datos");
    }
    renderizarGrafica();
    renderizarLista();
    renderizarCanvas();
}

// RENDERIZAR VISTA GRÁFICA
function renderizarGrafica() {
    const grid = document.getElementById('numbers-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Ordenar números numéricamente
    const numeros = Object.keys(datosRifa)
        .sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

    numeros.forEach(numero => {
        const { estado } = datosRifa[numero];
        
        const btn = document.createElement('button');
        btn.className = 'number-btn';
        btn.textContent = numero.padStart(2, '0');
        btn.dataset.numero = numero;

        // Aplicar clase de estado
        switch (estado) {
            case 'Disponible':
                btn.classList.add('available');
                btn.addEventListener('click', () => toggleNumero(numero, btn));
                break;
            case 'Reservado':
                btn.classList.add('reserved');
                btn.disabled = true;
                break;
            case 'Pagado':
                btn.classList.add('paid');
                btn.disabled = true;
                break;
            default:
                btn.classList.add('available');
                btn.addEventListener('click', () => toggleNumero(numero, btn));
        }

        fragment.appendChild(btn);
    });

    grid.appendChild(fragment);
    actualizarEstadisticas();
}

// RENDERIZAR VISTA LISTA
function renderizarLista() {
    const tbody = document.getElementById('tabla-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Ordenar números
    const numeros = Object.keys(datosRifa)
        .sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

    numeros.forEach(numero => {
        const { estado, nombre } = datosRifa[numero];
        
        const tr = document.createElement('tr');
        tr.className = `fila-numero estado-${estado.toLowerCase()}`;
        
        tr.innerHTML = `
            <td><span class="num-badge">${numero.padStart(2, '0')}</span></td>
            <td><input type="text" class="input-nombre" data-numero="${numero}" value="${nombre}"></td>
            <td>
                <select class="select-estado" data-numero="${numero}">
                    <option value="Disponible" ${estado === 'Disponible' ? 'selected' : ''}>Disponible</option>
                    <option value="Reservado" ${estado === 'Reservado' ? 'selected' : ''}>Reservado</option>
                    <option value="Pagado" ${estado === 'Pagado' ? 'selected' : ''}>Pagado</option>
                </select>
            </td>
        `;

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

// ACTUALIZAR ESTADÍSTICAS
function actualizarEstadisticas() {
    let total = 0, disponibles = 0, reservados = 0, pagados = 0;

    Object.keys(datosRifa).forEach(num => {
        total++;
        const { estado } = datosRifa[num];
        switch (estado) {
            case 'Disponible': disponibles++; break;
            case 'Reservado': reservados++; break;
            case 'Pagado': pagados++; break;
        }
    });

    const stat = el => document.getElementById(el);
    if (stat('stat-total')) stat('stat-total').textContent = total;
    if (stat('stat-available')) stat('stat-available').textContent = disponibles;
    if (stat('stat-reserved')) stat('stat-reserved').textContent = reservados;
    if (stat('stat-paid')) stat('stat-paid').textContent = pagados;
}

// TOGGLE SELECCIÓN
function toggleNumero(numero, btn) {
    if (numerosSeleccionados.includes(numero)) {
        numerosSeleccionados = numerosSeleccionados.filter(n => n !== numero);
        btn.classList.remove('selected');
    } else {
        numerosSeleccionados.push(numero);
        btn.classList.add('selected');
    }

    const panel = document.getElementById('panel-seleccion');
    if (panel) {
        panel.style.display = numerosSeleccionados.length > 0 ? 'block' : 'none';
    }
}

// CAMBIAR VISTA
function cambiarVista(vista) {
    const vistaGraf = document.getElementById('vista-grafica');
    const vistaLst = document.getElementById('vista-lista');

    if (vista === 'grafica') {
        vistaGraf.classList.add('active');
        vistaLst.classList.remove('active');
        numerosSeleccionados = [];
        const panel = document.getElementById('panel-seleccion');
        if (panel) panel.style.display = 'none';
    } else {
        vistaGraf.classList.remove('active');
        vistaLst.classList.add('active');
    }
}

// GUARDAR SELECCIÓN DE NÚMEROS
async function guardarSeleccion() {
    if (guardandoRifa) return;
    guardandoRifa = true;

    const loading = document.getElementById("loading-indicator");
    setRifaBloqueada(true, "Guardando cambios…");
    let tuvoError = false;

    try {
        const nombre = document.getElementById("input-nombre").value;
        const estado = document.getElementById("select-estado").value;

        const listaCambios = numerosSeleccionados.map(num => ({
            num: num,
            estado: estado,
            nombre: nombre
        }));

        if (listaCambios.length === 0) {
            throw new Error("No hay números seleccionados para guardar");
        }

        await postUpdateMasivo(listaCambios);

        numerosSeleccionados = [];

        const panel = document.getElementById("panel-seleccion");
        if (panel) panel.style.display = "none";

        document.getElementById("input-nombre").value = "";
        document.getElementById("select-estado").value = "Disponible";

        await recargarRifaDesdeHoja();
        alert("✓ Cambios guardados exitosamente");
    } catch (error) {
        tuvoError = true;
        console.error("✗ Error guardando selección:", error);
        if (loading) {
            loading.innerHTML =
                '<p class="error-message">❌ Error: ' + (error.message || error) + "</p>";
        }
    } finally {
        // Si hubo error, mantenemos el mensaje visible
        if (tuvoError) {
            setRifaBloqueada(false);
            if (loading) loading.style.display = "block";
        } else {
            setRifaBloqueada(false);
        }
        guardandoRifa = false;
    }
}

// GUARDAR TABLA COMPLETA
async function guardarTabla() {
    if (guardandoRifa) return;
    guardandoRifa = true;

    const inputs = document.querySelectorAll('.input-nombre');
    const selects = document.querySelectorAll('.select-estado');

    setRifaBloqueada(true, "Guardando cambios…");
    let tuvoError = false;

    try {
        const listaCambios = Array.from(inputs).map((input, idx) => {
            const numero = input.dataset.numero;
            const nombre = input.value;
            const estado = selects[idx]?.value || "Disponible";
            return { num: numero, estado, nombre };
        });

        await postUpdateMasivo(listaCambios);

        alert("✓ Cambios guardados exitosamente");
        await recargarRifaDesdeHoja();
        cambiarVista("grafica");
    } catch (error) {
        tuvoError = true;
        console.error("✗ Error guardando tabla:", error);
        const loading = document.getElementById("loading-indicator");
        if (loading) {
            loading.innerHTML =
                '<p class="error-message">❌ Error: ' + (error.message || error) + "</p>";
            loading.style.display = "block";
        }
    } finally {
        // Si hubo error, mantenemos el mensaje visible
        if (tuvoError) {
            setRifaBloqueada(false);
            const loading = document.getElementById("loading-indicator");
            if (loading) loading.style.display = "block";
        } else {
            setRifaBloqueada(false);
        }
        guardandoRifa = false;
    }
}

// SETUP EVENTOS
function setupEventos() {
    // Cambios de vista
    document.getElementById('btn-ver-lista')?.addEventListener('click', () => cambiarVista('lista'));
    document.getElementById('btn-volver')?.addEventListener('click', () => cambiarVista('grafica'));

    // Panel de selección
    document.getElementById('btn-guardar-seleccion')?.addEventListener('click', guardarSeleccion);
    document.getElementById('btn-cancelar-seleccion')?.addEventListener('click', () => {
        numerosSeleccionados = [];
        const panel = document.getElementById('panel-seleccion');
        if (panel) panel.style.display = 'none';
        renderizarGrafica();
    });

    // Tabla
    document.getElementById('btn-guardar-cambios')?.addEventListener('click', guardarTabla);

    // Descargar
    document.getElementById('btn-descargar')?.addEventListener('click', descargarJpg);

    // Config hoja Config (disponible en vista gráfica y lista)
    document.querySelectorAll('.btn-config-trigger').forEach(btn => {
        btn.addEventListener('click', () => abrirRifaConfigModal());
    });
    document.getElementById('rifa-config-backdrop')?.addEventListener('click', () => cerrarRifaConfigModal());
    document.getElementById('rifa-config-cerrar')?.addEventListener('click', () => cerrarRifaConfigModal());
    document.getElementById('rifa-config-cerrar-x')?.addEventListener('click', () => cerrarRifaConfigModal());
    document.getElementById('rifa-config-guardar')?.addEventListener('click', () => guardarRifaConfigModal());
}

function getRifaLoadingEl() {
    return document.querySelector("#rifa-app #loading-indicator") || document.getElementById("loading-indicator");
}

// INICIALIZAR APP
async function initRifaApp() {
    const loading = getRifaLoadingEl();
    let initOk = false;

    try {
        let rawData;
        try {
            rawData = await conectarConRifa();
        } catch (apiError) {
            console.warn("Error conectando a API, usando datos de prueba...", apiError);
            // Datos de prueba fallback
            rawData = Array.from({ length: 100 }, (_, i) => [
                String(i + 1).padStart(2, "0"),
                "Disponible",
                ""
            ]);
        }

        if (rawData && typeof rawData === "object" && rawData.error != null && rawData.dataRifa == null) {
            throw new Error(String(rawData.error));
        }

        aplicarConfig(rawData?.config || {});
        configFilasUI = obtenerConfigFilasParaUI(rawData);
        datosRifa = procesarDatos(rawData);

        if (Object.keys(datosRifa).length === 0) {
            throw new Error("No se encontraron números en los datos");
        }

        renderizarGrafica();
        renderizarLista();
        renderizarCanvas();
        setupEventos();

        mostrarContenidoRifa();

        await esperarDobleAnimacionFrame();
        finalizarRifaSplashExito();

        initOk = true;
        console.log("✓ Rifa inicializada correctamente");
    } catch (error) {
        console.error("✗ Error en initRifaApp:", error);
        const app = document.getElementById("rifa-app");
        if (app) {
            app.classList.remove("rifa-booting");
            app.classList.add("rifa-ready", "rifa-init-error");
        }
        const loadEl = getRifaLoadingEl();
        if (loadEl) {
            const p = document.createElement("p");
            p.className = "error-message";
            p.textContent = "❌ Error: " + (error?.message || String(error));
            loadEl.replaceChildren(p);
        }
        mostrarContenidoRifa();
    } finally {
        const loadEl = getRifaLoadingEl();
        if (loadEl && initOk) {
            loadEl.style.display = "none";
        }
    }
}

/** Arranque desde assets/app.js al cargar el script (SPA); evita carreras con el DOM. */
window.initRifaApp = initRifaApp;