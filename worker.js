// =====================================================================
//  SPICCIO — servizio promemoria (Cloudflare Worker, piano gratuito)
//
//  L'app gli manda l'elenco dei promemoria dei prossimi 60 giorni.
//  Ogni 15 minuti il Worker controlla quali sono scaduti e li invia
//  come notifiche push cifrate (Web Push, RFC 8291 + VAPID RFC 8292).
//
//  Serve:
//   - un KV namespace collegato con il nome  SPICCIO
//   - le variabili segrete  APP_KEY, VAPID_PUBLIC, VAPID_PRIVATE_JWK, CONTACT
//   - un trigger Cron:  */15 * * * *
// =====================================================================

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => { const p = "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); };
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ---- cifratura del messaggio (aes128gcm, RFC 8188 / 8291) ----
export async function cifra(payload, p256dh, auth) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// ---- firma VAPID (JWT ES256) ----
async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.CONTACT || "mailto:spiccio@example.com" })));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

async function invia(sub, msg, env) {
  const body = await cifra(JSON.stringify(msg), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(sub.endpoint, env), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "43200", Urgency: "normal" },
    body,
  });
  return r.status;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-App-Key" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

async function inviaScaduti(env) {
  const sub = await env.SPICCIO.get("sub", "json");
  const list = (await env.SPICCIO.get("reminders", "json")) || [];
  if (!sub || !list.length) return { inviati: 0 };
  const sent = (await env.SPICCIO.get("sent", "json")) || {};
  const ora = Date.now(), finestra = 6 * 3600e3;
  let n = 0, scaduta = false;
  for (const r of list) {
    const t = Date.parse(r.at);
    if (t > ora || t < ora - finestra || sent[r.id]) continue;
    const st = await invia(sub, { id: r.id, title: r.title, body: r.body, view: r.view }, env);
    if (st === 404 || st === 410) { scaduta = true; break; }
    if (st < 300) { sent[r.id] = ora; n++; }
  }
  for (const [k, v] of Object.entries(sent)) if (v < ora - 7 * 86400e3) delete sent[k];
  if (n) await env.SPICCIO.put("sent", JSON.stringify(sent));
  if (scaduta) await env.SPICCIO.delete("sub");
  return { inviati: n, iscrizioneScaduta: scaduta };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const path = new URL(req.url).pathname;
    if (path === "/" ) return json({ ok: true, servizio: "Spiccio promemoria" });
    if (path === "/vapid") return json({ publicKey: env.VAPID_PUBLIC });
    if (req.headers.get("X-App-Key") !== env.APP_KEY) return json({ errore: "chiave sbagliata" }, 401);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (path === "/subscribe") {
      if (!body.subscription?.endpoint) return json({ errore: "iscrizione mancante" }, 400);
      await env.SPICCIO.put("sub", JSON.stringify(body.subscription));
      return json({ ok: true });
    }
    if (path === "/schedule") {
      const list = (body.reminders || []).filter(r => r && r.id && r.at).slice(0, 400)
        .map(r => ({ id: String(r.id).slice(0, 80), at: r.at, title: String(r.title || "").slice(0, 120), body: String(r.body || "").slice(0, 400), view: String(r.view || "home").slice(0, 20) }));
      await env.SPICCIO.put("reminders", JSON.stringify(list));
      return json({ ok: true, promemoria: list.length });
    }
    if (path === "/test") {
      const sub = await env.SPICCIO.get("sub", "json");
      if (!sub) return json({ errore: "nessun dispositivo iscritto" }, 400);
      const st = await invia(sub, { id: "test", title: "👋 Spiccio funziona", body: "Le notifiche arrivano. A presto con i promemoria!", view: "home" }, env);
      return json({ ok: st < 300, stato: st }, st < 300 ? 200 : 502);
    }
    if (path === "/run") return json(await inviaScaduti(env));
    return json({ errore: "non trovato" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(inviaScaduti(env));
  },
};
