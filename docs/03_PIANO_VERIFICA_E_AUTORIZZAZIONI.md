# Piano di verifica e autorizzazioni

## Verifiche disponibili ora

| Controllo | Comando | Aspettativa |
|---|---|---|
| Regole dominio | `node --test packages/domain/test/*.test.mjs` | tutti i test passano |
| Completezza scaffolding | `node scripts/verify-scaffold.mjs` | file e marker richiesti presenti |
| Tutto | `npm test` | exit code 0 |
| UI statica | `npm run dev` | sette schermate navigabili su `http://127.0.0.1:4173` |
| Schema locale | `npm run supabase:lint` | nessun errore SQL |

## Gate successivi

### Gate A — Supabase locale (completato per migrazione e lint)

Docker e lo stack Supabase locale sono installati e funzionanti. La migrazione iniziale è stata applicata e il lint SQL è superato. Rimangono facoltativi i test autenticati di indici, vincoli e RLS con seed esclusivamente sintetico.

### Gate B — lettura V2 offline

Solo se servono dettagli sui formati: accesso esplicito **in sola lettura**, inventario dei campi e campioni anonimizzati. Nessuna modifica a file, IndexedDB, launcher o configurazioni V2.

### Gate C — integrazione Google

Richiede scelta del metodo di autenticazione, allowlist dei fogli e credenziali server-side dedicate. Prima prova con foglio sintetico, poi revisione dell'anteprima e della mappatura.

### Gate D — Supabase remoto

Richiede autorizzazione esplicita distinta per: creazione progetto, configurazione secrets, migrazione schema, import dati reali e deploy. Nessuna di queste attività è implicita nelle altre.

## Cosa non è stato eseguito

- nessun accesso alla V2 offline;
- nessun `supabase db push`;
- nessuna credenziale applicativa salvata nel repository;
- nessun CSV/XLSX operativo copiato;
- nessun dato reale importato;
- nessun deploy o pubblicazione.
