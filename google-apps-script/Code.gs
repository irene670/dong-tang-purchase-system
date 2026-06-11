/**
 * 東瑭採購系統 Google Sheets API
 * 1. 在目標試算表中開啟「擴充功能 > Apps Script」
 * 2. 貼上本檔並部署為 Web App
 * 3. 將部署網址填入前端 VITE_GOOGLE_SCRIPT_URL
 */
const PRODUCT_SHEET_ID = 1057262128;
const ORDER_SHEET = '工作表1';
const CHANNEL_SHEET = '通路設定';
const SALES_SHEET = '銷貨單';
const MOVEMENT_SHEET = '寄售庫存異動';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActive();
    const action = e.parameter.action || 'products';
    const sheet = action === 'orders' ? getOrCreateOrderSheet_(ss)
      : action === 'channels' ? getSheet_(ss, CHANNEL_SHEET, ['通路名稱', '經銷模式', '折數百分比', '隱藏經銷價'])
      : action === 'sales' ? getSheet_(ss, SALES_SHEET, ['銷貨單號', '經銷商', '銷貨月份', '銷貨日期', '商品明細JSON', '總金額', '狀態', '附件網址', '備註', '庫存已處理'])
      : action === 'movements' ? getSheet_(ss, MOVEMENT_SHEET, ['異動編號', '日期', '經銷商', '商品ID', 'SKU', '商品名稱', '異動類型', '異動數量', '異動前', '異動後', '來源單號', '操作者', '備註'])
      : ss.getSheets().find(item => item.getSheetId() === PRODUCT_SHEET_ID);
    if (!sheet) throw new Error('找不到商品分頁 gid=' + PRODUCT_SHEET_ID);
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values.shift() || [];
    const data = values.filter(r => r.some(Boolean)).map(row =>
      headers.reduce((obj, key, i) => ({ ...obj, [key]: row[i] }), {})
    );
    return json({ ok: true, data });
  } catch (error) {
    return json({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'createOrder';
    if (action !== 'createOrder') return handleInventoryAction_(SpreadsheetApp.getActive(), action, payload);
    if (!payload.company || !payload.items || !payload.items.length) throw new Error('訂單資料不完整');
    const sheet = getOrCreateOrderSheet_(SpreadsheetApp.getActive());
    const orderNo = 'DT-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
    const detail = payload.items.map(x => `${x.name} x ${x.qty}`).join('、');
    sheet.appendRow([
      false, orderNo, payload.company, payload.contact,
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'),
      detail, payload.total, '訂單成立', '', JSON.stringify(payload.items), '未入庫'
    ]);
    sheet.getRange(sheet.getLastRow(), 1).insertCheckboxes();
    return json({ ok: true, orderNo });
  } catch (error) {
    return json({ ok: false, error: error.message });
  }
}

function handleInventoryAction_(ss, action, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (action === 'saveChannel') {
      upsertByKey_(getSheet_(ss, CHANNEL_SHEET, ['通路名稱', '經銷模式', '折數百分比', '隱藏經銷價']), payload.company, [payload.company, payload.mode, payload.discount, payload.hideDealerPrice]);
      return json({ ok: true });
    }
    if (action === 'uploadAttachment') {
      const folders = DriveApp.getFoldersByName('東瑭寄售銷貨單附件');
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('東瑭寄售銷貨單附件');
      const blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), payload.mimeType || 'application/octet-stream', payload.name);
      const file = folder.createFile(blob);
      return json({ ok: true, url: file.getUrl(), name: file.getName() });
    }
    if (action === 'adjustStock') {
      const current = currentStock_(ss, payload.company, payload.productId);
      const qty = payload.mode === 'set' ? Number(payload.value) - current : Number(payload.value);
      appendMovement_(ss, payload, qty, current, current + qty, payload.source || ('ADJ-' + Date.now()), payload.mode === 'set' ? '盤點設定' : '手動庫存調整');
      return json({ ok: true, before: current, after: current + qty });
    }
    if (action === 'shipOrder') {
      payload.items.forEach(item => {
        const source = payload.orderNo + ':' + item.productId;
        if (movementExists_(ss, source, '採購單入庫')) return;
        const current = currentStock_(ss, payload.company, item.productId);
        appendMovement_(ss, { ...payload, ...item }, Number(item.qty), current, current + Number(item.qty), source, '採購單入庫');
      });
      return json({ ok: true });
    }
    if (action === 'saveSales') return saveSales_(ss, payload);
    throw new Error('不支援的操作：' + action);
  } finally {
    lock.releaseLock();
  }
}

function saveSales_(ss, payload) {
  const sheet = getSheet_(ss, SALES_SHEET, ['銷貨單號', '經銷商', '銷貨月份', '銷貨日期', '商品明細JSON', '總金額', '狀態', '附件網址', '備註', '庫存已處理']);
  const existing = findRowByKey_(sheet, payload.id);
  const oldStatus = existing ? String(sheet.getRange(existing, 7).getValue()) : '';
  const shouldApply = ['已確認', '已請款'].includes(payload.status);
  const wasApplied = ['已確認', '已請款'].includes(oldStatus);
  if (shouldApply && !wasApplied) {
    payload.items.forEach(item => {
      const source = payload.id + ':' + item.productId;
      if (movementExists_(ss, source, '銷貨單扣庫存')) return;
      const current = currentStock_(ss, payload.company, item.productId);
      appendMovement_(ss, { ...payload, ...item }, -Number(item.qty), current, current - Number(item.qty), source, '銷貨單扣庫存');
    });
  }
  if (payload.status === '已作廢' && wasApplied) {
    payload.items.forEach(item => {
      const source = payload.id + ':VOID:' + item.productId;
      if (movementExists_(ss, source, '銷貨單作廢回沖')) return;
      const current = currentStock_(ss, payload.company, item.productId);
      appendMovement_(ss, { ...payload, ...item }, Number(item.qty), current, current + Number(item.qty), source, '銷貨單作廢回沖');
    });
  }
  const total = payload.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.price), 0);
  upsertByKey_(sheet, payload.id, [payload.id, payload.company, payload.month, payload.date, JSON.stringify(payload.items), total, payload.status, payload.attachment || '', payload.note || '', shouldApply]);
  return json({ ok: true, id: payload.id });
}

function appendMovement_(ss, payload, qty, before, after, source, type) {
  const sheet = getSheet_(ss, MOVEMENT_SHEET, ['異動編號', '日期', '經銷商', '商品ID', 'SKU', '商品名稱', '異動類型', '異動數量', '異動前', '異動後', '來源單號', '操作者', '備註']);
  sheet.appendRow(['MV-' + Date.now(), payload.date || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'), payload.company, payload.productId, payload.sku || '', payload.name || '', type, qty, before, after, source, payload.operator || 'admin', payload.note || payload.reason || '']);
}

function currentStock_(ss, company, productId) {
  const sheet = getSheet_(ss, MOVEMENT_SHEET, ['異動編號', '日期', '經銷商', '商品ID', 'SKU', '商品名稱', '異動類型', '異動數量', '異動前', '異動後', '來源單號', '操作者', '備註']);
  if (sheet.getLastRow() < 2) return 0;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues()
    .filter(row => row[2] === company && String(row[3]) === String(productId))
    .reduce((sum, row) => sum + Number(row[7] || 0), 0);
}

function movementExists_(ss, source, type) {
  const sheet = getSheet_(ss, MOVEMENT_SHEET, ['異動編號', '日期', '經銷商', '商品ID', 'SKU', '商品名稱', '異動類型', '異動數量', '異動前', '異動後', '來源單號', '操作者', '備註']);
  if (sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, 7, sheet.getLastRow() - 1, 5).getValues().some(row => row[0] === type && row[4] === source);
}

function getSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowByKey_(sheet, key) {
  if (sheet.getLastRow() < 2) return 0;
  const index = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().findIndex(row => String(row[0]) === String(key));
  return index < 0 ? 0 : index + 2;
}

function upsertByKey_(sheet, key, values) {
  const row = findRowByKey_(sheet, key);
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
}

function getOrCreateOrderSheet_(ss) {
  const sheet = ss.getSheetByName(ORDER_SHEET) || ss.insertSheet(ORDER_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['已出貨', '訂單編號', '廠商', '聯絡人', '訂購時間', '商品明細', '訂購總金額', '訂單狀態', '出貨時間', '商品明細JSON', '寄售入庫狀態']);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < 11) {
    sheet.getRange(1, 10, 1, 2).setValues([['商品明細JSON', '寄售入庫狀態']]);
  }
  return sheet;
}

/**
 * 安裝型觸發器：Apps Script > 觸發條件 > 新增觸發條件
 * 選擇 onOrderEdit、試算表、編輯時。
 */
function onOrderEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== ORDER_SHEET || range.getRow() < 2 || range.getColumn() !== 1 || e.value !== 'TRUE') return;
  const ss = e.source;
  const row = range.getRow();
  const values = sheet.getRange(row, 1, 1, 11).getValues()[0];
  const orderNo = values[1];
  const company = values[2];
  const itemsJson = values[9];
  if (!itemsJson || values[10] === '已入庫') return;
  const channelSheet = getSheet_(ss, CHANNEL_SHEET, ['通路名稱', '經銷模式', '折數百分比', '隱藏經銷價']);
  const channelRow = findRowByKey_(channelSheet, company);
  const mode = channelRow ? channelSheet.getRange(channelRow, 2).getValue() : '買斷';
  sheet.getRange(row, 8).setValue('已出貨');
  sheet.getRange(row, 9).setValue(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'));
  if (mode !== '寄售' && mode !== 'consignment') {
    sheet.getRange(row, 11).setValue('買斷不入寄售庫存');
    return;
  }
  const items = JSON.parse(itemsJson);
  handleInventoryAction_(ss, 'shipOrder', { orderNo, company, items, date: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'), operator: Session.getActiveUser().getEmail() || 'admin' });
  sheet.getRange(row, 11).setValue('已入庫');
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
