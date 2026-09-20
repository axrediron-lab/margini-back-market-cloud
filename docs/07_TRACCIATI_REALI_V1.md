# Tracciati reali V1

Questa nota fissa il comportamento verificato sui sei file campione esterni. I CSV operativi non vengono copiati nel repository.

## Invoice Back Market

Tutte le sette colonne originali vengono acquisite. `amount` mantiene il segno Invoice e `value_date` è la data contabile. EUR resta invariato; SEK usa `1 SEK = 0,09 EUR` con arrotondamento a due decimali per movimento. La data di vendita è la prima `value_date` di un movimento `sales` positivo.

L'ordine viene normalizzato rimuovendo soltanto il prefisso `BM` e un eventuale `.0` finale. Non sono ammesse corrispondenze parziali. Gli avoir e gli sconti commissione possono recuperare l'ordine dai pattern documentati in `designation`.

## Export ordini Back Market

È una fonte operativa e non sostituisce mai gli importi Invoice. La chiave logica è `order_id + orderline_id`; gli snapshot sovrapposti aggiornano la stessa riga senza sommarla. I dati personali vengono esclusi prima della persistenza.

## Ready vendite

Conserva ordine, codice prodotto interno, quantità, prezzo di matching, `P.Acq.`, FIFO, vettore e documento Ready. Un ordine numerico senza prefisso `BM` richiede riscontro completo nelle fonti disponibili. Il vettore viene normalizzato a DHL o GLS.

## Costi / Acquisti

Solo righe con data valida, `Cod.`, quantità positiva e prezzo positivo partecipano al costo medio ponderato. Righe `Rif. Ord.f.` e totali sono contestuali e vengono ignorate economicamente. Il prezzo è unitario; il valore della riga è quantità per prezzo.

## Ready Resi

Le righe sono raggruppate per numero e data del documento reso. Le righe contestuali `Rif. Ric.` e `Ordine ...` aiutano il collegamento ma non diventano resi prodotto. IMEI e seriali non vengono conservati. Il reso è operativo: rimborsi e rettifiche economiche provengono esclusivamente dalle Invoice.

Il collegamento automatico richiede corrispondenza non ambigua di documento origine, ordine, prodotto, quantità disponibile, prezzo entro `0,005` e sequenza temporale valida. Altrimenti il reso resta da controllare.

## Copertura verificata

| Fonte | Periodo | Righe valide o economiche |
|---|---|---:|
| Invoice EUR | 28/08/2026–15/09/2026 | 5.309 |
| Invoice SEK | 02/09/2026–15/09/2026 | 31 |
| Ready vendite | 27/08/2026–09/09/2026 | 1.857 |
| Costi / Acquisti | 03/08/2026–09/09/2026 | 174 |
| Export ordini | 13/08/2026–26/08/2026 | 2.295 |
| Ready Resi | 13/08/2026–26/08/2026 | 165 righe prodotto |

Le 1.034 vendite Invoice positive hanno tutte un ordine Ready e nessuna riga nel particolare export fornito, che termina prima. L'export è quindi utile ma non obbligatorio quando Invoice e Ready sono entrambe valide.
