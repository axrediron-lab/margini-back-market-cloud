const screens = ['Riepilogo','Ordini e margini','Costi','Resi','Importazioni','Da controllare','Impostazioni'];
const icons = ['⌂','#','€','↩','⇧','!','⚙'];
const nav = document.querySelector('#nav');
const title = document.querySelector('#title');
const content = document.querySelector('#content');

screens.forEach((screen,index)=>{const button=document.createElement('button');button.textContent=`${icons[index]}  ${screen}`;button.addEventListener('click',()=>show(screen));nav.append(button)});

const kpi=(label,value,note)=>`<article class="kpi card"><small>${label}</small><strong>${value}</strong><em>${note}</em></article>`;
const toolbar=(extra='')=>`<div class="toolbar"><input aria-label="Cerca" placeholder="Cerca ordine, SKU o documento…"><select><option>Settembre 2026</option><option>Agosto 2026</option><option>Luglio 2026</option></select>${extra}<select><option>Tutti gli stati</option><option>Definitivo</option><option>Provvisorio</option><option>Sospeso</option></select></div>`;
const emptyRow=(columns)=>`<tr><td class="muted">Nessun dato importato</td>${'<td>—</td>'.repeat(columns-1)}</tr>`;

function summaryScreen(){return `${toolbar()}<div class="kpis">${kpi('Fatturato','—','Da Invoice Back Market')}${kpi('Margine complessivo','—','Copertura sempre visibile')}${kpi('Margine del giorno','—','Nessun dato reale')}${kpi('Resi collegati','—','Ordine e prodotto')}</div><div class="summary-grid"><section class="card table-card"><div class="table-title"><strong>Andamento giornaliero</strong><span>Fatturato e margine</span></div><table><thead><tr><th>Giorno</th><th>Fatturato</th><th>Margine</th><th>Copertura</th></tr></thead><tbody>${emptyRow(4)}</tbody></table></section><section class="card table-card"><div class="table-title"><strong>Andamento mensile</strong><span>Confronto essenziale</span></div><table><thead><tr><th>Mese</th><th>Fatturato</th><th>Margine</th><th>Resi</th></tr></thead><tbody>${emptyRow(4)}</tbody></table></section></div><section class="card table-card spaced"><div class="table-title"><strong>Ultimi ordini</strong><span>Composizione del margine</span></div><table><thead><tr><th>Ordine</th><th>Ricavo</th><th>Prodotto</th><th>Spedizione</th><th>Commissioni</th><th>Margine</th><th>Stato</th></tr></thead><tbody>${emptyRow(7)}</tbody></table></section>`}

function ordersScreen(){return `${toolbar()}<div class="kpis">${kpi('Ordini','—','Nel periodo')}${kpi('Margine medio','—','Per ordine')}${kpi('Copertura costi','—','Nessun costo inventato')}${kpi('Sospesi','—','Costo o collegamento mancante')}</div><section class="card table-card"><div class="table-title"><strong>Margine per ordine</strong><span>Drill-down sulla provenienza</span></div><table><thead><tr><th>Ordine</th><th>Data</th><th>Fatturato</th><th>Costo prodotto</th><th>Spedizione</th><th>Commissioni</th><th>Margine</th><th>Stato</th></tr></thead><tbody>${emptyRow(8)}</tbody></table></section>`}

function costsScreen(){const category='<select><option>Tutte le categorie</option><option>Prodotto</option><option>Spedizione</option><option>Commissioni marketplace</option><option>Investor Fee</option><option>Storfund Fee</option><option>Rimborsi</option><option>Backship</option><option>EPR</option><option>Canoni</option><option>Altro</option></select>';return `${toolbar(category)}<div class="kpis">${kpi('Costi totali','—','Per data contabile')}${kpi('Costo prodotto','—','Regola temporale applicata')}${kpi('Commissioni','—','Da Invoice')}${kpi('Non classificati','—','Sempre da controllare')}</div><section class="card table-card"><div class="table-title"><strong>Costi classificati</strong><span>Categoria, fonte e ordine</span></div><table><thead><tr><th>Categoria</th><th>Data</th><th>Ordine</th><th>Descrizione</th><th>Fonte</th><th>Importo</th><th>Stato</th></tr></thead><tbody>${emptyRow(7)}</tbody></table></section>`}

function returnsScreen(){return `${toolbar()}<div class="kpis">${kpi('Resi','—','Nel periodo')}${kpi('Collegati','—','Ordine e prodotto verificati')}${kpi('Ambigui','—','Nessun legame forzato')}${kpi('Valore rientrato','—','Solo valore storico verificato')}</div><section class="card table-card"><div class="table-title"><strong>Resi e collegamenti</strong><span>Documento, prodotto, quantità e prezzo</span></div><table><thead><tr><th>Documento</th><th>Data</th><th>SKU</th><th>Quantità</th><th>Ordine collegato</th><th>Valore</th><th>Esito</th></tr></thead><tbody>${emptyRow(7)}</tbody></table></section>`}

function controlsScreen(){return `${toolbar('<select><option>Tutti i controlli</option><option>Costo mancante</option><option>Ordine non collegato</option><option>Movimento non classificato</option><option>Duplicato evidente</option><option>Provenienza mancante</option></select>')}<div class="kpis">${kpi('Bloccanti','—','Numeri esclusi dai totali')}${kpi('Costo mancante','—','Ordini sospesi')}${kpi('Non collegati','—','Ordini o resi')}${kpi('Non classificati','—','Movimenti Invoice')}</div><section class="card table-card"><div class="table-title"><strong>Da controllare</strong><span>Solo anomalie indispensabili</span></div><table><thead><tr><th>Controllo</th><th>Entità</th><th>Descrizione</th><th>Fonte/riga</th><th>Stato</th></tr></thead><tbody>${emptyRow(5)}</tbody></table></section>`}

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

function settingsScreen(){return `<div class="kpis">${kpi('DHL','—','EUR per ordine')}${kpi('GLS','—','EUR per ordine')}${kpi('Investor Fee','—','% vendite')}${kpi('Storfund Fee','—','% vendite')}</div><section class="card table-card"><div class="table-title"><strong>Parametri economici</strong><span>Valori con decorrenza</span></div><div class="empty"><strong>Nessun parametro configurato</strong>SEK 0,09 e gli altri valori saranno inseriti soltanto nello stack autorizzato.</div></section>`}

function show(screen){title.textContent=screen;[...nav.children].forEach((button)=>button.classList.toggle('active',button.textContent.includes(screen)));const render={'Riepilogo':summaryScreen,'Ordini e margini':ordersScreen,'Costi':costsScreen,'Resi':returnsScreen,'Importazioni':importsScreen,'Da controllare':controlsScreen,'Impostazioni':settingsScreen};content.innerHTML=render[screen]();if(screen==='Importazioni'){importState.length=0;setupImports()}}
document.querySelector('#recalculate').addEventListener('click',()=>alert('Ricalcolo non eseguito: non esistono batch confermati.'));
show('Riepilogo');
