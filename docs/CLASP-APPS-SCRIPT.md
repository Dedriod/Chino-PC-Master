# Clasp y Apps Script (varios proyectos)

Esta guía describe cómo trabajar con **clasp** cuando tienes **varios proyectos de Google Apps Script**, cada uno en **su propia carpeta** y **vinculado a su propio proyecto en Google**. El código **no** se versiona en el repo del sitio (`ChinoPCMasterWebSite`).

## Cómo está organizado tu entorno

| Ubicación | Qué es | ¿Va a GitHub? |
|-----------|--------|----------------|
| `ChinoPCMasterWebSite/` | Sitio estático (HTML, CSS, JS) | Sí |
| `ChinoPCMasterAppScripts/fuentes-apps-script/` | Código **Apps Script** por proyecto (clasp) | No (carpeta local / hermana del repo) |

- **Certificados:** código y `.clasp.json` en `ChinoPCMasterAppScripts/fuentes-apps-script/certificados/`.
- Los `.bat` en `ChinoPCMasterAppScripts/Certificados/` ejecutan clasp en esa ruta (puedes seguir usándolos).

El archivo `ChinoPCMasterWebSite.code-workspace` puede abrir el sitio y `ChinoPCMasterAppScripts` a la vez.

---

## Requisitos previos (una sola vez por PC)

1. **Node.js LTS** instalado: [https://nodejs.org/](https://nodejs.org/)
2. **Clasp** global:
   ```bash
   npm install -g @google/clasp
   ```
3. **Google Apps Script API** activada: [Ajustes de usuario de Apps Script](https://script.google.com/home/usersettings) → interruptor **On**.
4. **Inicio de sesión** (abre el navegador):
   ```bash
   clasp login
   ```

---

## Regla de oro: un proyecto = una carpeta = un `.clasp.json`

Cada subcarpeta bajo `fuentes-apps-script` (por ejemplo `certificados`) debe tener **su propio** `.clasp.json` con **su** `scriptId`. Así, `clasp push` y `clasp pull` solo afectan **ese** proyecto en Google.

**Nunca** mezcles archivos de dos Apps Script distintos en la misma carpeta sin unificar proyectos en Google (no recomendado).

---

## Comandos que usarás cada día

Ejecuta los comandos **desde la carpeta que contiene `.clasp.json`**:

`...\ChinoPCMasterAppScripts\fuentes-apps-script\certificados`

(O usa los `.bat` en `...\ChinoPCMasterAppScripts\Certificados\`.)

### `clasp pull`

- **Qué hace:** Descarga el código **desde Google** hacia tu disco.
- **Ejemplo:**
  ```bash
  cd "ruta\a\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
  clasp pull
  ```

### `clasp push`

- **Qué hace:** Sube tu código **local a Google**.
- **Después:** Si publicaste una **Web App**, a veces debes **Implementar → Administrar implementaciones → Nueva versión**.
- **Ejemplo:**
  ```bash
  cd "ruta\a\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
  clasp push
  ```

### `clasp open`

- **Qué hace:** Abre el proyecto en el **editor web** de Apps Script.
- **Ejemplo:**
  ```bash
  cd "ruta\a\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
  clasp open
  ```

### Otros útiles

| Comando | Uso breve |
|---------|-----------|
| `clasp status` | Ver qué archivos locales difieren del remoto (aproximado). |
| `clasp logs` | Ver registros de ejecución (según configuración). |
| `clasp clone <scriptId>` | Nueva carpeta local desde un proyecto en Google. |

---

## Añadir otro proyecto de Apps Script

1. Crea `ChinoPCMasterAppScripts\fuentes-apps-script\tu-proyecto\`.
2. `clasp clone TU_SCRIPT_ID` dentro de esa carpeta (o copia la estructura de `certificados`).
3. Opcional: añade `.bat` redireccionadores como en `Certificados/`.

---

## GitHub vs clasp

- **`git push`** (desde `ChinoPCMasterWebSite`): solo el sitio. La ruta `/apps-script/` está en `.gitignore` por si se crea por error.
- **`clasp push`**: solo **Google Apps Script**.

---

## Resumen rápido (Certificados)

```bash
cd "...\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
clasp pull
# editar Código.js / HTML en Cursor
clasp push
```

O doble clic en `ChinoPCMasterAppScripts\Certificados\clasp-push.bat` (redirige a la carpeta anterior).

---

## Problemas frecuentes

- **API no usada:** [ajustes de usuario](https://script.google.com/home/usersettings) → API activada; espera unos minutos.
- **Push en la carpeta equivocada:** debe existir `.clasp.json` en el directorio actual.
- **Excluir archivos del push:** `.claspignore` en la misma carpeta que `.clasp.json` ([clasp](https://github.com/google/clasp)).
