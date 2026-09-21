# Attivazione online — Supabase + Fogli Google

## Stato al 21 settembre 2026

Le sei migrazioni sono applicate al progetto Supabase collegato e le funzioni `online-api` e `import-google-sheet` sono distribuite con verifica JWT attiva. Un nuovo dry-run remoto non mostra migrazioni pendenti; entrambe rifiutano una richiesta anonima con 401. L'hash delle regole economiche è configurato nel runtime remoto. **Il sito non è ancora pubblicato e il ciclo autenticato non è collaudato.** Nessun CSV reale è stato copiato nel progetto remoto; le credenziali Google e l'origine del sito non sono ancora configurate. Il codice aggiornato è ancora solo nel checkout locale, non inviato a GitHub.

L'email scelta per l'amministratore è `axrediron@gmail.com`, ma non esiste ancora in Supabase Auth. Il Site URL remoto è attualmente `http://localhost:3000`: l'invito non va spedito finché non esiste un URL online funzionante e autorizzato nei redirect Auth.

Il codice copre: login Supabase, letture protette di dashboard/ordini/costi/resi/anomalie, anteprima e conferma CSV, anteprima e conferma da Fogli Google, ricalcolo ed export dall'interfaccia. Il backend locale continua a funzionare senza configurazione online.

## Sequenza di attivazione, una volta autorizzati i passaggi remoti

1. **Eseguito:** dry-run e applicazione delle sei migrazioni al progetto Supabase collegato. Nessun `db reset` remoto.
2. Creare o invitare un utente in Supabase Auth; assegnargli in `public.app_users` il ruolo `admin` oppure `operator` e `enabled = true`. L'utente `viewer` può solo leggere. Evitare registrazione pubblica indiscriminata.
3. Configurare `APP_ORIGIN` nelle Edge Functions con l'origine esatta del sito, quando l'hosting sarà deciso. `ECONOMICS_RULES_SHA256` è già configurato con lo SHA-256 del file `packages/domain/src/economics.mjs` della versione distribuita. Le variabili Supabase di servizio restano solo nel runtime server.
4. Per Fogli Google, predisporre un service account con accesso **in sola lettura** ai soli fogli necessari. Salvare la sua chiave JSON come secret server-side `GOOGLE_SERVICE_ACCOUNT_JSON` e l'array JSON degli ID permessi in `GOOGLE_SHEET_ALLOWLIST`. Non inserire la chiave nel repository, nel browser o nei fogli stessi.
5. **Backend eseguito:** `online-api` e `import-google-sheet` distribuite in Supabase. Per il sito, nel repository GitHub impostare le variabili Actions `SUPABASE_URL` e `SUPABASE_ANON_KEY` con URL e chiave **pubblica/anon**, mai con la service-role key. Abilitare GitHub Pages con origine GitHub Actions, poi lanciare manualmente il workflow `Pubblica Margini online`: un normale push non pubblica nulla.
   Il repository attuale è privato: GitHub Pages da repository privato richiede un piano GitHub compatibile. Se non disponibile, mantenere privato il codice e usare un hosting statico alternativo; **non** rendere pubblico il repository automaticamente.
6. Fare un solo collaudo con account operatore e file **sintetico**: login, anteprima, conferma, idempotenza, ricalcolo, consultazione e export. Verificare tempo/limiti Edge; il ricalcolo completo e le conferme grandi potrebbero richiedere suddivisione in blocchi prima di caricare i sei file reali.
7. Solo dopo il collaudo, importare i sei CSV reali dall'interfaccia online, verificare i conteggi e ricalcolare. I file restano fuori Git. Valutare una riconciliazione dei totali online con il run locale prima di usare i dati operativamente.

## Vincoli di sicurezza e limiti noti

- Ogni funzione verifica il JWT e il ruolo applicativo prima di usare la service-role key. Il browser riceve soltanto URL e chiave pubblica.
- L'anteprima non scrive. Alla conferma la fonte viene riletta e deve produrre lo stesso SHA-256; il batch è idempotente.
- Il CSV inviato al server e il foglio letto hanno limite 15 MB / 20.000 righe in questa prima versione. La conferma usa attualmente un'unica RPC atomica, non ancora chunked.
- I Fogli Google sono letti tramite API `values.get` con valori formattati; il collaudo deve confermare che il formato numerico e le intestazioni coincidano con i CSV originari. L'intervallo deve includere l'intestazione nella prima riga.
- Le Edge Functions hanno limiti di CPU e durata: il ricalcolo sui dati reali è implementato ma non ancora provato nel runtime remoto. Un errore di limite richiederà lavoro per blocchi/resumable, non una pubblicazione prematura.
- Cambiare `online-config.js` senza entrambe le proprietà richieste non attiva la modalità online; su hosting remoto viene mostrato un errore di configurazione.
