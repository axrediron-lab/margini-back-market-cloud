const screens = ['Riepilogo','Ordini e margini','Costi','Resi','Importazioni','Da controllare','Impostazioni'];
const icons = ['⌂','#','€','↩','⇧','!','⚙'];
const nav = document.querySelector('#nav');
const title = document.querySelector('#title');
const content = document.querySelector('#content');
let dashboard=null;
let currentScreen='Riepilogo';

screens.forEach((screen,index)=>{const button=document.createElement('button');button.textContent=`${icons[index]}  ${screen}`;button.addEventListener('click',()=>show(screen));nav.append(button)});

const kpi=(label,value,note)=>`<article class="kpi card"><small>${label}</small><strong>${value}</strong><em>${note}</em></article>`;
const toolbar=(extra='')=>`<div class="toolbar"><input aria-label="Cerca" placeholder="Cerca ordine, SKU o documento…"><select><option>Settembre 2026</option><option>Agosto 2026</option><option>Luglio 2026</option></select>${extra}<select><option>Tutti gli stati</option><option>Definitivo</option><option>Provvisorio</option><option>Sospeso</option></select></div>`;
const emptyRow=(columns)=>`<tr><td class="muted">Nessun dato importato</td>${'<td>—</td>'.repeat(columns-1)}</tr>`;
const money=(value)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(value)):'—';
const percent=(value)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?`${Number(value).toLocaleString('it-IT',{maximumFractionDigits:2})}%`:'—';
const statusPill=(status)=>`<span class="pill ${status==='suspended'?'red':status==='provisional'?'amber':'green'}">${status==='suspended'?'Sospeso':status==='provisional'?'Provvisorio':'Definitivo'}</span>`;

function orderRows(limit=10){
  if(!dashboard?.latestOrders?.length)return emptyRow(8);
  return dashboard.latestOrders.slice(0,limit).map((order)=>`<tr><td>${escapeHtml(order.marketplaceOrderId||'—')}</td><td>${order.date}</td><td>${money(order.revenue)}</td><td>${money(-(order.product_cost||0))}</td><td>${money(-(order.shipping||0))}</td><td>${money(-(order.marketplace_fee||0))}</td><td>${money(order.margin)}</td><td>${statusPill(order.status)}</td></tr>`).join('');
}

function summaryScreen(){const s=dashboard?.summary;const last=dashboard?.daily?.at(-1);const daily=dashboard?.daily?.length?dashboard.daily.slice(-10).reverse().map((row)=>`<tr><td>${row.date}</td><td>${money(row.revenueEur)}</td><td>${money(row.marginEur)}</td><td>${row.orders} ordini</td></tr>`).join(''):emptyRow(4);const monthly=dashboard?.monthly?.length?dashboard.monthly.map((row)=>`<tr><td>${row.month}</td><td>${money(row.revenueEur)}</td><td>${money(row.marginEur)}</td><td>${s.returns}</td></tr>`).join(''):emptyRow(4);return `${toolbar()}<div class="kpis">${kpi('Fatturato',money(s?.revenueEur),dashboard?`${s.totalOrders} ordini Invoice`:'Da Invoice Back Market')}${kpi('Margine complessivo',money(s?.companyMarginEur),dashboard?'Include rimborsi e recuperi':'Copertura sempre visibile')}${kpi('Margine ultimo giorno',money(last?.marginEur),last?.date||'Nessun ricalcolo')}${kpi('Resi collegati',dashboard?`${s.linkedReturns} / ${s.returns}`:'—','Collegamenti conservativi')}</div><div class="summary-grid"><section class="card table-card"><div class="table-title"><strong>Andamento giornaliero</strong><span>Fatturato e margine</span></div><table><thead><tr><th>Giorno</th><th>Fatturato</th><th>Margine</th><th>Copertura</th></tr></thead><tbody>${daily}</tbody></table></section><section class="card table-card"><div class="table-title"><strong>Andamento mensile</strong><span>Confronto essenziale</span></div><table><thead><tr><th>Mese</th><th>Fatturato</th><th>Margine vendite</th><th>Resi</th></tr></thead><tbody>${monthly}</tbody></table></section></div><section class="card table-card spaced"><div class="table-title"><strong>Ultimi ordini</strong><span>Composizione del margine</span></div><table><thead><tr><th>Ordine</th><th>Data</th><th>Ricavo</th><th>Prodotto</th><th>Spedizione</th><th>Commissioni</th><th>Margine</th><th>Stato</th></tr></thead><tbody>${orderRows(10)}</tbody></table></section>`}

function ordersScreen(){const s=dashboard?.summary;const avg=s?.coveredOrders?s.salesMarginEur/s.coveredOrders:null;return `${toolbar()}<div class="kpis">${kpi('Ordini',s?.totalOrders??'—','Nel periodo')}${kpi('Margine medio',money(avg),'Per ordine coperto')}${kpi('Copertura costi',percent(s?.percent),'Nessun costo inventato')}${kpi('Sospesi',s?.suspendedOrders??'—','Costo o collegamento mancante')}</div><section class="card table-card"><div class="table-title"><strong>Margine per ordine</strong><span>Ultimi 30 ordini</span></div><table><thead><tr><th>Ordine</th><th>Data</th><th>Fatturato</th><th>Costo prodotto</th><th>Spedizione</th><th>Commissioni</th><th>Margine</th><th>Stato</th></tr></thead><tbody>${orderRows(30)}</tbody></table></section>`}

function costsScreen(){const s=dashboard?.summary;const category='<select><option>Tutte le categorie</option><option>Prodotto</option><option>Spedizione</option><option>Commissioni marketplace</option><option>Investor Fee</option><option>Storfund Fee</option><option>Rimborsi</option></select>';const total=s? s.productCostEur+s.shippingEur+s.marketplaceFeesEur+s.investorFeesEur+s.storfundFeesEur:null;return `${toolbar(category)}<div class="kpis">${kpi('Costi vendite',money(total),'Ordini coperti')}${kpi('Costo prodotto',money(s?.productCostEur),'Gerarchia temporale applicata')}${kpi('Commissioni',money(s?.marketplaceFeesEur),'Da Invoice')}${kpi('Spedizione',money(s?.shippingEur),'Una per ordine')}</div><section class="card table-card"><div class="table-title"><strong>Riepilogo costi</strong><span>Primo run locale</span></div><table><thead><tr><th>Categoria</th><th>Importo</th><th>Fonte</th></tr></thead><tbody>${s?`<tr><td>Prodotto</td><td>${money(s.productCostEur)}</td><td>Acquisti → P.Acq. → FIFO</td></tr><tr><td>Spedizione</td><td>${money(s.shippingEur)}</td><td>Parametri DHL/GLS</td></tr><tr><td>Commissioni marketplace</td><td>${money(s.marketplaceFeesEur)}</td><td>Invoice</td></tr><tr><td>Investor Fee</td><td>${money(s.investorFeesEur)}</td><td>Parametro datato</td></tr><tr><td>Storfund Fee</td><td>${money(s.storfundFeesEur)}</td><td>Parametro datato</td></tr>`:emptyRow(3)}</tbody></table></section>`}

function returnsScreen(){const s=dashboard?.summary;const unlinked=(s?.returns??0)-(s?.linkedReturns??0);return `${toolbar()}<div class="kpis">${kpi('Resi',s?.returns??'—','Nel file Ready')}${kpi('Collegati',s?.linkedReturns??'—','Ordine e prodotto verificati')}${kpi('Da controllare',dashboard?unlinked:'—','Nessun legame forzato')}${kpi('Valore rientrato','—','Solo dopo verifica storica')}</div><section class="card table-card"><div class="table-title"><strong>Resi e collegamenti</strong><span>Stato conservativo</span></div><div class="empty"><strong>${dashboard?`${unlinked} resi da controllare`:'Nessun dato'}</strong>Il periodo Ready vendite fornito non contiene righe sufficienti per un collegamento completo.</div></section>`}

function controlsScreen(){const a=dashboard?.anomalyCounts??{};const blocking=(a.MISSING_COST??0)+(a.MISSING_CARRIER??0)+(a.AMBIGUOUS_CARRIER??0)+(a.UNLINKED_ORDER??0);return `${toolbar('<select><option>Tutti i controlli</option><option>Costo mancante</option><option>Ordine non collegato</option><option>Movimento non classificato</option><option>Reso non collegato</option></select>')}<div class="kpis">${kpi('Bloccanti',dashboard?blocking:'—','Numeri esclusi dai totali')}${kpi('Costo mancante',a.MISSING_COST??'—','Ordini sospesi')}${kpi('Resi non collegati',a.UNLINKED_RETURN??'—','Revisione manuale')}${kpi('Non classificati',a.UNCLASSIFIED_MOVEMENT??'—','Movimenti Invoice')}</div><section class="card table-card"><div class="table-title"><strong>Da controllare</strong><span>Solo anomalie indispensabili</span></div><table><thead><tr><th>Controllo</th><th>Quantità</th><th>Effetto</th><th>Stato</th></tr></thead><tbody>${dashboard?Object.entries(a).map(([code,count])=>`<tr><td>${escapeHtml(code)}</td><td>${count}</td><td>${code==='UNLINKED_RETURN'?'Non modifica i margini':'Esclusione del risultato coinvolto'}</td><td><span class="pill amber">Aperto</span></td></tr>`).join(''):emptyRow(4)}</tbody></table></section>`}

function importsScreen(){return `<div class="import-grid"><section class="card import-form"><div class="steps"><span class="step current">1 Anteprima</span><span class="step">2 Validazione</span><span class="step">3 Conferma</span></div><h2>Importa CSV sul database locale</h2><label for="csv-files">Seleziona uno o più file</label><input id="csv-files" type="file" accept=".csv,text/csv" multiple><p class="footnote">La fonte viene riconosciuta dalle intestazioni. Il file non entra nel repository e l’anteprima non scrive nel database.</p><button class="primary" id="preview">Analizza file</button></section><aside class="card help"><h3>Controlli essenziali</h3><ul><li>intestazioni e tipi</li><li>hash del file e riga fisica</li><li>dati mancanti o non classificati</li><li>conferma manuale, mai automatica</li></ul><p id="import-message" class="footnote">Pronto per una prova locale.</p></aside></div><section class="card table-card spaced"><div class="table-title"><strong>Anteprime</strong><span id="preview-count">Nessun file analizzato</span></div><div id="import-results" class="import-results"><div class="empty"><strong>Nessuna anteprima</strong>Seleziona i CSV e analizzali insieme.</div></div></section>`}

const sourceLabels={invoice:'Invoice Back Market',orders:'Export ordini Back Market',ready_sales:'Vendite Ready',purchases:'Costi / Acquisti',ready_returns:'Resi Ready'};
const escapeHtml=(value)=>String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const errorLabels={UNKNOWN_SOURCE_HEADERS:'Intestazioni non riconosciute',FILE_TOO_LARGE:'File troppo grande',EMPTY_FILE:'File vuoto',INVALID_JSON:'Richiesta non valida',PREVIEW_EXPIRED:'Anteprima scaduta: analizza di nuovo il file',PREVIEW_HASH_MISMATCH:'Il contenuto non corrisponde più all’anteprima',PREVIEW_HAS_ERRORS:'Correggi gli errori prima di confermare',LOCAL_SUPABASE_UNAVAILABLE:'Supabase locale non è avviato',LOCAL_SUPABASE_CREDENTIALS_UNAVAILABLE:'Configurazione Supabase locale non disponibile',REMOTE_SUPABASE_BLOCKED:'L’operatore locale rifiuta connessioni a Supabase remoto',LOCAL_DATABASE_ERROR:'Errore del database locale'};
const importState=[];

function importCard(item){
  if(item.error)return `<article class="import-result error"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(errorLabels[item.error]||item.error)}</span></article>`;
  const p=item.preview;const issueText=p.issues.length?`${p.issues.length} anomalie mostrate su massimo 20`:'Nessuna anomalia';
  const action=p.saved?`<span class="pill green">${p.inserted?'Importato':'Già presente'}</span>`:p.canConfirm?`<button class="confirm-import" data-preview-id="${p.previewId}" data-hash="${p.contentSha256}">Conferma nel database locale</button>`:`<span class="pill red">Correzione necessaria</span>`;
  return `<article class="import-result"><div><strong>${escapeHtml(p.sourceName)}</strong><small>${escapeHtml(sourceLabels[p.source]||p.source)} · righe ${p.rowCount}</small></div><div class="import-metrics"><span>Valide <b>${p.validCount}</b></span><span>Errori <b>${p.errorCount}</b></span><span>Avvisi <b>${p.warningCount}</b></span><span>Ignorate <b>${p.ignoredCount}</b></span></div><small>${issueText}</small><div>${action}</div></article>`;
}

function renderImports(){
  const results=document.querySelector('#import-results');if(!results)return;
  results.innerHTML=importState.length?importState.map(importCard).join(''):`<div class="empty"><strong>Nessuna anteprima</strong>Seleziona i CSV e analizzali insieme.</div>`;
  document.querySelector('#preview-count').textContent=importState.length?`${importState.length} file analizzati`:'Nessun file analizzato';
}

async function parseResponse(response){const payload=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));if(!response.ok)throw new Error(payload.error||'REQUEST_FAILED');return payload}

function setupImports(){
  document.querySelector('#preview')?.addEventListener('click',async()=>{
    const files=[...(document.querySelector('#csv-files')?.files||[])];const message=document.querySelector('#import-message');
    if(!files.length){message.textContent='Seleziona almeno un file CSV.';return}
    message.textContent=`Analisi di ${files.length} file in corso…`;importState.length=0;renderImports();
    for(const file of files){
      try{
        const response=await fetch('/api/imports/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceName:file.name,content:await file.text()})});
        importState.push({name:file.name,preview:await parseResponse(response)});
      }catch(error){importState.push({name:file.name,error:error.message})}
      renderImports();
    }
    message.textContent='Anteprima completata. Controlla i conteggi prima di confermare.';
  });
  document.querySelector('#import-results')?.addEventListener('click',async(event)=>{
    const button=event.target.closest('.confirm-import');if(!button)return;
    button.disabled=true;button.textContent='Conferma in corso…';
    try{
      const response=await fetch('/api/imports/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({previewId:button.dataset.previewId,contentSha256:button.dataset.hash})});
      const saved=await parseResponse(response);const item=importState.find((entry)=>entry.preview?.previewId===button.dataset.previewId);Object.assign(item.preview,{saved:true,...saved});renderImports();
      document.querySelector('#import-message').textContent=saved.inserted?'Batch salvato nel database locale.':'Questo identico file era già presente: nessuna duplicazione.';
    }catch(error){button.disabled=false;button.textContent='Riprova conferma';document.querySelector('#import-message').textContent=errorLabels[error.message]||error.message}
  });
}

function settingsScreen(){const params=dashboard?.parameters??[];const latest=(key)=>params.filter((p)=>p.key===key).sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0];const rate=(key)=>{const p=latest(key);if(!p)return '—';return p.unit==='PERCENT_OF_SALES'?percent(Number(p.value)*100):money(p.value)};return `<div class="kpis">${kpi('DHL',rate('shipping_dhl'),'EUR per ordine')}${kpi('GLS',rate('shipping_gls'),'EUR per ordine')}${kpi('Investor Fee',rate('investor_fee'),'% vendite')}${kpi('Storfund Fee',rate('storfund_fee'),'% vendite')}</div><section class="card table-card"><div class="table-title"><strong>Parametri economici</strong><span>Valori con decorrenza</span></div><table><thead><tr><th>Parametro</th><th>Dal</th><th>Al</th><th>Valore</th><th>Nota</th></tr></thead><tbody>${params.length?params.map((p)=>`<tr><td>${escapeHtml(p.key)}</td><td>${p.valid_from}</td><td>${p.valid_to||'in corso'}</td><td>${p.unit==='PERCENT_OF_SALES'?percent(Number(p.value)*100):money(p.value)}</td><td>${escapeHtml(p.note)}</td></tr>`).join(''):emptyRow(5)}</tbody></table></section>`}

function show(screen){currentScreen=screen;title.textContent=screen;[...nav.children].forEach((button)=>button.classList.toggle('active',button.textContent.includes(screen)));const render={'Riepilogo':summaryScreen,'Ordini e margini':ordersScreen,'Costi':costsScreen,'Resi':returnsScreen,'Importazioni':importsScreen,'Da controllare':controlsScreen,'Impostazioni':settingsScreen};content.innerHTML=render[screen]();if(screen==='Importazioni'){importState.length=0;setupImports()}}
async function refreshDashboard(){const response=await fetch('/api/dashboard');const payload=await parseResponse(response);dashboard=payload.dashboard;show(currentScreen)}
document.querySelector('#recalculate').addEventListener('click',async(event)=>{const button=event.currentTarget;button.disabled=true;button.textContent='Ricalcolo…';try{await parseResponse(await fetch('/api/recalculate',{method:'POST'}));await refreshDashboard()}catch(error){alert(errorLabels[error.message]||error.message)}finally{button.disabled=false;button.textContent='Ricalcola'}});
show('Riepilogo');
refreshDashboard().catch(()=>{});
