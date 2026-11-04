# Spiccio: guida all'installazione

Spiccio è la versione app di Spese Consapevoli. Si installa una volta sola, seguendo questi passi in ordine. Ti servono circa 30-40 minuti, meglio dal PC.

**Cosa ti serve**
- questa cartella (`spiccio`);
- il file `spiccio-chiavi-promemoria.txt`, che ti ho mandato a parte e che **non va caricato su GitHub**;
- l'account GitHub;
- un account Cloudflare gratuito, che crei al passo 6.

---

## 1. Pubblica Spiccio su GitHub Pages

1. Su github.com: **+** in alto a destra → **New repository**.
2. Come nome scrivi `spiccio` e scegli **Public** (GitHub Pages gratis richiede un repository pubblico). Poi **Create repository**.
3. Nella pagina del repository: **uploading an existing file**. Trascina *tutto il contenuto* della cartella `spiccio`, comprese le cartelle `icons` e `promemoria`, poi **Commit changes**.
4. **Settings → Pages**. Sotto *Branch* scegli `main` e la cartella `/ (root)`, poi **Save**.
5. Dopo 1-2 minuti Spiccio è online su `https://TUONOMEUTENTE.github.io/spiccio/`.

> Nel repository c'è solo il codice dell'app. I tuoi dati non ci finiscono mai: restano sul telefono e nel Gist del passo 4.

## 2. Installala sull'iPhone

1. Apri l'indirizzo in **Safari**.
2. Tocca **Condividi → Aggiungi alla schermata Home**.
3. Da ora apri Spiccio solo dall'icona: così funziona come un'app vera, anche offline, e può ricevere le notifiche.

## 3. Importa i dati di Spese Consapevoli

1. Al primo avvio scegli **Importo i dati di Spese Consapevoli**.
2. Cerca il file in **iCloud Drive → Scriptable → SpeseConsapevoli → `dati.json`**.

Spese, entrate, check, fondo, salvadanai e stipendi passano tutti in Spiccio. Le spese evitate restano archiviate nei dati, ma l'app non le mostra più (l'abbiamo deciso insieme).

## 4. Collega la sincronizzazione (Gist privato)

1. Su GitHub: foto profilo → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. Nome: `Spiccio`. Scadenza: **No expiration** (oppure 1 anno, poi lo rinnovi). Spunta **solo** la casella **gist**. Poi **Generate token** e copialo.
3. In Spiccio: **⚙︎ → Sincronizzazione**. Incolla il token, lascia vuoto l'ID del Gist e tocca **Collega e crea il Gist**.
4. Sul PC apri lo stesso indirizzo, vai nella stessa pagina e incolla **lo stesso token e l'ID del Gist** (c'è il tasto *Copia ID Gist*). I dati dei due dispositivi si uniscono da soli.

> Un Gist "secret" non compare da nessuna parte e ha un indirizzo impossibile da indovinare, ma chi conoscesse l'indirizzo esatto potrebbe aprirlo. Non condividere l'ID e tieni il token solo per te. GitHub conserva ogni versione del Gist: è anche il tuo backup automatico.

## 5. Pagamenti dal Wallet (comando rapido)

In Spiccio, **⚙︎ → Pagamenti dal Wallet** trovi gli stessi passi e i tasti per copiare l'indirizzo.

1. App **Comandi → Automazione → + → Transazione**. Seleziona le tue carte, scegli **Esegui immediatamente**, poi **Avanti → Nuovo comando vuoto**.
2. Aggiungi l'azione **Testo** e scrivi tre righe, ognuna con una variabile presa da *Input comando*:
   ```
   Importo
   Esercente
   Nome
   ```
   (riga 1 l'importo, riga 2 l'esercente, riga 3 il nome della carta)
3. Aggiungi **Ottieni contenuti dell'URL**:
   - URL: `https://api.github.com/gists/IL_TUO_ID_GIST/comments`
   - Metodo: **POST**
   - Intestazioni: `Authorization` → `Bearer IL_TUO_TOKEN`; `Accept` → `application/vnd.github+json`
   - Corpo richiesta: **JSON**, aggiungi un campo **Testo** chiamato `body` con valore la variabile **Testo** del punto 2.
4. Fine. Da ora ogni pagamento con il Wallet compare in Home come "pagamento da sistemare". Tocchi, la categoria è già suggerita, salvi.

Per provare senza pagare: **⚙︎ → Pagamenti dal Wallet → Simula un pagamento**.

## 6. Promemoria (Cloudflare, gratis)

1. Registrati su **dash.cloudflare.com** (piano Free).
2. **Workers & Pages → Create → Create Worker**. Chiamalo `spiccio-push` → **Deploy**.
3. **Edit code**: cancella tutto, incolla il contenuto di `promemoria/worker.js` → **Deploy**.
4. **Storage & Databases → KV → Create**: nome `spiccio`.
5. Torna nel Worker → **Settings → Bindings → Add → KV namespace**. *Variable name*: `SPICCIO`, namespace: `spiccio`. Salva.
6. **Settings → Variables and Secrets → Add**. Crea 4 variabili di tipo **Secret** copiando nomi e valori da `spiccio-chiavi-promemoria.txt`: `APP_KEY`, `VAPID_PUBLIC`, `VAPID_PRIVATE_JWK`, `CONTACT` (per `CONTACT` scrivi `mailto:` seguito dalla tua email).
7. **Settings → Trigger events → Add → Cron Triggers**: `*/15 * * * *` (ogni 15 minuti).
8. Copia l'indirizzo del Worker (tipo `https://spiccio-push.TUONOME.workers.dev`).
9. In Spiccio, aperto dall'icona sulla Home: **⚙︎ → Promemoria**. Incolla l'indirizzo e la `APP_KEY` → **Attiva notifiche** → consenti → **Prova**.

I promemoria attivi sono: giorno di paga (il 10 alle 9), vigilia del giorno di paga, verifica bonifici (il 17), avanzo della domenica, paghetta del lunedì, check del secondo sabato, importo reale di Hera, tredicesima, spese annuali 14 giorni prima e, alle 21, il controllo delle spese della giornata. Ogni volta che apri l'app l'elenco si aggiorna da solo.

## 7. Spegni lo script

Quando hai controllato che in Spiccio i conti tornano, puoi eliminare lo script e il widget Scriptable. Prima scarica un backup: **⚙︎ → Dati e backup → Scarica un backup completo**.

---

### Cose da sapere
- **Tutto si modifica dall'app**: budget, fisse, annuali, livelli, mesi speciali, conti del check, debiti e regole. Non serve più toccare il codice.
- **Il budget di Aperitivi e cene** lo decide il livello del fondo attivo, come nello script.
- **Spese divise**: con "Pagato per" a 2 o più persone, la parte degli altri diventa un credito. Quando ti restituiscono i soldi usi **Rimborso** e scegli il credito da chiudere.
- **Report PDF**: Mese → Report del mese → Salva come PDF.
- **Aggiornare l'app**: carichi su GitHub i file nuovi, sovrascrivendo i vecchi. Alla riapertura Spiccio si aggiorna da solo.
