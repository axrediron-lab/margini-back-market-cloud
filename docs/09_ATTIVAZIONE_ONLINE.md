# Attivazione online — Supabase + Fogli Google

## Stato al 21 settembre 2026

Le sei migrazioni sono applicate al progetto Supabase collegato e le funzioni `online-api` e `import-google-sheet` sono distribuite con verifica JWT attiva. Un nuovo dry-run remoto non mostra migrazioni pendenti; entrambe rifiutano una richiesta anonima con 401. L'hash delle regole economiche è configurato nel runtime remoto. Il sito è pubblicato su `https://axrediron-lab.github.io/margini-back-market-cloud/` tramite workflow manuale GitHub Pages. **Il ciclo autenticato non è ancora collaudato.** Nessun CSV reale è stato copiato nel progetto remoto; le credenziali Google non sono ancora configurate.

L'utente amministratore è stato invitato tramite Supabase Auth e registrato in `public.app_users` con ruolo `admin`. L'indirizzo email personale non è necessario nella documentazione pubblica. Il Site URL Auth e `APP_ORIGIN` puntano al sito online; l'utente deve ancora accettare l'invito e impostare la password.

Il codice copre: login Supabase, letture protette di dashboard/ordini/costi/resi/anomalie, anteprima e conferma CSV, anteprima e conferma da Fogli Google, ricalcolo ed export dall'interfaccia. Il backend locale continua a funzionare senza configurazione online.

## Sequenza di attivazione, una volta autorizzati i passaggi remoti

1. **Eseguito:** dry-run e applicazione delle sei migrazioni al progetto Supabase collegato. Nessun `db reset` remoto.
2. **Eseguito:** invito dell'utente amministratore e assegnazione del ruolo `admin` abilitato in `public.app_users`. L'utente deve ancora accettare l'invito. L'utente `viewer` può solo leggere.
3. **Eseguito:** `APP_ORIGIN` e Site URL Auth configurati per GitHub Pages. `ECONOMICS_RULES_SHA256` corrisponde al file `packages/domain/src/economics.mjs` della versione distribuita. Le variabili Supabase di servizio restano solo nel runtime server.
4. Per Fogli Google, predisporre un service account con accesso **in sola lettura** ai soli fogli necessari. Salvare la sua chiave JSON come secret server-side `GOOGLE_SERVICE_ACCOUNT_JSON` e l'array JSON degli ID permessi in `GOOGLE_SHEET_ALLOWLIST`. Non inserire la chiave nel repository, nel browser o nei fogli stessi.
5. **Eseguito:** backend Supabase distribuito e GitHub Pages pubblicato con variabili Actions `SUPABASE_URL` e `SUPABASE_ANON_KEY` (solo chiave pubblica). Il repository è pubblico con autorizzazione dell'utente; i CSV e le chiavi server non sono nel repository. Il workflow `Pubblica Margini online` si avvia manualmente: un normale push non pubblica nulla.
6. Fare un solo collaudo con account operatore e file **sintetico**: login, anteprima, conferma, idempotenza, ricalcolo, consultazione e export. Verificare tempo/limiti Edge; il ricalcolo completo e le conferme grandi potrebbero richiedere suddivisione in blocchi prima di caricare i sei file reali.
7. Solo dopo il collaudo, importare i sei CSV reali dall'interfaccia online, verificare i conteggi e ricalcolare. I file restano fuori Git. Valutare una riconciliazione dei totali online con il run locale prima di usare i dati operativamente.

## Vincoli di sicurezza e limiti noti

- Ogni funzione verifica il JWT e il ruolo applicativo prima di usare la service-role key. Il browser riceve soltanto URL e chiave pubblica.
- L'anteprima non scrive. Alla conferma la fonte viene riletta e deve produrre lo stesso SHA-256; il batch è idempotente.
- Il CSV inviato al server e il foglio letto hanno limite 15 MB / 20.000 righe in questa prima versione. La conferma usa attualmente un'unica RPC atomica, non ancora chunked.
- I Fogli Google sono letti tramite API `values.get` con valori formattati; il collaudo deve confermare che il formato numerico e le intestazioni coincidano con i CSV originari. L'intervallo deve includere l'intestazione nella prima riga.
- Le Edge Functions hanno limiti di CPU e durata: il ricalcolo sui dati reali è implementato ma non ancora provato nel runtime remoto. Un errore di limite richiederà lavoro per blocchi/resumable, non una pubblicazione prematura.
- Cambiare `online-config.js` senza entrambe le proprietà richieste non attiva la modalità online; su hosting remoto viene mostrato un errore di configurazione.
