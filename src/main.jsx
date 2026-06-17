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
  LayoutDashboard, Save, Image, Settings
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
      name: stripHtml(p.name),
      price: Number(p.price) || Number(p.regular_price) || Number(p.prices?.price / 100) || fallbackProducts[index % fallbackProducts.length].price,
      category: p.categories?.find(c => c.name !== 'All')?.name?.replace(/[▾▸]/g, '').trim() || '最新商品',
      image: p.images?.[0]?.src || fallbackProducts[index % fallbackProducts.length].image,
      _raw: p,
    }));
  } catch (e) {
    console.error('fetchProducts error', e);
    return fallbackProducts;
  }
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
      const identityUser = await getUser().catch(() => null);
      if (identityUser) await loadAccount();
      setAuthLoading(false);
    });
  }, []);

  async function api(route, options = {}) {
    const token = localStorage.getItem("dt_token");
    const response = await fetch(`/api/${route}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
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
      visible: row.visible
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
    setOrders(data.orders.map(row => ({
      id: row.order_no,
      date: new Date(row.created_at).toLocaleDateString("zh-TW"),
      amount: row.total_amount,
      preTaxAmount: row.pre_tax_amount,
      taxAmount: row.tax_amount,
      pricing: row.pricing_snapshot,
      status: row.status,
      items: row.items.length,
      shipping: row.shipping_snapshot
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
      return found ? prev.map(x => x.id === product.id ? { ...x, qty: x.qty + 1 } : x) : [...prev, { ...product, qty: 1 }];
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
        : [...prev, { ...product, qty }];
    });
  }

  async function checkout() {
    if (!cart.length || checkingOut) return;
    if (!selectedStoreId) {
      notify("請先選擇收貨門市");
      return;
    }
    setCheckingOut(true);
    const order = { company: user.company, contact: user.name, total: subtotal, items: cart, createdAt: new Date().toISOString() };
    try {
      const result = await api("orders", {
        method: "POST",
        body: JSON.stringify({
          contact: user.name,
          storeId: selectedStoreId,
          items: cart
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
          <button className={view === "profile" ? "active" : ""} onClick={() => { setView("profile"); setMobileNav(false); }}>廠商資料</button>
          {admin && <button className={view === "admin" ? "active" : ""} onClick={() => { setView("admin"); setMobileNav(false); }}>內容管理</button>}
          <a href="https://eavo.com.tw/" target="_blank">品牌官網</a>
        </nav>
        <div className="account">
          <span><UserRound size={18} /> {user.company}</span>
          <button title="登出" onClick={async () => { await identityLogout(); setUser(null); setAdmin(false); }}><LogOut size={18} /></button>
        </div>
      </header>

      {view === "home" ? <PartnerHome content={content} products={managedProducts} onShop={() => setView("shop")} /> : view === "shop" ? (
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
        : view === "profile" ? <DealerProfileManager admin={admin} currentCompany={user.company} dealers={dealerRecords} stores={stores} onSaveProfile={saveProfile} onSaveStore={saveStore} />
        : <AdminPanel api={api} content={content} products={products} productEdits={productEdits} channels={channels}
          dealers={dealerRecords} movements={movements} sales={sales} onSave={saveAdmin}
          onSaveInventory={saveInventory} onCreateDealerAccount={createDealerAccount} />}

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

function PartnerHome({ content, products, onShop }) {
  const [applied, setApplied] = useState(false);
  const newest = products.slice(0, 4);
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

function WooProductManager({ api }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editMap, setEditMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    api('products').then(data => {
      if (!Array.isArray(data)) { setError(data?.error || '無法載入商品資料'); setLoading(false); return; }
      setProducts(data);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [api]);

  function getEdit(id) { return editMap[id] || {}; }
  function setEdit(id, field, value) { setEditMap(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } })); }

  const filtered = products.filter(p => {
    const name = (p.name || '').toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q) || sku.includes(q);
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusLabel = s => ({ publish: '已發佈', draft: '草稿', pending: '待審', private: '私密', trash: '已刪除' }[s] || s);
  const statusColor = s => ({ publish: '#22c55e', draft: '#f59e0b', pending: '#3b82f6', private: '#8b5cf6', trash: '#ef4444' }[s] || '#888');

  if (loading) return <div className="woo-loading"><RefreshCw className="spin-icon" /> 正在從 WooCommerce 載入商品...</div>;
  if (error) return <div className="woo-error">❌ {error}</div>;

  return (
    <div className="woo-product-manager">
      <div className="woo-toolbar">
        <div className="woo-search">
          <Search size={16} />
          <input placeholder="搜尋商品名稱或 SKU..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="woo-filters">
          {['all', 'publish', 'draft', 'pending', 'private'].map(s => (
            <button key={s} className={filterStatus === s ? 'active' : ''} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? `全部 (${products.length})` : `${statusLabel(s)} (${products.filter(p => p.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="woo-product-list">
        {filtered.length === 0 && <div className="woo-empty">沒有符合條件的商品</div>}
        {filtered.map(p => {
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
    </div>
  );
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

function AdminPanel({ api, content, products, productEdits, channels, dealers, movements, sales, onSave, onSaveInventory, onCreateDealerAccount }) {
  const [tab, setTab] = useState("home");
  const [draft, setDraft] = useState(content);
  const [edits, setEdits] = useState(productEdits);
  const [channelDraft, setChannelDraft] = useState(channels);

  function updateProduct(product, field, value) {
    setEdits(prev => ({ ...prev, [product.id]: { ...(prev[product.id] || {}), [field]: value } }));
  }

  return <main className="admin-page">
    <section className="admin-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>內容管理後台</h1><p>修改首頁、商品與各通路經銷折數。</p></div><button className="primary" onClick={() => onSave(draft, edits, channelDraft)}><Save /> 儲存所有變更</button></section>
    <div className="admin-notice">帳號、內容、訂單與正式營運資料由 Netlify Identity 及 Netlify Database 集中管理。</div>
    <div className="admin-layout">
      <aside className="admin-menu"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><LayoutDashboard /> 首頁內容</button><button className={tab === "api" ? "active" : ""} onClick={() => setTab("api")}><Settings /> API 設定</button><button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}><UserRound /> 經銷商帳號</button><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}><ShoppingBag /> 商品管理</button><button className={tab === "channels" ? "active" : ""} onClick={() => setTab("channels")}><Store /> 通路設定</button><button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}><Warehouse /> 寄售庫存</button><button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}><FileText /> 銷貨單</button><button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}><Upload /> Excel 正式銷貨單</button><button className={tab === "adjust" ? "active" : ""} onClick={() => setTab("adjust")}><SlidersHorizontal /> 盤點修正</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><History /> 異動紀錄</button></aside>
      <section className="admin-content">
        {tab === "api" ? <WooCommerceSettings api={api} /> : tab === "home" ? <div className="admin-form">
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
        </div> : tab === "accounts" ? <DealerAccountManager dealers={dealers} onCreate={onCreateDealerAccount} /> : tab === "products" ? <WooProductManager api={api} /> : tab === "channels" ? <ChannelManager channels={channelDraft} onChange={setChannelDraft} /> : tab === "inventory" ? <InventoryOverview channels={channelDraft} products={products} movements={movements} /> : tab === "sales" ? <SalesManager channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : tab === "import" ? <FormalSalesImport channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : tab === "adjust" ? <StockAdjustment channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : <MovementHistory products={products} movements={movements} />}
      </section>
    </div>
  </main>;
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
    <div className="sales-list table-scroll"><div className="sales-head"><span>銷貨單號</span><span>經銷商／月份</span><span>明細</span><span>總金額</span><span>附件</span><span>狀態</span></div>{sales.map(doc => <div className="sales-row" key={doc.id}><strong>{doc.id}</strong><span>{doc.company}<small>{doc.month}</small></span><span>{doc.items.reduce((s, i) => s + i.qty, 0)} 件</span><strong>{money(doc.items.reduce((s, i) => s + i.qty * i.price, 0))}</strong><span>{doc.attachment || "-"}</span><select value={doc.status} onChange={e => changeStatus(doc, e.target.value)}><option>草稿</option><option>已確認</option><option>已請款</option><option>已作廢</option></select></div>)}</div>
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

function PurchaseList({ items, subtotal, totalQty, dealerPrice, settings, stores, selectedStoreId, onSelectStore, onManageStores, onQty, onRemove, onCheckout, checkingOut }) {
  const selectedStore = stores.find(store => store.id === selectedStoreId);
  return <aside className="purchase-list">
    <div className="list-head"><div><span className="eyebrow">CURRENT ORDER</span><h2>本次採購清單</h2></div><b>{items.length} 項／{totalQty} 件</b></div>
    <div className="shipping-selector">
      <div><strong>指定收貨門市</strong><button onClick={onManageStores}>管理門市</button></div>
      {stores.length ? <>
        <select value={selectedStoreId} onChange={e => onSelectStore(e.target.value)}>
          <option value="">請選擇收貨地點</option>
          {stores.map(store => <option value={store.id} key={store.id}>{store.store_name}｜{store.company_name}</option>)}
        </select>
        {selectedStore && <p><b>{selectedStore.company_name}</b><span>{selectedStore.address}</span><small>收件：{selectedStore.recipient_name}／{selectedStore.recipient_phone}</small></p>}
      </> : <div className="shipping-empty">尚未設定門市，請先新增收貨據點。</div>}
    </div>
    <div className="list-items">{!items.length ? <div className="empty"><ShoppingBag /><h3>尚未選擇商品</h3><p>在左側輸入數量，商品會立即出現在這裡。</p></div> : items.map(item =>
      <div className="list-item" key={item.id}>
        <img className="list-item-image" src={item.image} alt={item.name} onError={e => { e.currentTarget.src = "https://eavo.com.tw/wp-content/uploads/2023/07/LOGO.png"; }} />
        <div><strong>{item.name}</strong><small>{item.sku} · 零售價 {money(item.price)}{!settings.hideDealerPrice && ` · 經銷價 ${money(dealerPrice(item.price))}`}</small></div>
        <div className="qty"><button onClick={() => onQty(item.id, -1)}><Minus /></button><span>{item.qty}</span><button onClick={() => onQty(item.id, 1)}><Plus /></button></div>
        <strong>{settings.hideDealerPrice ? `${item.qty} 件` : money(dealerPrice(item.price) * item.qty)}</strong>
        <button className="remove" onClick={() => onRemove(item.id)}><Trash2 /></button>
      </div>
    )}</div>
    <div className="list-footer">
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
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const stockRows = products.filter(p => stockOf(movements, company, p.id) !== 0);
  const icon = s => s === "已完成" ? <PackageCheck /> : <Truck />;
  const latestOrder = orders[0];
  return <main className="orders-page document-center">
    <div className="orders-intro"><span className="eyebrow">PARTNER DOCUMENT CENTER</span><h1>單據與進度中心</h1><p>統整採購進度、歷史採購、銷貨單據與目前寄售庫存。</p></div>
    <div className="document-tabs"><button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>目前進度</button><button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>歷史採購</button><button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>歷史銷貨</button>{settings.mode === "consignment" && <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>寄售庫存</button>}</div>
    {tab === "progress" && (latestOrder ? <>
    <div className="current-order">
      <div className="order-top"><div><span>最新訂單</span><h2>{latestOrder.id}</h2><small>{latestOrder.date} 建立 · 共 {latestOrder.items} 項商品{latestOrder.shipping?.storeName && ` · 寄送 ${latestOrder.shipping.storeName}`}</small></div><span className="status preparing"><Clock3 /> {latestOrder.status}</span></div>
      <div className="timeline">
        <div className="done"><i><CheckCircle2 /></i><strong>訂單成立</strong><small>{latestOrder.date}</small></div>
        <div className={latestOrder.status === "訂單成立" ? "active" : "done"}><i><CheckCircle2 /></i><strong>訂單確認</strong><small>{latestOrder.status === "訂單成立" ? "等待確認" : "已確認"}</small></div>
        <div className={["備貨中", "已出貨", "已完成"].includes(latestOrder.status) ? "active" : ""}><i><PackageCheck /></i><strong>商品備貨</strong><small>依訂單進度更新</small></div>
        <div><i><Truck /></i><strong>商品出貨</strong><small>等待中</small></div>
        <div><i><ClipboardCheck /></i><strong>訂單完成</strong><small>等待中</small></div>
      </div>
      <div className="order-total"><span>訂單總金額</span><strong>{money(latestOrder.amount)}</strong><button onClick={() => window.print()}><FileDown /> 查看／列印採購單</button></div>
    </div>
    </> : <div className="document-empty">目前尚無採購單，請先前往商品採購建立訂單。</div>)}
    {tab === "orders" && <div className="history document-list"><h2>歷史採購紀錄</h2>{orders.map(o => <div className="history-row" key={o.id}><i>{icon(o.status)}</i><div><strong>{o.id}</strong><small>{o.date} · {o.items} 項商品{o.shipping?.storeName && ` · 寄送 ${o.shipping.storeName}`}</small></div><span className={`status ${o.status === "已完成" ? "complete" : ""}`}>{o.status}</span><strong>{money(o.amount)}</strong><button><FileDown /></button></div>)}</div>}
    {tab === "sales" && <div className="customer-sales document-list"><div className="document-list-heading"><div><h2>歷史銷貨紀錄</h2><p>銷貨單由東瑭行政人員建檔與上傳，通路帳號僅能檢視及下載。</p></div><span><CheckCircle2 /> 唯讀專區</span></div>{sales.length === 0 ? <div className="document-empty">目前沒有銷貨單紀錄</div> : sales.map(doc => <article key={doc.id}><div><span className="status">{doc.status}</span><strong>{doc.id}</strong><small>{doc.month} · {doc.items.reduce((s, i) => s + i.qty, 0)} 件</small></div><strong>{money(doc.totalAmount || doc.items.reduce((s, i) => s + i.qty * i.price, 0))}</strong><div className="document-files">{doc.attachment && <a href={doc.attachment} target="_blank"><FileText /> 檢視客戶原版</a>}{doc.formalAttachment && <a href={doc.formalAttachment.startsWith("http") ? doc.formalAttachment : "#"}><FileDown /> 檢視正式銷貨單</a>}<button onClick={() => downloadReconciliation(doc, settings)}><FileDown /> 下載發票對帳明細</button></div></article>)}</div>}
    {tab === "stock" && <div className="customer-stock document-list"><h2>目前寄售庫存</h2><div className="customer-stock-head"><span>SKU</span><span>商品</span><span>目前庫存</span><span>狀態</span></div>{stockRows.map(p => { const qty = stockOf(movements, company, p.id); return <div className="customer-stock-row" key={p.id}><span>{p.sku}</span><strong>{p.name}</strong><b>{qty} 件</b><span className={qty <= 5 ? "low" : ""}>{qty <= 5 ? "建議補貨" : "庫存正常"}</span></div>; })}</div>}
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
