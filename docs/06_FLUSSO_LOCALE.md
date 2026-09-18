# Flusso locale prima della pubblicazione

## Regola operativa

GitHub e Supabase remoto non fanno parte del ciclo quotidiano. Si sviluppa e si verifica in locale; si pubblica soltanto una versione scelta.

```text
modifica locale
  -> npm test
  -> verifica UI con npm run dev
  -> test database locale con Supabase/Docker
  -> commit Git locale facoltativo
  -> push GitHub quando stabile
  -> dry-run Supabase
  -> migrazione remota solo con autorizzazione esplicita
```

## Comandi senza pubblicazione

| Comando | Effetto |
|---|---|
| `npm run dev` | apre la UI su `http://127.0.0.1:4173`; nessun cloud |
| `npm test` | test regole e struttura; nessun cloud |
| `npm run supabase:start` | avvia Supabase locale; richiede Docker |
| `npm run supabase:reset` | ricrea **solo** il database locale dalle migrazioni |
| `npm run supabase:lint` | controlla lo schema locale |
| `npm run supabase:stop` | ferma Supabase locale conservando i volumi |
| `git commit` | salva una versione soltanto sul PC |

## Comandi che interessano servizi remoti

| Comando | Effetto |
|---|---|
| `git push` | pubblica i commit su GitHub, non modifica Supabase |
| `npm run supabase:link` | collega il checkout al progetto remoto, non applica lo schema |
| `npm run supabase:dry-run` | mostra le migrazioni remote pendenti senza applicarle |
| `npx supabase db push` | applica lo schema remoto: richiede autorizzazione distinta |

Non usare `supabase db reset --linked`: distrugge e ricrea il database remoto. Il progetto non include uno script per questo comando.

## Stato del PC

La CLI Supabase è installata come dipendenza del progetto e resta versionata nel `package-lock.json`. Per il database locale completo serve ancora un runtime Docker compatibile. Fino ad allora sono disponibili UI locale, test economici e controlli statici; nessuna limitazione obbliga a pubblicare le modifiche.
