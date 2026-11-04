// =====================================================================
//  SPICCIO — interfaccia
// =====================================================================
(function () {
  "use strict";
  const { eur, eur0, num, dk, dm, r2, somma, uid, parseAmount, inRange } = Core.util;
  const { MESI, GIORNI } = Core;
  const ic = Icons.icon;

  // ------------------------------ STATO ------------------------------
  const KEY = "spiccio.data.v1", LKEY = "spiccio.local.v1";
  let S, K, L;
  function loadAll() {
    try { S = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { S = null; }
    S = S ? Core.normalizza(S) : null;
    try { L = JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch (e) { L = {}; }
    L = Object.assign({ gistId: "", token: "", workerUrl: "", appKey: "", pushOn: false, nascondi: false, lastSync: null, syncErr: null, schedHash: "", schedAt: 0, tema: "scuro" }, L);
  }
  function saveLocal() { try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (e) {} }
  function saveData() {
    S.meta.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(S)); localStorage.setItem(KEY + ".prev", localStorage.getItem(KEY + ".last") || ""); localStorage.setItem(KEY + ".last", new Date().toISOString()); } catch (e) { toast("Spazio pieno", "Non riesco a salvare sul telefono: fai un backup e sincronizza.", "bad"); }
  }
  // Ogni modifica passa da qui: aggiorna, salva, ridisegna, sincronizza.
  function commit(fn, { config = false, quiet = false } = {}) {
    fn(S);
    if (config) S.settingsU = Date.now();
    saveData();
    K = Core.make(S);
    if (!quiet) render();
    queueSync(); queueSchedule();
  }
  const now = () => Date.now();
  const touch = o => (o.u = now(), o);
  function remove(listName, id) { S[listName] = S[listName].filter(x => x.id !== id); S.deleted[id] = now(); }

  // ----------------------------- HELPERS -----------------------------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const M = v => L.nascondi ? "•••" : eur(v);
  const M0 = v => L.nascondi ? "•••" : eur0(v);
  const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? a / b * 100 : (a > 0 ? 100 : 0)));
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const dLong = d => `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
  const dShort = d => `${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)}`;
  const toLocalInput = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const catIcon = c => ic(c?.icon || "tag", 20);
  function vibra(ms = 12) { try { navigator.vibrate?.(ms); } catch (e) {} }

  function barClass(speso, budget) { const p = budget > 0 ? speso / budget : (speso > 0 ? 2 : 0); return p > 1 ? "bad" : p >= 1 - S.settings.budgetQuasiFinito ? "warn" : "ok"; }

  // ------------------------------ TOAST ------------------------------
  function toast(t1, t2 = "", kind = "") {
    const w = $("#toasts"); const el = document.createElement("div");
    el.className = "toast " + kind; el.innerHTML = `<b>${esc(t1)}</b>${esc(t2)}`;
    w.append(el); setTimeout(() => el.remove(), 4200);
  }

  // ------------------------------ SHEET ------------------------------
  const sheets = [];
  function openSheet({ title, body, footer = "", onMount, wide }) {
    const scrim = document.createElement("div"); scrim.className = "scrim";
    const sh = document.createElement("section"); sh.className = "sheet"; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", title);
    sh.innerHTML = `<div class="grab"></div><header><h3>${esc(title)}</h3><button class="iconbtn" data-close aria-label="Chiudi">${ic("close", 18)}</button></header><div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ""}`;
    document.body.append(scrim, sh);
    requestAnimationFrame(() => { scrim.classList.add("on"); sh.classList.add("on"); });
    const close = () => closeSheet(entry);
    scrim.addEventListener("click", close);
    sh.querySelector("[data-close]").addEventListener("click", close);
    const entry = { sh, scrim, close };
    sheets.push(entry);
    onMount?.(sh, close);
    return entry;
  }
  function closeSheet(entry) {
    const e = entry || sheets.at(-1); if (!e) return;
    const i = sheets.indexOf(e); if (i >= 0) sheets.splice(i, 1);
    e.sh.classList.remove("on"); e.scrim.classList.remove("on");
    setTimeout(() => { e.sh.remove(); e.scrim.remove(); }, 260);
  }
  const closeAll = () => [...sheets].forEach(closeSheet);

  // Conferma dentro la pagina (niente confirm() di sistema)
  function conferma(titolo, testo, etichetta, onOk, pericolo = true) {
    openSheet({
      title: titolo, body: `<p class="note" style="font-size:15px;color:var(--fg)">${esc(testo)}</p>`,
      footer: `<button class="btn ${pericolo ? "dng" : "pri"}" data-ok>${esc(etichetta)}</button><button class="btn" data-no>Annulla</button>`,
      onMount: (sh, close) => { sh.querySelector("[data-ok]").onclick = () => { close(); onOk(); }; sh.querySelector("[data-no]").onclick = close; },
    });
  }

  // ------------------------------ ROUTER -----------------------------
  let tab = "home", sett = null, storicoFiltro = { q: "", cat: "tutte", n: 80 };
  function go(t) { tab = t; sett = null; render(); window.scrollTo(0, 0); }

  function render() {
    document.documentElement.dataset.theme = L.tema === "chiaro" ? "light" : L.tema === "auto" ? "auto" : "dark";
    const app = $("#app");
    let title = "", body = "";
    if (sett !== null) { const r = renderImpostazioni(); title = r.title; body = r.body; }
    else if (tab === "home") { title = "Spiccio"; body = renderHome(); }
    else if (tab === "mese") { title = "Mese"; body = renderMese(); }
    else if (tab === "risparmi") { title = "Risparmi"; body = renderRisparmi(); }
    else if (tab === "storico") { title = "Storico"; body = renderStorico(); }
    else if (tab === "report") { title = "Report"; body = renderReport(); }
    const syncCls = !L.token ? "" : L.syncErr ? "bad" : syncing ? "busy" : "ok";
    const left = sett !== null || tab === "report"
      ? `<button class="iconbtn" data-act="back" aria-label="Indietro">${ic("back", 20)}</button>`
      : `<button class="iconbtn" data-act="settings" aria-label="Impostazioni">${ic("gear", 20)}${L.token ? `<span class="dot ${syncCls}"></span>` : ""}</button>`;
    app.innerHTML = `
      <header class="top">${left}<h1>${esc(title)}</h1>
        <button class="iconbtn" data-act="hide" aria-label="${L.nascondi ? "Mostra importi" : "Nascondi importi"}">${ic(L.nascondi ? "eyeOff" : "eye", 19)}</button>
      </header>
      <main class="view" id="view">${body}</main>
      <nav class="tabs" aria-label="Sezioni">
        ${tabBtn("home", "home", "Home")}${tabBtn("mese", "calendar", "Mese")}
        <button class="fab" data-act="spesa" aria-label="Registra una spesa">${ic("plus", 26)}</button>
        ${tabBtn("risparmi", "piggy", "Risparmi")}${tabBtn("storico", "list", "Storico")}
      </nav>`;
    afterRender();
  }
  function safeRender() {
    const a = document.activeElement;
    if (a && a.closest?.("#view") && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    render();
  }
  const tabBtn = (id, i, l) => `<button class="tab" data-act="tab" data-v="${id}" ${tab === id && sett === null ? 'aria-current="page"' : ""}>${ic(i, 22)}<span>${l}</span></button>`;
  function afterRender() {
    const q = $("#storico-q");
    if (q) q.addEventListener("input", () => { storicoFiltro.q = q.value; const pos = q.selectionStart; renderStoricoLista(); });
  }

  // =============================== HOME ===============================
  function renderHome() {
    const w = K.settimana();
    const todo = [];
    if (S.inbox.length) todo.push(`<button class="todo hot" data-act="inbox"><div class="row" style="padding:0;min-height:0"><span class="av blue">${ic("inbox")}</span></div><div class="tx"><div class="t1">${plural(S.inbox.length, "pagamento da sistemare", "pagamenti da sistemare")}</div><div class="t2">Arrivati dal Wallet: scegli la categoria</div></div>${ic("chevron", 18)}</button>`);
    if (K.paydayInSospeso()) todo.push(todoBtn("paga", "wallet", "Giorno di paga", "Prepara i bonifici verso il " + S.settings.contoDeposito, true));
    const conf = K.fisseVariabiliDaConfermare();
    if (conf.length) todo.push(todoBtn("fissa", "receipt", `Importo reale: ${conf.map(f => f.nome).join(", ")}`, `Addebito previsto il ${dm(conf[0].data)}`, false, conf[0].id));
    if (K.checkInSospeso()) todo.push(todoBtn("check", "chart", "Check di metà mese", "Aggiorna il valore dei tuoi risparmi"));
    if (K.recapDaMostrare()) todo.push(todoBtn("recap", "trophy", "Com'è andata la settimana", "Vedi il recap e l'avanzo da bonificare"));
    const cred = K.creditiAperti();
    const pf = K.prossimeFisse(7);
    const liv = K.faseAttiva(), blocc = K.faseBloccata();
    const streak = K.streak();
    const mensili = K.catMensili().map(c => K.statoCategoria(c.id));
    const liberi = S.categories.filter(c => c.periodo === "libero").map(c => K.statoCategoria(c.id)).filter(x => x.speso > 0);

    return `
      <section class="hero" aria-label="Paghetta della settimana">
        <div class="lbl">Ti restano questa settimana</div>
        <div class="big">${L.nascondi ? "•••" : esc(eurSplit(w.resto))}</div>
        <div class="sub">${M(w.oggi)} al giorno · ${plural(w.gg, "giorno", "giorni")} alla fine della settimana</div>
        <div class="pillrow">
          <span class="pill">${ic("flame", 14)} ${plural(streak, "settimana", "settimane")} di fila</span>
          <span class="pill">${ic("star", 14)} ${esc(liv.nome)}</span>
          ${K.bonusDisponibile() > 0.004 ? `<span class="pill">${ic("bolt", 14)} Extra liberi ${M(K.bonusDisponibile())}</span>` : ""}
        </div>
      </section>
      <div class="actions">
        ${actBtn("spesa", "plus", "Spesa")}${actBtn("entrata", "arrowIn", "Entrata")}${actBtn("rimborso", "refund", "Rimborso")}${actBtn("fondo", "shield", "Fondo")}
      </div>
      ${todo.join("")}
      <section class="card flush" aria-label="Paghetta">
        <h2>Paghetta · ${esc(S.settings.metodoPaghetta)}<span class="mut num">${M(w.speso)} / ${M(w.budget)}</span></h2>
        ${w.righe.map(rigaCat).join("")}
      </section>
      <section class="card flush" aria-label="Budget del mese">
        <h2>Budget del mese<span class="mut">${plural(K.daysLeft("mese"), "giorno", "giorni")}</span></h2>
        ${mensili.map(rigaCat).join("")}
        ${liberi.map(rigaCat).join("")}
      </section>
      <div class="grid2">
        ${tile("fondo", "shield", "Fondo emergenza", M0(K.fondoTot()), K.fondoTot() < S.settings.fondoSoglia ? `<span class="wrn">sotto soglia</span>` : `${Math.round(pct(K.fondoTot(), K.obiettivoFondo()))}% dell'obiettivo`)}
        ${tile("viaggi", "plane", "Viaggi", M0(K.saldoViaggi()), `+${M0(S.settings.viaggiMensile)} al mese`)}
        ${tile("annuali", "piggy", "Spese annuali", M0(K.salvadanaio()), prossimaAnnuale())}
        ${tile("livello", "star", liv.nome, M0(liv.fondo) + "/mese", blocc ? `${K.streak(blocc.uscite)}/${blocc.serieRichiesta} per il ${esc(blocc.nome)}` : "al fondo emergenza")}
      </div>
      ${pf.length ? `<section class="card flush"><h2>Escono nei prossimi 7 giorni<span class="mut num">${M(somma(pf, K.importoFissa))}</span></h2>
        ${pf.map(f => `<div class="row"><span class="av">${ic("calendar", 18)}</span><div class="tx"><div class="t1">${esc(f.nome)}</div><div class="t2">${dLong(f.data)}</div></div><div class="val">${M(K.importoFissa(f))}</div></div>`).join("")}</section>` : ""}
      ${cred.length ? `<section class="card flush"><h2>Ti devono ancora<span class="mut num">${M(somma(cred, c => c.importo - (c.rientrato || 0)))}</span></h2>
        ${cred.map(c => `<button class="row" data-act="rimborso" data-credito="${c.id}"><span class="av ok">${ic("users", 18)}</span><div class="tx"><div class="t1">${esc(c.chi || "Da dividere")}</div><div class="t2">${esc(c.nota || "")} · ${dShort(new Date(c.ts))}</div></div><div class="val">${M(c.importo - (c.rientrato || 0))}</div></button>`).join("")}</section>` : ""}
    `;
  }
  function eurSplit(v) { const s = eur(Math.max(0, v)); return s; }
  const actBtn = (act, i, l) => `<button class="act" data-act="${act}"><span class="c">${ic(i, 22)}</span>${l}</button>`;
  const todoBtn = (act, i, t1, t2, hot = false, id = "") => `<button class="todo ${hot ? "hot" : ""}" data-act="${act}" ${id ? `data-id="${id}"` : ""}><span class="row" style="padding:0;min-height:0;width:auto"><span class="av ${hot ? "blue" : "warn"}">${ic(i)}</span></span><div class="tx"><div class="t1">${esc(t1)}</div><div class="t2">${esc(t2)}</div></div>${ic("chevron", 18)}</button>`;
  const tile = (act, i, l, v, s) => `<button class="tile" data-act="${act}">${ic(i, 20)}<span class="l">${esc(l)}</span><span class="v">${v}</span><span class="s">${s}</span></button>`;
  function prossimaAnnuale() {
    const oggi = new Date(); let best = null;
    for (const x of K.annualiAttivi()) for (const m of x.mesi) for (const y of [oggi.getFullYear(), oggi.getFullYear() + 1]) {
      const d = new Date(y, m - 1, x.giorno || S.settings.giornoStipendio);
      if (d >= oggi && (!best || d < best.d)) best = { d, x };
    }
    return best ? `${esc(best.x.nome)} · ${dShort(best.d)}` : "nessuna in arrivo";
  }
  function rigaCat(st) {
    const c = st.c;
    if (st.periodo === "libero") return `<button class="row" data-act="cat" data-id="${c.id}"><span class="av">${catIcon(c)}</span><div class="tx"><div class="t1">${esc(c.nome)}</div><div class="t2">senza budget · questo mese</div></div><div class="val">${M(st.speso)}</div></button>`;
    const cls = barClass(st.speso, st.budget);
    const resto = st.resto;
    return `<button class="row" data-act="cat" data-id="${c.id}"><span class="av">${catIcon(c)}</span>
      <div class="tx"><div class="t1">${esc(c.nome)}</div>
        <div class="bar"><i class="${cls}" style="width:${pct(st.speso, st.budget)}%"></i></div>
        <div class="t2">${M(st.speso)} di ${M(st.budget)}${st.ridotto ? ` · ridotto di ${M(st.base - st.budget)}` : ""}</div></div>
      <div class="val ${resto < 0 ? "neg" : ""}">${resto < 0 ? "−" + M(-resto).replace("−", "") : M(resto)}<div class="t2">${resto < 0 ? "sforato" : "rimasti"}</div></div></button>`;
  }

  // =============================== MESE ===============================
  function renderMese() {
    const q = K.quadroMese();
    const fisse = K.fisseCiclo().sort((a, b) => a.data - b.data);
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const per = K.perCategoria(q.s, q.e);
    const cicli = K.ultimiCicli(6);
    const top = K.topEsercenti(q.s, q.e);
    const sig = K.statSigarette();
    const saldoAnn = K.salvadanaio();
    const mNow = K.monthStart(oggi).getMonth() + 1;
    const tra = x => Math.min(...x.mesi.map(k => ((((x.giorno ?? S.settings.giornoStipendio) >= S.settings.giornoStipendio ? k : (k + 10) % 12 + 1) - mNow + 12) % 12)));
    const att = K.faseAttiva();
    return `
      <section class="card">
        <h2>Ciclo ${dm(q.s)} – ${dm(new Date(q.e - 1))}<span class="mut">giorno ${q.ggPassati} di ${q.ggTot}</span></h2>
        ${q.sp ? `<div class="preview warn" style="margin-bottom:10px">Mese con budget modificati: ${esc(q.sp.nota || "")}</div>` : ""}
        <div class="kv"><span class="k">Stipendio ${S.stipendi[K.cicloKey()] ? "" : "(previsto)"}</span><span class="v">${M(q.stip)}</span></div>
        ${q.entrate.length ? `<div class="kv"><span class="k">Entrate extra</span><span class="v pos">+${M(somma(q.entrate))}</span></div>` : ""}
        <div class="kv"><span class="k">Spese fisse (${q.fisse ? fisse.length : 0})</span><span class="v">−${M(q.fisse)}</span></div>
        <div class="kv"><span class="k">Salvadanaio annuali${q.piano.saltato ? " · saltato" : ""}</span><span class="v">−${M(q.piano.rata)}</span></div>
        ${q.piano.scoperto > 0 ? `<div class="kv"><span class="k wrn">${esc(q.piano.vociOra.join(", "))} non coperta</span><span class="v wrn">−${M(q.piano.scoperto)}</span></div>` : ""}
        <div class="kv"><span class="k">Salvadanaio viaggi</span><span class="v">−${M(q.viaggi)}</span></div>
        <div class="kv"><span class="k">Fondo emergenza</span><span class="v">−${M(q.fondo.importo)}</span></div>
        <div class="kv tot"><span class="k">Per le spese variabili</span><span class="v ${q.disponibile >= q.budgetVar ? "pos" : "neg"}">${M(q.disponibile)}</span></div>
        <p class="note" style="margin:6px 0 0">Budget variabili ${M(q.budgetVar)} · margine ${M(q.disponibile - q.budgetVar)}</p>
      </section>
      <section class="card">
        <h2>Andamento del ciclo<span class="${q.esito >= 0 ? "pos" : "neg"}">${q.esito >= 0 ? "chiudi con +" + M(q.esito) : "in rosso di " + M(-q.esito)}</span></h2>
        ${chartCiclo(q)}
        <p class="note" style="margin:8px 0 0">Spese variabili finora ${M(q.speso)}. Al ritmo attuale arrivi a ${M(q.proiezione)} a fine ciclo.</p>
      </section>
      <section class="card flush"><h2>Spese fisse<span class="mut num">${M(q.fisse)}</span></h2>
        ${fisse.map(f => {
          const passata = f.data < oggi, gg = Math.round((f.data - oggi) / 86400000), rr = K.rateRimanenti(f);
          let stato = passata ? "addebitata" : gg === 0 ? "oggi" : `tra ${plural(gg, "giorno", "giorni")}`;
          if (f.variabile) stato += f.reale !== undefined ? " · importo reale" : " · stimata, tocca per l'importo reale";
          if (rr !== null) stato += " · " + (rr === 0 ? "ultima rata" : `ancora ${rr} rate`);
          return `<button class="row" data-act="fissa" data-id="${f.id}"><span class="av ${passata ? "" : gg <= 3 ? "warn" : "blue"}">${passata ? ic("check", 18) : ic("calendar", 18)}</span><div class="tx"><div class="t1">${esc(f.nome)}</div><div class="t2">${dm(f.data)} · ${stato}</div></div><div class="val ${passata ? "mut" : ""}">${M(K.importoFissa(f))}</div></button>`;
        }).join("")}
      </section>
      <section class="card flush"><h2>Spese annuali<span class="mut num">salvadanaio ${M(saldoAnn)}</span></h2>
        ${K.annualiAttivi().slice().sort((a, b) => tra(a) - tra(b)).map(x => {
          const n = tra(x), ok = saldoAnn >= x.importo;
          return `<button class="row" data-act="annuali"><span class="av ${ok ? "ok" : "warn"}">${ic("piggy", 18)}</span><div class="tx"><div class="t1">${esc(x.nome)}${x.mesi.length > 1 ? ` × ${x.mesi.length}` : ""}</div><div class="t2">${x.mesi.map(k => `${x.giorno || ""} ${MESI[k - 1]}`.trim()).join(" e ")} · ${n === 0 ? "in questo ciclo" : "tra " + plural(n, "mese", "mesi")}</div></div><div class="val">${M(x.importo)}<div class="t2 ${ok ? "pos" : "wrn"}">${ok ? "coperto" : "mancano " + M(x.importo - saldoAnn)}</div></div></button>`;
        }).join("")}
        <div class="row" style="cursor:default"><span class="av blue">${ic("info", 18)}</span><div class="tx"><div class="t2 wrap">${q.piano.saltato ? `Versamento saltato: dal prossimo mese ${M(K.rataSeSalti())}` : q.piano.daVersare > 0 ? `Da versare in questo ciclo: ${M(q.piano.daVersare)}` : "Versamento del ciclo fatto"}</div></div></div>
      </section>
      <section class="card flush"><h2>Livelli del fondo</h2>
        ${S.livelli.map(f => {
          const [y, mm] = f.da.split("-"), on = att === f, lock = f.serieRichiesta && !S.fasiSbloccate[f.da], fut = !on && !lock && f.da > K.meseKey(), pass = !on && !lock && !fut;
          const prog = lock ? `${K.streak(f.uscite)}/${f.serieRichiesta} settimane sotto ${M(f.uscite)}` : "";
          return `<div class="row" style="cursor:default"><span class="av ${on ? "blue" : pass ? "ok" : ""}">${ic(lock ? "lock" : on ? "star" : fut ? "calendar" : "check", 18)}</span><div class="tx"><div class="t1">${esc(f.nome)} ${on ? '<span class="badge blue">attivo</span>' : fut ? '<span class="badge">in arrivo</span>' : pass ? '<span class="badge ok">superato</span>' : ""}</div><div class="t2 wrap">Dal ${S.settings.giornoStipendio} ${MESI[+mm - 1]} ${y}: ${M(f.fondo)}/mese al fondo, aperitivi ${M(f.uscite)}/sett.${f.nota ? " " + esc(f.nota) : ""}${prog ? " · " + prog : ""}</div>${lock ? `<div class="bar"><i style="width:${pct(K.streak(f.uscite), f.serieRichiesta)}%"></i></div>` : ""}</div></div>`;
        }).join("")}
      </section>
      <h3 class="sec-t">Statistiche</h3>
      <section class="card"><h2>Dove vanno i soldi in questo ciclo<span class="mut num">${M(somma(per, x => x.tot))}</span></h2>
        ${per.length ? per.map(x => `<div class="hbar"><span class="n">${catIcon(x.c)}<span>${esc(x.c.nome)}</span></span><b class="num">${M(x.tot)}</b><div class="bar"><i style="width:${pct(x.tot, per[0].tot)}%"></i></div></div>`).join("") : `<div class="empty">Ancora nessuna spesa in questo ciclo.</div>`}
      </section>
      <section class="card"><h2>Ultimi 6 cicli<span class="mut">spese variabili</span></h2>${chartCicli(cicli)}</section>
      ${top.length ? `<section class="card flush"><h2>Dove spendi di più</h2>${top.map(t => `<div class="row" style="cursor:default"><span class="av">${ic("tag", 18)}</span><div class="tx"><div class="t1">${esc(t.nome)}</div><div class="t2">${plural(t.n, "volta", "volte")}</div></div><div class="val">${M(t.tot)}</div></div>`).join("")}</section>` : ""}
      ${sig.tot30 > 0 ? `<section class="card"><h2>Sigarette</h2><div class="kv"><span class="k">Ultimi 30 giorni</span><span class="v">${M(sig.tot30)}</span></div><div class="kv"><span class="k">A questo ritmo in un anno</span><span class="v wrn">${M0(sig.anno)}</span></div><div class="kv"><span class="k">Dimezzando risparmieresti</span><span class="v pos">${M0(sig.metà)} l'anno</span></div></section>` : ""}
      <section class="card flush"><h2>Traguardi</h2>${K.badges().map(b => `<div class="row" style="cursor:default"><span class="av ${b.ok ? "ok" : ""}">${ic(b.ok ? "trophy" : "target", 18)}</span><div class="tx"><div class="t1">${esc(b.titolo)}</div><div class="t2">${esc(b.sotto)}</div></div></div>`).join("")}</section>
      <button class="btn" data-act="tab" data-v="report">${ic("print", 18)} Report del mese</button>
    `;
  }

  function chartCiclo(q) {
    const { pts, gg } = K.giornalieroCiclo();
    const W = 340, H = 150, pl = 6, pr = 6, pt = 10, pb = 20;
    const maxY = Math.max(q.disponibile, q.proiezione, ...pts.map(p => p.cum), 1) * 1.08;
    const x = i => pl + (W - pl - pr) * (i / Math.max(1, gg - 1));
    const y = v => pt + (H - pt - pb) * (1 - v / maxY);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.cum).toFixed(1)}`).join("");
    const area = pts.length ? `${line}L${x(pts.at(-1).i).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z` : "";
    const last = pts.at(-1);
    const proj = last ? `M${x(last.i)},${y(last.cum)}L${x(gg - 1)},${y(q.proiezione)}` : "";
    const lim = y(Math.max(0, q.disponibile));
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Spese cumulate del ciclo rispetto al disponibile">
      <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>
      <line x1="${pl}" x2="${W - pr}" y1="${lim}" y2="${lim}" stroke="var(--ok)" stroke-dasharray="4 4" stroke-width="1.3"/>
      <text x="${W - pr}" y="${lim - 4}" text-anchor="end">disponibile ${L.nascondi ? "" : eur0(q.disponibile)}</text>
      ${area ? `<path d="${area}" fill="url(#ga)"/>` : ""}
      ${line ? `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>` : ""}
      ${proj ? `<path d="${proj}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="3 4" opacity=".7"/>` : ""}
      ${last ? `<circle cx="${x(last.i)}" cy="${y(last.cum)}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>` : ""}
      <text x="${pl}" y="${H - 4}">${dm(q.s)}</text><text x="${W - pr}" y="${H - 4}" text-anchor="end">${dm(new Date(q.e - 1))}</text>
    </svg>`;
  }
  function chartCicli(cicli) {
    const W = 340, H = 140, pb = 22, pt = 18;
    const max = Math.max(...cicli.map(c => c.tot), 1);
    const bw = (W - 10) / cicli.length;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Spese variabili degli ultimi 6 cicli">
      ${cicli.map((c, i) => {
        const h = (H - pb - pt) * c.tot / max, xx = 5 + i * bw + bw * .18, w = bw * .64, yy = H - pb - h, cur = i === cicli.length - 1;
        return `<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="5" fill="${cur ? "var(--accent)" : "var(--card2)"}"/>
          <text x="${(xx + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${MESI[c.s.getMonth()].slice(0, 3)}</text>
          ${c.tot > 0 && !L.nascondi ? `<text x="${(xx + w / 2).toFixed(1)}" y="${(yy - 4).toFixed(1)}" text-anchor="middle">${Math.round(c.tot)}</text>` : ""}`;
      }).join("")}
    </svg>`;
  }

  // ============================= RISPARMI =============================
  function renderRisparmi() {
    const p = K.patrimonio();
    const st = K.storicoCheck(), ult = st.at(-1), prec = st.at(-2);
    const tp = prec ? K.totaleDaParte(prec) : null, tu = ult ? K.totaleDaParte(ult) : null;
    const delta = (v, pv) => pv === undefined || pv === null ? "" : `<span class="${v - pv >= 0 ? "pos" : "neg"}">${v - pv >= 0 ? "▲ +" : "▼ "}${M(v - pv)}</span>`;
    const movFondo = S.fondo.slice(-6).reverse();
    return `
      <section class="hero" aria-label="Patrimonio">
        <div class="lbl">Patrimonio netto</div>
        <div class="big">${M0(p.netto)}</div>
        <div class="sub">Da parte ${M0(p.totale)}${p.totDebiti > 0 ? ` · debiti ${M0(p.totDebiti)}` : ""}</div>
        <div class="pillrow"><span class="pill">${ic("check", 14)} Disponibile ${M0(p.disponibile)}</span><span class="pill">${ic("lock", 14)} Vincolato ${M0(p.vincolato)}</span></div>
      </section>
      ${K.checkInSospeso() ? todoBtn("check", "chart", "Check di metà mese", "È il momento di aggiornare i valori", true) : ""}
      <section class="card flush"><h2>I tuoi conti${ult ? `<span class="mut">check di ${MESI[+ult.mese.slice(5) - 1]}</span>` : ""}</h2>
        ${S.checkVoci.map(v => {
          const val = p.valori[v.id], pv = tp?.valori[v.id];
          return `<button class="row" data-act="check"><span class="av ${v.liquido ? "blue" : ""}">${ic(v.liquido ? "wallet" : "lock", 18)}</span><div class="tx"><div class="t1">${esc(v.nome)}</div><div class="t2">${v.liquido ? "liquido" : "vincolato"} ${tu ? delta(tu.valori[v.id], pv) : ""}</div></div><div class="val">${M(val)}</div></button>`;
        }).join("")}
      </section>
      <section class="card flush"><h2>Salvadanai · ${esc(S.settings.contoDeposito)}</h2>
        <button class="row" data-act="fondo"><span class="av ok">${ic("shield", 18)}</span><div class="tx"><div class="t1">Fondo emergenza</div><div class="bar"><i class="${p.fondo < S.settings.fondoSoglia ? "warn" : "ok"}" style="width:${pct(p.fondo, K.obiettivoFondo())}%"></i></div><div class="t2">obiettivo ${M0(K.obiettivoFondo())} (${S.settings.fondoObiettivoMesi} mesi di spese) · soglia ${M0(S.settings.fondoSoglia)}</div></div><div class="val">${M(p.fondo)}</div></button>
        <button class="row" data-act="annuali"><span class="av">${ic("piggy", 18)}</span><div class="tx"><div class="t1">Spese annuali</div><div class="t2">${esc(S.annualiDef.map(a => a.nome.split(" (")[0]).join(", "))}</div></div><div class="val">${M(p.annuali)}</div></button>
        <button class="row" data-act="viaggi"><span class="av blue">${ic("plane", 18)}</span><div class="tx"><div class="t1">Viaggi</div><div class="t2">+${M(S.settings.viaggiMensile)} ogni giorno di paga</div></div><div class="val ${K.saldoViaggi() < 0 ? "neg" : ""}">${M(K.saldoViaggi())}</div></button>
      </section>
      ${p.debiti.length ? `<section class="card flush"><h2>Debiti residui<span class="mut num">${M(p.totDebiti)}</span></h2>${p.debiti.map(d => `<div class="row" style="cursor:default"><span class="av bad">${ic("card", 18)}</span><div class="tx"><div class="t1">${esc(d.nome)}</div><div class="t2">${d.auto ? "calcolato dalle rate" : "inserito da te"}</div></div><div class="val">${M(d.residuo)}</div></div>`).join("")}</section>` : ""}
      ${st.length > 1 ? `<section class="card"><h2>Andamento dei check</h2>${chartCheck(st)}</section>` : ""}
      ${movFondo.length ? `<section class="card flush"><h2>Ultimi movimenti del fondo</h2>${movFondo.map(m => `<div class="row" style="cursor:default"><span class="av ${m.importo >= 0 ? "ok" : "bad"}">${ic(m.importo >= 0 ? "arrowIn" : "upload", 18)}</span><div class="tx"><div class="t1">${esc(m.nota || "Movimento")}</div><div class="t2">${dShort(new Date(m.ts))}</div></div><div class="val ${m.importo >= 0 ? "pos" : "neg"}">${m.importo >= 0 ? "+" : ""}${M(m.importo)}</div></div>`).join("")}</section>` : ""}
      <button class="btn" data-act="check">${ic("pencil", 18)} Aggiorna i valori dei conti</button>
    `;
  }
  function chartCheck(st) {
    const pts = st.slice(-12).map(c => ({ c, t: K.totaleDaParte(c).totale }));
    const W = 340, H = 140, pl = 6, pr = 6, pt = 14, pb = 20;
    const min = Math.min(...pts.map(p => p.t)) * .98, max = Math.max(...pts.map(p => p.t)) * 1.01;
    const x = i => pl + (W - pl - pr) * (pts.length === 1 ? .5 : i / (pts.length - 1));
    const y = v => pt + (H - pt - pb) * (1 - (v - min) / Math.max(1, max - min));
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.t).toFixed(1)}`).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Totale da parte nei check">
      <path d="${d}" fill="none" stroke="var(--ok)" stroke-width="2.4" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.t)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="var(--ok)"/>`).join("")}
      <text x="${pl}" y="${H - 4}">${MESI[+pts[0].c.mese.slice(5) - 1].slice(0, 3)} ${pts[0].c.mese.slice(2, 4)}</text>
      <text x="${W - pr}" y="${H - 4}" text-anchor="end">${MESI[+pts.at(-1).c.mese.slice(5) - 1].slice(0, 3)} ${pts.at(-1).c.mese.slice(2, 4)}</text>
      ${L.nascondi ? "" : `<text x="${W - pr}" y="${Math.max(10, y(pts.at(-1).t) - 8)}" text-anchor="end">${eur0(pts.at(-1).t)}</text>`}
    </svg>`;
  }

  // ============================== STORICO =============================
  function vociStorico() {
    const sp = S.spese.map(x => ({ k: "spesa", x, ts: x.ts }));
    const en = S.entrate.map(x => ({ k: "entrata", x, ts: x.ts }));
    return [...sp, ...en].sort((a, b) => a.ts < b.ts ? 1 : -1);
  }
  function renderStorico() {
    const cats = S.categories.filter(c => S.spese.some(x => x.cat === c.id));
    return `
      <label class="search">${ic("search", 18)}<input id="storico-q" type="search" placeholder="Cerca esercente, nota, importo" value="${esc(storicoFiltro.q)}" aria-label="Cerca"></label>
      <div class="chips" role="group" aria-label="Filtra per categoria">
        <button class="chip" data-act="sf" data-v="tutte" aria-pressed="${storicoFiltro.cat === "tutte"}">Tutte</button>
        <button class="chip" data-act="sf" data-v="entrate" aria-pressed="${storicoFiltro.cat === "entrate"}">Entrate</button>
        ${cats.map(c => `<button class="chip" data-act="sf" data-v="${c.id}" aria-pressed="${storicoFiltro.cat === c.id}">${ic(c.icon, 15)}${esc(c.nome)}</button>`).join("")}
      </div>
      <div id="storico-lista">${storicoLista()}</div>
      <div class="btnrow"><button class="btn sm" data-act="csv">${ic("download", 16)} Esporta CSV</button></div>`;
  }
  function storicoLista() {
    const q = storicoFiltro.q.trim().toLowerCase();
    let v = vociStorico();
    if (storicoFiltro.cat === "entrate") v = v.filter(e => e.k === "entrata");
    else if (storicoFiltro.cat !== "tutte") v = v.filter(e => e.k === "spesa" && e.x.cat === storicoFiltro.cat);
    if (q) v = v.filter(e => [e.x.nota, e.x.fonte, e.x.sub, e.x.motivo, K.catNome(e.x.cat), num(Math.abs(e.x.importo))].join(" ").toLowerCase().includes(q));
    if (!v.length) return `<div class="empty">${S.spese.length ? "Nessuna voce trovata." : "Qui troverai tutte le spese che registri."}</div>`;
    const tot = v.length; v = v.slice(0, storicoFiltro.n);
    let out = "", day = "";
    for (const e of v) {
      const d = new Date(e.ts), k = dk(d);
      if (k !== day) {
        day = k;
        const totDay = somma(v.filter(z => dk(new Date(z.ts)) === k && z.k === "spesa"), z => z.x.importo);
        out += `<div class="day"><span>${dLong(d)}</span><span class="num">${totDay ? M(totDay) : ""}</span></div><div class="card flush">`;
      }
      out += rigaStorico(e);
      const next = v[v.indexOf(e) + 1];
      if (!next || dk(new Date(next.ts)) !== k) out += `</div>`;
    }
    if (tot > storicoFiltro.n) out += `<button class="btn" data-act="more">Mostra altre ${Math.min(80, tot - storicoFiltro.n)}</button>`;
    return out;
  }
  function renderStoricoLista() { const el = $("#storico-lista"); if (el) el.innerHTML = storicoLista(); }
  function rigaStorico(e) {
    const x = e.x, ora = new Date(x.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    if (e.k === "entrata") return `<button class="row" data-act="entrata-edit" data-id="${x.id}"><span class="av ok">${ic("arrowIn", 18)}</span><div class="tx"><div class="t1">${esc(x.fonte || "Entrata extra")}</div><div class="t2">Entrata · ${ora}</div></div><div class="val pos">+${M(x.importo)}</div></button>`;
    const c = K.cat(x.cat), rimb = x.importo < 0;
    const meta = [c?.nome, x.sub, x.metodo, x.persone > 1 ? `diviso per ${x.persone}` : "", ora].filter(Boolean).join(" · ");
    return `<button class="row" data-act="edit" data-id="${x.id}"><span class="av ${rimb ? "ok" : ""}">${rimb ? ic("refund", 18) : catIcon(c)}</span><div class="tx"><div class="t1">${esc(x.nota || c?.nome || "Spesa")}</div><div class="t2">${esc(meta)}${x.motivo ? " · fuori budget" : ""}</div></div><div class="val ${rimb ? "pos" : ""}">${rimb ? "+" + M(-x.importo) : "−" + M(x.importo).replace("−", "")}</div></button>`;
  }

  // ============================== REPORT ==============================
  function renderReport() {
    const oggi = new Date();
    // ciclo appena chiuso se siamo nei primi 5 giorni del ciclo, altrimenti quello in corso
    let d = new Date(oggi); const [s0] = K.periodRange("mese", d);
    if ((oggi - s0) / 86400000 < 5) { d = new Date(s0); d.setDate(d.getDate() - 1); }
    const q = K.quadroMese(d); const per = K.perCategoria(q.s, q.e); const top = K.topEsercenti(q.s, q.e, 8);
    const p = K.patrimonio();
    return `<div class="noprint btnrow"><button class="btn pri" data-act="print">${ic("print", 18)} Salva come PDF o stampa</button></div>
      <article class="report">
        <h1>Spiccio · report del ciclo</h1>
        <div class="m">${dLong(q.s)} – ${dLong(new Date(q.e - 1))} · generato il ${dLong(oggi)}</div>
        <h2>Conti del mese</h2>
        <table>
          <tr><td>Stipendio</td><td>${eur(q.stip)}</td></tr>
          ${q.entrate.length ? `<tr><td>Entrate extra</td><td>+${eur(somma(q.entrate))}</td></tr>` : ""}
          <tr><td>Spese fisse</td><td>−${eur(q.fisse)}</td></tr>
          <tr><td>Salvadanaio annuali</td><td>−${eur(q.piano.rata)}</td></tr>
          <tr><td>Salvadanaio viaggi</td><td>−${eur(q.viaggi)}</td></tr>
          <tr><td>Fondo emergenza</td><td>−${eur(q.fondo.importo)}</td></tr>
          <tr><td><b>Disponibile per le variabili</b></td><td><b>${eur(q.disponibile)}</b></td></tr>
          <tr><td>Spese variabili</td><td>${eur(q.speso)}</td></tr>
          <tr><td><b>${q.esito >= 0 ? "Margine" : "Sforamento"} previsto</b></td><td><b>${eur(q.esito)}</b></td></tr>
        </table>
        <h2>Per categoria</h2>
        <table>${per.map(x => { const b = x.c.periodo === "settimana" ? K.budgetEff(x.c.id, d) * K.giorniCiclo(d) / 7 : x.c.periodo === "mese" ? K.budgetEff(x.c.id, d) : null; return `<tr><td>${esc(x.c.nome)}${b !== null ? ` <span class="m">(budget ${eur0(b)})</span>` : ""}</td><td>${eur(x.tot)}</td></tr>`; }).join("") || `<tr><td class="m">Nessuna spesa</td><td></td></tr>`}</table>
        <h2>Dove hai speso di più</h2>
        <table>${top.map(t => `<tr><td>${esc(t.nome)} <span class="m">× ${t.n}</span></td><td>${eur(t.tot)}</td></tr>`).join("")}</table>
        <h2>Risparmi</h2>
        <table>
          <tr><td>Fondo emergenza</td><td>${eur(p.fondo)}</td></tr>
          <tr><td>Salvadanaio annuali</td><td>${eur(p.annuali)}</td></tr>
          <tr><td>Salvadanaio viaggi</td><td>${eur(p.viaggi)}</td></tr>
          ${S.checkVoci.map(v => `<tr><td>${esc(v.nome)}</td><td>${eur(p.valori[v.id])}</td></tr>`).join("")}
          <tr><td><b>Patrimonio netto</b></td><td><b>${eur(p.netto)}</b></td></tr>
        </table>
      </article>`;
  }

  // =========================== FORM: SPESA ============================
  function sheetSpesa(pre = {}) {
    const edit = pre.editId ? S.spese.find(x => x.id === pre.editId) : null;
    const rimb = edit ? edit.importo < 0 : !!pre.rimborso;
    const f = {
      importo: edit ? Math.abs(edit.importo) : (pre.importo || ""),
      nota: edit ? (edit.nota || "").replace(/^Rimborso: /, "") : (pre.nota || ""),
      cat: edit?.cat || pre.cat || null, sub: edit?.sub || pre.sub || null,
      metodo: edit?.metodo || pre.metodo || null,
      ts: edit ? new Date(edit.ts) : (pre.ts ? new Date(pre.ts) : new Date()),
      persone: edit?.persone || 1, chi: "", motivo: edit?.motivo || "", usaBonus: !!edit?.bonus,
      manuale: !!(edit || pre.cat), credito: pre.credito || "",
    };
    if (!f.cat && f.nota) { const s = K.suggerisci(f.nota); if (s) { f.cat = s.cat; f.sub = s.sub; f.metodo = f.metodo || s.metodo; f.sug = s.cat; } }
    const metodi = S.settings.metodi;
    const crediti = K.creditiAperti();
    const title = edit ? (rimb ? "Modifica rimborso" : "Modifica spesa") : rimb ? "Rimborso ricevuto" : pre.inboxId ? "Pagamento dal Wallet" : "Nuova spesa";
    const body = `
      <div class="amount"><input id="f-imp" inputmode="decimal" placeholder="0" value="${f.importo !== "" ? esc(num(f.importo)) : ""}" aria-label="Importo in euro" autocomplete="off"><span class="eu">€</span></div>
      ${!edit && !rimb ? `<div id="f-rapide"></div>` : ""}
      <div class="field"><label for="f-nota">${rimb ? "Da chi / per cosa" : "Dove / cosa"}</label><input id="f-nota" class="inp" value="${esc(f.nota)}" placeholder="${rimb ? "es. Sonia, cena di sabato" : "es. Esselunga, Bar Lambrate"}" autocomplete="off"></div>
      ${rimb && crediti.length ? `<div class="field"><label for="f-cred">Chiude un credito?</label><select id="f-cred" class="sel"><option value="">No</option>${crediti.map(c => `<option value="${c.id}" ${f.credito === c.id ? "selected" : ""}>${esc(c.chi || "Da dividere")} · ${esc(c.nota || "")} · ${eur(c.importo - (c.rientrato || 0))}</option>`).join("")}</select></div>` : ""}
      <div class="field"><span class="lab">${rimb ? "A quale spesa si riferisce" : "Categoria"}</span><div class="catgrid" id="f-cats"></div></div>
      <div class="field" id="f-subwrap"><span class="lab">Sottocategoria</span><div class="chips wrap" id="f-subs"></div></div>
      ${!rimb ? `<div class="field"><span class="lab">Pagato con</span><div class="chips wrap" id="f-met">${metodi.map(m => `<button type="button" class="chip" data-m="${esc(m)}">${esc(m)}</button>`).join("")}</div></div>` : ""}
      <div class="split">
        <div class="field"><label for="f-ts">Quando</label><input id="f-ts" class="inp" type="datetime-local" value="${toLocalInput(f.ts)}"></div>
        ${!rimb ? `<div class="field"><span class="lab">Pagato per</span><div class="stepper"><button type="button" data-p="-1" aria-label="Meno persone">−</button><b id="f-pers">${f.persone}</b><button type="button" data-p="1" aria-label="Più persone">+</button></div></div>` : ""}
      </div>
      ${!rimb ? `<div class="field" id="f-chiwrap" hidden><label for="f-chi">Con chi? (ti devono la loro parte)</label><input id="f-chi" class="inp" placeholder="es. Sonia" value=""></div>` : ""}
      <div id="f-prev"></div>
      <div class="field" id="f-motwrap" hidden><label for="f-mot">Fuori budget: scrivi perché la fai lo stesso</label><input id="f-mot" class="inp" value="${esc(f.motivo)}" placeholder="Motivo (obbligatorio)"></div>
      <label class="toggle" id="f-bonwrap" hidden><span id="f-bontx"></span><input type="checkbox" id="f-bon" ${f.usaBonus ? "checked" : ""}></label>`;
    const footer = `<button class="btn pri" id="f-save">${edit ? "Salva modifiche" : rimb ? "Registra rimborso" : "Registra"}</button>
      ${edit ? `<button class="btn dng" id="f-del">${ic("trash", 18)} Elimina</button>` : pre.inboxId ? `<button class="btn" id="f-ign">Non è una spesa personale, ignora</button>` : ""}`;
    openSheet({
      title, body, footer, onMount: (sh, close) => {
        const imp = $("#f-imp", sh), nota = $("#f-nota", sh);
        const cats = rimb ? S.categories : S.categories;
        function drawCats() {
          $("#f-cats", sh).innerHTML = cats.map(c => `<button type="button" class="catbtn ${f.sug === c.id ? "sug" : ""}" data-c="${c.id}" aria-pressed="${f.cat === c.id}">${catIcon(c)}<span>${esc(c.nome.split(" ")[0])}</span></button>`).join("");
          const c = K.cat(f.cat);
          const subs = c?.sub || [];
          $("#f-subwrap", sh).hidden = !subs.length;
          $("#f-subs", sh).innerHTML = subs.map(s => `<button type="button" class="chip" data-s="${esc(s)}" aria-pressed="${f.sub === s}">${esc(s)}</button>`).join("");
          if (!rimb) {
            if (!f.metodo && c) f.metodo = c.periodo === "settimana" ? S.settings.metodoPaghetta : metodi[0];
            $$("#f-met .chip", sh).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === f.metodo)));
          }
        }
        function drawRapide() {
          const el = $("#f-rapide", sh); if (!el) return;
          const r = K.rapide();
          el.innerHTML = r.length ? `<div class="chips">${r.map((x, i) => `<button type="button" class="chip" data-r="${i}">${ic(K.cat(x.cat)?.icon, 14)}${esc(x.nota)} · ${eur(x.importo)}</button>`).join("")}</div>` : "";
          el.onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; const x = r[+b.dataset.r]; f.importo = x.importo; imp.value = num(x.importo); f.nota = x.nota; nota.value = x.nota; f.cat = x.cat; f.sub = x.sub; f.metodo = x.metodo; f.manuale = true; drawCats(); drawPrev(); vibra(); };
        }
        function calc() {
          const x = parseAmount(imp.value); const c = K.cat(f.cat);
          if (!(x > 0) || !c) return null;
          const ts = new Date($("#f-ts", sh).value || Date.now());
          if (c.periodo === "fondo") {
            let saldo = K.saldoViaggi(); if (edit && edit.cat === "viaggi") saldo += K.netto(edit);
            return { c, x, tipo: "fondo", saldo, dopo: saldo - x };
          }
          const per = c.periodo === "libero" ? "mese" : c.periodo;
          const [s, e] = K.periodRange(per, ts);
          let speso = K.spentCat(c.id, s, e);
          if (edit && edit.cat === c.id && inRange(edit, s, e)) speso -= K.netto(edit);
          if (c.periodo === "libero") return { c, x, tipo: "libero", speso };
          const budget = K.budgetEff(c.id, ts), gg = K.daysLeft(per, ts);
          return { c, x, tipo: "budget", speso, budget, gg, dopo: budget - speso - x, ridotto: budget < K.budgetBase(c.id, ts) ? K.budgetBase(c.id, ts) - budget : 0 };
        }
        function drawPrev() {
          const r = calc(); const el = $("#f-prev", sh);
          const motw = $("#f-motwrap", sh), bonw = $("#f-bonwrap", sh);
          motw.hidden = true; bonw.hidden = true;
          if (!r || rimb) { el.innerHTML = rimb && r ? `<div class="preview">Tornano disponibili ${eur(r.x)} in ${esc(r.c.nome)}. Non sono soldi in più: coprono una spesa già fatta.</div>` : ""; return; }
          const pers = f.persone;
          let html = "", cls = "";
          if (r.tipo === "fondo") {
            html = `Salvadanaio viaggi: <b>${eur(r.saldo)}</b> → dopo questa <b>${eur(r.dopo)}</b>`;
            if (r.dopo < 0) { cls = "warn"; html += `<br>Vai sotto di ${eur(-r.dopo)}: i prossimi versamenti dovranno coprire il buco.`; }
          } else if (r.tipo === "libero") {
            html = `${esc(r.c.nome)} non ha un budget. Questo mese finora: <b>${eur(r.speso)}</b>`;
          } else {
            let dopo = r.dopo;
            const bd = K.bonusDisponibile() + (edit?.bonus || 0);
            html = `${esc(r.c.nome)} (${r.c.periodo}): spesi <b>${eur(r.speso)}</b> su <b>${eur(r.budget)}</b>`;
            if (r.ridotto) html += `<br><span class="mut">Budget ridotto di ${eur(r.ridotto)} per lo sforamento precedente</span>`;
            if (dopo < 0 && bd > 0.004) {
              const copre = Math.min(-dopo, bd);
              bonw.hidden = false; $("#f-bontx", sh).textContent = `Copri ${eur(copre)} con le entrate extra libere (hai ${eur(bd)})`;
              if ($("#f-bon", sh).checked) dopo += copre;
            }
            if (dopo >= -0.005) {
              html += `<br>Dopo questa: <b>${eur(dopo)}</b> per ${plural(r.gg, "giorno", "giorni")} (${eur(Math.max(0, dopo) / r.gg)} al giorno)`;
              if (r.budget > 0 && dopo / r.budget <= S.settings.budgetQuasiFinito) cls = "warn";
            } else {
              cls = "bad"; html += `<br>⛔️ Sfori di <b>${eur(-dopo)}</b>.${S.settings.riportaSforamento ? ` Verrà tolto dal budget ${r.c.periodo === "settimana" ? "della prossima settimana" : "del prossimo mese"}.` : ""}`;
              motw.hidden = false;
            }
          }
          if (pers > 1) html += `<br>${ic("users", 14)} La tua parte è ${eur(r.x / pers)}: ${eur(r.x - r.x / pers)} diventano un credito da farti restituire.`;
          const arrivo = somma(K.prossimeFisse(7), K.importoFissa);
          if (arrivo > 0 && !edit) html += `<br><span class="mut">Nei prossimi 7 giorni escono ${eur(arrivo)} di spese fisse</span>`;
          el.innerHTML = `<div class="preview ${cls}">${html}</div>`;
        }
        function sugger() {
          if (f.manuale) return;
          const s = K.suggerisci(nota.value);
          f.sug = s?.cat || null;
          if (s) { f.cat = s.cat; f.sub = s.sub; if (s.metodo) f.metodo = s.metodo; }
          drawCats(); drawPrev();
        }
        drawRapide(); drawCats(); drawPrev();
        imp.addEventListener("input", drawPrev);
        nota.addEventListener("input", sugger);
        $("#f-ts", sh).addEventListener("change", drawPrev);
        $("#f-bon", sh)?.addEventListener("change", drawPrev);
        $("#f-cred", sh)?.addEventListener("change", e => { f.credito = e.target.value; const c = S.crediti.find(x => x.id === f.credito); if (c) { const ori = S.spese.find(s => s.id === c.spesa); if (ori) { f.cat = ori.cat; f.sub = ori.sub || null; f.manuale = true; } if (!parseAmount(imp.value)) imp.value = num(c.importo - (c.rientrato || 0)); if (!nota.value) nota.value = c.chi || ""; drawCats(); drawPrev(); } });
        sh.addEventListener("click", e => {
          const c = e.target.closest("[data-c]"); if (c) { f.cat = c.dataset.c; f.sub = null; f.manuale = true; drawCats(); drawPrev(); vibra(8); return; }
          const s = e.target.closest("[data-s]"); if (s) { f.sub = f.sub === s.dataset.s ? null : s.dataset.s; drawCats(); return; }
          const m = e.target.closest("[data-m]"); if (m) { f.metodo = m.dataset.m; drawCats(); return; }
          const p = e.target.closest("[data-p]"); if (p) { f.persone = Math.max(1, Math.min(20, f.persone + +p.dataset.p)); $("#f-pers", sh).textContent = f.persone; $("#f-chiwrap", sh).hidden = f.persone < 2; drawPrev(); return; }
        });
        if (!edit && !pre.importo) setTimeout(() => imp.focus(), 300);
        $("#f-save", sh).onclick = () => {
          const x = parseAmount(imp.value);
          if (!(x > 0)) { imp.classList.add("err"); toast("Importo mancante", "Scrivi un numero maggiore di zero.", "bad"); return; }
          if (!f.cat) { toast("Scegli una categoria", "", "bad"); return; }
          const r = calc(); const ts = new Date($("#f-ts", sh).value || Date.now());
          let bonus = 0;
          if (!rimb && r?.tipo === "budget" && r.dopo < 0) {
            const bd = K.bonusDisponibile() + (edit?.bonus || 0);
            if ($("#f-bon", sh).checked && bd > 0) bonus = r2(Math.min(-r.dopo, bd));
            const mot = $("#f-mot", sh).value.trim();
            if (r.dopo + bonus < -0.005 && !mot) { $("#f-mot", sh).classList.add("err"); $("#f-mot", sh).focus(); toast("Serve un motivo", "Sei fuori budget: scrivi perché la fai lo stesso.", "warn"); return; }
            f.motivo = mot;
          } else f.motivo = "";
          const notaV = nota.value.trim();
          commit(S => {
            const o = (edit && S.spese.find(z => z.id === edit.id)) || { id: edit?.id || uid("sp") };
            const nuovo = !S.spese.includes(o);
            Object.assign(o, {
              ts: ts.toISOString(), importo: rimb ? -x : x, cat: f.cat, sub: f.sub || null,
              nota: rimb ? `Rimborso: ${notaV}` : notaV, tipo: rimb ? "rimborso" : "spesa",
              metodo: rimb ? null : f.metodo, motivo: f.motivo || "", persone: rimb ? 1 : f.persone,
            });
            if (bonus > 0) o.bonus = bonus; else delete o.bonus;
            if (pre.inboxId) o.daInbox = pre.inboxId;
            touch(o);
            if (nuovo) S.spese.push(o);
            if (!rimb && notaV) K.impara(notaV, f.cat, f.sub, f.metodo);
            if (!rimb && !edit && f.persone > 1) S.crediti.push(touch({ id: uid("cr"), ts: o.ts, chi: $("#f-chi", sh).value.trim() || "Da dividere", importo: r2(x - x / f.persone), rientrato: 0, nota: notaV, spesa: o.id }));
            if (rimb && f.credito) { const c = S.crediti.find(z => z.id === f.credito); if (c) { c.rientrato = r2((c.rientrato || 0) + x); if (c.rientrato >= c.importo - 0.004) c.saldato = true; touch(c); } }
            if (pre.inboxId) remove("inbox", pre.inboxId);
          });
          close(); vibra(18);
          const c = K.cat(f.cat);
          if (rimb) toast("Rimborso registrato", `${eur(x)} tornano in ${c.nome}.`, "ok");
          else if (c.periodo === "fondo") toast("Registrata", `Salvadanaio viaggi: ${eur(K.saldoViaggi())}`, "ok");
          else if (c.periodo === "libero") toast("Registrata", `${c.nome}: ${eur(K.statoCategoria(c.id).speso)} questo mese`, "ok");
          else {
            const st = K.statoCategoria(c.id);
            if (st.resto >= 0 && st.budget > 0 && st.resto / st.budget <= S.settings.budgetQuasiFinito) toast("⚠️ Budget quasi finito", `${c.nome}: restano ${eur(st.resto)} su ${eur(st.budget)}.`, "warn");
            else toast("Registrata", `${c.nome}: ${st.resto >= 0 ? `restano ${eur(st.resto)}` : `sforato di ${eur(-st.resto)}`}`, st.resto >= 0 ? "ok" : "bad");
          }
          if (pre.inboxId && S.inbox.length) setTimeout(sheetInbox, 350);
        };
        $("#f-del", sh)?.addEventListener("click", () => conferma("Eliminare questa voce?", `${eur(Math.abs(edit.importo))} · ${edit.nota || K.catNome(edit.cat)}`, "Elimina", () => { commit(S => remove("spese", edit.id)); close(); toast("Eliminata", "", "ok"); }));
        $("#f-ign", sh)?.addEventListener("click", () => { commit(S => remove("inbox", pre.inboxId)); close(); if (S.inbox.length) setTimeout(sheetInbox, 350); });
      },
    });
  }

  // =========================== FORM: INBOX ============================
  function sheetInbox() {
    if (!S.inbox.length) { toast("Tutto sistemato", "Nessun pagamento in attesa.", "ok"); return; }
    const items = S.inbox.slice().sort((a, b) => a.ts < b.ts ? 1 : -1);
    openSheet({
      title: "Pagamenti da sistemare",
      body: `<p class="note">Sono arrivati dal Wallet. Tocca un pagamento per scegliere la categoria.</p>
        <div class="card flush">${items.map(x => { const s = K.suggerisci(x.esercente); const c = s && K.cat(s.cat); const d = new Date(x.ts);
          return `<button class="row" data-ib="${x.id}"><span class="av ${c ? "blue" : "warn"}">${c ? catIcon(c) : ic("inbox", 18)}</span><div class="tx"><div class="t1">${esc(x.esercente || "Pagamento")}</div><div class="t2">${dShort(d)} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · ${c ? "suggerita: " + esc(c.nome) : "da classificare"}${x.carta ? " · " + esc(x.carta) : ""}</div></div><div class="val">${eur(x.importo)}</div></button>`; }).join("")}</div>`,
      onMount: (sh, close) => sh.addEventListener("click", e => {
        const b = e.target.closest("[data-ib]"); if (!b) return;
        const x = S.inbox.find(z => z.id === b.dataset.ib); close();
        const metodo = metodoDaCarta(x.carta);
        setTimeout(() => sheetSpesa({ importo: x.importo, nota: x.esercente, ts: x.ts, inboxId: x.id, metodo }), 280);
      }),
    });
  }
  function metodoDaCarta(carta) {
    if (!carta) return null;
    const c = carta.toLowerCase();
    return S.settings.metodi.find(m => c.includes(m.toLowerCase().split(" ")[0])) || null;
  }

  // ========================== FORM: ENTRATA ===========================
  function sheetEntrata(editId) {
    const ed = editId ? S.entrate.find(x => x.id === editId) : null;
    if (ed) {
      openSheet({ title: "Entrata extra", body: `<div class="card"><div class="kv"><span class="k">Importo</span><span class="v">${eur(ed.importo)}</span></div><div class="kv"><span class="k">Da</span><span class="v">${esc(ed.fonte)}</span></div><div class="kv"><span class="k">Fondo</span><span class="v">${eur(ed.fondo || 0)}</span></div><div class="kv"><span class="k">Viaggi</span><span class="v">${eur(ed.viaggi || 0)}</span></div><div class="kv"><span class="k">Spese annuali</span><span class="v">${eur(ed.annuali || 0)}</span></div><div class="kv"><span class="k">Libera</span><span class="v">${eur(ed.libero || 0)}</span></div></div><p class="note">Eliminandola tolgo anche i versamenti nei salvadanai collegati.</p>`,
        footer: `<button class="btn dng" id="e-del">${ic("trash", 18)} Elimina entrata</button>`,
        onMount: (sh, close) => $("#e-del", sh).onclick = () => conferma("Eliminare l'entrata?", `${eur(ed.importo)} · ${ed.fonte}`, "Elimina", () => {
          commit(S => { remove("entrate", ed.id); ["fondo", "viaggiFondo", "annuali"].forEach(l => S[l].filter(m => m.entrata === ed.id).forEach(m => remove(l, m.id))); }); close();
        }) });
      return;
    }
    const R = S.settings.ripartizioneExtra;
    openSheet({
      title: "Entrata extra",
      body: `<div class="amount"><input id="e-imp" inputmode="decimal" placeholder="0" aria-label="Importo"><span class="eu">€</span></div>
        <div class="field"><label for="e-fonte">Da dove arriva</label><input id="e-fonte" class="inp" placeholder="es. bonus, rimborso 730, vendita"></div>
        <p class="note">Soldi in più rispetto allo stipendio. Non registrare qui i giroconti tra i tuoi conti né i rimborsi di spese: per quelli c'è Rimborso.</p>
        <div class="chips wrap" id="e-mode"><button class="chip" data-mode="cons" aria-pressed="true">Consigliata</button><button class="chip" data-mode="fondo" aria-pressed="false">Tutto nel fondo</button><button class="chip" data-mode="io" aria-pressed="false">Scelgo io</button></div>
        <div class="split3" id="e-fields">
          <div class="field"><label for="e-f">Fondo €</label><input id="e-f" class="inp" inputmode="decimal"></div>
          <div class="field"><label for="e-v">Viaggi €</label><input id="e-v" class="inp" inputmode="decimal"></div>
          <div class="field"><label for="e-a">Annuali €</label><input id="e-a" class="inp" inputmode="decimal"></div>
        </div>
        <div class="preview" id="e-prev"></div>`,
      footer: `<button class="btn pri" id="e-save">Registra entrata</button>`,
      onMount: (sh, close) => {
        let mode = "cons";
        const v = id => Math.max(0, parseAmount($(id, sh).value) || 0);
        function fill() {
          const imp = parseAmount($("#e-imp", sh).value) || 0;
          if (mode === "cons") { $("#e-f", sh).value = num(r2(imp * R.fondo)); $("#e-v", sh).value = num(r2(imp * R.viaggi)); $("#e-a", sh).value = "0"; }
          if (mode === "fondo") { $("#e-f", sh).value = num(imp); $("#e-v", sh).value = "0"; $("#e-a", sh).value = "0"; }
          $$("#e-fields input", sh).forEach(i => i.readOnly = mode !== "io");
          prev();
        }
        function prev() {
          const imp = parseAmount($("#e-imp", sh).value) || 0, ass = v("#e-f") + v("#e-v") + v("#e-a"), lib = r2(imp - ass);
          $("#e-prev", sh).innerHTML = lib < -0.005 ? `<span class="neg">Hai assegnato ${eur(ass)} su ${eur(imp)}.</span>` : `Liberi da spendere: <b>${eur(lib)}</b>. La parte libera non aumenta i budget: la puoi usare solo quando una spesa sforerebbe.`;
        }
        $("#e-imp", sh).addEventListener("input", fill);
        $$("#e-fields input", sh).forEach(i => i.addEventListener("input", prev));
        $("#e-mode", sh).addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode; $$("#e-mode .chip", sh).forEach(c => c.setAttribute("aria-pressed", String(c === b))); fill(); });
        fill(); setTimeout(() => $("#e-imp", sh).focus(), 300);
        $("#e-save", sh).onclick = () => {
          const imp = parseAmount($("#e-imp", sh).value);
          if (!(imp > 0)) { toast("Importo mancante", "", "bad"); return; }
          const rip = { fondo: v("#e-f"), viaggi: v("#e-v"), annuali: v("#e-a") };
          const ass = rip.fondo + rip.viaggi + rip.annuali;
          if (ass > imp + 0.005) { toast("Troppo", `Hai assegnato ${eur(ass)} su ${eur(imp)}.`, "bad"); return; }
          rip.libero = r2(imp - ass);
          const fonte = $("#e-fonte", sh).value.trim() || "Entrata extra";
          commit(S => {
            const ts = new Date().toISOString(), id = uid("en");
            S.entrate.push(touch({ id, ts, importo: imp, fonte, ...rip }));
            if (rip.fondo > 0) S.fondo.push(touch({ id: uid("mv"), ts, importo: rip.fondo, nota: "Entrata extra: " + fonte, entrata: id }));
            if (rip.viaggi > 0) S.viaggiFondo.push(touch({ id: uid("mv"), ts, importo: rip.viaggi, nota: "Extra: " + fonte, entrata: id }));
            if (rip.annuali > 0) S.annuali.push(touch({ id: uid("mv"), ts, importo: rip.annuali, nota: "Extra: " + fonte, entrata: id }));
          });
          close(); toast("Entrata registrata", `Ricordati di fare davvero i bonifici verso il ${S.settings.contoDeposito}.`, "ok");
        };
      },
    });
  }

  // ======================== FORM: GIORNO DI PAGA ======================
  function sheetPaga() {
    if (!K.pianoAttivo()) { toast("Il piano non è ancora partito", "", ""); return; }
    const key = K.cicloKey();
    const dic = K.monthStart(new Date()).getMonth() + 1 === S.settings.meseTredicesima;
    openSheet({
      title: "Giorno di paga",
      body: `<div class="field"><label for="p-st">Stipendio netto arrivato</label><input id="p-st" class="inp" inputmode="decimal" value="${num(K.stipendioCiclo())}"></div>
        ${dic ? `<div class="split"><div class="field"><label for="p-tr">Tredicesima netta</label><input id="p-tr" class="inp" inputmode="decimal" placeholder="0"></div><div class="field"><label for="p-trf">Di cui al fondo</label><input id="p-trf" class="inp" inputmode="decimal" placeholder="${Math.round(S.settings.quotaTredicesima * 100)}%"></div></div>` : ""}
        <div id="p-sum"></div>`,
      footer: `<button class="btn pri" id="p-ok">${ic("check", 18)} Fatto: registra i bonifici</button><button class="btn" id="p-skip">Salta il salvadanaio questo mese</button>`,
      onMount: (sh, close) => {
        const tr = $("#p-tr", sh), trf = $("#p-trf", sh);
        function sum() {
          const st = parseAmount($("#p-st", sh).value);
          const save = S.stipendi[key];
          if (st > 0) S.stipendi[key] = st;
          const c = K.contiDelMese(), p = c.piano;
          if (save === undefined) delete S.stipendi[key]; else S.stipendi[key] = save;
          let trFondo = 0;
          if (tr) { const t = parseAmount(tr.value) || 0; trFondo = trf.value ? (parseAmount(trf.value) || 0) : r2(t * S.settings.quotaTredicesima); }
          $("#p-skip", sh).hidden = !(p.daVersare > 0);
          $("#p-sum", sh).innerHTML = `
            <div class="card"><h2>Bonifici verso il ${esc(S.settings.contoDeposito)}</h2>
              <div class="kv"><span class="k">Salvadanaio spese annuali</span><span class="v">${eur(p.daVersare)}</span></div>
              <div class="kv"><span class="k">Salvadanaio viaggi</span><span class="v">${eur(c.viaggi)}</span></div>
              <div class="kv"><span class="k">Fondo emergenza${trFondo > 0 ? " (con tredicesima)" : ""}</span><span class="v">${eur(c.fondo.importo + trFondo)}</span></div>
              <div class="kv tot"><span class="k">Totale</span><span class="v">${eur(p.daVersare + c.viaggi + c.fondo.importo + trFondo)}</span></div>
            </div>
            <p class="note">${esc(c.fondo.nota)}</p>
            ${p.oraScadenza > 0 ? `<div class="preview ${p.scoperto > 0 ? "warn" : ""}">In questo ciclo paghi ${esc(p.vociOra.join(", "))} (${eur(p.oraScadenza)}).${p.coperto > 0 ? ` Il salvadanaio ne copre ${eur(p.coperto)}.` : ""}${p.scoperto > 0 ? ` ${eur(p.scoperto)} escono dallo stipendio.` : ""}</div>` : ""}
            ${p.daVersare > 0 ? `<p class="note">Se salti il salvadanaio questo mese, dal prossimo la rata diventa ${eur(K.rataSeSalti())}.</p>` : ""}
            <div class="preview">Dopo i bonifici ti restano <b>${eur(c.disponibile)}</b> per le spese variabili (budget ${eur(c.budgetVar)}).</div>`;
          return { st, c, p, trFondo };
        }
        sum();
        $$("input", sh).forEach(i => i.addEventListener("input", sum));
        const registra = skip => {
          const { st, trFondo } = sum();
          commit(S => {
            if (st > 0) S.stipendi[key] = st;
            const c = K.contiDelMese(), p = c.piano, ts = new Date().toISOString();
            if (skip) S.salvadanaioSaltato[key] = true;
            else if (p.daVersare > 0) S.annuali.push(touch({ id: uid("mv"), ts, importo: p.daVersare, nota: "Giorno di paga" }));
            if (p.coperto > 0) S.annuali.push(touch({ id: uid("mv"), ts, importo: -p.coperto, nota: p.vociOra.join(", ") }));
            if (c.viaggi > 0) S.viaggiFondo.push(touch({ id: uid("mv"), ts, importo: c.viaggi, nota: "Giorno di paga" }));
            if (c.fondo.importo > 0) S.fondo.push(touch({ id: uid("mv"), ts, importo: c.fondo.importo, nota: "Giorno di paga" }));
            if (trFondo > 0) S.fondo.push(touch({ id: uid("mv"), ts, importo: trFondo, nota: "Tredicesima" }));
            S.lastPayday = key;
          });
          close(); toast("Registrato", `Ricordati di fare davvero i bonifici verso il ${S.settings.contoDeposito}.`, "ok");
        };
        $("#p-ok", sh).onclick = () => registra(false);
        $("#p-skip", sh).onclick = () => registra(true);
      },
    });
  }

  // ============================ FORM: CHECK ===========================
  function sheetCheck() {
    const ult = K.storicoCheck().at(-1);
    openSheet({
      title: "Check di metà mese",
      body: `<p class="note">Scrivi il valore di oggi di ogni conto.${ult ? " I campi riportano l'ultimo check: cambia solo ciò che è variato." : ""}</p>
        ${S.checkVoci.map(v => { const prec = ult ? K.inserito(ult, v) : v.iniziale; return `<div class="field"><label for="c-${v.id}">${esc(v.nome)}${v.tipo === "accumulo" ? " · ricevuto questo mese" : ""}</label><input id="c-${v.id}" class="inp" inputmode="decimal" value="${prec !== undefined ? num(prec) : ""}"></div>`; }).join("")}`,
      footer: `<button class="btn pri" id="c-save">Salva il check</button>`,
      onMount: (sh, close) => $("#c-save", sh).onclick = () => {
        const valori = {}; S.checkVoci.forEach(v => { const n = parseAmount($("#c-" + v.id, sh).value); valori[v.id] = isNaN(n) ? 0 : n; });
        const mk = K.meseCivile();
        commit(S => { S.check = S.check.filter(c => c.mese !== mk); S.check.push(touch({ id: "ck_" + mk, mese: mk, ts: new Date().toISOString(), valori })); });
        close(); go("risparmi"); toast("Check salvato", "", "ok");
      },
    });
  }

  // ======================= FORM: FONDO E SALVADANAI ===================
  function sheetMovimento({ titolo, lista, saldo, info, versa = "Versamento", preleva, motivoPrelievo = false, notaDefault = "Versamento" }) {
    openSheet({
      title: titolo,
      body: `<div class="hero" style="padding:16px 18px"><div class="lbl">Saldo</div><div class="big" style="font-size:34px">${eur(saldo)}</div><div class="sub">${info}</div></div>
        <div class="chips wrap" id="m-mode"><button class="chip" data-mode="in" aria-pressed="true">${esc(versa)}</button>${preleva ? `<button class="chip" data-mode="out" aria-pressed="false">${esc(preleva)}</button>` : ""}</div>
        <div class="amount"><input id="m-imp" inputmode="decimal" placeholder="0" aria-label="Importo"><span class="eu">€</span></div>
        <div class="field"><label for="m-nota" id="m-lab">Nota</label><input id="m-nota" class="inp" placeholder="${esc(notaDefault)}"></div>
        <div class="card flush"><h2>Ultimi movimenti</h2>${S[lista].slice(-6).reverse().map(m => `<div class="row" style="cursor:default"><div class="tx"><div class="t1">${esc(m.nota || "Movimento")}</div><div class="t2">${dShort(new Date(m.ts))}</div></div><div class="val ${m.importo >= 0 ? "pos" : "neg"}">${m.importo >= 0 ? "+" : ""}${eur(m.importo)}</div></div>`).join("") || `<div class="empty">Nessun movimento.</div>`}</div>`,
      footer: `<button class="btn pri" id="m-save">Registra</button>`,
      onMount: (sh, close) => {
        let mode = "in";
        $("#m-mode", sh).addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode; $$("#m-mode .chip", sh).forEach(c => c.setAttribute("aria-pressed", String(c === b))); $("#m-lab", sh).textContent = mode === "out" && motivoPrelievo ? "Motivo (obbligatorio): è davvero un'emergenza?" : "Nota"; });
        $("#m-save", sh).onclick = () => {
          const x = parseAmount($("#m-imp", sh).value), nota = $("#m-nota", sh).value.trim();
          if (!(x > 0)) { toast("Importo mancante", "", "bad"); return; }
          if (mode === "out" && motivoPrelievo && !nota) { toast("Motivo mancante", "Senza motivo il prelievo non viene registrato.", "warn"); return; }
          commit(S => S[lista].push(touch({ id: uid("mv"), ts: new Date().toISOString(), importo: mode === "in" ? x : -x, nota: nota || (mode === "in" ? notaDefault : "Prelievo") })));
          close(); toast("Registrato", mode === "in" ? `Bonifica davvero verso il ${S.settings.contoDeposito}.` : "", "ok");
          if (lista === "fondo" && K.fondoTot() < S.settings.fondoSoglia && mode === "out") toast("⚠️ Fondo sotto soglia", `Il fondo è sceso a ${eur(K.fondoTot())}.`, "warn");
        };
      },
    });
  }
  const sheetFondo = () => sheetMovimento({ titolo: "Fondo emergenza", lista: "fondo", saldo: K.fondoTot(), info: `${esc(K.fondoDelMese().importo ? eur(K.fondoDelMese().importo) + " al mese" : "nessun versamento fisso ora")} · ${esc(K.faseAttiva().nome)}`, preleva: "Prelievo (solo emergenze)", motivoPrelievo: true });
  const sheetViaggi = () => sheetMovimento({ titolo: "Salvadanaio viaggi", lista: "viaggiFondo", saldo: K.saldoViaggi(), info: `${eur(K.versamentoViaggi())} ogni giorno di paga · le spese di viaggio si registrano come spese normali`, versa: "Versamento extra", notaDefault: "Versamento extra" });
  function sheetAnnuali() {
    const lista = K.annualiAttivi();
    openSheet({
      title: "Salvadanaio spese annuali",
      body: `<div class="hero" style="padding:16px 18px"><div class="lbl">Saldo</div><div class="big" style="font-size:34px">${eur(K.salvadanaio())}</div><div class="sub">Da versare in questo ciclo: ${eur(K.pianoSalvadanaio().daVersare)}</div></div>
        <div class="chips wrap" id="a-mode"><button class="chip" data-mode="in" aria-pressed="true">Versa</button><button class="chip" data-mode="out" aria-pressed="false">Paga una spesa annuale</button></div>
        <div class="field" id="a-selw" hidden><label for="a-sel">Quale spesa stai pagando?</label><select id="a-sel" class="sel">${lista.map(x => `<option value="${x.id}">${esc(x.nome)} · ${eur(x.importo)}</option>`).join("")}</select></div>
        <div class="amount"><input id="a-imp" inputmode="decimal" placeholder="0" value="${num(K.pianoSalvadanaio().daVersare || "")}" aria-label="Importo"><span class="eu">€</span></div>`,
      footer: `<button class="btn pri" id="a-save">Registra</button>`,
      onMount: (sh, close) => {
        let mode = "in";
        const sel = $("#a-sel", sh);
        $("#a-mode", sh).addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode; $$("#a-mode .chip", sh).forEach(c => c.setAttribute("aria-pressed", String(c === b))); $("#a-selw", sh).hidden = mode !== "out"; if (mode === "out") $("#a-imp", sh).value = num(lista.find(x => x.id === sel.value)?.importo || 0); });
        sel?.addEventListener("change", () => $("#a-imp", sh).value = num(lista.find(x => x.id === sel.value)?.importo || 0));
        $("#a-save", sh).onclick = () => {
          const x = parseAmount($("#a-imp", sh).value); if (!(x > 0)) { toast("Importo mancante", "", "bad"); return; }
          const a = lista.find(z => z.id === sel?.value);
          commit(S => S.annuali.push(touch({ id: uid("mv"), ts: new Date().toISOString(), importo: mode === "in" ? x : -x, nota: mode === "in" ? "Versamento" : a?.nome || "Spesa annuale" })));
          close(); toast(mode === "in" ? "Versamento registrato" : `${a?.nome} pagata`, `Salvadanaio ora: ${eur(K.salvadanaio())}`, "ok");
        };
      },
    });
  }
  function sheetFissa(id) {
    const f = K.fisseCiclo().find(x => x.id === id) || K.fisseCiclo().find(x => x.variabile && x.reale === undefined);
    if (!f) return;
    openSheet({
      title: f.nome,
      body: `<p class="note">Previsto ${eur(f.importo)}${f.variabile ? " (importo variabile)" : ""} · addebito il ${dLong(f.data)}. Se l'addebito reale è diverso, scrivilo qui: vale solo per questo ciclo.</p>
        <div class="amount"><input id="x-imp" inputmode="decimal" value="${num(K.importoFissa(f))}" aria-label="Importo reale"><span class="eu">€</span></div>`,
      footer: `<button class="btn pri" id="x-save">Salva importo reale</button>${f.reale !== undefined ? `<button class="btn" id="x-reset">Torna all'importo previsto</button>` : ""}`,
      onMount: (sh, close) => {
        $("#x-save", sh).onclick = () => {
          const x = parseAmount($("#x-imp", sh).value); if (!(x >= 0)) return;
          const key = K.cicloKey();
          commit(S => { S.fissePagate[key] = { ...(S.fissePagate[key] || {}), [f.nome]: x }; });
          close(); const diff = x - f.importo;
          toast(f.nome, Math.abs(diff) < 0.01 ? "Importo reale salvato" : diff > 0 ? `⚠️ ${eur(diff)} più del previsto` : `${eur(-diff)} meno del previsto`, Math.abs(diff) < 0.01 || diff < 0 ? "ok" : "warn");
        };
        $("#x-reset", sh)?.addEventListener("click", () => { const key = K.cicloKey(); commit(S => { const o = { ...(S.fissePagate[key] || {}) }; delete o[f.nome]; S.fissePagate[key] = o; }); close(); });
      },
    });
  }

  // =========================== RECAP SETTIMANA ========================
  function sheetRecap() {
    const r = K.recapSettimana();
    const fatto = () => commit(S => { S.lastRecap = dk(K.weekStart(new Date())); });
    openSheet({
      title: `Settimana ${dm(r.ps)} – ${dm(new Date(r.pe - 1))}`,
      body: r.hadData ? `
        <div class="card flush">${r.righe.map(x => `<div class="row" style="cursor:default"><span class="av ${x.ok ? "ok" : "bad"}">${ic(x.ok ? "check" : "close", 18)}</span><div class="tx"><div class="t1">${esc(x.c.nome)}</div><div class="t2">${eur(x.speso)} su ${eur(x.budget)}</div></div><div class="val ${x.ok ? "pos" : "neg"}">${x.ok ? "+" + eur(x.budget - x.speso) : "−" + eur(x.speso - x.budget).replace("−", "")}</div></div>`).join("")}</div>
        <div class="card"><div class="kv"><span class="k">Serie nel budget ${esc(K.catLivello()?.nome?.toLowerCase())}</span><span class="v">${plural(r.streak, "settimana", "settimane")}</span></div>
        ${r.bloccata ? `<div class="kv"><span class="k">${esc(r.bloccata.nome)}</span><span class="v">${K.streak(r.bloccata.uscite)}/${r.bloccata.serieRichiesta}</span></div>` : ""}
        <div class="kv tot"><span class="k">Avanzo della settimana</span><span class="v pos">${eur(r.avanzo)}</span></div></div>
        <div class="preview">Questa settimana trasferisci <b>${eur(r.paghetta)}</b> su ${esc(S.settings.metodoPaghetta)} e usa solo quella carta per ${esc(K.catSettimanali().map(c => c.nome.toLowerCase()).join(", "))}.</div>`
        : `<div class="preview">Nessuna spesa la settimana scorsa. Questa settimana trasferisci <b>${eur(r.paghetta)}</b> su ${esc(S.settings.metodoPaghetta)}.</div>`,
      footer: r.avanzo > 0 ? `<button class="btn pri" id="r-ok">Bonifica ${eur(r.avanzo)} nel fondo</button><button class="btn" id="r-no">Chiudi</button>` : `<button class="btn pri" id="r-no">Ok</button>`,
      onMount: (sh, close) => {
        $("#r-ok", sh)?.addEventListener("click", () => { commit(S => { S.fondo.push(touch({ id: uid("mv"), ts: new Date().toISOString(), importo: r.avanzo, nota: "Avanzo settimanale" })); S.lastRecap = dk(K.weekStart(new Date())); }); close(); toast("Avanzo nel fondo", `Fondo emergenza: ${eur(K.fondoTot())}`, "ok"); });
        $("#r-no", sh).onclick = () => { fatto(); close(); };
      },
    });
  }

  function sheetCategoria(id) {
    const st = K.statoCategoria(id), c = st.c;
    const per = c.periodo === "fondo" ? null : c.periodo === "libero" ? "mese" : c.periodo;
    const [s, e] = per ? K.periodRange(per) : [new Date(0), new Date(8.64e15)];
    const voci = S.spese.filter(x => x.cat === id && inRange(x, s, e)).sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 40);
    const perSub = {}; voci.forEach(x => { const k = x.sub || "Senza sottocategoria"; perSub[k] = (perSub[k] || 0) + K.netto(x); });
    openSheet({
      title: c.nome,
      body: `${st.periodo === "fondo" ? `<div class="preview">Salvadanaio viaggi: <b>${eur(st.saldo)}</b></div>` : st.periodo === "libero" ? `<div class="preview">Senza budget · questo mese <b>${eur(st.speso)}</b></div>` :
        `<div class="card"><div class="kv"><span class="k">Budget ${c.periodo === "settimana" ? "della settimana" : "del mese"}</span><span class="v">${eur(st.budget)}</span></div><div class="kv"><span class="k">Speso</span><span class="v">${eur(st.speso)}</span></div><div class="kv tot"><span class="k">${st.resto >= 0 ? "Rimasti" : "Sforato"}</span><span class="v ${st.resto >= 0 ? "pos" : "neg"}">${eur(Math.abs(st.resto))}</span></div>${st.resto > 0 ? `<p class="note" style="margin:6px 0 0">${eur(st.perGiorno)} al giorno per ${plural(st.gg, "giorno", "giorni")}</p>` : ""}</div>`}
        ${Object.keys(perSub).length > 1 ? `<div class="card">${Object.entries(perSub).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${eur(v)}</span></div>`).join("")}</div>` : ""}
        <div class="card flush">${voci.length ? voci.map(x => rigaStorico({ k: "spesa", x })).join("") : `<div class="empty">Nessuna spesa ${c.periodo === "settimana" ? "questa settimana" : "in questo periodo"}.</div>`}</div>`,
      footer: `<button class="btn pri" id="k-add">${ic("plus", 18)} Aggiungi in ${esc(c.nome)}</button>`,
      onMount: (sh, close) => {
        $("#k-add", sh).onclick = () => { close(); setTimeout(() => sheetSpesa({ cat: id }), 280); };
        sh.addEventListener("click", ev => { const b = ev.target.closest("[data-act=edit]"); if (b) { ev.stopPropagation(); close(); setTimeout(() => sheetSpesa({ editId: b.dataset.id }), 280); } });
      },
    });
  }

  // ============================ IMPOSTAZIONI ==========================
  const SEZ = [
    ["sync", "sync", "Sincronizzazione", "Gist privato su GitHub"],
    ["push", "bell", "Promemoria", "Notifiche push"],
    ["wallet", "card", "Pagamenti dal Wallet", "Comando rapido"],
    ["cat", "tag", "Categorie e budget", "Budget, periodi e sottocategorie"],
    ["fisse", "calendar", "Spese fisse", "Ogni mese"],
    ["annualiDef", "piggy", "Spese annuali", "Coperte dal salvadanaio"],
    ["livelli", "star", "Livelli del fondo", "Quanto versare e quando"],
    ["mesiSpeciali", "pencil", "Budget di un mese", "Modifiche per mesi particolari"],
    ["checkVoci", "chart", "Conti del check", "Le voci del check di metà mese"],
    ["debiti", "card", "Debiti", "Per il patrimonio netto"],
    ["regole", "bolt", "Categorie automatiche", "Regole e cose imparate"],
    ["param", "gear", "Parametri", "Stipendio, soglie, ripartizioni"],
    ["aspetto", "moon", "Aspetto", "Tema"],
    ["dati", "download", "Dati e backup", "Import, export, ripristino"],
  ];
  const SCHEMI = {
    fisse: { titolo: "Spese fisse", nuovo: () => ({ id: uid("f"), nome: "Nuova spesa fissa", importo: 0, giorno: 1 }), campi: [
      ["nome", "Nome", "text", "wide"], ["importo", "Importo €", "num"], ["giorno", "Giorno del mese", "int"], ["inizio", "Dal mese", "month"], ["fine", "Fino al mese", "month"], ["variabile", "Importo variabile", "bool"], ["pac", "È un PAC", "bool"]] },
    annualiDef: { titolo: "Spese annuali", nuovo: () => ({ id: uid("a"), nome: "Nuova spesa annuale", importo: 0, mesi: [1], giorno: 10 }), campi: [
      ["nome", "Nome", "text", "wide"], ["importo", "Importo €", "num"], ["mesi", "Mesi (es. 4, 10)", "intlist"], ["giorno", "Giorno", "int"], ["inizio", "Dal mese", "month"]] },
    livelli: { titolo: "Livelli del fondo", nuovo: () => ({ id: uid("l"), da: K.meseKey(), nome: `Livello ${S.livelli.length + 1}`, fondo: 0, uscite: 100, nota: "" }), campi: [
      ["nome", "Nome", "text"], ["da", "Dal mese", "month"], ["fondo", "Al fondo €/mese", "num"], ["uscite", "Budget aperitivi €/sett.", "num"], ["serieRichiesta", "Settimane di fila per sbloccarlo", "int"], ["nota", "Nota", "text", "wide"]] },
    mesiSpeciali: { titolo: "Budget di un mese", nuovo: () => ({ id: uid("ms"), mese: K.meseKey(), chiave: "aperitivo", valore: 0, nota: "" }), campi: [
      ["mese", "Mese (ciclo)", "month"], ["chiave", "Cosa cambia", "chiave"], ["valore", "Nuovo valore €", "num"], ["nota", "Perché", "text", "wide"]] },
    checkVoci: { titolo: "Conti del check", nuovo: () => ({ id: uid("cv"), nome: "Nuovo conto", tipo: "saldo", liquido: true, iniziale: 0 }), campi: [
      ["nome", "Nome", "text", "wide"], ["iniziale", "Valore iniziale €", "num"], ["tipo", "Tipo", "sel", null, [["saldo", "Valore di oggi"], ["accumulo", "Ricevuto nel mese"]]], ["liquido", "Liquido (disponibile)", "bool"]] },
    debiti: { titolo: "Debiti", nuovo: () => ({ id: uid("db"), nome: "Mutuo (tua quota)", residuo: 0 }), campi: [["nome", "Nome", "text", "wide"], ["residuo", "Residuo €", "num"]] },
    regole: { titolo: "Regole automatiche", nuovo: () => ({ id: uid("r"), pattern: "", cat: "spesa" }), campi: [["pattern", "Parole (separate da |)", "text", "wide"], ["cat", "Categoria", "cat"], ["sub", "Sottocategoria", "text"]] },
  };
  const PARAM = [
    ["stipendioNetto", "Stipendio netto previsto €", "num"], ["giornoStipendio", "Giorno di paga", "int"], ["inizioPiano", "Inizio del piano", "month"],
    ["viaggiMensile", "Salvadanaio viaggi €/mese", "num"], ["fondoSoglia", "Soglia minima fondo €", "num"], ["fondoObiettivoMesi", "Obiettivo fondo (mesi di spese)", "num"],
    ["quotaTredicesima", "Tredicesima al fondo %", "pct"], ["meseTredicesima", "Mese della tredicesima", "int"],
    ["rip_fondo", "Entrate extra al fondo %", "pct"], ["rip_viaggi", "Entrate extra ai viaggi %", "pct"],
    ["budgetQuasiFinito", "Avviso budget quasi finito (resta il %)", "pct"], ["riportaSforamento", "Lo sforamento si toglie dal periodo dopo", "bool"],
    ["contoDeposito", "Nome del conto dei salvadanai", "text"], ["metodi", "Metodi di pagamento (separati da virgola)", "list"], ["metodoPaghetta", "Carta della paghetta", "text"],
    ["oraSerale", "Ora del promemoria serale", "int"], ["oraCheck", "Ora del promemoria check", "int"], ["preavvisoFisseVariabili", "Preavviso fisse variabili (giorni)", "int"], ["preavvisoAnnuali", "Preavviso spese annuali (giorni)", "int"],
  ];

  function renderImpostazioni() {
    if (sett === "") return { title: "Impostazioni", body: `<div class="card flush">${SEZ.map(([id, i, t, s]) => `<button class="row" data-act="sez" data-v="${id}"><span class="av">${ic(i, 18)}</span><div class="tx"><div class="t1">${t}</div><div class="t2">${s}</div></div>${ic("chevron", 18)}</button>`).join("")}</div>
      <p class="note" style="text-align:center">Spiccio · dati salvati su questo dispositivo${L.gistId ? " e nel tuo Gist" : ""}</p>` };
    const t = SEZ.find(s => s[0] === sett)?.[2] || "Impostazioni";
    if (SCHEMI[sett]) return { title: t, body: editorLista(sett) + (sett === "regole" ? imparateHtml() : "") };
    if (sett === "cat") return { title: t, body: editorCategorie() };
    if (sett === "param") return { title: t, body: editorParam() };
    if (sett === "sync") return { title: t, body: setSync() };
    if (sett === "push") return { title: t, body: setPush() };
    if (sett === "wallet") return { title: t, body: setWallet() };
    if (sett === "aspetto") return { title: t, body: `<div class="card"><div class="field"><span class="lab">Tema</span><div class="chips wrap">${[["scuro", "Scuro"], ["chiaro", "Chiaro"], ["auto", "Come l'iPhone"]].map(([v, l]) => `<button class="chip" data-act="tema" data-v="${v}" aria-pressed="${L.tema === v}">${l}</button>`).join("")}</div></div></div>` };
    if (sett === "dati") return { title: t, body: setDati() };
    return { title: t, body: "" };
  }
  function fieldHtml(list, i, [k, label, type, cls, opts], val) {
    const id = `ed-${list}-${i}-${k}`, data = `data-ed="${list}" data-i="${i}" data-k="${k}" data-t="${type}"`;
    if (type === "bool") return `<label class="chk ${cls || ""}"><input type="checkbox" id="${id}" ${data} ${val ? "checked" : ""}>${esc(label)}</label>`;
    let inp;
    if (type === "sel") inp = `<select class="sel" id="${id}" ${data}>${opts.map(([v, l]) => `<option value="${v}" ${val === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    else if (type === "cat") inp = `<select class="sel" id="${id}" ${data}>${S.categories.map(c => `<option value="${c.id}" ${val === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>`;
    else if (type === "chiave") inp = `<select class="sel" id="${id}" ${data}>${[...S.categories.filter(c => c.periodo !== "fondo" && c.periodo !== "libero").map(c => [c.id, "Budget " + c.nome]), ["viaggi", "Versamento viaggi"], ["salvadanaio", "Rata salvadanaio annuali"], ["pausaPAC", "PAC in pausa (1 = sì)"]].map(([v, l]) => `<option value="${v}" ${val === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    else {
      const v = type === "num" || type === "int" ? (val ?? "") === "" ? "" : num(val) : type === "pct" ? (val ?? "") === "" ? "" : num(r2(val * 100)) : type === "intlist" || type === "list" ? (val || []).join(", ") : (val ?? "");
      inp = `<input class="inp" id="${id}" ${data} ${type === "month" ? 'type="month"' : ""} ${["num", "int", "pct"].includes(type) ? 'inputmode="decimal"' : ""} value="${esc(v)}">`;
    }
    return `<div class="field ${cls || ""}"><label for="${id}">${esc(label)}</label>${inp}</div>`;
  }
  function editorLista(list) {
    const sc = SCHEMI[list];
    const righe = S[list];
    return `<div class="ed">${righe.map((r, i) => `<div class="ed-item"><div class="ed-h"><b>${esc(r.nome || r.pattern || r.mese || "Voce")}</b><button class="iconbtn" data-act="ed-del" data-l="${list}" data-i="${i}" aria-label="Elimina">${ic("trash", 17)}</button></div>
      <div class="ed-fields">${sc.campi.map(c => fieldHtml(list, i, c, r[c[0]])).join("")}</div></div>`).join("") || `<div class="empty">Nessuna voce.</div>`}
      <button class="btn" data-act="ed-add" data-l="${list}">${ic("plus", 18)} Aggiungi</button>
      ${list === "mesiSpeciali" ? `<p class="note">Il mese è quello del ciclo: “2026-10” va dal ${S.settings.giornoStipendio} ottobre al ${S.settings.giornoStipendio - 1} novembre.</p>` : ""}
      ${list === "fisse" ? `<p class="note">“Fino al mese” serve per le rate: Spiccio calcola quante ne mancano e il debito residuo.</p>` : ""}</div>`;
  }
  function imparateHtml() {
    const e = Object.entries(S.imparate).sort((a, b) => (b[1].n || 0) - (a[1].n || 0));
    return `<h3 class="sec-t">Imparate dalle tue scelte</h3><div class="card flush">${e.length ? e.slice(0, 100).map(([k, v]) => `<div class="row" style="cursor:default"><span class="av">${catIcon(K.cat(v.cat))}</span><div class="tx"><div class="t1">${esc(k)}</div><div class="t2">${esc(K.catNome(v.cat))}${v.sub ? " · " + esc(v.sub) : ""} · ${plural(v.n || 1, "volta", "volte")}</div></div><button class="iconbtn" data-act="imp-del" data-k="${esc(k)}" aria-label="Dimentica">${ic("trash", 16)}</button></div>`).join("") : `<div class="empty">Quando scegli una categoria per un esercente, Spiccio se lo ricorda.</div>`}</div>`;
  }
  function editorCategorie() {
    return `<div class="ed">${S.categories.map((c, i) => `<div class="ed-item">
        <div class="ed-h"><span class="row" style="padding:0;min-height:0;width:auto"><span class="av">${catIcon(c)}</span></span><b>${esc(c.nome)}</b>${["viaggi"].includes(c.id) ? "" : `<button class="iconbtn" data-act="cat-del" data-i="${i}" aria-label="Elimina">${ic("trash", 17)}</button>`}</div>
        <div class="ed-fields">
          <div class="field wide"><label for="cn-${i}">Nome</label><input class="inp" id="cn-${i}" data-cat="${i}" data-k="nome" value="${esc(c.nome)}"></div>
          ${c.periodo === "fondo" ? "" : `<div class="field"><label for="cp-${i}">Periodo</label><select class="sel" id="cp-${i}" data-cat="${i}" data-k="periodo">${[["settimana", "Settimanale"], ["mese", "Mensile"], ["libero", "Senza budget"]].map(([v, l]) => `<option value="${v}" ${c.periodo === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label for="cb-${i}">Budget €${c.daLivello ? " (dal livello)" : ""}</label><input class="inp" id="cb-${i}" inputmode="decimal" data-cat="${i}" data-k="budget" value="${num(c.budget || 0)}" ${c.daLivello || c.periodo === "libero" ? "disabled" : ""}></div>`}
          <div class="field wide"><label for="cs-${i}">Sottocategorie (separate da virgola)</label><input class="inp" id="cs-${i}" data-cat="${i}" data-k="sub" value="${esc((c.sub || []).join(", "))}"></div>
          <div class="field wide"><span class="lab">Icona</span><div class="iconpick">${Icons.CAT_ICONS.map(n => `<button type="button" data-act="cat-icon" data-i="${i}" data-v="${n}" aria-pressed="${c.icon === n}" aria-label="${n}">${ic(n, 18)}</button>`).join("")}</div></div>
        </div></div>`).join("")}
      <button class="btn" data-act="cat-add">${ic("plus", 18)} Nuova categoria</button>
      <p class="note">Il budget di Aperitivi e cene lo decide il livello del fondo attivo.</p></div>`;
  }
  function editorParam() {
    const C = S.settings;
    const val = k => k === "rip_fondo" ? C.ripartizioneExtra.fondo : k === "rip_viaggi" ? C.ripartizioneExtra.viaggi : C[k];
    return `<div class="card"><div class="ed-fields">${PARAM.map(p => fieldHtml("settings", 0, [p[0], p[1], p[2], p[2] === "list" || p[2] === "bool" ? "wide" : ""], val(p[0]))).join("")}</div></div>
      <p class="note">Il resto delle entrate extra resta libero (oggi ${Math.round((1 - C.ripartizioneExtra.fondo - C.ripartizioneExtra.viaggi) * 100)}%).</p>`;
  }
  function parseField(type, el) {
    if (type === "bool") return el.checked;
    const v = el.value.trim();
    if (type === "num") return v === "" ? 0 : r2(parseAmount(v) || 0);
    if (type === "int") return v === "" ? undefined : Math.round(parseAmount(v) || 0);
    if (type === "pct") return r2((parseAmount(v) || 0) / 100);
    if (type === "intlist") return v.split(/[,; ]+/).map(Number).filter(n => n >= 1 && n <= 12);
    if (type === "list") return v.split(",").map(s => s.trim()).filter(Boolean);
    if (type === "month") return v || undefined;
    return v;
  }
  function onEditorChange(el) {
    if (el.dataset.cat !== undefined) {
      const i = +el.dataset.cat, k = el.dataset.k;
      commit(S => {
        const c = S.categories[i];
        if (k === "sub") c.sub = el.value.split(",").map(s => s.trim()).filter(Boolean);
        else if (k === "budget") c.budget = r2(parseAmount(el.value) || 0);
        else c[k] = el.value;
      }, { config: true, quiet: k !== "periodo" });
      return;
    }
    const list = el.dataset.ed, i = +el.dataset.i, k = el.dataset.k, t = el.dataset.t;
    const v = parseField(t, el);
    commit(S => {
      if (list === "settings") {
        if (k === "rip_fondo") S.settings.ripartizioneExtra.fondo = v;
        else if (k === "rip_viaggi") S.settings.ripartizioneExtra.viaggi = v;
        else if (v === undefined) delete S.settings[k]; else S.settings[k] = v;
        S.settings.ripartizioneExtra.libero = r2(1 - S.settings.ripartizioneExtra.fondo - S.settings.ripartizioneExtra.viaggi);
      } else {
        const r = S[list][i]; if (!r) return;
        if (v === undefined || v === "" && t !== "text") delete r[k]; else r[k] = v;
        if (list === "regole" && k === "sub" && !v) delete r.sub;
      }
    }, { config: true, quiet: true });
  }

  function setSync() {
    return `<div class="card"><p class="note" style="margin-top:0">I dati restano sul telefono e vengono copiati in un Gist privato del tuo GitHub. Così li ritrovi sul PC, fanno da backup (GitHub tiene ogni versione) e ricevi i pagamenti dal Wallet.</p>
        <div class="field"><label for="s-token">Token GitHub (permesso “gist”)</label><input id="s-token" class="inp" type="password" autocomplete="off" value="${esc(L.token)}" placeholder="ghp_… oppure github_pat_…"></div>
        <div class="field" style="margin-top:10px"><label for="s-gist">ID del Gist</label><input id="s-gist" class="inp" autocomplete="off" value="${esc(L.gistId)}" placeholder="vuoto = lo creo io"></div>
        <div class="btnrow" style="margin-top:12px"><button class="btn pri" data-act="sync-save">${L.gistId ? "Salva e sincronizza" : "Collega e crea il Gist"}</button></div>
      </div>
      <div class="card"><div class="kv"><span class="k">Stato</span><span class="v ${L.syncErr ? "neg" : ""}">${L.syncErr ? esc(L.syncErr) : !L.token ? "non collegato" : syncing ? "in corso…" : "ok"}</span></div>
        <div class="kv"><span class="k">Ultima sincronizzazione</span><span class="v">${L.lastSync ? new Date(L.lastSync).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "mai"}</span></div>
        ${L.gistId ? `<div class="btnrow" style="margin-top:10px"><button class="btn sm" data-act="sync-now">${ic("sync", 16)} Sincronizza ora</button><button class="btn sm" data-act="copy" data-v="${esc(L.gistId)}">${ic("copy", 16)} Copia ID Gist</button></div>` : ""}
      </div>
      <p class="note">Sul PC apri lo stesso indirizzo di Spiccio, vai qui e incolla lo stesso token e lo stesso ID: i dati si uniscono da soli.</p>`;
  }
  function setPush() {
    const prox = K.promemoria(14).slice(0, 6);
    const iosNoHome = /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;
    return `${iosNoHome ? `<div class="preview warn">Su iPhone le notifiche funzionano solo se apri Spiccio dall'icona sulla Home (Condividi → Aggiungi alla schermata Home).</div>` : ""}
      <div class="card"><p class="note" style="margin-top:0">I promemoria li invia il tuo servizio gratuito su Cloudflare, nell'ora giusta, anche ad app chiusa.</p>
        <div class="field"><label for="p-url">Indirizzo del servizio</label><input id="p-url" class="inp" autocomplete="off" value="${esc(L.workerUrl)}" placeholder="https://spiccio-push.tuonome.workers.dev"></div>
        <div class="field" style="margin-top:10px"><label for="p-key">Chiave dell'app</label><input id="p-key" class="inp" type="password" autocomplete="off" value="${esc(L.appKey)}"></div>
        <div class="btnrow" style="margin-top:12px"><button class="btn pri" data-act="push-on">${L.pushOn ? "Riattiva notifiche" : "Attiva notifiche"}</button>${L.pushOn ? `<button class="btn" data-act="push-test">Prova</button>` : ""}</div>
      </div>
      <div class="card flush"><h2>Prossimi promemoria</h2>${prox.map(p => `<div class="row" style="cursor:default"><span class="av">${ic("bell", 18)}</span><div class="tx"><div class="t1">${esc(p.title)}</div><div class="t2">${new Date(p.at).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div></div>`).join("")}</div>`;
  }
  function setWallet() {
    return `<div class="card"><p class="note" style="margin-top:0">Ogni volta che paghi con il Wallet, un'automazione di Comandi salva importo ed esercente nel tuo Gist. Li ritrovi qui in Home come “pagamenti da sistemare”.</p>
      ${L.gistId ? `<div class="kv"><span class="k">ID del Gist</span><span class="v" style="font-size:12px">${esc(L.gistId)}</span></div><div class="btnrow" style="margin-top:8px"><button class="btn sm" data-act="copy" data-v="${esc(L.gistId)}">${ic("copy", 16)} Copia ID</button><button class="btn sm" data-act="copy" data-v="https://api.github.com/gists/${esc(L.gistId)}/comments">${ic("link", 16)} Copia indirizzo per Comandi</button></div>` : `<div class="preview warn">Prima collega la sincronizzazione: serve il Gist.</div>`}
      </div>
      <div class="card"><h2>Come si crea (una volta sola)</h2>
        <ol class="note" style="padding-left:18px;margin:0;display:flex;flex-direction:column;gap:6px;color:var(--fg)">
          <li>Comandi → Automazione → <b>+</b> → <b>Transazione</b>. Scegli le tue carte, tocca <b>Esegui immediatamente</b>, poi Avanti.</li>
          <li>Crea un nuovo comando vuoto e aggiungi l'azione <b>Testo</b>. Scrivi tre righe: <b>Importo</b>, <b>Esercente</b>, <b>Nome</b> della carta, ognuna presa dalle variabili dell'Input comando.</li>
          <li>Aggiungi <b>Ottieni contenuti dell'URL</b>, con l'indirizzo che copi qui sopra. Metodo <b>POST</b>.</li>
          <li>Intestazioni: <b>Authorization</b> = <code>Bearer</code> + spazio + il tuo token; <b>Accept</b> = <code>application/vnd.github+json</code>.</li>
          <li>Corpo della richiesta: <b>JSON</b>, con un campo di testo <b>body</b> e come valore la variabile <b>Testo</b>.</li>
        </ol></div>
      <button class="btn" data-act="inbox-test">Simula un pagamento per provare</button>`;
  }
  function setDati() {
    const n = S.spese.length;
    return `<div class="card"><div class="kv"><span class="k">Spese registrate</span><span class="v">${n}</span></div><div class="kv"><span class="k">Entrate extra</span><span class="v">${S.entrate.length}</span></div><div class="kv"><span class="k">Check</span><span class="v">${S.check.length}</span></div>${S.meta.importatoDa ? `<div class="kv"><span class="k">Importato da Scriptable</span><span class="v">${new Date(S.meta.importatoDa.il).toLocaleDateString("it-IT")}</span></div>` : ""}</div>
      <div class="card flush">
        <label class="row" for="imp-v4"><span class="av blue">${ic("upload", 18)}</span><div class="tx"><div class="t1">Importa da Spese Consapevoli</div><div class="t2">Il file dati.json di Scriptable (iCloud Drive → Scriptable → SpeseConsapevoli)</div></div><input id="imp-v4" type="file" accept=".json,application/json" hidden data-imp="v4"></label>
        <button class="row" data-act="csv"><span class="av">${ic("download", 18)}</span><div class="tx"><div class="t1">Esporta CSV</div><div class="t2">Spese, entrate e check, stesso formato dello script</div></div></button>
        <button class="row" data-act="backup"><span class="av">${ic("download", 18)}</span><div class="tx"><div class="t1">Scarica un backup completo</div><div class="t2">File .json da tenere su iCloud o Drive</div></div></button>
        <label class="row" for="imp-bk"><span class="av">${ic("upload", 18)}</span><div class="tx"><div class="t1">Ripristina un backup</div><div class="t2">Sostituisce i dati di questo dispositivo</div></div><input id="imp-bk" type="file" accept=".json,application/json" hidden data-imp="bk"></label>
      </div>
      <button class="btn dng" data-act="reset">${ic("trash", 18)} Cancella tutti i dati da questo dispositivo</button>`;
  }

  // ============================== AZIONI ==============================
  const ACT = {
    tab: d => go(d.v), settings: () => { sett = ""; render(); window.scrollTo(0, 0); },
    back: () => { if (tab === "report" && sett === null) go("mese"); else { sett = sett ? "" : null; render(); window.scrollTo(0, 0); } },
    sez: d => { sett = d.v; render(); window.scrollTo(0, 0); },
    hide: () => { L.nascondi = !L.nascondi; saveLocal(); render(); },
    spesa: () => sheetSpesa(), entrata: () => sheetEntrata(), rimborso: d => sheetSpesa({ rimborso: true, credito: d.credito }),
    fondo: () => sheetFondo(), viaggi: () => sheetViaggi(), annuali: () => sheetAnnuali(), livello: () => go("mese"),
    paga: () => sheetPaga(), check: () => sheetCheck(), recap: () => sheetRecap(), inbox: () => sheetInbox(),
    fissa: d => sheetFissa(d.id), cat: d => sheetCategoria(d.id),
    edit: d => sheetSpesa({ editId: d.id }), "entrata-edit": d => sheetEntrata(d.id),
    sf: d => { storicoFiltro.cat = d.v; storicoFiltro.n = 80; $$("[data-act=sf]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === d.v))); renderStoricoLista(); },
    more: () => { storicoFiltro.n += 80; renderStoricoLista(); },
    csv: () => esportaCSV(), backup: () => scarica(`spiccio-backup-${dk(new Date())}.json`, JSON.stringify(S), "application/json"),
    print: () => window.print(),
    tema: d => { L.tema = d.v; saveLocal(); render(); },
    copy: async d => { try { await navigator.clipboard.writeText(d.v); toast("Copiato", "", "ok"); } catch (e) { toast("Non riesco a copiare", d.v); } },
    "ed-add": d => { commit(S => S[d.l].push(SCHEMI[d.l].nuovo()), { config: true }); },
    "ed-del": d => { const r = S[d.l][+d.i]; conferma("Eliminare?", r.nome || r.pattern || r.mese || "", "Elimina", () => commit(S => S[d.l].splice(+d.i, 1), { config: true })); },
    "imp-del": d => commit(S => { delete S.imparate[d.k]; }, { config: true }),
    "cat-add": () => commit(S => S.categories.push({ id: uid("c"), nome: "Nuova categoria", icon: "tag", budget: 0, periodo: "libero", sub: [] }), { config: true }),
    "cat-del": d => { const c = S.categories[+d.i]; const n = S.spese.filter(x => x.cat === c.id).length; if (n) { toast("Non si può eliminare", `${c.nome} ha ${n} spese registrate. Cambiale categoria o mettila senza budget.`, "warn"); return; } conferma("Eliminare la categoria?", c.nome, "Elimina", () => commit(S => S.categories.splice(+d.i, 1), { config: true })); },
    "cat-icon": d => commit(S => { S.categories[+d.i].icon = d.v; }, { config: true }),
    "sync-save": async () => { L.token = $("#s-token").value.trim(); L.gistId = $("#s-gist").value.trim(); L.syncErr = null; saveLocal(); if (!L.token) { render(); return; } if (!L.gistId) await creaGist(); await sync(true); },
    "sync-now": () => sync(true),
    "push-on": () => { L.workerUrl = $("#p-url").value.trim().replace(/\/$/, ""); L.appKey = $("#p-key").value.trim(); saveLocal(); attivaPush(); },
    "push-test": () => provaPush(),
    "inbox-test": () => { commit(S => S.inbox.push(touch({ id: uid("ib"), ts: new Date().toISOString(), importo: 3.2, esercente: "Bar Lambrate (prova)", carta: "Revolut" }))); toast("Pagamento di prova aggiunto", "Lo trovi in Home.", "ok"); },
    reset: () => conferma("Cancellare tutto?", "Cancello i dati da questo dispositivo. Il Gist su GitHub resta com'è.", "Cancella", () => { localStorage.removeItem(KEY); location.reload(); }),
  };
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const fn = ACT[t.dataset.act]; if (!fn) return;
    e.preventDefault(); fn(t.dataset, t);
  });
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.matches("[data-ed], [data-cat]")) onEditorChange(el);
    if (el.matches("[data-imp]")) importaFile(el);
  });

  // ============================ IMPORT/EXPORT =========================
  function scarica(nome, testo, tipo) {
    const blob = new Blob([testo], { type: tipo });
    const file = new File([blob], nome, { type: tipo });
    if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file], title: nome }).catch(() => {}); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function esportaCSV() {
    const q = s => String(s ?? "").replace(/;/g, ",").replace(/\n/g, " ");
    const righe = ["data;importo;categoria;sottocategoria;nota;metodo;tipo;motivo"];
    S.spese.forEach(x => righe.push([dk(new Date(x.ts)), num(x.importo), q(K.catNome(x.cat)), q(x.sub), q(x.nota), q(x.metodo), x.tipo || "spesa", q(x.motivo)].join(";")));
    S.entrate.forEach(x => righe.push([dk(new Date(x.ts)), num(x.importo), "Entrata extra", "", q(x.fonte), "", "entrata", `fondo ${num(x.fondo || 0)} / viaggi ${num(x.viaggi || 0)} / annuali ${num(x.annuali || 0)} / libera ${num(x.libero || 0)}`].join(";")));
    S.check.forEach(c => S.checkVoci.forEach(v => righe.push([dk(new Date(c.ts)), num(K.inserito(c, v) ?? 0), "Check risparmi", "", q(v.nome), "", "check", ""].join(";"))));
    scarica(`spiccio-${dk(new Date())}.csv`, "﻿" + righe.join("\n"), "text/csv");
  }
  function importaFile(el) {
    const file = el.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let d; try { d = JSON.parse(r.result); } catch (e) { toast("File non valido", "Non è un JSON leggibile.", "bad"); return; }
      if (el.dataset.imp === "bk") {
        if (!d.schema || !Array.isArray(d.spese)) { toast("Non è un backup di Spiccio", "", "bad"); return; }
        conferma("Ripristinare il backup?", `Contiene ${d.spese.length} spese. Sostituisce i dati di questo dispositivo.`, "Ripristina", () => { S = Core.normalizza(d); saveData(); K = Core.make(S); render(); queueSync(); toast("Backup ripristinato", "", "ok"); });
      } else {
        if (!Array.isArray(d.spese)) { toast("Non sembra il dati.json dello script", "Manca l'elenco delle spese.", "bad"); return; }
        const doImport = () => {
          const keepCfg = S && S.spese.length === 0 ? S : null;
          const base = Core.defaults(); if (keepCfg) for (const k of ["settings", "categories", "fisse", "annualiDef", "livelli", "mesiSpeciali", "checkVoci", "debiti", "regole"]) base[k] = keepCfg[k];
          S = Core.daScriptable(d, base); S.settingsU = Date.now();
          saveData(); K = Core.make(S); closeAll(); go("home"); queueSync();
          toast("Import completato", `${S.spese.length} spese, ${S.entrate.length} entrate, ${S.check.length} check.`, "ok");
        };
        if (S && S.spese.length) conferma("Sostituire i dati?", `Hai già ${S.spese.length} spese qui. L'import le sostituisce con le ${d.spese.length} dello script.`, "Importa", doImport); else doImport();
      }
      el.value = "";
    };
    r.readAsText(file);
  }

  // ============================== SYNC ================================
  let syncing = false, syncTimer = null;
  const GH = "https://api.github.com";
  async function gh(path, opts = {}) {
    const res = await fetch(GH + path, { ...opts, headers: { Authorization: `Bearer ${L.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
    if (!res.ok && res.status !== 204) {
      const msg = res.status === 401 ? "token non valido" : res.status === 404 ? "Gist non trovato" : res.status === 403 ? "accesso negato o limite raggiunto" : `errore ${res.status}`;
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return res.status === 204 ? null : res.json();
  }
  async function creaGist() {
    try {
      const g = await gh("/gists", { method: "POST", body: JSON.stringify({ description: "Spiccio — dati personali (non modificare a mano)", public: false, files: { "spiccio.json": { content: JSON.stringify(S) } } }) });
      L.gistId = g.id; saveLocal(); toast("Gist creato", "I dati ora sono anche su GitHub.", "ok");
    } catch (e) { L.syncErr = e.message; saveLocal(); toast("Non riesco a creare il Gist", e.message, "bad"); render(); }
  }
  function queueSync() { if (!L.token || !L.gistId) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 2500); }
  function parseInbox(c) {
    const body = (c.body || "").trim();
    let importo, esercente = "", carta = "";
    try { const j = JSON.parse(body); importo = parseAmount(j.importo ?? j.amount); esercente = j.esercente ?? j.merchant ?? ""; carta = j.carta ?? j.card ?? ""; }
    catch (e) { const r = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean); importo = parseAmount(r[0]); esercente = r[1] || ""; carta = r[2] || ""; }
    if (!(Math.abs(importo) > 0)) return null;
    return { id: "gc_" + c.id, ts: c.created_at, importo: Math.abs(importo), esercente: String(esercente).slice(0, 120), carta: String(carta).slice(0, 60), u: Date.parse(c.created_at) };
  }
  async function sync(manuale) {
    if (!L.token || !L.gistId || syncing) return;
    if (!navigator.onLine) { if (manuale) toast("Sei offline", "Sincronizzo appena torna la rete.", "warn"); return; }
    syncing = true; if (manuale) render();
    try {
      const g = await gh(`/gists/${L.gistId}`);
      let remote = null; const f = g.files?.["spiccio.json"];
      if (f) { let txt = f.content; if (f.truncated) txt = await (await fetch(f.raw_url)).text(); try { remote = txt ? JSON.parse(txt) : null; } catch (e) { remote = null; } }
      let merged = Core.normalizza(Core.merge(S, remote ? Core.normalizza(remote) : null));
      // pagamenti arrivati dal Wallet come commenti del Gist
      let commenti = [];
      if (g.comments > 0) commenti = await gh(`/gists/${L.gistId}/comments?per_page=100`);
      let nuovi = 0;
      for (const c of commenti) { const it = parseInbox(c); if (it && !merged.deleted[it.id] && !merged.inbox.some(x => x.id === it.id) && !merged.spese.some(x => x.daInbox === it.id)) { merged.inbox.push(it); nuovi++; } }
      merged.meta.updatedAt = new Date().toISOString();
      await gh(`/gists/${L.gistId}`, { method: "PATCH", body: JSON.stringify({ files: { "spiccio.json": { content: JSON.stringify(merged) } } }) });
      for (const c of commenti) { try { await gh(`/gists/${L.gistId}/comments/${c.id}`, { method: "DELETE" }); } catch (e) {} }
      S = merged; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      K = Core.make(S);
      L.lastSync = Date.now(); L.syncErr = null; saveLocal();
      if (nuovi) toast(plural(nuovi, "pagamento nuovo dal Wallet", "pagamenti nuovi dal Wallet"), "Sistemali dalla Home.", "ok");
      else if (manuale) toast("Sincronizzato", "", "ok");
      queueSchedule();
    } catch (e) {
      L.syncErr = e.message; saveLocal();
      if (manuale) toast("Sincronizzazione non riuscita", e.message, "bad");
    } finally { syncing = false; if (!sheets.length || manuale) safeRender(); }
  }

  // ============================== PUSH ================================
  let schedTimer = null;
  function queueSchedule() { if (!L.pushOn || !L.workerUrl) return; clearTimeout(schedTimer); schedTimer = setTimeout(inviaPromemoria, 4000); }
  async function worker(path, body) {
    const r = await fetch(L.workerUrl + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-App-Key": L.appKey }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status === 401 ? "chiave dell'app sbagliata" : `errore ${r.status}`);
    return r.json();
  }
  const b64u = s => { const p = "=".repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  async function attivaPush() {
    if (!L.workerUrl || !L.appKey) { toast("Mancano i dati", "Scrivi indirizzo del servizio e chiave.", "warn"); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { toast("Notifiche non disponibili", "Su iPhone apri Spiccio dall'icona sulla Home (iOS 16.4 o successivo).", "warn"); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Notifiche non autorizzate", "Puoi attivarle da Impostazioni iPhone → Notifiche → Spiccio.", "warn"); return; }
      const { publicKey } = await worker("/vapid");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub) { try { await sub.unsubscribe(); } catch (e) {} }
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(publicKey) });
      await worker("/subscribe", { subscription: sub.toJSON() });
      L.pushOn = true; L.schedHash = ""; saveLocal();
      await inviaPromemoria();
      toast("Notifiche attive", "Riceverai i promemoria all'ora giusta.", "ok"); render();
    } catch (e) { toast("Non riesco ad attivarle", e.message, "bad"); }
  }
  async function inviaPromemoria() {
    if (!L.pushOn || !L.workerUrl) return;
    const list = K.promemoria(60);
    const h = String(list.length) + list.map(p => p.id + p.at + p.body).join("").length + "_" + (list[0]?.id || "") + (list.at(-1)?.id || "");
    if (h === L.schedHash && Date.now() - L.schedAt < 6 * 3600e3) return;
    try { await worker("/schedule", { reminders: list }); L.schedHash = h; L.schedAt = Date.now(); saveLocal(); } catch (e) {}
  }
  async function provaPush() { try { await worker("/test", {}); toast("Inviata", "Dovrebbe arrivare tra pochi secondi.", "ok"); } catch (e) { toast("Prova non riuscita", e.message, "bad"); } }

  // ============================== AVVIO ===============================
  function primoAvvio() {
    openSheet({
      title: "Benvenuto in Spiccio",
      body: `<p class="note" style="font-size:15px;color:var(--fg)">Da dove partiamo?</p>
        <label class="todo hot" for="ob-v4"><span class="row" style="padding:0;min-height:0;width:auto"><span class="av blue">${ic("upload")}</span></span><div class="tx"><div class="t1">Importo i dati di Spese Consapevoli</div><div class="t2">Scegli dati.json da iCloud Drive → Scriptable → SpeseConsapevoli</div></div><input id="ob-v4" type="file" accept=".json,application/json" hidden data-imp="v4"></label>
        <button class="todo" data-ob="gist"><span class="row" style="padding:0;min-height:0;width:auto"><span class="av">${ic("sync")}</span></span><div class="tx"><div class="t1">Ho già Spiccio su un altro dispositivo</div><div class="t2">Collego il Gist e scarico i dati</div></div></button>
        <button class="todo" data-ob="zero"><span class="row" style="padding:0;min-height:0;width:auto"><span class="av">${ic("plus")}</span></span><div class="tx"><div class="t1">Parto da zero</div><div class="t2">Con le tue categorie, fisse e annuali già impostate</div></div></button>`,
      onMount: (sh, close) => sh.addEventListener("click", e => {
        const b = e.target.closest("[data-ob]"); if (!b) return;
        S = S || Core.defaults(); K = Core.make(S); if (S.lastPayday === null) S.lastPayday = K.cicloKey(); saveData(); K = Core.make(S); close();
        if (b.dataset.ob === "gist") { sett = "sync"; render(); } else render();
      }),
    });
  }
  function avvio() {
    loadAll();
    const nuovo = !S;
    if (!S) S = Core.defaults();
    K = Core.make(S);
    if (S.lastPayday === null && !nuovo) { S.lastPayday = K.pianoAttivo() ? "" : K.cicloKey(); saveData(); }
    const sbl = K.sbloccaFasi();
    const avv = K.avvisiAvvio();
    if (sbl.length || avv.length) saveData();
    render();
    sbl.forEach(f => toast(`🔓 ${f.nome} sbloccato!`, `Dal prossimo giorno di paga ${eur(f.fondo)} al mese nel fondo.`, "ok"));
    avv.forEach(a => toast(a.titolo, a.testo, "ok"));
    if (nuovo) primoAvvio();
    // apertura da notifica
    const v = new URLSearchParams(location.search).get("v");
    if (v && !nuovo) { history.replaceState(null, "", location.pathname); const map = { paga: sheetPaga, check: sheetCheck, recap: sheetRecap, mese: () => go("mese"), inbox: sheetInbox }; setTimeout(() => map[v]?.(), 300); }
    if (L.token && L.gistId) sync(false);
    queueSchedule();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { K = Core.make(S); if (!sheets.length) safeRender(); if (L.token && L.gistId && Date.now() - (L.lastSync || 0) > 30e3) sync(false); } });
    window.addEventListener("online", () => queueSync());
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  window.addEventListener("DOMContentLoaded", avvio);
  window.__spiccio = { get S() { return S; }, get K() { return K; } };
})();
