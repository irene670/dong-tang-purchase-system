import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search, ShoppingBag, Plus, Minus, Trash2, X, ChevronRight,
  PackageCheck, Truck, ClipboardCheck, FileDown, LogOut, UserRound,
  RefreshCw, CheckCircle2, Clock3, Menu
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
  const [products, setProducts] = useState(fallbackProducts);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部商品");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [view, setView] = useState("shop");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    fetchProducts().then(data => { setProducts(data); setLoading(false); });
  }, []);

  const categories = useMemo(() => ["全部商品", ...new Set(products.map(p => p.category))], [products]);
  const shown = products.filter(p =>
    (category === "全部商品" || p.category === category) &&
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
      notify(`訂單 ${result.orderNo} 已成功送出`);
      setCart([]);
      setCartOpen(false);
      setView("orders");
    } catch {
      notify("訂單送出失敗，採購清單已為您保留");
    }
  }

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header>
        <a className="brand" href="#" onClick={() => setView("shop")}>
          <span className="brand-mark">東</span>
          <span><strong>東瑭國際</strong><small>DONG TANG INTERNATIONAL</small></span>
        </a>
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
        <nav className={mobileNav ? "open" : ""}>
          <button className={view === "shop" ? "active" : ""} onClick={() => { setView("shop"); setMobileNav(false); }}>商品採購</button>
          <button className={view === "orders" ? "active" : ""} onClick={() => { setView("orders"); setMobileNav(false); }}>訂單進度</button>
          <a href="https://eavo.com.tw/" target="_blank">品牌官網</a>
        </nav>
        <div className="account">
          <span><UserRound size={18} /> {user.company}</span>
          <button title="登出" onClick={() => setUser(null)}><LogOut size={18} /></button>
        </div>
      </header>

      {view === "shop" ? (
        <main>
          <section className="hero">
            <div>
              <span className="eyebrow">2026 BUSINESS CATALOG</span>
              <h1>採購，<br /><em>快一點。</em></h1>
              <p>從東瑭全系列商品中快速選購，送出後即時掌握備貨與出貨進度。</p>
              <div className="hero-actions">
                <button className="primary" onClick={() => document.querySelector(".catalog").scrollIntoView({ behavior: "smooth" })}>開始採購 <ChevronRight /></button>
                <span><CheckCircle2 /> 官網商品即時同步</span>
              </div>
            </div>
            <div className="hero-art">
              <span className="art-label">精選<br />木製<br />設計</span>
              <img src={products[0]?.image} alt={products[0]?.name} />
              <div className="floating-note"><strong>400+</strong><span>全系列商品</span></div>
            </div>
          </section>

          <section className="benefits">
            <div><RefreshCw /><span><strong>資料自動同步</strong><small>依 Google 商品表更新</small></span></div>
            <div><ClipboardCheck /><span><strong>快速建立採購單</strong><small>線上送出、PDF 留存</small></span></div>
            <div><Truck /><span><strong>透明出貨進度</strong><small>隨時查詢訂單狀態</small></span></div>
          </section>

          <section className="catalog">
            <div className="section-title">
              <div><span className="eyebrow">PRODUCT COLLECTION</span><h2>選擇採購商品</h2></div>
              <div className="search"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋品名或品號" /></div>
            </div>
            <div className="category-row">
              {categories.map(c => <button key={c} onClick={() => setCategory(c)} className={category === c ? "active" : ""}>{c}</button>)}
            </div>
            {loading ? <div className="loading"><RefreshCw /> 正在同步官網商品...</div> : (
              <div className="product-grid">
                {shown.map(product => (
                  <article className="product-card" key={product.id}>
                    <button className="product-image" onClick={() => add(product)}>
                      <img src={product.image} alt={product.name} onError={e => { e.currentTarget.src = "https://eavo.com.tw/wp-content/uploads/2023/07/LOGO.png"; }} />
                      <span className="quick-add"><Plus /> 快速加入</span>
                    </button>
                    <div className="product-info">
                      <span className="category-tag">{product.category}</span>
                      <h3 onClick={() => add(product)}>{product.name}</h3>
                      <small>品號 {product.sku}</small>
                      <div><strong>{money(product.price)}</strong><button onClick={() => add(product)} aria-label={`加入 ${product.name}`}><Plus /></button></div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      ) : <Orders orders={demoOrders} />}

      <button className="cart-button" onClick={() => setCartOpen(true)}>
        <ShoppingBag /><span>採購清單</span>{totalQty > 0 && <b>{totalQty}</b>}
      </button>
      <Cart open={cartOpen} items={cart} subtotal={subtotal} onClose={() => setCartOpen(false)} onQty={changeQty} onRemove={id => setCart(x => x.filter(i => i.id !== id))} onCheckout={checkout} />
      {toast && <div className="toast"><CheckCircle2 /> {toast}</div>}
    </div>
  );
}

function Login({ onLogin }) {
  const [company, setCompany] = useState("好日子設計有限公司");
  const [name, setName] = useState("王小姐");
  return <div className="login-page">
    <div className="login-brand"><span className="brand-mark">東</span><div><strong>東瑭國際</strong><small>客戶採購系統</small></div></div>
    <div className="login-panel">
      <span className="eyebrow">WELCOME BACK</span>
      <h1>歡迎回來</h1><p>登入企業帳號，開始快速採購。</p>
      <label>公司名稱<input value={company} onChange={e => setCompany(e.target.value)} /></label>
      <label>聯絡人<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>密碼<input type="password" defaultValue="12345678" /></label>
      <button className="primary login-submit" onClick={() => onLogin({ company, name })}>登入採購系統 <ChevronRight /></button>
      <small className="demo-hint">展示版本已預填測試帳號，可直接登入</small>
    </div>
    <div className="login-visual"><div><span>DESIGN IN TAIWAN</span><h2>把美好的<br />台灣故事，<br />帶進日常。</h2></div></div>
  </div>;
}

function Cart({ open, items, subtotal, onClose, onQty, onRemove, onCheckout }) {
  return <><div className={`overlay ${open ? "show" : ""}`} onClick={onClose} /><aside className={`cart ${open ? "open" : ""}`}>
    <div className="cart-head"><div><span className="eyebrow">PURCHASE LIST</span><h2>採購清單 <small>{items.length} 項</small></h2></div><button onClick={onClose}><X /></button></div>
    <div className="cart-items">{!items.length ? <div className="empty"><ShoppingBag /><h3>清單目前是空的</h3><p>點選商品圖片或「＋」即可快速加入。</p></div> : items.map(item =>
      <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div><h4>{item.name}</h4><small>品號 {item.sku}</small><strong>{money(item.price)}</strong><div className="qty"><button onClick={() => onQty(item.id, -1)}><Minus /></button><span>{item.qty}</span><button onClick={() => onQty(item.id, 1)}><Plus /></button></div></div><button className="remove" onClick={() => onRemove(item.id)}><Trash2 /></button></div>
    )}</div>
    {items.length > 0 && <div className="cart-footer"><div className="summary"><span>商品小計</span><strong>{money(subtotal)}</strong><small>實際運費與優惠將由專人確認</small></div><button className="outline" onClick={() => window.print()}><FileDown /> 產生 PDF 採購單</button><button className="primary checkout" onClick={onCheckout}>確認送出訂單 <ChevronRight /></button></div>}
  </aside></>;
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
