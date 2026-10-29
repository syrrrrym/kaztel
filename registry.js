function sourceField(order, name) { return order.source_data?.fields?.[name] ?? ''; }
function statusLabel(status) {
  return {done:'Исполнено',overdue:'Просрочено',progress:'В работе',inactive:'Без отдельного исполнения'}[status] || status;
}
function scopedOrders() {
  const scoped=orders.filter(o => (o.category || 'sd') === activeRegistry &&
    (activeRegistry !== 'pk' || ((pkKind==='all' || o.source_data?.kind===pkKind) &&
      (pkYear==='all' || String(o.source_data?.year || o.issued?.slice(0,4) || '')===pkYear))));
  if(activeRegistry==='pk') scoped.sort((a,b)=>String(b.source_data?.year||'').localeCompare(String(a.source_data?.year||'')) || String(a.source_data?.kind||'').localeCompare(String(b.source_data?.kind||'')) || (a.source_data?.row||0)-(b.source_data?.row||0));
  return scoped;
}
function filteredOrders() {
  return scopedOrders().filter(o => {
    if(activeFilter!=='all' && orderStatus(o)!==activeFilter) return false;
    const haystack=[o.id,o.title,JSON.stringify(o.source_data || {}),...(o.items||[]).flatMap(i=>[i.text,i.execution_notes,userName(i.responsible)])].join(' ').toLowerCase();
    return !searchTerm || haystack.includes(searchTerm);
  });
}
function setPkKind(value) { pkKind=value; ordersPage=1; renderAll(); }
function setPkYear(value) { pkYear=value; ordersPage=1; renderAll(); }
function displayOrderNumber(order) {
  if(!order.source_data) return '№ '+order.id;
  const f=order.source_data.fields||{};
  return ['ПК № '+(f['ПК']??'—'),f['№ вопроса']!=null?'вопрос '+f['№ вопроса']:null,f['Гейт']!=null?'Гейт '+f['Гейт']:null].filter(Boolean).join(' · ');
}
function renderPagination(total) {
  const pages=Math.ceil(total/pageSize)||1;
  document.getElementById('orders-pagination').innerHTML=`<span>Найдено: ${total} · Страница ${ordersPage} из ${pages}</span><span><button class="btn-secondary" onclick="changeOrdersPage(-1)" ${ordersPage<=1?'disabled':''}>Назад</button> <button class="btn-secondary" onclick="changeOrdersPage(1)" ${ordersPage>=pages?'disabled':''}>Далее</button></span>`;
}
function changeOrdersPage(delta){ordersPage+=delta;renderOrders();document.getElementById('tab-orders').scrollIntoView({behavior:'smooth'});}
function refreshYearOptions() {
  const years=[...new Set(orders.filter(o=>o.category==='pk').map(o=>String(o.source_data?.year || o.issued?.slice(0,4) || '')).filter(Boolean))].sort().reverse();
  document.getElementById('pk-year').innerHTML='<option value="all">Все годы</option>'+years.map(y=>`<option value="${escAttr(y)}">${escHtml(y)}</option>`).join('');
  document.getElementById('pk-year').value=pkYear;
}
function renderSourceDetails(order) {
  const data=order.source_data;
  if(!data) return '';
  const kind=data.kind==='post'?'Пост-мониторинг':'Поручения и решения ПК';
  const fields=Object.entries(data.fields || {}).filter(([key,value])=>value!==null && value!=='' && !['Наименование проекта / вопроса','Поручение / решение ПК','Информация по ИСПОЛНЕНИЮ (реквизиты документов, даты и т.д.) / причины НЕИСПОЛНЕНИЯ'].includes(key));
  return `<details class="source-details"><summary>${kind} · ${escHtml(data.year)} · строка ${data.row} · исходные данные</summary>${fields.map(([k,v])=>`<div><b>${escHtml(k)}:</b> ${escHtml(v)}</div>`).join('')}${Object.entries(data.extra||{}).map(([k,v])=>`<div><b>${escHtml(k)}:</b> ${escHtml(v)}</div>`).join('')}</details>`;
}
function exportRows(selected) {
  const excludedPkColumns=new Set([
    'Дата','Наименование проекта / вопроса','Столбец N',
    'Начало поручения (актуальное)','ID пункта','Ответственный (актуальный)'
  ]);
  return selected.flatMap(order => (order.items?.length ? order.items : [null]).map(item=>{
    const fields=order.source_data?.fields || {};
    const row={
      'Реестр':(order.category||'sd')==='pk'?'ПК':'СД',
      'Источник':order.source_data ? (order.source_data.kind==='post'?'Пост-мониторинг':'Поручения и решения ПК') : '',
      'Год':order.source_data ? Number(order.source_data.year) : null,
      'Строка источника':order.source_data?.row || null,
      ...fields, ...(order.source_data?.extra||{}),
      'ID поручения':order.id,'Название поручения':order.title,
      'Дата протокола (актуальная)':excelDate(order.issued),
      'Статус поручения (актуальный)':statusLabel(orderStatus(order)),
      'Начало поручения (актуальное)':excelDate(order.date_from),
      'Срок поручения (актуальный)':excelDate(order.date_to),
      'ID пункта':item?.id || '', 'Содержание пункта':item?.text || '',
      'Ответственный (актуальный)':item?.responsible ? userName(item.responsible) : fields['Ответственный'] || '',
      'Статус пункта (актуальный)':item ? item.source_status || statusLabel(itemStatus(item)) : '',
      'Исполнение, %':item?.progress ?? null,
      'Начало пункта (актуальное)':excelDate(item?.date_from),
      'Срок пункта (актуальный)':excelDate(item?.deadline),
      'Комментарий (актуальный)':item?.execution_notes || '',
      'Последнее изменение':item?.last_at ? new Date(item.last_at) : null,
      'Изменил':item?.last_by ? userName(item.last_by) : '',
      'Файлы':[(order.order_file_name||''),...(order.attachments||[]).map(f=>f.file_name || f.name || '')].filter(Boolean).join('\n')
    };
    return order.category==='pk'
      ? Object.fromEntries(Object.entries(row).filter(([key])=>!excludedPkColumns.has(key)))
      : row;
  }));
}
function excelDate(value) {
  if(!value) return null;
  const d=new Date(value.slice(0,10)+'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
async function buildExportWorkbook(selected) {
  const rows=exportRows(selected);
  const wb=new ExcelJS.Workbook();
  wb.creator='Реестр поручений';
  const sheet=wb.addWorksheet(activeRegistry==='pk'?'Поручения ПК':'Поручения СД');
  const headers=[...new Set(rows.flatMap(Object.keys))];
  sheet.columns=headers.map(key=>({header:key,key,width:/Содержание|Комментарий|Информация|Поручение|Название|Наименование/.test(key)?65:25}));
  rows.forEach(row=>sheet.addRow(row));
  sheet.views=[{state:'frozen',ySplit:1}];
  sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:headers.length}};
  sheet.getRow(1).height=42;
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF263B50'}};cell.alignment={vertical:'middle',wrapText:true};});
  sheet.eachRow((row,n)=>{if(n===1)return; row.eachCell(cell=>{
    cell.alignment={vertical:'top',wrapText:true};
    if(cell.value instanceof Date) cell.numFmt='dd.mm.yyyy';
    // Values are passed as strings, never as formula objects or hyperlink formulas.
  });});
  return wb;
}
async function exportOrders() {
  if(registryLoadError) { alert('Данные не загружены. Обновите страницу.'); return; }
  const selected=filteredOrders();
  if(!selected.length){alert('Нет поручений для выгрузки. Измените фильтры или поиск.');return;}
  const button=document.getElementById('export-btn');
  button.disabled=true; button.textContent='Подготовка Excel…';
  try {
    if(typeof ExcelJS==='undefined') throw new Error('Библиотека Excel не загрузилась. Обновите страницу.');
    const wb=await buildExportWorkbook(selected);
    const bytes=await wb.xlsx.writeBuffer();
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=document.createElement('a');a.href=url;
    a.download=`Поручения_${activeRegistry==='pk'?'ПК':'СД'}_${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Qyzylorda'})}.xlsx`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(error) { alert('Не удалось выгрузить Excel: '+error.message); }
  finally {button.disabled=false;button.textContent='Скачать Excel';}
}
