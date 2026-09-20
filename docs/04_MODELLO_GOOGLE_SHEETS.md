# Modello semplice per Google Sheets e CSV

Il sistema riconosce la fonte dalle intestazioni originali, non dal nome del file o del foglio. Un foglio può contenere più tab, una per fonte. Non servono formule, script o chiavi nel foglio.

## Firme minime dei tracciati reali

| Fonte | Intestazioni caratteristiche |
|---|---|
| Invoice Back Market | `invoice_key`, `value_date`, `amount`, `currency` |
| Export ordini Back Market | `order_id`, `orderline_id`, `date_creation` |
| Ready vendite | `N.ord.web`, `P.Acq.` |
| Costi / Acquisti | `Intestatario`, `Prezzo`, `Quant.` |
| Ready Resi | `Doc. origine`, `Pagamento` |

Invoice usa la virgola come delimitatore. Gli altri CSV usano il punto e virgola. Il parser elimina il BOM UTF-8, rispetta campi tra virgolette e distingue i decimali italiani da quelli Invoice.

## Regole comuni

- conservare file, hash SHA-256, batch e numero fisico della riga;
- lo stesso hash per la stessa fonte non viene importato due volte;
- identificativi e codici prodotto restano testo;
- gli importi Invoice conservano importo, valuta e segno originali;
- una riga vuota può essere ignorata senza interrompere la lettura;
- più file storici della stessa fonte possono convivere;
- una nuova anteprima è obbligatoria dopo qualunque modifica del file o foglio.

## Minimizzazione dei dati personali

L'export ordini contiene dati cliente non necessari ai margini. Il payload normalizzato e il raw consentito escludono nomi, indirizzi, email, telefoni, IMEI, seriali, URL e riferimenti di pagamento. Restano soltanto identificativi ordine/riga, date, stato, prodotto, quantità, paese, corriere, valuta e campi di matching autorizzati.

## Anteprima

Prima della conferma l'utente vede fonte, hash, copertura temporale, righe valide, ignorate, errori e avvisi. Nessun dato viene scritto finché non viene implementata e autorizzata la conferma persistente.
