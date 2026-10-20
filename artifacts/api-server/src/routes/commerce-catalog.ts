import { assert, blocked, postAccess, uuid, type Query, type Row } from "../lib/social";
import { claimMedia } from "../lib/media";
import { currencyCode } from "../lib/commerce-policy";
import { MANAGE, TAG, offset, paged, productAccess, productShape, shopAccess, shopShape } from "../lib/commerce/shared";
import type { CommerceContext, CommerceRoute } from "../lib/commerce/http";

function currency(value: string) {
  try { return currencyCode(value); } catch { assert(false, 400, "Choose a supported currency"); }
}
function requiredText(value: string) { assert(value.trim(), 400, "Required text cannot be blank"); return value.trim(); }
async function storeWrite(c: CommerceContext, id?: string) {
  const b = c.b;
  const code = currency(b.currency);
  requiredText(b.name); requiredText(b.category);
  assert(b.deliveryEnabled || b.pickupEnabled, 400, "Enable delivery or pickup");
  if (b.pickupEnabled) assert(b.pickupDetails?.trim(), 400, "Add pickup instructions");
  let current: Row | undefined;
  if (id) {
    current = await shopAccess(id, c.u, c.q, MANAGE, true);
    if (code !== current.currency) assert(!(await c.q("SELECT 1 FROM shop_products WHERE shop_id=$1 LIMIT 1", [id])).length, 409, "Currency cannot change while the shop has products");
  }
  const shopId = id ?? uuid();
  let logo = current?.logo_media_id ?? null;
  if (Object.hasOwn(b, "logoMediaId") && b.logoMediaId !== logo) {
    logo = b.logoMediaId ? (await claimMedia(b.logoMediaId, c.u, "product", null, c.q))?.id : null;
  }
  const values = [b.name.trim(), b.slug, b.description?.trim() ?? "", b.category.trim(), code, b.policies?.trim() ?? "",
    b.contact?.trim() ?? "", b.pickupDetails?.trim() ?? "", b.shippingMinor ?? 0, b.deliveryEnabled, b.pickupEnabled, b.isPublished ?? true, logo];
  if (id) await c.q(`UPDATE shop_stores SET name=$1,slug=$2,description=$3,category=$4,currency=$5,policies=$6,contact=$7,
    pickup_details=$8,shipping_minor=$9,delivery_enabled=$10,pickup_enabled=$11,is_published=$12,logo_media_id=$13 WHERE id=$14`, [...values, shopId]);
  else {
    assert(!(await c.q("SELECT 1 FROM shop_stores WHERE owner_id=$1", [c.u])).length, 409, "You already own a shop");
    await c.q(`INSERT INTO shop_stores (name,slug,description,category,currency,policies,contact,pickup_details,shipping_minor,
      delivery_enabled,pickup_enabled,is_published,logo_media_id,id,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [...values, shopId, c.u]);
    // Adopt only compatible legacy products; other currencies remain intact in the marketplace.
    await c.q("UPDATE shop_products SET shop_id=$1 WHERE seller_id=$2 AND shop_id IS NULL AND currency=$3", [shopId, c.u, code]);
  }
  return shopShape(shopId, c.u, c.q);
}
async function team(id: string, q: Query) {
  return q(`SELECT s.owner_id AS "userId",u.name,u.username,'owner' AS role FROM shop_stores s JOIN users u ON u.id=s.owner_id WHERE s.id=$1
    UNION ALL SELECT t.user_id AS "userId",u.name,u.username,t.role FROM commerce_team t JOIN users u ON u.id=t.user_id WHERE t.shop_id=$1`, [id]);
}
async function productWrite(c: CommerceContext, id?: string) {
  const b = c.b;
  const shop = await shopAccess(b.shopId, c.u, c.q, MANAGE, true);
  requiredText(b.title); requiredText(b.category);
  const current = id ? await productAccess(id, c.u, c.q, true, true) : undefined;
  if (current) {
    assert(current.shop_id === shop.id || (!current.shop_id && current.seller_id === shop.owner_id && current.currency === shop.currency), 400, "Products cannot move between shops or currencies");
    const hadVariants = (await c.q("SELECT 1 FROM commerce_variants WHERE product_id=$1 AND active LIMIT 1", [id])).length > 0;
    if (hadVariants !== (b.variants.length > 0)) assert(!(await c.q("SELECT 1 FROM shop_order_items WHERE product_id=$1 LIMIT 1", [id])).length, 409, "Keep the product's variant mode after its first order; archive it and create a new listing instead");
  }
  assert(new Set(b.variants.map((v: Row) => v.sku.trim().toLowerCase())).size === b.variants.length, 400, "Each variant needs a distinct SKU");
  assert(new Set(b.variants.filter((v: Row) => v.id).map((v: Row) => v.id)).size === b.variants.filter((v: Row) => v.id).length, 400, "A variant cannot be repeated");
  for (const v of b.variants) { requiredText(v.label); requiredText(v.sku); }
  const inventory = b.variants.length ? b.variants.reduce((n: number, v: Row) => n + v.inventory, 0) : b.inventory;
  const price = b.variants.length ? Math.min(...b.variants.map((v: Row) => v.priceMinor)) : b.priceMinor;
  const productId = id ?? uuid();
  const previous = id ? (await c.q("SELECT media_id FROM commerce_photos WHERE product_id=$1", [id])).map(r => r.media_id) : [];
  if (current?.image_media_id) previous.push(current.image_media_id);
  for (const media of b.mediaIds) if (!previous.includes(media)) await claimMedia(media, c.u, "product", null, c.q);
  if (id) await c.q(`UPDATE shop_products SET shop_id=$1,title=$2,description=$3,category=$4,price_minor=$5,currency=$6,
    inventory=$7,image_media_id=$8,is_published=$9,updated_at=now() WHERE id=$10`, [shop.id, b.title.trim(), b.description?.trim() ?? "",
    b.category.trim(), price, shop.currency, inventory, b.mediaIds[0] ?? null, b.isPublished, id]);
  else await c.q(`INSERT INTO shop_products (id,seller_id,shop_id,title,description,category,price_minor,currency,inventory,image_media_id,is_published)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [productId, shop.owner_id, shop.id, b.title.trim(), b.description?.trim() ?? "",
    b.category.trim(), price, shop.currency, inventory, b.mediaIds[0] ?? null, b.isPublished]);
  await c.q("DELETE FROM commerce_photos WHERE product_id=$1", [productId]);
  for (let i = 0; i < b.mediaIds.length; i++) await c.q("INSERT INTO commerce_photos (product_id,media_id,position) VALUES ($1,$2,$3)", [productId, b.mediaIds[i], i]);
  // Retain old variant rows for order snapshots and exactly-once restocking.
  await c.q("UPDATE commerce_variants SET active=false WHERE product_id=$1", [productId]);
  for (const v of b.variants) {
    if (v.id) {
      assert((await c.q(`UPDATE commerce_variants SET label=$1,sku=$2,price_minor=$3,inventory=$4,active=true
        WHERE id=$5 AND product_id=$6 RETURNING id`, [v.label.trim(), v.sku.trim(), v.priceMinor, v.inventory, v.id, productId])).length, 400, "Unknown product variant");
    } else await c.q(`INSERT INTO commerce_variants (id,product_id,label,sku,price_minor,inventory) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), productId, v.label.trim(), v.sku.trim(), v.priceMinor, v.inventory]);
  }
  return productShape(productId, c.u, c.q, true);
}
export default function catalog(route: CommerceRoute) {
  route("get", "/commerce/shops", "CommerceListShops", async c => {
    const start = offset(c.s.cursor), scope = c.s.scope ?? "discover";
    const rows = await c.q(`SELECT s.id FROM shop_stores s WHERE
      ($1::text IS NULL OR s.name ILIKE $1 OR s.description ILIKE $1 OR s.category ILIKE $1)
      AND CASE WHEN $2='mine' THEN s.owner_id=$3 OR EXISTS(SELECT 1 FROM commerce_team WHERE shop_id=s.id AND user_id=$3)
        WHEN $2='following' THEN s.is_published AND EXISTS(SELECT 1 FROM commerce_followers WHERE shop_id=s.id AND user_id=$3) ELSE s.is_published END
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$3 AND target_id=s.owner_id) OR (target_id=$3 AND user_id=s.owner_id))
      ORDER BY s.created_at DESC,s.id LIMIT 25 OFFSET $4`, [c.s.q ? `%${c.s.q.replace(/[%_\\]/g, "\\$&")}%` : null, scope, c.u, start]);
    return paged(await Promise.all(rows.map(r => shopShape(r.id, c.u, c.q))), start);
  });
  route("post", "/commerce/shops", "CommerceCreateShop", c => storeWrite(c), 201);
  route("get", "/commerce/shops/:shopId", "CommerceGetShop", c => shopShape(c.p.shopId, c.u, c.q));
  route("patch", "/commerce/shops/:shopId", "CommerceUpdateShop", c => storeWrite(c, c.p.shopId));
  route("put", "/commerce/shops/:shopId/follow", "CommerceFollowShop", async c => {
    await shopAccess(c.p.shopId, c.u, c.q);
    if (c.b.following) await c.q(`INSERT INTO commerce_followers (shop_id,user_id,marketing_opt_in) VALUES ($1,$2,$3)
      ON CONFLICT (shop_id,user_id) DO UPDATE SET marketing_opt_in=$3`, [c.p.shopId, c.u, c.b.marketingOptIn]);
    else await c.q("DELETE FROM commerce_followers WHERE shop_id=$1 AND user_id=$2", [c.p.shopId, c.u]);
    return shopShape(c.p.shopId, c.u, c.q);
  });
  route("get", "/commerce/shops/:shopId/team", "CommerceListTeam", async c => {
    const s = await shopAccess(c.p.shopId, c.u, c.q);
    assert(s.role !== "buyer", 403, "Business access required");
    return team(s.id, c.q);
  });
  route("put", "/commerce/shops/:shopId/team", "CommerceUpdateTeam", async c => {
    const s = await shopAccess(c.p.shopId, c.u, c.q, ["owner"], true);
    assert(c.b.userId !== s.owner_id, 400, "The owner role cannot be changed");
    assert((await c.q("SELECT id FROM users WHERE id=$1", [c.b.userId])).length && !await blocked(c.u, c.b.userId, c.q), 404, "Member unavailable");
    if (c.b.approved) await c.q(`INSERT INTO commerce_team (shop_id,user_id,role) VALUES ($1,$2,$3)
      ON CONFLICT (shop_id,user_id) DO UPDATE SET role=$3`, [s.id, c.b.userId, c.b.role]);
    else await c.q("DELETE FROM commerce_team WHERE shop_id=$1 AND user_id=$2", [s.id, c.b.userId]);
    c.impact.add(c.b.userId);
    return team(s.id, c.q);
  });
  route("get", "/commerce/products", "CommerceListProducts", async c => {
    const start = offset(c.s.cursor), scope = c.s.scope ?? "discover";
    if (c.s.shopId) await shopAccess(c.s.shopId, c.u, c.q);
    if (c.s.minPrice !== undefined || c.s.maxPrice !== undefined) assert(c.s.currency, 400, "Select a currency before filtering prices");
    if (c.s.minPrice !== undefined && c.s.maxPrice !== undefined) assert(c.s.minPrice <= c.s.maxPrice, 400, "Invalid price range");
    const sort = c.s.sort === "price_low" ? "p.price_minor ASC,p.id" : c.s.sort === "price_high" ? "p.price_minor DESC,p.id" : "p.created_at DESC,p.id";
    const rows = await c.q(`SELECT p.id FROM shop_products p LEFT JOIN shop_stores s ON s.id=p.shop_id WHERE
      ($1::text IS NULL OR p.shop_id=$1) AND
      CASE WHEN $2='mine' THEN p.seller_id=$3 OR EXISTS(SELECT 1 FROM commerce_team WHERE shop_id=p.shop_id AND user_id=$3)
        ELSE p.is_published AND (s.id IS NULL OR s.is_published) END
      AND ($2<>'saved' OR EXISTS(SELECT 1 FROM commerce_saved WHERE product_id=p.id AND user_id=$3))
      AND ($4::text IS NULL OR p.title ILIKE $4 OR p.description ILIKE $4 OR p.category ILIKE $4 OR s.name ILIKE $4)
      AND ($5::text IS NULL OR p.category=$5) AND ($6::text IS NULL OR p.currency=$6)
      AND ($7::int IS NULL OR p.price_minor >= $7) AND ($8::int IS NULL OR p.price_minor <= $8)
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$3 AND target_id=p.seller_id) OR (target_id=$3 AND user_id=p.seller_id))
      ORDER BY ${sort} LIMIT 25 OFFSET $9`, [c.s.shopId ?? null, scope, c.u, c.s.q ? `%${c.s.q.replace(/[%_\\]/g, "\\$&")}%` : null,
      c.s.category || null, c.s.currency ? currency(c.s.currency) : null, c.s.minPrice ?? null, c.s.maxPrice ?? null, start]);
    return paged(await Promise.all(rows.map(r => productShape(r.id, c.u, c.q))), start);
  });
  route("post", "/commerce/products", "CommerceCreateProduct", c => productWrite(c), 201);
  route("get", "/commerce/products/:productId", "CommerceGetProduct", c => productShape(c.p.productId, c.u, c.q, true));
  route("patch", "/commerce/products/:productId", "CommerceUpdateProduct", c => productWrite(c, c.p.productId));
  route("put", "/commerce/products/:productId/save", "CommerceSaveProduct", async c => {
    await productAccess(c.p.productId, c.u, c.q);
    if (c.b.saved) await c.q("INSERT INTO commerce_saved (product_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [c.p.productId, c.u]);
    else await c.q("DELETE FROM commerce_saved WHERE product_id=$1 AND user_id=$2", [c.p.productId, c.u]);
    return productShape(c.p.productId, c.u, c.q, true);
  });
  route("post", "/commerce/products/:productId/reviews", "CommerceReviewProduct", async c => {
    const p = await productAccess(c.p.productId, c.u, c.q);
    assert(c.u !== p.seller_id, 403, "Sellers cannot review their own products");
    assert((await c.q(`SELECT 1 FROM shop_orders o JOIN shop_order_items i ON i.order_id=o.id
      WHERE o.buyer_id=$1 AND i.product_id=$2 AND o.status='completed' LIMIT 1`, [c.u, p.id])).length, 403, "A completed purchase is required to review this product");
    await c.q(`INSERT INTO commerce_reviews (product_id,user_id,rating,content) VALUES ($1,$2,$3,$4)
      ON CONFLICT (product_id,user_id) DO UPDATE SET rating=$3,content=$4,created_at=now()`, [p.id, c.u, c.b.rating, requiredText(c.b.content)]);
    return productShape(p.id, c.u, c.q, true);
  });
  route("post", "/commerce/reports", "CommerceReport", async c => {
    if (c.b.kind === "shop") await shopAccess(c.b.targetId, c.u, c.q);
    else await productAccess(c.b.targetId, c.u, c.q);
    assert(c.b.reason.trim().length >= 5, 400, "Explain the reason for your report");
    await c.q(`INSERT INTO commerce_reports (id,user_id,kind,target_id,reason) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id,kind,target_id) DO UPDATE SET reason=$5,state='open'`, [uuid(), c.u, c.b.kind, c.b.targetId, c.b.reason.trim()]);
    return { success: true };
  }, 201);
  route("get", "/commerce/content/:postId/products", "CommerceListContentProducts", async c => {
    const post = await postAccess(c.p.postId, c.u, c.q);
    const rows = await c.q(`SELECT t.product_id FROM commerce_tags t JOIN shop_products p ON p.id=t.product_id
      JOIN shop_stores s ON s.id=p.shop_id WHERE t.post_id=$1 AND p.is_published AND s.is_published
      AND (s.owner_id=$2 OR EXISTS(SELECT 1 FROM commerce_team WHERE shop_id=s.id AND user_id=$2 AND role=ANY($3::text[])))
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$4 AND target_id=s.owner_id) OR (target_id=$4 AND user_id=s.owner_id))`,
    [post.id, post.author_id, TAG, c.u]);
    return Promise.all(rows.map(r => productShape(r.product_id, c.u, c.q)));
  });
  route("put", "/commerce/content/:postId/products", "CommerceTagContent", async c => {
    const post = await postAccess(c.p.postId, c.u, c.q);
    assert(post.author_id === c.u, 403, "Only the author can tag products on this content");
    // Approval is checked on both tag creation and every subsequent view.
    for (const id of c.b.productIds) {
      const p = await productAccess(id, c.u, c.q);
      assert(p.shop_id && p.is_published, 400, "Only published storefront products can be tagged");
      await shopAccess(p.shop_id, c.u, c.q, TAG);
    }
    await c.q("DELETE FROM commerce_tags WHERE post_id=$1", [post.id]);
    for (const id of c.b.productIds) await c.q("INSERT INTO commerce_tags (post_id,product_id) VALUES ($1,$2)", [post.id, id]);
    return Promise.all(c.b.productIds.map((id: string) => productShape(id, c.u, c.q)));
  });
}
