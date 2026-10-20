import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListShopOrdersQueryKey, getListShopProductsQueryKey, useCreateShopProduct, useListShopOrders,
  useListShopProducts, usePlaceShopOrder, useUpdateShopOrder, useUpdateShopProduct,
  type MediaAttachment, type ShopOrder, type ShopProduct,
} from "@workspace/api-client-react";
import { AppHeader, PageFrame, SectionTitle, StorageNotice } from "@/components/common";
import { MobileMediaPicker, MobileMediaPreview } from "@/components/Media";
import { useColors } from "@/hooks/useColors";
import { useAppStore } from "@/state/AppStore";

type Section = "discover" | "my-shop" | "orders";
type CartLine = { product: ShopProduct; quantity: number };
type Draft = { title: string; description: string; category: string; price: string; currency: string; inventory: string; isPublished: boolean };
const blank: Draft = { title: "", description: "", category: "General", price: "", currency: "USD", inventory: "1", isPublished: true };

function digits(currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}
function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(minor / 10 ** digits(currency)); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}
function amount(value: string, currency: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10 ** digits(currency)) : 0;
}
const fieldStyle = { borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 6, marginBottom: 10 } as const;
const buttonStyle = { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const };

export default function ShopScreen() {
  const colors = useColors();
  const { profile, run } = useAppStore();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("discover");
  const [scope, setScope] = useState<"buyer" | "seller">("buyer");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [image, setImage] = useState<MediaAttachment>();
  const products = useListShopProducts({ scope: section === "my-shop" ? "mine" : "discover", q: search.trim() || undefined });
  const orders = useListShopOrders({ scope });
  const create = useCreateShopProduct();
  const updateProduct = useUpdateShopProduct();
  const placeOrder = usePlaceShopOrder();
  const updateOrder = useUpdateShopOrder();
  const cartTotal = useMemo(() => cart.reduce((sum, line) => sum + line.product.priceMinor * line.quantity, 0), [cart]);
  const currency = cart[0]?.product.currency ?? "USD";
  const input = { ...fieldStyle, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card } as const;

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListShopProductsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListShopOrdersQueryKey() }),
    ]);
  }
  function add(product: ShopProduct) {
    if (product.sellerId === profile?.id) { Alert.alert("Your listing", "You can't order a product from your own shop."); return; }
    if (product.inventory < 1) { Alert.alert("Sold out", "This product is currently out of stock."); return; }
    if (cart.length && cart[0].product.sellerId !== product.sellerId) { Alert.alert("One seller per order", "Finish or clear your cart before adding items from another shop."); return; }
    setCart(items => {
      const old = items.find(line => line.product.id === product.id);
      return old ? items.map(line => line.product.id === product.id ? { ...line, product, quantity: Math.min(product.inventory, line.quantity + 1) } : line) : [...items, { product, quantity: 1 }];
    });
  }
  function startEdit(product?: ShopProduct) {
    setEditing(product ?? null);
    setImage(undefined);
    setDraft(product ? {
      title: product.title, description: product.description, category: product.category,
      price: String(product.priceMinor / 10 ** digits(product.currency)), currency: product.currency,
      inventory: String(product.inventory), isPublished: product.isPublished,
    } : blank);
    setEditorOpen(true);
  }
  async function saveProduct() {
    const code = draft.currency.trim().toUpperCase();
    const priceMinor = amount(draft.price, code);
    const inventory = Number(draft.inventory);
    if (!draft.title.trim() || !priceMinor || !/^[A-Z]{3}$/.test(code) || !Number.isInteger(inventory) || inventory < 0) {
      Alert.alert("Check the listing", "Add a title, valid price, currency code, and whole-number stock count."); return;
    }
    try { new Intl.NumberFormat("en", { style: "currency", currency: code }).format(0); }
    catch { Alert.alert("Invalid currency", "Use a supported three-letter currency code, such as NGN or USD."); return; }
    const fields = {
      title: draft.title.trim(), description: draft.description.trim(), category: draft.category.trim() || "General",
      priceMinor, currency: code, inventory, isPublished: draft.isPublished,
    };
    const saved = await run(() => editing
      ? updateProduct.mutateAsync({ productId: editing.id, data: { ...fields, ...(image ? { imageMediaId: image.id } : {}) } })
      : create.mutateAsync({ data: { ...fields, ...(image ? { imageMediaId: image.id } : {}) } }));
    if (saved) { setEditorOpen(false); setEditing(null); await refresh(); Alert.alert("Saved", editing ? "Your listing was updated." : "Your product is now in your shop."); }
  }
  async function checkout() {
    if (!cart.length) return;
    const result = await run(() => placeOrder.mutateAsync({
      data: { items: cart.map(line => ({ productId: line.product.id, quantity: line.quantity })), ...(note.trim() ? { buyerNote: note.trim() } : {}) },
    }));
    if (result) { setCart([]); setNote(""); setSection("orders"); setScope("buyer"); await refresh(); Alert.alert("Order placed", "Payment is arranged directly with the seller. VastMind has not charged you."); }
  }
  async function changeOrder(orderId: string, data: { status?: "confirmed" | "preparing" | "completed" | "cancelled"; paymentStatus?: "manual_confirmed" }) {
    if (await run(() => updateOrder.mutateAsync({ orderId, data }))) await refresh();
  }
  async function togglePublished(product: ShopProduct) {
    if (await run(() => updateProduct.mutateAsync({ productId: product.id, data: { isPublished: !product.isPublished } }))) await refresh();
  }

  return <PageFrame>
    <AppHeader />
    <StorageNotice />
    <Text style={{ color: colors.mutedForeground, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginTop: 8 }}>VastMind marketplace</Text>
    <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: "800", marginTop: 5 }}>Shop</Text>
    <Text style={{ color: colors.mutedForeground, lineHeight: 20, marginTop: 5, marginBottom: 18 }}>Discover local products, manage your shop, and keep orders together.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
      {([["discover","Discover"],["my-shop","My shop"],["orders","Cart & orders"]] as const).map(([key,label]) =>
        <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: section === key }} onPress={() => setSection(key)} style={{ ...buttonStyle, backgroundColor: section === key ? colors.primary : colors.card, borderWidth: 1, borderColor: section === key ? colors.primary : colors.border }}>
          <Text style={{ color: section === key ? colors.primaryForeground : colors.foreground, fontWeight: "700" }}>{label}</Text>
        </Pressable>)}
    </ScrollView>

    {section === "discover" ? <>
      <TextInput accessibilityLabel="Search shop" placeholder="Search products, categories, sellers" placeholderTextColor={colors.mutedForeground} value={search} onChangeText={setSearch} style={input} />
      {products.isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 24 }} /> : null}
      {products.isError ? <Pressable onPress={() => void products.refetch()} style={{ padding: 18 }}><Text style={{ color: colors.destructive }}>Shop couldn't load. Tap to retry.</Text></Pressable> : null}
      {!products.isLoading && !products.isError && !products.data?.length ? <Text style={{ color: colors.mutedForeground, paddingVertical: 28, textAlign: "center" }}>No listings yet. Add the first product from My shop.</Text> : null}
      {products.data?.map(product => <View key={product.id} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, borderRadius: 20, marginBottom: 12 }}>
        {product.imageMedia ? <MobileMediaPreview media={product.imageMedia} /> : <View style={{ height: 120, borderRadius: 14, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.primary, fontSize: 28 }}>◈</Text></View>}
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: 12, textTransform: "uppercase" }}>{product.category}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 4 }}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "700", flex: 1 }}>{product.title}</Text><Text style={{ color: colors.foreground, fontWeight: "800" }}>{money(product.priceMinor, product.currency)}</Text></View>
        <Text numberOfLines={3} style={{ color: colors.mutedForeground, marginTop: 6 }}>{product.description || "A new product from this VastMind shop."}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 7 }}>Sold by {product.sellerName} · {product.inventory} available</Text>
        <Pressable disabled={product.inventory < 1 || product.sellerId === profile?.id} onPress={() => add(product)} style={{ ...buttonStyle, marginTop: 12, backgroundColor: colors.primary, opacity: product.inventory < 1 || product.sellerId === profile?.id ? 0.55 : 1 }}>
          <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{product.sellerId === profile?.id ? "Your listing" : product.inventory < 1 ? "Sold out" : "Add to cart"}</Text>
        </Pressable>
      </View>)}
    </> : null}

    {section === "my-shop" ? <>
      <SectionTitle title="Seller studio" />
      <Text style={{ color: colors.mutedForeground, lineHeight: 20, marginBottom: 12 }}>Publish products, add photos, and keep inventory up to date.</Text>
      <Pressable onPress={() => editorOpen ? setEditorOpen(false) : startEdit()} style={{ ...buttonStyle, backgroundColor: colors.primary, marginBottom: 14 }}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{editorOpen ? "Close editor" : "Add product"}</Text></Pressable>
      {editorOpen ? <View style={{ borderWidth: 1, borderColor: colors.border, padding: 14, borderRadius: 20, marginBottom: 14, backgroundColor: colors.card }}>
        <TextInput accessibilityLabel="Product name" placeholder="Product name" placeholderTextColor={colors.mutedForeground} maxLength={120} value={draft.title} onChangeText={title => setDraft({ ...draft, title })} style={input} />
        <TextInput accessibilityLabel="Product description" placeholder="Description" placeholderTextColor={colors.mutedForeground} maxLength={2000} multiline value={draft.description} onChangeText={description => setDraft({ ...draft, description })} style={[input, { minHeight: 76, textAlignVertical: "top" }]} />
        <TextInput accessibilityLabel="Category" placeholder="Category" placeholderTextColor={colors.mutedForeground} maxLength={60} value={draft.category} onChangeText={category => setDraft({ ...draft, category })} style={input} />
        <View style={{ flexDirection: "row", gap: 8 }}><TextInput accessibilityLabel="Price" keyboardType="decimal-pad" placeholder="Price" placeholderTextColor={colors.mutedForeground} value={draft.price} onChangeText={price => setDraft({ ...draft, price })} style={[input, { flex: 1 }]} /><TextInput accessibilityLabel="Currency" autoCapitalize="characters" maxLength={3} placeholder="USD" placeholderTextColor={colors.mutedForeground} value={draft.currency} onChangeText={currency => setDraft({ ...draft, currency })} style={[input, { width: 88 }]} /></View>
        <TextInput accessibilityLabel="Available stock" keyboardType="number-pad" placeholder="Stock quantity" placeholderTextColor={colors.mutedForeground} value={draft.inventory} onChangeText={inventory => setDraft({ ...draft, inventory })} style={input} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 10, marginBottom: 8 }}>
          <Text style={{ color: colors.foreground }}>{image ? "New photo uploaded" : editing?.imageMedia ? "Current product photo" : "Product photo (optional)"}</Text><MobileMediaPicker purpose="product" onChange={setImage} disabled={create.isPending || updateProduct.isPending} />
        </View>
        {image ? <MobileMediaPreview media={image} /> : null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.isPublished }} onPress={() => setDraft({ ...draft, isPublished: !draft.isPublished })} style={{ paddingVertical: 10 }}><Text style={{ color: colors.foreground }}>{draft.isPublished ? "✓ Published listing" : "○ Save as draft"}</Text></Pressable>
        <Pressable disabled={create.isPending || updateProduct.isPending} onPress={() => void saveProduct()} style={{ ...buttonStyle, backgroundColor: colors.primary }}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{create.isPending || updateProduct.isPending ? "Saving…" : editing ? "Save changes" : "Publish product"}</Text></Pressable>
      </View> : null}
      {products.isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 20 }} /> : null}
      {!products.isLoading && !products.data?.length ? <Text style={{ color: colors.mutedForeground, paddingVertical: 24, textAlign: "center" }}>Your shop is ready. Add your first product.</Text> : null}
      {products.data?.map(product => <View key={product.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10, backgroundColor: colors.card }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ flex: 1, color: colors.foreground, fontSize: 17, fontWeight: "700" }}>{product.title}</Text><Text style={{ color: colors.foreground, fontWeight: "700" }}>{money(product.priceMinor, product.currency)}</Text></View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 5 }}>{product.inventory} in stock · {product.isPublished ? "Published" : "Draft"}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable onPress={() => startEdit(product)} style={{ ...buttonStyle, flex: 1, backgroundColor: colors.secondary }}><Text style={{ color: colors.foreground, fontWeight: "600" }}>Edit</Text></Pressable>
          <Pressable onPress={() => void togglePublished(product)} style={{ ...buttonStyle, flex: 1, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.foreground }}>{product.isPublished ? "Unpublish" : "Publish"}</Text></Pressable>
        </View>
      </View>)}
    </> : null}

    {section === "orders" ? <>
      {cart.length ? <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, padding: 14, marginBottom: 18 }}>
        <SectionTitle title={`Cart · ${cart.reduce((sum, line) => sum + line.quantity, 0)} items`} />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 10 }}>One seller per order · {cart[0].product.sellerName}</Text>
        {cart.map(line => <View key={line.product.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 }}>
          <Text style={{ color: colors.foreground, flex: 1 }}>{line.quantity} × {line.product.title}</Text>
          <Pressable accessibilityLabel="Remove one item" onPress={() => setCart(items => items.flatMap(row => row.product.id !== line.product.id ? [row] : line.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []))}><Text style={{ color: colors.primary, fontWeight: "700" }}>−</Text></Pressable>
          <Pressable accessibilityLabel="Add one item" onPress={() => setCart(items => items.map(row => row.product.id === line.product.id ? { ...row, quantity: Math.min(row.product.inventory, row.quantity + 1) } : row))}><Text style={{ color: colors.primary, fontWeight: "700" }}>＋</Text></Pressable>
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>{money(line.product.priceMinor * line.quantity, line.product.currency)}</Text>
        </View>)}
        <TextInput accessibilityLabel="Note for seller" placeholder="Note for seller (optional)" placeholderTextColor={colors.mutedForeground} maxLength={500} value={note} onChangeText={setNote} style={input} />
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", textAlign: "right", marginBottom: 10 }}>Total · {money(cartTotal, currency)}</Text>
        <Pressable disabled={placeOrder.isPending} onPress={() => void checkout()} style={{ ...buttonStyle, backgroundColor: colors.primary }}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{placeOrder.isPending ? "Placing order…" : "Place order"}</Text></Pressable>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 9 }}>Payment is arranged directly with the seller. VastMind does not collect card details.</Text>
      </View> : null}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["buyer", "seller"] as const).map(value => <Pressable key={value} onPress={() => setScope(value)} style={{ ...buttonStyle, flex: 1, backgroundColor: scope === value ? colors.primary : colors.secondary }}><Text style={{ color: scope === value ? colors.primaryForeground : colors.foreground, fontWeight: "700" }}>{value === "buyer" ? "My purchases" : "Sales"}</Text></Pressable>)}
      </View>
      {orders.isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 20 }} /> : null}
      {!orders.isLoading && !orders.data?.length ? <Text style={{ color: colors.mutedForeground, paddingVertical: 24, textAlign: "center" }}>No {scope === "buyer" ? "purchases" : "sales"} yet.</Text> : null}
      {orders.data?.map(order => <NativeOrderCard key={order.id} order={order} seller={scope === "seller"} colors={colors} disabled={updateOrder.isPending} onUpdate={changeOrder} />)}
    </> : null}
    <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, marginVertical: 18 }}>Orders, products, and stock are managed in VastMind. Payments, refunds, taxes, shipping labels, and seller payouts are not active until a provider is connected.</Text>
  </PageFrame>;
}

function NativeOrderCard({ order, seller, colors, disabled, onUpdate }: { order: ShopOrder; seller: boolean; colors: ReturnType<typeof useColors>; disabled: boolean; onUpdate: (id: string, data: { status?: "confirmed" | "preparing" | "completed" | "cancelled"; paymentStatus?: "manual_confirmed" }) => void }) {
  const next = order.status === "pending" ? "confirmed" : order.status === "confirmed" ? "preparing" : order.status === "preparing" ? "completed" : null;
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10, backgroundColor: colors.card }}>
    <Text style={{ color: colors.mutedForeground, fontSize: 10, letterSpacing: 1 }}>ORDER {order.id.slice(0, 8).toUpperCase()}</Text>
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 5 }}><Text style={{ color: colors.foreground, fontWeight: "700", flex: 1 }}>{seller ? `From ${order.buyerName}` : `Sold by ${order.sellerName}`}</Text><Text style={{ color: colors.foreground, fontWeight: "800" }}>{money(order.totalMinor, order.currency)}</Text></View>
    <Text style={{ color: colors.primary, marginTop: 5 }}>{order.status} · {order.paymentStatus === "manual_confirmed" ? "payment recorded" : "payment not processed here"}</Text>
    {order.items.map(item => <Text key={`${order.id}-${item.productId}`} style={{ color: colors.mutedForeground, marginTop: 6 }}>{item.quantity} × {item.title}</Text>)}
    <Text style={{ color: colors.mutedForeground, lineHeight: 17, fontSize: 11, marginTop: 10 }}>Arrange payment directly with the seller; VastMind hasn't charged this order.</Text>
    {seller && order.paymentStatus === "awaiting_manual" && order.status !== "cancelled" ? <Pressable disabled={disabled} onPress={() => onUpdate(order.id, { paymentStatus: "manual_confirmed" })} style={{ ...buttonStyle, borderWidth: 1, borderColor: colors.border, marginTop: 10 }}><Text style={{ color: colors.foreground }}>Record payment received manually</Text></Pressable> : null}
    {seller && order.status === "pending" && order.paymentStatus === "awaiting_manual" ? <Pressable disabled={disabled} onPress={() => onUpdate(order.id, { status: "cancelled" })} style={{ ...buttonStyle, marginTop: 6 }}><Text style={{ color: colors.destructive }}>Cancel order</Text></Pressable> : null}
    {seller && next ? <Pressable disabled={disabled} onPress={() => onUpdate(order.id, { status: next })} style={{ ...buttonStyle, backgroundColor: colors.primary, marginTop: 6 }}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{next === "confirmed" ? "Confirm order" : next === "preparing" ? "Mark preparing" : "Mark complete"}</Text></Pressable> : null}
  </View>;
}
