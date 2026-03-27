/**
 * CHINO PC MASTER - SISTEMA INTEGRADO v4.5 (réplica repo + hardening)
 * Lógica de negocio + PDF con logo en Base64 + Web App.
 *
 * En proyecto vinculado a la hoja: SPREADSHEET_ID por getActiveSpreadsheet().
 * Si el Web App no está vinculado: define propiedad del script SPREADSHEET_ID.
 *
 * CERT_LOGO_URL (opcional): URL pública del PNG (por defecto GitHub Pages).
 */

var SPREADSHEET_ID = (function () {
  var fromProp = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (fromProp) return fromProp;
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("Define SPREADSHEET_ID en Propiedades del script o vincula el proyecto a la hoja.");
  }
  return active.getId();
})();

var SHEET_NAME = "CERTIFICADOS_DATA";
var CERTIFICADOS_DRIVE_FOLDER_ID = "1f-O1V0Hk9xxS4UHeRqJtlkpeaQ5cuuKE";
var CERT_LOGO_URL_DEFAULT =
  "https://dedriod.github.io/Chino-PC-Master/imagenes/Extracci%C3%B3n%20Logo.png";

// --- ENRUTADOR ---

function doGet() {
  return jsonResponse_({
    ok: true,
    mensaje: "Web App Chino PC Master activa. Backend listo para PDF con logo Base64."
  });
}

function doPost(e) {
  try {
    var body = parseRequestBody_(e);
    var action = String(body.action || "").toLowerCase();
    var session = normalizeSession_(body.session);

    if (action === "generar") {
      var datos = body.datos || {};
      datos.cliente_nombre = datos.cliente_nombre || datos.nombreCliente;
      datos.fecha_expiracion = datos.fecha_expiracion || datos.fechaExp;
      return jsonResponse_(handleGenerarCertificado(datos, session));
    }

    if (action === "consultar") {
      var codigo = normalizeCodigo_(body.id || body.codigo);
      return jsonResponse_(handleConsultarPublico(codigo));
    }

    if (action === "canjear") {
      var codigo2 = normalizeCodigo_(body.id || body.codigo);
      return jsonResponse_(handleCanjearCertificado(codigo2, session));
    }

    if (action === "descargar_pdf") {
      return jsonResponse_(handleDescargarPdfCertificado(body.fileId, session));
    }

    if (action === "enviar_email") {
      return jsonResponse_(
        handleEnviarCertificadoEmail(body.fileId, body.email, body.id, body.servicio, session)
      );
    }

    return jsonResponse_({ success: false, msg: "Acción no reconocida: " + action });
  } catch (err) {
    return jsonResponse_({ success: false, msg: "Error crítico en backend: " + String(err) });
  }
}

// --- HOJA ---

function ensurePdfColumnHeader_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 8) {
    sheet.getRange(1, 8).setValue("PDF_FILE_ID");
  } else if (!sheet.getRange(1, 8).getValue()) {
    sheet.getRange(1, 8).setValue("PDF_FILE_ID");
  }
}

function ensureCertificadosSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "ID_CODIGO",
      "CLIENTE_NOMBRE",
      "SERVICIO",
      "FECHA_EMISION",
      "FECHA_EXPIRACION",
      "ESTADO",
      "FECHA_CANJE",
      "PDF_FILE_ID"
    ]);
  } else {
    ensurePdfColumnHeader_(sheet);
  }
  return sheet;
}

function generarIDUnico() {
  var caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var sheet = ensureCertificadosSheet_();
  var idsExistentes = sheet.getRange("A:A").getValues().flat();
  var idGenerado;
  var esUnico = false;

  while (!esUnico) {
    idGenerado = "CPM-";
    for (var i = 0; i < 6; i++) {
      idGenerado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    if (idsExistentes.indexOf(idGenerado) === -1) esUnico = true;
  }
  return idGenerado;
}

function handleGenerarCertificado(datos, session) {
  if (
    !session ||
    (session.role !== "admin" &&
      !(session.permissions && session.permissions.indexOf("certificados") >= 0))
  ) {
    return { success: false, msg: "No tienes permisos para emitir certificados." };
  }

  try {
    var sheet = ensureCertificadosSheet_();
    var nuevoId = generarIDUnico();
    var hoy = new Date();
    var fechaExp = new Date(datos.fecha_expiracion);

    sheet.appendRow([nuevoId, datos.cliente_nombre, datos.servicio, hoy, fechaExp, "ACTIVO", "", ""]);

    var lastRow = sheet.getLastRow();
    var pdfFileId = "";
    var pdfError = "";

    try {
      var pdfBlob = buildCertificadoPdfBlob_(nuevoId, datos);
      var folder = DriveApp.getFolderById(CERTIFICADOS_DRIVE_FOLDER_ID);
      var file = folder.createFile(pdfBlob.setName("Certificado_" + nuevoId + ".pdf"));
      pdfFileId = file.getId();
      sheet.getRange(lastRow, 8).setValue(pdfFileId);
    } catch (e) {
      pdfError = "Fallo en subir el archivo PDF a Google Drive";
      Logger.log("Error PDF: " + e.toString());
    }

    return {
      success: true,
      id: nuevoId,
      msg: "Certificado generado exitosamente.",
      pdfFileId: pdfFileId || "",
      pdfError: pdfError || ""
    };
  } catch (e) {
    return { success: false, msg: "Error: " + e.toString() };
  }
}

function getCertLogoUrl_() {
  return PropertiesService.getScriptProperties().getProperty("CERT_LOGO_URL") || CERT_LOGO_URL_DEFAULT;
}

function getCertLogoSrcForPdf_() {
  var url = getCertLogoUrl_();
  try {
    var response = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true,
      validateHttpsCertificates: true
    });
    if (response.getResponseCode() !== 200) {
      Logger.log("Logo HTTP " + response.getResponseCode());
      return url;
    }
    var blob = response.getBlob();
    var contentType = blob.getContentType() || "image/png";
    var base64 = Utilities.base64Encode(blob.getBytes());
    return "data:" + contentType + ";base64," + base64;
  } catch (e) {
    Logger.log("Fallo fetch logo: " + e.toString());
    return url;
  }
}

/**
 * Carta horizontal, marca neon; logo embebido (data URI).
 * servicio e idCodigo escapados para evitar rotura del HTML/PDF.
 */
function buildCertificadoPdfBlob_(idCodigo, datos) {
  var rawLogo = getCertLogoSrcForPdf_();
  var logoAttr = rawLogo.indexOf("data:") === 0 ? rawLogo : escapeHtml_(rawLogo);

  var fechaExp = datos.fecha_expiracion ? new Date(datos.fecha_expiracion) : new Date();
  var fechaStr = Utilities.formatDate(fechaExp, Session.getScriptTimeZone(), "dd/MM/yyyy");
  var servicioEsc = escapeHtml_(String(datos.servicio || "").toUpperCase());
  var idEsc = escapeHtml_(String(idCodigo || ""));

  var html =
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" +
    "<style>" +
    "@page { size: letter landscape; margin: 10mm; }" +
    "body{margin:0;padding:0;background:#080808;color:#e0e0e0;font-family:Helvetica,Segoe UI,Arial,sans-serif;" +
    "-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
    ".container{width:100%;border:4px solid #00FFFF;padding:30px;box-sizing:border-box;background:#080808;position:relative;}" +
    ".logo-box{text-align:center;margin-bottom:15px;}" +
    ".logo-box img{max-height:2.45in;max-width:92%;object-fit:contain;filter:drop-shadow(0 0 10px rgba(0,255,255,0.2));}" +
    ".header-title{text-align:center;color:#00FFFF;font-size:26px;letter-spacing:6px;margin-bottom:25px;font-weight:bold;}" +
    ".content-box{border:2px solid #0047AB;background:linear-gradient(180deg,rgba(0,71,171,0.1) 0%,rgba(0,71,171,0.3) 100%);" +
    "padding:35px;text-align:center;margin-bottom:30px;}" +
    ".label{color:#a0a0a0;font-size:12px;text-transform:uppercase;letter-spacing:2px;display:block;margin-bottom:8px;}" +
    ".service-name{font-size:32px;color:#FFFFFF;font-weight:bold;line-height:1.15;}" +
    ".footer-info{display:table;width:100%;margin-top:20px;border-top:1px solid rgba(0,255,255,0.2);padding-top:20px;}" +
    ".footer-col{display:table-cell;width:50%;font-size:16px;vertical-align:top;}" +
    ".value-code{color:#FF4500;font-family:Courier New,monospace;font-weight:bold;font-size:22px;}" +
    ".value-date{color:#FFFFFF;font-size:20px;}" +
    ".neon-bar{height:10px;margin-top:30px;background:linear-gradient(to right,#0047AB,#00FFFF,#FF4500);}" +
    "</style></head><body>" +
    '<div class="container">' +
    '<div class="logo-box"><img src="' +
    logoAttr +
    '" alt="Chino PC Master"></div>' +
    '<div class="header-title">CERTIFICADO OFICIAL</div>' +
    '<div class="content-box">' +
    '<span class="label">Servicio autorizado</span>' +
    '<div class="service-name">' +
    servicioEsc +
    "</div></div>" +
    '<div class="footer-info">' +
    '<div class="footer-col" style="text-align:left;">' +
    '<span class="label">Válido hasta</span>' +
    '<span class="value-date">' +
    fechaStr +
    "</span></div>" +
    '<div class="footer-col" style="text-align:right;">' +
    '<span class="label">Código de validación</span>' +
    '<span class="value-code">' +
    idEsc +
    "</span></div></div>" +
    '<div class="neon-bar"></div></div></body></html>';

  return HtmlService.createHtmlOutput(html).setWidth(1100).setHeight(850).getAs("application/pdf");
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function handleConsultarPublico(codigo) {
  var sheet = ensureCertificadosSheet_();
  var data = sheet.getDataRange().getValues();
  var hoy = new Date();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === codigo) {
      var exp = new Date(data[i][4]);
      var estado = data[i][5];
      if (estado === "ACTIVO" && hoy > exp) {
        estado = "EXPIRADO";
        sheet.getRange(i + 1, 6).setValue("EXPIRADO");
      }
      return {
        success: true,
        data: {
          cliente: data[i][1],
          servicio: data[i][2],
          expiracion: data[i][4],
          estado: estado
        }
      };
    }
  }
  return { success: false, msg: "Código no encontrado." };
}

function handleCanjearCertificado(codigo, session) {
  if (!session || session.role !== "admin") {
    return { success: false, msg: "Acceso Admin requerido." };
  }
  var sheet = ensureCertificadosSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === codigo) {
      if (data[i][5] === "CANJEADO") return { success: false, msg: "Ya fue canjeado." };
      if (new Date() > new Date(data[i][4])) return { success: false, msg: "Certificado expirado." };
      sheet.getRange(i + 1, 6).setValue("CANJEADO");
      sheet.getRange(i + 1, 7).setValue(new Date());
      return { success: true, msg: "Canje exitoso para: " + data[i][1] };
    }
  }
  return { success: false, msg: "Código no encontrado." };
}

function handleDescargarPdfCertificado(fileId, session) {
  if (!session || session.role !== "admin") return { success: false, msg: "No autorizado." };
  try {
    var file = DriveApp.getFileById(fileId);
    return {
      success: true,
      pdfBase64: Utilities.base64Encode(file.getBlob().getBytes()),
      fileName: file.getName()
    };
  } catch (e) {
    return { success: false, msg: "Error al leer PDF." };
  }
}

function handleEnviarCertificadoEmail(fileId, emailDestino, idCert, servicio, session) {
  if (!session || session.role !== "admin") return { success: false, msg: "No autorizado." };
  var email = String(emailDestino || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, msg: "Correo no válido." };
  }
  try {
    var file = DriveApp.getFileById(fileId);
    var asunto = "Certificado de Chino PC Master";
    var cuerpo =
      "Estimado/a cliente,\n\n" +
      "Adjunto encontrará su certificado digital emitido por Chino PC Master. " +
      "Este documento acredita su derecho a recibir un servicio gratuito según las condiciones aplicables.\n\n" +
      "ID del certificado: " +
      (idCert || "") +
      "\nServicio: " +
      (servicio || "") +
      "\n\nAtentamente,\nChino PC Master";
    MailApp.sendEmail({
      to: email,
      subject: asunto,
      body: cuerpo,
      attachments: [file.getBlob().setName(file.getName() || "Certificado.pdf")]
    });
    return { success: true, msg: "Correo enviado a " + email };
  } catch (e) {
    return { success: false, msg: "Error al enviar email." };
  }
}

function parseRequestBody_(e) {
  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  return {};
}

function normalizeCodigo_(c) {
  return String(c || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeSession_(s) {
  if (!s) return null;
  return { role: s.role || "", permissions: Array.isArray(s.permissions) ? s.permissions : [] };
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
