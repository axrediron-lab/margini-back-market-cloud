# Margini Back Market Cloud

Nuovo progetto locale, completamente separato da **Margini Back Market V2**.
Questa prima fase contiene specifica verificabile, schema PostgreSQL/Supabase, contratti di importazione e una shell UI italiana. Non contiene dati operativi, credenziali o risorse remote.

## Stato della fase

| Area | Stato | Note |
|---|---|---|
| Specifica economica e architetturale | Progettata | Regole vincolanti in `docs/` |
| Schema Supabase/PostgreSQL | Implementato localmente | Migrazione SQL non applicata a istanze remote |
| RLS e ruoli | Applicati localmente | Migrazione e lint superati; test autenticati con dati sintetici ancora da eseguire |
| Import Google Sheets | Scaffolding | Edge Function con flusso Anteprima -> Validazione -> Conferma; nessuna chiamata reale |
| Motore economico | Contratti e regole pure | Nessun calcolo su dati reali |
| Interfaccia | Shell table-first V1 | Sette sezioni essenziali, nessun dato reale |
| Test | Implementati e superati localmente | Regole economiche e controlli statici dello schema |
| Supabase remoto | Progetto creato e checkout collegato | Nessuna migrazione applicata al database remoto |
| Dati reali / deploy | **In attesa di autorizzazione** | Non eseguiti |

## Avvio locale della sola interfaccia

Dopo `npm install`, avviare:

```powershell
npm run dev
```

Aprire `http://127.0.0.1:4173`. La UI è una shell navigabile e non si connette a servizi remoti.

Il ciclo consigliato è descritto in `docs/06_FLUSSO_LOCALE.md`: modifiche, test e database locale non richiedono push GitHub né deploy Supabase.

## Verifica locale

Richiede Node.js 20+ e non installa pacchetti:

```powershell
npm test
```

## Confini di sicurezza

- Nessun file, IndexedDB, launcher, configurazione o dato della V2 offline è letto o modificato.
- I CSV operativi restano fuori dal repository; `.gitignore` blocca i formati dati comuni.
- Nessuna service-role key è prevista nel browser o in Google Sheets.
- Nessun import parte automaticamente alla modifica di un foglio.
- La conferma di un batch è una chiamata backend esplicita, autorizzata e auditata.
- `supabase link`, migrazioni remote, secret, import reali e deploy richiedono una nuova autorizzazione esplicita.

## Struttura

```text
apps/web/                     shell UI locale italiana
packages/domain/              regole economiche pure e test
supabase/migrations/          schema, vincoli, RLS e viste
supabase/functions/           contratto Edge Function per Google Sheets
docs/                         specifiche, matrice fonti, sicurezza e piano test
scripts/                      verifiche statiche locali
```

## Passo successivo, non autorizzato in questa fase

Completare il test locale delle RLS con dati sintetici e preparare il dry-run remoto. Lo schema potrà essere applicato al progetto Supabase online soltanto dopo una revisione e un'autorizzazione separate; non esistono deploy automatici da GitHub.
