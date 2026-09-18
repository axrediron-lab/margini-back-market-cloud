# Piano di verifica e autorizzazioni

## Verifiche disponibili ora

| Controllo | Comando | Aspettativa |
|---|---|---|
| Regole dominio | `node --test packages/domain/test/*.test.mjs` | tutti i test passano |
| Completezza scaffolding | `node scripts/verify-scaffold.mjs` | file e marker richiesti presenti |
| Tutto | `npm test` | exit code 0 |
| UI statica | `python -m http.server 4173` da `apps/web` | nove schermate navigabili |

## Gate successivi

### Gate A — Supabase locale

Richiede nuova autorizzazione se comporta installazioni/download. Attività: avvio stack locale, applicazione migrazione, lint SQL, test indici/vincoli/RLS, seed esclusivamente sintetico.

### Gate B — lettura V2 offline

Solo se servono dettagli sui formati: accesso esplicito **in sola lettura**, inventario dei campi e campioni anonimizzati. Nessuna modifica a file, IndexedDB, launcher o configurazioni V2.

### Gate C — integrazione Google

Richiede scelta del metodo di autenticazione, allowlist dei fogli e credenziali server-side dedicate. Prima prova con foglio sintetico, poi revisione dell'anteprima e della mappatura.

### Gate D — Supabase remoto

Richiede autorizzazione esplicita distinta per: creazione progetto, configurazione secrets, migrazione schema, import dati reali e deploy. Nessuna di queste attività è implicita nelle altre.

## Cosa non è stato eseguito

- nessun accesso alla V2 offline;
- nessun download o installazione;
- nessun `supabase init/start/link/db push`;
- nessuna creazione di progetto o risorsa cloud;
- nessuna credenziale letta o salvata;
- nessun CSV/XLSX operativo copiato;
- nessun dato reale importato;
- nessun deploy o pubblicazione.
