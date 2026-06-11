/**
 * 東瑭採購系統 Google Sheets API
 * 1. 在目標試算表中開啟「擴充功能 > Apps Script」
 * 2. 貼上本檔並部署為 Web App
 * 3. 將部署網址填入前端 VITE_GOOGLE_SCRIPT_URL
 */
const PRODUCT_SHEET_ID = 1057262128;
const ORDER_SHEET = '工作表1';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActive();
    const action = e.parameter.action || 'products';
    const sheet = action === 'orders'
      ? getOrCreateOrderSheet_(ss)
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
    if (!payload.company || !payload.items || !payload.items.length) throw new Error('訂單資料不完整');
    const sheet = getOrCreateOrderSheet_(SpreadsheetApp.getActive());
    const orderNo = 'DT-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
    const detail = payload.items.map(x => `${x.name} x ${x.qty}`).join('、');
    sheet.appendRow([
      false, orderNo, payload.company, payload.contact,
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'),
      detail, payload.total, '訂單成立', ''
    ]);
    sheet.getRange(sheet.getLastRow(), 1).insertCheckboxes();
    return json({ ok: true, orderNo });
  } catch (error) {
    return json({ ok: false, error: error.message });
  }
}

function getOrCreateOrderSheet_(ss) {
  const sheet = ss.getSheetByName(ORDER_SHEET) || ss.insertSheet(ORDER_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['已出貨', '訂單編號', '廠商', '聯絡人', '訂購時間', '商品明細', '訂購總金額', '訂單狀態', '出貨時間']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
