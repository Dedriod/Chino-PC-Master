# Clasp y Apps Script (varios proyectos)

Esta guÃ­a describe cÃ³mo trabajar con **clasp** cuando tienes **varios proyectos de Google Apps Script**, cada uno en **su propia carpeta** y **vinculado a su propio proyecto en Google**. El cÃ³digo **no** se versiona en el repo del sitio (`ChinoPCMasterWebSite`).

## CÃ³mo estÃ¡ organizado tu entorno

| UbicaciÃ³n | QuÃ© es | Â¿Va a GitHub? |
|-----------|--------|----------------|
| `ChinoPCMasterWebSite/` | Sitio estÃ¡tico (HTML, CSS, JS) | SÃ­ |
| `ChinoPCMasterAppScripts/fuentes-apps-script/` | CÃ³digo **Apps Script** por proyecto (clasp) | No (carpeta local / hermana del repo) |

- **Certificados:** cÃ³digo y `.clasp.json` en `ChinoPCMasterAppScripts/fuentes-apps-script/certificados/`.
- Los `.bat` en `ChinoPCMasterAppScripts/Certificados/` ejecutan clasp en esa ruta (puedes seguir usÃ¡ndolos).

El archivo `ChinoPCMasterWebSite.code-workspace` puede abrir el sitio y `ChinoPCMasterAppScripts` a la vez.

---

## Requisitos previos (una sola vez por PC)

1. **Node.js LTS** instalado: [https://nodejs.org/](https://nodejs.org/)
2. **Clasp** global:
   ```bash
   npm install -g @google/clasp
   ```
3. **Google Apps Script API** activada: [Ajustes de usuario de Apps Script](https://script.google.com/home/usersettings) â†’ interruptor **On**.
4. **Inicio de sesiÃ³n** (abre el navegador):
   ```bash
   clasp login
   ```

---

## Regla de oro: un proyecto = una carpeta = un `.clasp.json`

Cada subcarpeta bajo `fuentes-apps-script` (por ejemplo `certificados` o `db_usuarios_chinopc`) debe tener **su propio** `.clasp.json` con **su** `scriptId`. AsÃ­, `clasp push` y `clasp pull` solo afectan **ese** proyecto en Google.

**Nunca** mezcles archivos de dos Apps Script distintos en la misma carpeta sin unificar proyectos en Google (no recomendado).

---

## Comandos que usarÃ¡s cada dÃ­a

Ejecuta los comandos **desde la carpeta que contiene `.clasp.json`**:

`...\ChinoPCMasterAppScripts\fuentes-apps-script\certificados`

(O usa los `.bat` en `...\ChinoPCMasterAppScripts\Clasp\` para Certificados o `...\ChinoPCMasterAppScripts\DB_Usuarios_ChinoPC\` para Usuarios.)

### `clasp pull`

- **QuÃ© hace:** Descarga el cÃ³digo **desde Google** hacia tu disco.
- **Ejemplo:**
  ```bash
  cd "ruta\a\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
  clasp pull
  ```

### `clasp push`

- **QuÃ© hace:** Sube tu cÃ³digo **local a Google**.
- **DespuÃ©s:** Si publicaste una **Web App**, a veces debes **Implementar â†’ Administrar implementaciones â†’ Nueva versiÃ³n**.
- **Ejemplo:**
  ```bash
  cd "ruta\a\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
  clasp push
  ```

### `clasp open`

- **QuÃ© hace:** Abre el proyecto en el **editor web** de Apps Script.
- **Ejemplo:**
  ```bash
  cd "ruta\a\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
  clasp open
  ```

### Otros Ãºtiles

| Comando | Uso breve |
|---------|-----------|
| `clasp status` | Ver quÃ© archivos locales difieren del remoto (aproximado). |
| `clasp logs` | Ver registros de ejecuciÃ³n (segÃºn configuraciÃ³n). |
| `clasp clone <scriptId>` | Nueva carpeta local desde un proyecto en Google. |

---

## AÃ±adir otro proyecto de Apps Script

1. Crea `ChinoPCMasterAppScripts\fuentes-apps-script\tu-proyecto\`.
2. `clasp clone TU_SCRIPT_ID` dentro de esa carpeta (o copia la estructura de `certificados`).
3. Opcional: aÃ±ade `.bat` redireccionadores como en `Certificados/`.

---

## GitHub vs clasp

- **`git push`** (desde `ChinoPCMasterWebSite`): solo el sitio. La ruta `/apps-script/` estÃ¡ en `.gitignore` por si se crea por error.
- **`clasp push`**: solo **Google Apps Script**.

---

## Resumen rÃ¡pido (Certificados)

```bash
cd "...\ChinoPCMasterAppScripts\fuentes-apps-script\certificados"
clasp pull
# editar CÃ³digo.js / HTML en Cursor
clasp push
```

### Publicar Web App sin abrir Google (push + versiÃ³n + redeploy)

En `fuentes-apps-script\certificados\` guarda el **Deployment ID** de tu Web App (una lÃ­nea) en **`webapp-deployment-id.txt`**.

Doble clic en **`ChinoPCMasterAppScripts\Clasp\clasp-push.bat`** (Certificados) o **`ChinoPCMasterAppScripts\DB_Usuarios_ChinoPC\clasp-push.bat`** (Usuarios): ejecuta `clasp push`, `clasp version` y **`clasp redeploy <id> -V <n> -d "..."`** manteniendo la **misma URL** `/exec`.

Manual equivalente tras un `push`:

```bash
clasp version "notas del cambio"
clasp redeploy TU_DEPLOYMENT_ID -V NUMERO_VERSION -d "notas"
```

### Ángeles (Maestro + Emisor)

- **Maestro:** `ChinoPCMasterAppScripts\fuentes-apps-script\angels_maestro` — bat en `Angels_Maestro\`.
- **Emisor (plantilla):** `fuentes-apps-script\angels_sender` — bat en `Angels_Sender\`; duplica el proyecto por cada cuenta Google.
- En el sitio: `window.CPM_ANGELS_MASTER_GAS_URL` en `index.html` (URL `/exec` del Maestro).
- **ID de implementación** del Web App Maestro (para `clasp redeploy`): `ChinoPCMasterAppScripts\fuentes-apps-script\angels_maestro\webapp-deployment-id.txt`; la URL canónica también está en `Angels_Maestro\LEEME.txt`.

#### Emisor: modelo anti-spam (cola + trigger semanal)

Para evitar que Google marque el sistema como “spammy”, el envío se hace así:

- La web (`#u/...`) **no envía correos**. Solo guarda filas en la hoja `Pendientes` (estado `PENDING`).
- El Apps Script Emisor envía **solo por un Time-Driven Trigger** de Google (interno), ejecutando la función pública **`processPendingQueue`** (menú **Ejecutar** y selector de activadores). Las funciones con nombre terminado en `_` suelen **no aparecer** en ese selector; por eso existe este wrapper. El día de envío operativo es **miércoles** (configúralo en el editor; no hay hoja `Cron` ni UI de cronograma en el admin).
- Existe una acción de emergencia **solo admin** (“Ejecutar cola ahora”, pestaña Mantenimiento) para casos excepcionales.

**Semanas y numeración (W1, W2, …)**

- Una semana del proyecto va de **jueves 00:00** a **miércoles** (fin de día) en la zona `Session.getScriptTimeZone()` del script.
- **W1** es la semana que contiene `FECHA_INICIO_ISO` (Script Property). `computeWeekKey_()` no usa hoja Cron.
- Cada ángel puede tener **como máximo un mensaje por semana** (`week_key` + `nombre_angel`); el guardado lo valida en `user_save_message`.

**Pausa entre envíos**

- Opcional: Script Property `QUEUE_SLEEP_MS` (0–30000; por defecto 2000). Ya no se guarda en ninguna hoja.

**Instalar / actualizar el trigger (en Google)**

1. Abre el proyecto **Emisor** en Apps Script.
2. **Activadores** → **Añadir activador**.
3. Función: **`processPendingQueue`** (sin `_` al final).
4. Evento: basado en el tiempo → reloj → **semanal** → día **miércoles** (elige hora, p. ej. noche en tu zona).
5. Guarda y acepta permisos si hace falta.

Verificación: **Activadores** debe listar el trigger semanal para `processPendingQueue`. El admin puede ver si aparece “instalado” vía la acción `get_sender_info` (texto de estado bajo la tabla de ángeles). Prueba manual: **Ejecutar** → `processPendingQueue` → revisa **Registro de ejecución** y la hoja Enviados.

**Checklist de verificación**

- Semana: `get_sender_info` / `computeWeekKey_()` coherente con jueves→miércoles y W1 desde `FECHA_INICIO_ISO`.
- Cola: varias filas `PENDING`/`ERROR` con `week_key` ≤ semana actual → `processPendingQueue()` las envía en orden de semana (atrasados primero), con pausa `QUEUE_SLEEP_MS`.
- Idempotencia: filas `SENT` no se reenvían.
- Uno por semana: segundo `user_save_message` mismo ángel y misma semana → error.
- Emergencia: “Ejecutar cola ahora” solo con contraseña admin.

---

## Problemas frecuentes

- **API no usada:** [ajustes de usuario](https://script.google.com/home/usersettings) â†’ API activada; espera unos minutos.
- **Push en la carpeta equivocada:** debe existir `.clasp.json` en el directorio actual.
- **Excluir archivos del push:** `.claspignore` en la misma carpeta que `.clasp.json` ([clasp](https://github.com/google/clasp)).


