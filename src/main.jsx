import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search, ShoppingBag, Plus, Minus, Trash2, ChevronRight,
  PackageCheck, Truck, ClipboardCheck, FileDown, LogOut, UserRound,
  RefreshCw, CheckCircle2, Clock3, Menu, Megaphone, Store, CalendarDays,
  LayoutDashboard, Save, Image
  , Warehouse, FileText, History, SlidersHorizontal, Upload
} from "lucide-react";
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
  "好日子設計有限公司": { mode: "consignment", discount: 65, hideDealerPrice: false },
  "誠品生活": { mode: "buyout", discount: 60, hideDealerPrice: false },
  "測試通路": { mode: "consignment", discount: 70, hideDealerPrice: true }
};

function loadChannels() {
  const stored = JSON.parse(localStorage.getItem("dt-channels") || "null") || defaultChannels;
  return Object.fromEntries(Object.entries(stored).map(([name, value]) => [name, {
    mode: value.mode || defaultChannels[name]?.mode || "buyout",
    discount: value.discount ?? 100,
    hideDealerPrice: Boolean(value.hideDealerPrice)
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

async function fetchProducts() {
  try {
    const res = await fetch(`${STORE_API}/products?per_page=24`);
    if (!res.ok) throw new Error("官網同步失敗");
    const rows = await res.json();
    return rows.map((p, index) => ({
      id: p.id,
      sku: p.sku || String(p.id),
      name: stripHtml(p.name),
      price: Number(p.prices?.price) || fallbackProducts[index % fallbackProducts.length].price,
      category: p.categories?.find(c => c.name !== "All")?.name?.replace(/[▾▸]/g, "").trim() || "最新商品",
      image: p.images?.[0]?.src || fallbackProducts[index % fallbackProducts.length].image
    }));
  } catch {
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

function App() {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [products, setProducts] = useState(fallbackProducts);
  const [content, setContent] = useState(() => JSON.parse(localStorage.getItem("dt-content") || "null") || defaultContent);
  const [productEdits, setProductEdits] = useState(() => JSON.parse(localStorage.getItem("dt-products") || "{}"));
  const [channels, setChannels] = useState(loadChannels);
  const [movements, setMovements] = useState(() => JSON.parse(localStorage.getItem("dt-movements") || "null") || defaultMovements);
  const [sales, setSales] = useState(() => JSON.parse(localStorage.getItem("dt-sales") || "null") || defaultSales);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("常用採購");
  const [cart, setCart] = useState([]);
  const [view, setView] = useState("home");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState({});
  const channelSettings = user ? channels[user.company] || { discount: 100, hideDealerPrice: false } : { discount: 100, hideDealerPrice: false };

  useEffect(() => {
    fetchProducts().then(data => { setProducts(data); setLoading(false); });
  }, []);

  const managedProducts = products.map(p => ({
    ...p,
    badges: defaultBadges[p.id] || [],
    ...(productEdits[p.id] || {})
  })).filter(p => p.visible !== false);
  const frequentProducts = managedProducts
    .filter(p => purchaseHistory[p.id])
    .sort((a, b) => purchaseHistory[b.id].orderCount - purchaseHistory[a.id].orderCount);
  const categories = useMemo(() => ["常用採購", "全部商品", ...new Set(managedProducts.map(p => p.category))], [managedProducts]);
  const categoryProducts = category === "常用採購" ? frequentProducts : managedProducts;
  const shown = categoryProducts.filter(p =>
    (category === "常用採購" || category === "全部商品" || p.category === category) &&
    p.name.toLowerCase().includes(query.toLowerCase())
  );
  const totalQty = cart.reduce((sum, x) => sum + x.qty, 0);
  const dealerPrice = price => Math.round(price * channelSettings.discount / 100);
  const inventoryFor = (company, productId) => movements
    .filter(m => m.company === company && Number(m.productId) === Number(productId))
    .reduce((sum, m) => sum + Number(m.qty), 0);
  const subtotal = cart.reduce((sum, x) => sum + dealerPrice(x.price) * x.qty, 0);

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
    if (!cart.length) return;
    const order = { company: user.company, contact: user.name, total: subtotal, items: cart, createdAt: new Date().toISOString() };
    if (!SCRIPT_URL) {
      notify("尚未設定訂單資料庫");
      return;
    }
    try {
      const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(order) });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error || "送單失敗");
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
      setView("orders");
    } catch {
      notify("訂單送出失敗，採購清單已為您保留");
    }
  }

  function login(credentials) {
    if (credentials.company === "admin" && credentials.password === "admin") {
      setAdmin(true);
      setUser({ company: "東瑭管理員", name: "admin" });
      setView("admin");
      return;
    }
    const storedHistory = JSON.parse(localStorage.getItem(historyKey(credentials.company)) || "null");
    const initialHistory = storedHistory || (credentials.company === "好日子設計有限公司" ? demoFrequent : {});
    setPurchaseHistory(initialHistory);
    if (!storedHistory && credentials.company === "好日子設計有限公司") {
      localStorage.setItem(historyKey(credentials.company), JSON.stringify(initialHistory));
    }
    setUser({ company: credentials.company, name: credentials.name });
    setCategory("常用採購");
    setView("home");
  }

  function saveAdmin(nextContent, nextProducts, nextChannels) {
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
          <button className={view === "shop" ? "active" : ""} onClick={() => { setView("shop"); setMobileNav(false); }}>商品採購</button>
          <button className={view === "orders" ? "active" : ""} onClick={() => { setView("orders"); setMobileNav(false); }}>訂單進度</button>
          {admin && <button className={view === "admin" ? "active" : ""} onClick={() => { setView("admin"); setMobileNav(false); }}>內容管理</button>}
          <a href="https://eavo.com.tw/" target="_blank">品牌官網</a>
        </nav>
        <div className="account">
          <span><UserRound size={18} /> {user.company}</span>
          <button title="登出" onClick={() => { setUser(null); setAdmin(false); }}><LogOut size={18} /></button>
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
                <span>{category === "常用採購" ? `依歷史紀錄找到 ${shown.length} 項常購商品` : `共 ${shown.length} 項商品`}</span>
              </div>
            <div className="category-row">
              {categories.map(c => <button key={c} onClick={() => setCategory(c)} className={category === c ? "active" : ""}>{c}</button>)}
            </div>
            {loading ? <div className="loading"><RefreshCw /> 正在同步官網商品...</div> : (
              <div className="product-table">
                <div className="product-table-head"><span>商品</span><span>品名／品號</span><span>分類</span><span>單價</span><span>採購數量</span></div>
                {category === "常用採購" && shown.length === 0 ? <div className="frequent-empty"><Clock3 /><h3>目前還沒有歷史採購品項</h3><p>完成第一筆訂單後，曾採購的商品會自動整理到這裡。</p><button onClick={() => setCategory("全部商品")}>瀏覽全部商品</button></div> : shown.map(product => (
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
            <PurchaseList items={cart} subtotal={subtotal} totalQty={totalQty} dealerPrice={dealerPrice} settings={channelSettings} onQty={changeQty} onRemove={id => setCart(x => x.filter(i => i.id !== id))} onCheckout={checkout} />
          </section>
        </main>
      ) : view === "orders" ? <Orders orders={demoOrders} /> : <AdminPanel content={content} products={products} productEdits={productEdits} channels={channels} movements={movements} sales={sales} onSave={saveAdmin} onSaveInventory={saveInventory} />}

      {toast && <div className="toast"><CheckCircle2 /> {toast}</div>}
    </div>
  );
}

function Login({ onLogin }) {
  const [company, setCompany] = useState("好日子設計有限公司");
  const [name, setName] = useState("王小姐");
  const [password, setPassword] = useState("12345678");
  return <div className="login-page">
    <div className="login-brand"><span className="brand-mark">東</span><div><strong>東瑭國際</strong><small>客戶採購系統</small></div></div>
    <div className="login-panel">
      <span className="eyebrow">WELCOME BACK</span>
      <h1>歡迎回來</h1><p>登入企業帳號，開始快速採購。</p>
      <label>公司名稱<input value={company} onChange={e => setCompany(e.target.value)} /></label>
      <label>聯絡人<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>密碼<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="primary login-submit" onClick={() => onLogin({ company, name, password })}>登入採購系統 <ChevronRight /></button>
      <small className="demo-hint">管理後台：公司名稱 admin／密碼 admin</small>
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

function AdminPanel({ content, products, productEdits, channels, movements, sales, onSave, onSaveInventory }) {
  const [tab, setTab] = useState("home");
  const [draft, setDraft] = useState(content);
  const [edits, setEdits] = useState(productEdits);
  const [channelDraft, setChannelDraft] = useState(channels);

  function updateProduct(product, field, value) {
    setEdits(prev => ({ ...prev, [product.id]: { ...(prev[product.id] || {}), [field]: value } }));
  }

  return <main className="admin-page">
    <section className="admin-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>內容管理後台</h1><p>修改首頁、商品與各通路經銷折數。</p></div><button className="primary" onClick={() => onSave(draft, edits, channelDraft)}><Save /> 儲存所有變更</button></section>
    <div className="admin-notice">目前資料儲存在這台裝置的瀏覽器中。正式多人管理時，建議改接 Google Sheets 或後端資料庫。</div>
    <div className="admin-layout">
      <aside className="admin-menu"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><LayoutDashboard /> 首頁內容</button><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}><ShoppingBag /> 商品管理</button><button className={tab === "channels" ? "active" : ""} onClick={() => setTab("channels")}><UserRound /> 通路設定</button><button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}><Warehouse /> 寄售庫存</button><button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}><FileText /> 銷貨單</button><button className={tab === "adjust" ? "active" : ""} onClick={() => setTab("adjust")}><SlidersHorizontal /> 盤點修正</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><History /> 異動紀錄</button></aside>
      <section className="admin-content">
        {tab === "home" ? <div className="admin-form">
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
        </div> : tab === "products" ? <div className="admin-products">
          <div className="admin-product-head"><span>顯示</span><span>商品</span><span>名稱／狀態</span><span>分類</span><span>售價</span></div>
          {products.map(product => {
            const value = { ...product, badges: defaultBadges[product.id] || [], ...(edits[product.id] || {}) };
            return <div className="admin-product-row" key={product.id}>
              <input type="checkbox" checked={value.visible !== false} onChange={e => updateProduct(product, "visible", e.target.checked)} />
              <img src={value.image} alt="" />
              <div>
                <input value={value.name} onChange={e => updateProduct(product, "name", e.target.value)} />
                <div className="badge-editor">{productBadgeOptions.map(option => <label key={option.key}><input type="checkbox" checked={(value.badges || []).includes(option.key)} onChange={e => {
                  const badges = e.target.checked ? [...(value.badges || []), option.key] : (value.badges || []).filter(key => key !== option.key);
                  updateProduct(product, "badges", badges);
                }} /><span className={`product-badge ${option.key}`}>{option.label}</span></label>)}</div>
                <input className="image-url" value={value.image} onChange={e => updateProduct(product, "image", e.target.value)} placeholder="圖片網址" />
              </div>
              <input value={value.category} onChange={e => updateProduct(product, "category", e.target.value)} />
              <input type="number" value={value.price} onChange={e => updateProduct(product, "price", Number(e.target.value))} />
            </div>;
          })}
        </div> : tab === "channels" ? <ChannelManager channels={channelDraft} onChange={setChannelDraft} /> : tab === "inventory" ? <InventoryOverview channels={channelDraft} products={products} movements={movements} /> : tab === "sales" ? <SalesManager channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : tab === "adjust" ? <StockAdjustment channels={channelDraft} products={products} movements={movements} sales={sales} onSave={onSaveInventory} /> : <MovementHistory products={products} movements={movements} />}
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
    onChange({ ...channels, [name]: { mode: "buyout", discount: 70, hideDealerPrice: false } });
    setNewName("");
  }
  return <div className="channel-manager">
    <div className="add-channel"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="輸入新通路公司名稱" /><button onClick={addChannel}><Plus /> 新增通路</button></div>
    <div className="channel-head"><span>通路帳號／公司</span><span>經銷模式</span><span>經銷折數</span><span>價格顯示</span></div>
    {Object.entries(channels).map(([name, value]) => <div className="channel-row" key={name}>
      <strong>{name}</strong>
      <select value={value.mode || "buyout"} onChange={e => update(name, "mode", e.target.value)}><option value="buyout">買斷</option><option value="consignment">寄售</option></select>
      <label><input type="number" min="1" max="100" value={value.discount} onChange={e => update(name, "discount", Math.min(100, Math.max(1, Number(e.target.value))))} /><span>%</span><small>{discountLabel(value.discount)} = 零售價 × {(value.discount / 100).toFixed(2)}</small></label>
      <label className="hide-price"><input type="checkbox" checked={value.hideDealerPrice} onChange={e => update(name, "hideDealerPrice", e.target.checked)} /><span>不顯示經銷價</span></label>
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
    const discount = channels[form.company]?.discount || 100;
    setUploading(true);
    let attachment = form.attachment;
    try { attachment = await uploadSalesFile(form.file); } catch { attachment = form.file?.name || ""; }
    const doc = { id: `SO-${Date.now()}`, company: form.company, month: form.month, date: form.date, status: "草稿", note: form.note, attachment, items: [{ productId: Number(form.productId), sku: product.sku, name: product.name, qty: Number(form.qty), price: Math.round(product.price * discount / 100) }] };
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
      <label className="upload-field"><Upload /> {form.file?.name || "上傳原始銷貨單"}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} /></label>
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

function PurchaseList({ items, subtotal, totalQty, dealerPrice, settings, onQty, onRemove, onCheckout }) {
  return <aside className="purchase-list">
    <div className="list-head"><div><span className="eyebrow">CURRENT ORDER</span><h2>本次採購清單</h2></div><b>{items.length} 項／{totalQty} 件</b></div>
    <div className="list-items">{!items.length ? <div className="empty"><ShoppingBag /><h3>尚未選擇商品</h3><p>在左側輸入數量，商品會立即出現在這裡。</p></div> : items.map(item =>
      <div className="list-item" key={item.id}>
        <div><strong>{item.name}</strong><small>{item.sku} · 零售價 {money(item.price)}{!settings.hideDealerPrice && ` · 經銷價 ${money(dealerPrice(item.price))}`}</small></div>
        <div className="qty"><button onClick={() => onQty(item.id, -1)}><Minus /></button><span>{item.qty}</span><button onClick={() => onQty(item.id, 1)}><Plus /></button></div>
        <strong>{settings.hideDealerPrice ? `${item.qty} 件` : money(dealerPrice(item.price) * item.qty)}</strong>
        <button className="remove" onClick={() => onRemove(item.id)}><Trash2 /></button>
      </div>
    )}</div>
    <div className="list-footer">
      <div className="summary"><span>採購總計</span><strong>{settings.hideDealerPrice ? "價格另行確認" : money(subtotal)}</strong><small>{discountLabel(settings.discount)}通路價格 · 實際運費與優惠將由專人確認</small></div>
      <button className="outline" disabled={!items.length} onClick={() => window.print()}><FileDown /> 產生 PDF 採購單</button>
      <button className="primary checkout" disabled={!items.length} onClick={onCheckout}>確認送出訂單 <ChevronRight /></button>
    </div>
  </aside>;
}

function Orders({ orders }) {
  const icon = s => s === "已完成" ? <PackageCheck /> : <Truck />;
  return <main className="orders-page">
    <div className="orders-intro"><span className="eyebrow">ORDER TRACKING</span><h1>訂單進度</h1><p>從訂單確認、備貨到出貨，每一步都清楚掌握。</p></div>
    <div className="current-order">
      <div className="order-top"><div><span>最新訂單</span><h2>DT-20260610-024</h2><small>2026/06/10 14:32 建立 · 共 8 項商品</small></div><span className="status preparing"><Clock3 /> 備貨中</span></div>
      <div className="timeline">
        <div className="done"><i><CheckCircle2 /></i><strong>訂單成立</strong><small>06/10 14:32</small></div>
        <div className="done"><i><CheckCircle2 /></i><strong>訂單確認</strong><small>06/10 16:05</small></div>
        <div className="active"><i><PackageCheck /></i><strong>商品備貨</strong><small>預計 06/12 完成</small></div>
        <div><i><Truck /></i><strong>商品出貨</strong><small>等待中</small></div>
        <div><i><ClipboardCheck /></i><strong>訂單完成</strong><small>等待中</small></div>
      </div>
      <div className="order-total"><span>訂單總金額</span><strong>{money(18760)}</strong><button onClick={() => window.print()}><FileDown /> 下載採購單</button></div>
    </div>
    <div className="history"><h2>歷史訂單</h2>{orders.map(o => <div className="history-row" key={o.id}><i>{icon(o.status)}</i><div><strong>{o.id}</strong><small>{o.date} · {o.items} 項商品</small></div><span className={`status ${o.status === "已完成" ? "complete" : ""}`}>{o.status}</span><strong>{money(o.amount)}</strong><button><ChevronRight /></button></div>)}</div>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
