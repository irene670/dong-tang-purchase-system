import { db } from "./db.mjs";
import { hashPassword } from "./auth.mjs";
import { calculatePricing, normalizePricingSettings } from "../shared/pricing.mjs";

const identityAdmin = {
  async createUser({ email, password, data }) {
    const passwordHash = await hashPassword(password);
    const roles = data.app_metadata?.roles || ['dealer'];
    const fullName = data.user_metadata?.full_name || '';
    const company = data.user_metadata?.company || '';
    
    const rows = await db.sql`
      INSERT INTO users (email, password_hash, roles, full_name, company)
      VALUES (${email}, ${passwordHash}, ${roles}, ${fullName}, ${company})
      RETURNING *
    `;
    const user = rows[0];
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      user_metadata: { full_name: user.full_name, company: user.company }
    };
  },
  async deleteUser(id) {
    await db.sql`DELETE FROM users WHERE id = ${id}`;
  }
};

const json = (data, status = 200) => Response.json(data, { status });

async function auth(req) {
  return req.user || null;
}

async function dealerFor(user) {
  let rows = await db.sql`SELECT * FROM dealers WHERE identity_user_id = ${user.id}`;
  if (rows.length) return rows[0];
  rows = await db.sql`SELECT * FROM dealers WHERE email = ${user.email}`;
  if (rows.length) {
    const linked = await db.sql`
      UPDATE dealers SET identity_user_id = ${user.id}, updated_at = now()
      WHERE id = ${rows[0].id} RETURNING *`;
    return linked[0];
  }
  const company = user.company || user.name || user.email;
  const created = await db.sql`
    INSERT INTO dealers (identity_user_id, email, company_name, contact_name)
    VALUES (${user.id}, ${user.email}, ${company}, ${user.name}) RETURNING *`;
  return created[0];
}

function isAdmin(user) {
  return user.roles.includes("admin");
}

const orderStatuses = ["訂單成立", "已確認", "備貨中", "已出貨", "已完成", "已取消"];
const inventoryOrderStatuses = ["已出貨", "已完成"];

async function bootstrap(user) {
  const dealer = await dealerFor(user);
  const content = await db.sql`SELECT value FROM app_settings WHERE key = 'content'`;
  const products = await db.sql`SELECT * FROM product_overrides ORDER BY product_id`;
  const dealers = isAdmin(user)
    ? await db.sql`SELECT * FROM dealers ORDER BY company_name`
    : [dealer];
  const orders = isAdmin(user)
    ? await db.sql`SELECT o.*, d.company_name FROM orders o JOIN dealers d ON d.id=o.dealer_id ORDER BY o.created_at DESC`
    : await db.sql`SELECT * FROM orders WHERE dealer_id=${dealer.id} ORDER BY created_at DESC`;
  const orderItems = await db.sql`SELECT * FROM order_items ORDER BY id`;
  const sales = isAdmin(user)
    ? await db.sql`SELECT s.*, d.company_name FROM sales_documents s JOIN dealers d ON d.id=s.dealer_id ORDER BY s.sales_date DESC`
    : await db.sql`SELECT * FROM sales_documents WHERE dealer_id=${dealer.id} ORDER BY sales_date DESC`;
  const salesItems = await db.sql`SELECT * FROM sales_document_items ORDER BY id`;
  const movements = isAdmin(user)
    ? await db.sql`SELECT m.*, d.company_name FROM inventory_movements m JOIN dealers d ON d.id=m.dealer_id ORDER BY m.created_at`
    : await db.sql`SELECT * FROM inventory_movements WHERE dealer_id=${dealer.id} ORDER BY created_at`;
  const stores = isAdmin(user)
    ? await db.sql`SELECT * FROM dealer_stores ORDER BY dealer_id, is_default DESC, store_name`
    : await db.sql`SELECT * FROM dealer_stores WHERE dealer_id=${dealer.id} ORDER BY is_default DESC, store_name`;
  return {
    user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
    admin: isAdmin(user),
    dealer,
    content: content[0]?.value || {},
    productOverrides: products,
    dealers,
    stores,
    orders: orders.map(o => ({ ...o, items: orderItems.filter(i => i.order_id === o.id) })),
    sales: sales.map(s => ({ ...s, items: salesItems.filter(i => i.sales_document_id === s.id) })),
    movements
  };
}

async function createOrder(user, body) {
  const dealer = await dealerFor(user);
  if (!Array.isArray(body.items) || !body.items.length) return json({ error: "採購清單不可為空" }, 400);
  if (!body.storeId) return json({ error: "請選擇收貨門市" }, 400);
  const stores = await db.sql`
    SELECT * FROM dealer_stores WHERE id=${body.storeId} AND dealer_id=${dealer.id} AND active=true`;
  if (!stores.length) return json({ error: "找不到可使用的收貨門市" }, 400);
  const store = stores[0];
  const shippingSnapshot = {
    storeName: store.store_name,
    companyName: store.company_name,
    taxId: store.tax_id,
    postalCode: store.postal_code,
    address: store.address,
    recipientName: store.recipient_name,
    recipientPhone: store.recipient_phone,
    recipientEmail: store.recipient_email,
    deliveryNote: store.delivery_note
  };
  const orderNo = `DT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
  const pricing = calculatePricing(body.items, dealer);
  const orders = await db.sql`
    INSERT INTO orders (order_no, dealer_id, contact_name, total_amount, pre_tax_amount,
      tax_amount, retail_total, pricing_snapshot, store_id, shipping_snapshot)
    VALUES (${orderNo}, ${dealer.id}, ${body.contact || dealer.contact_name}, ${pricing.total},
      ${pricing.preTaxTotal}, ${pricing.taxTotal}, ${pricing.retailTotal},
      ${JSON.stringify(pricing.settings)}::jsonb, ${store.id}, ${JSON.stringify(shippingSnapshot)}::jsonb)
    RETURNING *`;
  for (const item of pricing.lines) {
    await db.sql`
      INSERT INTO order_items
        (order_id, product_id, sku, product_name, image_url, retail_price, dealer_price, quantity,
          pre_tax_amount, tax_amount, line_total)
      VALUES (${orders[0].id}, ${Number(item.id)}, ${String(item.sku)}, ${item.name},
        ${item.image || null}, ${item.price}, ${item.unitPrice}, ${item.qty},
        ${item.preTax}, ${item.tax}, ${item.total})`;
  }
  return json({ ok: true, orderNo, pricing });
}

async function applyPurchaseInventory(user, order, items) {
  if (order.mode !== "consignment") return;
  for (const item of items) {
    await db.sql`
      INSERT INTO inventory_movements
        (dealer_id, product_id, movement_type, quantity, source_type, source_id,
          idempotency_key, operator_email, note)
      VALUES (${order.dealer_id}, ${Number(item.product_id)}, '採購單入庫',
        ${Number(item.quantity)}, 'order', ${order.order_no},
        ${`order:${order.id}:${item.id}:inbound`}, ${user.email}, '採購單已出貨／完成，自動加入寄售庫存')
      ON CONFLICT (idempotency_key) DO NOTHING`;
  }
}

async function reversePurchaseInventory(user, order, items) {
  if (order.mode !== "consignment") return;
  const applied = await db.sql`
    SELECT id FROM inventory_movements
    WHERE source_type='order' AND source_id=${order.order_no}
      AND movement_type='採購單入庫'
    LIMIT 1`;
  if (!applied.length) return;
  for (const item of items) {
    await db.sql`
      INSERT INTO inventory_movements
        (dealer_id, product_id, movement_type, quantity, source_type, source_id,
          idempotency_key, operator_email, note)
      VALUES (${order.dealer_id}, ${Number(item.product_id)}, '採購單取消回沖',
        ${-Number(item.quantity)}, 'order', ${order.order_no},
        ${`order:${order.id}:${item.id}:cancel-reversal`}, ${user.email}, '已入庫採購單取消，自動回沖寄售庫存')
      ON CONFLICT (idempotency_key) DO NOTHING`;
  }
}

async function updateOrder(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const orderId = body.orderId || body.id;
  const status = body.status;
  if (!orderId) return json({ error: "缺少訂單 ID" }, 400);
  if (!orderStatuses.includes(status)) return json({ error: "訂單狀態不正確" }, 400);

  const orders = await db.sql`
    SELECT o.*, d.company_name, d.mode
    FROM orders o
    JOIN dealers d ON d.id=o.dealer_id
    WHERE o.id::text=${String(orderId)} OR o.order_no=${String(orderId)}`;
  if (!orders.length) return json({ error: "找不到訂單" }, 404);
  const order = orders[0];
  const items = await db.sql`SELECT * FROM order_items WHERE order_id=${order.id} ORDER BY id`;

  const nextTracking = String(body.trackingNo ?? order.tracking_no ?? "").trim();
  const nextNote = String(body.note ?? order.admin_note ?? "").trim();
  const now = new Date().toISOString();
  const rows = await db.sql`
    UPDATE orders SET status=${status},
      confirmed_at=CASE WHEN ${status} IN ('已確認','備貨中','已出貨','已完成') AND confirmed_at IS NULL THEN ${now}::timestamptz ELSE confirmed_at END,
      prepared_at=CASE WHEN ${status} IN ('備貨中','已出貨','已完成') AND prepared_at IS NULL THEN ${now}::timestamptz ELSE prepared_at END,
      shipped_at=CASE WHEN ${status} IN ('已出貨','已完成') AND shipped_at IS NULL THEN ${now}::timestamptz ELSE shipped_at END,
      completed_at=CASE WHEN ${status}='已完成' AND completed_at IS NULL THEN ${now}::timestamptz ELSE completed_at END,
      cancelled_at=CASE WHEN ${status}='已取消' AND cancelled_at IS NULL THEN ${now}::timestamptz ELSE cancelled_at END,
      tracking_no=${nextTracking},
      admin_note=${nextNote},
      updated_at=now()
    WHERE id=${order.id}
    RETURNING *`;

  if (inventoryOrderStatuses.includes(status)) await applyPurchaseInventory(user, order, items);
  if (status === "已取消") await reversePurchaseInventory(user, order, items);

  return json({ ok: true, order: { ...rows[0], company_name: order.company_name, items } });
}

async function saveDealerProfile(user, body) {
  const ownDealer = await dealerFor(user);
  const dealerId = isAdmin(user) && body.dealerId ? body.dealerId : ownDealer.id;
  if (!body.profile?.companyName?.trim()) return json({ error: "公司名稱不可空白" }, 400);
  const updated = await db.sql`
    UPDATE dealers SET company_name=${body.profile.companyName.trim()},
      contact_name=${body.profile.contactName?.trim() || ''},
      tax_id=${body.profile.taxId?.trim() || ''},
      invoice_title=${body.profile.invoiceTitle?.trim() || ''},
      invoice_address=${body.profile.invoiceAddress?.trim() || ''},
      phone=${body.profile.phone?.trim() || ''},
      billing_email=${body.profile.billingEmail?.trim() || ''},
      updated_at=now()
    WHERE id=${dealerId} RETURNING *`;
  if (!updated.length) return json({ error: "找不到經銷商" }, 404);
  return json({ ok: true, dealer: updated[0] });
}

async function saveStore(user, body) {
  const ownDealer = await dealerFor(user);
  const dealerId = isAdmin(user) && body.dealerId ? body.dealerId : ownDealer.id;
  const store = body.store || {};
  if (!store.storeName?.trim() || !store.companyName?.trim() || !store.address?.trim()
      || !store.recipientName?.trim() || !store.recipientPhone?.trim()) {
    return json({ error: "請填寫門市名稱、廠商名稱、地址、收件人與電話" }, 400);
  }
  const existingStores = await db.sql`
    SELECT id FROM dealer_stores WHERE dealer_id=${dealerId} AND active=true LIMIT 1`;
  const shouldBeDefault = Boolean(store.isDefault) || (!store.id && !existingStores.length);
  if (shouldBeDefault) {
    await db.sql`UPDATE dealer_stores SET is_default=false, updated_at=now() WHERE dealer_id=${dealerId}`;
  }
  let rows;
  if (store.id) {
    rows = await db.sql`
      UPDATE dealer_stores SET store_name=${store.storeName.trim()}, company_name=${store.companyName.trim()},
        tax_id=${store.taxId?.trim() || ''}, postal_code=${store.postalCode?.trim() || ''},
        address=${store.address.trim()}, recipient_name=${store.recipientName.trim()},
        recipient_phone=${store.recipientPhone.trim()}, recipient_email=${store.recipientEmail?.trim() || ''},
        delivery_note=${store.deliveryNote?.trim() || ''}, is_default=${shouldBeDefault},
        active=${store.active !== false}, updated_at=now()
      WHERE id=${store.id} AND dealer_id=${dealerId} RETURNING *`;
  } else {
    rows = await db.sql`
      INSERT INTO dealer_stores (dealer_id, store_name, company_name, tax_id, postal_code, address,
        recipient_name, recipient_phone, recipient_email, delivery_note, is_default)
      VALUES (${dealerId}, ${store.storeName.trim()}, ${store.companyName.trim()}, ${store.taxId?.trim() || ''},
        ${store.postalCode?.trim() || ''}, ${store.address.trim()}, ${store.recipientName.trim()},
        ${store.recipientPhone.trim()}, ${store.recipientEmail?.trim() || ''},
        ${store.deliveryNote?.trim() || ''}, ${shouldBeDefault}) RETURNING *`;
  }
  if (!rows.length) return json({ error: "找不到門市或沒有修改權限" }, 404);
  return json({ ok: true, store: rows[0] });
}

async function createDealerAccount(user, body) {
  if (!isAdmin(user)) return json({ error: "只有管理員可以建立經銷商帳號" }, 403);
  const account = body.account || {};
  const email = account.email?.trim().toLowerCase();
  const companyName = account.companyName?.trim();
  const contactName = account.contactName?.trim();
  const password = String(account.password || "");
  const discount = Number(account.discount);
  if (!email || !companyName || !contactName || !password) {
    return json({ error: "請填寫 Email、公司名稱、聯絡人與初始密碼" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email 格式不正確" }, 400);
  if (password.length < 8) return json({ error: "初始密碼至少需要 8 個字元" }, 400);
  if (!["buyout", "consignment"].includes(account.mode)) return json({ error: "經銷模式不正確" }, 400);
  if (!Number.isFinite(discount) || discount < 1 || discount > 100) {
    return json({ error: "經銷折數必須介於 1% 至 100%" }, 400);
  }
  const existing = await db.sql`SELECT id FROM dealers WHERE email=${email}`;
  if (existing.length) return json({ error: "此 Email 已經有經銷商帳號" }, 409);

  let identityUser;
  try {
    identityUser = await identityAdmin.createUser({
      email,
      password,
      data: {
        role: "dealer",
        app_metadata: { roles: ["dealer"] },
        user_metadata: { full_name: contactName, company: companyName }
      }
    });
    const rows = await db.sql`
      INSERT INTO dealers (identity_user_id, email, company_name, contact_name, mode,
        discount_percent, hide_dealer_price, phone, billing_email)
      VALUES (${identityUser.id}, ${email}, ${companyName}, ${contactName}, ${account.mode},
        ${discount}, ${Boolean(account.hideDealerPrice)}, ${account.phone?.trim() || ''}, ${email})
      RETURNING *`;
    return json({ ok: true, dealer: rows[0], identityUserId: identityUser.id });
  } catch (error) {
    if (identityUser?.id) {
      await identityAdmin.deleteUser(identityUser.id).catch(() => {});
    }
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("already")) return json({ error: "此 Email 已存在於登入系統" }, 409);
    throw error;
  }
}

async function saveSettings(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  await db.sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('content', ${JSON.stringify(body.content)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
  for (const [id, item] of Object.entries(body.products || {})) {
    await db.sql`
      INSERT INTO product_overrides
        (product_id, sku, name, category, price, image_url, badges, visible, updated_at)
      VALUES (${Number(id)}, ${item.sku || null}, ${item.name || null}, ${item.category || null},
        ${item.price ?? null}, ${item.image || null}, ${JSON.stringify(item.badges || [])}::jsonb,
        ${item.visible !== false}, now())
      ON CONFLICT (product_id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
        price=EXCLUDED.price, image_url=EXCLUDED.image_url, badges=EXCLUDED.badges,
        visible=EXCLUDED.visible, updated_at=now()`;
  }
  for (const [company, settings] of Object.entries(body.channels || {})) {
    const pricing = normalizePricingSettings(settings);
    await db.sql`
      INSERT INTO dealers (email, company_name, mode, discount_percent, hide_dealer_price,
        tax_mode, tax_rate, calculation_scope, rounding_mode, rounding_digits)
      VALUES (${`pending+${encodeURIComponent(company)}@eavo.invalid`}, ${company}, ${settings.mode},
        ${pricing.discount}, ${Boolean(settings.hideDealerPrice)}, ${pricing.taxMode},
        ${pricing.taxRate}, ${pricing.calculationScope}, ${pricing.roundingMode}, ${pricing.roundingDigits})
      ON CONFLICT (email) DO UPDATE SET company_name=EXCLUDED.company_name, mode=EXCLUDED.mode,
        discount_percent=EXCLUDED.discount_percent, hide_dealer_price=EXCLUDED.hide_dealer_price,
        tax_mode=EXCLUDED.tax_mode, tax_rate=EXCLUDED.tax_rate,
        calculation_scope=EXCLUDED.calculation_scope, rounding_mode=EXCLUDED.rounding_mode,
        rounding_digits=EXCLUDED.rounding_digits,
        updated_at=now()`;
    await db.sql`
      UPDATE dealers SET mode=${settings.mode}, discount_percent=${pricing.discount},
        hide_dealer_price=${Boolean(settings.hideDealerPrice)}, tax_mode=${pricing.taxMode},
        tax_rate=${pricing.taxRate}, calculation_scope=${pricing.calculationScope},
        rounding_mode=${pricing.roundingMode}, rounding_digits=${pricing.roundingDigits}, updated_at=now()
      WHERE company_name=${company}`;
  }
  return json({ ok: true });
}

async function getWooCommerceSettings(user) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const rows = await db.sql`SELECT value FROM app_settings WHERE key = 'woocommerce'`;
  const settings = rows[0]?.value || { url: '', consumerKey: '', consumerSecret: '' };
  // Never return the full secret to the frontend, just a masked version or boolean indicator if needed.
  // Actually, for an admin settings page, they might need to see if it's set. We can return it masked.
  const maskedSecret = settings.consumerSecret ? '*'.repeat(settings.consumerSecret.length - 4) + settings.consumerSecret.slice(-4) : '';
  const maskedKey = settings.consumerKey ? '*'.repeat(settings.consumerKey.length - 4) + settings.consumerKey.slice(-4) : '';
  return json({ ok: true, settings: { url: settings.url, consumerKeyMasked: maskedKey, consumerSecretMasked: maskedSecret } });
}

async function saveWooCommerceSettings(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const { url, consumerKey, consumerSecret } = body;
  
  // Fetch existing to handle masked values
  const rows = await db.sql`SELECT value FROM app_settings WHERE key = 'woocommerce'`;
  const existing = rows[0]?.value || {};
  
  const finalKey = consumerKey && !consumerKey.includes('*') ? consumerKey : existing.consumerKey;
  const finalSecret = consumerSecret && !consumerSecret.includes('*') ? consumerSecret : existing.consumerSecret;
  
  const newValue = { url: url || existing.url, consumerKey: finalKey, consumerSecret: finalSecret };
  
  await db.sql`
    INSERT INTO app_settings (key, value) VALUES ('woocommerce', ${JSON.stringify(newValue)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return json({ ok: true });
}

async function updateWooCommerceProduct(user, body) {
  if (!user) return json({ error: "Unauthorized" }, 401);
  const rows = await db.sql`SELECT value FROM app_settings WHERE key = 'woocommerce'`;
  const settings = rows[0]?.value;
  if (!settings?.url || !settings?.consumerKey) return json({ error: "WooCommerce API 尚未設定" }, 400);

  const { product } = body;
  if (!product?.id) return json({ error: "缺少 product.id" }, 400);

  const baseUrl = settings.url.replace(/\/$/, "");
  const apiPath = `${baseUrl}/wp-json/wc/v3/products/${product.id}`;
  const authHeader = 'Basic ' + Buffer.from(`${settings.consumerKey}:${settings.consumerSecret}`).toString('base64');

  // Build the update payload (only include fields that are present)
  const allowed = ['name','sku','status','regular_price','sale_price','date_on_sale_from','date_on_sale_to',
    'manage_stock','stock_quantity','stock_status','backorders','low_stock_amount',
    'weight','shipping_class','description','short_description','purchase_note',
    'featured','reviews_allowed','menu_order'];
  const payload = {};
  for (const key of allowed) {
    if (product[key] !== undefined) payload[key] = product[key];
  }
  // Handle dimensions
  if (product.dim_length !== undefined || product.dim_width !== undefined || product.dim_height !== undefined) {
    payload.dimensions = { length: product.dim_length ?? '', width: product.dim_width ?? '', height: product.dim_height ?? '' };
  }

  try {
    const res = await fetch(apiPath, {
      method: 'PUT',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.message || "WooCommerce 更新失敗" }, res.status);
    await upsertWooProductCache([data]);
    return json({ ok: true, product: data });
  } catch (error) {
    console.error("WooCommerce update error:", error);
    return json({ error: "更新商品時發生錯誤" }, 500);
  }
}

async function fetchWooCommerceProducts(user, req) {
  const cached = await db.sql`SELECT payload FROM woocommerce_product_cache ORDER BY product_id`;
  return json(cached.map(row => row.payload));
}

async function syncWooCommerceProducts(user) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);

  const rows = await db.sql`SELECT value FROM app_settings WHERE key = 'woocommerce'`;
  const settings = rows[0]?.value;
  
  if (!settings || !settings.url) {
    // Fallback to the old hardcoded public API if not configured, or return empty
    const fallbackUrl = "https://eavo.com.tw/wp-json/wc/store/v1/products?per_page=100";
    try {
      const data = await fetchAllWooPages(fallbackUrl);
      await replaceWooProductCache(data);
      await saveWooSyncMeta(data.length);
      return json({ ok: true, count: data.length, products: data });
    } catch (e) {
      console.error("Fallback fetch failed", e);
      return json({ error: "官網商品同步失敗" }, 502);
    }
  }

  // Ensure URL is properly formatted
  let baseUrl = settings.url.replace(/\/$/, "");
  // WooCommerce REST API v3 path
  const apiPath = `${baseUrl}/wp-json/wc/v3/products?per_page=100`;
  
  try {
    const authHeader = 'Basic ' + Buffer.from(`${settings.consumerKey}:${settings.consumerSecret}`).toString('base64');
    const data = await fetchAllWooPages(apiPath, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });
    await replaceWooProductCache(data);
    await saveWooSyncMeta(data.length);
    return json({ ok: true, count: data.length, products: data });
  } catch (error) {
    console.error("WooCommerce fetch error:", error);
    return json({ error: error.message || "Internal error fetching products" }, 500);
  }
}

async function replaceWooProductCache(products) {
  await db.sql`DELETE FROM woocommerce_product_cache`;
  await upsertWooProductCache(products);
}

async function upsertWooProductCache(products) {
  const syncedAt = new Date().toISOString();
  for (const product of products) {
    await db.sql`
      INSERT INTO woocommerce_product_cache (product_id, payload, status, sku, name, synced_at, updated_at)
      VALUES (${Number(product.id)}, ${JSON.stringify(product)}::jsonb, ${product.status || ''},
        ${product.sku || ''}, ${stripHtml(String(product.name || ''))}, ${syncedAt}, now())
      ON CONFLICT (product_id) DO UPDATE SET payload=EXCLUDED.payload, status=EXCLUDED.status,
        sku=EXCLUDED.sku, name=EXCLUDED.name, synced_at=EXCLUDED.synced_at, updated_at=now()`;
  }
}

async function saveWooSyncMeta(count) {
  const rows = await db.sql`SELECT value FROM app_settings WHERE key = 'woocommerce'`;
  const existing = rows[0]?.value || {};
  await db.sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('woocommerce', ${JSON.stringify({ ...existing, lastSyncAt: new Date().toISOString(), lastSyncCount: count })}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
}

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, "").trim();
}

async function fetchAllWooPages(baseApiPath, options = {}) {
  const perPage = 100;
  const maxPages = 20;
  const products = [];
  let totalPages = null;

  for (let page = 1; page <= (totalPages || maxPages); page += 1) {
    const url = new URL(baseApiPath);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    const res = await fetch(url, options);

    if (!res.ok) {
      const errText = await res.text();
      console.error("WooCommerce API Error:", res.status, errText);
      throw new Error(`WooCommerce 商品同步失敗（HTTP ${res.status}）`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) return products;
    products.push(...rows);

    const headerPages = Number(res.headers.get("x-wp-totalpages"));
    if (Number.isFinite(headerPages) && headerPages > 0) {
      totalPages = Math.min(headerPages, maxPages);
    }
    if (!rows.length || rows.length < perPage) break;
  }

  return products;
}

export default async function handler(req) {
  try {
    const route = req.params?.route || req.query?.route || "bootstrap";
    const body = req.method === "GET" ? {} : req.body;
    const action = body.action || req.query?.action || route;
    
    // Some routes are public
    if (req.method === "GET" && route === "products") {
      return fetchWooCommerceProducts(null, req); // Public access
    }

    const user = await auth(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    
    console.info("API request", { method: req.method, route, action, userId: user.id });
    if (req.method === "GET" && route === "bootstrap") return json(await bootstrap(user));
    if (req.method === "GET" && route === "settings" && action === "woocommerce") return getWooCommerceSettings(user);
    if (req.method === "POST" && route === "settings" && action === "woocommerce") return saveWooCommerceSettings(user, body);
    if (req.method === "POST" && route === "products" && action === "sync") return syncWooCommerceProducts(user);
    if (req.method === "POST" && route === "products" && action === "update") return updateWooCommerceProduct(user, body);
    if (req.method === "POST" && route === "orders") return createOrder(user, body);
    if (["updateOrder", "order"].includes(action) && ["POST", "PUT", "PATCH"].includes(req.method)) {
      return updateOrder(user, body);
    }
    if (["saveDealerProfile", "dealer-profile"].includes(action) && ["POST", "PUT"].includes(req.method)) {
      return saveDealerProfile(user, body);
    }
    if (["saveStore", "stores"].includes(action) && ["POST", "PUT"].includes(req.method)) {
      return saveStore(user, body);
    }
    if (action === "createDealerAccount" && req.method === "POST") {
      return createDealerAccount(user, body);
    }
    if (req.method === "PUT" && route === "settings") return saveSettings(user, body);
    return json({ error: `找不到 API 動作：${req.method} ${route} (${action})` }, 404);
  } catch (error) {
    console.error(error);
    const message = String(error?.message || "");
    const databaseUnavailable = message.includes("Failed query")
      || message.includes("does not exist")
      || message.includes("ECONNREFUSED");
    return json({
      error: databaseUnavailable
        ? "資料庫尚未準備完成，請確認本地服務與 migration 已啟動。"
        : message || "伺服器發生錯誤，請稍後再試。"
    }, 500);
  }
}
