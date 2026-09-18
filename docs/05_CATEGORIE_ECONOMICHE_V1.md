# Categorie economiche V1

Questa è la tassonomia semplice e filtrabile usata da schema e UI.

| Categoria tecnica | Etichetta italiana | Origine prevista | Effetto |
|---|---|---|---|
| `revenue` | Fatturato | Invoice Back Market | ricavo |
| `product_cost` | Costo prodotto | calcolo da Costi/Ready | costo |
| `shipping` | Spedizione | parametro DHL/GLS | costo |
| `marketplace_fee` | Commissione marketplace | Invoice Back Market | costo/rettifica secondo segno Invoice |
| `investor_fee` | Investor Fee | parametro datato | costo |
| `storfund_fee` | Storfund Fee | parametro datato | costo |
| `refund` | Rimborso | Invoice Back Market | movimento aziendale secondo segno Invoice |
| `recovery` | Recupero | Invoice Back Market | movimento aziendale secondo segno Invoice |
| `backship` | Backship | Invoice Back Market | movimento aziendale secondo segno Invoice |
| `epr` | EPR | Invoice Back Market | costo/movimento aziendale |
| `subscription` | Canone | Invoice Back Market | costo aziendale |
| `returned_product_value` | Valore prodotto rientrato | reso verificato | valore positivo solo se verificato |
| `other` | Altro classificato | Invoice Back Market | secondo regola esplicita |

## Regola prudenziale

La categoria non viene dedotta liberamente dal testo. Serve una mappatura esplicita della causale Invoice. Una causale non presente nella mappatura genera `UNCLASSIFIED_MOVEMENT`, resta esclusa dal totale interessato e appare in **Da controllare**.

La mappatura puntuale delle causali reali non è ancora compilata perché in questa fase non sono state lette Invoice operative. Potrà essere preparata con accesso in sola lettura a un elenco delle causali, senza importare i file nel repository.
