import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search, ShoppingBag, Plus, Minus, Trash2, ChevronRight,
  PackageCheck, Truck, ClipboardCheck, FileDown, LogOut, UserRound,
  RefreshCw, CheckCircle2, Clock3, Menu, Megaphone, Store, CalendarDays,
  LayoutDashboard, Save, Image
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

const money = n => `NT$ ${Number(n).toLocaleString("zh-TW")}`;

function App() {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [products, setProducts] = useState(fallbackProducts);
  const [content, setContent] = useState(() => JSON.parse(localStorage.getItem("dt-content") || "null") || defaultContent);
  const [productEdits, setProductEdits] = useState(() => JSON.parse(localStorage.getItem("dt-products") || "{}"));
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("常用採購");
  const [cart, setCart] = useState([]);
  const [view, setView] = useState("home");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState({});

  useEffect(() => {
    fetchProducts().then(data => { setProducts(data); setLoading(false); });
  }, []);

  const managedProducts = products.map(p => ({ ...p, ...(productEdits[p.id] || {}) })).filter(p => p.visible !== false);
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
  const subtotal = cart.reduce((sum, x) => sum + x.price * x.qty, 0);

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

  function saveAdmin(nextContent, nextProducts) {
    setContent(nextContent);
    setProductEdits(nextProducts);
    localStorage.setItem("dt-content", JSON.stringify(nextContent));
    localStorage.setItem("dt-products", JSON.stringify(nextProducts));
    notify("前台內容已儲存");
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
                    <div className="row-name"><strong>{product.name}</strong><small>品號 {product.sku}{category === "常用採購" && ` · 歷史採購 ${purchaseHistory[product.id].orderCount} 次／${purchaseHistory[product.id].totalQty} 件`}</small></div>
                    <span className="row-category">{product.category}</span>
                    <strong className="row-price">{money(product.price)}</strong>
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
            <PurchaseList items={cart} subtotal={subtotal} totalQty={totalQty} onQty={changeQty} onRemove={id => setCart(x => x.filter(i => i.id !== id))} onCheckout={checkout} />
          </section>
        </main>
      ) : view === "orders" ? <Orders orders={demoOrders} /> : <AdminPanel content={content} products={products} productEdits={productEdits} onSave={saveAdmin} />}

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
      <div className="new-product-strip">{newest.map(p => <div key={p.id}><img src={p.image} alt={p.name} /><span>{p.category}</span><strong>{p.name}</strong><small>{money(p.price)}</small></div>)}</div>
    </section>
    <section className="home-dual">
      <article className="event-card" id="events"><CalendarDays /><span className="eyebrow">PARTNER EVENT</span><h2>{content.eventTitle}</h2><b>{content.eventDate}</b><p>{content.eventText}</p></article>
      <article className="display-card" id="display-apply"><Store /><span className="eyebrow">DISPLAY SUPPORT</span><h2>{content.displayTitle}</h2><p>{content.displayText}</p>{applied ? <div className="apply-success"><CheckCircle2 /> 已送出申請，業務將與您聯繫</div> : <button className="primary" onClick={() => setApplied(true)}>申請展示架 <ChevronRight /></button>}</article>
    </section>
  </main>;
}

function AdminPanel({ content, products, productEdits, onSave }) {
  const [tab, setTab] = useState("home");
  const [draft, setDraft] = useState(content);
  const [edits, setEdits] = useState(productEdits);

  function updateProduct(product, field, value) {
    setEdits(prev => ({ ...prev, [product.id]: { ...(prev[product.id] || {}), [field]: value } }));
  }

  return <main className="admin-page">
    <section className="admin-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>內容管理後台</h1><p>修改首頁訊息、圖片與前台商品顯示內容。</p></div><button className="primary" onClick={() => onSave(draft, edits)}><Save /> 儲存所有變更</button></section>
    <div className="admin-notice">目前資料儲存在這台裝置的瀏覽器中。正式多人管理時，建議改接 Google Sheets 或後端資料庫。</div>
    <div className="admin-layout">
      <aside className="admin-menu"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><LayoutDashboard /> 首頁內容</button><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}><ShoppingBag /> 商品管理</button></aside>
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
        </div> : <div className="admin-products">
          <div className="admin-product-head"><span>顯示</span><span>商品</span><span>名稱</span><span>分類</span><span>售價</span></div>
          {products.map(product => {
            const value = { ...product, ...(edits[product.id] || {}) };
            return <div className="admin-product-row" key={product.id}>
              <input type="checkbox" checked={value.visible !== false} onChange={e => updateProduct(product, "visible", e.target.checked)} />
              <img src={value.image} alt="" />
              <div><input value={value.name} onChange={e => updateProduct(product, "name", e.target.value)} /><input className="image-url" value={value.image} onChange={e => updateProduct(product, "image", e.target.value)} placeholder="圖片網址" /></div>
              <input value={value.category} onChange={e => updateProduct(product, "category", e.target.value)} />
              <input type="number" value={value.price} onChange={e => updateProduct(product, "price", Number(e.target.value))} />
            </div>;
          })}
        </div>}
      </section>
    </div>
  </main>;
}

function AdminField({ label, value, onChange, area, icon }) {
  return <label className="admin-field"><span>{label}</span><div>{icon && <Image />}{area ? <textarea value={value} onChange={e => onChange(e.target.value)} /> : <input value={value} onChange={e => onChange(e.target.value)} />}</div></label>;
}

function PurchaseList({ items, subtotal, totalQty, onQty, onRemove, onCheckout }) {
  return <aside className="purchase-list">
    <div className="list-head"><div><span className="eyebrow">CURRENT ORDER</span><h2>本次採購清單</h2></div><b>{items.length} 項／{totalQty} 件</b></div>
    <div className="list-items">{!items.length ? <div className="empty"><ShoppingBag /><h3>尚未選擇商品</h3><p>在左側輸入數量，商品會立即出現在這裡。</p></div> : items.map(item =>
      <div className="list-item" key={item.id}>
        <div><strong>{item.name}</strong><small>{item.sku} · {money(item.price)}</small></div>
        <div className="qty"><button onClick={() => onQty(item.id, -1)}><Minus /></button><span>{item.qty}</span><button onClick={() => onQty(item.id, 1)}><Plus /></button></div>
        <strong>{money(item.price * item.qty)}</strong>
        <button className="remove" onClick={() => onRemove(item.id)}><Trash2 /></button>
      </div>
    )}</div>
    <div className="list-footer">
      <div className="summary"><span>採購總計</span><strong>{money(subtotal)}</strong><small>實際運費與優惠將由專人確認</small></div>
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
