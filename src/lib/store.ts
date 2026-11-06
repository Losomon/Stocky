import Dexie, { type Table } from "dexie";
import { useCallback, useEffect, useState } from "react";
import { BUSINESS_ID, onBusinessIdChange } from "../config";
import {
  buildArchive, buildCancel, buildCategoryCreate, buildPurchaseCancel, buildPurchaseCreate, buildPurchaseOrder, buildPurchaseUpdate, buildReceive, buildSupplierArchive, buildSupplierCreate, buildSupplierDelete, buildSupplierUpdate, nextPurchaseRef, buildCategoryDelete, buildCategoryRename, buildCount, buildProductCreate, buildProductDelete, buildProductUpdate, buildSale, nextReceiptNo,
  type AuditEntry, type BusinessProfile, type Category, type Customer, type StaffMember, type Fail, type Line, type Movement, type Payment, type Product, type ProductInput, type Purchase, type PurchaseInput, type PurchaseItem, type Receipt, type ReceiptItem, type Sale, type SaleItem, type StockCount, type Supplier, type SupplierInput, type Writes,
} from "./engine";
import { BACKUP_APP, BACKUP_FORMAT, BACKUP_TABLES, validateBackup, type BackupFile, type BackupSummary } from "./backup";
import { DEFAULT_BUSINESS, buildBusinessUpdate, buildSetup, buildCustomerArchive, buildCustomerCreate, buildCustomerDelete, buildCustomerUpdate, buildSetDeviceStaff, buildStaffArchive, buildStaffCreate, buildStaffDelete, deriveStaff, staffInUse, type CustomerInput } from "./people";
import { seed, type SeedData } from "./seed";
import { APP_VERSION } from "./version";

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
}));

const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const withStableIds = <T extends object>(rows: readonly T[]) => rows.map((row) => {
  const id = (row as T & { id?: unknown }).id;
  return { ...row, id: isUuid(id) ? id : uid() };
});

const TABLES = ["products", "categories", "movements", "sales", "saleItems", "counts", "audit", "suppliers", "purchases", "purchaseItems", "receipts", "receiptItems", "customers", "staff", "settings"] as const;

class StockDB extends Dexie {
  products!: Table<Product, string>; categories!: Table<Category, string>; movements!: Table<Movement, string>; sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>; counts!: Table<StockCount, string>; audit!: Table<AuditEntry, string>;
  suppliers!: Table<Supplier, string>; purchases!: Table<Purchase, string>; purchaseItems!: Table<PurchaseItem, string>; receipts!: Table<Receipt, string>; receiptItems!: Table<ReceiptItem, string>;
  customers!: Table<Customer, string>; staff!: Table<StaffMember, string>; settings!: Table<{ key: string; value: unknown }, string>;
  constructor(name = "stockly") {
    super(name);
    this.version(1).stores({ products: "id", movements: "++id,productId,ts" });
    this.version(2).stores({ products: "id", movements: "++id,productId,ts,refId", sales: "id,ts,receiptNo", saleItems: "++id,saleId,productId", counts: "id,ts,productId", audit: "++id,ts,entity" })
      .upgrade((tx) => Promise.all([tx.table("products").clear(), tx.table("movements").clear()]));
    // v3: product IDs become UUID strings, products gain category/unit/archive fields, categories added.
    // Every earlier version held demo data only, so it is cleared and re-seeded. A real-data migration will be needed once real data exists.
    this.version(3).stores({ products: "id,sku,categoryId", categories: "id" })
      .upgrade((tx) => Promise.all(["products", "movements", "sales", "saleItems", "counts", "audit"].map((t) => tx.table(t).clear()))); // fixed list: never reference TABLES in a migration, it grows
    // v4: suppliers, purchases and receipts. Demo data is reseeded so the purchases and stock agree.
    this.version(4).stores({ suppliers: "id,name", purchases: "id,ts,supplierId", purchaseItems: "++id,purchaseId,productId", receipts: "id,purchaseId,ts", receiptItems: "++id,receiptId,productId" })
      .upgrade((tx) => Promise.all(["products", "categories", "movements", "sales", "saleItems", "counts", "audit"].map((t) => tx.table(t).clear())));
    // v5: customers, staff and settings. Purely additive, so nobody's existing data is touched. Missing staff and settings are filled in by ensureDefaults().
    this.version(5).stores({ customers: "id,name,phone", staff: "id,name", settings: "key" });
    // v6: migrate numeric child/ledger keys to stable UUIDs without changing or dropping their rows.
    this.version(6).stores({
      products: "id", movements: "++id,productId,ts,refId", sales: "id,ts,receiptNo", saleItems: "++id,saleId,productId",
      counts: "id,ts,productId", audit: "++id,ts,entity", suppliers: "id,name", purchases: "id,ts,supplierId",
      purchaseItems: "++id,purchaseId,productId", receipts: "id,purchaseId,ts", receiptItems: "++id,receiptId,productId",
      customers: "id,name,phone", staff: "id,name", settings: "key",
    }).upgrade(async (tx) => {
      for (const name of ["movements", "saleItems", "purchaseItems", "receiptItems", "audit"]) {
        const table = tx.table(name);
        const rows = await table.toArray();
        if (!rows.length) continue;
        await table.clear();
        await table.bulkPut(withStableIds(rows));
      }
    });
  }
}
const databaseName = (businessId: string) => businessId === "demo-business" ? "stockly" : `stockly-${businessId}`;
let db = new StockDB(databaseName(BUSINESS_ID));
onBusinessIdChange((businessId) => {
  const nextName = databaseName(businessId);
  if (db.name === nextName) return;
  db.close();
  db = new StockDB(nextName);
  mode = "device";
  mem = null;
});
type MemState = SeedData & { onboarded: boolean; demo: boolean; lastBackupAt: number | null };
let mem: MemState | null = null; // fallback when IndexedDB is blocked
const emptyMem = (): MemState => ({ categories: [], products: [], movements: [], sales: [], saleItems: [], counts: [], audit: [], suppliers: [], purchases: [], purchaseItems: [], receipts: [], receiptItems: [], customers: [], staff: [], business: DEFAULT_BUSINESS, deviceStaffId: "", onboarded: false, demo: false, lastBackupAt: null });

let mode: "device" | "memory" = "device";

export interface Snapshot { P: Product[]; CAT: Category[]; M: Movement[]; S: Sale[]; SI: SaleItem[]; C: StockCount[]; SUP: Supplier[]; PU: Purchase[]; PI: PurchaseItem[]; RC: Receipt[]; RI: ReceiptItem[]; CUS: Customer[]; STAFF: StaffMember[]; business: BusinessProfile; deviceStaffId: string | null; setup: boolean; demo: boolean; lastBackupAt: number | null; mode: "device" | "memory" }
export type Result<T> = { ok: true; value: T } | Fail;
export interface StockCtx {
  state: Snapshot | null;
  recordSale: (lines: Line[], payment: Payment, customerId?: string) => Promise<Result<{ sale: Sale; items: SaleItem[] }>>;
  cancelSale: (saleId: string) => Promise<Result<object>>;
  recordCount: (productId: string, counted: number, reason: string) => Promise<Result<{ count: StockCount }>>;
  createProduct: (input: ProductInput) => Promise<Result<{ product: Product }>>;
  updateProduct: (id: string, input: ProductInput) => Promise<Result<{ product: Product }>>;
  setArchived: (id: string, archived: boolean) => Promise<Result<{ product: Product }>>;
  deleteProduct: (id: string) => Promise<Result<object>>;
  createCategory: (name: string) => Promise<Result<{ category: Category }>>;
  renameCategory: (id: string, name: string) => Promise<Result<{ category: Category }>>;
  deleteCategory: (id: string) => Promise<Result<object>>;
  createSupplier: (input: SupplierInput) => Promise<Result<{ supplier: Supplier }>>;
  updateSupplier: (id: string, input: SupplierInput) => Promise<Result<{ supplier: Supplier }>>;
  setSupplierArchived: (id: string, archived: boolean) => Promise<Result<{ supplier: Supplier }>>;
  deleteSupplier: (id: string) => Promise<Result<object>>;
  createPurchase: (input: PurchaseInput, status: "draft" | "ordered") => Promise<Result<{ purchase: Purchase }>>;
  updatePurchase: (id: string, input: PurchaseInput, status: "draft" | "ordered") => Promise<Result<{ purchase: Purchase }>>;
  orderPurchase: (id: string) => Promise<Result<{ purchase: Purchase }>>;
  cancelPurchase: (id: string) => Promise<Result<{ purchase: Purchase }>>;
  /** receiptId comes from the screen and is reused on retry, so a repeated tap can never add the stock twice. */
  receivePurchase: (id: string, receiptId: string, lines: { productId: string; qty: number }[], note?: string) => Promise<Result<{ receipt: Receipt }>>;
  createCustomer: (input: CustomerInput) => Promise<Result<{ customer: Customer }>>;
  updateCustomer: (id: string, input: CustomerInput) => Promise<Result<{ customer: Customer }>>;
  setCustomerArchived: (id: string, archived: boolean) => Promise<Result<{ customer: Customer }>>;
  deleteCustomer: (id: string) => Promise<Result<object>>;
  createStaff: (name: string) => Promise<Result<{ staffMember: StaffMember }>>;
  setStaffArchived: (id: string, archived: boolean) => Promise<Result<{ staffMember: StaffMember }>>;
  deleteStaff: (id: string) => Promise<Result<object>>;
  /** Who is using this device. New sales, counts and deliveries are recorded under this person. */
  setDeviceStaff: (id: string) => Promise<Result<object>>;
  updateBusiness: (input: BusinessProfile) => Promise<Result<object>>;
  /** First run: create the shop and the first person. Starts empty, no demo data. */
  completeSetup: (shop: string, you: string) => Promise<Result<object>>;
  loadDemo: () => Promise<void>;
  /** Deletes everything on this device and returns to the setup screen. */
  eraseAll: () => Promise<void>;
  exportBackup: () => Promise<BackupFile>;
  restoreBackup: (raw: unknown) => Promise<Result<BackupSummary>>;
  markBackedUp: () => Promise<void>;
}
/** The name actions are recorded under on this device. */
export const deviceStaffName = (s: Pick<Snapshot, "STAFF" | "deviceStaffId">) =>
  (s.STAFF.find((x) => x.id === s.deviceStaffId && !x.archived) ?? s.STAFF.find((x) => !x.archived))?.name ?? "Unassigned";
async function readSettings() {
  const rows = await db.settings.toArray();
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return { business: (get("business") as BusinessProfile | undefined) ?? DEFAULT_BUSINESS, deviceStaffId: (get("deviceStaffId") as string | undefined) ?? null, setup: !get("onboarded"), demo: get("demo") === true, lastBackupAt: (get("lastBackupAt") as number | undefined) ?? null };
}
async function read(): Promise<Snapshot> {
  if (mode === "device") return { mode, P: await db.products.toArray(), CAT: await db.categories.toArray(), M: await db.movements.toArray(), S: await db.sales.toArray(), SI: await db.saleItems.toArray(), C: await db.counts.toArray(), SUP: await db.suppliers.toArray(), PU: await db.purchases.toArray(), PI: await db.purchaseItems.toArray(), RC: await db.receipts.toArray(), RI: await db.receiptItems.toArray(), CUS: await db.customers.toArray(), STAFF: await db.staff.toArray(), ...(await readSettings()) };
  if (!mem) return { mode, P: [], CAT: [], M: [], S: [], SI: [], C: [], SUP: [], PU: [], PI: [], RC: [], RI: [], CUS: [], STAFF: [], business: DEFAULT_BUSINESS, deviceStaffId: null, setup: true, demo: false, lastBackupAt: null };
  const m = mem; return { mode, setup: !m.onboarded, demo: m.demo, lastBackupAt: m.lastBackupAt, P: [...m.products], CAT: [...m.categories], M: [...m.movements], S: [...m.sales], SI: [...m.saleItems], C: [...m.counts], SUP: [...m.suppliers], PU: [...m.purchases], PI: [...m.purchaseItems], RC: [...m.receipts], RI: [...m.receiptItems], CUS: [...m.customers], STAFF: [...m.staff], business: m.business, deviceStaffId: m.deviceStaffId };
}
async function write(w: Writes) {
  if (mode === "device") {
    if (w.sale) await db.sales.add(w.sale);
    if (w.items?.length) await db.saleItems.bulkAdd(w.items);
    if (w.movements.length) await db.movements.bulkAdd(w.movements);
    if (w.count) await db.counts.add(w.count);
    if (w.product) await db.products.put(w.product);
    if (w.deleteProductId) await db.products.delete(w.deleteProductId);
    if (w.category) await db.categories.put(w.category);
    if (w.deleteCategoryId) await db.categories.delete(w.deleteCategoryId);
    if (w.supplier) await db.suppliers.put(w.supplier);
    if (w.deleteSupplierId) await db.suppliers.delete(w.deleteSupplierId);
    if (w.purchase) await db.purchases.put(w.purchase);
    if (w.replaceItemsFor) await db.purchaseItems.where("purchaseId").equals(w.replaceItemsFor).delete();
    if (w.purchaseItems?.length) await db.purchaseItems.bulkAdd(w.purchaseItems);
    if (w.receipt) await db.receipts.add(w.receipt);
    if (w.receiptItems?.length) await db.receiptItems.bulkAdd(w.receiptItems);
    if (w.customer) await db.customers.put(w.customer);
    if (w.deleteCustomerId) await db.customers.delete(w.deleteCustomerId);
    if (w.staffMember) await db.staff.put(w.staffMember);
    if (w.deleteStaffId) await db.staff.delete(w.deleteStaffId);
    if (w.setting) await db.settings.put(w.setting);
    if (w.settings?.length) await db.settings.bulkPut(w.settings);
    if (w.audit.length) await db.audit.bulkAdd(w.audit);
    if (w.voidSaleId) await db.sales.update(w.voidSaleId, { status: "cancelled" });
    return;
  }
  const m = (mem ??= emptyMem());
  if (w.sale) m.sales.push(w.sale);
  w.items?.forEach((i) => m.saleItems.push(i));
  w.movements.forEach((x) => m.movements.push(x));
  if (w.count) m.counts.push(w.count);
  const put = <T extends { id: string }>(arr: T[], x: T) => { const i = arr.findIndex((r) => r.id === x.id); if (i >= 0) arr[i] = x; else arr.push(x); };
  if (w.product) put(m.products, w.product);
  if (w.deleteProductId) m.products = m.products.filter((p) => p.id !== w.deleteProductId);
  if (w.category) put(m.categories, w.category);
  if (w.deleteCategoryId) m.categories = m.categories.filter((c) => c.id !== w.deleteCategoryId);
  if (w.supplier) put(m.suppliers, w.supplier);
  if (w.deleteSupplierId) m.suppliers = m.suppliers.filter((x) => x.id !== w.deleteSupplierId);
  if (w.purchase) put(m.purchases, w.purchase);
  if (w.replaceItemsFor) m.purchaseItems = m.purchaseItems.filter((i) => i.purchaseId !== w.replaceItemsFor);
  w.purchaseItems?.forEach((i) => m.purchaseItems.push(i));
  if (w.receipt) m.receipts.push(w.receipt);
  w.receiptItems?.forEach((i) => m.receiptItems.push(i));
  if (w.customer) put(m.customers, w.customer);
  if (w.deleteCustomerId) m.customers = m.customers.filter((x) => x.id !== w.deleteCustomerId);
  if (w.staffMember) put(m.staff, w.staffMember);
  if (w.deleteStaffId) m.staff = m.staff.filter((x) => x.id !== w.deleteStaffId);
  for (const st of [...(w.setting ? [w.setting] : []), ...(w.settings ?? [])]) {
    if (st.key === "business") m.business = st.value as BusinessProfile;
    if (st.key === "deviceStaffId") m.deviceStaffId = st.value as string;
    if (st.key === "onboarded") m.onboarded = st.value as boolean;
    if (st.key === "demo") m.demo = st.value as boolean;
    if (st.key === "lastBackupAt") m.lastBackupAt = st.value as number;
  }
  m.audit.push(...w.audit);
  if (w.voidSaleId) { const s = m.sales.find((x) => x.id === w.voidSaleId); if (s) s.status = "cancelled"; }
}

/** Validate against the data as it is *inside* the transaction, then write everything or nothing. */
async function transact<T extends object>(plan: (s: Snapshot) => ({ ok: true } & Writes & T) | Fail): Promise<Result<T>> {
  const run = async (): Promise<Result<T>> => {
    const r = plan(await read());
    if (!r.ok) return r;
    if (r.items) r.items = withStableIds(r.items);
    r.movements = withStableIds(r.movements);
    if (r.purchaseItems) r.purchaseItems = withStableIds(r.purchaseItems);
    if (r.receiptItems) r.receiptItems = withStableIds(r.receiptItems);
    r.audit = withStableIds(r.audit);
    await write(r);
    return { ok: true, value: r as unknown as T };
  };
  try {
    return mode === "device" ? await db.transaction("rw", TABLES.map((t) => db[t]), run) : await run();
  } catch { return { ok: false, errors: ["Could not save. Nothing was changed. Please try again."] }; }
}

/** Data saved before staff and settings existed: one person for each name on the records, and sensible defaults. */
async function ensureDefaults() {
  if ((await db.staff.count()) === 0) {
    const names = [...(await db.movements.toArray()).map((m) => m.staff), ...(await db.sales.toArray()).map((x) => x.staff), ...(await db.counts.toArray()).map((c) => c.staff)];
    await db.staff.bulkAdd(deriveStaff(names.length ? names : ["Owner"], BUSINESS_ID, Date.now()));
  }
  if (!(await db.settings.get("business"))) await db.settings.put({ key: "business", value: DEFAULT_BUSINESS });
  const dev = await db.settings.get("deviceStaffId");
  if (!dev || !(await db.staff.get(dev.value as string))) { const first = (await db.staff.toArray()).find((x) => !x.archived); if (first) await db.settings.put({ key: "deviceStaffId", value: first.id }); }
}

async function load(): Promise<Snapshot> {
  try {
    if (await db.settings.get("onboarded")) await ensureDefaults();
    else if ((await db.products.count()) > 0) { // saved before first-run setup existed: that was demo data
      await ensureDefaults();
      await db.settings.bulkPut([{ key: "onboarded", value: true }, { key: "demo", value: true }]);
    }
    mode = "device";
    void navigator.storage?.persist?.().catch(() => {}); // ask the browser not to clear this data when space is low
  } catch (e) { console.error("Local database unavailable, using memory only:", e); mem = mem ?? emptyMem(); mode = "memory"; }
  return read();
}

async function loadDemoData() {
  const s = seed();
  s.movements = withStableIds(s.movements);
  s.saleItems = withStableIds(s.saleItems);
  s.audit = withStableIds(s.audit);
  s.purchaseItems = withStableIds(s.purchaseItems);
  s.receiptItems = withStableIds(s.receiptItems);
  if (mode === "device") {
    await db.transaction("rw", TABLES.map((t) => db[t]), async () => {
      await Promise.all(TABLES.map((t) => db[t].clear()));
      await db.categories.bulkAdd(s.categories); await db.products.bulkAdd(s.products); await db.movements.bulkAdd(s.movements);
      await db.sales.bulkAdd(s.sales); await db.saleItems.bulkAdd(s.saleItems); await db.counts.bulkAdd(s.counts); await db.audit.bulkAdd(s.audit);
      await db.suppliers.bulkAdd(s.suppliers); await db.purchases.bulkAdd(s.purchases); await db.purchaseItems.bulkAdd(s.purchaseItems);
      await db.receipts.bulkAdd(s.receipts); await db.receiptItems.bulkAdd(s.receiptItems);
      await db.customers.bulkAdd(s.customers); await db.staff.bulkAdd(s.staff);
      await db.settings.bulkAdd([{ key: "business", value: s.business }, { key: "deviceStaffId", value: s.deviceStaffId }, { key: "onboarded", value: true }, { key: "demo", value: true }]);
    });
  } else mem = { ...s, onboarded: true, demo: true, lastBackupAt: null };
}
async function eraseEverything() {
  if (mode === "device") await db.transaction("rw", TABLES.map((t) => db[t]), () => Promise.all(TABLES.map((t) => db[t].clear())));
  else mem = null;
}
async function exportBackupFile(): Promise<BackupFile> {
  const s = await read(), audit = mode === "device" ? await db.audit.toArray() : [...(mem?.audit ?? [])];
  const data = { products: s.P, categories: s.CAT, movements: s.M, sales: s.S, saleItems: s.SI, counts: s.C, audit, suppliers: s.SUP, purchases: s.PU, purchaseItems: s.PI, receipts: s.RC, receiptItems: s.RI, customers: s.CUS, staff: s.STAFF };
  return JSON.parse(JSON.stringify({ app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: Date.now(), appVersion: APP_VERSION, demo: s.demo, business: s.business, deviceStaffId: s.deviceStaffId, data }));
}
/** Replaces everything on this device with the backup, all or nothing. */
async function restoreBackupFile(raw: unknown): Promise<Result<BackupSummary>> {
  const v = validateBackup(raw);
  if (!v.ok) return { ok: false, errors: v.errors };
  const b = v.backup, me = b.deviceStaffId ?? (b.data.staff.find((x) => x.archived === false)?.id as string);
  for (const t of ["movements", "saleItems", "purchaseItems", "receiptItems", "audit"] as const) {
    b.data[t] = withStableIds(b.data[t]);
  }
  const settings = [{ key: "business", value: b.business }, { key: "deviceStaffId", value: me }, { key: "onboarded", value: true }, { key: "demo", value: b.demo }, { key: "lastBackupAt", value: b.exportedAt || Date.now() }];
  try {
    if (mode === "device") {
      await db.transaction("rw", TABLES.map((t) => db[t]), async () => {
        await Promise.all(TABLES.map((t) => db[t].clear()));
        for (const t of BACKUP_TABLES) if (b.data[t].length) await (db[t] as Table<unknown, unknown>).bulkPut(b.data[t]);
        await db.settings.bulkPut(settings);
      });
    } else {
      const d = b.data as unknown as Record<string, unknown[]>;
      mem = { ...emptyMem(), categories: d.categories as never, products: d.products as never, movements: d.movements as never, sales: d.sales as never, saleItems: d.saleItems as never, counts: d.counts as never, audit: d.audit as never, suppliers: d.suppliers as never, purchases: d.purchases as never, purchaseItems: d.purchaseItems as never, receipts: d.receipts as never, receiptItems: d.receiptItems as never, customers: d.customers as never, staff: d.staff as never, business: b.business, deviceStaffId: me, onboarded: true, demo: b.demo, lastBackupAt: b.exportedAt || Date.now() };
    }
  } catch { return { ok: false, errors: ["Could not restore the backup. Nothing was changed."] }; }
  return { ok: true, value: v.summary };
}
async function stampBackup() {
  const now = Date.now();
  if (mode === "device") await db.settings.put({ key: "lastBackupAt", value: now }); else if (mem) mem.lastBackupAt = now;
}

export function useStock(): StockCtx {
  const [state, setState] = useState<Snapshot | null>(null);
  const refresh = useCallback(async () => setState(await load()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => onBusinessIdChange(() => {
    setState(null);
    void refresh();
  }), [refresh]);
  const done = async <T,>(r: Result<T>) => { if (r.ok) await refresh(); return r; };
  const ctxOf = (s: Snapshot) => ({ businessId: BUSINESS_ID, staff: deviceStaffName(s) });
  const find = <T extends { id: string }>(arr: T[], id: string) => arr.find((x) => x.id === id);

  return {
    state,
    recordSale: async (lines, payment, customerId) => { const id = uid(); return done(await transact<{ sale: Sale; items: SaleItem[] }>((s) => s.S.some((x) => x.id === id) ? { ok: false, errors: ["This sale was already recorded."] } : buildSale({ ...ctxOf(s), id, receiptNo: nextReceiptNo(s.S), lines, P: s.P, M: s.M, payment, now: Date.now(), customerId, CUS: s.CUS }))); },
    cancelSale: async (saleId) => done(await transact<object>((s) => { const sale = find(s.S, saleId); return sale ? buildCancel({ ...ctxOf(s), sale, items: s.SI.filter((i) => i.saleId === saleId), now: Date.now() }) : { ok: false, errors: ["Sale not found."] }; })),
    recordCount: async (productId, counted, reason) => done(await transact<{ count: StockCount }>((s) => { const product = find(s.P, productId); return product ? buildCount({ ...ctxOf(s), id: uid(), product, M: s.M, counted, reason, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    createProduct: async (input) => done(await transact<{ product: Product }>((s) => buildProductCreate({ ...ctxOf(s), id: uid(), input, P: s.P, C: s.CAT, now: Date.now() }))),
    updateProduct: async (id, input) => done(await transact<{ product: Product }>((s) => { const product = find(s.P, id); return product ? buildProductUpdate({ ...ctxOf(s), product, input, P: s.P, C: s.CAT, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    setArchived: async (id, archived) => done(await transact<{ product: Product }>((s) => { const product = find(s.P, id); return product ? buildArchive({ ...ctxOf(s), product, archived, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    deleteProduct: async (id) => done(await transact<object>((s) => { const product = find(s.P, id); return product ? buildProductDelete({ ...ctxOf(s), product, M: s.M, SI: s.SI, C: s.C, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    createCategory: async (name) => done(await transact<{ category: Category }>((s) => buildCategoryCreate({ ...ctxOf(s), id: uid(), name, C: s.CAT, now: Date.now() }))),
    renameCategory: async (id, name) => done(await transact<{ category: Category }>((s) => { const category = find(s.CAT, id); return category ? buildCategoryRename({ ...ctxOf(s), category, name, C: s.CAT, now: Date.now() }) : { ok: false, errors: ["Category not found."] }; })),
    deleteCategory: async (id) => done(await transact<object>((s) => { const category = find(s.CAT, id); return category ? buildCategoryDelete({ ...ctxOf(s), category, P: s.P, now: Date.now() }) : { ok: false, errors: ["Category not found."] }; })),
    createSupplier: async (input) => done(await transact<{ supplier: Supplier }>((s) => buildSupplierCreate({ ...ctxOf(s), id: uid(), input, SUP: s.SUP, now: Date.now() }))),
    updateSupplier: async (id, input) => done(await transact<{ supplier: Supplier }>((s) => { const supplier = find(s.SUP, id); return supplier ? buildSupplierUpdate({ ...ctxOf(s), supplier, input, SUP: s.SUP, now: Date.now() }) : { ok: false, errors: ["Supplier not found."] }; })),
    setSupplierArchived: async (id, archived) => done(await transact<{ supplier: Supplier }>((s) => { const supplier = find(s.SUP, id); return supplier ? buildSupplierArchive({ ...ctxOf(s), supplier, archived, now: Date.now() }) : { ok: false, errors: ["Supplier not found."] }; })),
    deleteSupplier: async (id) => done(await transact<object>((s) => { const supplier = find(s.SUP, id); return supplier ? buildSupplierDelete({ ...ctxOf(s), supplier, PU: s.PU, now: Date.now() }) : { ok: false, errors: ["Supplier not found."] }; })),
    createPurchase: async (input, status) => done(await transact<{ purchase: Purchase }>((s) => buildPurchaseCreate({ ...ctxOf(s), id: uid(), ref: nextPurchaseRef(s.PU), input, status, SUP: s.SUP, P: s.P, now: Date.now() }))),
    updatePurchase: async (id, input, status) => done(await transact<{ purchase: Purchase }>((s) => { const purchase = find(s.PU, id); return purchase ? buildPurchaseUpdate({ ...ctxOf(s), purchase, input, status, SUP: s.SUP, P: s.P, RC: s.RC, now: Date.now() }) : { ok: false, errors: ["Purchase not found."] }; })),
    orderPurchase: async (id) => done(await transact<{ purchase: Purchase }>((s) => { const purchase = find(s.PU, id); return purchase ? buildPurchaseOrder({ ...ctxOf(s), purchase, now: Date.now() }) : { ok: false, errors: ["Purchase not found."] }; })),
    cancelPurchase: async (id) => done(await transact<{ purchase: Purchase }>((s) => { const purchase = find(s.PU, id); return purchase ? buildPurchaseCancel({ ...ctxOf(s), purchase, RC: s.RC, now: Date.now() }) : { ok: false, errors: ["Purchase not found."] }; })),
    receivePurchase: async (id, receiptId, lines, note) => done(await transact<{ receipt: Receipt }>((s) => {
      if (s.RC.some((r) => r.id === receiptId)) return { ok: false, errors: ["This delivery was already recorded."] };
      const purchase = find(s.PU, id);
      return purchase ? buildReceive({ ...ctxOf(s), id: receiptId, purchase, PI: s.PI, RC: s.RC, RI: s.RI, lines, note, now: Date.now() }) : { ok: false, errors: ["Purchase not found."] };
    })),
    createCustomer: async (input) => done(await transact<{ customer: Customer }>((s) => buildCustomerCreate({ ...ctxOf(s), id: uid(), input, CUS: s.CUS, now: Date.now() }))),
    updateCustomer: async (id, input) => done(await transact<{ customer: Customer }>((s) => { const customer = find(s.CUS, id); return customer ? buildCustomerUpdate({ ...ctxOf(s), customer, input, CUS: s.CUS, now: Date.now() }) : { ok: false, errors: ["Customer not found."] }; })),
    setCustomerArchived: async (id, archived) => done(await transact<{ customer: Customer }>((s) => { const customer = find(s.CUS, id); return customer ? buildCustomerArchive({ ...ctxOf(s), customer, archived, now: Date.now() }) : { ok: false, errors: ["Customer not found."] }; })),
    deleteCustomer: async (id) => done(await transact<object>((s) => { const customer = find(s.CUS, id); return customer ? buildCustomerDelete({ ...ctxOf(s), customer, S: s.S, now: Date.now() }) : { ok: false, errors: ["Customer not found."] }; })),
    createStaff: async (name) => done(await transact<{ staffMember: StaffMember }>((s) => buildStaffCreate({ ...ctxOf(s), id: uid(), name, STAFF: s.STAFF, now: Date.now() }))),
    setStaffArchived: async (id, archived) => done(await transact<{ staffMember: StaffMember }>((s) => { const staffMember = find(s.STAFF, id); return staffMember ? buildStaffArchive({ ...ctxOf(s), staffMember, archived, deviceStaffId: s.deviceStaffId, STAFF: s.STAFF, now: Date.now() }) : { ok: false, errors: ["Person not found."] }; })),
    deleteStaff: async (id) => done(await transact<object>((s) => { const staffMember = find(s.STAFF, id); return staffMember ? buildStaffDelete({ ...ctxOf(s), staffMember, inUse: staffInUse(staffMember.name, { M: s.M, S: s.S, C: s.C, receiptStaff: s.RC.map((r) => r.staff) }), deviceStaffId: s.deviceStaffId, now: Date.now() }) : { ok: false, errors: ["Person not found."] }; })),
    setDeviceStaff: async (id) => done(await transact<object>((s) => { const staffMember = find(s.STAFF, id); return staffMember ? buildSetDeviceStaff({ ...ctxOf(s), staffMember, now: Date.now() }) : { ok: false, errors: ["Person not found."] }; })),
    updateBusiness: async (input) => done(await transact<object>((s) => buildBusinessUpdate({ ...ctxOf(s), input, now: Date.now() }))),
    completeSetup: async (shop, you) => done(await transact<object>(() => buildSetup({ businessId: BUSINESS_ID, id: uid(), shop, you, now: Date.now() }))),
    loadDemo: async () => { await loadDemoData(); await refresh(); },
    eraseAll: async () => { await eraseEverything(); await refresh(); },
    exportBackup: exportBackupFile,
    restoreBackup: async (raw) => done(await restoreBackupFile(raw)),
    markBackedUp: async () => { await stampBackup(); await refresh(); },
  };
}

/** Exposed for tests only. */
export const _internals = {
  get db() { return db; },
  load, transact, uid, loadDemoData, eraseEverything, exportBackupFile, restoreBackupFile, stampBackup,
  _internals_closeAndReopen: async () => { db.close(); await db.open(); },
};
