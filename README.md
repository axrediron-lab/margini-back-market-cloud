# Margini Back Market Cloud

Nuovo progetto locale, completamente separato da **Margini Back Market V2**.
Questa prima fase contiene specifica verificabile, schema PostgreSQL/Supabase, contratti di importazione e una shell UI italiana. Non contiene dati operativi, credenziali o risorse remote.

## Stato della fase

| Area | Stato | Note |
|---|---|---|
| Specifica economica e architetturale | Progettata | Regole vincolanti in `docs/` |
| Schema Supabase/PostgreSQL | Implementato localmente | Migrazione SQL non applicata a istanze remote |
| RLS e ruoli | Implementati localmente | Da validare su Supabase locale prima della creazione remota |
| Import Google Sheets | Scaffolding | Edge Function con flusso Anteprima -> Validazione -> Conferma; nessuna chiamata reale |
| Motore economico | Contratti e regole pure | Nessun calcolo su dati reali |
| Interfaccia | Shell table-first V1 | Sette sezioni essenziali, nessun dato reale |
| Test | Implementati e superati localmente | Regole economiche e controlli statici dello schema |
| Supabase remoto | Progetto creato | Istanza sana; repository non collegato e nessuna migrazione applicata |
| Dati reali / deploy | **In attesa di autorizzazione** | Non eseguiti |

## Avvio locale della sola interfaccia

Non servono dipendenze:

```powershell
cd "apps/web"
python -m http.server 4173
```

Aprire `http://127.0.0.1:4173`. La UI è una shell navigabile e non si connette a servizi remoti.

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

Collegare esplicitamente il checkout al progetto Supabase, validare la migrazione e le RLS con dati sintetici, quindi applicare lo schema remoto soltanto dopo una revisione separata. Il progetto remoto esiste, ma non contiene ancora lo schema applicativo e non è collegato a deploy automatici GitHub.
