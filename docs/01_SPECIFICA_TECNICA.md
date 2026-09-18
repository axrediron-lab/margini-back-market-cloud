# Specifica tecnica verificabile — fase 1

## 1. Obiettivo e confini

Il sistema sostituirà in futuro la V2 offline, ma in questa fase nasce come progetto autonomo. Non condivide storage browser, cartelle, launcher o configurazioni con la V2. I dati operativi non fanno parte del codice sorgente.

Architettura obiettivo:

```text
Google Sheets (solo origine controllata)
          |
          | richiesta manuale con URL/ID foglio e mappatura
          v
Supabase Edge Function
  Anteprima -> Validazione -> Conferma
          |
          v
PostgreSQL/Supabase
  righe raw -> ordini/costi/resi -> risultati leggibili
          |
          v
Web app italiana (RLS, tabelle, KPI, filtri, drill-down, export)
```

La V1 è volutamente oneshot e concentra il valore su: classificazione dei costi, fatturato, margine complessivo, margine giornaliero, margine per ordine, margine mensile e tracciamento dei resi. Code, approval multilivello, event sourcing e orchestrazioni sono fuori perimetro.

## 2. Principi invarianti

1. **Autorità economica:** solo le Invoice Back Market generano movimenti economici sorgente.
2. Export ordini, Ready vendite, Costi/Acquisti e Ready Resi sono fonti operative o di matching.
3. Un valore mancante non viene trasformato in zero; il caso interessato è sospeso e produce un'anomalia.
4. Ogni valore derivato conserva almeno fonte, batch e riga.
5. Una correzione crea un batch sostitutivo; non modifica silenziosamente i risultati esistenti.
6. I collegamenti resi sono conservativi e spiegabili; ambiguità o incoerenze non vengono forzate.
7. Il ricalcolo è un comando esplicito e produce copertura e stato del risultato.

## 3. Fonti e responsabilità

| Fonte | Ruolo | Può creare movimenti economici? | Chiave/provenienza minima |
|---|---|---:|---|
| Invoice Back Market | Autoritativa economica | Sì | file, hash, riga, `value_date`, tipo, importo, valuta |
| Export ordini | Anagrafica e matching | No | file/riga, ordine, prodotto, quantità, date |
| Ready vendite | Operativa; P.Acq. e FIFO | No | documento/riga, ordine, prodotto, P.Acq., FIFO |
| Costi/Acquisti | Costo disponibile datato | No | documento/riga, prodotto, data disponibilità, quantità, costo |
| Ready Resi | Operativa e matching resi | No | documento, numero, data, prodotto, quantità, prezzo |

Il periodo contabile deriva dalla data a livello di movimento (`value_date`), non dal nome del file.

## 4. Regole economiche

### 4.1 Costo prodotto

- Vendite dal 2026-01-01 al 2026-06-30: esclusivamente `P.Acq. Ready > 0`; altrimenti ordine sospeso.
- Vendite dal 2026-07-01:
  1. costo medio ponderato degli Acquisti disponibili con data `<= sold_at`;
  2. fallback `P.Acq. Ready > 0`;
  3. fallback FIFO Ready valido;
  4. altrimenti anomalia bloccante e ordine sospeso.
- La media ponderata è `sum(qty_disponibile * costo_unitario) / sum(qty_disponibile)` sulle righe ammissibili. Quantità nulla/negativa o costo nullo/negativo non sono ammissibili.
- Ogni scelta registra `cost_source`, record sorgenti e motivazione dei fallback.

### 4.2 Valute

- `EUR`: 1:1.
- `SEK`: forfait fisso `1 SEK = 0,09 EUR`, registrato come regola effective-dated.
- Ogni altra valuta richiede una regola esplicita, datata e approvata. In assenza, il movimento e i risultati dipendenti restano sospesi.
- Il tasso effettivamente usato è copiato nel risultato per renderlo riproducibile.

### 4.3 Parametri datati

`DHL`, `GLS`, `Investor Fee` e `Storfund Fee` sono parametri con intervallo `[valid_from, valid_to)`. Gli intervalli della stessa chiave e stesso ambito non possono sovrapporsi. Un ricalcolo storico seleziona la versione valida alla data della vendita; una modifica crea una nuova riga, non sovrascrive il passato.

### 4.4 Classificazione dei costi

Le categorie V1, filtrabili e visibili nel dettaglio ordine, sono: costo prodotto, spedizione, commissione marketplace, Investor Fee, Storfund Fee, rimborso, recupero, Backship, EPR, canone, valore del prodotto rientrato e altro. Il fatturato è classificato separatamente come ricavo. Una causale Invoice non riconosciuta resta senza categoria, genera `UNCLASSIFIED_MOVEMENT` e non viene inclusa come se fosse nota.

### 4.5 Margine vendite

Coorte degli ordini venduti nel periodo:

```text
ricavi Invoice e fee iniziali Invoice
- costo prodotto
- spedizione
- Investor Fee
- Storfund Fee
= margine vendite
```

Esclude resi, rimborsi e movimenti successivi. Se manca un componente obbligatorio, si sospende solo l'ordine coinvolto; totale, copertura e ammontare escluso restano separati.

### 4.6 Margine complessivo

Per data contabile del movimento:

```text
margine vendite attribuibile al periodo
+ rimborsi e recuperi
+ Backship, EPR, canoni e altri movimenti economici
+ valore storico verificato dei prodotti rientrati
= margine aziendale
```

Payout, transfer e deferred finanziari sono esclusi tramite classificazione versionata. Movimenti non classificati sono anomalie, non zeri.

Lo stesso risultato viene aggregato senza cambiare formula per giorno e mese. Il dettaglio per ordine mostra ricavo, costo prodotto, spedizione, commissioni e margine. La data giornaliera/mensile del margine vendite è la data di vendita; per rimborsi e altri movimenti aziendali è la data contabile Invoice.

### 4.7 Resi

Il candidato collegamento deve essere verificato su documento, numero, data, prodotto, quantità e prezzo. Una contraddizione non può essere ignorata. Esiti: `linked`, `ambiguous`, `unmatched`, `rejected`, `manual`. La conferma manuale richiede una motivazione.

### 4.8 Controlli indispensabili

La V1 produce solo cinque tipi di anomalia: provenienza riga mancante, duplicato evidente, costo mancante, ordine non collegato e movimento non classificato. Un'anomalia blocca soltanto i risultati coinvolti.

## 5. Modello dati

La migrazione `supabase/migrations/202609180001_initial_schema.sql` usa poche tabelle esplicite:

- `import_batches` (file, hash e audit leggero), `import_rows` raw;
- `orders`, `order_lines`, `invoice_movements`;
- `cost_entries`, `returns`, `return_links`;
- `parameters` effective-dated, inclusi i cambi;
- `anomalies`, `calculation_runs` con versione e copertura;
- `margin_results` per margine vendite e aziendale;
- `app_users` per RLS basilare;
- indici univoci, hash e vincoli di stato/transizione.

## 6. Import Google Sheets

Nessuna chiave amministrativa viene inserita nel foglio. L'utente autenticato avvia manualmente:

1. **Anteprima:** backend legge un range esplicito, crea batch `preview`, calcola hash e mostra il riepilogo; nessun dato diventa attivo.
2. **Validazione:** intestazioni, tipi, date, importi, chiavi e duplicati evidenti; il batch diventa `valid` solo senza errori bloccanti.
3. **Conferma:** richiesta separata con `batch_id` e hash; il batch diventa `imported`, sostituisce l'eventuale precedente per la stessa fonte e registra data/esito/errore.

Una modifica successiva al foglio non importa nulla: serve una nuova anteprima. Se l'hash letto alla conferma è diverso, la conferma fallisce e richiede nuova anteprima.

## 7. Ricalcolo

- Dopo un import o una modifica dei parametri l'operatore avvia un ricalcolo esplicito.
- Ogni run registra versione del motore, parametri, batch di input e copertura.
- Le viste giornaliera e mensile aggregano gli stessi risultati per ordine, senza un secondo motore.
- Un'anomalia blocca solo la granularità coinvolta (ordine, movimento o periodo), non l'intero archivio.

## 8. UI prevista

Sezioni V1: Riepilogo, Ordini e margini, Costi, Resi, Importazioni, Da controllare, Impostazioni.

La schermata iniziale mostra subito KPI di fatturato, margine complessivo, margine del giorno e resi collegati; seguono tabelle di andamento giornaliero, andamento mensile e composizione degli ultimi ordini.

Ogni vista dati deve offrire periodo, ricerca, filtri, KPI di copertura, stato (`definitivo`, `provvisorio`, `sospeso`), provenienza apribile, paginazione ed export del risultato filtrato. Grafici sono esclusi salvo una futura necessità dimostrabile.

## 9. Criteri di accettazione della fase

- Il progetto è fisicamente separato e non contiene CSV/dati reali.
- Lo schema copre tutte le entità richieste e vieta duplicati critici.
- RLS nega l'accesso anonimo e distingue viewer/operator/admin.
- Import Sheets ha tre azioni distinte e conferma idempotente.
- Le regole pure testano le soglie temporali, i fallback, SEK e sospensione.
- La UI mostra i sette risultati prioritari, copertura, provenienza e stato.
- Nessuna risorsa remota è stata creata o modificata.
