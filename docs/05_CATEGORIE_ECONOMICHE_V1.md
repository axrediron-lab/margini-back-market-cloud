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

## Mappatura causali Invoice

| Causale o regola | Categoria | Margine vendite | Margine aziendale |
|---|---|---:|---:|
| `sales`, `sales_dp_adjustment` | `revenue` | sì | sì |
| `sales_fees`, `dp_adjustment_fee`, `ccbm_fees`, `payment_fees`, `paypal_fees`, `klarna_fees`, `oney_fees`, `scalapay_fees` | `marketplace_fee` | sì | sì |
| `refunds`, prefisso `refund_` | `refund` | no | sì |
| `avoir_sales_fees`, `dp_adjustment_fee_refund`, `deals_commission_discount`, `credit_requests`, `regularization_chargeback` | `recovery` | no | sì |
| contiene `backship` | `backship` | no | sì |
| contiene `epr` o `eco_participation` | `epr` | no | sì |
| contiene `monthly_fee` | `subscription` | no | sì |
| `bonus_marketing`, `allowance`, `general_cost`, `adjustment` | `other` | no | sì |
| prefisso `deferred_payout_`, prefisso `transfer_`, `payment`, `payments`, `payout` | finanziario | no | escluso |

`sales_dp_adjustment` contribuisce ai ricavi ma non crea da solo la data di vendita. Una causale non elencata genera `UNCLASSIFIED_MOVEMENT`.
