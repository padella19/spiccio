// =====================================================================
//  SPICCIO — cuore dei calcoli
//  Porting fedele di "Spese Consapevoli v4.0" (Scriptable), con dati
//  e regole modificabili dall'app. Nessuna dipendenza dal DOM.
// =====================================================================
(function (root) {
  "use strict";

  const SCHEMA = 1;
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const GIORNI = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];

  // ------------------------- VALORI INIZIALI -------------------------
  function defaults() {
    return {
      schema: SCHEMA,
      settingsU: 0,
      settings: {
        stipendioNetto: 1918,
        giornoStipendio: 10,
        riportaSforamento: true,
        fondoPerGiorno: 5,
        inizioPiano: "2026-09",
        viaggiMensile: 100,
        meseTredicesima: 12,
        quotaTredicesima: 0.5,
        ripartizioneExtra: { fondo: 0.5, viaggi: 0.2, libero: 0.3 },
        budgetQuasiFinito: 0.20,
        fondoSoglia: 500,
        fondoObiettivoMesi: 3,
        preavvisoFisseVariabili: 3,
        preavvisoAnnuali: 14,
        streakAvviso: 3,
        contoDeposito: "Conto Deposito",
        oraCheck: 10,
        oraSerale: 21,
        metodi: ["Carta principale", "Revolut", "Contanti"],
        metodoPaghetta: "Revolut",
        tema: "scuro",
      },
      categories: [
        { id: "bar",          nome: "Bar e caffè",         icon: "coffee",   budget: 15,    periodo: "settimana", sub: ["Caffè", "Colazione", "Bevande e snack"] },
        { id: "aperitivo",    nome: "Aperitivi e cene",    icon: "glass",    budget: 100,   periodo: "settimana", daLivello: true, sub: ["Aperitivo", "Cena fuori", "Pranzo fuori", "Delivery", "Pub e serata"] },
        { id: "sigarette",    nome: "Sigarette",           icon: "smoke",    budget: 40.60, periodo: "settimana", sub: ["Sigarette", "Accessori"] },
        { id: "palestra",     nome: "Palestra",            icon: "dumbbell", budget: 30,    periodo: "settimana", sub: ["Abbonamento", "Ingresso singolo", "Integratori", "Abbigliamento sportivo"] },
        { id: "spesa",        nome: "Spesa alimentare",    icon: "cart",     budget: 130,   periodo: "mese",      sub: ["Supermercato", "Mercato e ortofrutta", "Panetteria", "Spesa online"] },
        { id: "cura",         nome: "Cura personale",      icon: "scissors", budget: 30,    periodo: "mese",      sub: ["Barbiere", "Prodotti per la cura", "Estetista"] },
        { id: "carburante",   nome: "Carburante",          icon: "fuel",     budget: 25,    periodo: "mese",      sub: ["Benzina", "Autostrada", "Parcheggio"] },
        { id: "imprevisti",   nome: "Imprevisti e salute", icon: "pulse",    budget: 40,    periodo: "mese",      sub: ["Farmacia", "Visite mediche", "Trasporti extra", "Officina e riparazioni", "Multe", "Altro imprevisto"] },
        { id: "viaggi",       nome: "Viaggi",              icon: "plane",    budget: 0,     periodo: "fondo",     sub: ["Voli", "Treni", "Alloggio", "Attività e biglietti", "Spese sul posto"] },
        { id: "casa",         nome: "Casa",                icon: "home",     budget: 0,     periodo: "libero",    sub: ["Manutenzione", "Arredamento", "Pulizia", "Piante e balcone"] },
        { id: "regali",       nome: "Regali",              icon: "gift",     budget: 0,     periodo: "libero",    sub: ["Compleanni", "Natale", "Ricorrenze", "Donazioni"] },
        { id: "abbigliamento",nome: "Abbigliamento",       icon: "shirt",    budget: 0,     periodo: "libero",    sub: ["Vestiti", "Scarpe", "Accessori"] },
      ],
      fisse: [
        { id: "f_apple",   nome: "Apple Music",          importo: 10.99, giorno: 4 },
        { id: "f_claude",  nome: "Claude Pro",           importo: 22,    giorno: 4 },
        { id: "f_findo",   nome: "Findomestic (iPhone)", importo: 46.20, giorno: 6, fine: "2026-12" },
        { id: "f_pac",     nome: "PAC BlackRock",        importo: 100,   giorno: 7, pac: true },
        { id: "f_atm",     nome: "ATM (abbonamento)",    importo: 39,    giorno: 15, inizio: "2026-11" },
        { id: "f_auto",    nome: "Auto (metà rata)",     importo: 125,   giorno: 17 },
        { id: "f_google",  nome: "Google One",           importo: 1.99,  giorno: 20 },
        { id: "f_mutuo",   nome: "Mutuo (tua quota)",    importo: 600,   giorno: 25 },
        { id: "f_fastweb", nome: "Fastweb",              importo: 33.90, giorno: 25 },
        { id: "f_hera",    nome: "Hera",                 importo: 80,    giorno: 29, variabile: true },
        { id: "f_canone",  nome: "Canone conto",         importo: 2,     giorno: 31 },
      ],
      annualiDef: [
        { id: "a_assic",  nome: "Assicurazione scooter",  importo: 331, mesi: [4, 10],    giorno: 10 },
        { id: "a_bollo",  nome: "Bollo scooter",          importo: 18,  mesi: [4],        giorno: 30 },
        { id: "a_inter",  nome: "Inter (abbonamento)",    importo: 350, mesi: [7],        giorno: 10 },
        { id: "a_denti",  nome: "Pulizia denti",          importo: 142, mesi: [3, 7, 11], giorno: 20, inizio: "2026-12" },
        { id: "a_manut",  nome: "Manutenzione auto/moto", importo: 100, mesi: [5],        giorno: 10 },
      ],
      livelli: [
        { id: "l1", da: "2026-09", nome: "Livello 1", fondo: 0,     uscite: 100,   nota: "pareggio: al fondo vanno solo gli avanzi" },
        { id: "l2", da: "2027-01", nome: "Livello 2", fondo: 46.20, uscite: 100,   nota: "la ex rata Findomestic va al fondo" },
        { id: "l3", da: "2027-04", nome: "Livello 3", fondo: 150,   uscite: 76.60, nota: "150 € al mese nel fondo", serieRichiesta: 4 },
      ],
      mesiSpeciali: [
        { id: "ms1", mese: "2026-09", chiave: "salvadanaio", valore: 0,  nota: "primo mese del piano: rata salvadanaio sospesa" },
        { id: "ms2", mese: "2026-10", chiave: "aperitivo",   valore: 58, nota: "rata assicurazione scooter non coperta dal salvadanaio" },
        { id: "ms3", mese: "2026-10", chiave: "viaggi",      valore: 0,  nota: "rata assicurazione scooter non coperta dal salvadanaio" },
        { id: "ms4", mese: "2026-10", chiave: "salvadanaio", valore: 0,  nota: "rata assicurazione scooter non coperta dal salvadanaio" },
      ],
      checkVoci: [
        { id: "fondi",   nome: "Fondi investimento", tipo: "saldo", liquido: true,  iniziale: 40154, alias: ["Fondi investimento"] },
        { id: "affitto", nome: "Affitto BST12",      tipo: "saldo", liquido: true,  iniziale: 12236, alias: ["Affitto BST12"] },
        { id: "tfr",     nome: "TFR (fondo Amundi)", tipo: "saldo", liquido: false, iniziale: 15391, alias: ["TRF"] },
      ],
      debiti: [],
      regole: [
        { id: "r1", pattern: "dojo|ruan|palestra|gym|virgin|fit\\b", cat: "palestra" },
        { id: "r2", pattern: "tabac|tabacch|smoker|rivendita", cat: "sigarette" },
        { id: "r3", pattern: "esselunga|unes|carrefour|lidl|\\bcoop\\b|conad|\\bpam\\b|mercadona|eurospin|ortofrutt|panific", cat: "spesa" },
        { id: "r4", pattern: "ticket atm|\\batm\\b|trenitalia|italo|taxi|uber", cat: "imprevisti", sub: "Trasporti extra" },
        { id: "r5", pattern: "esso|\\beni\\b|tamoil|\\bq8\\b|moeve|\\bip\\b", cat: "carburante", sub: "Benzina" },
        { id: "r6", pattern: "autostrad|telepass", cat: "carburante", sub: "Autostrada" },
        { id: "r7", pattern: "just ?eat|deliveroo|glovo", cat: "aperitivo", sub: "Delivery" },
        { id: "r8", pattern: "pizz|ristor|trattoria|sushi|tapas|osteria|buffet", cat: "aperitivo", sub: "Cena fuori" },
        { id: "r9", pattern: "birr|chiringuito|\\bpub\\b|twain", cat: "aperitivo", sub: "Pub e serata" },
        { id: "r10", pattern: "brioche|cornetto|colazione|starbucks|caff|cafe|\\bbar\\b|pasticc|autogrill|paul", cat: "bar" },
        { id: "r11", pattern: "ryanair|easyjet|volotea|wizz|vueling", cat: "viaggi", sub: "Voli" },
        { id: "r12", pattern: "booking|airbnb", cat: "viaggi", sub: "Alloggio" },
        { id: "r13", pattern: "farmacia", cat: "imprevisti", sub: "Farmacia" },
        { id: "r14", pattern: "dott|dr\\.|medic", cat: "imprevisti", sub: "Visite mediche" },
        { id: "r15", pattern: "officina|gommista", cat: "imprevisti", sub: "Officina e riparazioni" },
        { id: "r16", pattern: "parrucch|barbier|estetist|salone", cat: "cura" },
        { id: "r17", pattern: "ikea|leroy|brico|obi\\b", cat: "casa" },
        { id: "r18", pattern: "zara|h&m|uniqlo|decathlon|nike|adidas|primark|ovs", cat: "abbigliamento" },
      ],
      imparate: {},
      spese: [], evitate: [], fondo: [], annuali: [], viaggiFondo: [], entrate: [], check: [], inbox: [], crediti: [],
      salvadanaioSaltato: {}, stipendi: {}, fissePagate: {}, fasiSbloccate: {}, notifiche: {},
      lastRecap: null, lastPayday: null,
      deleted: {},
      meta: { createdAt: new Date().toISOString(), updatedAt: null, importatoDa: null },
    };
  }

  // ----------------------------- UTILITY ------------------------------
  const pad = n => String(n).padStart(2, "0");
  const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dm = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const r2 = v => Math.round(v * 100) / 100;
  const eur = v => (v < 0 ? "−" : "") + Math.abs(r2(v)).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const eur0 = v => (v < 0 ? "−" : "") + Math.round(Math.abs(v)).toLocaleString("it-IT") + " €";
  const num = v => String(r2(v)).replace(".", ",");
  const somma = (arr, f = x => x.importo) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const uid = p => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const inRange = (x, s, e) => { const t = new Date(x.ts); return t >= s && t < e; };

  function parseAmount(v) {
    if (typeof v === "number") return v;
    if (v == null) return NaN;
    let s = String(v).replace(/[^\d,.\-]/g, "");
    if (s.includes(",") && s.includes(".")) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else s = s.replace(",", ".");
    return parseFloat(s);
  }

  // Tutte le funzioni che seguono lavorano su uno stato S passato a `make(S)`.
  function make(S) {
    const C = S.settings;
    const cat = id => S.categories.find(c => c.id === id);
    const catNome = id => cat(id)?.nome || id;

    // ------------------------------ PERIODI ---------------------------
    function weekStart(d) {
      const x = new Date(d); x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return x;
    }
    function monthStart(d) {
      const x = new Date(d); x.setHours(0, 0, 0, 0);
      if (x.getDate() < C.giornoStipendio) x.setMonth(x.getMonth() - 1);
      x.setDate(C.giornoStipendio);
      return x;
    }
    function periodRange(periodo, d = new Date()) {
      const s = periodo === "settimana" ? weekStart(d) : monthStart(d);
      const e = new Date(s);
      if (periodo === "settimana") e.setDate(e.getDate() + 7); else e.setMonth(e.getMonth() + 1);
      return [s, e];
    }
    function daysLeft(periodo, d = new Date()) {
      const [, e] = periodRange(periodo, d);
      const oggi = new Date(d); oggi.setHours(0, 0, 0, 0);
      return Math.max(1, Math.round((e - oggi) / 86400000));
    }
    const giorniCiclo = (d = new Date()) => { const [s, e] = periodRange("mese", d); return Math.round((e - s) / 86400000); };
    const cicloKey = (d = new Date()) => dk(monthStart(d));
    const meseKey = (d = new Date()) => cicloKey(d).slice(0, 7);
    const pianoAttivo = (d = new Date()) => meseKey(d) >= C.inizioPiano;
    function meseSpeciale(d = new Date()) {
      const mk = meseKey(d);
      const righe = S.mesiSpeciali.filter(r => r.mese === mk);
      if (!righe.length) return null;
      const o = { nota: [...new Set(righe.map(r => r.nota).filter(Boolean))].join(" · ") };
      righe.forEach(r => { o[r.chiave] = r.chiave === "pausaPAC" ? !!r.valore : Number(r.valore); });
      return o;
    }
    const cicloDelPagamento = (x, p) => ((x.giorno ?? C.giornoStipendio) >= C.giornoStipendio ? p : (p + 10) % 12 + 1);

    // --------------------------- SPESE E BUDGET -----------------------
    const netto = x => x.importo - (x.bonus || 0);
    const speseVive = () => S.spese;
    const spentCat = (catId, s, e) => somma(speseVive().filter(x => x.cat === catId && inRange(x, s, e)), netto);
    const catLivello = () => S.categories.find(c => c.daLivello) || cat("aperitivo");

    function streak(soglia = null, d0 = new Date()) {
      const cl = catLivello(); if (!cl) return 0;
      const pos = S.spese.filter(x => x.importo > 0);
      if (!pos.length) return 0;
      const primo = weekStart(new Date(Math.min(...pos.map(x => +new Date(x.ts)))));
      let n = 0, d = weekStart(d0);
      for (let i = 0; i < 52; i++) {
        d = new Date(d); d.setDate(d.getDate() - 7);
        if (d < primo) break;
        const e = new Date(d); e.setDate(e.getDate() + 7);
        const lim = soglia ?? budgetEff(cl.id, d);
        if (spentCat(cl.id, d, e) <= lim) n++; else break;
      }
      return n;
    }
    function faseAttiva(d = new Date()) {
      const mk = meseKey(d);
      const fasi = S.livelli.filter(f => f.da <= mk);
      if (!fasi.length) return S.livelli[0] || { nome: "—", fondo: 0, uscite: catLivello()?.budget || 0, nota: "" };
      for (let i = fasi.length - 1; i >= 0; i--) {
        const f = fasi[i];
        if (!f.serieRichiesta || S.fasiSbloccate[f.da]) return f;
      }
      return fasi[0];
    }
    function sbloccaFasi() {
      const mk = meseKey(), out = [];
      for (const f of S.livelli) {
        if (f.da <= mk && f.serieRichiesta && !S.fasiSbloccate[f.da] && streak(f.uscite) >= f.serieRichiesta) {
          S.fasiSbloccate[f.da] = true; out.push(f);
        }
      }
      return out;
    }
    function faseBloccata(d = new Date()) {
      const mk = meseKey(d), att = faseAttiva(d);
      return S.livelli.find(f => f.da <= mk && f.serieRichiesta && !S.fasiSbloccate[f.da] && S.livelli.indexOf(f) > S.livelli.indexOf(att)) || null;
    }
    function prossimoLivello(d = new Date()) {
      const att = faseAttiva(d), i = S.livelli.indexOf(att);
      return S.livelli[i + 1] || null;
    }
    function budgetBase(catId, d = new Date()) {
      const c = cat(catId); if (!c) return 0;
      const sp = meseSpeciale(d);
      if (sp && sp[catId] !== undefined && c.periodo !== "fondo") return sp[catId];
      if (c.daLivello) return faseAttiva(d).uscite;
      return Number(c.budget) || 0;
    }
    function budgetEff(catId, d = new Date()) {
      const c = cat(catId); if (!c) return 0;
      const base = budgetBase(catId, d);
      if (!C.riportaSforamento || c.periodo === "fondo" || c.periodo === "libero") return base;
      const [s] = periodRange(c.periodo, d);
      const prev = new Date(s); prev.setDate(prev.getDate() - 1);
      const [ps, pe] = periodRange(c.periodo, prev);
      const debito = Math.max(0, spentCat(catId, ps, pe) - budgetBase(catId, prev));
      return Math.max(0, base - debito);
    }
    function statoCategoria(catId, d = new Date()) {
      const c = cat(catId);
      if (c.periodo === "fondo") { const saldo = saldoViaggi(); return { c, saldo, periodo: "fondo" }; }
      const per = c.periodo === "libero" ? "mese" : c.periodo;
      const [s, e] = periodRange(per, d);
      const speso = spentCat(catId, s, e);
      if (c.periodo === "libero") return { c, speso, periodo: "libero", s, e };
      const budget = budgetEff(catId, d), base = budgetBase(catId, d);
      const resto = budget - speso, gg = daysLeft(per, d);
      return { c, speso, budget, base, resto, gg, perGiorno: Math.max(0, resto) / gg, periodo: c.periodo, s, e, ridotto: budget < base };
    }
    const catSettimanali = () => S.categories.filter(c => c.periodo === "settimana");
    const catMensili = () => S.categories.filter(c => c.periodo === "mese");
    function paghetta(d = new Date(), base = false) {
      return catSettimanali().reduce((a, c) => a + (base ? budgetBase(c.id, d) : budgetEff(c.id, d)), 0);
    }
    function settimana(d = new Date()) {
      const righe = catSettimanali().map(c => statoCategoria(c.id, d));
      const resto = somma(righe, r => Math.max(0, r.resto));
      const budget = somma(righe, r => r.budget), speso = somma(righe, r => r.speso);
      const gg = daysLeft("settimana", d);
      return { righe, resto, budget, speso, gg, oggi: resto / gg };
    }

    // ---------------------------- SPESE FISSE -------------------------
    function scadenzaFissa(f, d = new Date()) {
      const s = monthStart(d);
      const x = new Date(s.getFullYear(), s.getMonth() + (f.giorno >= C.giornoStipendio ? 0 : 1), 1);
      const ultimo = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
      x.setDate(Math.min(f.giorno, ultimo));
      return x;
    }
    function fissaAttiva(f, d = new Date()) {
      if (f.pac && meseSpeciale(d)?.pausaPAC) return false;
      if (f.inizio && meseKey(d) < f.inizio) return false;
      if (!f.fine) return true;
      const [y, m] = f.fine.split("-").map(Number);
      return scadenzaFissa(f, d) < new Date(y, m, 1);
    }
    function rateRimanenti(f) {
      if (!f.fine) return null;
      const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      const [y, m] = f.fine.split("-").map(Number), limite = new Date(y, m, 1);
      let n = 0, d = new Date();
      for (let i = 0; i < 360; i++) {
        const sc = scadenzaFissa(f, d);
        if (sc >= limite) break;
        if (sc >= oggi && fissaAttiva(f, d)) n++;
        d = new Date(periodRange("mese", d)[1]);
      }
      return n;
    }
    function fisseCiclo(d = new Date()) {
      const pagate = S.fissePagate[cicloKey(d)] || {};
      return S.fisse.filter(f => fissaAttiva(f, d)).map(f => ({ ...f, data: scadenzaFissa(f, d), reale: pagate[f.nome] }));
    }
    const importoFissa = f => f.reale ?? f.importo;
    const totFisse = d => somma(fisseCiclo(d), importoFissa);
    const stipendioCiclo = (d = new Date()) => S.stipendi[cicloKey(d)] ?? C.stipendioNetto;
    function prossimeFisse(giorni = 7, d0 = new Date()) {
      const oggi = new Date(d0); oggi.setHours(0, 0, 0, 0);
      const lim = new Date(oggi); lim.setDate(lim.getDate() + giorni);
      const seen = new Set();
      return [...fisseCiclo(d0), ...fisseCiclo(periodRange("mese", d0)[1])]
        .filter(f => f.data >= oggi && f.data < lim)
        .filter(f => { const k = f.id + dk(f.data); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.data - b.data);
    }
    function fisseVariabiliDaConfermare() {
      const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      return fisseCiclo().filter(f => {
        if (!f.variabile || f.reale !== undefined) return false;
        const pre = new Date(f.data); pre.setDate(pre.getDate() - C.preavvisoFisseVariabili);
        return oggi >= pre;
      });
    }

    // ------------------------ SALVADANAI E FONDO ----------------------
    const fondoTot = () => somma(S.fondo);
    const bonusDisponibile = () => somma(S.entrate, x => x.libero || 0) - somma(S.spese, x => x.bonus || 0);
    const entrateCiclo = (d = new Date()) => { const [s, e] = periodRange("mese", d); return S.entrate.filter(x => inRange(x, s, e)); };
    const salvadanaio = () => somma(S.annuali);
    const saldoViaggi = (fino = null) =>
      somma(S.viaggiFondo.filter(x => !fino || new Date(x.ts) <= fino))
      - somma(S.spese.filter(x => x.cat === "viaggi" && (!fino || new Date(x.ts) <= fino)), netto);
    function versamentoViaggi(d = new Date()) {
      if (!pianoAttivo(d)) return 0;
      const sp = meseSpeciale(d);
      return sp && sp.viaggi !== undefined ? sp.viaggi : C.viaggiMensile;
    }
    function annualiAttivi(d = new Date()) {
      const mk = meseKey(d);
      return S.annualiDef.filter(a => !a.inizio || mk >= a.inizio);
    }
    function pianoSalvadanaio(d = new Date(), saldoForzato = null) {
      const [s, e] = periodRange("mese", d);
      const m0 = s.getMonth() + 1;
      const mov = somma(S.annuali.filter(v => inRange(v, s, e)));
      const versati = somma(S.annuali.filter(v => v.importo > 0 && inRange(v, s, e)));
      const saldoInizio = saldoForzato ?? (salvadanaio() - mov);
      const eventi = [];
      annualiAttivi(d).forEach(x => x.mesi.forEach(p => {
        const k = (cicloDelPagamento(x, p) - m0 + 12) % 12;
        eventi.push({ k, x });
        if (k === 0) eventi.push({ k: 12, x });
      }));
      const ora = eventi.filter(ev => ev.k === 0);
      const oraScadenza = somma(ora, ev => ev.x.importo);
      const coperto = Math.min(Math.max(0, saldoInizio), oraScadenza);
      const residuo = Math.max(0, saldoInizio - coperto);
      let cum = 0, rata = 0;
      for (const ev of eventi.filter(ev => ev.k > 0).sort((a, b) => a.k - b.k)) {
        cum += ev.x.importo;
        rata = Math.max(rata, (cum - residuo) / ev.k);
      }
      rata = Math.ceil(rata * 100) / 100;
      const sp = meseSpeciale(d);
      let saltato = null;
      if (!pianoAttivo(d)) rata = 0;
      else if (S.salvadanaioSaltato?.[cicloKey(d)]) { rata = 0; saltato = "scelta tua il giorno di paga"; }
      else if (sp && sp.salvadanaio !== undefined) { rata = sp.salvadanaio; if (rata === 0) saltato = "mese speciale"; }
      return {
        saltato, rata, daVersare: Math.max(0, r2(rata - versati)),
        oraScadenza, coperto, scoperto: oraScadenza - coperto, vociOra: ora.map(ev => ev.x.nome), residuo,
      };
    }
    function rataSeSalti(d = new Date()) {
      const p = pianoSalvadanaio(d);
      return pianoSalvadanaio(periodRange("mese", d)[1], p.residuo).rata;
    }
    function fondoDelMese(d = new Date()) {
      if (!pianoAttivo(d)) return { importo: 0, nota: `il piano parte il ${C.giornoStipendio}/${C.inizioPiano.slice(5)}/${C.inizioPiano.slice(0, 4)}` };
      const f = faseAttiva(d), b = faseBloccata(d);
      let nota = `${f.nome}: ${f.nota || ""}`;
      if (b) nota += ` · il ${b.nome} si sblocca con ${b.serieRichiesta} settimane di fila sotto ${eur(b.uscite)} (ora ${streak(b.uscite)})`;
      return { importo: Number(f.fondo) || 0, nota, fase: f };
    }
    function budgetVariabiliCiclo(d = new Date()) {
      const gg = giorniCiclo(d);
      return S.categories.reduce((a, c) =>
        a + (c.periodo === "settimana" ? budgetEff(c.id, d) * gg / 7 : c.periodo === "mese" ? budgetEff(c.id, d) : 0), 0);
    }
    function spesoVariabiliCiclo(d = new Date()) {
      const [s, e] = periodRange("mese", d);
      return somma(S.spese.filter(x => x.cat !== "viaggi" && inRange(x, s, e)), netto);
    }
    function contiDelMese(d = new Date()) {
      const stip = stipendioCiclo(d), fisse = totFisse(d);
      const piano = pianoSalvadanaio(d), fondo = fondoDelMese(d), viaggi = versamentoViaggi(d);
      const disponibile = stip - fisse - piano.rata - piano.scoperto - fondo.importo - viaggi;
      return { stip, fisse, piano, fondo, viaggi, disponibile, budgetVar: budgetVariabiliCiclo(d) };
    }
    function quadroMese(d = new Date()) {
      const oggi = new Date(d); oggi.setHours(0, 0, 0, 0);
      const [s, e] = periodRange("mese", d);
      const ggTot = giorniCiclo(d), ggPassati = Math.min(ggTot, Math.max(1, Math.round((oggi - s) / 86400000) + 1));
      const c = contiDelMese(d);
      const speso = spesoVariabiliCiclo(d);
      const proiezione = speso / ggPassati * ggTot;
      return { ...c, s, e, ggTot, ggPassati, speso, proiezione, esito: c.disponibile - proiezione, sp: meseSpeciale(d), entrate: entrateCiclo(d) };
    }
    const paydayInSospeso = () => pianoAttivo() && S.lastPayday !== null && S.lastPayday !== cicloKey();
    function obiettivoFondo() {
      const c = contiDelMese();
      const mensile = c.fisse + c.budgetVar;
      return Math.round(mensile * (C.fondoObiettivoMesi || 3) / 50) * 50;
    }

    // ----------------------------- CHECK -----------------------------
    const VOCI = () => S.checkVoci;
    const meseCivile = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    function sabatoCheck(y, m) {
      const d = new Date(y, m, 12, C.oraCheck, 0, 0);
      d.setDate(12 + ((6 - d.getDay() + 7) % 7));
      return d;
    }
    const storicoCheck = () => S.check.slice().sort((a, b) => a.mese < b.mese ? -1 : 1);
    const checkDelMese = (mk = meseCivile()) => S.check.find(c => c.mese === mk) || null;
    function checkInSospeso() {
      const ora = new Date(), sab = sabatoCheck(ora.getFullYear(), ora.getMonth());
      sab.setHours(0, 0, 0, 0);
      return ora >= sab && !checkDelMese();
    }
    function inserito(c, v) {
      for (const k of [v.id, v.nome, ...(v.alias || [])]) if (c.valori[k] !== undefined) return c.valori[k];
      return undefined;
    }
    function valoreVoce(v, c) {
      if (v.tipo === "accumulo") {
        const n2 = 1 - (v.quotaTasse || 0);
        return (v.iniziale || 0) + somma(storicoCheck().filter(x => x.mese <= c.mese), x => (inserito(x, v) || 0) * n2);
      }
      return inserito(c, v) ?? v.iniziale ?? 0;
    }
    const alla = (arr, t) => somma(arr.filter(x => new Date(x.ts) <= t));
    function totaleDaParte(c) {
      const t = c ? new Date(c.ts) : new Date();
      const valori = Object.fromEntries(VOCI().map(v => [v.id, c ? valoreVoce(v, c) : (v.iniziale || 0)]));
      const liquide = somma(VOCI().filter(v => v.liquido), v => valori[v.id]);
      const vincolate = somma(VOCI().filter(v => !v.liquido), v => valori[v.id]);
      const fondo = alla(S.fondo, t), annuali = alla(S.annuali, t), viaggi = Math.max(0, saldoViaggi(t));
      return {
        valori, liquide, vincolate, fondo, annuali, viaggi,
        disponibile: liquide + fondo,
        vincolato: vincolate + annuali + viaggi,
        totale: liquide + vincolate + fondo + annuali + viaggi,
      };
    }
    function debitiResidui() {
      const daFisse = S.fisse.filter(f => f.fine && (rateRimanenti(f) || 0) > 0)
        .map(f => ({ nome: f.nome, residuo: rateRimanenti(f) * f.importo, auto: true }));
      return [...daFisse, ...S.debiti.map(d => ({ nome: d.nome, residuo: Number(d.residuo) || 0 }))];
    }
    function patrimonio() {
      const ult = storicoCheck().at(-1);
      const t = totaleDaParte(ult || null);
      // fondo e salvadanai sempre aggiornati a oggi
      t.fondo = fondoTot(); t.annuali = salvadanaio(); t.viaggi = Math.max(0, saldoViaggi());
      t.disponibile = t.liquide + t.fondo; t.vincolato = t.vincolate + t.annuali + t.viaggi;
      t.totale = t.liquide + t.vincolate + t.fondo + t.annuali + t.viaggi;
      const debiti = debitiResidui();
      const totDebiti = somma(debiti, x => x.residuo);
      return { ...t, debiti, totDebiti, netto: t.totale - totDebiti, ultimoCheck: ult || null };
    }

    // --------------------------- CREDITI -----------------------------
    const creditiAperti = () => S.crediti.filter(c => !c.saldato && (c.importo - (c.rientrato || 0)) > 0.004);

    // --------------------------- RIEPILOGHI ---------------------------
    function recapSettimana(d = new Date()) {
      const prev = weekStart(d); prev.setDate(prev.getDate() - 1);
      const [ps, pe] = periodRange("settimana", prev);
      const hadData = S.spese.some(x => inRange(x, ps, pe));
      let avanzo = 0;
      const righe = catSettimanali().map(c => {
        const b = budgetEff(c.id, prev), sp = spentCat(c.id, ps, pe);
        avanzo += b - sp;
        return { c, budget: b, speso: sp, ok: sp <= b };
      });
      avanzo = Math.max(0, r2(avanzo));
      return { ps, pe, hadData, righe, avanzo, streak: streak(), paghetta: paghetta(d), bloccata: faseBloccata(d) };
    }
    const recapDaMostrare = () => S.lastRecap !== dk(weekStart(new Date()));

    function perCategoria(s, e) {
      const out = S.categories.map(c => ({ c, tot: spentCat(c.id, s, e) })).filter(x => x.tot > 0.004);
      return out.sort((a, b) => b.tot - a.tot);
    }
    function ultimiCicli(n = 6, d = new Date()) {
      const out = []; let x = monthStart(d);
      for (let i = 0; i < n; i++) {
        const [s, e] = periodRange("mese", x);
        out.unshift({ s, e, key: dk(s), tot: somma(S.spese.filter(y => y.cat !== "viaggi" && inRange(y, s, e)), netto) });
        x = new Date(s); x.setDate(x.getDate() - 1);
      }
      return out;
    }
    function giornalieroCiclo(d = new Date()) {
      const [s] = periodRange("mese", d), gg = giorniCiclo(d);
      const oggi = new Date(d); oggi.setHours(0, 0, 0, 0);
      const pts = []; let cum = 0;
      for (let i = 0; i < gg; i++) {
        const a = new Date(s); a.setDate(a.getDate() + i);
        const b = new Date(a); b.setDate(b.getDate() + 1);
        if (a > oggi) break;
        cum += somma(S.spese.filter(x => x.cat !== "viaggi" && inRange(x, a, b)), netto);
        pts.push({ i, d: a, cum });
      }
      return { pts, gg };
    }
    function topEsercenti(s, e, n = 5) {
      const per = {};
      S.spese.filter(x => x.importo > 0 && inRange(x, s, e)).forEach(x => {
        const k = (x.nota || "(senza nota)").trim().toLowerCase();
        per[k] = per[k] || { nome: x.nota || "(senza nota)", tot: 0, n: 0 };
        per[k].tot += x.importo; per[k].n++;
      });
      return Object.values(per).sort((a, b) => b.tot - a.tot).slice(0, n);
    }
    function statSigarette() {
      const fine = new Date(), ini = new Date(); ini.setDate(ini.getDate() - 30);
      const tot30 = spentCat("sigarette", ini, fine);
      return { tot30, anno: tot30 / 30 * 365, metà: tot30 / 30 * 365 / 2 };
    }
    function badges() {
      const b = [];
      const s = streak();
      b.push({ id: "streak", titolo: `${s} settimane di fila`, sotto: `nel budget ${catLivello()?.nome?.toLowerCase() || ""}`, ok: s >= 1 });
      // cicli chiusi senza sforare il totale delle variabili
      let mesiOk = 0; let x = monthStart(new Date()); x.setDate(x.getDate() - 1);
      for (let i = 0; i < 12; i++) {
        const [st, en] = periodRange("mese", x);
        if (meseKey(st) < C.inizioPiano) break;
        const speso = somma(S.spese.filter(y => y.cat !== "viaggi" && inRange(y, st, en)), netto);
        if (speso <= budgetVariabiliCiclo(st)) mesiOk++; else break;
        x = new Date(st); x.setDate(x.getDate() - 1);
      }
      b.push({ id: "mesi", titolo: `${mesiOk} ${mesiOk === 1 ? "mese" : "mesi"} in linea`, sotto: "variabili sotto il budget", ok: mesiOk >= 1 });
      const fondo = fondoTot(), obj = obiettivoFondo();
      b.push({ id: "fondo", titolo: fondo >= C.fondoSoglia ? "Fondo sopra soglia" : "Fondo sotto soglia", sotto: `${eur0(fondo)} su ${eur0(C.fondoSoglia)}`, ok: fondo >= C.fondoSoglia });
      b.push({ id: "obiettivo", titolo: `${Math.min(100, Math.round(fondo / (obj || 1) * 100))}% dell'obiettivo`, sotto: `fondo di ${C.fondoObiettivoMesi} mesi: ${eur0(obj)}`, ok: fondo >= obj });
      return b;
    }

    // --------------------------- AUTO-CATEGORIA -----------------------
    const chiaveEsercente = t => (t || "").toLowerCase().replace(/[^a-zà-ù0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    function suggerisci(testo) {
      const k = chiaveEsercente(testo);
      if (!k) return null;
      if (S.imparate[k]) return { ...S.imparate[k], fonte: "imparata" };
      for (const r of S.regole) {
        try { if (new RegExp(r.pattern, "i").test(testo)) return { cat: r.cat, sub: r.sub || null, fonte: "regola" }; } catch (e) {}
      }
      return null;
    }
    function impara(testo, catId, sub, metodo) {
      const k = chiaveEsercente(testo); if (!k) return;
      const prev = S.imparate[k];
      S.imparate[k] = { cat: catId, sub: sub || null, metodo: metodo || null, n: (prev?.n || 0) + 1 };
    }
    function rapide(n = 6) {
      const da = new Date(); da.setDate(da.getDate() - 60);
      const per = {};
      S.spese.filter(x => x.importo > 0 && new Date(x.ts) >= da && x.nota).forEach(x => {
        const k = `${chiaveEsercente(x.nota)}|${x.cat}|${r2(x.importo)}`;
        per[k] = per[k] || { nota: x.nota, cat: x.cat, sub: x.sub || null, importo: r2(x.importo), metodo: x.metodo || null, n: 0 };
        per[k].n++;
      });
      return Object.values(per).filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, n);
    }

    // ----------------------------- PROMEMORIA ------------------------
    function promemoria(giorni = 60) {
      const ora = new Date(), lim = new Date(ora); lim.setDate(lim.getDate() + giorni);
      const out = [];
      const add = (id, at, title, body, view = "home") => { if (at > ora && at <= lim) out.push({ id, at: at.toISOString(), title, body, view }); };
      // Giorno di paga, vigilia, verifica
      let ref = new Date(ora);
      for (let i = 0; i < 3; i++) {
        const paga = new Date(periodRange("mese", ref)[1]);
        const k = dk(paga);
        const p9 = new Date(paga); p9.setHours(9, 0, 0, 0);
        add(`paga-${k}`, p9, "💶 Giorno di paga", `Apri Spiccio e prepara i bonifici verso il ${C.contoDeposito}.`, "paga");
        const pre = new Date(paga); pre.setDate(pre.getDate() - 1); pre.setHours(18, 0, 0, 0);
        const c = contiDelMese(paga);
        add(`prepaga-${k}`, pre, "📅 Domani è giorno di paga",
          `Bonifici verso il ${C.contoDeposito}: annuali ${eur(c.piano.daVersare)}, viaggi ${eur(c.viaggi)}, fondo ${eur(c.fondo.importo)}. Totale ${eur(c.piano.daVersare + c.viaggi + c.fondo.importo)}.`);
        const ver = new Date(paga); ver.setDate(ver.getDate() + 7); ver.setHours(10, 0, 0, 0);
        add(`verifica-${k}`, ver, "✅ Hai fatto i bonifici?", `Controlla sul ${C.contoDeposito} i versamenti del mese.`);
        ref = new Date(paga); ref.setDate(ref.getDate() + 1);
      }
      // Domenica e lunedì
      let w = weekStart(ora);
      for (let i = 0; i < Math.ceil(giorni / 7) + 1; i++) {
        const dom = new Date(w); dom.setDate(dom.getDate() + 6); dom.setHours(18, 0, 0, 0);
        add(`dom-${dk(dom)}`, dom, "💶 Avanzo della settimana", `Guarda quanto hai avanzato e bonificalo nel ${C.contoDeposito}.`, "recap");
        const lun = new Date(w); lun.setDate(lun.getDate() + 7); lun.setHours(8, 30, 0, 0);
        add(`lun-${dk(lun)}`, lun, "💳 Paghetta della settimana", `Trasferisci circa ${eur(paghetta(lun, true))} su ${C.metodoPaghetta}.`, "recap");
        w = new Date(w); w.setDate(w.getDate() + 7);
      }
      // Check del secondo sabato
      for (let i = 0; i < 3; i++) {
        const sab = sabatoCheck(ora.getFullYear(), ora.getMonth() + i);
        if (i === 0 && checkDelMese()) continue;
        add(`check-${meseCivile(sab)}`, sab, "📈 Check di metà mese", `Aggiorna ${VOCI().map(v => v.nome).join(", ")}.`, "check");
      }
      // Fisse variabili
      for (const f of S.fisse.filter(x => x.variabile)) {
        for (let i = 0; i < 3; i++) {
          const d = scadenzaFissa(f, new Date(ora.getFullYear(), ora.getMonth() + i, C.giornoStipendio));
          const pre = new Date(d); pre.setDate(pre.getDate() - C.preavvisoFisseVariabili); pre.setHours(8, 30, 0, 0);
          add(`var-${f.id}-${dk(d)}`, pre, `🧾 ${f.nome}: importo reale`, `Tra ${C.preavvisoFisseVariabili} giorni esce ${f.nome} (stimato ${eur(f.importo)}). Inserisci l'importo reale.`, "mese");
        }
      }
      // Tredicesima
      [ora.getFullYear(), ora.getFullYear() + 1].forEach(y => {
        add(`tred-${y}`, new Date(y, C.meseTredicesima - 1, 5, 9, 0, 0), "🎁 Tredicesima in arrivo", `Decidi quanto metterne nel fondo (consiglio: ${Math.round(C.quotaTredicesima * 100)}%).`, "paga");
      });
      // Annuali
      const saldo = salvadanaio();
      for (const x of annualiAttivi()) for (const m of x.mesi) for (const y of [ora.getFullYear(), ora.getFullYear() + 1]) {
        const d = new Date(y, m - 1, x.giorno ?? C.giornoStipendio, 9, 0, 0); d.setDate(d.getDate() - C.preavvisoAnnuali);
        const ok = saldo >= x.importo;
        add(`ann-${x.id}-${y}-${m}`, d, `📅 ${x.nome} tra ${C.preavvisoAnnuali} giorni`,
          `Importo ${eur(x.importo)}. Salvadanaio: ${eur(saldo)} ${ok ? "✅ coperto" : `⚠️ mancano ${eur(x.importo - saldo)}`}.`, "mese");
      }
      // Serale
      const oggiK = dk(ora);
      const spesaOggi = S.spese.some(x => dk(new Date(x.ts)) === oggiK);
      for (let i = 0; i <= giorni; i++) {
        const d = new Date(ora); d.setDate(d.getDate() + i); d.setHours(C.oraSerale, 0, 0, 0);
        if (i === 0 && spesaOggi) continue;
        add(`sera-${dk(d)}`, d, "🌙 Spese di oggi", "Hai registrato tutto? Controlla anche i pagamenti da sistemare.", "home");
      }
      return out.sort((a, b) => a.at < b.at ? -1 : 1);
    }

    // ------------------------------ AVVISI ----------------------------
    function avvisiAvvio() {
      const mk = meseKey(), out = [];
      for (const f of S.livelli) {
        if (!f.serieRichiesta || S.fasiSbloccate[f.da] || f.da > mk) continue;
        const s = streak(f.uscite), key = `fase-near-${f.da}`;
        if (s === f.serieRichiesta - 1 && !S.notifiche[key]) {
          S.notifiche[key] = mk;
          out.push({ titolo: `🔥 Sei a 1 settimana dal ${f.nome}`, testo: `Hai ${s} settimane di fila sotto ${eur(f.uscite)}. Ancora una e si sblocca: dal mese dopo ${eur(f.fondo)} al mese nel fondo.` });
        }
      }
      const s = streak();
      if (s >= C.streakAvviso && s % C.streakAvviso === 0 && !S.notifiche[`streak-${s}`]) {
        S.notifiche[`streak-${s}`] = cicloKey();
        out.push({ titolo: `🔥 ${s} settimane di fila`, testo: `Sei dentro il budget ${catLivello()?.nome?.toLowerCase()} da ${s} settimane consecutive. Continua così!` });
      }
      return out;
    }

    return {
      S, C, cat, catNome, weekStart, monthStart, periodRange, daysLeft, giorniCiclo, cicloKey, meseKey, pianoAttivo, meseSpeciale,
      netto, spentCat, catLivello, streak, faseAttiva, sbloccaFasi, faseBloccata, prossimoLivello, budgetBase, budgetEff, statoCategoria,
      catSettimanali, catMensili, paghetta, settimana, scadenzaFissa, fissaAttiva, rateRimanenti, fisseCiclo, importoFissa, totFisse,
      stipendioCiclo, prossimeFisse, fisseVariabiliDaConfermare, fondoTot, bonusDisponibile, entrateCiclo, salvadanaio, saldoViaggi,
      versamentoViaggi, annualiAttivi, pianoSalvadanaio, rataSeSalti, fondoDelMese, budgetVariabiliCiclo, spesoVariabiliCiclo,
      contiDelMese, quadroMese, paydayInSospeso, obiettivoFondo, meseCivile, sabatoCheck, storicoCheck, checkDelMese, checkInSospeso,
      inserito, valoreVoce, totaleDaParte, debitiResidui, patrimonio, creditiAperti, recapSettimana, recapDaMostrare, perCategoria,
      ultimiCicli, giornalieroCiclo, topEsercenti, statSigarette, badges, chiaveEsercente, suggerisci, impara, rapide, promemoria, avvisiAvvio,
    };
  }

  // ------------------------- MIGRAZIONE DA V4 -------------------------
  // Converte il dati.json di "Spese Consapevoli" (Scriptable) nello stato di Spiccio.
  function daScriptable(d, base = defaults()) {
    const S = base;
    const now = Date.now();
    const arr = a => Array.isArray(a) ? a : [];
    const conId = (x, p) => ({ ...x, id: x.id || uid(p), u: now });
    const mapCat = c => c === "uscite" ? "aperitivo" : c;
    S.spese = arr(d.spese).map(x => {
      const o = conId(x, "sp");
      o.cat = mapCat(o.cat);
      o.importo = Number(o.importo) || 0;
      delete o.ciclo; delete o.settimana;
      if (o.tipo !== "rimborso") o.tipo = "spesa";
      return o;
    });
    S.evitate = arr(d.evitate).map(x => conId(x, "ev"));
    S.fondo = arr(d.fondo).map(x => conId(x, "mv"));
    S.annuali = arr(d.annuali).map(x => conId(x, "mv"));
    S.viaggiFondo = arr(d.viaggiFondo).map(x => conId(x, "mv"));
    S.entrate = arr(d.entrate).map(x => conId(x, "en"));
    // check: normalizza le chiavi dei valori sugli id delle voci
    S.check = arr(d.check).map(c => {
      const valori = {};
      for (const v of S.checkVoci) {
        for (const k of [v.id, v.nome, ...(v.alias || [])]) if (c.valori?.[k] !== undefined) { valori[v.id] = Number(c.valori[k]); break; }
      }
      return { id: "ck_" + c.mese, mese: c.mese, ts: c.ts, valori, u: now };
    });
    S.salvadanaioSaltato = d.salvadanaioSaltato || {};
    S.stipendi = d.stipendi || {};
    S.fissePagate = d.fissePagate || {};
    S.fasiSbloccate = d.fasiSbloccate || {};
    S.notifiche = d.notifiche || {};
    S.lastRecap = d.lastRecap ?? null;
    S.lastPayday = d.lastPayday ?? null;
    S.meta.importatoDa = { versione: d.meta?.schemaVersion || 1, il: new Date().toISOString(), spese: S.spese.length };
    return S;
  }

  // ------------------------------ MERGE -------------------------------
  // Unisce due copie dello stato (telefono e PC). Ogni voce ha un id e un
  // timestamp `u`; le voci eliminate finiscono in `deleted`.
  const LISTE = ["spese", "evitate", "fondo", "annuali", "viaggiFondo", "entrate", "check", "inbox", "crediti"];
  const MAPPE = ["salvadanaioSaltato", "stipendi", "fissePagate", "fasiSbloccate", "notifiche", "imparate"];
  const CONFIG = ["settings", "categories", "fisse", "annualiDef", "livelli", "mesiSpeciali", "checkVoci", "debiti", "regole"];
  function merge(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const out = JSON.parse(JSON.stringify(local));
    out.deleted = { ...(remote.deleted || {}), ...(local.deleted || {}) };
    for (const [k, v] of Object.entries(remote.deleted || {})) out.deleted[k] = Math.max(v, local.deleted?.[k] || 0);
    for (const l of LISTE) {
      const m = new Map();
      for (const x of (remote[l] || [])) m.set(x.id, x);
      for (const x of (local[l] || [])) { const r = m.get(x.id); if (!r || (x.u || 0) >= (r.u || 0)) m.set(x.id, x); }
      out[l] = [...m.values()].filter(x => !out.deleted[x.id]).sort((a, b) => (a.ts || "") < (b.ts || "") ? -1 : 1);
    }
    for (const mp of MAPPE) out[mp] = { ...(remote[mp] || {}), ...(local[mp] || {}) };
    if ((remote.settingsU || 0) > (local.settingsU || 0)) { for (const c of CONFIG) out[c] = remote[c]; out.settingsU = remote.settingsU; }
    out.lastRecap = [local.lastRecap, remote.lastRecap].filter(Boolean).sort().at(-1) ?? null;
    const lp = [local.lastPayday, remote.lastPayday].filter(x => x !== null && x !== undefined);
    out.lastPayday = lp.length ? lp.sort().at(-1) : null;
    // pulizia tombstone più vecchie di 120 giorni
    const lim = Date.now() - 120 * 86400000;
    for (const [k, v] of Object.entries(out.deleted)) if (v < lim) delete out.deleted[k];
    return out;
  }

  function normalizza(S) {
    const d = defaults();
    for (const k of Object.keys(d)) if (S[k] === undefined) S[k] = d[k];
    S.settings = { ...d.settings, ...S.settings };
    return S;
  }

  root.Core = { SCHEMA, MESI, GIORNI, defaults, make, daScriptable, merge, normalizza, util: { pad, dk, dm, r2, eur, eur0, num, somma, uid, parseAmount, inRange } };
})(typeof window !== "undefined" ? window : globalThis);
