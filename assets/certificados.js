/**
 * Certificados: backend GAS dedicado + verificador público (Canje).
 * Expone initCertificadosAdminApp e initCanjePublicoApp; las invoca app.js tras cargar el fragmento HTML.
 *
 * Backend: proyecto Apps Script en ChinoPCMasterAppScripts/fuentes-apps-script/certificados (clasp).
 * doPost: JSON en postData.contents y/o e.parameter.payload (form). Respuesta JSON: success, msg, etc.
 */
(function () {
    /* Opcional: en index.html define window.CPM_CERTIFICADOS_GAS_URL = "https://.../exec" antes de cargar la app. */
    function certificadosGasUrl() {
        return (
            (typeof window !== "undefined" && window.CPM_CERTIFICADOS_GAS_URL) ||
            "https://script.google.com/macros/s/AKfycbwoVoACW2HmnSYOChdUFGRcjymjP5KzNR3sLgORa7vfYGrfoIoKnB7vioNiPh7twqFw/exec"
        );
    }

    function normalizeCertId(raw) {
        return String(raw || "")
            .trim()
            .replace(/\s+/g, "")
            .toUpperCase();
    }

    function formatFechaLargaEs(raw) {
        if (!raw) return "";
        const d = raw instanceof Date ? raw : new Date(raw);
        if (Number.isNaN(d.getTime())) return String(raw);
        const txt = new Intl.DateTimeFormat("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(d);
        return txt.charAt(0).toUpperCase() + txt.slice(1);
    }

    function mapCertRecord(d) {
        if (!d || typeof d !== "object") {
            return { id: "", cliente: "", servicio: "", exp: "", estado: "" };
        }
        return {
            id: String(d.id ?? d.codigo ?? d.certId ?? d.certificadoId ?? "").trim(),
            cliente: String(d.nombreCliente ?? d.cliente ?? d.nombre ?? "").trim(),
            servicio: String(d.servicio ?? "").trim(),
            exp: formatFechaLargaEs(d.fechaExp ?? d.fecha_exp ?? d.expiracion ?? d.expira ?? ""),
            estado: String(d.estado ?? d.status ?? "").trim()
        };
    }

    function extractGenerarId(data) {
        if (!data || typeof data !== "object") return "";
        return String(data.id ?? data.codigo ?? data.certId ?? data.certificadoId ?? "").trim();
    }

    /** Sesión en el formato que espera tu GAS: role + permissions[] */
    function buildGasSession(session) {
        if (!session || typeof session !== "object") return null;
        const admin = Boolean(session.isAdmin || String(session.role || "").toLowerCase() === "admin");
        const permissions = [];
        if (session.permisos && session.permisos.certificados) {
            permissions.push("certificados");
        }
        return {
            role: admin ? "admin" : String(session.role || "user").toLowerCase(),
            permissions: admin && permissions.length === 0 ? ["certificados"] : permissions
        };
    }

    function looksLikeHtmlResponse(text) {
        const t = String(text || "").trim();
        return t.startsWith("<!") || t.startsWith("<html") || t.startsWith("<HTML");
    }

    /** Misma secuencia que debe usar todo POST al Web App (evita preflight CORS con application/json). */
    function certificadosFetchAttempts(rawPayload) {
        return [
            { headers: { "Content-Type": "text/plain" }, body: rawPayload },
            {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ payload: rawPayload }).toString()
            },
            { headers: { "Content-Type": "application/json" }, body: rawPayload }
        ];
    }

    async function postCertificados(payload) {
        const url = certificadosGasUrl();
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 25000);
        const rawPayload = JSON.stringify(payload);

        async function parseResponse(response) {
            const rawText = await response.text();
            const trimmed = rawText.trim();
            if (!trimmed) {
                throw new Error("El servidor devolvió una respuesta vacía. Revisa doPost en Apps Script.");
            }
            if (looksLikeHtmlResponse(trimmed)) {
                throw new Error(
                    "El Web App de certificados respondió con una página HTML (error de despliegue o excepción en doPost). " +
                        "En Apps Script: Implementación → Administrar implementaciones → nueva versión, acceso «Cualquiera», " +
                        "y asegúrate de que doPost devuelva ContentService.createTextOutput(JSON).setMimeType(JSON)."
                );
            }
            let result;
            try {
                result = JSON.parse(trimmed);
            } catch (e) {
                throw new Error(
                    "Respuesta no JSON desde Apps Script. Comprueba que el script devuelva JSON con status y message."
                );
            }
            if (!response.ok) {
                throw new Error(result?.message || result?.msg || `Error HTTP ${response.status}`);
            }

            /**
             * Tu Code.gs devuelve { success, msg, id?, data? }.
             * Otros despliegues usan { status: "SUCCESS", data }.
             */
            const successVal = result.success;
            const successBool =
                typeof successVal === "boolean"
                    ? successVal
                    : successVal === 1 ||
                      String(successVal || "").toLowerCase() === "true" ||
                      String(successVal || "").toLowerCase() === "1";
            const hasSuccessKey = Object.prototype.hasOwnProperty.call(result, "success");

            const okSuccess =
                hasSuccessKey && typeof successVal !== "object"
                    ? successBool
                    : String(result.status || "").toUpperCase() === "SUCCESS" ||
                      result.ok === true ||
                      String(result.ok || "").toLowerCase() === "true";

            if (hasSuccessKey || result.msg !== undefined) {
                if (!okSuccess) {
                    throw new Error(
                        result.msg || result.message || "El servidor rechazó la operación."
                    );
                }
                const data = { ...(typeof result.data === "object" && result.data ? result.data : {}) };
                if (result.id != null && result.id !== "") {
                    data.id = result.id;
                }
                if (result.pdfFileId != null && result.pdfFileId !== "") {
                    data.pdfFileId = result.pdfFileId;
                }
                if (result.pdfError) {
                    data.pdfError = result.pdfError;
                }
                return {
                    status: "SUCCESS",
                    data,
                    message: result.msg || result.message || ""
                };
            }

            if (!okSuccess) {
                throw new Error(
                    result?.message ||
                        result?.msg ||
                        "Operación no completada. Revisa la respuesta del Web App (consola F12 → Red)."
                );
            }
            return result;
        }

        const baseInit = {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal
        };

        const attempts = certificadosFetchAttempts(rawPayload);

        let lastTypeError = null;
        try {
            for (let i = 0; i < attempts.length; i++) {
                try {
                    const response = await fetch(url, {
                        ...baseInit,
                        headers: attempts[i].headers,
                        body: attempts[i].body
                    });
                    return await parseResponse(response);
                } catch (err) {
                    if (err?.name === "AbortError") {
                        throw new Error("Tiempo de espera agotado con el servidor de certificados.");
                    }
                    if (err instanceof TypeError) {
                        lastTypeError = err;
                        continue;
                    }
                    throw err;
                }
            }
            throw lastTypeError || new Error("fetch falló");
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error("Tiempo de espera agotado con el servidor de certificados.");
            }
            if (error instanceof TypeError) {
                throw new Error(
                    "No se pudo contactar al Web App (CORS o bloqueo del navegador). " +
                        "Comprueba: 1) Implementación publicada con acceso «Cualquiera». 2) URL /exec correcta. " +
                        "3) Opcional: apunta window.CPM_CERTIFICADOS_GAS_URL al mismo exec que ya te funciona para login."
                );
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    /**
     * POST con timeout mayor (PDF base64 / email).
     * Importante: NO usar solo application/json — dispara preflight CORS y el Web App de Apps Script suele fallar con «TypeError: Failed to fetch».
     * Misma secuencia que postCertificados: text/plain → form payload → json.
     */
    async function postCertificadosLarge(payload, timeoutMs = 90000) {
        const url = certificadosGasUrl();
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        const rawPayload = JSON.stringify(payload);
        const baseInit = {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal
        };
        const attempts = certificadosFetchAttempts(rawPayload);

        async function parseLargeResponse(response) {
            const rawText = await response.text();
            const trimmed = rawText.trim();
            if (!trimmed) {
                throw new Error("El servidor devolvió una respuesta vacía.");
            }
            if (looksLikeHtmlResponse(trimmed)) {
                throw new Error(
                    "El Web App respondió con HTML en lugar de JSON. Revisa la implementación y que doPost devuelva JSON."
                );
            }
            let result;
            try {
                result = JSON.parse(trimmed);
            } catch {
                throw new Error(
                    "No se pudo leer la respuesta (JSON inválido o respuesta cortada). Si el PDF es muy grande, prueba de nuevo."
                );
            }
            if (!response.ok) {
                throw new Error(result?.message || result?.msg || `Error HTTP ${response.status}`);
            }
            if (typeof result.success === "boolean" && !result.success) {
                throw new Error(result.msg || result.message || "El servidor rechazó la operación.");
            }
            return result;
        }

        let lastTypeError = null;
        try {
            for (let i = 0; i < attempts.length; i += 1) {
                try {
                    const response = await fetch(url, {
                        ...baseInit,
                        headers: attempts[i].headers,
                        body: attempts[i].body
                    });
                    return await parseLargeResponse(response);
                } catch (err) {
                    if (err?.name === "AbortError") {
                        throw new Error(
                            "Tiempo de espera agotado. Si el PDF es pesado, espera un momento e inténtalo de nuevo."
                        );
                    }
                    if (err instanceof TypeError) {
                        lastTypeError = err;
                        continue;
                    }
                    throw err;
                }
            }
            throw lastTypeError || new Error("fetch falló");
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error("Tiempo de espera agotado con el servidor de certificados.");
            }
            if (error instanceof TypeError) {
                throw new Error(
                    "No se pudo contactar al Web App (CORS o red). Comprueba la URL /exec y el acceso «Cualquiera» en la implementación."
                );
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function downloadPdfFromBase64(pdfBase64, fileName) {
        const bin = atob(pdfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
            bytes[i] = bin.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "certificado.pdf";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function setHidden(el, hidden) {
        if (!el) return;
        if (hidden) el.setAttribute("hidden", "");
        else el.removeAttribute("hidden");
    }

    window.initCertificadosAdminApp = function initCertificadosAdminApp({ showMessage, getSession }) {
        const root = document.getElementById("certificados");
        if (!root || root.dataset.certAdminBound === "true") return Promise.resolve();
        root.dataset.certAdminBound = "true";

        const form = document.getElementById("cert-form-emitir");
        const btnEmitir = document.getElementById("cert-btn-emitir");
        const emitLoader = document.getElementById("cert-emit-loader");
        const modal = document.getElementById("cert-emitir-modal");
        const modalIdValue = document.getElementById("cert-modal-id-value");
        const btnCopiar = document.getElementById("cert-btn-copiar-id");
        const btnCerrarModal = document.getElementById("cert-btn-cerrar-modal");
        const backdrop = document.getElementById("cert-emitir-modal-backdrop");

        const btnBuscar = document.getElementById("cert-btn-buscar");
        const inputBuscar = document.getElementById("cert-buscar-id");
        const canLoader = document.getElementById("cert-can-loader");
        const cardResult = document.getElementById("cert-canje-result");
        const btnConfirmar = document.getElementById("cert-btn-confirmar-canje");

        const detailId = document.getElementById("cert-detail-id");
        const detailCliente = document.getElementById("cert-detail-cliente");
        const detailServicio = document.getElementById("cert-detail-servicio");
        const detailExp = document.getElementById("cert-detail-exp");
        const detailEstado = document.getElementById("cert-detail-estado");

        let lastLookupId = "";
        let lastDetailRow = null;
        let lastEmitPdfFileId = "";
        let lastEmitServicio = "";
        let lastEmitCertId = "";

        const modalPdfWarning = document.getElementById("cert-modal-pdf-warning");
        const modalPdfActions = document.getElementById("cert-modal-pdf-actions");
        const btnDescargarPdf = document.getElementById("cert-btn-descargar-pdf");
        const inputEmailEnvio = document.getElementById("cert-email-envio");
        const btnEnviarPdf = document.getElementById("cert-btn-enviar-pdf");

        function openModalEmitResult(idText, opts) {
            const o = opts || {};
            if (modalIdValue) modalIdValue.textContent = idText;
            lastEmitCertId = idText;
            lastEmitPdfFileId = o.pdfFileId || "";
            lastEmitServicio = o.servicio || "";

            if (modalPdfWarning) {
                if (o.pdfError) {
                    modalPdfWarning.textContent = o.pdfError;
                    modalPdfWarning.hidden = false;
                } else {
                    modalPdfWarning.textContent = "";
                    modalPdfWarning.hidden = true;
                }
            }
            if (modalPdfActions) {
                const showPdf = Boolean(lastEmitPdfFileId);
                modalPdfActions.hidden = !showPdf;
                if (btnDescargarPdf) btnDescargarPdf.disabled = !showPdf;
                if (btnEnviarPdf) btnEnviarPdf.disabled = !showPdf;
                if (inputEmailEnvio) inputEmailEnvio.value = "";
            }
            setHidden(modal, false);
        }

        function closeModal() {
            setHidden(modal, true);
        }

        function fillDetail(row) {
            if (detailId) detailId.textContent = row.id || "—";
            if (detailCliente) detailCliente.textContent = row.cliente || "—";
            if (detailServicio) detailServicio.textContent = row.servicio || "—";
            if (detailExp) detailExp.textContent = row.exp || "—";
            if (detailEstado) detailEstado.textContent = row.estado || "—";
        }

        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                const nombreCliente = String(document.getElementById("cert-cliente-nombre")?.value || "").trim();
                const servicio = String(document.getElementById("cert-servicio")?.value || "").trim();
                const fechaExp = String(document.getElementById("cert-fecha-exp")?.value || "").trim();
                if (!nombreCliente || !servicio || !fechaExp) {
                    showMessage?.("Completa todos los campos.", "error");
                    return;
                }

                const session = typeof getSession === "function" ? getSession() : null;
                setHidden(emitLoader, false);
                if (btnEmitir) btnEmitir.disabled = true;
                showMessage?.("Generando certificado…", "info", 0);
                try {
                    const result = await postCertificados({
                        action: "generar",
                        datos: {
                            cliente_nombre: nombreCliente,
                            nombreCliente,
                            servicio,
                            fecha_expiracion: fechaExp,
                            fechaExp
                        },
                        session: buildGasSession(session)
                    });
                    const data = result?.data ?? result;
                    const id = extractGenerarId(data);
                    if (!id) {
                        throw new Error("El servidor no devolvió un ID de certificado.");
                    }
                    const pdfWarn = data.pdfError || "";
                    if (pdfWarn) {
                        showMessage?.(`${pdfWarn}. El certificado quedó registrado.`, "error", 6000);
                    } else {
                        showMessage?.("Certificado emitido correctamente.", "success");
                    }
                    openModalEmitResult(id, {
                        pdfFileId: data.pdfFileId || "",
                        pdfError: pdfWarn,
                        servicio
                    });
                } catch (err) {
                    showMessage?.(err.message || "No se pudo emitir el certificado.", "error");
                } finally {
                    setHidden(emitLoader, true);
                    if (btnEmitir) btnEmitir.disabled = false;
                }
            });
        }

        if (btnCopiar && modalIdValue) {
            btnCopiar.addEventListener("click", async () => {
                const text = modalIdValue.textContent?.trim() || "";
                if (!text) return;
                try {
                    await navigator.clipboard.writeText(text);
                    showMessage?.("ID copiado al portapapeles.", "success", 2500);
                } catch {
                    showMessage?.("No se pudo copiar (permiso del navegador).", "error");
                }
            });
        }

        if (btnCerrarModal) btnCerrarModal.addEventListener("click", closeModal);
        if (backdrop) backdrop.addEventListener("click", closeModal);

        if (btnDescargarPdf) {
            btnDescargarPdf.addEventListener("click", async () => {
                if (!lastEmitPdfFileId) return;
                const session = typeof getSession === "function" ? getSession() : null;
                showMessage?.("Descargando PDF…", "info", 0);
                try {
                    const res = await postCertificadosLarge({
                        action: "descargar_pdf",
                        fileId: lastEmitPdfFileId,
                        session: buildGasSession(session)
                    });
                    if (!res.pdfBase64) {
                        throw new Error(res.msg || "No se recibió el PDF.");
                    }
                    downloadPdfFromBase64(res.pdfBase64, res.fileName || `${lastEmitCertId || "certificado"}.pdf`);
                    showMessage?.("Descarga iniciada.", "success", 2500);
                } catch (err) {
                    showMessage?.(err.message || "No se pudo descargar el PDF.", "error");
                }
            });
        }

        if (btnEnviarPdf && inputEmailEnvio) {
            btnEnviarPdf.addEventListener("click", async () => {
                const email = String(inputEmailEnvio.value || "").trim();
                if (!email) {
                    showMessage?.("Escribe un correo de destino.", "error");
                    return;
                }
                if (!lastEmitPdfFileId) return;
                const session = typeof getSession === "function" ? getSession() : null;
                btnEnviarPdf.disabled = true;
                showMessage?.("Enviando correo…", "info", 0);
                try {
                    const res = await postCertificadosLarge({
                        action: "enviar_email",
                        fileId: lastEmitPdfFileId,
                        email: email,
                        id: lastEmitCertId,
                        servicio: lastEmitServicio,
                        session: buildGasSession(session)
                    });
                    if (res.success === false) {
                        throw new Error(res.msg || "No se pudo enviar.");
                    }
                    showMessage?.(res.msg || "Correo enviado.", "success");
                    inputEmailEnvio.value = "";
                } catch (err) {
                    showMessage?.(err.message || "Error al enviar el correo.", "error");
                } finally {
                    btnEnviarPdf.disabled = false;
                }
            });
        }

        async function runConsultarAdmin() {
            const id = normalizeCertId(inputBuscar?.value);
            if (!id) {
                showMessage?.("Ingresa un ID de certificado.", "error");
                return;
            }
            lastLookupId = id;
            setHidden(cardResult, true);
            setHidden(canLoader, false);
            if (btnBuscar) btnBuscar.disabled = true;
            if (btnConfirmar) btnConfirmar.disabled = true;
            showMessage?.("Consultando…", "info", 0);
            try {
                const result = await postCertificados({ action: "consultar", id });
                const row = mapCertRecord(result?.data ?? result);
                if (!row.id) row.id = id;
                lastDetailRow = { ...row };
                fillDetail(row);
                setHidden(cardResult, false);
                if (btnConfirmar) btnConfirmar.disabled = false;
                showMessage?.("Registro encontrado.", "success");
            } catch (err) {
                showMessage?.(err.message || "No se encontró el certificado.", "error");
            } finally {
                setHidden(canLoader, true);
                if (btnBuscar) btnBuscar.disabled = false;
            }
        }

        if (btnBuscar) btnBuscar.addEventListener("click", () => runConsultarAdmin());
        if (inputBuscar) {
            inputBuscar.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    runConsultarAdmin();
                }
            });
        }

        if (btnConfirmar) {
            btnConfirmar.addEventListener("click", async () => {
                const id = lastLookupId || normalizeCertId(inputBuscar?.value);
                if (!id) {
                    showMessage?.("Busca un certificado antes de confirmar el canje.", "error");
                    return;
                }
                setHidden(canLoader, false);
                btnConfirmar.disabled = true;
                if (btnBuscar) btnBuscar.disabled = true;
                showMessage?.("Procesando canje…", "info", 0);
                try {
                    const session = typeof getSession === "function" ? getSession() : null;
                    const result = await postCertificados({
                        action: "canjear",
                        id,
                        session: buildGasSession(session)
                    });
                    const base = lastDetailRow || mapCertRecord(result?.data ?? {});
                    fillDetail({
                        id: base.id || id,
                        cliente: base.cliente,
                        servicio: base.servicio,
                        exp: base.exp,
                        estado: "CANJEADO"
                    });
                    lastDetailRow = { ...base, id: base.id || id, estado: "CANJEADO" };
                    showMessage?.(
                        result?.message || result?.msg || "Canje registrado correctamente.",
                        "success"
                    );
                    setHidden(cardResult, false);
                } catch (err) {
                    showMessage?.(err.message || "No se pudo completar el canje.", "error");
                    btnConfirmar.disabled = false;
                } finally {
                    setHidden(canLoader, true);
                    if (btnBuscar) btnBuscar.disabled = false;
                }
            });
        }

        return Promise.resolve();
    };

    if (!window.__cpmCertModalEscBound) {
        window.__cpmCertModalEscBound = true;
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            const m = document.getElementById("cert-emitir-modal");
            if (m && !m.hasAttribute("hidden")) {
                m.setAttribute("hidden", "");
            }
        });
    }

    window.initCanjePublicoApp = function initCanjePublicoApp({ showMessage }) {
        const root = document.getElementById("canje");
        if (!root || root.dataset.canjePublicBound === "true") return Promise.resolve();
        root.dataset.canjePublicBound = "true";

        const input = document.getElementById("canje-public-codigo");
        const btn = document.getElementById("canje-btn-verificar");
        const loader = document.getElementById("canje-public-loader");
        const validBox = document.getElementById("canje-result-valid");
        const invalidBox = document.getElementById("canje-result-invalid");

        const vId = document.getElementById("canje-valid-id");
        const vCliente = document.getElementById("canje-valid-cliente");
        const vServicio = document.getElementById("canje-valid-servicio");
        const vExp = document.getElementById("canje-valid-exp");
        const vEstado = document.getElementById("canje-valid-estado");
        const invalidMsg = document.getElementById("canje-invalid-msg");

        function hideResults() {
            setHidden(validBox, true);
            setHidden(invalidBox, true);
        }

        async function verificar() {
            const id = normalizeCertId(input?.value);
            if (!id) {
                showMessage?.("Escribe un código para verificar.", "error");
                return;
            }
            hideResults();
            setHidden(loader, false);
            if (btn) btn.disabled = true;
            showMessage?.("Verificando…", "info", 0);
            try {
                const result = await postCertificados({ action: "consultar", id });
                const row = mapCertRecord(result?.data ?? result);
                if (!row.id) row.id = id;
                if (vId) vId.textContent = row.id;
                if (vCliente) vCliente.textContent = row.cliente || "—";
                if (vServicio) vServicio.textContent = row.servicio || "—";
                if (vExp) vExp.textContent = row.exp || "—";
                if (vEstado) vEstado.textContent = row.estado || "Válido";
                setHidden(validBox, false);
                showMessage?.("Código verificado.", "success");
            } catch (err) {
                if (invalidMsg) invalidMsg.textContent = err.message || "Código no válido o expirado.";
                setHidden(invalidBox, false);
                showMessage?.(err.message || "No se pudo verificar el código.", "error");
            } finally {
                setHidden(loader, true);
                if (btn) btn.disabled = false;
            }
        }

        if (btn) btn.addEventListener("click", verificar);
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    verificar();
                }
            });
        }

        return Promise.resolve();
    };
})();
