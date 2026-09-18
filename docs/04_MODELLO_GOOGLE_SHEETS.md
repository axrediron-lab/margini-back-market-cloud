# Modello semplice per Google Sheets

Un foglio può contenere più tab, una per fonte. Le intestazioni sono stabili e in `snake_case`. Non servono formule, script o chiavi nel foglio.

## Intestazioni minime

| Tab/fonte | Intestazioni obbligatorie | Intestazioni utili opzionali |
|---|---|---|
| Invoice | `value_date`, `movement_type`, `amount`, `currency` | `movement_id`, `order_id`, `designation`, `classification` |
| Export ordini | `order_id`, `sold_at`, `sku`, `quantity` | `line_id`, `description`, `unit_price`, `currency` |
| Ready vendite | `order_id`, `sku`, `quantity` | `document_number`, `document_date`, `ready_purchase_price`, `ready_fifo_cost` |
| Costi / Acquisti | `sku`, `available_on`, `quantity`, `unit_cost_eur` | `document_number`, `supplier` |
| Ready Resi | `document_type`, `document_number`, `document_date`, `sku`, `quantity`, `unit_price` | `currency`, `origin_document_number`, `reason` |

## Regole di compilazione

- una riga di intestazione, nessuna cella unita;
- date ISO `AAAA-MM-GG` raccomandate;
- importi come numeri, senza simboli di valuta;
- valute ISO (`EUR`, `SEK`, ecc.);
- quantità strettamente positive;
- identificativi e SKU trattati come testo;
- una riga vuota può essere ignorata, ma non interrompe la lettura;
- correzione: aggiornare il foglio, creare una nuova anteprima e confermare il batch sostitutivo.

## Anteprima sintetica

Prima della conferma l'utente vede: fonte, range, hash, numero righe, righe valide, errori, duplicati evidenti, colonne mancanti e fino a 20 esempi problematici. Non viene importato nulla finché non preme **Conferma**.
