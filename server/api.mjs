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

function canOverrideLockedOrders(user) {
  return user.roles.includes("super_admin") || user.roles.includes("admin");
}

const orderStatuses = ["訂單成立", "已確認", "備貨中", "已出貨", "已完成", "已取消"];
const inventoryOrderStatuses = ["已出貨", "已完成"];
const transferStatuses = ["草稿", "已確認", "已調撥", "已作廢"];
const reportStatuses = ["草稿", "待審核", "已退回", "已審核", "已轉銷貨單", "已作廢"];
const shipmentStatuses = ["待產生揀貨單", "待揀貨", "揀貨中", "缺貨異常", "待包裝", "包裝中", "待出貨", "已出貨", "取消"];
const pickingStatuses = ["待揀貨", "揀貨中", "部分完成", "缺貨異常", "已完成", "取消"];

function docNo(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
}

async function bootstrap(user) {
  const dealer = await dealerFor(user);
  const content = await db.sql`SELECT value FROM app_settings WHERE key = 'content'`;
  const products = await db.sql`
    SELECT o.*, pm.item_no, pm.barcode, pm.unit, pm.supplier, pm.woo_permalink
    FROM product_overrides o
    LEFT JOIN LATERAL (
      SELECT item_no, barcode, unit, supplier, woo_permalink
      FROM product_master pm
      WHERE pm.woo_product_id=o.product_id
        OR (NULLIF(pm.item_no, '') IS NOT NULL AND NULLIF(o.sku, '') IS NOT NULL AND pm.item_no=o.sku)
        OR (NULLIF(pm.barcode, '') IS NOT NULL AND NULLIF(o.sku, '') IS NOT NULL AND pm.barcode=o.sku)
      ORDER BY
        CASE
          WHEN pm.woo_product_id=o.product_id THEN 0
          WHEN pm.item_no=o.sku THEN 1
          ELSE 2
        END,
        pm.updated_at DESC NULLS LAST
      LIMIT 1
    ) pm ON true
    ORDER BY o.product_id`;
  const dealers = isAdmin(user)
    ? await db.sql`SELECT * FROM dealers ORDER BY company_name`
    : [dealer];
  const orders = isAdmin(user)
    ? await db.sql`SELECT o.*, d.company_name FROM orders o JOIN dealers d ON d.id=o.dealer_id ORDER BY o.created_at DESC`
    : await db.sql`SELECT * FROM orders WHERE dealer_id=${dealer.id} ORDER BY created_at DESC`;
  const orderIds = orders.map(row => row.id);
  const orderItems = orderIds.length
    ? await db.sql`SELECT * FROM order_items WHERE order_id = ANY(${orderIds}::uuid[]) ORDER BY id`
    : [];
  const sales = isAdmin(user)
    ? await db.sql`SELECT s.*, d.company_name FROM sales_documents s JOIN dealers d ON d.id=s.dealer_id ORDER BY s.sales_date DESC`
    : await db.sql`SELECT * FROM sales_documents WHERE dealer_id=${dealer.id} ORDER BY sales_date DESC`;
  const salesIds = sales.map(row => row.id);
  const salesItems = salesIds.length
    ? await db.sql`SELECT * FROM sales_document_items WHERE sales_document_id = ANY(${salesIds}::uuid[]) ORDER BY id`
    : [];
  const movements = isAdmin(user)
    ? await db.sql`SELECT m.*, d.company_name FROM inventory_movements m JOIN dealers d ON d.id=m.dealer_id ORDER BY m.created_at`
    : await db.sql`SELECT * FROM inventory_movements WHERE dealer_id=${dealer.id} ORDER BY created_at`;
  const stores = isAdmin(user)
    ? await db.sql`SELECT * FROM dealer_stores ORDER BY dealer_id, is_default DESC, store_name`
    : await db.sql`SELECT * FROM dealer_stores WHERE dealer_id=${dealer.id} ORDER BY is_default DESC, store_name`;
  const transfers = isAdmin(user)
    ? await db.sql`SELECT t.*, d.company_name, d.mode, o.order_no FROM transfer_documents t JOIN dealers d ON d.id=t.dealer_id LEFT JOIN orders o ON o.id=t.order_id ORDER BY t.created_at DESC`
    : await db.sql`SELECT t.*, o.order_no FROM transfer_documents t LEFT JOIN orders o ON o.id=t.order_id WHERE t.dealer_id=${dealer.id} ORDER BY t.created_at DESC`;
  const transferIds = transfers.map(row => row.id);
  const transferItems = transferIds.length
    ? await db.sql`SELECT * FROM transfer_document_items WHERE transfer_document_id = ANY(${transferIds}::uuid[]) ORDER BY id`
    : [];
  const warehouseMovements = isAdmin(user)
    ? await db.sql`SELECT w.*, d.company_name FROM warehouse_movements w LEFT JOIN dealers d ON d.id=w.dealer_id ORDER BY w.created_at DESC`
    : [];
  const reports = isAdmin(user)
    ? await db.sql`SELECT r.*, d.company_name, s.sales_no FROM consignment_sales_reports r JOIN dealers d ON d.id=r.dealer_id LEFT JOIN sales_documents s ON s.id=r.sales_document_id ORDER BY r.created_at DESC`
    : await db.sql`SELECT r.*, s.sales_no FROM consignment_sales_reports r LEFT JOIN sales_documents s ON s.id=r.sales_document_id WHERE r.dealer_id=${dealer.id} ORDER BY r.created_at DESC`;
  const reportIds = reports.map(row => row.id);
  const reportItems = reportIds.length
    ? await db.sql`SELECT * FROM consignment_sales_report_items WHERE report_id = ANY(${reportIds}::uuid[]) ORDER BY id`
    : [];
  const reportAttachments = reportIds.length
    ? await db.sql`SELECT * FROM consignment_sales_report_attachments WHERE report_id = ANY(${reportIds}::uuid[]) ORDER BY created_at`
    : [];
  const reportLogs = reportIds.length
    ? await db.sql`SELECT * FROM consignment_sales_report_logs WHERE report_id = ANY(${reportIds}::uuid[]) ORDER BY created_at`
    : [];
  return {
    user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
    admin: isAdmin(user),
    dealer,
    content: content[0]?.value || {},
    productOverrides: products,
    dealers,
    stores,
    orders: orders.map(o => ({ ...o, items: orderItems.filter(i => i.order_id === o.id) })),
    transfers: transfers.map(t => ({ ...t, items: transferItems.filter(i => i.transfer_document_id === t.id) })),
    warehouseMovements,
    consignmentSalesReports: reports.map(r => ({
      ...r,
      items: reportItems.filter(i => i.report_id === r.id),
      attachments: reportAttachments.filter(a => a.report_id === r.id),
      logs: reportLogs.filter(log => log.report_id === r.id)
    })),
    sales: sales.map(s => ({ ...s, items: salesItems.filter(i => i.sales_document_id === s.id) })),
    movements
  };
}

const productMasterFields = [
  "item_no", "name", "unit", "category", "retail_price", "sale_price", "standard_cost",
  "safety_stock", "stock_quantity", "barcode", "unit_weight", "supplier", "description",
  "storage_location", "woo_product_id", "woo_sku", "woo_permalink", "dealer_visible", "active", "source"
];

function toNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMasterProduct(row = {}, source = "manual") {
  const itemNo = String(row.item_no ?? row.itemNo ?? row["品號"] ?? row.sku ?? "").trim();
  const name = String(row.name ?? row["品名"] ?? "").trim();
  return {
    item_no: itemNo,
    name,
    unit: String(row.unit ?? row["單位"] ?? "").trim(),
    category: String(row.category ?? row["商品分類"] ?? "").trim(),
    retail_price: toNumber(row.retail_price ?? row.retailPrice ?? row["零售價"]),
    sale_price: toNumber(row.sale_price ?? row.salePrice ?? row["優惠價"]),
    standard_cost: toNumber(row.standard_cost ?? row.standardCost ?? row["標準進價"]),
    safety_stock: Math.round(toNumber(row.safety_stock ?? row.safetyStock ?? row["安全存量"])),
    stock_quantity: Math.round(toNumber(row.stock_quantity ?? row.stockQuantity ?? row["庫存量"])),
    barcode: String(row.barcode ?? row["條碼編號"] ?? "").trim(),
    unit_weight: toNumber(row.unit_weight ?? row.unitWeight ?? row["單位淨重"]),
    supplier: String(row.supplier ?? row["主供應商"] ?? "").trim(),
    description: String(row.description ?? row["商品描述"] ?? "").trim(),
    storage_location: String(row.storage_location ?? row.storageLocation ?? row["儲位"] ?? "").trim(),
    woo_product_id: row.woo_product_id || row.wooProductId ? Number(row.woo_product_id ?? row.wooProductId) : null,
    woo_sku: String(row.woo_sku ?? row.wooSku ?? "").trim(),
    woo_permalink: String(row.woo_permalink ?? row.wooPermalink ?? "").trim(),
    dealer_visible: Boolean(row.dealer_visible ?? row.dealerVisible ?? false),
    active: row.active === undefined ? true : Boolean(row.active),
    source
  };
}

async function syncMasterWooLinks() {
  const wooRows = await db.sql`SELECT product_id, sku, payload FROM woocommerce_product_cache`;
  let linked = 0;
  for (const woo of wooRows) {
    const sku = String(woo.sku || woo.payload?.sku || "").trim();
    if (!sku) continue;
    const updated = await db.sql`
      UPDATE product_master SET woo_product_id=${Number(woo.product_id)}, woo_sku=${sku},
        woo_permalink=${woo.payload?.permalink || ''}, updated_at=now()
      WHERE item_no=${sku} OR barcode=${sku} OR woo_sku=${sku}
      RETURNING id`;
    linked += updated.length;
  }
  return { wooCount: wooRows.length, linked };
}

async function showSyncedWooProducts(user) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  await syncMasterWooLinks();
  const linkedRows = await db.sql`
    UPDATE product_master SET dealer_visible=true, active=true, updated_at=now()
    WHERE woo_product_id IN (SELECT product_id FROM woocommerce_product_cache)
    RETURNING id`;
  const wooRows = await db.sql`SELECT product_id, sku, name, payload FROM woocommerce_product_cache`;
  for (const row of wooRows) {
    const payload = row.payload || {};
    const price = Number(payload.price || payload.regular_price || 0) || null;
    const image = Array.isArray(payload.images) ? payload.images[0]?.src : null;
    const category = Array.isArray(payload.categories)
      ? payload.categories.find(c => c.name !== "All")?.name?.replace(/[▾▸]/g, "").trim()
      : null;
    await db.sql`
      INSERT INTO product_overrides
        (product_id, sku, name, category, price, image_url, badges, visible, updated_at)
      VALUES (${Number(row.product_id)}, ${row.sku || ''}, ${row.name || stripHtml(String(payload.name || ''))},
        ${category || null}, ${price}, ${image || null}, '[]'::jsonb, true, now())
      ON CONFLICT (product_id) DO UPDATE SET visible=true, updated_at=now()`;
  }
  return json({ ok: true, visibleCount: wooRows.length, linkedVisibleCount: linkedRows.length });
}

async function wooMasterDiff() {
  const rows = await db.sql`
    SELECT c.product_id, c.sku, c.name, c.payload,
      pm.id AS master_id, pm.item_no, pm.name AS master_name, pm.stock_quantity, pm.safety_stock,
      (pm.stock_quantity + COALESCE(SUM(wm.quantity), 0))::integer AS current_stock
    FROM woocommerce_product_cache c
    LEFT JOIN LATERAL (
      SELECT *
      FROM product_master pm
      WHERE pm.woo_product_id=c.product_id
        OR (NULLIF(pm.item_no, '') IS NOT NULL AND NULLIF(c.sku, '') IS NOT NULL AND pm.item_no=c.sku)
        OR (NULLIF(pm.barcode, '') IS NOT NULL AND NULLIF(c.sku, '') IS NOT NULL AND pm.barcode=c.sku)
        OR (NULLIF(pm.woo_sku, '') IS NOT NULL AND NULLIF(c.sku, '') IS NOT NULL AND pm.woo_sku=c.sku)
      ORDER BY
        CASE
          WHEN pm.woo_product_id=c.product_id THEN 0
          WHEN pm.item_no=c.sku THEN 1
          WHEN pm.barcode=c.sku THEN 2
          ELSE 3
        END,
        pm.updated_at DESC NULLS LAST
      LIMIT 1
    ) pm ON true
    LEFT JOIN warehouse_movements wm
      ON wm.product_master_id=pm.id
      OR (pm.woo_product_id IS NOT NULL AND wm.product_id=pm.woo_product_id)
    GROUP BY c.product_id, c.sku, c.name, c.payload, pm.id, pm.item_no, pm.name, pm.stock_quantity, pm.safety_stock
    ORDER BY c.product_id`;
  const missing = rows.filter(row => !row.master_id).map(row => ({
    productId: Number(row.product_id),
    sku: row.sku || row.payload?.sku || String(row.product_id),
    name: row.name || stripHtml(String(row.payload?.name || "")),
    price: Number(row.payload?.price || row.payload?.regular_price || 0) || 0,
    wooStock: row.payload?.stock_quantity ?? null,
    stockStatus: row.payload?.stock_status || "",
    permalink: row.payload?.permalink || ""
  }));
  const stockMismatches = rows.filter(row => row.master_id && row.payload?.stock_quantity !== null && row.payload?.stock_quantity !== undefined
    && Number(row.payload.stock_quantity) !== Number(row.current_stock || 0)).map(row => ({
      productId: Number(row.product_id),
      sku: row.sku || row.payload?.sku || String(row.product_id),
      name: row.master_name || row.name || stripHtml(String(row.payload?.name || "")),
      masterId: row.master_id,
      warehouseStock: Number(row.current_stock || 0),
      wooStock: Number(row.payload.stock_quantity || 0),
      difference: Number(row.current_stock || 0) - Number(row.payload.stock_quantity || 0)
    }));
  return {
    wooCount: rows.length,
    matchedCount: rows.filter(row => row.master_id).length,
    missing,
    stockMismatches
  };
}

async function createMasterProductsFromWoo(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const productIds = (Array.isArray(body.productIds) ? body.productIds : []).map(Number).filter(Number.isFinite);
  if (!productIds.length) return json({ error: "請至少選擇一個官網商品" }, 400);
  const rows = await db.sql`
    SELECT product_id, sku, name, payload
    FROM woocommerce_product_cache
    WHERE product_id = ANY(${productIds}::bigint[])
    ORDER BY product_id`;
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const sku = String(row.sku || row.payload?.sku || row.product_id).trim();
    const payload = row.payload || {};
    const category = Array.isArray(payload.categories)
      ? payload.categories.find(c => c.name !== "All")?.name?.replace(/[▾▸]/g, "").trim() || ""
      : "";
    const retailPrice = toNumber(payload.regular_price || payload.price || 0);
    const salePrice = toNumber(payload.sale_price || 0);
    const existing = await db.sql`
      SELECT id FROM product_master
      WHERE woo_product_id=${Number(row.product_id)}
        OR item_no=${sku}
        OR (NULLIF(barcode, '') IS NOT NULL AND barcode=${sku})
        OR (NULLIF(woo_sku, '') IS NOT NULL AND woo_sku=${sku})
      LIMIT 1`;
    if (existing.length) {
      skipped += 1;
      continue;
    }
    await db.sql`
      INSERT INTO product_master
        (item_no, name, unit, category, retail_price, sale_price, stock_quantity, safety_stock,
          barcode, supplier, description, woo_product_id, woo_sku, woo_permalink,
          dealer_visible, active, source, storage_location, updated_at)
      VALUES (${sku}, ${row.name || stripHtml(String(payload.name || ""))}, ${""}, ${category},
        ${retailPrice}, ${salePrice}, 0, ${Math.max(0, Number(payload.low_stock_amount || 0) || 0)},
        ${sku}, ${""}, ${stripHtml(String(payload.short_description || payload.description || ""))},
        ${Number(row.product_id)}, ${sku}, ${payload.permalink || ""},
        false, true, 'woocommerce', ${""}, now())`;
    created += 1;
  }
  await syncMasterWooLinks();
  return json({ ok: true, created, skipped, ...(await wooMasterDiff()) });
}

async function listMasterProducts(user) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const rows = await db.sql`SELECT * FROM product_master ORDER BY item_no`;
  return json({ ok: true, products: rows });
}

async function saveMasterProducts(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const rows = Array.isArray(body.products) ? body.products : [];
  if (!rows.length) return json({ error: "沒有可儲存的商品資料" }, 400);
  let saved = 0;
  for (const input of rows) {
    const product = normalizeMasterProduct(input, input.source || "manual");
    if (!product.item_no || !product.name) continue;
    await db.sql`
      INSERT INTO product_master
        (item_no, name, unit, category, retail_price, sale_price, standard_cost, safety_stock,
          stock_quantity, barcode, unit_weight, supplier, description, woo_product_id, woo_sku,
          woo_permalink, dealer_visible, active, source, storage_location, updated_at)
      VALUES (${product.item_no}, ${product.name}, ${product.unit}, ${product.category},
        ${product.retail_price}, ${product.sale_price}, ${product.standard_cost}, ${product.safety_stock},
        ${product.stock_quantity}, ${product.barcode}, ${product.unit_weight}, ${product.supplier},
        ${product.description}, ${product.woo_product_id}, ${product.woo_sku}, ${product.woo_permalink},
        ${product.dealer_visible}, ${product.active}, ${product.source}, ${product.storage_location}, now())
      ON CONFLICT (item_no) DO UPDATE SET name=EXCLUDED.name, unit=EXCLUDED.unit,
        category=EXCLUDED.category, retail_price=EXCLUDED.retail_price, sale_price=EXCLUDED.sale_price,
        standard_cost=EXCLUDED.standard_cost, safety_stock=EXCLUDED.safety_stock,
        stock_quantity=EXCLUDED.stock_quantity, barcode=EXCLUDED.barcode,
        unit_weight=EXCLUDED.unit_weight, supplier=EXCLUDED.supplier, description=EXCLUDED.description,
        woo_product_id=COALESCE(EXCLUDED.woo_product_id, product_master.woo_product_id),
        woo_sku=COALESCE(NULLIF(EXCLUDED.woo_sku, ''), product_master.woo_sku),
        woo_permalink=COALESCE(NULLIF(EXCLUDED.woo_permalink, ''), product_master.woo_permalink),
        dealer_visible=EXCLUDED.dealer_visible, active=EXCLUDED.active,
        source=EXCLUDED.source, storage_location=EXCLUDED.storage_location, updated_at=now()`;
    saved += 1;
  }
  if (body.fileName) {
    await db.sql`
      INSERT INTO product_master_imports (file_name, row_count, created_by)
      VALUES (${String(body.fileName)}, ${saved}, ${user.email})`;
  }
  const sync = await syncMasterWooLinks();
  return json({ ok: true, saved, ...sync });
}

async function productMasterAction(user, body) {
  if (body.action === "syncWoo") {
    if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
    return json({ ok: true, ...(await syncMasterWooLinks()) });
  }
  if (body.action === "compareWooMaster") {
    if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
    return json({ ok: true, ...(await wooMasterDiff()) });
  }
  if (body.action === "createFromWoo") return createMasterProductsFromWoo(user, body);
  if (body.action === "showSyncedWooProducts") return showSyncedWooProducts(user);
  return saveMasterProducts(user, body);
}

async function listWarehouseInventory(user) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const products = await db.sql`
    SELECT pm.*,
      COALESCE(SUM(wm.quantity), 0)::integer AS movement_quantity,
      (pm.stock_quantity + COALESCE(SUM(wm.quantity), 0))::integer AS current_stock,
      COUNT(wm.id)::integer AS movement_count,
      MAX(wm.created_at) AS last_movement_at
    FROM product_master pm
    LEFT JOIN warehouse_movements wm
      ON wm.product_master_id = pm.id
      OR (pm.woo_product_id IS NOT NULL AND wm.product_id = pm.woo_product_id)
    GROUP BY pm.id
    ORDER BY pm.item_no`;
  const movements = await db.sql`
    SELECT wm.*, pm.item_no, pm.name AS product_name, pm.barcode, pm.storage_location
    FROM warehouse_movements wm
    LEFT JOIN product_master pm
      ON wm.product_master_id = pm.id
      OR (pm.woo_product_id IS NOT NULL AND wm.product_id = pm.woo_product_id)
    ORDER BY wm.created_at DESC
    LIMIT 300`;
  const stockCounts = await db.sql`
    SELECT c.*,
      COUNT(i.id)::integer AS item_count,
      COALESCE(SUM(ABS(i.difference)), 0)::integer AS total_difference
    FROM warehouse_stock_counts c
    LEFT JOIN warehouse_stock_count_items i ON i.stock_count_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 80`;
  return json({ ok: true, products, movements, stockCounts });
}

async function warehouseProductStock(productMasterId) {
  const rows = await db.sql`
    SELECT pm.*,
      COALESCE(SUM(wm.quantity), 0)::integer AS movement_quantity,
      (pm.stock_quantity + COALESCE(SUM(wm.quantity), 0))::integer AS current_stock
    FROM product_master pm
    LEFT JOIN warehouse_movements wm
      ON wm.product_master_id = pm.id
      OR (pm.woo_product_id IS NOT NULL AND wm.product_id = pm.woo_product_id)
    WHERE pm.id=${productMasterId}
    GROUP BY pm.id`;
  return rows[0] || null;
}

async function warehouseInventoryAction(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const action = body.action || "movement";
  if (!["movement", "stockCount"].includes(action)) return json({ error: "不支援的總倉庫存動作" }, 400);
  const productMasterId = body.productMasterId || body.product_master_id;
  if (!productMasterId) return json({ error: "請選擇商品" }, 400);
  const product = await warehouseProductStock(productMasterId);
  if (!product) return json({ error: "找不到商品主檔" }, 404);

  const movementType = String(body.movementType || body.type || (action === "stockCount" ? "盤點修正" : "")).trim();
  const allowedTypes = ["補貨入庫", "領料出庫", "盤點修正"];
  if (!allowedTypes.includes(movementType)) return json({ error: "請選擇正確的異動類型" }, 400);

  const before = Number(product.current_stock || 0);
  const rawQty = Math.floor(Math.abs(Number(body.quantity || 0)));
  const actualQuantity = Math.floor(Number(body.actualQuantity ?? body.actual_quantity ?? before));
  let delta = 0;
  if (movementType === "盤點修正") {
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0) return json({ error: "盤點實際庫存不可小於 0" }, 400);
    delta = actualQuantity - before;
  } else {
    if (!Number.isFinite(rawQty) || rawQty <= 0) return json({ error: "異動數量必須大於 0" }, 400);
    delta = movementType === "補貨入庫" ? rawQty : -rawQty;
  }
  if (delta === 0) return json({ error: "異動數量為 0，無需建立紀錄" }, 400);
  if (before + delta < 0) return json({ error: `總倉庫存不足，目前只有 ${before} 件` }, 400);

  const after = before + delta;
  const warehouseName = String(body.warehouseName || body.warehouse_name || "東瑭主倉").trim() || "東瑭主倉";
  const note = String(body.note || "").trim();
  const reason = String(body.reason || movementType).trim();
  const sourceType = action === "stockCount" ? "stock_count" : "manual";
  let sourceId = String(body.sourceId || "").trim();
  let stockCount = null;

  if (action === "stockCount") {
    const countNo = `SC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
    const counts = await db.sql`
      INSERT INTO warehouse_stock_counts (count_no, warehouse_name, status, note, operator_email)
      VALUES (${countNo}, ${warehouseName}, '已確認', ${note}, ${user.email})
      RETURNING *`;
    stockCount = counts[0];
    sourceId = stockCount.count_no;
    await db.sql`
      INSERT INTO warehouse_stock_count_items
        (stock_count_id, product_master_id, product_id, item_no, product_name, book_quantity, actual_quantity, difference, note)
      VALUES (${stockCount.id}, ${product.id}, ${product.woo_product_id}, ${product.item_no}, ${product.name},
        ${before}, ${after}, ${delta}, ${note})`;
  } else if (!sourceId) {
    sourceId = `WH-${Date.now()}`;
  }

  const idempotencyKey = `${sourceType}:${sourceId}:${product.id}:${delta}:${Date.now()}`;
  const rows = await db.sql`
    INSERT INTO warehouse_movements
      (warehouse_name, dealer_id, product_id, product_master_id, movement_type, quantity,
        source_type, source_id, idempotency_key, operator_email, note, movement_before, movement_after, reason)
    VALUES (${warehouseName}, NULL, ${product.woo_product_id}, ${product.id}, ${movementType}, ${delta},
      ${sourceType}, ${sourceId}, ${idempotencyKey}, ${user.email}, ${note}, ${before}, ${after}, ${reason})
    RETURNING *`;
  return json({ ok: true, movement: rows[0], product: await warehouseProductStock(product.id), stockCount });
}

async function ensureWarehouseLocation(locationCode, productMasterId = null) {
  const code = String(locationCode || "").trim();
  if (!code) return null;
  const rows = await db.sql`
    INSERT INTO warehouse_locations
      (location_code, qr_code_value, product_master_id, updated_at)
    VALUES (${code}, ${`LOCATION:${code}`}, ${productMasterId || null}, now())
    ON CONFLICT (location_code) DO UPDATE SET
      product_master_id=COALESCE(warehouse_locations.product_master_id, EXCLUDED.product_master_id),
      qr_code_value=EXCLUDED.qr_code_value,
      updated_at=now()
    RETURNING *`;
  return rows[0];
}

async function shipmentBundle(shipmentId) {
  const rows = await db.sql`
    SELECT s.*, d.company_name
    FROM shipment_orders s
    LEFT JOIN dealers d ON d.id=s.dealer_id
    WHERE s.id=${shipmentId}`;
  if (!rows.length) return null;
  const items = await db.sql`SELECT * FROM shipment_items WHERE shipment_id=${shipmentId} ORDER BY id`;
  const pickings = await db.sql`SELECT * FROM picking_orders WHERE shipment_id=${shipmentId} ORDER BY created_at DESC`;
  const pickingIds = pickings.map(row => row.id);
  const pickingItems = pickingIds.length
    ? await db.sql`SELECT * FROM picking_order_items WHERE picking_order_id = ANY(${pickingIds}::uuid[]) ORDER BY id`
    : [];
  return { ...rows[0], items, pickings: pickings.map(row => ({ ...row, items: pickingItems.filter(item => item.picking_order_id === row.id) })) };
}

async function listShipments(user) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const shipments = await db.sql`
    SELECT s.*, d.company_name, sd.sales_no
    FROM shipment_orders s
    LEFT JOIN dealers d ON d.id=s.dealer_id
    LEFT JOIN sales_documents sd ON sd.id=s.source_sales_document_id
    ORDER BY s.created_at DESC
    LIMIT 200`;
  const shipmentIds = shipments.map(row => row.id);
  const shipmentItems = shipmentIds.length
    ? await db.sql`SELECT * FROM shipment_items WHERE shipment_id = ANY(${shipmentIds}::uuid[]) ORDER BY id`
    : [];
  const pickings = shipmentIds.length
    ? await db.sql`SELECT * FROM picking_orders WHERE shipment_id = ANY(${shipmentIds}::uuid[]) ORDER BY created_at DESC`
    : [];
  const pickingIds = pickings.map(row => row.id);
  const pickingItems = pickingIds.length
    ? await db.sql`SELECT * FROM picking_order_items WHERE picking_order_id = ANY(${pickingIds}::uuid[]) ORDER BY id`
    : [];
  const exceptions = await db.sql`
    SELECT e.*, s.shipment_no, p.picking_no
    FROM shipment_exceptions e
    LEFT JOIN shipment_orders s ON s.id=e.shipment_id
    LEFT JOIN picking_orders p ON p.id=e.picking_order_id
    ORDER BY e.created_at DESC
    LIMIT 200`;
  const locations = await db.sql`
    SELECT l.*, pm.item_no, pm.name AS product_name
    FROM warehouse_locations l
    LEFT JOIN product_master pm ON pm.id=l.product_master_id
    ORDER BY l.location_code
    LIMIT 500`;
  const pendingSales = await db.sql`
    SELECT s.*, d.company_name,
      COUNT(i.id)::integer AS item_count,
      COALESCE(SUM(i.quantity * i.unit_price), 0)::integer AS estimated_total
    FROM sales_documents s
    JOIN dealers d ON d.id=s.dealer_id
    LEFT JOIN sales_document_items i ON i.sales_document_id=s.id
    LEFT JOIN shipment_orders sh ON sh.source_sales_document_id=s.id AND sh.status <> '取消'
    WHERE sh.id IS NULL AND s.status <> '已作廢'
    GROUP BY s.id, d.company_name
    ORDER BY s.sales_date DESC
    LIMIT 100`;
  return json({
    ok: true,
    pendingSales,
    shipments: shipments.map(row => ({
      ...row,
      items: shipmentItems.filter(item => item.shipment_id === row.id),
      pickings: pickings
        .filter(picking => picking.shipment_id === row.id)
        .map(picking => ({ ...picking, items: pickingItems.filter(item => item.picking_order_id === picking.id) }))
    })),
    exceptions,
    locations
  });
}

async function findMasterForSalesItem(item) {
  const rows = await db.sql`
    SELECT pm.*,
      (pm.stock_quantity + COALESCE(SUM(wm.quantity), 0))::integer AS current_stock
    FROM product_master pm
    LEFT JOIN warehouse_movements wm
      ON wm.product_master_id=pm.id
      OR (pm.woo_product_id IS NOT NULL AND wm.product_id=pm.woo_product_id)
    WHERE pm.woo_product_id=${Number(item.product_id)}
      OR (NULLIF(pm.item_no, '') IS NOT NULL AND pm.item_no=${item.sku})
      OR (NULLIF(pm.barcode, '') IS NOT NULL AND pm.barcode=${item.sku})
      OR (NULLIF(pm.woo_sku, '') IS NOT NULL AND pm.woo_sku=${item.sku})
    GROUP BY pm.id
    ORDER BY
      CASE
        WHEN pm.woo_product_id=${Number(item.product_id)} THEN 0
        WHEN pm.item_no=${item.sku} THEN 1
        WHEN pm.barcode=${item.sku} THEN 2
        ELSE 3
      END,
      pm.updated_at DESC
    LIMIT 1`;
  return rows[0] || null;
}

async function createShipmentFromSales(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const salesDocumentId = body.salesDocumentId || body.salesId || body.id;
  if (!salesDocumentId) return json({ error: "請選擇銷貨單" }, 400);
  const salesRows = await db.sql`
    SELECT s.*, d.company_name, d.tax_id, d.contact_name, d.phone, d.billing_email
    FROM sales_documents s
    JOIN dealers d ON d.id=s.dealer_id
    WHERE s.id::text=${String(salesDocumentId)} OR s.sales_no=${String(salesDocumentId)}`;
  if (!salesRows.length) return json({ error: "找不到銷貨單" }, 404);
  const sales = salesRows[0];
  const existing = await db.sql`
    SELECT id FROM shipment_orders
    WHERE source_sales_document_id=${sales.id} AND status <> '取消'
    ORDER BY created_at DESC
    LIMIT 1`;
  if (existing.length) return json({ ok: true, shipment: await shipmentBundle(existing[0].id), existed: true });

  const salesItems = await db.sql`SELECT * FROM sales_document_items WHERE sales_document_id=${sales.id} ORDER BY id`;
  if (!salesItems.length) return json({ error: "銷貨單沒有商品明細" }, 400);
  const shipmentNo = docNo("SH");
  const snapshot = {
    companyName: sales.company_name,
    taxId: sales.tax_id || "",
    contactName: sales.contact_name || "",
    phone: sales.phone || "",
    email: sales.billing_email || "",
    salesNo: sales.sales_no,
    salesDate: sales.sales_date
  };
  const created = await db.sql`
    INSERT INTO shipment_orders
      (shipment_no, source_sales_document_id, dealer_id, customer_name, customer_snapshot, note, created_by)
    VALUES (${shipmentNo}, ${sales.id}, ${sales.dealer_id}, ${sales.company_name},
      ${JSON.stringify(snapshot)}::jsonb, ${String(body.note || "")}, ${user.email})
    RETURNING *`;
  const shipment = created[0];

  for (const item of salesItems) {
    const master = await findMasterForSalesItem(item);
    const location = master?.storage_location ? await ensureWarehouseLocation(master.storage_location, master.id) : null;
    const currentStock = Number(master?.current_stock || 0);
    const shortageQty = Math.max(0, Number(item.quantity) - currentStock);
    const status = shortageQty > 0 ? "缺貨" : "待揀貨";
    const insertedItems = await db.sql`
      INSERT INTO shipment_items
        (shipment_id, sales_document_item_id, product_master_id, product_id, item_code, barcode,
          item_name, unit, required_qty, shortage_qty, location_id, location_code, status,
          note)
      VALUES (${shipment.id}, ${item.id}, ${master?.id || null}, ${Number(item.product_id)},
        ${master?.item_no || item.sku || String(item.product_id)}, ${master?.barcode || item.sku || ""},
        ${item.product_name}, ${master?.unit || "pcs"}, ${Number(item.quantity)}, ${shortageQty},
        ${location?.id || null}, ${location?.location_code || master?.storage_location || ""},
        ${status}, ${master ? "" : "尚未對應總倉商品主檔"})
      RETURNING *`;
    if (!master || shortageQty > 0 || !location) {
      await db.sql`
        INSERT INTO shipment_exceptions
          (shipment_id, shipment_item_id, product_master_id, product_id, item_code, item_name,
            exception_type, required_qty, available_qty, shortage_qty, note, operator_email)
        VALUES (${shipment.id}, ${insertedItems[0].id}, ${master?.id || null}, ${Number(item.product_id)},
          ${master?.item_no || item.sku || String(item.product_id)}, ${item.product_name},
          ${!master ? "未對應商品" : !location ? "未設定儲位" : "缺貨"},
          ${Number(item.quantity)}, ${currentStock}, ${!master ? Number(item.quantity) : shortageQty},
          ${!master ? "請先在總倉庫存建立或對應商品主檔" : !location ? "請先設定商品儲位 QR" : "總倉庫存不足"},
          ${user.email})`;
    }
  }
  const hasException = await db.sql`SELECT id FROM shipment_exceptions WHERE shipment_id=${shipment.id} AND status='未處理' LIMIT 1`;
  if (hasException.length) {
    await db.sql`UPDATE shipment_orders SET status='缺貨異常', updated_at=now() WHERE id=${shipment.id}`;
  }
  return json({ ok: true, shipment: await shipmentBundle(shipment.id), existed: false });
}

async function createPickingOrder(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const shipmentId = body.shipmentId || body.id;
  if (!shipmentId) return json({ error: "請選擇出貨單" }, 400);
  const rows = await db.sql`SELECT * FROM shipment_orders WHERE id::text=${String(shipmentId)} OR shipment_no=${String(shipmentId)}`;
  if (!rows.length) return json({ error: "找不到出貨單" }, 404);
  const shipment = rows[0];
  if (shipment.status === "取消") return json({ error: "已取消的出貨單不可產生揀貨單" }, 400);
  const existing = await db.sql`
    SELECT id FROM picking_orders
    WHERE shipment_id=${shipment.id} AND status <> '取消'
    ORDER BY created_at DESC
    LIMIT 1`;
  if (existing.length) return json({ ok: true, shipment: await shipmentBundle(shipment.id), existed: true });

  const items = await db.sql`SELECT * FROM shipment_items WHERE shipment_id=${shipment.id} ORDER BY id`;
  if (!items.length) return json({ error: "出貨單沒有商品明細" }, 400);
  const blocking = items.filter(item => item.status === "缺貨" || !item.product_master_id || !item.location_code);
  if (blocking.length) return json({ error: "此出貨單仍有缺貨、未對應商品或未設定儲位，請先處理異常" }, 400);
  const pickingNo = docNo("PK");
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const publicUrl = `${String(body.origin || "").replace(/\/$/, "") || ""}/#picking/${pickingNo}?token=${token}`;
  const created = await db.sql`
    INSERT INTO picking_orders
      (picking_no, shipment_id, source_sales_document_id, qr_code_value, access_token, picker_email, created_by)
    VALUES (${pickingNo}, ${shipment.id}, ${shipment.source_sales_document_id},
      ${publicUrl || `PICKING:${pickingNo}`}, ${token}, ${String(body.pickerEmail || "")}, ${user.email})
    RETURNING *`;
  const picking = created[0];
  for (const item of items) {
    await db.sql`
      INSERT INTO picking_order_items
        (picking_order_id, shipment_item_id, product_master_id, product_id, item_code, barcode,
          item_name, unit, required_qty, location_id, location_code)
      VALUES (${picking.id}, ${item.id}, ${item.product_master_id}, ${item.product_id}, ${item.item_code},
        ${item.barcode}, ${item.item_name}, ${item.unit}, ${item.required_qty}, ${item.location_id}, ${item.location_code})`;
  }
  await db.sql`
    UPDATE shipment_orders SET status='待揀貨', picker_email=${String(body.pickerEmail || "")}, updated_at=now()
    WHERE id=${shipment.id}`;
  return json({ ok: true, shipment: await shipmentBundle(shipment.id), existed: false });
}

function normalizeLocationScan(value) {
  return String(value || "").trim().replace(/^LOCATION:/i, "").replace(/^\/location\//i, "");
}

async function refreshPickingStatus(pickingId) {
  const items = await db.sql`SELECT * FROM picking_order_items WHERE picking_order_id=${pickingId}`;
  const pickingRows = await db.sql`SELECT * FROM picking_orders WHERE id=${pickingId}`;
  if (!pickingRows.length) return null;
  const picking = pickingRows[0];
  const total = items.length;
  const done = items.filter(item => item.status === "已揀貨").length;
  const shortage = items.some(item => item.status === "缺貨");
  const pickedAny = items.some(item => Number(item.picked_qty) > 0);
  const nextPickingStatus = shortage ? "缺貨異常" : done === total ? "已完成" : pickedAny ? "部分完成" : "揀貨中";
  const nextShipmentStatus = shortage ? "缺貨異常" : done === total ? "待包裝" : "揀貨中";
  await db.sql`
    UPDATE picking_orders SET status=${nextPickingStatus},
      started_at=CASE WHEN started_at IS NULL AND ${pickedAny} THEN now() ELSE started_at END,
      completed_at=CASE WHEN ${nextPickingStatus}='已完成' AND completed_at IS NULL THEN now() ELSE completed_at END,
      updated_at=now()
    WHERE id=${picking.id}`;
  await db.sql`
    UPDATE shipment_orders SET status=${nextShipmentStatus},
      picked_at=CASE WHEN ${nextShipmentStatus}='待包裝' AND picked_at IS NULL THEN now() ELSE picked_at END,
      updated_at=now()
    WHERE id=${picking.shipment_id}`;
  return nextPickingStatus;
}

async function pickShipmentItem(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const itemId = body.pickingItemId || body.itemId;
  if (!itemId) return json({ error: "請選擇揀貨品項" }, 400);
  const rows = await db.sql`
    SELECT pi.*, po.picking_no, po.status AS picking_status, po.shipment_id, so.shipment_no, so.source_warehouse
    FROM picking_order_items pi
    JOIN picking_orders po ON po.id=pi.picking_order_id
    JOIN shipment_orders so ON so.id=po.shipment_id
    WHERE pi.id=${itemId}`;
  if (!rows.length) return json({ error: "找不到揀貨品項" }, 404);
  const item = rows[0];
  if (!["待揀貨", "揀貨中", "部分完成"].includes(item.picking_status)) return json({ error: "此揀貨單目前不可揀貨" }, 400);
  if (item.inventory_applied_at) return json({ error: "此品項已完成扣庫存，避免重複扣庫存" }, 400);
  const scannedLocation = normalizeLocationScan(body.locationScan || body.scannedLocation);
  if (!scannedLocation || scannedLocation !== item.location_code) {
    return json({ error: `儲位 QR 不正確，應掃描 ${item.location_code}` }, 400);
  }
  const qty = Math.floor(Number(body.quantity || body.pickedQty || item.required_qty));
  if (!Number.isFinite(qty) || qty <= 0) return json({ error: "實際揀貨數量必須大於 0" }, 400);
  if (qty > Number(item.required_qty)) return json({ error: "實際揀貨數量不可大於需求數量" }, 400);
  const product = await warehouseProductStock(item.product_master_id);
  if (!product) return json({ error: "找不到總倉商品主檔" }, 404);
  const before = Number(product.current_stock || 0);
  if (qty > before) return json({ error: `總倉庫存不足，目前只有 ${before} 件` }, 400);
  const after = before - qty;
  await db.sql`
    INSERT INTO warehouse_movements
      (warehouse_name, dealer_id, product_id, product_master_id, movement_type, quantity,
        source_type, source_id, idempotency_key, operator_email, note, movement_before, movement_after, reason)
    VALUES (${item.source_warehouse || "東瑭主倉"}, NULL, ${item.product_id}, ${item.product_master_id},
      '揀貨出庫', ${-qty}, 'picking_order', ${item.picking_no},
      ${`picking:${item.picking_order_id}:${item.id}:warehouse-out`}, ${user.email},
      ${`出貨單 ${item.shipment_no}，儲位 ${item.location_code}`}, ${before}, ${after}, '出貨揀貨扣庫存')
    ON CONFLICT (idempotency_key) DO NOTHING`;
  await db.sql`
    UPDATE picking_order_items SET picked_qty=${qty}, scanned_location=${body.locationScan || item.location_code},
      status='已揀貨', picked_by=${user.email}, picked_at=now(), inventory_applied_at=now(), updated_at=now()
    WHERE id=${item.id}`;
  await db.sql`
    UPDATE shipment_items SET picked_qty=${qty}, status='已揀貨', updated_at=now()
    WHERE id=${item.shipment_item_id}`;
  await refreshPickingStatus(item.picking_order_id);
  return json({ ok: true, shipment: await shipmentBundle(item.shipment_id) });
}

async function markShipmentShortage(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const itemId = body.pickingItemId || body.shipmentItemId || body.itemId;
  const rows = await db.sql`
    SELECT si.*, so.id AS shipment_id, so.shipment_no, po.id AS picking_order_id, po.picking_no
    FROM shipment_items si
    JOIN shipment_orders so ON so.id=si.shipment_id
    LEFT JOIN picking_order_items pi ON pi.shipment_item_id=si.id
    LEFT JOIN picking_orders po ON po.id=pi.picking_order_id
    WHERE si.id=${itemId} OR pi.id=${itemId}
    LIMIT 1`;
  if (!rows.length) return json({ error: "找不到品項" }, 404);
  const item = rows[0];
  const shortageQty = Math.max(1, Math.floor(Number(body.shortageQty || item.required_qty - item.picked_qty || 1)));
  const product = item.product_master_id ? await warehouseProductStock(item.product_master_id) : null;
  await db.sql`
    UPDATE shipment_items SET status='缺貨', shortage_qty=${shortageQty}, note=${String(body.note || "缺貨異常")},
      updated_at=now()
    WHERE id=${item.id}`;
  if (item.picking_order_id) {
    await db.sql`UPDATE picking_order_items SET status='缺貨', note=${String(body.note || "缺貨異常")}, updated_at=now() WHERE shipment_item_id=${item.id}`;
  }
  await db.sql`
    INSERT INTO shipment_exceptions
      (shipment_id, picking_order_id, shipment_item_id, product_master_id, product_id, item_code,
        item_name, exception_type, required_qty, available_qty, shortage_qty, note, operator_email)
    VALUES (${item.shipment_id}, ${item.picking_order_id || null}, ${item.id}, ${item.product_master_id || null},
      ${item.product_id}, ${item.item_code}, ${item.item_name}, '缺貨', ${item.required_qty},
      ${Number(product?.current_stock || 0)}, ${shortageQty}, ${String(body.note || "人工標記缺貨")},
      ${user.email})`;
  await db.sql`UPDATE shipment_orders SET status='缺貨異常', updated_at=now() WHERE id=${item.shipment_id}`;
  if (item.picking_order_id) await refreshPickingStatus(item.picking_order_id);
  return json({ ok: true, shipment: await shipmentBundle(item.shipment_id) });
}

async function completePacking(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const shipmentId = body.shipmentId || body.id;
  const rows = await db.sql`SELECT * FROM shipment_orders WHERE id::text=${String(shipmentId)} OR shipment_no=${String(shipmentId)}`;
  if (!rows.length) return json({ error: "找不到出貨單" }, 404);
  const shipment = rows[0];
  const openItems = await db.sql`
    SELECT id FROM shipment_items
    WHERE shipment_id=${shipment.id} AND status NOT IN ('已揀貨', '已包裝', '已出貨')
    LIMIT 1`;
  if (openItems.length) return json({ error: "仍有未完成揀貨或缺貨品項，無法包裝覆核" }, 400);
  await db.sql`
    UPDATE shipment_items SET status='已包裝', packed_qty=picked_qty, updated_at=now()
    WHERE shipment_id=${shipment.id} AND status='已揀貨'`;
  await db.sql`
    UPDATE picking_order_items SET status='已包裝', updated_at=now()
    WHERE picking_order_id IN (SELECT id FROM picking_orders WHERE shipment_id=${shipment.id}) AND status='已揀貨'`;
  await db.sql`
    UPDATE shipment_orders SET status='待出貨', packer_email=${user.email}, packed_at=now(), updated_at=now()
    WHERE id=${shipment.id}`;
  return json({ ok: true, shipment: await shipmentBundle(shipment.id) });
}

async function completeShipment(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const shipmentId = body.shipmentId || body.id;
  const rows = await db.sql`SELECT * FROM shipment_orders WHERE id::text=${String(shipmentId)} OR shipment_no=${String(shipmentId)}`;
  if (!rows.length) return json({ error: "找不到出貨單" }, 404);
  const shipment = rows[0];
  if (!["待出貨", "待包裝", "包裝中"].includes(shipment.status)) return json({ error: "此出貨單狀態不可完成出貨" }, 400);
  const unPacked = await db.sql`
    SELECT id FROM shipment_items
    WHERE shipment_id=${shipment.id} AND status <> '已包裝'
    LIMIT 1`;
  if (unPacked.length) return json({ error: "請先完成包裝覆核" }, 400);
  await db.sql`UPDATE shipment_items SET status='已出貨', updated_at=now() WHERE shipment_id=${shipment.id}`;
  await db.sql`
    UPDATE shipment_orders SET status='已出貨', tracking_no=${String(body.trackingNo || "")},
      shipping_method=${String(body.shippingMethod || "")}, shipped_at=now(), updated_at=now()
    WHERE id=${shipment.id}`;
  return json({ ok: true, shipment: await shipmentBundle(shipment.id) });
}

async function saveWarehouseLocation(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const location = body.location || body;
  const code = String(location.locationCode || location.location_code || "").trim();
  if (!code) return json({ error: "請輸入儲位代碼" }, 400);
  const rows = await db.sql`
    INSERT INTO warehouse_locations
      (location_code, warehouse_name, area, rack, level_name, slot_name, qr_code_value,
        product_master_id, light_controller, light_channel, led_start, led_end, is_active, updated_at)
    VALUES (${code}, ${String(location.warehouseName || "東瑭主倉")}, ${String(location.area || "")},
      ${String(location.rack || "")}, ${String(location.levelName || "")}, ${String(location.slotName || "")},
      ${String(location.qrCodeValue || `LOCATION:${code}`)}, ${location.productMasterId || null},
      ${String(location.lightController || "")}, ${String(location.lightChannel || "")},
      ${Number(location.ledStart || 0)}, ${Number(location.ledEnd || 0)}, ${location.isActive !== false}, now())
    ON CONFLICT (location_code) DO UPDATE SET warehouse_name=EXCLUDED.warehouse_name,
      area=EXCLUDED.area, rack=EXCLUDED.rack, level_name=EXCLUDED.level_name, slot_name=EXCLUDED.slot_name,
      qr_code_value=EXCLUDED.qr_code_value, product_master_id=EXCLUDED.product_master_id,
      light_controller=EXCLUDED.light_controller, light_channel=EXCLUDED.light_channel,
      led_start=EXCLUDED.led_start, led_end=EXCLUDED.led_end, is_active=EXCLUDED.is_active,
      updated_at=now()
    RETURNING *`;
  return json({ ok: true, location: rows[0] });
}

async function shipmentAction(user, body, req) {
  const action = body.action || req.query?.action || "";
  if (action === "createShipmentFromSales") return createShipmentFromSales(user, body);
  if (action === "createPickingOrder") return createPickingOrder(user, body);
  if (action === "pickItem") return pickShipmentItem(user, body);
  if (action === "markShortage") return markShipmentShortage(user, body);
  if (action === "completePacking") return completePacking(user, body);
  if (action === "completeShipment") return completeShipment(user, body);
  if (action === "saveLocation") return saveWarehouseLocation(user, body);
  return json({ error: "不支援的出貨管理動作" }, 400);
}

async function currentDealerStock(dealerId, productId) {
  const rows = await db.sql`
    SELECT COALESCE(SUM(quantity), 0)::integer AS quantity
    FROM inventory_movements
    WHERE dealer_id=${dealerId} AND product_id=${Number(productId)}`;
  return Number(rows[0]?.quantity || 0);
}

async function reportWithDetails(reportId) {
  const rows = await db.sql`
    SELECT r.*, d.company_name, s.sales_no
    FROM consignment_sales_reports r
    JOIN dealers d ON d.id=r.dealer_id
    LEFT JOIN sales_documents s ON s.id=r.sales_document_id
    WHERE r.id=${reportId}`;
  if (!rows.length) return null;
  const items = await db.sql`SELECT * FROM consignment_sales_report_items WHERE report_id=${reportId} ORDER BY id`;
  const attachments = await db.sql`SELECT * FROM consignment_sales_report_attachments WHERE report_id=${reportId} ORDER BY created_at`;
  const logs = await db.sql`SELECT * FROM consignment_sales_report_logs WHERE report_id=${reportId} ORDER BY created_at`;
  return { ...rows[0], items, attachments, logs };
}

async function addReportLog(reportId, action, fromStatus, toStatus, user, note = "") {
  await db.sql`
    INSERT INTO consignment_sales_report_logs
      (report_id, action, from_status, to_status, operator_email, note)
    VALUES (${reportId}, ${action}, ${fromStatus || ''}, ${toStatus || ''}, ${user.email}, ${note})`;
}

async function createOrSubmitConsignmentReport(user, body) {
  const dealer = await dealerFor(user);
  if (dealer.mode !== "consignment") return json({ error: "只有寄售經銷商可以建立銷售回報單" }, 403);
  const periodStart = String(body.periodStart || "").slice(0, 10);
  const periodEnd = String(body.periodEnd || "").slice(0, 10);
  if (!periodStart || !periodEnd || periodEnd < periodStart) return json({ error: "請選擇正確的回報期間" }, 400);
  const rows = Array.isArray(body.items) ? body.items : [];
  if (!rows.length) return json({ error: "請填寫至少一個商品銷售數量" }, 400);

  const editable = body.reportId
    ? await db.sql`SELECT * FROM consignment_sales_reports WHERE id=${body.reportId} AND dealer_id=${dealer.id}`
    : [];
  if (body.reportId && (!editable.length || !["草稿", "已退回"].includes(editable[0].status))) {
    return json({ error: "此回報單目前不可修改" }, 400);
  }
  if (!body.reportId) {
    const duplicate = await db.sql`
      SELECT id, report_no FROM consignment_sales_reports
      WHERE dealer_id=${dealer.id} AND period_start=${periodStart}::date AND period_end=${periodEnd}::date
        AND status IN ('待審核', '已審核', '已轉銷貨單')
      LIMIT 1`;
    if (duplicate.length) return json({ error: `此期間已有進行中的回報單：${duplicate[0].report_no}` }, 409);
  }

  const products = await db.sql`
    SELECT c.product_id, c.sku, c.name, c.payload
    FROM woocommerce_product_cache c
    JOIN (
      SELECT product_id, COALESCE(SUM(quantity), 0)::integer AS stock
      FROM inventory_movements
      WHERE dealer_id=${dealer.id}
      GROUP BY product_id
      HAVING COALESCE(SUM(quantity), 0) > 0
    ) inv ON inv.product_id=c.product_id`;
  const productMap = new Map(products.map(p => [Number(p.product_id), p]));
  const normalizedItems = [];
  for (const row of rows) {
    const productId = Number(row.productId ?? row.product_id);
    const soldQty = Math.floor(Number(row.soldQuantity ?? row.sold_quantity ?? row.qty ?? 0));
    if (!productMap.has(productId)) return json({ error: `商品 ${productId} 不可回報` }, 400);
    if (!Number.isFinite(soldQty) || soldQty < 0) return json({ error: "銷售數量不可小於 0" }, 400);
    const stock = await currentDealerStock(dealer.id, productId);
    if (soldQty > stock) return json({ error: `${productMap.get(productId).name} 回報數量不可大於目前寄售庫存 ${stock}` }, 400);
    if (soldQty > 0) {
      const product = productMap.get(productId);
      const retailPrice = Number(product.payload?.price || product.payload?.regular_price || 0);
      normalizedItems.push({
        productId,
        sku: product.sku || String(productId),
        name: stripHtml(String(product.name || product.payload?.name || "")),
        stock,
        soldQty,
        retailPrice,
        note: String(row.note || "")
      });
    }
  }
  if (!normalizedItems.length) return json({ error: "本期銷售數量皆為 0，不需送出回報單" }, 400);

  const pricing = calculatePricing(normalizedItems.map(item => ({
    id: item.productId,
    sku: item.sku,
    name: item.name,
    price: item.retailPrice,
    qty: item.soldQty
  })), dealer);

  let report;
  const reportNo = body.reportId ? editable[0].report_no : `CSR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
  if (body.reportId) {
    const updated = await db.sql`
      UPDATE consignment_sales_reports SET period_start=${periodStart}::date, period_end=${periodEnd}::date,
        status='待審核', note=${String(body.note || "")}, return_reason='',
        pricing_snapshot=${JSON.stringify(pricing.settings)}::jsonb, pre_tax_amount=${pricing.preTaxTotal},
        tax_amount=${pricing.taxTotal}, total_amount=${pricing.total}, submitted_at=now(), updated_at=now()
      WHERE id=${body.reportId} AND dealer_id=${dealer.id}
      RETURNING *`;
    report = updated[0];
    await db.sql`DELETE FROM consignment_sales_report_items WHERE report_id=${report.id}`;
    await db.sql`DELETE FROM consignment_sales_report_attachments WHERE report_id=${report.id}`;
    await addReportLog(report.id, "重新送出", editable[0].status, "待審核", user, body.note || "");
  } else {
    const inserted = await db.sql`
      INSERT INTO consignment_sales_reports
        (report_no, dealer_id, period_start, period_end, status, note, pricing_snapshot,
          pre_tax_amount, tax_amount, total_amount, submitted_at, created_by)
      VALUES (${reportNo}, ${dealer.id}, ${periodStart}::date, ${periodEnd}::date, '待審核',
        ${String(body.note || "")}, ${JSON.stringify(pricing.settings)}::jsonb,
        ${pricing.preTaxTotal}, ${pricing.taxTotal}, ${pricing.total}, now(), ${user.email})
      RETURNING *`;
    report = inserted[0];
    await addReportLog(report.id, "送出", "", "待審核", user, body.note || "");
  }

  for (const line of pricing.lines) {
    const source = normalizedItems.find(item => Number(item.productId) === Number(line.id));
    await db.sql`
      INSERT INTO consignment_sales_report_items
        (report_id, product_id, sku, product_name, current_stock, sold_quantity,
          retail_price, unit_price, pre_tax_amount, tax_amount, line_total, note)
      VALUES (${report.id}, ${Number(line.id)}, ${String(line.sku)}, ${line.name},
        ${source.stock}, ${line.qty}, ${source.retailPrice}, ${line.unitPrice},
        ${line.preTax}, ${line.tax}, ${line.total}, ${source.note})`;
  }
  for (const attachment of Array.isArray(body.attachments) ? body.attachments : []) {
    await db.sql`
      INSERT INTO consignment_sales_report_attachments
        (report_id, file_name, file_url, mime_type, uploaded_by)
      VALUES (${report.id}, ${String(attachment.fileName || attachment.name || "")},
        ${String(attachment.fileUrl || attachment.url || "")}, ${String(attachment.mimeType || "")}, ${user.email})`;
  }
  return json({ ok: true, report: await reportWithDetails(report.id) });
}

async function reviewConsignmentReport(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const reportId = body.reportId || body.id;
  const nextStatus = body.status;
  if (!reportId || !["已退回", "已審核", "已作廢"].includes(nextStatus)) return json({ error: "回報單審核狀態不正確" }, 400);
  const rows = await db.sql`
    SELECT r.*, d.company_name, d.mode
    FROM consignment_sales_reports r
    JOIN dealers d ON d.id=r.dealer_id
    WHERE r.id::text=${String(reportId)} OR r.report_no=${String(reportId)}`;
  if (!rows.length) return json({ error: "找不到寄售銷售回報單" }, 404);
  const report = rows[0];
  if (["已轉銷貨單", "已作廢"].includes(report.status) && nextStatus !== "已作廢") return json({ error: "此回報單已結案，不可再審核" }, 400);
  const items = await db.sql`SELECT * FROM consignment_sales_report_items WHERE report_id=${report.id} ORDER BY id`;
  if (nextStatus === "已審核") {
    for (const item of items) {
      const stock = await currentDealerStock(report.dealer_id, item.product_id);
      if (Number(item.sold_quantity) > stock) return json({ error: `${item.product_name} 目前庫存 ${stock}，不足以審核 ${item.sold_quantity}` }, 400);
    }
  }
  const updated = await db.sql`
    UPDATE consignment_sales_reports SET status=${nextStatus},
      return_reason=CASE WHEN ${nextStatus}='已退回' THEN ${String(body.reason || body.note || "")} ELSE return_reason END,
      reviewed_at=CASE WHEN ${nextStatus} IN ('已退回','已審核') THEN now() ELSE reviewed_at END,
      voided_at=CASE WHEN ${nextStatus}='已作廢' THEN now() ELSE voided_at END,
      reviewed_by=${user.email}, updated_at=now()
    WHERE id=${report.id}
    RETURNING *`;
  await addReportLog(report.id, nextStatus === "已審核" ? "審核通過" : nextStatus === "已退回" ? "退回" : "作廢", report.status, nextStatus, user, body.reason || body.note || "");
  return json({ ok: true, report: await reportWithDetails(updated[0].id) });
}

async function convertConsignmentReportToSales(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const reportId = body.reportId || body.id;
  const reports = await db.sql`
    SELECT r.*, d.company_name, d.mode, d.discount_percent, d.hide_dealer_price,
      d.tax_mode, d.tax_rate, d.calculation_scope, d.rounding_mode, d.rounding_digits
    FROM consignment_sales_reports r
    JOIN dealers d ON d.id=r.dealer_id
    WHERE r.id::text=${String(reportId)} OR r.report_no=${String(reportId)}`;
  if (!reports.length) return json({ error: "找不到寄售銷售回報單" }, 404);
  const report = reports[0];
  if (report.status !== "已審核") return json({ error: "只有已審核的回報單可以轉銷貨單" }, 400);
  const items = await db.sql`SELECT * FROM consignment_sales_report_items WHERE report_id=${report.id} ORDER BY id`;
  for (const item of items) {
    const stock = await currentDealerStock(report.dealer_id, item.product_id);
    if (Number(item.sold_quantity) > stock) return json({ error: `${item.product_name} 目前庫存 ${stock}，不足以轉銷貨單` }, 400);
  }
  const salesNo = `SO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
  const salesMonth = String(report.period_end).slice(0, 7);
  const inserted = await db.sql`
    INSERT INTO sales_documents
      (sales_no, dealer_id, sales_month, sales_date, status, note,
        pricing_snapshot, pre_tax_amount, tax_amount, total_amount, inventory_applied_at)
    VALUES (${salesNo}, ${report.dealer_id}, ${salesMonth}, ${String(report.period_end).slice(0, 10)}::date,
      '已確認', ${`由寄售銷售回報單 ${report.report_no} 轉入`}, ${JSON.stringify(report.pricing_snapshot)}::jsonb,
      ${report.pre_tax_amount}, ${report.tax_amount}, ${report.total_amount}, now())
    RETURNING *`;
  const salesDoc = inserted[0];
  for (const item of items) {
    await db.sql`
      INSERT INTO sales_document_items
        (sales_document_id, product_id, sku, product_name, quantity, unit_price)
      VALUES (${salesDoc.id}, ${Number(item.product_id)}, ${item.sku}, ${item.product_name},
        ${Number(item.sold_quantity)}, ${Number(item.unit_price)})`;
    await db.sql`
      INSERT INTO inventory_movements
        (dealer_id, product_id, movement_type, quantity, source_type, source_id,
          idempotency_key, operator_email, note)
      VALUES (${report.dealer_id}, ${Number(item.product_id)}, '寄售銷售回報扣庫存',
        ${-Number(item.sold_quantity)}, 'consignment_sales_report', ${report.report_no},
        ${`report:${report.id}:${item.id}:sales-deduct`}, ${user.email}, ${`轉銷貨單 ${salesNo}`})
      ON CONFLICT (idempotency_key) DO NOTHING`;
  }
  await db.sql`
    UPDATE consignment_sales_reports SET status='已轉銷貨單', sales_document_id=${salesDoc.id},
      converted_at=now(), updated_at=now(), reviewed_by=${user.email}
    WHERE id=${report.id}`;
  await addReportLog(report.id, "轉銷貨單", report.status, "已轉銷貨單", user, salesNo);
  return json({ ok: true, salesNo, report: await reportWithDetails(report.id) });
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

async function transferWithItems(transferId) {
  const rows = await db.sql`
    SELECT t.*, d.company_name, d.mode, o.order_no
    FROM transfer_documents t
    JOIN dealers d ON d.id=t.dealer_id
    LEFT JOIN orders o ON o.id=t.order_id
    WHERE t.id=${transferId}`;
  if (!rows.length) return null;
  const items = await db.sql`SELECT * FROM transfer_document_items WHERE transfer_document_id=${transferId} ORDER BY id`;
  return { ...rows[0], items };
}

async function createTransferFromOrder(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const orderId = body.orderId || body.id;
  if (!orderId) return json({ error: "缺少採購單 ID" }, 400);

  const orders = await db.sql`
    SELECT o.*, d.company_name, d.mode
    FROM orders o
    JOIN dealers d ON d.id=o.dealer_id
    WHERE o.id::text=${String(orderId)} OR o.order_no=${String(orderId)}`;
  if (!orders.length) return json({ error: "找不到採購單" }, 404);
  const order = orders[0];
  if (order.status === "已取消") return json({ error: "已取消的採購單不可轉調撥單" }, 400);

  const existing = await db.sql`
    SELECT id FROM transfer_documents
    WHERE order_id=${order.id} AND status <> '已作廢'
    ORDER BY created_at DESC LIMIT 1`;
  if (existing.length) {
    return json({ ok: true, transfer: await transferWithItems(existing[0].id), existed: true });
  }

  const orderItems = await db.sql`SELECT * FROM order_items WHERE order_id=${order.id} ORDER BY id`;
  if (!orderItems.length) return json({ error: "採購單沒有商品明細" }, 400);
  const transferNo = `TR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
  const destination = order.shipping_snapshot || {};
  const transfers = await db.sql`
    INSERT INTO transfer_documents
      (transfer_no, order_id, dealer_id, destination_snapshot, note, operator_email)
    VALUES (${transferNo}, ${order.id}, ${order.dealer_id}, ${JSON.stringify(destination)}::jsonb,
      ${String(body.note || "")}, ${user.email})
    RETURNING *`;
  const transfer = transfers[0];
  for (const item of orderItems) {
    await db.sql`
      INSERT INTO transfer_document_items
        (transfer_document_id, order_item_id, product_id, sku, product_name, quantity)
      VALUES (${transfer.id}, ${item.id}, ${Number(item.product_id)}, ${item.sku},
        ${item.product_name}, ${Number(item.quantity)})`;
  }
  await db.sql`
    UPDATE orders SET status=CASE WHEN status='訂單成立' THEN '已確認' ELSE status END,
      confirmed_at=CASE WHEN confirmed_at IS NULL THEN now() ELSE confirmed_at END,
      updated_at=now()
    WHERE id=${order.id}`;
  return json({ ok: true, transfer: await transferWithItems(transfer.id), existed: false });
}

async function applyTransferInventory(user, transfer, items) {
  if (transfer.inventory_applied_at) return;
  for (const item of items) {
    if (transfer.mode === "consignment") {
      await db.sql`
        INSERT INTO inventory_movements
          (dealer_id, product_id, movement_type, quantity, source_type, source_id,
            idempotency_key, operator_email, note)
        VALUES (${transfer.dealer_id}, ${Number(item.product_id)}, '調撥入庫',
          ${Number(item.quantity)}, 'transfer', ${transfer.transfer_no},
          ${`transfer:${transfer.id}:${item.id}:dealer-in`}, ${user.email}, '調撥單確認調撥，自動加入經銷商寄售庫存')
        ON CONFLICT (idempotency_key) DO NOTHING`;
    }
    await db.sql`
      INSERT INTO warehouse_movements
        (warehouse_name, dealer_id, product_id, movement_type, quantity, source_type, source_id,
          idempotency_key, operator_email, note)
      VALUES (${transfer.source_warehouse}, ${transfer.dealer_id}, ${Number(item.product_id)}, '調撥出庫',
        ${-Number(item.quantity)}, 'transfer', ${transfer.transfer_no},
        ${`transfer:${transfer.id}:${item.id}:warehouse-out`}, ${user.email}, '由採購單轉調撥單，出庫至經銷商倉庫')
      ON CONFLICT (idempotency_key) DO NOTHING`;
  }
}

async function reverseTransferInventory(user, transfer, items) {
  if (!transfer.inventory_applied_at || transfer.inventory_reversed_at) return;
  for (const item of items) {
    if (transfer.mode === "consignment") {
      await db.sql`
        INSERT INTO inventory_movements
          (dealer_id, product_id, movement_type, quantity, source_type, source_id,
            idempotency_key, operator_email, note)
        VALUES (${transfer.dealer_id}, ${Number(item.product_id)}, '調撥作廢回沖',
          ${-Number(item.quantity)}, 'transfer', ${transfer.transfer_no},
          ${`transfer:${transfer.id}:${item.id}:dealer-void`}, ${user.email}, '調撥單作廢，回沖經銷商寄售庫存')
        ON CONFLICT (idempotency_key) DO NOTHING`;
    }
    await db.sql`
      INSERT INTO warehouse_movements
        (warehouse_name, dealer_id, product_id, movement_type, quantity, source_type, source_id,
          idempotency_key, operator_email, note)
      VALUES (${transfer.source_warehouse}, ${transfer.dealer_id}, ${Number(item.product_id)}, '調撥作廢回補',
        ${Number(item.quantity)}, 'transfer', ${transfer.transfer_no},
        ${`transfer:${transfer.id}:${item.id}:warehouse-void`}, ${user.email}, '調撥單作廢，回補東瑭倉庫紀錄')
      ON CONFLICT (idempotency_key) DO NOTHING`;
  }
}

async function updateTransfer(user, body) {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
  const transferId = body.transferId || body.id;
  const status = body.status;
  if (!transferId) return json({ error: "缺少調撥單 ID" }, 400);
  if (!transferStatuses.includes(status)) return json({ error: "調撥單狀態不正確" }, 400);

  const rows = await db.sql`
    SELECT t.*, d.company_name, d.mode, o.order_no
    FROM transfer_documents t
    JOIN dealers d ON d.id=t.dealer_id
    LEFT JOIN orders o ON o.id=t.order_id
    WHERE t.id::text=${String(transferId)} OR t.transfer_no=${String(transferId)}`;
  if (!rows.length) return json({ error: "找不到調撥單" }, 404);
  const transfer = rows[0];
  const items = await db.sql`SELECT * FROM transfer_document_items WHERE transfer_document_id=${transfer.id} ORDER BY id`;
  const note = String(body.note ?? transfer.note ?? "").trim();

  if (status === "已調撥") {
    await applyTransferInventory(user, transfer, items);
  }
  if (status === "已作廢") {
    await reverseTransferInventory(user, transfer, items);
  }

  const updated = await db.sql`
    UPDATE transfer_documents SET status=${status}, note=${note}, operator_email=${user.email},
      confirmed_at=CASE WHEN ${status} IN ('已確認','已調撥') AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
      transferred_at=CASE WHEN ${status}='已調撥' AND transferred_at IS NULL THEN now() ELSE transferred_at END,
      voided_at=CASE WHEN ${status}='已作廢' AND voided_at IS NULL THEN now() ELSE voided_at END,
      inventory_applied_at=CASE WHEN ${status}='已調撥' AND inventory_applied_at IS NULL THEN now() ELSE inventory_applied_at END,
      inventory_reversed_at=CASE WHEN ${status}='已作廢' AND inventory_applied_at IS NOT NULL AND inventory_reversed_at IS NULL THEN now() ELSE inventory_reversed_at END,
      updated_at=now()
    WHERE id=${transfer.id}
    RETURNING *`;
  if (status === "已調撥" && transfer.order_id) {
    await db.sql`
      UPDATE orders SET status='已出貨',
        shipped_at=CASE WHEN shipped_at IS NULL THEN now() ELSE shipped_at END,
        updated_at=now()
      WHERE id=${transfer.order_id}`;
  }
  return json({ ok: true, transfer: { ...updated[0], company_name: transfer.company_name, order_no: transfer.order_no, items } });
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
  let items = await db.sql`SELECT * FROM order_items WHERE order_id=${order.id} ORDER BY id`;

  if (body.itemQuantities && typeof body.itemQuantities === "object") {
    const lockedOrder = inventoryOrderStatuses.includes(order.status);
    if (lockedOrder && (!body.forceQuantityEdit || !canOverrideLockedOrders(user))) {
      return json({ error: "此訂單已出貨或完成。若確定要修正，請用最高權限勾選強制修正並填寫原因。" }, 400);
    }
    if (lockedOrder && !String(body.overrideReason || "").trim()) {
      return json({ error: "強制修正已出貨訂單時，請填寫修正原因。" }, 400);
    }
    const quantityById = new Map(Object.entries(body.itemQuantities).map(([id, value]) => [String(id), Math.max(1, Math.floor(Number(value) || 1))]));
    const pricingItems = items.map(item => ({
      orderItemId: item.id,
      id: item.product_id,
      sku: item.sku,
      name: item.product_name,
      image: item.image_url,
      price: item.retail_price,
      qty: quantityById.get(String(item.id)) ?? item.quantity
    }));
    const pricing = calculatePricing(pricingItems, order.pricing_snapshot || order);
    for (const line of pricing.lines) {
      const item = items.find(row => String(row.id) === String(line.orderItemId));
      if (!item) continue;
      await db.sql`
        UPDATE order_items SET quantity=${line.qty}, dealer_price=${line.unitPrice},
          pre_tax_amount=${line.preTax}, tax_amount=${line.tax}, line_total=${line.total}
        WHERE id=${item.id}`;
    }
    await db.sql`
      UPDATE orders SET total_amount=${pricing.total}, pre_tax_amount=${pricing.preTaxTotal},
        tax_amount=${pricing.taxTotal}, retail_total=${pricing.retailTotal}, updated_at=now()
      WHERE id=${order.id}`;
    items = await db.sql`SELECT * FROM order_items WHERE order_id=${order.id} ORDER BY id`;
  }

  const nextTracking = String(body.trackingNo ?? order.tracking_no ?? "").trim();
  const overrideReason = String(body.overrideReason || "").trim();
  const nextNote = [String(body.note ?? order.admin_note ?? "").trim(), overrideReason ? `強制修正原因：${overrideReason}` : ""].filter(Boolean).join("\n");
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

  if (body.applyLegacyInventory && inventoryOrderStatuses.includes(status)) await applyPurchaseInventory(user, order, items);
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
  const cached = await db.sql`
    SELECT c.product_id, c.payload, o.visible AS override_visible,
      pm.item_no, pm.barcode, pm.unit, pm.supplier, pm.dealer_visible, pm.active AS master_active
    FROM woocommerce_product_cache c
    LEFT JOIN product_overrides o ON o.product_id=c.product_id
    LEFT JOIN product_master pm ON pm.woo_product_id=c.product_id
    ORDER BY c.product_id`;
  const adminView = user && isAdmin(user);
  const rows = adminView ? cached : cached.filter(row => {
    if (row.override_visible === false) return false;
    if (row.master_active === false) return false;
    if (row.dealer_visible === false) return false;
    return true;
  });
  return json(rows.map(row => ({
    ...row.payload,
    item_no: row.item_no || row.payload?.sku || String(row.product_id),
    barcode: row.barcode || '',
    unit: row.unit || '',
    supplier: row.supplier || '',
    dealer_visible: row.dealer_visible !== false,
    visible: row.override_visible !== false
  })));
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
      return json({ ok: true, count: data.length, products: data, masterDiff: await wooMasterDiff() });
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
    return json({ ok: true, count: data.length, products: data, masterDiff: await wooMasterDiff() });
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
  await syncMasterWooLinks();
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
      return fetchWooCommerceProducts(req.user || null, req); // Public access with optional admin view
    }

    const user = await auth(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    console.info("API request", { method: req.method, route, action, userId: user.id });
    if (req.method === "GET" && route === "bootstrap") return json(await bootstrap(user));
    if (req.method === "GET" && route === "settings" && action === "woocommerce") return getWooCommerceSettings(user);
    if (req.method === "POST" && route === "settings" && action === "woocommerce") return saveWooCommerceSettings(user, body);
    if (req.method === "GET" && route === "master-products") return listMasterProducts(user);
    if (req.method === "POST" && route === "master-products") return productMasterAction(user, body);
    if (req.method === "GET" && route === "warehouse-inventory") return listWarehouseInventory(user);
    if (req.method === "POST" && route === "warehouse-inventory") return warehouseInventoryAction(user, body);
    if (req.method === "GET" && route === "shipments") return listShipments(user);
    if (req.method === "POST" && route === "shipments") return shipmentAction(user, body, req);
    if (req.method === "POST" && route === "products" && action === "sync") return syncWooCommerceProducts(user);
    if (req.method === "POST" && route === "products" && action === "update") return updateWooCommerceProduct(user, body);
    if (req.method === "POST" && route === "orders") return createOrder(user, body);
    if (["createTransferFromOrder", "transfer-from-order"].includes(action) && req.method === "POST") {
      return createTransferFromOrder(user, body);
    }
    if (["updateTransfer", "transfer"].includes(action) && ["POST", "PUT", "PATCH"].includes(req.method)) {
      return updateTransfer(user, body);
    }
    if (["submitConsignmentSalesReport", "consignment-report-submit"].includes(action) && req.method === "POST") {
      return createOrSubmitConsignmentReport(user, body);
    }
    if (["reviewConsignmentSalesReport", "consignment-report-review"].includes(action) && req.method === "POST") {
      return reviewConsignmentReport(user, body);
    }
    if (["convertConsignmentSalesReport", "consignment-report-convert"].includes(action) && req.method === "POST") {
      return convertConsignmentReportToSales(user, body);
    }
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
