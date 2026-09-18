# Sicurezza, ruoli e import controllato

## Ruoli applicativi

| Ruolo | Lettura | Anteprima/validazione | Conferma import | Parametri/ruoli | Pubblica ricalcolo |
|---|---:|---:|---:|---:|---:|
| `viewer` | Sì | No | No | No | No |
| `operator` | Sì | Sì | Sì | No | No |
| `admin` | Sì | Sì | Sì | Sì | Sì |

Gli utenti anonimi non hanno accesso alle tabelle applicative. `user_profiles` associa `auth.uid()` al ruolo. Le funzioni `security definer` controllano esplicitamente ruolo e `search_path`.

## Separazione delle chiavi

- Browser: solo anon key pubblica; RLS sempre attiva.
- Edge Function: credenziali server-side fornite dall'ambiente Supabase, mai dal foglio.
- Google Sheets: nessuna service-role key, webhook segreto o formula che avvia import.
- Token Google: futuro secret server-side con scope di sola lettura e fogli consentiti esplicitamente.

## Protezioni import

- allowlist di spreadsheet e range;
- limite righe/dimensione e timeout;
- hash SHA-256 file/range e payload raw;
- deduplicazione su `(source_system, sha256)` e chiavi sorgente;
- conferma con optimistic lock (`preview_hash` invariato);
- transazione unica per promozione;
- audit leggero nel batch: fonte, hash, autore, data, esito ed errore;
- nessun trigger di import su modifica Google Sheets.

## Minacce da verificare prima del remoto

1. Ruoli ricavati solo da `app_users`, non da metadata modificabili dall'utente.
2. Lettura di spreadsheet non autorizzati dalla Edge Function.
3. Formula injection negli export (`=`, `+`, `-`, `@` a inizio cella).
4. Foglio cambiato tra anteprima e conferma.
5. Reimport dello stesso contenuto con nome diverso.

## Test RLS pianificati

- anon: zero SELECT/INSERT/UPDATE/DELETE;
- viewer: SELECT sì, scritture no;
- operator: crea/valida/conferma batch, non modifica parametri o profili;
- admin: gestisce parametri e pubblica run;
- utente disabilitato: accesso negato;
- service role: usata solo da funzioni backend controllate.
