# 東瑭國際客戶採購系統

## 啟動

```bash
npm install
npm run dev
```

## Google Sheets 串接

商品分頁使用原試算表的 `gid=1057262128`，訂單寫入 `工作表1`。

1. 將 `google-apps-script/Code.gs` 更新至該試算表的 Apps Script。
2. 重新部署 Web App，執行身分選擇擁有者。
3. `.env` 的 `VITE_GOOGLE_SCRIPT_URL` 已設定為目前部署網址。

`工作表1` 會接收：出貨核取方塊、訂單編號、廠商、聯絡人、訂購時間、商品明細、總金額、訂單狀態與出貨時間。

## 管理後台

- 公司名稱：`admin`
- 密碼：`admin`
- 可編輯首頁主視覺、新品通知、活動、展示架說明及商品顯示內容。
- 第一版內容儲存在瀏覽器 `localStorage`，只會套用於同一台裝置。正式多人管理建議改接資料庫並使用後端身分驗證。
