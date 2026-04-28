/**
 * Cliente HTTP para Web Apps Ángeles (Maestro y Emisor).
 * Incluye projectSecret en el cuerpo JSON (no por cabeceras HTTP: evita preflight CORS y GAS no las expone de forma fiable).
 * Opcional: window.CPM_ANGELS_MASTER_GAS_URL
 */
(function () {
    function masterUrl() {
        return String(
            (typeof window !== "undefined" && window.CPM_ANGELS_MASTER_GAS_URL) || ""
        ).trim();
    }

    function looksLikeHtmlResponse(text) {
        const t = String(text || "").trim();
        return t.startsWith("<!") || t.startsWith("<html") || t.startsWith("<HTML");
    }

    /**
     * Solo text/plain y form-urlencoded: suelen evitar preflight CORS.
     * No usar application/json aquí: dispara OPTIONS y muchos despliegues GAS fallan en el 3.er intento.
     */
    function buildAttempts(rawPayload) {
        return [
            { headers: { "Content-Type": "text/plain;charset=utf-8" }, body: rawPayload },
            {
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: new URLSearchParams({ payload: rawPayload }).toString()
            }
        ];
    }

    async function parseGasJson(response) {
        const rawText = await response.text();
        const trimmed = rawText.trim();
        if (!trimmed) {
            throw new Error("Respuesta vacía del servidor.");
        }
        if (looksLikeHtmlResponse(trimmed)) {
            throw new Error(
                "El Web App respondió HTML en lugar de JSON. Revisa la implementación y el despliegue."
            );
        }
        let result;
        try {
            result = JSON.parse(trimmed);
        } catch (e) {
            throw new Error("Respuesta no JSON desde Apps Script.");
        }
        if (!response.ok) {
            throw new Error(result.message || result.msg || `Error HTTP ${response.status}`);
        }
        if (result.status && result.status !== "SUCCESS") {
            throw new Error(result.message || result.msg || "Operación no completada.");
        }
        if (result.ok === false) {
            throw new Error(result.message || result.msg || "Operación no completada.");
        }
        return result;
    }

    /**
     * @param {object} [opts]
     * @param {number} [opts.timeoutMs] tiempo máximo de espera (p. ej. borrado con Drive)
     */
    async function postToUrl(url, payload, extraHeaders, opts) {
        if (!url) {
            throw new Error(
                "Falta la URL del Web App. Define window.CPM_ANGELS_MASTER_GAS_URL en index.html (Maestro)."
            );
        }
        const timeoutMs = Math.min(
            Math.max(Number(opts && opts.timeoutMs) || 28000, 8000),
            330000
        );
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        const rawPayload = JSON.stringify(payload);
        const baseHeaders = Object.assign({}, extraHeaders || {});
        const attempts = buildAttempts(rawPayload).map((a) => ({
            headers: Object.assign({}, baseHeaders, a.headers),
            body: a.body
        }));

        let lastNetworkErr = null;
        try {
            for (let i = 0; i < attempts.length; i++) {
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        mode: "cors",
                        redirect: "follow",
                        credentials: "omit",
                        cache: "no-store",
                        headers: attempts[i].headers,
                        body: attempts[i].body,
                        signal: controller.signal
                    });
                    return await parseGasJson(response);
                } catch (err) {
                    if (err?.name === "AbortError") {
                        throw new Error(
                            timeoutMs >= 60000
                                ? "Tiempo de espera agotado (operación larga). Vuelve a intentar o revisa permisos Drive en el Maestro."
                                : "Tiempo de espera agotado."
                        );
                    }
                    if (!(err instanceof TypeError)) {
                        throw err;
                    }
                    lastNetworkErr = err;
                    if (i === attempts.length - 1) {
                        break;
                    }
                }
            }
        } finally {
            window.clearTimeout(timeoutId);
        }
        if (lastNetworkErr instanceof TypeError) {
            const hint = lastNetworkErr.message ? ` Detalle técnico: ${lastNetworkErr.message}` : "";
            throw new Error(
                "No se pudo conectar al Web App (red, bloqueo o CORS). Comprueba la URL del Maestro (/exec), el despliegue «Cualquier usuario» y que la página sea https si el script también lo es." +
                    hint
            );
        }
        throw lastNetworkErr || new Error("No se pudo conectar.");
    }

    /**
     * Maestro: resolve_by_hash no requiere projectSecret; super_* requiere masterPin en payload.
     */
    /** @param {object} [fetchOpts] p. ej. `{ timeoutMs: 120000 }` para borrados lentos (Drive). */
    async function postMaster(payload, fetchOpts) {
        const url = masterUrl();
        return postToUrl(url, payload, {}, fetchOpts);
    }

    /**
     * Emisor: firma (url, projectSecret, payload). Todas las llamadas del sitio pasan el secret en 2.º lugar
     * y el objeto JSON (acción + campos) en 3.º; el cuerpo final siempre incluye projectSecret como string.
     * No usamos cabecera X-Project-Secret: provoca preflight CORS y el valor ya va en el POST.
     */
    async function postSender(senderUrl, projectSecret, payload, fetchOpts) {
        const pl = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
        const sec = String(projectSecret || pl.projectSecret || "").trim();
        const body = Object.assign({}, pl, { projectSecret: sec });
        return postToUrl(senderUrl, body, {}, fetchOpts);
    }

    window.CPMAngelsApi = {
        masterUrl,
        postMaster,
        postSender
    };
})();
