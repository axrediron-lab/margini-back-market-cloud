# Primo run economico locale

## Perimetro

Il run locale usa i sei batch confermati e copre i movimenti Invoice dal 28 agosto al 15 settembre 2026. I CSV restano esterni al repository. I valori sottostanti sono risultati persistiti nel solo Supabase locale.

## Normalizzazione

| Entità | Righe |
|---|---:|
| Ordini complessivi | 4.088 |
| Ordini verificati Invoice + Ready | 1.034 |
| Righe ordine | 4.152 |
| Movimenti Invoice | 5.340 |
| Record costo | 3.373 |
| Resi prodotto | 165 |

La normalizzazione è idempotente: una seconda esecuzione conserva gli stessi conteggi. Ogni movimento, costo, riga vendita e reso mantiene il riferimento alla riga fisica importata.

## Risultati

| Indicatore | Valore |
|---|---:|
| Fatturato Invoice degli ordini coperti | 312.594,29 EUR |
| Margine vendite | 15.143,86 EUR |
| Copertura | 1.034 su 1.034 ordini, 100% |
| Ordini sospesi | 0 |
| Margine complessivo | -36.222,60 EUR |

Il margine complessivo è inferiore al margine vendite perché aggiunge i movimenti aziendali successivi: rimborsi per -51.421,55 EUR e recuperi per +55,09 EUR. I quattro movimenti finanziari sono esclusi. Nessuna causale Invoice è rimasta non classificata.

## Costi degli ordini coperti

| Componente | Valore |
|---|---:|
| Costo prodotto | 235.748,41 EUR |
| Spedizione | 14.662,50 EUR |
| Commissioni marketplace attribuite | 43.960,34 EUR |
| Investor Fee | 3.079,18 EUR |
| Storfund Fee | 0,00 EUR |

Il costo prodotto segue la gerarchia datata Acquisti, poi `P.Acq.`, poi FIFO. Spedizione e percentuali usano i parametri validi alla prima `sales` Invoice positiva.

## Consultazione locale

La schermata **Ordini e margini** espone tutti i 1.034 ordini verificati e permette di filtrarli per periodo, vettore, stato o numero ordine. Aprendo un ordine si vedono la composizione del margine, le righe prodotto, la fonte costo effettivamente selezionata e i movimenti Invoice. Ogni elemento mostra anche il file CSV e la riga fisica di provenienza; per i movimenti SEK restano visibili sia l'importo originale sia quello convertito in EUR.

## Resi

I 165 resi restano `unmatched`. Il file Ready vendite fornito parte dal 27 agosto, mentre i resi coprono il periodo precedente fino al 26 agosto; mancano quindi righe vendita complete per verificare insieme ordine, prodotto, quantità e prezzo. Nessun collegamento è stato forzato e nessun valore del prodotto rientrato è stato aggiunto al margine.
