# Margini Back Market Cloud

Nuovo progetto locale, completamente separato da **Margini Back Market V2**.
Contiene specifica verificabile, schema PostgreSQL/Supabase, importazione e ricalcolo locali, e codice per il percorso online descritto in `docs/09_ATTIVAZIONE_ONLINE.md`. Non contiene CSV operativi o credenziali.

## Stato della fase

| Area | Stato | Note |
|---|---|---|
| Specifica economica e architetturale | Progettata | Regole vincolanti in `docs/` |
| Schema Supabase/PostgreSQL | Applicato localmente e da remoto | Sei migrazioni sul progetto collegato; dry-run remoto aggiornato |
| RLS e ruoli | Applicati localmente e da remoto | Migrazione e lint locali superati; test autenticati con dati sintetici ancora da eseguire |
| Import CSV | Anteprima e conferma locale implementate | Cinque tracciati riconosciuti; batch e righe normalizzate in staging |
| Motore economico | Primo run locale persistito | 1.034 ordini coperti, parametri e provenienza registrati |
| Interfaccia | Cruscotto locale collegato | KPI, andamento, ordini, costi, resi, controlli e parametri reali |
| Test | Implementati e superati localmente | Regole economiche, parser reali, privacy e controlli statici dello schema |
| Supabase remoto | Schema e due funzioni Edge distribuiti | `online-api` e `import-google-sheet` attive con verifica JWT; accesso anonimo 401 |
| Dati reali locali | Importati e calcolati | Sei file nel solo Supabase locale; nessun CSV nel repository |
| Codice online | Implementato localmente, non collaudato end-to-end | Auth, API, CSV/Fogli Google e UI; limiti Edge da verificare |
| Sito online | **Non pubblicato** | Hosting, utente Auth, origine CORS e Google non ancora configurati; nessun dato reale remoto |

## Avvio locale della sola interfaccia

Dopo `npm install`, avviare:

```powershell
npm run dev
```

Aprire `http://127.0.0.1:4173`, quindi usare **Importazioni**. La UI parla soltanto con il server locale; l'operatore rifiuta URL Supabase non locali.

Il ciclo consigliato è descritto in `docs/06_FLUSSO_LOCALE.md`: modifiche, test e database locale non richiedono push GitHub né deploy Supabase.

## Verifica locale

Richiede Node.js 20+ e non installa pacchetti:

```powershell
npm test
```

Anteprima di uno o più CSV esterni, senza persistenza:

```powershell
npm run preview:imports -- "C:\percorso\file.csv"
```

La conferma dalla UI salva il batch e tutte le righe fisiche nel database locale. Un file con lo stesso hash non viene duplicato. Il test integrato usa soltanto due righe sintetiche e richiede server e Supabase locale avviati:

```powershell
npm run test:local-import
```

Il pulsante **Ricalcola** normalizza i batch confermati e crea un nuovo run economico locale. Per eseguire lo stesso comando da PowerShell:

```powershell
npm run recalculate:local
```

Il primo run reale è riepilogato in `docs/08_PRIMO_RUN_LOCALE.md`.

## Confini di sicurezza

- Nessun file, IndexedDB, launcher, configurazione o dato della V2 offline è letto o modificato.
- I CSV operativi restano fuori dal repository; `.gitignore` blocca i formati dati comuni.
- Nessuna service-role key è prevista nel browser o in Google Sheets.
- Nessun import parte automaticamente alla modifica di un foglio.
- La conferma di un batch è una chiamata backend esplicita, atomica, idempotente e auditata.
- La service-role key locale viene scoperta e usata soltanto dal processo Node; non viene inviata al browser.
- `supabase link`, migrazioni remote, secret, import reali e deploy richiedono una nuova autorizzazione esplicita.

## Struttura

```text
apps/web/                     shell UI locale italiana
packages/domain/              regole economiche pure e test
packages/domain/src/imports.mjs parser e anteprima dei tracciati reali
supabase/migrations/          schema, vincoli, RLS e viste
supabase/functions/           contratto Edge Function per Google Sheets
docs/                         specifiche, matrice fonti, sicurezza e piano test
scripts/                      verifiche statiche locali
```

## Passo successivo

Completare filtri e dettaglio provenienza, quindi valutare la gestione manuale dei resi non collegati. Lo schema potrà essere applicato al progetto Supabase online soltanto dopo una revisione e un'autorizzazione separate; non esistono deploy automatici da GitHub.
