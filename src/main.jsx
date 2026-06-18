import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  acceptInvite, getUser, handleAuthCallback, login as identityLogin,
  logout as identityLogout, recoverPassword, requestPasswordRecovery
} from "./auth";
import {
  Search, ShoppingBag, Plus, Minus, Trash2, ChevronRight,
  PackageCheck, Truck, ClipboardCheck, FileDown, LogOut, UserRound,
  RefreshCw, CheckCircle2, Clock3, Menu, Megaphone, Store, CalendarDays,
  LayoutDashboard, Save, Image, Settings, Database
  , Warehouse, FileText, History, SlidersHorizontal, Upload
} from "lucide-react";
import { calculatePricing, normalizePricingSettings, pricingDescription } from "../shared/pricing.mjs";
import "./styles.css";

const STORE_API = "https://eavo.com.tw/wp-json/wc/store/v1";
const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;

const fallbackProducts = [
  { id: 92725, name: "Linknity NFC 家庭智能鑰匙圈-小動物 (GC)", price: 580, category: "IP 授權", image: "https://eavo.com.tw/wp-content/uploads/2026/05/GC.jpg", sku: "92725" },
  { id: 92715, name: "Linknity NFC 家庭智能鑰匙圈-小動物 (JV)", price: 580, category: "IP 授權", image: "https://eavo.com.tw/wp-content/uploads/2026/05/JV.jpg", sku: "92715" },
  { id: 78366, name: "迷你拼拼車－波力", price: 290, category: "親子系列", image: "https://eavo.com.tw/wp-content/uploads/2024/11/78366.jpg", sku: "78366" },
  { id: 80776, name: "動物搖搖好朋友萬年曆", price: 390, category: "文具／飾品", image: "https://eavo.com.tw/wp-content/uploads/2025/04/動物搖搖好朋友萬年曆-1.jpg", sku: "80776" },
  { id: 71001, name: "台灣古蹟木製拼圖", price: 450, category: "DIY 拼圖", image: "https://eavo.com.tw/wp-content/uploads/2023/07/台灣古蹟拼圖.jpg", sku: "71001" },
  { id: 71002, name: "KEY HOUSE 木質鑰匙圈", price: 320, category: "KEY HOUSE", image: "https://eavo.com.tw/wp-content/uploads/2023/07/key-house.jpg", sku: "71002" }
];

const demoOrders = [
  { id: "DT-20260608-018", date: "2026/06/08", amount: 12480, status: "已出貨", eta: "2026/06/11", items: 6 },
  { id: "DT-20260526-007", date: "2026/05/26", amount: 5860, status: "已完成", eta: "2026/05/29", items: 3 }
];

const defaultContent = {
  heroTitle: "通路夥伴情報站",
  heroText: "新品、陳列資源與檔期活動一次掌握，快速完成每一次採購。",
  heroImage: "https://eavo.com.tw/wp-content/uploads/2026/05/GC.jpg",
  newTitle: "Linknity NFC 智能鑰匙圈系列",
  newText: "全新角色款式上市，結合日常配件與 NFC 智能應用，歡迎通路夥伴洽詢首批優惠。",
  newImage: "https://eavo.com.tw/wp-content/uploads/2026/05/JV.jpg",
  eventTitle: "夏季新品陳列活動",
  eventText: "指定新品系列達採購門檻，即享通路陳列素材與活動支援。",
  eventDate: "2026.06.15 - 2026.08.31",
  displayTitle: "申請專屬展示架",
  displayText: "需要桌上型展示架、商品立牌或陳列建議？送出需求後將由業務專人聯繫。"
};

const demoFrequent = {
  92725: { orderCount: 8, totalQty: 96 },
  92715: { orderCount: 6, totalQty: 72 },
  78366: { orderCount: 5, totalQty: 48 },
  80776: { orderCount: 3, totalQty: 24 }
};

const productBadgeOptions = [
  { key: "hot", label: "熱銷" },
  { key: "new", label: "新品" },
  { key: "recommended", label: "推薦" },
  { key: "limited", label: "限量" }
];

const orderStatusFlow = ["訂單成立", "已確認", "備貨中", "已出貨", "已完成"];
const orderStatusOptions = [...orderStatusFlow, "已取消"];

const defaultBadges = {
  92725: ["new", "hot"],
  92715: ["new"],
  78366: ["hot", "recommended"],
  80776: ["recommended"],
  71001: ["limited"]
};

const defaultChannels = {
  "好日子設計有限公司": { mode: "consignment", discount: 65, hideDealerPrice: false, taxMode: "included", taxRate: 5, calculationScope: "line", roundingMode: "round", roundingDigits: 0 },
  "誠品生活": { mode: "buyout", discount: 60, hideDealerPrice: false, taxMode: "included", taxRate: 5, calculationScope: "line", roundingMode: "round", roundingDigits: 0 },
  "測試通路": { mode: "consignment", discount: 70, hideDealerPrice: true, taxMode: "included", taxRate: 5, calculationScope: "line", roundingMode: "round", roundingDigits: 0 }
};

function loadChannels() {
  const stored = JSON.parse(localStorage.getItem("dt-channels") || "null") || defaultChannels;
  return Object.fromEntries(Object.entries(stored).map(([name, value]) => [name, {
    mode: value.mode || defaultChannels[name]?.mode || "buyout",
    discount: value.discount ?? 100,
    hideDealerPrice: Boolean(value.hideDealerPrice),
    ...normalizePricingSettings(value)
  }]));
}

const defaultMovements = [
  { id: "MV-001", date: "2026/05/20", company: "好日子設計有限公司", productId: 92725, type: "採購單入庫", qty: 30, before: 0, after: 30, source: "DT-20260520-006", operator: "admin", note: "首批寄售入庫" },
  { id: "MV-002", date: "2026/05/31", company: "好日子設計有限公司", productId: 92725, type: "銷貨單扣庫存", qty: -8, before: 30, after: 22, source: "SO-202605-001", operator: "admin", note: "五月銷貨" },
  { id: "MV-003", date: "2026/06/02", company: "好日子設計有限公司", productId: 92715, type: "採購單入庫", qty: 20, before: 0, after: 20, source: "DT-20260602-011", operator: "admin", note: "" },
  { id: "MV-004", date: "2026/06/08", company: "好日子設計有限公司", productId: 78366, type: "採購單入庫", qty: 12, before: 0, after: 12, source: "DT-20260608-018", operator: "admin", note: "" }
];

const defaultSales = [
  { id: "SO-202605-001", company: "好日子設計有限公司", month: "2026-05", date: "2026-05-31", status: "已確認", note: "五月銷售回報", attachment: "好日子_2026年05月銷貨單.pdf", items: [{ productId: 92725, qty: 8, price: 377 }] }
];

function historyKey(company) {
  return `dt-history-${encodeURIComponent(company || "")}`;
}

function stripHtml(value = "") {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.body.textContent || "";
}

async function fetchProducts(api) {
  try {
    const rows = await api('products');
    if (rows.error) throw new Error(rows.error);
    if (!Array.isArray(rows)) return fallbackProducts;
    return rows.map((p, index) => ({
      id: p.id,
      sku: p.sku || String(p.id),
      itemNo: p.item_no || p.sku || String(p.id),
      barcode: p.barcode || p.sku || String(p.id),
      unit: p.unit || "pcs",
      supplier: p.supplier || "",
      name: stripHtml(p.name),
      price: Number(p.price) || Number(p.regular_price) || Number(p.prices?.price / 100) || fallbackProducts[index % fallbackProducts.length].price,
      category: p.categories?.find(c => c.name !== 'All')?.name?.replace(/[▾▸]/g, '').trim() || '最新商品',
      image: p.images?.[0]?.src || fallbackProducts[index % fallbackProducts.length].image,
    }));
  } catch (e) {
    console.error('fetchProducts error', e);
    return fallbackProducts;
  }
}

function cartItemFromProduct(product, qty) {
  return {
    id: product.id,
    sku: product.sku,
    itemNo: product.itemNo || product.item_no || product.sku,
    barcode: product.barcode || product.sku,
    unit: product.unit || "pcs",
    name: product.name,
    price: product.price,
    category: product.category,
    image: product.image,
    badges: product.badges || [],
    qty,
  };
}

function orderItemsPayload(items) {
  return items.map(item => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    price: item.price,
    image: item.image,
    qty: item.qty,
  }));
}

async function postScript(payload) {
  if (!SCRIPT_URL) return null;
  const response = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "資料同步失敗");
  return result;
}

async function uploadSalesFile(file) {
  if (!file || !SCRIPT_URL) return file?.name || "";
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const result = await postScript({ action: "uploadAttachment", name: file.name, mimeType: file.type, base64 });
  return result.url;
}

const money = n => `NT$ ${Number(n).toLocaleString("zh-TW")}`;
const discountLabel = value => `${Number(value) / 10} 折`;

function downloadReconciliation(doc, settings) {
  const hasRetailPrices = doc.items.every(item => item.retailPrice != null);
  const pricingSettings = hasRetailPrices ? (doc.pricing || settings) : { ...(doc.pricing || settings), discount: 100 };
  const pricing = calculatePricing(doc.items.map(item => ({ ...item, price: item.retailPrice ?? item.price })), pricingSettings);
  const rows = [
    ["銷貨單號", doc.id], ["經銷商", doc.company], ["銷貨月份", doc.month], ["銷貨日期", doc.date],
    ["計價規則", pricingDescription(pricing.settings)], [],
    ["SKU", "商品名稱", "數量", "單價", "未稅小計", "稅額", "含稅小計"],
    ...pricing.lines.map(line => [line.sku || "", line.name || "", line.qty, line.unitPrice, line.preTax, line.tax, line.total]),
    [], ["", "", "", "合計", pricing.preTaxTotal, pricing.taxTotal, pricing.total]
  ];
  const csv = "\ufeff" + rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${doc.id}_發票對帳明細.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const code39Patterns = {
  "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
  "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
  "8": "110100101101", "9": "101100101101", "A": "110101001011", "B": "101101001011",
  "C": "110110100101", "D": "101011001011", "E": "110101100101", "F": "101101100101",
  "G": "101010011011", "H": "110101001101", "I": "101101001101", "J": "101011001101",
  "K": "110101010011", "L": "101101010011", "M": "110110101001", "N": "101011010011",
  "O": "110101101001", "P": "101101101001", "Q": "101010110011", "R": "110101011001",
  "S": "101101011001", "T": "101011011001", "U": "110010101011", "V": "100110101011",
  "W": "110011010101", "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
  "-": "100101011011", ".": "110010101101", " ": "100110101101", "$": "100100100101",
  "/": "100100101001", "+": "100101001001", "%": "101001001001", "*": "100101101101"
};

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function barcodeSvg(value = "") {
  const clean = String(value || "").toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, "");
  const encoded = `*${clean || "0000"}*`;
  const unit = 1.35;
  const height = 34;
  let x = 0;
  const bars = [];
  for (const char of encoded) {
    const pattern = code39Patterns[char] || code39Patterns["0"];
    for (const bit of pattern) {
      if (bit === "1") bars.push(`<rect x="${x.toFixed(2)}" y="0" width="${unit.toFixed(2)}" height="${height}"/>`);
      x += unit;
    }
    x += unit;
  }
  return `<svg class="barcode" viewBox="0 0 ${x.toFixed(2)} ${height}" preserveAspectRatio="none" aria-label="${escapeHtml(clean)}">${bars.join("")}</svg><small>${escapeHtml(clean)}</small>`;
}

function productIdentity(item, productMap = {}) {
  const product = productMap[item.productId] || productMap[Number(item.productId)] || {};
  const sku = item.sku || product.sku || String(item.productId || "");
  return {
    itemNo: item.itemNo || item.item_no || product.itemNo || product.item_no || sku,
    barcode: item.barcode || product.barcode || sku,
    unit: item.unit || product.unit || "pcs",
    name: item.name || product.name || "",
    sku
  };
}

function openPrintableDocument({ type, title, number, date, company, sourceWarehouse, storeName, destination, note, items, totals }) {
  const companyInfo = {
    name: "東瑭國際有限公司",
    phone: "07-6320338",
    fax: "07-6317308",
    address: "822 高雄市阿蓮區港後 122-1 號",
    bank: "中國信託銀行（822）",
    branch: "岡山分行（1274）",
    account: "274540352219",
    accountName: "東瑭國際有限公司"
  };
  const shippingAddress = [destination?.postalCode, destination?.address].filter(Boolean).join(" ");
  const rows = items.map(item => {
    const amount = item.amount ?? (Number(item.qty || 0) * Number(item.price || 0));
    return `<tr>
      <td class="mono">${escapeHtml(item.itemNo)}</td>
      <td class="barcode-cell">${barcodeSvg(item.barcode)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.unit || "pcs")}</td>
      <td class="num">${Number(item.qty || 0).toLocaleString("zh-TW")}</td>
      ${type === "transfer" ? `<td>${escapeHtml(item.storeName || storeName || "")}</td><td>${escapeHtml(item.destination || destination?.address || "")}</td>` : `<td class="num">${money(item.price || 0)}</td><td class="num">${money(amount)}</td>`}
      <td>${escapeHtml(item.note || "")}</td>
    </tr>`;
  }).join("");
  const transferHead = `<div class="meta meta-transfer">
    <div><span>調撥倉位置</span><strong>${escapeHtml(sourceWarehouse || "東瑭倉")}</strong></div>
    <div><span>門市</span><strong>${escapeHtml(storeName || destination?.storeName || company || "")}</strong></div>
    <div><span>調撥目的地</span><strong>${escapeHtml(destination?.companyName || company || "")}</strong><p>${escapeHtml([destination?.postalCode, destination?.address].filter(Boolean).join(" "))}</p></div>
  </div>`;
  const regularHead = `<div class="customer-box">
    <div class="customer-left">
      <p><b>客戶名稱：</b>${escapeHtml(company || destination?.companyName || "")}</p>
      <p><b>統一編號：</b>${escapeHtml(destination?.taxId || "")}</p>
      <p><b>聯 絡 人：</b>${escapeHtml([destination?.recipientName, destination?.recipientPhone].filter(Boolean).join(" / "))}</p>
      <p><b>送貨地址：</b>${escapeHtml(shippingAddress || destination?.storeName || "")}</p>
      ${destination?.deliveryNote ? `<p><b>配送備註：</b>${escapeHtml(destination.deliveryNote)}</p>` : ""}
    </div>
    <div class="customer-mid">
      <p><b>電話：</b>${escapeHtml(destination?.recipientPhone || "")}</p>
      <p><b>Email：</b>${escapeHtml(destination?.recipientEmail || "")}</p>
      <p><b>收貨門市：</b>${escapeHtml(destination?.storeName || "")}</p>
    </div>
    <div class="customer-right">
      <p><b>${escapeHtml(title)}日期：</b>${escapeHtml(date || "")}</p>
      <p><b>${escapeHtml(title)}單號：</b>${escapeHtml(number || "")}</p>
      <p><b>頁次：</b>1/1</p>
    </div>
  </div>`;
  const companyHead = `<div class="letterhead">
    <div class="company-lines">
      <p><b>電　　話：</b>${escapeHtml(companyInfo.phone)}</p>
      <p><b>傳　　真：</b>${escapeHtml(companyInfo.fax)}</p>
      <p><b>地　　址：</b>${escapeHtml(companyInfo.address)}</p>
    </div>
    <div class="title-block"><h1>${escapeHtml(companyInfo.name)}</h1><h2>${escapeHtml(title)}</h2></div>
    <div></div>
  </div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(number)}</title><style>
    *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",Arial,sans-serif;margin:24px;color:#111}
    .doc-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #173b35;padding-bottom:12px;margin-bottom:14px;color:#173b35}
    h1{font-family:serif;font-size:30px;margin:0}.company{font-weight:800}.doc-no{font-size:13px;color:#666;text-align:right}
    .letterhead{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:start;gap:16px;border-bottom:2px solid #111;padding-bottom:6px}
    .company-lines p,.customer-box p{margin:3px 0;line-height:1.35}.title-block{text-align:center}.title-block h1{font-size:32px;font-family:serif;margin:0}.title-block h2{font-size:26px;margin:8px 0 0;text-decoration:underline}
    .customer-box{display:grid;grid-template-columns:1.45fr .95fr .9fr;border:2px solid #111;border-top:0;padding:7px 9px 6px;gap:12px}
    .customer-box b{font-weight:800}.customer-right p{white-space:nowrap}
    .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0}.meta>div{border:1px solid #d9d6cd;padding:10px;min-height:58px}
    .meta span{display:block;color:#777;font-size:11px;margin-bottom:4px}.meta strong{font-size:16px}.meta p{margin:4px 0 0;color:#555;font-size:12px}.meta-transfer{grid-template-columns:1fr 1fr 1.4fr}
    table{width:100%;border-collapse:collapse;margin-top:${type === "transfer" ? "12px" : "0"}}th{background:#efeee8;color:#111;text-align:left;font-size:11px;padding:8px;border:1px solid #111}
    td{font-size:12px;padding:8px;border:1px solid #111;vertical-align:middle}td.num{text-align:right;font-weight:800}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800}
    .barcode-cell{width:155px}.barcode{display:block;width:135px;height:34px;fill:#111}.barcode-cell small{display:block;font-size:9px;color:#333;margin-top:2px;letter-spacing:.08em}
    .totals{display:flex;justify-content:flex-end;gap:18px;margin-top:16px;font-weight:800}.totals strong{font-size:22px;font-family:serif}.note{margin-top:14px;font-size:12px;color:#555;white-space:pre-wrap}
    .regular-total{display:grid;grid-template-columns:1fr 280px;border:1px solid #111;border-top:0}.regular-note{min-height:84px;padding:10px;border-right:1px solid #111}.regular-total-grid{display:grid;grid-template-columns:1fr 1fr}.regular-total-grid span,.regular-total-grid strong{padding:7px 9px;border-bottom:1px solid #111}.regular-total-grid span{text-align:right}.regular-total-grid strong{text-align:right}.bank-info{border:1px solid #111;border-top:0;padding:10px;font-size:14px}.bank-info p{margin:4px 0}
    .sign{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:34px}.sign div{border-top:1px solid #333;padding-top:8px;text-align:center;color:#555}
    @media print{body{margin:12mm}.no-print{display:none}}
  </style></head><body>
    ${type === "transfer" ? `<div class="doc-head"><div><div class="company">${escapeHtml(companyInfo.name)}</div><h1>${escapeHtml(title)}</h1></div><div class="doc-no">單號：${escapeHtml(number || "")}<br/>日期：${escapeHtml(date || "")}</div></div>` : companyHead}
    ${type === "transfer" ? transferHead : regularHead}
    <table><thead><tr><th>品號</th><th>條碼</th><th>品名</th><th>單位</th><th>數量</th>${type === "transfer" ? "<th>門市</th><th>調撥目的地</th>" : "<th>單價</th><th>金額</th>"}<th>備註</th></tr></thead><tbody>${rows}</tbody></table>
    ${type === "transfer" ? (totals ? `<div class="totals"><span>未稅 ${money(totals.preTax || 0)}</span><span>稅額 ${money(totals.tax || 0)}</span><strong>總計 ${money(totals.total || 0)}</strong></div>` : "") : `<div class="regular-total"><div class="regular-note">備註：${escapeHtml(note || "")}</div><div class="regular-total-grid"><span>合計金額</span><strong>${money(totals?.preTax || 0)}</strong><span>稅　額</span><strong>${money(totals?.tax || 0)}</strong><span>總金額</span><strong>${money(totals?.total || 0)}</strong></div></div>`}
    ${type !== "transfer" ? `<div class="bank-info"><p>煩請到貨後盡快驗收確認，謝謝</p><p><b>銀行：</b>${escapeHtml(companyInfo.bank)} ｜ <b>分行：</b>${escapeHtml(companyInfo.branch)} ｜ <b>帳號：</b>${escapeHtml(companyInfo.account)} ｜ <b>戶名：</b>${escapeHtml(companyInfo.accountName)}</p></div>` : ""}
    ${type === "transfer" && note ? `<div class="note">備註：${escapeHtml(note)}</div>` : ""}
    <div class="sign"><div>製表</div><div>檢貨</div><div>主管</div><div>簽收</div></div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    window.alert("瀏覽器阻擋了列印視窗，請允許此網站開啟彈出式視窗後再試一次。");
    return;
  }
  win.document.write(html);
  win.document.close();
}

function authTokenFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const inviteToken = hash.get("invite_token") || query.get("invite_token");
  const recoveryToken = hash.get("recovery_token") || query.get("recovery_token");
  if (inviteToken) return { type: "invite", token: inviteToken };
  if (recoveryToken) return { type: "recovery", token: recoveryToken };
  return null;
}

function App() {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [products, setProducts] = useState(fallbackProducts);
  const [content, setContent] = useState(() => JSON.parse(localStorage.getItem("dt-content") || "null") || defaultContent);
  const [productEdits, setProductEdits] = useState(() => JSON.parse(localStorage.getItem("dt-products") || "{}"));
  const [channels, setChannels] = useState(loadChannels);
  const [movements, setMovements] = useState(() => JSON.parse(localStorage.getItem("dt-movements") || "null") || defaultMovements);
  const [sales, setSales] = useState(() => JSON.parse(localStorage.getItem("dt-sales") || "null") || defaultSales);
  const [orders, setOrders] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [warehouseMovements, setWarehouseMovements] = useState([]);
  const [consignmentReports, setConsignmentReports] = useState([]);
  const [dealerRecords, setDealerRecords] = useState([]);
  const [currentDealerId, setCurrentDealerId] = useState("");
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authCallback, setAuthCallback] = useState(authTokenFromUrl);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("常用採購");
  const [cart, setCart] = useState([]);
  const [view, setView] = useState("home");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState({});
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const channelSettings = user ? channels[user.company] || { discount: 100, hideDealerPrice: false } : { discount: 100, hideDealerPrice: false };

  useEffect(() => {
    fetchProducts(api).then(data => { setProducts(data); setLoading(false); });
    const urlToken = authTokenFromUrl();
    if (urlToken) {
      setAuthCallback(urlToken);
      setAuthLoading(false);
      return;
    }
    handleAuthCallback().then(result => {
      if (result?.type === "invite" || result?.type === "recovery") setAuthCallback(result);
    }).catch(() => {}).finally(async () => {
      try {
        const identityUser = await getUser().catch(() => null);
        if (identityUser) await loadAccount();
      } catch (error) {
        console.error("Initial account load failed:", error);
        notify(error.message || "登入狀態確認逾時，請重新登入");
        await identityLogout();
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  async function api(route, options = {}) {
    const token = localStorage.getItem("dt_token");
    const { timeoutMs = 25000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`/api/${route}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          ...(fetchOptions.headers || {})
        }
      });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("伺服器回應逾時，請稍後再試");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
    const text = await response.text();
    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`伺服器回應異常（${response.status}），請稍後再試`);
    }
    if (!response.ok) throw new Error(result.error || "系統連線失敗");
    return result;
  }

  async function loadAccount({ preserveView = false } = {}) {
    const data = await api("bootstrap");
    const dealer = data.dealer;
    const nextChannels = Object.fromEntries(data.dealers.map(row => [row.company_name, {
      mode: row.mode,
      discount: row.discount_percent,
      hideDealerPrice: row.hide_dealer_price,
      ...normalizePricingSettings(row)
    }]));
    const nextEdits = Object.fromEntries(data.productOverrides.map(row => [row.product_id, {
      name: row.name,
      category: row.category,
      price: row.price,
      image: row.image_url,
      badges: row.badges,
      visible: row.visible,
      itemNo: row.item_no || row.sku,
      barcode: row.barcode || row.sku,
      unit: row.unit || "pcs",
      supplier: row.supplier || ""
    }]));
    const nextMovements = data.movements.map(row => ({
      id: row.id,
      date: new Date(row.created_at).toLocaleDateString("zh-TW"),
      company: row.company_name || dealer.company_name,
      productId: Number(row.product_id),
      type: row.movement_type,
      qty: row.quantity,
      source: row.source_id,
      operator: row.operator_email,
      note: row.note
    }));
    const nextSales = data.sales.map(row => ({
      id: row.sales_no,
      company: row.company_name || dealer.company_name,
      month: row.sales_month,
      date: row.sales_date,
      status: row.status,
      note: row.note,
      attachment: row.original_attachment_url,
      formalAttachment: row.formal_attachment_url,
      pricing: row.pricing_snapshot,
      preTaxAmount: row.pre_tax_amount,
      taxAmount: row.tax_amount,
      totalAmount: row.total_amount,
      items: row.items.map(item => ({
        productId: Number(item.product_id),
        sku: item.sku,
        itemNo: item.sku,
        barcode: item.sku,
        name: item.product_name,
        qty: item.quantity,
        price: item.unit_price
      }))
    }));
    setAdmin(data.admin);
    setUser({ company: data.admin ? "東瑭管理員" : dealer.company_name, name: data.user.name, email: data.user.email });
    setCurrentDealerId(dealer.id);
    setContent(prev => ({ ...prev, ...data.content }));
    setProductEdits(nextEdits);
    setChannels(nextChannels);
    setDealerRecords(data.dealers);
    setStores(data.stores || []);
    const ownStores = (data.stores || []).filter(store => store.dealer_id === dealer.id && store.active);
    setSelectedStoreId(ownStores.find(store => store.is_default)?.id || ownStores[0]?.id || "");
    setMovements(nextMovements);
    setSales(nextSales);
    setTransfers((data.transfers || []).map(row => ({
      uuid: row.id,
      id: row.transfer_no,
      orderNo: row.order_no,
      orderId: row.order_id,
      company: row.company_name || dealer.company_name,
      mode: row.mode,
      dealerId: row.dealer_id,
      status: row.status,
      warehouse: row.source_warehouse,
      destination: row.destination_snapshot || {},
      note: row.note,
      operator: row.operator_email,
      date: new Date(row.created_at).toLocaleDateString("zh-TW"),
      transferredAt: row.transferred_at,
      items: (row.items || []).map(item => ({
        id: item.id,
        orderItemId: item.order_item_id,
        productId: Number(item.product_id),
        sku: item.sku,
        itemNo: item.sku,
        barcode: item.sku,
        unit: "pcs",
        name: item.product_name,
        qty: Number(item.quantity),
        note: item.note
      }))
    })));
    setWarehouseMovements((data.warehouseMovements || []).map(row => ({
      id: row.id,
      date: new Date(row.created_at).toLocaleDateString("zh-TW"),
      warehouse: row.warehouse_name,
      company: row.company_name || "",
      productId: Number(row.product_id),
      type: row.movement_type,
      qty: Number(row.quantity),
      source: row.source_id,
      operator: row.operator_email,
      note: row.note
    })));
    setConsignmentReports((data.consignmentSalesReports || []).map(row => ({
      uuid: row.id,
      id: row.report_no,
      company: row.company_name || dealer.company_name,
      dealerId: row.dealer_id,
      periodStart: String(row.period_start).slice(0, 10),
      periodEnd: String(row.period_end).slice(0, 10),
      status: row.status,
      note: row.note,
      returnReason: row.return_reason,
      pricing: row.pricing_snapshot,
      preTaxAmount: Number(row.pre_tax_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      totalAmount: Number(row.total_amount || 0),
      salesNo: row.sales_no,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      convertedAt: row.converted_at,
      items: (row.items || []).map(item => ({
        id: item.id,
        productId: Number(item.product_id),
        sku: item.sku,
        itemNo: item.sku,
        barcode: item.sku,
        unit: "pcs",
        name: item.product_name,
        currentStock: Number(item.current_stock || 0),
        soldQty: Number(item.sold_quantity || 0),
        retailPrice: Number(item.retail_price || 0),
        unitPrice: Number(item.unit_price || 0),
        preTaxAmount: Number(item.pre_tax_amount || 0),
        taxAmount: Number(item.tax_amount || 0),
        lineTotal: Number(item.line_total || 0),
        note: item.note
      })),
      attachments: row.attachments || [],
      logs: row.logs || []
    })));
    setOrders(data.orders.map(row => ({
      uuid: row.id,
      id: row.order_no,
      company: row.company_name || dealer.company_name,
      contact: row.contact_name,
      date: new Date(row.created_at).toLocaleDateString("zh-TW"),
      createdAt: row.created_at,
      amount: row.total_amount,
      preTaxAmount: row.pre_tax_amount,
      taxAmount: row.tax_amount,
      pricing: row.pricing_snapshot,
      status: row.status,
      items: row.items.length,
      lineItems: row.items.map(item => ({
        id: item.id,
        productId: Number(item.product_id),
        sku: item.sku,
        name: item.product_name,
        image: item.image_url,
        retailPrice: Number(item.retail_price),
        dealerPrice: Number(item.dealer_price),
        qty: Number(item.quantity),
        preTaxAmount: Number(item.pre_tax_amount || 0),
        taxAmount: Number(item.tax_amount || 0),
        lineTotal: Number(item.line_total || Number(item.dealer_price) * Number(item.quantity))
      })),
      shipping: row.shipping_snapshot,
      trackingNo: row.tracking_no || "",
      adminNote: row.admin_note || "",
      confirmedAt: row.confirmed_at,
      preparedAt: row.prepared_at,
      shippedAt: row.shipped_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at
    })));
    const history = {};
    data.orders.flatMap(row => row.items).forEach(item => {
      const previous = history[item.product_id] || { orderCount: 0, totalQty: 0 };
      history[item.product_id] = { orderCount: previous.orderCount + 1, totalQty: previous.totalQty + item.quantity };
    });
    setPurchaseHistory(history);
    if (!preserveView) setView(data.admin ? "admin" : "home");
  }

  const managedProducts = products.map(p => ({
    ...p,
    badges: defaultBadges[p.id] || [],
    ...(productEdits[p.id] || {})
  })).filter(p => p.visible !== false);
  const frequentProducts = managedProducts
    .filter(p => purchaseHistory[p.id])
    .sort((a, b) => purchaseHistory[b.id].orderCount - purchaseHistory[a.id].orderCount);
  const inventoryFor = (company, productId) => movements
    .filter(m => m.company === company && Number(m.productId) === Number(productId))
    .reduce((sum, m) => sum + Number(m.qty), 0);
  const inventoryProductIds = new Set(movements.filter(m => m.company === user?.company).map(m => Number(m.productId)));
  const inventoryProducts = managedProducts
    .filter(p => inventoryProductIds.has(Number(p.id)))
    .filter(p => !lowStockOnly || inventoryFor(user?.company, p.id) <= 5)
    .sort((a, b) => inventoryFor(user?.company, a.id) - inventoryFor(user?.company, b.id));
  const categories = useMemo(() => [
    "常用採購",
    ...(channelSettings.mode === "consignment" ? ["既有庫存"] : []),
    "全部商品",
    ...new Set(managedProducts.map(p => p.category))
  ], [managedProducts, channelSettings.mode]);
  const categoryProducts = category === "常用採購" ? frequentProducts : category === "既有庫存" ? inventoryProducts : managedProducts;
  const shown = categoryProducts.filter(p =>
    (category === "常用採購" || category === "既有庫存" || category === "全部商品" || p.category === category) &&
    p.name.toLowerCase().includes(query.toLowerCase())
  );
  const totalQty = cart.reduce((sum, x) => sum + x.qty, 0);
  const cartPricing = calculatePricing(cart, channelSettings);
  const dealerPrice = price => calculatePricing([{ price, qty: 1 }], channelSettings).total;
  const subtotal = cartPricing.total;

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function add(product) {
    setCart(prev => {
      const found = prev.find(x => x.id === product.id);
      return found ? prev.map(x => x.id === product.id ? { ...x, qty: x.qty + 1 } : x) : [...prev, cartItemFromProduct(product, 1)];
    });
    notify(`已加入 ${product.name}`);
  }

  function changeQty(id, delta) {
    setCart(prev => prev.map(x => x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x));
  }

  function setQty(product, value) {
    const qty = Math.max(0, Number(value) || 0);
    setCart(prev => {
      const found = prev.find(x => x.id === product.id);
      if (qty === 0) return prev.filter(x => x.id !== product.id);
      return found
        ? prev.map(x => x.id === product.id ? { ...x, qty } : x)
        : [...prev, cartItemFromProduct(product, qty)];
    });
  }

  async function checkout() {
    if (!cart.length || checkingOut) return;
    if (!selectedStoreId) {
      notify("請先選擇收貨門市");
      return;
    }
    setCheckingOut(true);
    try {
      const result = await api("orders", {
        method: "POST",
        body: JSON.stringify({
          contact: user.name,
          storeId: selectedStoreId,
          items: orderItemsPayload(cart)
        })
      });
      const nextHistory = { ...purchaseHistory };
      cart.forEach(item => {
        const previous = nextHistory[item.id] || { orderCount: 0, totalQty: 0 };
        nextHistory[item.id] = {
          orderCount: previous.orderCount + 1,
          totalQty: previous.totalQty + item.qty
        };
      });
      setPurchaseHistory(nextHistory);
      localStorage.setItem(historyKey(user.company), JSON.stringify(nextHistory));
      notify(`訂單 ${result.orderNo} 已成功送出`);
      setCart([]);
      await loadAccount({ preserveView: true });
      setView("orders");
    } catch (error) {
      notify(error.message || "訂單送出失敗，採購清單已為您保留");
    } finally {
      setCheckingOut(false);
    }
  }

  async function login(credentials) {
    await identityLogin(credentials.email, credentials.password);
    await loadAccount();
  }

  async function completePassword(password) {
    if (authCallback?.type === "invite") await acceptInvite(authCallback.token, password);
    else if (authCallback?.type === "recovery") await recoverPassword(authCallback.token, password);
    window.history.replaceState({}, document.title, window.location.pathname);
    setAuthCallback(null);
    await loadAccount();
  }

  async function saveAdmin(nextContent, nextProducts, nextChannels) {
    await api("settings", {
      method: "PUT",
      body: JSON.stringify({ content: nextContent, products: nextProducts, channels: nextChannels })
    });
    setContent(nextContent);
    setProductEdits(nextProducts);
    setChannels(nextChannels);
    localStorage.setItem("dt-content", JSON.stringify(nextContent));
    localStorage.setItem("dt-products", JSON.stringify(nextProducts));
    localStorage.setItem("dt-channels", JSON.stringify(nextChannels));
    notify("前台內容已儲存");
  }

  function saveInventory(nextMovements, nextSales) {
    setMovements(nextMovements);
    setSales(nextSales);
    localStorage.setItem("dt-movements", JSON.stringify(nextMovements));
    localStorage.setItem("dt-sales", JSON.stringify(nextSales));
  }

  async function saveProfile(dealerId, profile) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "saveDealerProfile", dealerId, profile })
    });
    setDealerRecords(rows => rows.map(row => row.id === result.dealer.id ? result.dealer : row));
    if (!admin && result.dealer.id === currentDealerId) {
      setUser(previous => ({ ...previous, company: result.dealer.company_name }));
    }
    notify("廠商資料已儲存");
    return result.dealer;
  }

  async function saveStore(dealerId, store) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "saveStore", dealerId, store })
    });
    await loadAccount({ preserveView: true });
    notify(store.id ? "門市資料已更新" : "門市已新增");
    return result.store;
  }

  async function createDealerAccount(account) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "createDealerAccount", account })
    });
    await loadAccount({ preserveView: true });
    notify(`經銷商帳號 ${account.email} 已建立`);
    return result;
  }

  async function updateOrder(orderId, patch) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "updateOrder", orderId, ...patch })
    });
    await loadAccount({ preserveView: true });
    notify(`訂單 ${result.order.order_no} 已更新`);
    return result.order;
  }

  async function createTransferFromOrder(orderId) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "createTransferFromOrder", orderId })
    });
    await loadAccount({ preserveView: true });
    notify(result.existed ? `採購單已有調撥單 ${result.transfer.transfer_no}` : `已建立調撥單 ${result.transfer.transfer_no}`);
    return result.transfer;
  }

  async function updateTransfer(transferId, patch) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "updateTransfer", transferId, ...patch })
    });
    await loadAccount({ preserveView: true });
    notify(`調撥單 ${result.transfer.transfer_no} 已更新`);
    return result.transfer;
  }

  async function submitConsignmentReport(payload) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "submitConsignmentSalesReport", ...payload })
    });
    await loadAccount({ preserveView: true });
    notify(`寄售銷售回報單 ${result.report.report_no} 已送出`);
    return result.report;
  }

  async function reviewConsignmentReport(reportId, patch) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "reviewConsignmentSalesReport", reportId, ...patch })
    });
    await loadAccount({ preserveView: true });
    notify(`回報單 ${result.report.report_no} 已更新為 ${result.report.status}`);
    return result.report;
  }

  async function convertConsignmentReport(reportId) {
    const result = await api("mutations", {
      method: "POST",
      body: JSON.stringify({ action: "convertConsignmentSalesReport", reportId })
    });
    await loadAccount({ preserveView: true });
    notify(`已轉成銷貨單 ${result.salesNo} 並沖抵寄售庫存`);
    return result;
  }

  if (authLoading) return <div className="loading-screen"><RefreshCw /> 正在確認登入狀態...</div>;
  if (authCallback) return <SetPassword mode={authCallback.type} onSubmit={completePassword} />;
  if (!user) return <Login onLogin={login} />;

  return (
    <div className="app">
      <header>
        <a className="brand" href="#" onClick={() => setView(admin ? "admin" : "home")}>
          <span className="brand-mark">東</span>
          <span><strong>東瑭國際</strong><small>DONG TANG INTERNATIONAL</small></span>
        </a>
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
        <nav className={mobileNav ? "open" : ""}>
          {!admin && <button className={view === "home" ? "active" : ""} onClick={() => { setView("home"); setMobileNav(false); }}>夥伴首頁</button>}
          {!admin && <button className={view === "shop" ? "active" : ""} onClick={() => { setView("shop"); setMobileNav(false); }}>商品採購</button>}
          {!admin && <button className={view === "orders" ? "active" : ""} onClick={() => { setView("orders"); setMobileNav(false); }}>單據與進度</button>}
          {!admin && channelSettings.mode === "consignment" && <button className={view === "consignmentReport" ? "active" : ""} onClick={() => { setView("consignmentReport"); setMobileNav(false); }}>寄售銷售回報</button>}
          <button className={view === "profile" ? "active" : ""} onClick={() => { setView("profile"); setMobileNav(false); }}>廠商資料</button>
          {admin && <button className={view === "admin" ? "active" : ""} onClick={() => { setView("admin"); setMobileNav(false); }}>內容管理</button>}
          <a href="https://eavo.com.tw/" target="_blank">品牌官網</a>
        </nav>
        <div className="account">
          <span><UserRound size={18} /> {user.company}</span>
          <button title="登出" onClick={async () => { await identityLogout(); setUser(null); setAdmin(false); }}><LogOut size={18} /></button>
        </div>
      </header>

      {view === "home" ? <PartnerHome content={content} products={managedProducts} company={user.company} orders={orders} movements={movements.filter(m => m.company === user.company)} reports={consignmentReports.filter(r => r.company === user.company)} settings={channelSettings} onShop={() => setView("shop")} onOrders={() => setView("orders")} onReport={() => setView("consignmentReport")} /> : view === "shop" ? (
        <main className="purchase-page">
          <section className="purchase-heading">
            <div><span className="eyebrow">B2B QUICK ORDER</span><h1>快速採購單</h1><p>搜尋商品並直接填寫數量，右側清單會同步更新。</p></div>
            <div className="sync-state"><CheckCircle2 /> 官網商品已同步</div>
          </section>
          <section className="purchase-workspace">
            <div className="product-browser">
              <div className="browser-tools">
                <div className="search"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋品名、品號" /></div>
                <span>{category === "常用採購" ? `依歷史紀錄找到 ${shown.length} 項常購商品` : category === "既有庫存" ? `庫存商品 ${shown.length} 項，依水位由低至高排列` : `共 ${shown.length} 項商品`}</span>
              </div>
            <div className="category-row">
              {categories.map(c => <button key={c} onClick={() => { setCategory(c); if (c !== "既有庫存") setLowStockOnly(false); }} className={`${category === c ? "active" : ""} ${c === "常用採購" ? "frequent-category" : ""} ${c === "既有庫存" ? "inventory-category" : ""}`.trim()}>{c}</button>)}
            </div>
            {category === "既有庫存" && <div className="inventory-filter-bar">
              <div><Warehouse /><span>顯示通路目前已有庫存紀錄的商品</span></div>
              <label><input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} /> 只看缺貨／低庫存（5 件以下）</label>
            </div>}
            {loading ? <div className="loading"><RefreshCw /> 正在同步官網商品...</div> : (
              <div className="product-table">
                <div className="product-table-head"><span>商品</span><span>品名／品號</span><span>分類</span><span>單價</span><span>採購數量</span></div>
                {category === "常用採購" && shown.length === 0 ? <div className="frequent-empty"><Clock3 /><h3>目前還沒有歷史採購品項</h3><p>完成第一筆訂單後，曾採購的商品會自動整理到這裡。</p><button onClick={() => setCategory("全部商品")}>瀏覽全部商品</button></div> : category === "既有庫存" && shown.length === 0 ? <div className="frequent-empty"><Warehouse /><h3>{lowStockOnly ? "目前沒有缺貨或低庫存商品" : "目前沒有寄售庫存紀錄"}</h3><p>{lowStockOnly ? "目前庫存水位正常，可以取消篩選查看全部既有庫存。" : "商品出貨並加入寄售庫存後，會自動整理到這裡。"}</p>{lowStockOnly && <button onClick={() => setLowStockOnly(false)}>查看全部既有庫存</button>}</div> : shown.map(product => (
                  <article className={`product-row ${cart.some(x => x.id === product.id) ? "selected" : ""}`} key={product.id}>
                    <img src={product.image} alt={product.name} onError={e => { e.currentTarget.src = "https://eavo.com.tw/wp-content/uploads/2023/07/LOGO.png"; }} />
                    <div className="row-name">
                      <div className="product-title-line"><strong>{product.name}</strong><ProductBadges badges={product.badges} /></div>
                      <small>品號 {product.sku}{category === "常用採購" && ` · 歷史採購 ${purchaseHistory[product.id].orderCount} 次／${purchaseHistory[product.id].totalQty} 件`}</small>
                      {channelSettings.mode === "consignment" && <span className={`stock-balance ${inventoryFor(user.company, product.id) <= 5 ? "low" : ""}`}><Warehouse /> 寄售庫存 {inventoryFor(user.company, product.id)} 件</span>}
                    </div>
                    <span className="row-category">{product.category}</span>
                    <div className="row-price">
                      <small>零售價 {money(product.price)}</small>
                      {!channelSettings.hideDealerPrice && <strong>經銷價 {money(dealerPrice(product.price))}</strong>}
                    </div>
                    <div className="row-qty">
                      <button onClick={() => setQty(product, (cart.find(x => x.id === product.id)?.qty || 0) - 1)}><Minus /></button>
                      <input aria-label={`${product.name} 採購數量`} type="number" min="0" value={cart.find(x => x.id === product.id)?.qty || 0} onChange={e => setQty(product, e.target.value)} />
                      <button onClick={() => setQty(product, (cart.find(x => x.id === product.id)?.qty || 0) + 1)}><Plus /></button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            </div>
            <PurchaseList items={cart} subtotal={subtotal} totalQty={totalQty} dealerPrice={dealerPrice} settings={channelSettings}
              stores={stores.filter(store => store.dealer_id === currentDealerId && store.active)}
              selectedStoreId={selectedStoreId} onSelectStore={setSelectedStoreId}
              onManageStores={() => setView("profile")} onQty={changeQty}
              onRemove={id => setCart(x => x.filter(i => i.id !== id))}
              onCheckout={checkout} checkingOut={checkingOut} />
          </section>
        </main>
      ) : view === "orders" ? <DocumentCenter company={user.company} orders={orders} sales={sales.filter(s => s.company === user.company)} products={managedProducts} movements={movements.filter(m => m.company === user.company)} settings={channelSettings} />
        : view === "consignmentReport" ? <ConsignmentReportCenter company={user.company} products={managedProducts} movements={movements.filter(m => m.company === user.company)} reports={consignmentReports.filter(r => r.company === user.company)} settings={channelSettings} onSubmit={submitConsignmentReport} />
        : view === "profile" ? <DealerProfileManager admin={admin} currentCompany={user.company} dealers={dealerRecords} stores={stores} onSaveProfile={saveProfile} onSaveStore={saveStore} />
        : <AdminPanel api={api} content={content} products={products} productEdits={productEdits} channels={channels}
          dealers={dealerRecords} orders={orders} transfers={transfers} warehouseMovements={warehouseMovements}
          movements={movements} sales={sales} consignmentReports={consignmentReports} onSave={saveAdmin}
          onSaveInventory={saveInventory} onCreateDealerAccount={createDealerAccount}
          onUpdateOrder={updateOrder} onCreateTransfer={createTransferFromOrder} onUpdateTransfer={updateTransfer}
          onReviewConsignmentReport={reviewConsignmentReport} onConvertConsignmentReport={convertConsignmentReport} />}

      {toast && <div className="toast"><CheckCircle2 /> {toast}</div>}
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await onLogin({ email, password });
    } catch (err) {
      setError(err.message || "登入失敗，請確認帳號與密碼");
    } finally {
      setSubmitting(false);
    }
  }
  async function forgotPassword() {
    if (!email) {
      setError("請先輸入電子郵件");
      return;
    }
    setError("");
    try {
      await requestPasswordRecovery(email);
      setRecoverySent(true);
    } catch (err) {
      setError(err.message || "無法寄送密碼重設信");
    }
  }
  return <div className="login-page">
    <div className="login-brand"><span className="brand-mark">東</span><div><strong>東瑭國際</strong><small>客戶採購系統</small></div></div>
    <div className="login-panel">
      <span className="eyebrow">WELCOME BACK</span>
      <h1>歡迎回來</h1><p>使用東瑭核發的企業帳號登入。</p>
      <label>電子郵件<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>密碼<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <small className="login-error">{error}</small>}
      {recoverySent && <small className="login-success">密碼重設信已寄出，請檢查信箱。</small>}
      <button className="primary login-submit" disabled={submitting || !email || !password} onClick={submit}>{submitting ? "登入中..." : "登入採購系統"} <ChevronRight /></button>
      <button className="forgot-password" type="button" onClick={forgotPassword}>忘記密碼</button>
      <small className="demo-hint">帳號由東瑭管理員邀請建立，不開放自行註冊。</small>
    </div>
    <div className="login-visual"><div><span>DESIGN IN TAIWAN</span><h2>把美好的<br />台灣故事，<br />帶進日常。</h2></div></div>
  </div>;
}

function SetPassword({ mode, onSubmit }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (password.length < 8) return setError("密碼至少需要 8 個字元");
    if (password !== confirm) return setError("兩次輸入的密碼不一致");
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(password);
    } catch (err) {
      const message = String(err?.message || "");
      if (message.toLowerCase().includes("user not found")) {
        setError(mode === "recovery"
          ? "此帳號尚未完成邀請，不能使用忘記密碼。請由管理員重新寄送邀請信，並點邀請信中的連結建立密碼。"
          : "找不到這筆邀請，可能已被刪除或連結已失效。請由管理員重新邀請此帳號。");
      } else {
        setError(message || (mode === "invite" ? "邀請連結可能已過期，請重新寄送邀請信" : "密碼重設連結可能已過期，請重新申請"));
      }
      setSubmitting(false);
    }
  }
  return <div className="login-page">
    <div className="login-brand"><span className="brand-mark">東</span><div><strong>東瑭國際</strong><small>客戶採購系統</small></div></div>
    <div className="login-panel">
      <span className="eyebrow">ACCOUNT SETUP</span>
      <h1>{mode === "invite" ? "建立登入密碼" : "設定新密碼"}</h1>
      <p>{mode === "invite" ? "完成密碼設定後，即可開始使用採購系統。" : "請輸入新的登入密碼。"}</p>
      <label>新密碼<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>再次輸入密碼<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      {error && <small className="login-error">{error}</small>}
      <button className="primary login-submit" disabled={submitting} onClick={submit}>{submitting ? "設定中..." : "完成密碼設定"} <ChevronRight /></button>
      <small className="demo-hint">密碼至少需要 8 個字元。</small>
    </div>
    <div className="login-visual"><div><span>DESIGN IN TAIWAN</span><h2>把美好的<br />台灣故事，<br />帶進日常。</h2></div></div>
  </div>;
}

function PartnerHome({ content, products, company, orders = [], movements = [], reports = [], settings = {}, onShop, onOrders, onReport }) {
  const [applied, setApplied] = useState(false);
  const newest = products.slice(0, 4);
  const activeOrders = orders.filter(order => !["已完成", "已取消"].includes(order.status));
  const lowStockCount = settings.mode === "consignment"
    ? products.filter(product => {
      const qty = movements.filter(m => Number(m.productId) === Number(product.id)).reduce((sum, m) => sum + Number(m.qty), 0);
      return qty > 0 && qty <= 5;
    }).length
    : 0;
  const pendingReports = reports.filter(report => ["待審核", "已退回"].includes(report.status)).length;
  return <main className="partner-home">
    <section className="partner-hero">
      <div><span className="eyebrow">DONG TANG PARTNER HUB</span><h1>{content.heroTitle}</h1><p>{content.heroText}</p><button className="primary" onClick={onShop}>前往快速採購 <ChevronRight /></button></div>
      <img src={content.heroImage} alt="" />
    </section>
	    <section className="home-shortcuts">
	      <a href="#new-products"><Megaphone /><span><strong>新品上市</strong><small>掌握最新商品資訊</small></span></a>
	      <a href="#display-apply"><Store /><span><strong>展示架申請</strong><small>取得通路陳列支援</small></span></a>
	      <a href="#events"><CalendarDays /><span><strong>活動訊息</strong><small>查看最新檔期方案</small></span></a>
	    </section>
    <section className="partner-action-grid">
      <button onClick={onShop}><ShoppingBag /><span>快速採購</span><strong>建立採購單</strong><small>以條列式表格快速輸入採購數量。</small></button>
      <button onClick={onOrders}><Truck /><span>單據進度</span><strong>{activeOrders.length} 筆進行中</strong><small>查看採購進度、歷史銷貨與寄售庫存。</small></button>
      {settings.mode === "consignment" && <button onClick={onReport}><ClipboardCheck /><span>寄售回報</span><strong>{pendingReports ? `${pendingReports} 筆待追蹤` : "填寫本期銷售"}</strong><small>{lowStockCount ? `${lowStockCount} 項低庫存，可同步安排補貨。` : "回報銷售後由東瑭審核沖帳。"}</small></button>}
    </section>
    <section className="home-section" id="new-products">
      <div className="home-section-title"><div><span className="eyebrow">NEW ARRIVALS</span><h2>新品上市</h2></div><button onClick={onShop}>查看全部商品 <ChevronRight /></button></div>
      <div className="new-feature">
        <img src={content.newImage} alt={content.newTitle} />
        <div><span className="news-label">NEW</span><h3>{content.newTitle}</h3><p>{content.newText}</p><button className="primary" onClick={onShop}>立即採購</button></div>
      </div>
      <div className="new-product-strip">{newest.map(p => <div key={p.id}><img src={p.image} alt={p.name} /><span>{p.category}</span><strong>{p.name}</strong><ProductBadges badges={p.badges} /><small>{money(p.price)}</small></div>)}</div>
    </section>
    <section className="home-dual">
      <article className="event-card" id="events"><CalendarDays /><span className="eyebrow">PARTNER EVENT</span><h2>{content.eventTitle}</h2><b>{content.eventDate}</b><p>{content.eventText}</p></article>
      <article className="display-card" id="display-apply"><Store /><span className="eyebrow">DISPLAY SUPPORT</span><h2>{content.displayTitle}</h2><p>{content.displayText}</p>{applied ? <div className="apply-success"><CheckCircle2 /> 已送出申請，業務將與您聯繫</div> : <button className="primary" onClick={() => setApplied(true)}>申請展示架 <ChevronRight /></button>}</article>
    </section>
  </main>;
}

const emptyStore = {
  storeName: "", companyName: "", taxId: "", postalCode: "", address: "",
  recipientName: "", recipientPhone: "", recipientEmail: "", deliveryNote: "",
  isDefault: false, active: true
};

function DealerProfileManager({ admin, currentCompany, dealers, stores, onSaveProfile, onSaveStore }) {
  const initialDealer = admin ? dealers[0] : dealers.find(row => row.company_name === currentCompany);
  const [dealerId, setDealerId] = useState(initialDealer?.id || "");
  const dealer = dealers.find(row => row.id === dealerId) || initialDealer;
  const [profile, setProfile] = useState({});
  const [storeDraft, setStoreDraft] = useState(emptyStore);
  const [message, setMessage] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const dealerStores = stores.filter(store => store.dealer_id === dealer?.id);

  useEffect(() => {
    if (!dealer) return;
    setProfile({
      companyName: dealer.company_name || "",
      contactName: dealer.contact_name || "",
      taxId: dealer.tax_id || "",
      invoiceTitle: dealer.invoice_title || "",
      invoiceAddress: dealer.invoice_address || "",
      phone: dealer.phone || "",
      billingEmail: dealer.billing_email || dealer.email || ""
    });
    setStoreDraft({ ...emptyStore, companyName: dealer.company_name || "" });
    setMessage(null);
  }, [dealer?.id]);

  function editStore(store) {
    setStoreDraft({
      id: store.id,
      storeName: store.store_name,
      companyName: store.company_name,
      taxId: store.tax_id,
      postalCode: store.postal_code,
      address: store.address,
      recipientName: store.recipient_name,
      recipientPhone: store.recipient_phone,
      recipientEmail: store.recipient_email,
      deliveryNote: store.delivery_note,
      isDefault: store.is_default,
      active: store.active
    });
    setMessage(null);
  }

  async function submitProfile() {
    if (!profile.companyName?.trim()) {
      setMessage({ type: "error", text: "請填寫總部公司名稱。" });
      return;
    }
    setSavingProfile(true);
    setMessage(null);
    try {
      await onSaveProfile(dealer.id, profile);
      setMessage({ type: "success", text: "廠商資料已儲存。" });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "廠商資料儲存失敗。" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitStore() {
    const required = [
      ["門市顯示名稱", storeDraft.storeName],
      ["實際廠商／公司名稱", storeDraft.companyName],
      ["完整收貨地址", storeDraft.address],
      ["收件人", storeDraft.recipientName],
      ["收件電話", storeDraft.recipientPhone]
    ];
    const missing = required.filter(([, value]) => !value?.trim()).map(([label]) => label);
    if (missing.length) {
      setMessage({ type: "error", text: `請填寫：${missing.join("、")}。` });
      return;
    }
    setSavingStore(true);
    setMessage(null);
    try {
      await onSaveStore(dealer.id, storeDraft);
      setMessage({ type: "success", text: storeDraft.id ? "門市資料已更新。" : "門市已新增，可於採購單選擇此收貨地點。" });
      setStoreDraft({ ...emptyStore, companyName: profile.companyName || dealer.company_name });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "門市資料儲存失敗。" });
    } finally {
      setSavingStore(false);
    }
  }

  if (!dealer) return <main className="profile-page"><div className="document-empty">尚未建立經銷商資料</div></main>;
  return <main className="profile-page">
    <section className="profile-heading">
      <div><span className="eyebrow">PARTNER ORGANIZATION</span><h1>廠商與門市管理</h1><p>維護總部開票資料、門市收貨地址與聯絡資訊。</p></div>
      {admin && <label>代管經銷商<select value={dealer.id} onChange={e => setDealerId(e.target.value)}>{dealers.map(row => <option value={row.id} key={row.id}>{row.company_name}</option>)}</select></label>}
    </section>
    {message && <div className={`profile-message ${message.type}`}>{message.type === "success" && <CheckCircle2 />}{message.text}</div>}
    <section className="profile-card">
      <div className="profile-card-title"><div><h2>總部／廠商資料</h2><p>這些資料用於帳務聯繫與正式單據。</p></div><button className="primary" disabled={savingProfile} onClick={submitProfile}><Save /> {savingProfile ? "儲存中..." : "儲存廠商資料"}</button></div>
      <div className="profile-grid">
        <ProfileInput label="總部公司名稱" value={profile.companyName} onChange={v => setProfile({ ...profile, companyName: v })} />
        <ProfileInput label="統一編號" value={profile.taxId} onChange={v => setProfile({ ...profile, taxId: v })} />
        <ProfileInput label="發票抬頭" value={profile.invoiceTitle} onChange={v => setProfile({ ...profile, invoiceTitle: v })} />
        <ProfileInput label="帳務 Email" value={profile.billingEmail} onChange={v => setProfile({ ...profile, billingEmail: v })} />
        <ProfileInput label="主要聯絡人" value={profile.contactName} onChange={v => setProfile({ ...profile, contactName: v })} />
        <ProfileInput label="聯絡電話" value={profile.phone} onChange={v => setProfile({ ...profile, phone: v })} />
        <ProfileInput className="wide" label="發票地址" value={profile.invoiceAddress} onChange={v => setProfile({ ...profile, invoiceAddress: v })} />
      </div>
    </section>
    <section className="profile-card">
      <div className="profile-card-title"><div><h2>門市／收貨據點</h2><p>每張採購單可指定其中一間門市寄送。</p></div><b>{dealerStores.filter(store => store.active).length} 個啟用據點</b></div>
      <div className="store-layout">
        <div className="store-list">
          {dealerStores.length === 0 ? <div className="document-empty">尚未建立門市，請先新增第一個收貨據點。</div> : dealerStores.map(store => <article className={!store.active ? "inactive" : ""} key={store.id}>
            <div><strong>{store.store_name}</strong>{store.is_default && <span>預設門市</span>}<small>{store.company_name}{store.tax_id && ` · 統編 ${store.tax_id}`}</small></div>
            <p>〒{store.postal_code || ""} {store.address}</p><small>收件：{store.recipient_name}／{store.recipient_phone}</small>
            <button onClick={() => editStore(store)}>編輯</button>
          </article>)}
        </div>
        <div className="store-form">
          <h3>{storeDraft.id ? "編輯門市" : "新增門市"}</h3>
          <ProfileInput label="門市顯示名稱 *" value={storeDraft.storeName} onChange={v => setStoreDraft({ ...storeDraft, storeName: v })} />
          <ProfileInput label="實際廠商／公司名稱 *" value={storeDraft.companyName} onChange={v => setStoreDraft({ ...storeDraft, companyName: v })} />
          <div className="two-fields"><ProfileInput label="統一編號" value={storeDraft.taxId} onChange={v => setStoreDraft({ ...storeDraft, taxId: v })} /><ProfileInput label="郵遞區號" value={storeDraft.postalCode} onChange={v => setStoreDraft({ ...storeDraft, postalCode: v })} /></div>
          <ProfileInput label="完整收貨地址 *" value={storeDraft.address} onChange={v => setStoreDraft({ ...storeDraft, address: v })} />
          <div className="two-fields"><ProfileInput label="收件人 *" value={storeDraft.recipientName} onChange={v => setStoreDraft({ ...storeDraft, recipientName: v })} /><ProfileInput label="收件電話 *" value={storeDraft.recipientPhone} onChange={v => setStoreDraft({ ...storeDraft, recipientPhone: v })} /></div>
          <ProfileInput label="門市 Email" value={storeDraft.recipientEmail} onChange={v => setStoreDraft({ ...storeDraft, recipientEmail: v })} />
          <ProfileInput label="配送備註" value={storeDraft.deliveryNote} onChange={v => setStoreDraft({ ...storeDraft, deliveryNote: v })} area />
          <div className="store-checks"><label><input type="checkbox" checked={storeDraft.isDefault} onChange={e => setStoreDraft({ ...storeDraft, isDefault: e.target.checked })} /> 設為預設收貨門市</label>{storeDraft.id && <label><input type="checkbox" checked={storeDraft.active} onChange={e => setStoreDraft({ ...storeDraft, active: e.target.checked })} /> 啟用此門市</label>}</div>
          <div className="store-form-actions">{storeDraft.id && <button onClick={() => { setStoreDraft({ ...emptyStore, companyName: profile.companyName || dealer.company_name }); setMessage(null); }}>取消編輯</button>}<button className="primary" disabled={savingStore} onClick={submitStore}><Save /> {savingStore ? "儲存中..." : storeDraft.id ? "更新門市" : "新增門市"}</button></div>
        </div>
      </div>
    </section>
  </main>;
}

function ProfileInput({ label, value = "", onChange, area, className = "", type = "text" }) {
  return <label className={`profile-input ${className}`}><span>{label}</span>{area ? <textarea value={value} onChange={e => onChange(e.target.value)} /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} />}</label>;
}

const masterHeaderMap = {
  "品號": "item_no",
  "品名": "name",
  "單位": "unit",
  "商品分類": "category",
  "零售價": "retail_price",
  "優惠價": "sale_price",
  "標準進價": "standard_cost",
  "安全存量": "safety_stock",
  "庫存量": "stock_quantity",
  "條碼編號": "barcode",
  "單位淨重": "unit_weight",
  "主供應商": "supplier",
  "商品描述": "description"
};

function ProductMasterManager({ api }) {
  const [products, setProducts] = useState([]);
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editMap, setEditMap] = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api("master-products");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(err.message || "商品主檔載入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function parseExcel(file) {
    setError("");
    setMessage("");
    setPreview([]);
    setFileName(file?.name || "");
    if (!file || !/\.xlsx$/i.test(file.name)) {
      setError("請選擇 .xlsx 商品資料檔");
      return;
    }
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const result = await readXlsxFile(file);
      const excelRows = Array.isArray(result?.[0]?.data) ? result[0].data : result;
      const headers = (excelRows[0] || []).map(v => String(v ?? "").trim());
      const required = ["品號", "品名", "零售價"];
      const missing = required.filter(h => !headers.includes(h));
      if (missing.length) throw new Error(`缺少必要欄位：${missing.join("、")}`);
      const rows = excelRows.slice(1).map((row, index) => {
        const item = { rowNumber: index + 2, dealer_visible: false, active: true, source: "excel" };
        headers.forEach((header, columnIndex) => {
          const key = masterHeaderMap[header];
          if (key) item[key] = row[columnIndex] ?? "";
        });
        item.item_no = String(item.item_no ?? "").trim();
        item.name = String(item.name ?? "").trim();
        ["retail_price", "sale_price", "standard_cost", "safety_stock", "stock_quantity", "unit_weight"].forEach(key => {
          item[key] = Number(String(item[key] ?? 0).replaceAll(",", "")) || 0;
        });
        return item;
      }).filter(item => item.item_no && item.name);
      setPreview(rows);
      setMessage(`已解析 ${rows.length} 筆，確認後會寫入線上商品主檔。`);
    } catch (err) {
      setError(err.message || "Excel 解析失敗");
    }
  }

  async function importPreview() {
    if (!preview.length) return;
    setSaving(true);
    setError("");
    try {
      let saved = 0;
      for (let i = 0; i < preview.length; i += 300) {
        const chunk = preview.slice(i, i + 300);
        const res = await api("master-products", {
          method: "POST",
          body: JSON.stringify({ action: "import", fileName, products: chunk })
        });
        saved += Number(res.saved || 0);
      }
      setPreview([]);
      setMessage(`商品主檔已更新 ${saved} 筆，並自動對應已同步 WooCommerce 商品。`);
      await load();
    } catch (err) {
      setError(err.message || "匯入失敗");
    } finally {
      setSaving(false);
    }
  }

  async function syncWooLinks() {
    setSaving(true);
    setError("");
    try {
      const res = await api("master-products", { method: "POST", body: JSON.stringify({ action: "syncWoo" }) });
      setMessage(`Woo 對應完成：目前 Woo ${res.wooCount || 0} 筆，已對應主檔 ${res.linked || 0} 筆。`);
      await load();
    } catch (err) {
      setError(err.message || "Woo 對應失敗");
    } finally {
      setSaving(false);
    }
  }

  async function showAllSyncedWooProducts() {
    setSaving(true);
    setError("");
    try {
      const res = await api("master-products", {
        method: "POST",
        body: JSON.stringify({ action: "showSyncedWooProducts" })
      });
      setMessage(`已開放 ${res.visibleCount || 0} 筆官網同步商品給經銷商查看；其中 ${res.linkedVisibleCount || 0} 筆已同步更新商品主檔可見狀態。`);
      await load();
    } catch (err) {
      setError(err.message || "開放官網商品失敗");
    } finally {
      setSaving(false);
    }
  }

  function update(id, field, value) {
    setEditMap(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  }

  async function saveRow(product) {
    const edit = editMap[product.id] || {};
    setSaving(true);
    try {
      const res = await api("master-products", {
        method: "POST",
        body: JSON.stringify({ action: "save", products: [{ ...product, ...edit }] })
      });
      setProducts(prev => prev.map(row => row.id === product.id ? { ...row, ...edit } : row));
      setEditMap(prev => { const next = { ...prev }; delete next[product.id]; return next; });
      setMessage(`已儲存 1 筆商品主檔。Woo 對應 ${res.linked || 0} 筆。`);
    } catch (err) {
      setError(err.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const filtered = products.filter(product => {
    const haystack = `${product.item_no} ${product.name} ${product.category} ${product.barcode} ${product.supplier}`.toLowerCase();
    const matchQuery = !query || haystack.includes(query.toLowerCase());
    const matchFilter = filter === "all"
      || (filter === "linked" && product.woo_product_id)
      || (filter === "unlinked" && !product.woo_product_id)
      || (filter === "visible" && product.dealer_visible)
      || (filter === "inactive" && !product.active);
    return matchQuery && matchFilter;
  });

  if (loading) return <div className="woo-loading"><RefreshCw className="spin-icon" /> 正在載入商品主檔...</div>;

  return <div className="master-products">
    <div className="master-intro">
      <div><h2>商品資料庫</h2><p>保存完整內部商品主檔，可包含未上官網商品；WooCommerce 同步後會用 SKU / 品號自動建立對應。</p></div>
      <div className="master-actions">
        <button className="outline" disabled={saving} onClick={syncWooLinks}><RefreshCw /> 對應 Woo 商品</button>
        <button className="primary" disabled={saving} onClick={showAllSyncedWooProducts}><CheckCircle2 /> 官網商品全部可見</button>
      </div>
    </div>
    <div className="master-import">
      <label className="upload-field"><Upload /> 選擇商品 Excel<input type="file" accept=".xlsx" onChange={e => parseExcel(e.target.files?.[0])} /></label>
      {fileName && <span>檔案：<strong>{fileName}</strong></span>}
      <button className="primary" disabled={!preview.length || saving} onClick={importPreview}>{saving ? "處理中..." : `確認匯入 ${preview.length || 0} 筆`}</button>
    </div>
    {message && <div className="woo-sync-message">{message}</div>}
    {error && <div className="woo-error">❌ {error}</div>}
    {preview.length > 0 && <div className="master-preview">預覽：{preview.slice(0, 5).map(row => <span key={row.rowNumber}>{row.item_no}｜{row.name}</span>)}{preview.length > 5 && <b>另有 {preview.length - 5} 筆...</b>}</div>}
    <div className="woo-toolbar">
      <div className="woo-search"><Search size={16} /><input placeholder="搜尋品號、品名、分類、條碼、供應商..." value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="woo-filters">
        {[["all", "全部"], ["linked", "已對應 Woo"], ["unlinked", "未對應 Woo"], ["visible", "經銷商可見"], ["inactive", "停用"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </div>
    <div className="master-table table-scroll">
      <div className="master-head"><span>狀態</span><span>品號／品名</span><span>分類</span><span>價格</span><span>庫存</span><span>條碼／供應商</span><span>Woo</span><span>操作</span></div>
      {filtered.map(product => {
        const edit = editMap[product.id] || {};
        const current = { ...product, ...edit };
        return <div className="master-row" key={product.id}>
          <span className="master-checks">
            <label><input type="checkbox" checked={Boolean(current.active)} onChange={e => update(product.id, "active", e.target.checked)} /> 啟用</label>
            <label><input type="checkbox" checked={Boolean(current.dealer_visible)} onChange={e => update(product.id, "dealer_visible", e.target.checked)} /> 經銷商可見</label>
          </span>
          <span><input value={current.item_no || ""} onChange={e => update(product.id, "item_no", e.target.value)} /><textarea value={current.name || ""} onChange={e => update(product.id, "name", e.target.value)} /></span>
          <span><input value={current.category || ""} onChange={e => update(product.id, "category", e.target.value)} /><small>單位：<input value={current.unit || ""} onChange={e => update(product.id, "unit", e.target.value)} /></small></span>
          <span><input type="number" value={current.retail_price || 0} onChange={e => update(product.id, "retail_price", Number(e.target.value))} /><small>優惠 <input type="number" value={current.sale_price || 0} onChange={e => update(product.id, "sale_price", Number(e.target.value))} /></small></span>
          <span><input type="number" value={current.stock_quantity || 0} onChange={e => update(product.id, "stock_quantity", Number(e.target.value))} /><small>安全 <input type="number" value={current.safety_stock || 0} onChange={e => update(product.id, "safety_stock", Number(e.target.value))} /></small></span>
          <span><input value={current.barcode || ""} onChange={e => update(product.id, "barcode", e.target.value)} /><small><input value={current.supplier || ""} onChange={e => update(product.id, "supplier", e.target.value)} placeholder="主供應商" /></small></span>
          <span>{current.woo_product_id ? <><b>#{current.woo_product_id}</b>{current.woo_permalink && <a href={current.woo_permalink} target="_blank" rel="noreferrer">查看官網</a>}</> : <em>未對應</em>}</span>
          <span><button className="primary" disabled={saving || !editMap[product.id]} onClick={() => saveRow(product)}><Save /> 儲存</button></span>
        </div>;
      })}
      {!filtered.length && <div className="woo-empty">沒有符合條件的商品主檔</div>}
    </div>
  </div>;
}

function WooProductManager({ api }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editMap, setEditMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    api('products').then(data => {
      if (!Array.isArray(data)) { setError(data?.error || '無法載入商品資料'); setLoading(false); return; }
      setProducts(data);
      setSyncMessage(data.length ? `目前使用已同步商品資料，共 ${data.length} 筆。` : '目前資料庫尚無已同步商品，請按「同步官網商品」。');
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [api]);

  function getEdit(id) { return editMap[id] || {}; }
  function setEdit(id, field, value) { setEditMap(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } })); }
  function updateSearch(value) {
    setSearch(value);
    setPage(1);
    setExpandedId(null);
  }
  function updateFilter(value) {
    setFilterStatus(value);
    setPage(1);
    setExpandedId(null);
  }
  function updatePageSize(value) {
    setPageSize(Number(value));
    setPage(1);
    setExpandedId(null);
  }
  async function syncProducts() {
    setSyncing(true);
    setError(null);
    setSyncMessage('正在從官網同步商品，請稍候...');
    try {
      const result = await api('products', { method: 'POST', body: JSON.stringify({ action: 'sync' }) });
      if (!result.ok || !Array.isArray(result.products)) throw new Error(result.error || '同步失敗');
      setProducts(result.products);
      setPage(1);
      setExpandedId(null);
      setSyncMessage(`同步完成，共更新 ${result.count} 筆商品。`);
    } catch (error) {
      setError(error.message || '商品同步失敗');
      setSyncMessage('');
    } finally {
      setSyncing(false);
    }
  }

  const filtered = products.filter(p => {
    const name = (p.name || '').toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q) || sku.includes(q);
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = filtered.length ? (currentPage - 1) * pageSize : 0;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const pagedProducts = filtered.slice(pageStart, pageEnd);

  const statusLabel = s => ({ publish: '已發佈', draft: '草稿', pending: '待審', private: '私密', trash: '已刪除' }[s] || s);
  const statusColor = s => ({ publish: '#22c55e', draft: '#f59e0b', pending: '#3b82f6', private: '#8b5cf6', trash: '#ef4444' }[s] || '#888');

  if (loading) return <div className="woo-loading"><RefreshCw className="spin-icon" /> 正在載入已同步商品...</div>;
  if (error) return <div className="woo-error">❌ {error}</div>;

  return (
    <div className="woo-product-manager">
      <div className="woo-toolbar">
        <div className="woo-search">
          <Search size={16} />
          <input placeholder="搜尋商品名稱或 SKU..." value={search} onChange={e => updateSearch(e.target.value)} />
        </div>
        <button className="woo-sync-button" disabled={syncing} onClick={syncProducts}>
          {syncing ? <><RefreshCw className="spin-icon" /> 同步中...</> : <><RefreshCw size={15} /> 同步官網商品</>}
        </button>
        <div className="woo-filters">
          {['all', 'publish', 'draft', 'pending', 'private'].map(s => (
            <button key={s} className={filterStatus === s ? 'active' : ''} onClick={() => updateFilter(s)}>
              {s === 'all' ? `全部 (${products.length})` : `${statusLabel(s)} (${products.filter(p => p.status === s).length})`}
            </button>
          ))}
        </div>
      </div>
      {syncMessage && <div className={`woo-sync-message ${syncing ? 'syncing' : ''}`}>{syncMessage}</div>}
      <WooPagination
        total={filtered.length}
        page={currentPage}
        pageCount={pageCount}
        pageStart={pageStart}
        pageEnd={pageEnd}
        pageSize={pageSize}
        onPage={next => { setPage(next); setExpandedId(null); }}
        onPageSize={updatePageSize}
      />

      <div className="woo-product-list">
        {filtered.length === 0 && <div className="woo-empty">沒有符合條件的商品</div>}
        {pagedProducts.map(p => {
          const edit = getEdit(p.id);
          const isOpen = expandedId === p.id;
          const price = p.price || p.regular_price || '';
          const salePrice = p.sale_price || '';
          const cats = (p.categories || []).map(c => c.name).join(', ');
          const tags = (p.tags || []).map(t => t.name).join(', ');
          const images = p.images || [];
          const attrs = p.attributes || [];
          const dims = p.dimensions || {};

          return (
            <div key={p.id} className={`woo-product-card ${isOpen ? 'open' : ''}`}>
              {/* Summary Row */}
              <div className="woo-product-summary" onClick={() => setExpandedId(isOpen ? null : p.id)}>
                <img src={images[0]?.src || ''} alt={p.name} className="woo-thumb" />
                <div className="woo-summary-info">
                  <strong dangerouslySetInnerHTML={{ __html: p.name }} />
                  <span className="woo-sku">SKU: {p.sku || '—'}</span>
                </div>
                <div className="woo-summary-meta">
                  <span style={{ color: statusColor(p.status), fontWeight: 600, fontSize: '0.75rem' }}>● {statusLabel(p.status)}</span>
                  <span className="woo-price">NT$ {Number(price).toLocaleString('zh-TW')}</span>
                  {salePrice && <span className="woo-sale">特價 NT$ {Number(salePrice).toLocaleString('zh-TW')}</span>}
                </div>
                <span className="woo-expand-icon">{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded Detail */}
              {isOpen && (
                <div className="woo-product-detail">
                  <div className="woo-detail-grid">

                    {/* Basic Info */}
                    <section className="woo-section">
                      <h4>基本資訊</h4>
                      <label><span>商品名稱</span><input value={edit.name ?? stripHtml(p.name)} onChange={e => setEdit(p.id, 'name', e.target.value)} /></label>
                      <label><span>SKU</span><input value={edit.sku ?? p.sku} onChange={e => setEdit(p.id, 'sku', e.target.value)} /></label>
                      <label><span>狀態</span>
                        <select value={edit.status ?? p.status} onChange={e => setEdit(p.id, 'status', e.target.value)}>
                          <option value="publish">已發佈</option>
                          <option value="draft">草稿</option>
                          <option value="pending">待審核</option>
                          <option value="private">私密</option>
                        </select>
                      </label>
                      <label><span>分類</span><input value={edit.categories ?? cats} onChange={e => setEdit(p.id, 'categories', e.target.value)} /></label>
                      <label><span>標籤</span><input value={edit.tags ?? tags} onChange={e => setEdit(p.id, 'tags', e.target.value)} /></label>
                      <label><span>商品類型</span><span className="woo-readonly">{p.type || '—'}</span></label>
                      <label><span>WP 連結</span><a href={p.permalink} target="_blank" rel="noreferrer" className="woo-link">{p.permalink}</a></label>
                      <label><span>建立時間</span><span className="woo-readonly">{p.date_created ? new Date(p.date_created).toLocaleString('zh-TW') : '—'}</span></label>
                      <label><span>修改時間</span><span className="woo-readonly">{p.date_modified ? new Date(p.date_modified).toLocaleString('zh-TW') : '—'}</span></label>
                    </section>

                    {/* Pricing */}
                    <section className="woo-section">
                      <h4>價格</h4>
                      <label><span>定價</span><input type="number" value={edit.regular_price ?? p.regular_price} onChange={e => setEdit(p.id, 'regular_price', e.target.value)} /></label>
                      <label><span>特價</span><input type="number" value={edit.sale_price ?? p.sale_price} onChange={e => setEdit(p.id, 'sale_price', e.target.value)} /></label>
                      <label><span>特價開始</span><input type="date" value={edit.date_on_sale_from?.slice(0,10) ?? (p.date_on_sale_from?.slice(0,10) || '')} onChange={e => setEdit(p.id, 'date_on_sale_from', e.target.value)} /></label>
                      <label><span>特價結束</span><input type="date" value={edit.date_on_sale_to?.slice(0,10) ?? (p.date_on_sale_to?.slice(0,10) || '')} onChange={e => setEdit(p.id, 'date_on_sale_to', e.target.value)} /></label>
                      <label><span>含稅狀態</span><span className="woo-readonly">{p.tax_status || '—'} / {p.tax_class || '標準'}</span></label>
                    </section>

                    {/* Inventory */}
                    <section className="woo-section">
                      <h4>庫存</h4>
                      <label><span>管理庫存</span>
                        <select value={edit.manage_stock ?? String(p.manage_stock)} onChange={e => setEdit(p.id, 'manage_stock', e.target.value === 'true')}>
                          <option value="true">是</option>
                          <option value="false">否</option>
                        </select>
                      </label>
                      <label><span>庫存數量</span><input type="number" value={edit.stock_quantity ?? p.stock_quantity} onChange={e => setEdit(p.id, 'stock_quantity', Number(e.target.value))} /></label>
                      <label><span>庫存狀態</span>
                        <select value={edit.stock_status ?? p.stock_status} onChange={e => setEdit(p.id, 'stock_status', e.target.value)}>
                          <option value="instock">有庫存</option>
                          <option value="outofstock">缺貨</option>
                          <option value="onbackorder">預購中</option>
                        </select>
                      </label>
                      <label><span>允許預購</span>
                        <select value={edit.backorders ?? p.backorders} onChange={e => setEdit(p.id, 'backorders', e.target.value)}>
                          <option value="no">不允許</option>
                          <option value="notify">通知</option>
                          <option value="yes">允許</option>
                        </select>
                      </label>
                      <label><span>低庫存閾值</span><input type="number" value={edit.low_stock_amount ?? p.low_stock_amount} onChange={e => setEdit(p.id, 'low_stock_amount', Number(e.target.value))} /></label>
                      <label><span>總銷售量</span><span className="woo-readonly">{p.total_sales ?? '—'}</span></label>
                    </section>

                    {/* Shipping */}
                    <section className="woo-section">
                      <h4>運送</h4>
                      <label><span>重量 (kg)</span><input type="number" value={edit.weight ?? p.weight} onChange={e => setEdit(p.id, 'weight', e.target.value)} /></label>
                      <label><span>長 (cm)</span><input type="number" value={edit['dim_length'] ?? dims.length} onChange={e => setEdit(p.id, 'dim_length', e.target.value)} /></label>
                      <label><span>寬 (cm)</span><input type="number" value={edit['dim_width'] ?? dims.width} onChange={e => setEdit(p.id, 'dim_width', e.target.value)} /></label>
                      <label><span>高 (cm)</span><input type="number" value={edit['dim_height'] ?? dims.height} onChange={e => setEdit(p.id, 'dim_height', e.target.value)} /></label>
                      <label><span>運費等級</span><input value={edit.shipping_class ?? p.shipping_class} onChange={e => setEdit(p.id, 'shipping_class', e.target.value)} /></label>
                    </section>

                    {/* Description */}
                    <section className="woo-section woo-section-full">
                      <h4>商品描述</h4>
                      <label><span>完整描述</span><textarea rows={4} value={edit.description ?? stripHtml(p.description)} onChange={e => setEdit(p.id, 'description', e.target.value)} /></label>
                      <label><span>簡短描述</span><textarea rows={2} value={edit.short_description ?? stripHtml(p.short_description)} onChange={e => setEdit(p.id, 'short_description', e.target.value)} /></label>
                      <label><span>購買備註</span><input value={edit.purchase_note ?? p.purchase_note} onChange={e => setEdit(p.id, 'purchase_note', e.target.value)} /></label>
                    </section>

                    {/* Images */}
                    <section className="woo-section woo-section-full">
                      <h4>商品圖片</h4>
                      <div className="woo-images">
                        {images.map((img, i) => (
                          <div key={img.id} className="woo-image-item">
                            <img src={img.src} alt={img.alt || img.name} />
                            <span>{i === 0 ? '主圖' : `附圖 ${i}`}</span>
                            <small>{img.name}</small>
                          </div>
                        ))}
                        {images.length === 0 && <span className="woo-readonly">（無圖片）</span>}
                      </div>
                    </section>

                    {/* Attributes */}
                    {attrs.length > 0 && (
                      <section className="woo-section woo-section-full">
                        <h4>商品屬性</h4>
                        <div className="woo-attrs">
                          {attrs.map(attr => (
                            <div key={attr.id || attr.name} className="woo-attr-row">
                              <strong>{attr.name}：</strong>
                              <span>{(attr.options || []).join('、')}</span>
                              <small>{attr.visible ? '前台顯示' : '隱藏'} · {attr.variation ? '變化款' : ''}</small>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Meta */}
                    <section className="woo-section">
                      <h4>SEO / 進階</h4>
                      <label><span>精選</span>
                        <select value={edit.featured ?? String(p.featured)} onChange={e => setEdit(p.id, 'featured', e.target.value === 'true')}>
                          <option value="false">否</option>
                          <option value="true">是</option>
                        </select>
                      </label>
                      <label><span>評論開放</span>
                        <select value={edit.reviews_allowed ?? String(p.reviews_allowed)} onChange={e => setEdit(p.id, 'reviews_allowed', e.target.value === 'true')}>
                          <option value="true">是</option>
                          <option value="false">否</option>
                        </select>
                      </label>
                      <label><span>平均評分</span><span className="woo-readonly">{p.average_rating} ({p.rating_count} 則)</span></label>
                      <label><span>選單順序</span><input type="number" value={edit.menu_order ?? p.menu_order} onChange={e => setEdit(p.id, 'menu_order', Number(e.target.value))} /></label>
                    </section>
                  </div>

                  <div className="woo-actions">
                    <button className="primary" disabled={saving || !editMap[p.id]} onClick={async () => {
                      setSaving(true);
                      try {
                        const payload = { ...editMap[p.id], id: p.id };
                        const res = await api('products', { method: 'POST', body: JSON.stringify({ action: 'update', product: payload }) });
                        if (res.ok !== false) {
                          setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, ...editMap[p.id] } : prod));
                          setEditMap(prev => { const n = { ...prev }; delete n[p.id]; return n; });
                          alert('✅ 商品已更新');
                        } else {
                          alert('❌ 更新失敗：' + (res.error || '請確認 API 設定'));
                        }
                      } finally { setSaving(false); }
                    }}>
                      {saving ? <><RefreshCw className="spin-icon" /> 儲存中...</> : <><Save size={14} /> 儲存此商品</>}
                    </button>
                    <button onClick={() => { setEditMap(prev => { const n = { ...prev }; delete n[p.id]; return n; }); }}>
                      撤銷修改
                    </button>
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="woo-btn-link">↗ 查看前台</a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length > pageSize && <WooPagination
        total={filtered.length}
        page={currentPage}
        pageCount={pageCount}
        pageStart={pageStart}
        pageEnd={pageEnd}
        pageSize={pageSize}
        onPage={next => { setPage(next); setExpandedId(null); }}
        onPageSize={updatePageSize}
        compact
      />}
    </div>
  );
}

function WooPagination({ total, page, pageCount, pageStart, pageEnd, pageSize, onPage, onPageSize, compact = false }) {
  return <div className={`woo-pagination ${compact ? 'compact' : ''}`}>
    <div className="woo-page-info">
      {total ? <>顯示 <strong>{pageStart + 1}</strong> - <strong>{pageEnd}</strong> 筆，共 <strong>{total}</strong> 筆</> : <>目前沒有商品</>}
    </div>
    <div className="woo-page-controls">
      {!compact && <label>每頁
        <select value={pageSize} onChange={e => onPageSize(e.target.value)}>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        筆
      </label>}
      <button disabled={page <= 1} onClick={() => onPage(1)}>第一頁</button>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>上一頁</button>
      <span>{page} / {pageCount}</span>
      <button disabled={page >= pageCount} onClick={() => onPage(page + 1)}>下一頁</button>
      <button disabled={page >= pageCount} onClick={() => onPage(pageCount)}>最後頁</button>
    </div>
  </div>;
}

function WooCommerceSettings({ api }) {

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ url: '', consumerKey: '', consumerSecret: '' });

  useEffect(() => {
    api('settings?action=woocommerce').then(res => {
      if (res.ok && res.settings) {
        setSettings({
          url: res.settings.url || '',
          consumerKey: res.settings.consumerKeyMasked || '',
          consumerSecret: res.settings.consumerSecretMasked || ''
        });
      }
      setLoading(false);
    });
  }, [api]);

  async function handleSave() {
    setSaving(true);
    const res = await api('settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'woocommerce', ...settings })
    });
    setSaving(false);
    if (res.ok) alert("WooCommerce API 設定已儲存");
    else alert("儲存失敗: " + (res.error || "未知錯誤"));
  }

  if (loading) return <div>載入中...</div>;

  return (
    <div className="admin-form">
      <h2>WooCommerce API 設定</h2>
      <p style={{marginBottom: "1rem", color: "#666"}}>設定商店網址與 REST API 金鑰以同步商品資料。金鑰基於安全考量會遮蔽，若需更新請直接輸入新金鑰。</p>
      <AdminField label="商店網址 (URL)" value={settings.url} onChange={v => setSettings({ ...settings, url: v })} />
      <AdminField label="消費者金鑰 (Consumer Key)" value={settings.consumerKey} onChange={v => setSettings({ ...settings, consumerKey: v })} />
      <AdminField label="消費者密鑰 (Consumer Secret)" value={settings.consumerSecret} onChange={v => setSettings({ ...settings, consumerSecret: v })} />
      <button className="primary" onClick={handleSave} disabled={saving}>
        {saving ? "儲存中..." : "儲存設定"}
      </button>
    </div>
  );
}

function AdminDashboard({ orders, transfers, reports, sales, movements, products, dealers, onGo }) {
  const pendingOrders = orders.filter(order => ["訂單成立", "已確認", "備貨中"].includes(order.status));
  const readyTransfers = transfers.filter(transfer => ["草稿", "已確認"].includes(transfer.status));
  const pendingReports = reports.filter(report => report.status === "待審核");
  const approvedReports = reports.filter(report => report.status === "已審核");
  const productStockRows = products.map(product => ({
    ...product,
    qty: movements.filter(m => Number(m.productId) === Number(product.id)).reduce((sum, movement) => sum + Number(movement.qty), 0)
  }));
  const lowStockRows = productStockRows.filter(product => product.qty > 0 && product.qty <= 5);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthSales = sales
    .filter(doc => String(doc.month || doc.date || "").startsWith(monthKey))
    .reduce((sum, doc) => sum + Number(doc.totalAmount || doc.items?.reduce((s, item) => s + item.qty * item.price, 0) || 0), 0);
  const latestOrders = orders.slice(0, 5);
  const urgentReports = [...pendingReports, ...approvedReports].slice(0, 5);

  return <div className="admin-dashboard">
    <div className="dashboard-hero">
      <div><span className="eyebrow">TODAY'S OPERATIONS</span><h2>行政工作儀錶板</h2><p>先處理待確認採購單、待調撥單與寄售銷售回報；每張卡片都可以直接點進工作頁。</p></div>
      <strong>{new Date().toLocaleDateString("zh-TW")}</strong>
    </div>
    <div className="dashboard-cards">
      <button onClick={() => onGo("orders", { status: "待處理", id: pendingOrders[0]?.id })}><ClipboardCheck /><span>待處理採購單</span><strong>{pendingOrders.length}</strong><small>確認、改數量、列印報價或轉調撥</small></button>
      <button onClick={() => onGo("transfers", { status: "草稿", id: readyTransfers[0]?.id })}><Truck /><span>待調撥單</span><strong>{readyTransfers.length}</strong><small>確認調撥與主倉出庫</small></button>
      <button onClick={() => onGo("reports", { status: "待審核", id: pendingReports[0]?.id })}><FileText /><span>寄售回報待審</span><strong>{pendingReports.length}</strong><small>{approvedReports.length} 筆已審核待轉銷貨單</small></button>
      <button onClick={() => onGo("inventory")}><Warehouse /><span>低庫存品項</span><strong>{lowStockRows.length}</strong><small>查看經銷商寄售庫存水位</small></button>
      <button onClick={() => onGo("sales")}><Database /><span>本月銷貨金額</span><strong>{money(monthSales)}</strong><small>查看銷貨單與請款資料</small></button>
      <button onClick={() => onGo("accounts")}><UserRound /><span>經銷商帳號</span><strong>{dealers.length}</strong><small>管理帳號、模式與門市資料</small></button>
    </div>
    <div className="dashboard-panels">
      <section>
        <div className="panel-title"><h3>最新採購單</h3><button onClick={() => onGo("orders", { status: "全部" })}>全部採購單 <ChevronRight /></button></div>
        {latestOrders.length ? latestOrders.map(order => <button className="dashboard-row" key={order.id} onClick={() => onGo("orders", { status: "全部", id: order.id })}><span><strong>{order.id}</strong><small>{order.company} · {order.date}</small></span><b className={`order-status ${order.status === "已取消" ? "cancelled" : ""}`}>{order.status}</b><em>{money(order.amount)}</em></button>) : <div className="document-empty compact">目前沒有採購單</div>}
      </section>
      <section>
        <div className="panel-title"><h3>寄售回報追蹤</h3><button onClick={() => onGo("reports", { status: "待審核" })}>前往審核 <ChevronRight /></button></div>
        {urgentReports.length ? urgentReports.map(report => <button className="dashboard-row" key={report.id} onClick={() => onGo("reports", { status: report.status, id: report.id })}><span><strong>{report.id}</strong><small>{report.company} · {report.periodStart} 至 {report.periodEnd}</small></span><b className={`order-status ${report.status === "已審核" ? "" : "cancelled"}`}>{report.status}</b><em>{money(report.totalAmount)}</em></button>) : <div className="document-empty compact">目前沒有待追蹤回報</div>}
      </section>
    </div>
  </div>;
}

function AdminPanel({ api, content, products, productEdits, channels, dealers, orders, transfers, warehouseMovements, movements, sales, consignmentReports, onSave, onSaveInventory, onCreateDealerAccount, onUpdateOrder, onCreateTransfer, onUpdateTransfer, onReviewConsignmentReport, onConvertConsignmentReport }) {
  const [tab, setTab] = useState("dashboard");
  const [focus, setFocus] = useState({});
  const [draft, setDraft] = useState(content);
  const [edits, setEdits] = useState(productEdits);
  const [channelDraft, setChannelDraft] = useState(channels);

  function goTab(nextTab, nextFocus = {}) {
    setFocus(nextFocus);
    setTab(nextTab);
  }

  function updateProduct(product, field, value) {
    setEdits(prev => ({ ...prev, [product.id]: { ...(prev[product.id] || {}), [field]: value } }));
  }

  return <main className="admin-page">
    <section className="admin-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>營運管理後台</h1><p>從儀錶板掌握待處理事項，快速進入採購、調撥、寄售與商品管理。</p></div><button className="primary" onClick={() => onSave(draft, edits, channelDraft)}><Save /> 儲存所有變更</button></section>
    <div className="admin-notice">帳號、內容、訂單與正式營運資料由目前的 GCP 伺服器與 PostgreSQL 資料庫集中管理。</div>
    <div className="admin-layout">
      <aside className="admin-menu">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => goTab("dashboard")}><LayoutDashboard /> 儀錶板</button>
        <span>營運處理</span>
        <button className={tab === "orders" ? "active" : ""} onClick={() => goTab("orders")}><ClipboardCheck /> 採購單處理</button>
        <button className={tab === "transfers" ? "active" : ""} onClick={() => goTab("transfers")}><Truck /> 調撥／倉儲</button>
        <button className={tab === "reports" ? "active" : ""} onClick={() => goTab("reports")}><ClipboardCheck /> 寄售回報審核</button>
        <button className={tab === "sales" ? "active" : ""} onClick={() => goTab("sales")}><FileText /> 銷貨單</button>
        <button className={tab === "import" ? "active" : ""} onClick={() => goTab("import")}><Upload /> Excel 正式銷貨單</button>
        <span>商品與庫存</span>
        <button className={tab === "masterProducts" ? "active" : ""} onClick={() => goTab("masterProducts")}><Database /> 商品資料庫</button>
        <button className={tab === "products" ? "active" : ""} onClick={() => goTab("products")}><ShoppingBag /> 官網商品同步</button>
        <button className={tab === "inventory" ? "active" : ""} onClick={() => goTab("inventory")}><Warehouse /> 寄售庫存</button>
        <button className={tab === "adjust" ? "active" : ""} onClick={() => goTab("adjust")}><SlidersHorizontal /> 盤點修正</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => goTab("history")}><History /> 異動紀錄</button>
        <span>經銷商與系統</span>
        <button className={tab === "accounts" ? "active" : ""} onClick={() => goTab("accounts")}><UserRound /> 經銷商帳號</button>
        <button className={tab === "channels" ? "active" : ""} onClick={() => goTab("channels")}><Store /> 通路設定</button>
        <button className={tab === "content" ? "active" : ""} onClick={() => goTab("content")}><LayoutDashboard /> 首頁內容</button>
        <button className={tab === "api" ? "active" : ""} onClick={() => goTab("api")}><Settings /> API 設定</button>
      </aside>
      <section className="admin-content">
        {tab === "dashboard" ? <AdminDashboard orders={orders} transfers={transfers} reports={consignmentReports} sales={sales} movements={movements} products={products} dealers={dealers} onGo={goTab} /> : tab === "api" ? <WooCommerceSettings api={api} /> : tab === "content" ? <div className="admin-form">
          <AdminField label="首頁主標題" value={draft.heroTitle} onChange={v => setDraft({ ...draft, heroTitle: v })} />
          <AdminField label="首頁介紹文字" value={draft.heroText} onChange={v => setDraft({ ...draft, heroText: v })} area />
          <AdminField label="首頁主圖片網址" value={draft.heroImage} onChange={v => setDraft({ ...draft, heroImage: v })} icon />
          <h2>新品通知</h2>
          <AdminField label="新品標題" value={draft.newTitle} onChange={v => setDraft({ ...draft, newTitle: v })} />
          <AdminField label="新品說明" value={draft.newText} onChange={v => setDraft({ ...draft, newText: v })} area />
          <AdminField label="新品圖片網址" value={draft.newImage} onChange={v => setDraft({ ...draft, newImage: v })} icon />
          <h2>活動訊息</h2>
          <AdminField label="活動名稱" value={draft.eventTitle} onChange={v => setDraft({ ...draft, eventTitle: v })} />
          <AdminField label="活動期間" value={draft.eventDate} onChange={v => setDraft({ ...draft, eventDate: v })} />
          <AdminField label="活動內容" value={draft.eventText} onChange={v => setDraft({ ...draft, eventText: v })} area />
          <h2>展示架申請</h2>
          <AdminField label="區塊標題" value={draft.displayTitle} onChange={v => setDraft({ ...draft, displayTitle: v })} />
          <AdminField label="申請說明" value={draft.displayText} onChange={v => setDraft({ ...draft, displayText: v })} area />
        </div> : tab === "accounts" ? <DealerAccountManager dealers={dealers} onCreate={onCreateDealerAccount} /> : tab === "orders" ? <OrderManager orders={orders} dealers={dealers} transfers={transfers} products={products} focus={focus} onUpdate={onUpdateOrder} onCreateTransfer={onCreateTransfer} /> : tab === "transfers" ? <TransferWarehouseManager transfers={transfers} warehouseMovements={warehouseMovements} products={products} focus={focus} onUpdateTransfer={onUpdateTransfer} /> : tab === "masterProducts" ? <ProductMasterManager api={api} /> : tab === "products" ? <WooProductManager api={api} /> : tab === "channels" ? <ChannelManager channels={channelDraft} onChange={setChannelDraft} /> : tab === "inventory" ? <InventoryOverview channels={channelDraft} products={products} movements={movements} /> : tab === "reports" ? <ConsignmentReportAdmin reports={consignmentReports} movements={movements} focus={focus} onReview={onReviewConsignmentReport} onConvert={onConvertConsignmentReport} /> : tab === "sales" ? <SalesManager channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : tab === "import" ? <FormalSalesImport channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : tab === "adjust" ? <StockAdjustment channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : <MovementHistory products={products} movements={movements} />}
      </section>
    </div>
  </main>;
}

function OrderManager({ orders, dealers, transfers = [], products = [], focus = {}, onUpdate, onCreateTransfer }) {
  const [status, setStatus] = useState("待處理");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(orders[0]?.id || "");
  const [draft, setDraft] = useState({ trackingNo: "", note: "" });
  const [itemDraft, setItemDraft] = useState({});
  const [forceEdit, setForceEdit] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingStatuses = ["訂單成立", "已確認", "備貨中"];
  const visibleOrders = orders.filter(order => {
    const matchStatus = status === "全部" || (status === "待處理" ? pendingStatuses.includes(order.status) : order.status === status);
    const haystack = `${order.id} ${order.company} ${order.contact} ${order.shipping?.storeName || ""} ${order.shipping?.companyName || ""}`.toLowerCase();
    return matchStatus && haystack.includes(query.toLowerCase());
  });
  const selected = orders.find(order => order.id === selectedId) || visibleOrders[0] || orders[0];
  const selectedDealer = dealers.find(row => row.company_name === selected?.company);
  const selectedTransfer = transfers.find(transfer => transfer.orderNo === selected?.id);
  const productMap = Object.fromEntries(products.map(p => [Number(p.id), p]));
  const summary = {
    pending: orders.filter(order => pendingStatuses.includes(order.status)).length,
    shipped: orders.filter(order => ["已出貨", "已完成"].includes(order.status)).length,
    total: orders.reduce((sum, order) => sum + Number(order.amount || 0), 0)
  };

  useEffect(() => {
    if (focus.status) setStatus(focus.status);
    if (focus.id) setSelectedId(focus.id);
  }, [focus.id, focus.status]);

  useEffect(() => {
    if (selected) setDraft({ trackingNo: selected.trackingNo || "", note: selected.adminNote || "" });
  }, [selected?.id, selected?.trackingNo, selected?.adminNote]);

  useEffect(() => {
    if (selected) setItemDraft(Object.fromEntries(selected.lineItems.map(item => [item.id, item.qty])));
  }, [selected?.id]);

  async function update(statusValue = selected.status) {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onUpdate(selected.uuid || selected.id, {
        status: statusValue,
        trackingNo: draft.trackingNo,
        note: draft.note,
        ...(!quantityLocked || forceEdit ? { itemQuantities: itemDraft, forceQuantityEdit: forceEdit, overrideReason } : {})
      });
    } finally {
      setSaving(false);
    }
  }

  async function convertToTransfer() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onCreateTransfer(selected.uuid || selected.id);
    } finally {
      setSaving(false);
    }
  }

  function nextStatus(current) {
    const index = orderStatusFlow.indexOf(current);
    return index >= 0 && index < orderStatusFlow.length - 1 ? orderStatusFlow[index + 1] : current;
  }
  const quantityLocked = selected && ["已出貨", "已完成"].includes(selected.status);
  const canEditQuantity = !quantityLocked || forceEdit;
  const suggestedNext = selected ? nextStatus(selected.status) : "";
  function printQuote() {
    if (!selected) return;
    openPrintableDocument({
      type: "quote",
      title: "報價單",
      number: selected.id,
      date: selected.date,
      company: selected.company,
      destination: selected.shipping,
      note: selected.adminNote,
      items: selected.lineItems.map(item => {
        const identity = productIdentity(item, productMap);
        return {
          ...identity,
          qty: item.qty,
          price: item.dealerPrice,
          amount: item.lineTotal,
          note: selected.shipping?.storeName || ""
        };
      }),
      totals: { preTax: selected.preTaxAmount, tax: selected.taxAmount, total: selected.amount }
    });
  }

  return <div className="order-admin">
    <div className="order-admin-summary">
      <div><span>待處理採購單</span><strong>{summary.pending}</strong></div>
      <div><span>已出貨／完成</span><strong>{summary.shipped}</strong></div>
      <div><span>訂單總額</span><strong>{money(summary.total)}</strong></div>
    </div>
    <div className="order-admin-tools">
      <div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋訂單、經銷商、門市" /></div>
      <select value={status} onChange={e => setStatus(e.target.value)}>
        <option>待處理</option><option>全部</option>{orderStatusOptions.map(option => <option key={option}>{option}</option>)}
      </select>
    </div>
    <div className="order-admin-layout">
      <div className="order-admin-list">
        {visibleOrders.length === 0 ? <div className="document-empty">目前沒有符合條件的採購單</div> : visibleOrders.map(order => (
          <button className={selected?.id === order.id ? "active" : ""} key={order.id} onClick={() => setSelectedId(order.id)}>
            <span><strong>{order.id}</strong><small>{order.date} · {order.company}</small></span>
            <b className={`order-status ${order.status === "已取消" ? "cancelled" : ""}`}>{order.status}</b>
            <em>{money(order.amount)}</em>
          </button>
        ))}
      </div>
      {selected && <article className="order-admin-detail">
        <div className="order-detail-head">
          <div><span className="eyebrow">PURCHASE ORDER</span><h2>{selected.id}</h2><p>{selected.company} · {selected.contact || "未填聯絡人"} · {selected.date}</p></div>
          <span className={`order-status ${selected.status === "已取消" ? "cancelled" : ""}`}>{selected.status}</span>
        </div>
        <div className="order-progress">
          {orderStatusFlow.map((step, index) => {
            const activeIndex = orderStatusFlow.indexOf(selected.status);
            return <div className={activeIndex >= index ? "done" : ""} key={step}><i>{index + 1}</i><span>{step}</span></div>;
          })}
        </div>
        <div className="order-detail-grid">
          <section>
            <h3>收貨資訊</h3>
            <p><strong>{selected.shipping?.storeName || "未指定門市"}</strong><span>{selected.shipping?.companyName}</span><span>{selected.shipping?.postalCode} {selected.shipping?.address}</span><small>收件：{selected.shipping?.recipientName || "-"}／{selected.shipping?.recipientPhone || "-"}</small></p>
          </section>
          <section>
            <h3>經銷設定</h3>
            <p><strong>{selectedDealer?.mode === "consignment" ? "寄售" : "買斷"}</strong><span>{discountLabel(selectedDealer?.discount_percent || selected.pricing?.discount || 100)}</span><small>{pricingDescription(selected.pricing || selectedDealer || {})}</small></p>
          </section>
          <section>
            <h3>調撥狀態</h3>
            <p>{selectedTransfer ? <><strong>{selectedTransfer.id}</strong><span>{selectedTransfer.status}</span><small>{selectedTransfer.warehouse} → {selectedTransfer.destination?.storeName || selected.shipping?.storeName || selected.company}</small></> : <><strong>尚未建立調撥單</strong><span>寄售流程需先轉成調撥單，再進行倉庫出庫與客戶倉入庫。</span></>}</p>
          </section>
        </div>
        <div className="order-line-table table-scroll">
          <div className="order-line-head"><span>商品</span><span>SKU</span><span>數量</span><span>經銷單價</span><span>小計</span></div>
          {selected.lineItems.map(item => <div className="order-line-row" key={item.id || item.sku}>
            <span>{item.image && <img src={item.image} alt="" />}<strong>{item.name}</strong></span>
            <span>{item.sku}</span><label className="order-qty-edit"><input type="number" min="1" disabled={!canEditQuantity || saving} value={itemDraft[item.id] ?? item.qty} onChange={e => setItemDraft({ ...itemDraft, [item.id]: Math.max(1, Number(e.target.value) || 1) })} /><small>原 {item.qty}</small></label><span>{money(item.dealerPrice)}</span><strong>{money(item.lineTotal)}</strong>
          </div>)}
        </div>
        <div className="order-admin-total">
          <span>未稅 {money(selected.preTaxAmount || 0)}</span>
          <span>稅額 {money(selected.taxAmount || 0)}</span>
          <strong>總計 {money(selected.amount)}</strong>
        </div>
	        <div className="order-update-panel">
          {selected && suggestedNext !== selected.status && <div className="next-step-banner"><div><span>建議下一步</span><strong>將採購單推進到「{suggestedNext}」</strong><small>{selectedTransfer ? `已建立調撥單 ${selectedTransfer.id}` : selectedDealer?.mode === "consignment" ? "寄售訂單完成確認後，建議轉成調撥單。" : "確認商品與數量後即可推進流程。"}</small></div><button className="primary" disabled={saving} onClick={() => update(suggestedNext)}>{saving ? <RefreshCw className="spin-icon" /> : <ClipboardCheck />} 執行下一步</button></div>}
	          <label><span>物流單號</span><input value={draft.trackingNo} onChange={e => setDraft({ ...draft, trackingNo: e.target.value })} placeholder="可空白，出貨後補登" /></label>
	          <label><span>內部備註</span><textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="例如：急件、缺貨品項、業務交辦事項" /></label>
	          {quantityLocked && <div className="override-panel"><label><input type="checkbox" checked={forceEdit} onChange={e => setForceEdit(e.target.checked)} /> 最高權限強制修正已出貨／完成訂單數量</label>{forceEdit && <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="請填寫修正原因，例如：出貨後發現數量登錄錯誤" />}</div>}
          <div className="order-actions secondary-actions">
            <select value={selected.status} onChange={e => update(e.target.value)} disabled={saving}>{orderStatusOptions.map(option => <option key={option}>{option}</option>)}</select>
            <button className="outline" disabled={saving || !canEditQuantity} onClick={() => update()}><Save /> 儲存數量與金額</button>
            <button className="outline" disabled={saving} onClick={() => update()}><Save /> 儲存物流／備註</button>
            <button className="outline" disabled={saving} onClick={printQuote}><FileDown /> 列印報價單</button>
            <button className="outline" disabled={saving || Boolean(selectedTransfer) || selected.status === "已取消"} onClick={convertToTransfer}><Truck /> 轉成調撥單</button>
	          </div>
          {quantityLocked && <small className="order-inventory-note warning">已出貨或已完成的訂單修改需要最高權限與修正原因。若已建立調撥單，也請同步檢查調撥單與倉儲紀錄。</small>}
          {selectedDealer?.mode === "consignment" && <small className="order-inventory-note">寄售流程建議：採購單確認 → 轉調撥單 → 調撥單已調撥時，才寫入東瑭主倉出庫與經銷商寄售入庫。</small>}
        </div>
      </article>}
    </div>
  </div>;
}

function ProductBadges({ badges = [] }) {
  return <span className="product-badges">{badges.map(key => {
    const badge = productBadgeOptions.find(option => option.key === key);
    return badge ? <span className={`product-badge ${key}`} key={key}>{badge.label}</span> : null;
  })}</span>;
}

function DealerAccountManager({ dealers, onCreate }) {
  const initial = { email: "", companyName: "", contactName: "", phone: "", password: "", confirmPassword: "", mode: "buyout", discount: 70, hideDealerPrice: false };
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const realDealers = dealers.filter(row => !row.email.endsWith("@eavo.invalid"));

  async function submit() {
    if (form.password !== form.confirmPassword) {
      setMessage({ type: "error", text: "兩次輸入的初始密碼不一致。" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onCreate(form);
      setMessage({ type: "success", text: `帳號 ${form.email} 已建立，可立即登入。請使用安全方式將初始密碼交給經銷商。` });
      setForm(initial);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "帳號建立失敗。" });
    } finally {
      setSaving(false);
    }
  }

  return <div className="dealer-accounts">
    <div className="account-create-head"><div><h2>手動建立經銷商帳號</h2><p>建立後帳號會自動啟用，不需寄送邀請信。</p></div><b>{realDealers.length} 個登入帳號</b></div>
    {message && <div className={`profile-message ${message.type}`}>{message.type === "success" && <CheckCircle2 />}{message.text}</div>}
    <div className="account-create-form">
      <ProfileInput label="登入 Email *" value={form.email} onChange={v => setForm({ ...form, email: v })} />
      <ProfileInput label="公司名稱 *" value={form.companyName} onChange={v => setForm({ ...form, companyName: v })} />
      <ProfileInput label="主要聯絡人 *" value={form.contactName} onChange={v => setForm({ ...form, contactName: v })} />
      <ProfileInput label="聯絡電話" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
      <ProfileInput label="初始密碼 *" type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} />
      <ProfileInput label="再次輸入密碼 *" type="password" value={form.confirmPassword} onChange={v => setForm({ ...form, confirmPassword: v })} />
      <label className="profile-input"><span>經銷模式</span><select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}><option value="buyout">買斷</option><option value="consignment">寄售</option></select></label>
      <label className="profile-input"><span>經銷折數百分比</span><input type="number" min="1" max="100" value={form.discount} onChange={e => setForm({ ...form, discount: Number(e.target.value) })} /></label>
      <label className="account-checkbox"><input type="checkbox" checked={form.hideDealerPrice} onChange={e => setForm({ ...form, hideDealerPrice: e.target.checked })} /> 前台不顯示經銷價</label>
      <button className="primary account-create-button" disabled={saving} onClick={submit}>{saving ? <><RefreshCw className="spin-icon" /> 建立中...</> : <><Plus /> 建立並啟用帳號</>}</button>
    </div>
    <div className="account-list"><h3>已建立的經銷商</h3>{realDealers.map(row => <div key={row.id}><div><strong>{row.company_name}</strong><small>{row.email} · {row.contact_name || "未填聯絡人"}</small></div><span>{row.mode === "consignment" ? "寄售" : "買斷"} · {discountLabel(row.discount_percent)}</span><b className={row.active ? "active" : ""}>{row.active ? "啟用" : "停用"}</b></div>)}</div>
  </div>;
}

function AdminField({ label, value, onChange, area, icon }) {
  return <label className="admin-field"><span>{label}</span><div>{icon && <Image />}{area ? <textarea value={value} onChange={e => onChange(e.target.value)} /> : <input value={value} onChange={e => onChange(e.target.value)} />}</div></label>;
}

function ChannelManager({ channels, onChange }) {
  const [newName, setNewName] = useState("");
  function update(name, field, value) {
    onChange({ ...channels, [name]: { ...channels[name], [field]: value } });
  }
  function addChannel() {
    const name = newName.trim();
    if (!name || channels[name]) return;
    onChange({ ...channels, [name]: { mode: "buyout", discount: 70, hideDealerPrice: false, ...normalizePricingSettings({ discount: 70 }) } });
    setNewName("");
  }
  return <div className="channel-manager">
    <div className="add-channel"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="輸入新通路公司名稱" /><button onClick={addChannel}><Plus /> 新增通路</button></div>
    <div className="channel-head"><span>通路帳號／公司</span><span>模式／折數</span><span>稅務與計算方式</span><span>取整與顯示</span></div>
    {Object.entries(channels).map(([name, value]) => <div className="channel-row" key={name}>
      <strong>{name}</strong>
      <div className="channel-controls"><select value={value.mode || "buyout"} onChange={e => update(name, "mode", e.target.value)}><option value="buyout">買斷</option><option value="consignment">寄售</option></select><label><input type="number" min="1" max="100" value={value.discount} onChange={e => update(name, "discount", Math.min(100, Math.max(1, Number(e.target.value))))} /> %</label></div>
      <div className="channel-controls"><select value={value.taxMode || "included"} onChange={e => update(name, "taxMode", e.target.value)}><option value="included">折後價已含稅</option><option value="excluded">折後價另加稅</option></select><label>稅率 <input type="number" min="0" max="100" step="0.1" value={value.taxRate ?? 5} onChange={e => update(name, "taxRate", Number(e.target.value))} /> %</label><select value={value.calculationScope || "line"} onChange={e => update(name, "calculationScope", e.target.value)}><option value="line">逐品項套折扣再加總</option><option value="document">整張單據加總後套折扣</option></select></div>
      <div className="channel-controls"><select value={value.roundingMode || "round"} onChange={e => update(name, "roundingMode", e.target.value)}><option value="round">四捨五入</option><option value="floor">無條件捨去</option><option value="ceil">無條件進位</option></select><select value={value.roundingDigits ?? 0} onChange={e => update(name, "roundingDigits", Number(e.target.value))}><option value="0">整數</option><option value="1">小數 1 位</option><option value="2">小數 2 位</option></select><label className="hide-price"><input type="checkbox" checked={value.hideDealerPrice} onChange={e => update(name, "hideDealerPrice", e.target.checked)} /><span>不顯示經銷價</span></label></div>
      <small className="channel-rule-summary">{discountLabel(value.discount)} · {pricingDescription(value)}</small>
    </div>)}
  </div>;
}

const stockOf = (movements, company, productId) => movements.filter(m => m.company === company && Number(m.productId) === Number(productId)).reduce((sum, m) => sum + Number(m.qty), 0);
const today = () => new Date().toISOString().slice(0, 10).replaceAll("-", "/");
const stockAlertKey = company => `dt-stock-alerts-${encodeURIComponent(company || "")}`;

function TransferWarehouseManager({ transfers, warehouseMovements, products, focus = {}, onUpdateTransfer }) {
  const [status, setStatus] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(transfers[0]?.id || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const filtered = transfers.filter(transfer => {
    const matchStatus = status === "全部" || transfer.status === status;
    const haystack = `${transfer.id} ${transfer.orderNo || ""} ${transfer.company} ${transfer.destination?.storeName || ""}`.toLowerCase();
    return matchStatus && haystack.includes(query.toLowerCase());
  });
  const selected = transfers.find(transfer => transfer.id === selectedId) || filtered[0] || transfers[0];

  useEffect(() => {
    if (focus.status) setStatus(focus.status);
    if (focus.id) setSelectedId(focus.id);
  }, [focus.id, focus.status]);

  useEffect(() => {
    if (selected) setNote(selected.note || "");
  }, [selected?.id]);

  async function update(statusValue) {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onUpdateTransfer(selected.uuid || selected.id, { status: statusValue, note });
    } finally {
      setSaving(false);
    }
  }

  function printTransfer() {
    if (!selected) return;
    openPrintableDocument({
      type: "transfer",
      title: "調撥／進貨單",
      number: selected.id,
      date: selected.date,
      company: selected.company,
      sourceWarehouse: selected.warehouse,
      storeName: selected.destination?.storeName,
      destination: selected.destination,
      note,
      items: selected.items.map(item => {
        const identity = productIdentity(item, productMap);
        return {
          ...identity,
          qty: item.qty,
          storeName: selected.destination?.storeName || selected.company,
          destination: [selected.destination?.companyName, selected.destination?.postalCode, selected.destination?.address].filter(Boolean).join(" "),
          note: item.note || ""
        };
      })
    });
  }

  const warehouseSummary = warehouseMovements.reduce((acc, row) => {
    acc.total += Number(row.qty || 0);
    if (row.qty < 0) acc.out += Math.abs(Number(row.qty));
    if (row.qty > 0) acc.in += Number(row.qty);
    return acc;
  }, { out: 0, in: 0, total: 0 });

  return <div className="transfer-admin">
    <div className="transfer-flow">
      <div><b>1</b><span>採購單確認</span></div>
      <div><b>2</b><span>轉調撥單</span></div>
      <div><b>3</b><span>東瑭主倉出庫</span></div>
      <div><b>4</b><span>客戶寄售庫存入庫</span></div>
    </div>
    <div className="order-admin-summary">
      <div><span>調撥單數</span><strong>{transfers.length}</strong></div>
      <div><span>主倉出庫件數</span><strong>{warehouseSummary.out}</strong></div>
      <div><span>作廢回補件數</span><strong>{warehouseSummary.in}</strong></div>
    </div>
    <div className="order-admin-tools">
      <div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋調撥單、採購單、經銷商、門市" /></div>
      <select value={status} onChange={e => setStatus(e.target.value)}><option>全部</option><option>草稿</option><option>已確認</option><option>已調撥</option><option>已作廢</option></select>
    </div>
    <div className="order-admin-layout">
      <div className="order-admin-list">
        {filtered.length === 0 ? <div className="document-empty">目前沒有符合條件的調撥單</div> : filtered.map(transfer => <button key={transfer.id} className={selected?.id === transfer.id ? "active" : ""} onClick={() => setSelectedId(transfer.id)}>
          <span><strong>{transfer.id}</strong><small>{transfer.date} · {transfer.company}</small></span>
          <b className={`order-status ${transfer.status === "已作廢" ? "cancelled" : ""}`}>{transfer.status}</b>
          <em>{transfer.items.reduce((sum, item) => sum + item.qty, 0)} 件</em>
        </button>)}
      </div>
      {selected && <article className="order-admin-detail">
        <div className="order-detail-head">
          <div><span className="eyebrow">TRANSFER DOCUMENT</span><h2>{selected.id}</h2><p>來源採購單 {selected.orderNo || "-"} · {selected.company}</p></div>
          <span className={`order-status ${selected.status === "已作廢" ? "cancelled" : ""}`}>{selected.status}</span>
        </div>
        <div className="transfer-top-summary">
          <section><h3>調撥倉位置</h3><strong>{selected.warehouse}</strong></section>
          <section><h3>門市</h3><strong>{selected.destination?.storeName || selected.company}</strong><span>{selected.destination?.companyName}</span></section>
          <section><h3>調撥目的地</h3><strong>{selected.destination?.postalCode} {selected.destination?.address}</strong><small>收件：{selected.destination?.recipientName || "-"}／{selected.destination?.recipientPhone || "-"}</small></section>
        </div>
        <div className="order-line-table table-scroll">
          <div className="order-line-head transfer-lines"><span>商品</span><span>品號</span><span>條碼</span><span>數量</span><span>門市／目的地</span></div>
          {selected.items.map(item => <div className="order-line-row transfer-lines" key={item.id}>
            <span><strong>{item.name}</strong></span><span>{productIdentity(item, productMap).itemNo}</span><span>{productIdentity(item, productMap).barcode}</span><strong>{item.qty}</strong><span>{selected.destination?.storeName || selected.company}</span>
          </div>)}
        </div>
        <div className="order-update-panel">
          <label><span>調撥備註</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="例如：分批調撥、缺貨待補、倉管備註" /></label>
	          <div className="transfer-actions">
	            <button className="outline" disabled={saving || selected.status === "已確認" || selected.status === "已調撥" || selected.status === "已作廢"} onClick={() => update("已確認")}><ClipboardCheck /> 確認調撥單</button>
	            <button className="primary" disabled={saving || selected.status === "已調撥" || selected.status === "已作廢"} onClick={() => update("已調撥")}><Truck /> 已調撥出庫</button>
	            <button className="outline" disabled={saving} onClick={printTransfer}><FileDown /> 列印調撥／進貨單</button>
	            <button className="outline danger" disabled={saving || selected.status === "已作廢"} onClick={() => update("已作廢")}><Trash2 /> 作廢調撥單</button>
	          </div>
          <small className="order-inventory-note">按下「已調撥出庫」後，系統會同時建立東瑭主倉出庫紀錄，以及經銷商寄售庫存入庫紀錄，且具備防重複入庫機制。</small>
        </div>
      </article>}
    </div>
    <div className="warehouse-history">
      <h2>倉儲異動紀錄</h2>
      <div className="movement-list table-scroll"><div className="movement-head"><span>日期</span><span>倉庫</span><span>經銷商</span><span>商品</span><span>異動</span><span>數量</span><span>來源</span><span>操作者／備註</span></div>{warehouseMovements.map(row => <div className="movement-row" key={row.id}><span>{row.date}</span><span>{row.warehouse}</span><span>{row.company || "-"}</span><span>{productMap[row.productId]?.name || row.productId}</span><span>{row.type}</span><b className={row.qty < 0 ? "negative" : "positive"}>{row.qty > 0 ? "+" : ""}{row.qty}</b><span>{row.source}</span><span>{row.operator}<small>{row.note}</small></span></div>)}</div>
    </div>
  </div>;
}

function InventoryOverview({ channels, products, movements }) {
  const consignments = Object.entries(channels).filter(([, value]) => value.mode === "consignment");
  const [company, setCompany] = useState(consignments[0]?.[0] || "");
  const [query, setQuery] = useState("");
  const rows = products.filter(p => stockOf(movements, company, p.id) !== 0 && `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="inventory-admin">
    <div className="inventory-tools"><select value={company} onChange={e => setCompany(e.target.value)}>{consignments.map(([name]) => <option key={name}>{name}</option>)}</select><div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋商品、SKU、分類" /></div></div>
    <div className="inventory-summary"><div><span>寄售品項</span><strong>{rows.length}</strong></div><div><span>庫存總件數</span><strong>{rows.reduce((s, p) => s + stockOf(movements, company, p.id), 0)}</strong></div><div><span>低庫存品項</span><strong>{rows.filter(p => stockOf(movements, company, p.id) <= 5).length}</strong></div></div>
    <div className="inventory-table table-scroll"><div className="inventory-head"><span>SKU</span><span>商品名稱</span><span>分類</span><span>目前庫存</span><span>最近異動</span></div>{rows.map(p => {
      const related = movements.filter(m => m.company === company && Number(m.productId) === Number(p.id));
      return <div className="inventory-row" key={p.id}><span>{p.sku}</span><strong>{p.name}</strong><span>{p.category}</span><b className={stockOf(movements, company, p.id) <= 5 ? "low" : ""}>{stockOf(movements, company, p.id)} 件</b><span>{related.at(-1)?.date || "-"}</span></div>;
    })}</div>
  </div>;
}

function SalesManager({ channels, products, movements, sales, onSave }) {
  const companies = Object.entries(channels).filter(([, value]) => value.mode === "consignment").map(([name]) => name);
  const [form, setForm] = useState({ company: companies[0] || "", month: "2026-06", date: "2026-06-30", productId: products[0]?.id, qty: 1, note: "", attachment: "", file: null });
  const [uploading, setUploading] = useState(false);
  const productMap = Object.fromEntries(products.map(p => [Number(p.id), p]));
  async function createDraft() {
    const product = products.find(p => Number(p.id) === Number(form.productId));
    const pricing = calculatePricing([{ price: product.price, qty: Number(form.qty) }], channels[form.company]);
    setUploading(true);
    let attachment = form.attachment;
    try { attachment = await uploadSalesFile(form.file); } catch { attachment = form.file?.name || ""; }
    const doc = { id: `SO-${Date.now()}`, company: form.company, month: form.month, date: form.date, status: "草稿", note: form.note, attachment, pricing: pricing.settings, preTaxAmount: pricing.preTaxTotal, taxAmount: pricing.taxTotal, totalAmount: pricing.total, items: [{ productId: Number(form.productId), sku: product.sku, name: product.name, qty: Number(form.qty), retailPrice: product.price, price: pricing.lines[0].unitPrice }] };
    onSave(movements, [doc, ...sales]);
    postScript({ action: "saveSales", ...doc }).catch(() => {});
    setUploading(false);
  }
	  function changeStatus(doc, status) {
    let nextMovements = [...movements];
    const applied = nextMovements.some(m => m.source === doc.id && m.type === "銷貨單扣庫存");
    const reversed = nextMovements.some(m => m.source === `${doc.id}-VOID`);
    if ((status === "已確認" || status === "已請款") && !applied) {
      doc.items.forEach((item, index) => {
        const before = stockOf(nextMovements, doc.company, item.productId);
        nextMovements.push({ id: `MV-${Date.now()}-${index}`, date: doc.date.replaceAll("-", "/"), company: doc.company, productId: item.productId, type: "銷貨單扣庫存", qty: -item.qty, before, after: before - item.qty, source: doc.id, operator: "admin", note: doc.note });
      });
    }
    if (status === "已作廢" && applied && !reversed) {
      doc.items.forEach((item, index) => {
        const before = stockOf(nextMovements, doc.company, item.productId);
        nextMovements.push({ id: `MV-${Date.now()}-V${index}`, date: today(), company: doc.company, productId: item.productId, type: "銷貨單作廢回沖", qty: item.qty, before, after: before + item.qty, source: `${doc.id}-VOID`, operator: "admin", note: "作廢回沖" });
      });
    }
    onSave(nextMovements, sales.map(s => s.id === doc.id ? { ...s, status } : s));
    postScript({ action: "saveSales", ...doc, status }).catch(() => {});
	  }
  function printSales(doc) {
    openPrintableDocument({
      type: "sales",
      title: "銷貨單",
      number: doc.id,
      date: doc.date,
      company: doc.company,
      note: doc.note,
      items: doc.items.map(item => {
        const identity = productIdentity(item, productMap);
        return {
          ...identity,
          qty: item.qty,
          price: item.price,
          amount: item.qty * item.price,
          note: item.note || ""
        };
      }),
      totals: {
        preTax: doc.preTaxAmount || 0,
        tax: doc.taxAmount || 0,
        total: doc.totalAmount || doc.items.reduce((sum, item) => sum + item.qty * item.price, 0)
      }
    });
  }
	  return <div className="sales-admin">
    <div className="sales-form">
      <select value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}>{companies.map(c => <option key={c}>{c}</option>)}</select>
      <input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} />
      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
      <select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>{products.map(p => <option key={p.id} value={p.id}>{p.sku}｜{p.name}</option>)}</select>
      <input type="number" min="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="售出數量" />
      <label className="upload-field"><Upload /> {form.file?.name || "行政上傳客戶原始銷貨單"}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} /></label>
      <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="備註" />
      <button disabled={uploading} onClick={createDraft}><Plus /> {uploading ? "上傳中..." : "建立草稿"}</button>
    </div>
	    <div className="sales-list table-scroll"><div className="sales-head"><span>銷貨單號</span><span>經銷商／月份</span><span>明細</span><span>總金額</span><span>附件</span><span>狀態／列印</span></div>{sales.map(doc => <div className="sales-row" key={doc.id}><strong>{doc.id}</strong><span>{doc.company}<small>{doc.month}</small></span><span>{doc.items.reduce((s, i) => s + i.qty, 0)} 件</span><strong>{money(doc.items.reduce((s, i) => s + i.qty * i.price, 0))}</strong><span>{doc.attachment || "-"}</span><span className="sales-row-actions"><select value={doc.status} onChange={e => changeStatus(doc, e.target.value)}><option>草稿</option><option>已確認</option><option>已請款</option><option>已作廢</option></select><button onClick={() => printSales(doc)}><FileDown /> 列印</button></span></div>)}</div>
	  </div>;
}

function StockAdjustment({ channels, products, movements, sales, onSave }) {
  const companies = Object.entries(channels).filter(([, value]) => value.mode === "consignment").map(([name]) => name);
  const [form, setForm] = useState({ company: companies[0] || "", productId: products[0]?.id, mode: "delta", value: 0, reason: "盤點差異", note: "" });
  const current = stockOf(movements, form.company, form.productId);
  function submit() {
    const qty = form.mode === "set" ? Number(form.value) - current : Number(form.value);
    if (!qty) return;
    const movement = { id: `MV-${Date.now()}`, date: today(), company: form.company, productId: Number(form.productId), type: form.mode === "set" ? "盤點設定" : "手動庫存調整", qty, before: current, after: current + qty, source: `ADJ-${Date.now()}`, operator: "admin", note: `${form.reason}${form.note ? `｜${form.note}` : ""}` };
    onSave([...movements, movement], sales);
    setForm({ ...form, value: 0, note: "" });
  }
  return <div className="adjust-admin"><div className="adjust-card"><h2>庫存盤點／手動修正</h2><select value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}>{companies.map(c => <option key={c}>{c}</option>)}</select><select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>{products.map(p => <option key={p.id} value={p.id}>{p.sku}｜{p.name}</option>)}</select><div className="current-stock">系統目前庫存 <strong>{current} 件</strong></div><select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}><option value="delta">新增調整數量（+/-）</option><option value="set">直接設定實際庫存</option></select><input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /><select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}><option>盤點差異</option><option>盤損</option><option>補登</option><option>退貨</option><option>其他調整</option></select><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="備註" /><button className="primary" onClick={submit}>確認調整</button></div></div>;
}

function MovementHistory({ products, movements }) {
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  return <div className="movement-list table-scroll"><div className="movement-head"><span>日期</span><span>經銷商</span><span>商品</span><span>異動類型</span><span>數量</span><span>異動前／後</span><span>來源單號</span><span>操作者／備註</span></div>{[...movements].reverse().map(m => <div className="movement-row" key={m.id}><span>{m.date}</span><span>{m.company}</span><span>{productMap[m.productId]?.name || m.productId}</span><span>{m.type}</span><b className={m.qty < 0 ? "negative" : "positive"}>{m.qty > 0 ? "+" : ""}{m.qty}</b><span>{m.before} → {m.after}</span><span>{m.source}</span><span>{m.operator}<small>{m.note}</small></span></div>)}</div>;
}

function FormalSalesImport({ channels, products, movements, sales, onSave }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [sourceFile, setSourceFile] = useState(null);
  const [errors, setErrors] = useState([]);
  const productBySku = Object.fromEntries(products.map(p => [String(p.sku), p]));

  async function parseExcel(file) {
    setFileName(file?.name || "");
    setSourceFile(file || null);
    setRows([]);
    setErrors([]);
    if (!file || !/\.xlsx$/i.test(file.name)) {
      setErrors(["僅接受 .xlsx 正式銷貨單"]);
      return;
    }
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const result = await readXlsxFile(file);
      const excelRows = Array.isArray(result?.[0]?.data) ? result[0].data : result;
      const headers = (excelRows[0] || []).map(v => String(v ?? "").trim());
      const required = ["經銷商", "銷貨月份", "銷貨日期", "SKU", "商品名稱", "售出數量", "單價", "備註"];
      const missing = required.filter(h => !headers.includes(h));
      if (missing.length) throw new Error(`缺少欄位：${missing.join("、")}`);
      const parsed = [];
      excelRows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;
        const values = Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "").trim()]));
        if (Object.values(values).every(v => !v)) return;
        parsed.push({ rowNumber, company: values["經銷商"], month: values["銷貨月份"], date: values["銷貨日期"], sku: values["SKU"], name: values["商品名稱"], qty: Number(values["售出數量"]), price: Number(values["單價"]), note: values["備註"] });
      });
      const validation = [];
      parsed.forEach(r => {
        if (!channels[r.company] || channels[r.company].mode !== "consignment") validation.push(`第 ${r.rowNumber} 列：經銷商不存在或非寄售模式`);
        if (!productBySku[r.sku]) validation.push(`第 ${r.rowNumber} 列：找不到 SKU ${r.sku}`);
        if (!Number.isFinite(r.qty) || r.qty <= 0) validation.push(`第 ${r.rowNumber} 列：售出數量必須大於 0`);
        if (!Number.isFinite(r.price) || r.price < 0) validation.push(`第 ${r.rowNumber} 列：單價格式錯誤`);
      });
      setRows(parsed);
      setErrors(validation);
    } catch (error) {
      setErrors([error.message || "Excel 解析失敗"]);
    }
  }

  async function confirmImport() {
    if (!rows.length || errors.length) return;
    let formalAttachment = fileName;
    try { formalAttachment = await uploadSalesFile(sourceFile); } catch { /* Keep filename as local fallback. */ }
    const grouped = Object.values(rows.reduce((acc, row) => {
      const key = `${row.company}|${row.month}`;
      if (!acc[key]) acc[key] = { company: row.company, month: row.month, date: row.date, note: `Excel 匯入：${fileName}`, items: [] };
      const product = productBySku[row.sku];
      acc[key].items.push({ productId: product.id, sku: product.sku, name: product.name, qty: row.qty, price: row.price, note: row.note });
      return acc;
    }, {}));
    let nextMovements = [...movements];
    const docs = grouped.map((group, groupIndex) => {
      const id = `FS-${Date.now()}-${groupIndex + 1}`;
      group.items.forEach((item, index) => {
        const before = stockOf(nextMovements, group.company, item.productId);
        nextMovements.push({ id: `MV-${Date.now()}-X${groupIndex}-${index}`, date: group.date, company: group.company, productId: item.productId, type: "正式銷貨單扣庫存", qty: -item.qty, before, after: before - item.qty, source: `${id}:${item.productId}`, operator: "admin", note: group.note });
      });
      const doc = { ...group, id, status: "已確認", attachment: "", formalAttachment, imported: true };
      postScript({ action: "saveSales", ...doc }).catch(() => {});
      return doc;
    });
    onSave(nextMovements, [...docs, ...sales]);
    setRows([]);
    setFileName("");
    setSourceFile(null);
  }

  return <div className="formal-import">
    <div className="import-guide"><FileText /><div><h2>匯入正式銷貨單</h2><p>Excel 欄位順序不限，但必須包含：經銷商、銷貨月份、銷貨日期、SKU、商品名稱、售出數量、單價、備註。</p><a className="template-download" href="/東瑭正式銷貨單匯入範本.xlsx" download><FileDown /> 下載標準 Excel 範本</a></div><label><Upload /> 選擇 Excel<input type="file" accept=".xlsx" onChange={e => parseExcel(e.target.files?.[0])} /></label></div>
    {fileName && <div className="import-file">檔案：<strong>{fileName}</strong>｜解析 {rows.length} 筆</div>}
    {errors.length > 0 && <div className="import-errors"><strong>匯入前請修正：</strong>{errors.map(error => <span key={error}>{error}</span>)}</div>}
    {rows.length > 0 && <div className="import-preview table-scroll"><div className="import-head"><span>列</span><span>經銷商</span><span>月份／日期</span><span>SKU／商品</span><span>數量</span><span>單價</span><span>預計庫存</span></div>{rows.map(row => <div className="import-row" key={row.rowNumber}><span>{row.rowNumber}</span><strong>{row.company}</strong><span>{row.month}<small>{row.date}</small></span><span>{row.sku}<small>{productBySku[row.sku]?.name || row.name}</small></span><b>{row.qty}</b><span>{money(row.price)}</span><span>{productBySku[row.sku] ? stockOf(movements, row.company, productBySku[row.sku].id) - row.qty : "-"}</span></div>)}</div>}
    <button className="primary import-confirm" disabled={!rows.length || errors.length > 0} onClick={confirmImport}><CheckCircle2 /> 確認匯入並沖銷庫存</button>
  </div>;
}

function monthRange() {
  const now = new Date();
  const format = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const start = format(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = format(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end };
}

function ConsignmentReportCenter({ company, products, movements, reports, settings, onSubmit }) {
  const [tab, setTab] = useState("report");
  const [period, setPeriod] = useState(monthRange());
  const [qty, setQty] = useState({});
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const stockRows = products
    .map(product => ({ ...product, stock: stockOf(movements, company, product.id) }))
    .filter(product => product.stock > 0)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "zh-Hant"));
  const selectedRows = stockRows
    .map(product => ({ ...product, soldQty: Math.max(0, Math.floor(Number(qty[product.id] || 0))) }))
    .filter(product => product.soldQty > 0);
  const lowStockRows = stockRows.filter(product => product.stock <= 5);
  const pricing = calculatePricing(selectedRows.map(product => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    qty: product.soldQty
  })), settings);

  function changeQty(product, value) {
    const next = Math.max(0, Math.min(product.stock, Math.floor(Number(value) || 0)));
    setQty(previous => ({ ...previous, [product.id]: next }));
  }

  async function submit() {
    if (!selectedRows.length || submitting) return;
    setSubmitting(true);
    try {
      let attachment = null;
      if (file) {
        let url = file.name;
        try { url = await uploadSalesFile(file); } catch { /* Keep filename when Drive upload is unavailable. */ }
        attachment = { fileName: file.name, fileUrl: url, mimeType: file.type };
      }
      await onSubmit({
        periodStart: period.start,
        periodEnd: period.end,
        note,
        items: selectedRows.map(product => ({ productId: product.id, soldQuantity: product.soldQty })),
        attachments: attachment ? [attachment] : []
      });
      setQty({});
      setNote("");
      setFile(null);
      setTab("history");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="consignment-page">
    <section className="orders-intro"><span className="eyebrow">CONSIGNMENT SALES</span><h1>寄售銷售回報</h1><p>回報本期實際銷售數量，東瑭審核後會轉成銷貨單並沖抵寄售庫存。</p></section>
    <div className="document-tabs"><button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>我的寄售庫存</button><button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>填寫銷售回報</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>銷售回報紀錄</button></div>
    <div className="consignment-kpis"><button onClick={() => setTab("stock")}><Warehouse /><span>寄售品項</span><strong>{stockRows.length}</strong></button><button onClick={() => setTab("stock")}><Clock3 /><span>低庫存</span><strong>{lowStockRows.length}</strong></button><button onClick={() => setTab("report")}><ClipboardCheck /><span>本期已填</span><strong>{selectedRows.reduce((sum, item) => sum + item.soldQty, 0)} 件</strong></button><button onClick={() => setTab("history")}><FileText /><span>回報紀錄</span><strong>{reports.length}</strong></button></div>
    {tab === "stock" && <section className="consignment-card">
      <div className="report-section-title"><div><h2>目前寄售庫存</h2><p>以下商品為目前仍寄放於通路端的品項。</p></div><strong>{stockRows.length} 項</strong></div>
      <div className="consignment-stock-head"><span>SKU</span><span>商品</span><span>目前庫存</span><span>建議</span></div>
      {stockRows.length ? stockRows.map(product => <div className="consignment-stock-row" key={product.id}><span>{product.sku}</span><strong>{product.name}</strong><b>{product.stock} 件</b><span className={product.stock <= 5 ? "low" : ""}>{product.stock <= 5 ? "低庫存，可安排補貨" : "庫存正常"}</span></div>) : <div className="document-empty">目前沒有寄售庫存。</div>}
    </section>}
    {tab === "report" && <section className="consignment-card">
      <div className="report-section-title"><div><h2>本期銷售數量</h2><p>只需填寫本期有銷售的商品，數量不可超過目前寄售庫存。</p></div><span>{selectedRows.length} 項／{selectedRows.reduce((sum, item) => sum + item.soldQty, 0)} 件</span></div>
      <div className="report-period">
        <label>回報起日<input type="date" value={period.start} onChange={e => setPeriod({ ...period, start: e.target.value })} /></label>
        <label>回報迄日<input type="date" value={period.end} onChange={e => setPeriod({ ...period, end: e.target.value })} /></label>
        <label>附件上傳<input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      </div>
      <div className="report-entry-head"><span>SKU</span><span>商品</span><span>目前庫存</span><span>本期銷售</span><span>預估金額</span></div>
      {stockRows.length ? stockRows.map(product => {
        const soldQty = Number(qty[product.id] || 0);
        return <div className="report-entry-row" key={product.id}>
          <span>{product.sku}</span>
          <strong>{product.name}</strong>
          <b>{product.stock} 件</b>
          <div className="row-qty compact"><button onClick={() => changeQty(product, soldQty - 1)}><Minus /></button><input type="number" min="0" max={product.stock} value={soldQty} onChange={e => changeQty(product, e.target.value)} /><button onClick={() => changeQty(product, soldQty + 1)}><Plus /></button></div>
          <span>{soldQty ? money(dealerPriceWithSettings(product.price, settings) * soldQty) : "-"}</span>
        </div>;
      }) : <div className="document-empty">目前沒有可回報的寄售商品。</div>}
      <textarea className="report-note" value={note} onChange={e => setNote(e.target.value)} placeholder="備註：例如本期銷售單號、特殊折讓或需東瑭協助確認的事項" />
      <div className="report-submit-bar"><div><span>預估應收金額</span><strong>{money(pricing.total)}</strong><small>{pricingDescription(settings)}</small></div><button className="primary" disabled={!selectedRows.length || submitting || period.end < period.start} onClick={submit}>{submitting ? <><RefreshCw className="spin-icon" /> 送出中...</> : <><ClipboardCheck /> 送出回報單</>}</button></div>
    </section>}
    {tab === "history" && <section className="consignment-card">
      <div className="report-section-title"><div><h2>回報單紀錄</h2><p>可查看審核狀態、退回原因與已轉出的正式銷貨單號。</p></div><strong>{reports.length} 筆</strong></div>
      {reports.length ? reports.map(report => <article className="report-history-card" key={report.id}>
        <div><span className={`status ${report.status === "已退回" ? "cancelled" : report.status === "待審核" ? "preparing" : ""}`}>{report.status}</span><h3>{report.id}</h3><small>{report.periodStart} 至 {report.periodEnd} · {report.items.reduce((sum, item) => sum + item.soldQty, 0)} 件</small><ReportStatusSteps status={report.status} />{report.returnReason && <p>退回原因：{report.returnReason}</p>}{report.salesNo && <p>已轉銷貨單：{report.salesNo}</p>}</div>
        <strong>{money(report.totalAmount)}</strong>
      </article>) : <div className="document-empty">目前尚未建立寄售銷售回報單。</div>}
    </section>}
  </main>;
}

function ReportStatusSteps({ status }) {
  const steps = ["待審核", "已審核", "已轉銷貨單"];
  const activeIndex = status === "已退回" ? 0 : status === "已作廢" ? -1 : Math.max(0, steps.indexOf(status));
  return <div className="mini-steps">{steps.map((step, index) => <span className={activeIndex >= index ? "done" : ""} key={step}>{step}</span>)}</div>;
}

function dealerPriceWithSettings(price, settings) {
  const pricing = calculatePricing([{ id: "single", name: "", price, qty: 1 }], settings);
  return pricing.lines[0]?.unitPrice || 0;
}

function ConsignmentReportAdmin({ reports, movements, focus = {}, onReview, onConvert }) {
  const [status, setStatus] = useState("待審核");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(reports[0]?.id || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = reports.filter(report => {
    const matchStatus = status === "全部" || report.status === status;
    const haystack = `${report.id} ${report.company} ${report.salesNo || ""}`.toLowerCase();
    return matchStatus && haystack.includes(query.toLowerCase());
  });
  const selected = reports.find(report => report.id === selectedId) || visible[0] || reports[0];
  const hasStockIssue = selected?.items?.some(item => item.soldQty > stockOf(movements, selected.company, item.productId));

  useEffect(() => {
    if (focus.status) setStatus(focus.status);
    if (focus.id) setSelectedId(focus.id);
  }, [focus.id, focus.status]);

  async function review(nextStatus) {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onReview(selected.uuid || selected.id, { status: nextStatus, reason });
      setReason("");
    } finally {
      setSaving(false);
    }
  }

  async function convert() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onConvert(selected.uuid || selected.id);
    } finally {
      setSaving(false);
    }
  }

  return <div className="report-admin">
    <div className="report-section-title"><div><h2>寄售銷售回報審核</h2><p>確認客戶回報數量，審核後可轉成銷貨單並自動扣除寄售庫存。</p></div><strong>{reports.filter(r => r.status === "待審核").length} 筆待審核</strong></div>
    <div className="order-tools"><select value={status} onChange={e => setStatus(e.target.value)}><option>待審核</option><option>已退回</option><option>已審核</option><option>已轉銷貨單</option><option>已作廢</option><option>全部</option></select><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋單號、經銷商、銷貨單" /></div>
    <div className="report-admin-layout">
      <div className="report-list">{visible.map(report => <button key={report.id} className={selected?.id === report.id ? "active" : ""} onClick={() => setSelectedId(report.id)}><strong>{report.id}</strong><small>{report.company} · {report.periodStart} 至 {report.periodEnd}</small><span>{report.status}</span></button>)}{!visible.length && <div className="document-empty">沒有符合條件的回報單。</div>}</div>
      {selected && <div className="report-detail-panel">
        <div className="order-detail-head"><div><span>{selected.company}</span><h2>{selected.id}</h2><small>{selected.periodStart} 至 {selected.periodEnd}</small></div><span className={`status ${selected.status === "待審核" ? "preparing" : ""}`}>{selected.status}</span></div>
        {selected.status === "待審核" && <div className="next-step-banner"><div><span>建議下一步</span><strong>審核此寄售回報單</strong><small>{hasStockIssue ? "目前有庫存不足品項，請先檢查庫存異動。" : "數量無異常時，可審核通過後轉成銷貨單。"}</small></div><button className="primary" disabled={saving || hasStockIssue} onClick={() => review("已審核")}><ClipboardCheck /> 審核通過</button></div>}
        {selected.status === "已審核" && <div className="next-step-banner"><div><span>建議下一步</span><strong>轉成銷貨單並沖抵庫存</strong><small>系統會自動扣除該經銷商寄售庫存，並建立銷貨單金額。</small></div><button className="primary" disabled={saving || hasStockIssue} onClick={convert}><FileText /> 轉銷貨單</button></div>}
        {hasStockIssue && <div className="admin-warning">有品項回報數量超過目前寄售庫存，請先確認庫存異動後再審核。</div>}
        <div className="report-detail-head"><span>SKU</span><span>商品</span><span>回報數量</span><span>目前庫存</span><span>金額</span></div>
        {selected.items.map(item => {
          const currentStock = stockOf(movements, selected.company, item.productId);
          return <div className="report-detail-row" key={item.id}><span>{item.sku}</span><strong>{item.name}</strong><b>{item.soldQty}</b><span className={item.soldQty > currentStock ? "low" : ""}>{currentStock}</span><strong>{money(item.lineTotal)}</strong></div>;
        })}
        <div className="report-admin-summary"><span>未稅 {money(selected.preTaxAmount)}</span><span>稅額 {money(selected.taxAmount)}</span><strong>總額 {money(selected.totalAmount)}</strong></div>
        {selected.returnReason && <div className="admin-warning">退回原因：{selected.returnReason}</div>}
        {selected.salesNo && <div className="admin-notice">已轉銷貨單：{selected.salesNo}</div>}
        {selected.attachments?.length > 0 && <div className="document-files">{selected.attachments.map(file => <a key={file.id || file.file_url} href={file.file_url || "#"} target="_blank"><FileText /> {file.file_name || "附件"}</a>)}</div>}
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="退回或作廢原因／審核備註" />
        <div className="report-admin-actions">
          <button className="outline danger" disabled={saving || !["待審核", "已審核"].includes(selected.status)} onClick={() => review("已退回")}>退回修改</button>
          <button className="outline" disabled={saving || selected.status !== "待審核" || hasStockIssue} onClick={() => review("已審核")}>審核通過</button>
          <button className="primary" disabled={saving || selected.status !== "已審核" || hasStockIssue} onClick={convert}>轉成銷貨單並沖帳</button>
          <button className="outline danger" disabled={saving || ["已轉銷貨單", "已作廢"].includes(selected.status)} onClick={() => review("已作廢")}>作廢</button>
        </div>
      </div>}
    </div>
  </div>;
}

function PurchaseList({ items, subtotal, totalQty, dealerPrice, settings, stores, selectedStoreId, onSelectStore, onManageStores, onQty, onRemove, onCheckout, checkingOut }) {
  const selectedStore = stores.find(store => store.id === selectedStoreId);
  return <aside className="purchase-list">
    <div className="list-head"><div><span className="eyebrow">CURRENT ORDER</span><h2>本次採購清單</h2></div><b>{items.length} 項／{totalQty} 件</b></div>
    <div className="purchase-list-status">
      <span className={items.length ? "ready" : ""}><ShoppingBag /> {items.length ? "已選商品" : "尚未選品"}</span>
      <span className={selectedStore ? "ready" : "warning"}><Store /> {selectedStore ? selectedStore.store_name : "未選門市"}</span>
      <span><FileText /> {settings.hideDealerPrice ? "價格另行確認" : money(subtotal)}</span>
    </div>
    <div className="list-items">{!items.length ? <div className="empty"><ShoppingBag /><h3>尚未選擇商品</h3><p>在左側輸入數量，商品會立即出現在這裡。</p></div> : items.map(item =>
      <div className="list-item" key={item.id}>
        <img className="list-item-image" src={item.image} alt={item.name} onError={e => { e.currentTarget.src = "https://eavo.com.tw/wp-content/uploads/2023/07/LOGO.png"; }} />
        <div className="list-item-body">
          <div className="list-item-title"><strong>{item.name}</strong><button className="remove" onClick={() => onRemove(item.id)} aria-label={`移除 ${item.name}`}><Trash2 /></button></div>
          <small>{item.sku} · 零售價 {money(item.price)}{!settings.hideDealerPrice && ` · 經銷價 ${money(dealerPrice(item.price))}`}</small>
          <div className="list-item-actions">
            <div className="qty"><button onClick={() => onQty(item.id, -1)}><Minus /></button><span>{item.qty}</span><button onClick={() => onQty(item.id, 1)}><Plus /></button></div>
            <strong>{settings.hideDealerPrice ? `${item.qty} 件` : money(dealerPrice(item.price) * item.qty)}</strong>
          </div>
        </div>
      </div>
    )}</div>
    <div className="list-footer">
      <details className="shipping-selector">
        <summary>
          <span><strong>收貨門市</strong><small>{selectedStore ? `${selectedStore.store_name}｜${selectedStore.company_name}` : "尚未設定"}</small></span>
          <b>設定</b>
        </summary>
        {stores.length ? <>
          <select value={selectedStoreId} onChange={e => onSelectStore(e.target.value)}>
            <option value="">請選擇收貨地點</option>
            {stores.map(store => <option value={store.id} key={store.id}>{store.store_name}｜{store.company_name}</option>)}
          </select>
          <div className="shipping-actions"><button type="button" onClick={onManageStores}>管理門市資料</button></div>
        </> : <div className="shipping-empty">尚未設定門市，請先新增收貨據點。</div>}
      </details>
	      <div className="summary"><span>採購總計</span><strong>{settings.hideDealerPrice ? "價格另行確認" : money(subtotal)}</strong><small>{discountLabel(settings.discount)} · {pricingDescription(settings)}</small></div>
      {!items.length ? <div className="checkout-hint">請先在左側輸入商品數量</div> : !selectedStoreId ? <div className="checkout-hint warning">請先選擇收貨門市</div> : null}
      <button className="primary checkout" disabled={!items.length || !selectedStoreId || checkingOut} onClick={onCheckout}>
        {checkingOut ? <><RefreshCw className="spin-icon" /> 建立採購單中...</> : <>建立採購單 <ChevronRight /></>}
      </button>
    </div>
  </aside>;
}

function DocumentCenter({ company, orders, sales, products, movements, settings }) {
  const [tab, setTab] = useState("progress");
  const [stockFilter, setStockFilter] = useState("all");
  const [stockAlerts, setStockAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(stockAlertKey(company)) || "{}"); }
    catch { return {}; }
  });
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const stockInventoryRows = products
    .map(product => {
      const qty = stockOf(movements, company, product.id);
      const threshold = Number(stockAlerts[product.id] ?? 5);
      const hasAlert = stockAlerts[product.id] !== undefined && stockAlerts[product.id] !== "";
      const low = hasAlert ? qty <= threshold : qty <= 5;
      return { ...product, qty, threshold, hasAlert, low };
    })
    .filter(product => product.qty !== 0);
  const stockRows = stockInventoryRows
    .filter(product => stockFilter === "all" || (stockFilter === "low" && product.low) || (stockFilter === "normal" && !product.low) || (stockFilter === "unset" && !product.hasAlert));
  const icon = s => s === "已完成" ? <PackageCheck /> : <Truck />;
  const activeOrders = orders.filter(order => !["已完成", "已取消"].includes(order.status));
  const orderStepIndex = status => {
    if (status === "已取消") return -1;
    const index = orderStatusFlow.indexOf(status);
    return index >= 0 ? index : 0;
  };
  const orderStepMeta = order => [
    { key: "訂單成立", label: "訂單成立", icon: <CheckCircle2 />, note: order.date },
    { key: "已確認", label: "訂單確認", icon: <CheckCircle2 />, note: order.confirmedAt ? "已確認" : "等待確認" },
    { key: "備貨中", label: "商品備貨", icon: <PackageCheck />, note: order.preparedAt ? "備貨中" : "依訂單進度更新" },
    { key: "已出貨", label: "商品出貨", icon: <Truck />, note: order.shippedAt ? "已出貨" : "等待中" },
    { key: "已完成", label: "訂單完成", icon: <ClipboardCheck />, note: order.completedAt ? "已完成" : "等待中" }
  ];
  const statusIcon = status => status === "已完成" ? <ClipboardCheck /> : status === "已出貨" ? <Truck /> : status === "備貨中" ? <PackageCheck /> : status === "已取消" ? <Clock3 /> : <Clock3 />;
  function printPurchaseOrder(order) {
    openPrintableDocument({
      type: "purchase",
      title: "採購單",
      number: order.id,
      date: order.date,
      company: order.company || company,
      destination: order.shipping,
      note: order.adminNote,
      items: order.lineItems.map(item => {
        const identity = productIdentity(item, productMap);
        return {
          ...identity,
          qty: item.qty,
          price: item.dealerPrice,
          amount: item.lineTotal,
          note: order.shipping?.storeName || ""
        };
      }),
      totals: { preTax: order.preTaxAmount, tax: order.taxAmount, total: order.amount }
    });
  }
  function setStockAlert(productId, value) {
    const next = { ...stockAlerts };
    if (value === "") delete next[productId];
    else next[productId] = Math.max(0, Number(value) || 0);
    setStockAlerts(next);
    localStorage.setItem(stockAlertKey(company), JSON.stringify(next));
  }
	  return <main className="orders-page document-center">
	    <div className="orders-intro"><span className="eyebrow">PARTNER DOCUMENT CENTER</span><h1>單據與進度中心</h1><p>統整採購進度、歷史採購、銷貨單據與目前寄售庫存。</p></div>
	    <div className="document-tabs"><button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>目前進度</button><button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>歷史採購</button><button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>歷史銷貨</button>{settings.mode === "consignment" && <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>寄售庫存</button>}</div>
    <div className="document-kpis"><button onClick={() => setTab("progress")}><Truck /><span>進行中採購</span><strong>{activeOrders.length}</strong></button><button onClick={() => setTab("orders")}><ClipboardCheck /><span>歷史採購</span><strong>{orders.length}</strong></button><button onClick={() => setTab("sales")}><FileText /><span>銷貨單</span><strong>{sales.length}</strong></button>{settings.mode === "consignment" && <button onClick={() => setTab("stock")}><Warehouse /><span>低庫存</span><strong>{stockInventoryRows.filter(row => row.low).length}</strong></button>}</div>
    {tab === "progress" && (activeOrders.length ? <div className="progress-orders">
      <div className="progress-summary"><div><h2>進行中的採購單</h2><p>以下採購單尚未完成，會依後台處理狀態同步更新。</p></div><span>{activeOrders.length} 筆進行中</span></div>
      {activeOrders.map((order, index) => <div className="current-order" key={order.id}>
      <div className="order-top"><div><span>{index === 0 ? "最新進度" : "進行中訂單"}</span><h2>{order.id}</h2><small>{order.date} 建立 · 共 {order.items} 項商品{order.shipping?.storeName && ` · 寄送 ${order.shipping.storeName}`}</small></div><span className={`status ${order.status === "已完成" ? "complete" : order.status === "已取消" ? "cancelled" : "preparing"}`}>{statusIcon(order.status)} {order.status}</span></div>
      <div className="timeline">
        {orderStepMeta(order).map((step, stepIndex) => {
          const currentIndex = orderStepIndex(order.status);
          const done = currentIndex > stepIndex;
          const active = currentIndex === stepIndex;
          return <div className={done ? "done" : active ? "active" : ""} key={step.key}><i>{step.icon}</i><strong>{step.label}</strong><small>{step.note}</small></div>;
        })}
      </div>
      <div className="order-total"><span>訂單總金額</span><strong>{money(order.amount)}</strong><button onClick={() => printPurchaseOrder(order)}><FileDown /> 查看／列印採購單</button></div>
    </div>
    )}</div> : <div className="document-empty">{orders.length ? "目前沒有進行中的採購單，已完成或取消的單據可至歷史採購查看。" : "目前尚無採購單，請先前往商品採購建立訂單。"}</div>)}
    {tab === "orders" && <div className="history document-list"><h2>歷史採購紀錄</h2>{orders.map(o => <div className="history-row" key={o.id}><i>{icon(o.status)}</i><div><strong>{o.id}</strong><small>{o.date} · {o.items} 項商品{o.shipping?.storeName && ` · 寄送 ${o.shipping.storeName}`}</small></div><span className={`status ${o.status === "已完成" ? "complete" : ""}`}>{o.status}</span><strong>{money(o.amount)}</strong><button onClick={() => printPurchaseOrder(o)} title="查看／列印採購單"><FileDown /></button></div>)}</div>}
    {tab === "sales" && <div className="customer-sales document-list"><div className="document-list-heading"><div><h2>歷史銷貨紀錄</h2><p>銷貨單由東瑭行政人員建檔與上傳，通路帳號僅能檢視及下載。</p></div><span><CheckCircle2 /> 唯讀專區</span></div>{sales.length === 0 ? <div className="document-empty">目前沒有銷貨單紀錄</div> : sales.map(doc => <article key={doc.id}><div><span className="status">{doc.status}</span><strong>{doc.id}</strong><small>{doc.month} · {doc.items.reduce((s, i) => s + i.qty, 0)} 件</small></div><strong>{money(doc.totalAmount || doc.items.reduce((s, i) => s + i.qty * i.price, 0))}</strong><div className="document-files">{doc.attachment && <a href={doc.attachment} target="_blank"><FileText /> 檢視客戶原版</a>}{doc.formalAttachment && <a href={doc.formalAttachment.startsWith("http") ? doc.formalAttachment : "#"}><FileDown /> 檢視正式銷貨單</a>}<button onClick={() => downloadReconciliation(doc, settings)}><FileDown /> 下載發票對帳明細</button></div></article>)}</div>}
    {tab === "stock" && <div className="customer-stock document-list">
      <div className="customer-stock-title"><div><h2>目前寄售庫存</h2><p>可為每個品項設定提醒水位，低於或等於門檻時會標示為低庫存。</p></div><span>{stockInventoryRows.filter(row => row.low).length} 項需留意</span></div>
      <div className="stock-filter-tabs"><button className={stockFilter === "all" ? "active" : ""} onClick={() => setStockFilter("all")}>全部庫存</button><button className={stockFilter === "low" ? "active" : ""} onClick={() => setStockFilter("low")}>低庫存</button><button className={stockFilter === "normal" ? "active" : ""} onClick={() => setStockFilter("normal")}>庫存正常</button><button className={stockFilter === "unset" ? "active" : ""} onClick={() => setStockFilter("unset")}>未設定提醒</button></div>
      <div className="customer-stock-head"><span>SKU</span><span>商品</span><span>目前庫存</span><span>提醒水位</span><span>狀態</span></div>
      {stockRows.length === 0 ? <div className="document-empty">目前沒有符合篩選條件的庫存品項</div> : stockRows.map(p => <div className="customer-stock-row" key={p.id}>
        <span>{p.sku}</span><strong>{p.name}</strong><b>{p.qty} 件</b>
        <label><input type="number" min="0" placeholder="預設 5" value={stockAlerts[p.id] ?? ""} onChange={e => setStockAlert(p.id, e.target.value)} /><small>件以下提醒</small></label>
        <span className={p.low ? "low" : ""}>{p.low ? "低庫存／建議補貨" : "庫存正常"}</span>
      </div>)}
    </div>}
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
