import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";

const db = getDatabase();
const json = (data, status = 200) => Response.json(data, { status });

async function auth() {
  const user = await getUser();
  if (!user) return null;
  return {
    ...user,
    roles: user.roles || user.app_metadata?.roles || [],
    name: user.user_metadata?.full_name || user.email
  };
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
  const company = user.user_metadata?.company || user.name || user.email;
  const created = await db.sql`
    INSERT INTO dealers (identity_user_id, email, company_name, contact_name)
    VALUES (${user.id}, ${user.email}, ${company}, ${user.name}) RETURNING *`;
  return created[0];
}

function isAdmin(user) {
  return user.roles.includes("admin");
}

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
  return {
    user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
    admin: isAdmin(user),
    dealer,
    content: content[0]?.value || {},
    productOverrides: products,
    dealers,
    orders: orders.map(o => ({ ...o, items: orderItems.filter(i => i.order_id === o.id) })),
    sales: sales.map(s => ({ ...s, items: salesItems.filter(i => i.sales_document_id === s.id) })),
    movements
  };
}

async function createOrder(user, body) {
  const dealer = await dealerFor(user);
  if (!Array.isArray(body.items) || !body.items.length) return json({ error: "採購清單不可為空" }, 400);
  const orderNo = `DT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
  const total = body.items.reduce((sum, item) => sum + Number(item.dealerPrice) * Number(item.qty), 0);
  const orders = await db.sql`
    INSERT INTO orders (order_no, dealer_id, contact_name, total_amount)
    VALUES (${orderNo}, ${dealer.id}, ${body.contact || dealer.contact_name}, ${total}) RETURNING *`;
  for (const item of body.items) {
    await db.sql`
      INSERT INTO order_items
        (order_id, product_id, sku, product_name, image_url, retail_price, dealer_price, quantity)
      VALUES (${orders[0].id}, ${Number(item.id)}, ${String(item.sku)}, ${item.name},
        ${item.image || null}, ${Number(item.price)}, ${Number(item.dealerPrice)}, ${Number(item.qty)})`;
  }
  return json({ ok: true, orderNo });
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
    await db.sql`
      INSERT INTO dealers (email, company_name, mode, discount_percent, hide_dealer_price)
      VALUES (${`pending+${encodeURIComponent(company)}@eavo.invalid`}, ${company}, ${settings.mode},
        ${Number(settings.discount)}, ${Boolean(settings.hideDealerPrice)})
      ON CONFLICT (email) DO UPDATE SET company_name=EXCLUDED.company_name, mode=EXCLUDED.mode,
        discount_percent=EXCLUDED.discount_percent, hide_dealer_price=EXCLUDED.hide_dealer_price,
        updated_at=now()`;
    await db.sql`
      UPDATE dealers SET mode=${settings.mode}, discount_percent=${Number(settings.discount)},
        hide_dealer_price=${Boolean(settings.hideDealerPrice)}, updated_at=now()
      WHERE company_name=${company}`;
  }
  return json({ ok: true });
}

export default async function handler(req) {
  try {
    const user = await auth();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const url = new URL(req.url);
    const route = url.searchParams.get("route") || "bootstrap";
    if (req.method === "GET" && route === "bootstrap") return json(await bootstrap(user));
    const body = req.method === "GET" ? {} : await req.json();
    if (req.method === "POST" && route === "orders") return createOrder(user, body);
    if (req.method === "PUT" && route === "settings") return saveSettings(user, body);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error.message || "Server error" }, 500);
  }
}
