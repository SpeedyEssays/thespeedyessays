const EMAIL_SECRET_PROPERTY = "SPEEDYESSAYS_EMAIL_SECRET";
const SENT_PREFIX = "sent.";
const REQUEST_WINDOW_SECONDS = 300;
const SENT_RETENTION_MS = 24 * 60 * 60 * 1000;

// Run once as the owner. This asks Google for permission to send email.
function setUpEmailSender() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    if (!properties.getProperty(EMAIL_SECRET_PROPERTY)) {
      const secret = (Utilities.getUuid() + Utilities.getUuid()).replace(
        /-/g,
        "",
      );
      properties.setProperty(EMAIL_SECRET_PROPERTY, secret);
    }
    console.log(
      "Sender ready. Remaining Gmail recipients today: " +
        MailApp.getRemainingDailyQuota(),
    );
  } finally {
    lock.releaseLock();
  }
}

function doPost(event) {
  const raw = event && event.postData && event.postData.contents;
  if (!raw || raw.length > 64000) return emailResponse_("invalid");

  try {
    const envelope = JSON.parse(raw);
    if (
      !envelope ||
      typeof envelope.payload !== "string" ||
      !Number.isSafeInteger(envelope.timestamp) ||
      Math.abs(Date.now() / 1000 - envelope.timestamp) >
        REQUEST_WINDOW_SECONDS ||
      typeof envelope.signature !== "string" ||
      envelope.signature.length !== 44
    ) {
      return emailResponse_("access-denied");
    }

    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty(EMAIL_SECRET_PROPERTY);
    if (!secret) return emailResponse_("access-denied");
    const signature = Utilities.base64Encode(
      Utilities.computeHmacSha256Signature(
        envelope.timestamp + "." + envelope.payload,
        secret,
        Utilities.Charset.UTF_8,
      ),
    );
    if (!equalSignatures_(signature, envelope.signature)) {
      return emailResponse_("access-denied");
    }

    const request = JSON.parse(envelope.payload);
    if (request && request.action === "check") {
      return emailResponse_(
        MailApp.getRemainingDailyQuota() > 0 ? "ready" : "quota",
      );
    }
    if (!validMessage_(request)) return emailResponse_("invalid");
    return deliverEmail_(request, properties);
  } catch (_) {
    return emailResponse_("unavailable");
  }
}

function validMessage_(request) {
  return (
    request &&
    request.action === "send" &&
    typeof request.id === "string" &&
    /^[A-Za-z0-9:_-]{1,120}$/.test(request.id) &&
    typeof request.to === "string" &&
    request.to.length <= 320 &&
    /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(request.to) &&
    typeof request.subject === "string" &&
    request.subject.length > 0 &&
    request.subject.length <= 240 &&
    !/[\r\n]/.test(request.subject) &&
    typeof request.text === "string" &&
    request.text.length > 0 &&
    request.text.length <= 16000 &&
    (request.html === undefined ||
      (typeof request.html === "string" && request.html.length <= 24000))
  );
}

function deliverEmail_(request, properties) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return emailResponse_("busy");
  try {
    const key = SENT_PREFIX + request.id;
    const now = Date.now();
    const cutoff = now - SENT_RETENTION_MS;
    const saved = properties.getProperties();
    if (Number(saved[key]) > cutoff) return emailResponse_("queued");
    if (MailApp.getRemainingDailyQuota() < 1) return emailResponse_("quota");

    for (const name of Object.keys(saved)) {
      if (name.startsWith(SENT_PREFIX) && Number(saved[name]) <= cutoff) {
        properties.deleteProperty(name);
      }
    }

    const mail = {
      to: request.to,
      subject: request.subject,
      body: request.text,
      name: "SpeedyEssays",
    };
    if (request.html) mail.htmlBody = request.html;
    MailApp.sendEmail(mail);
    properties.setProperty(key, String(now));
    return emailResponse_("queued");
  } finally {
    lock.releaseLock();
  }
}

function equalSignatures_(expected, supplied) {
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}

function emailResponse_(status) {
  return ContentService.createTextOutput(
    JSON.stringify({ status }),
  ).setMimeType(ContentService.MimeType.JSON);
}
