import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

describe("store (IndexedDB)", () => {
  it("upgrades an old v1 demo database, then seeds and writes atomically", async () => {
    // an existing v1 database like the first dashboard build created
    const old = new Dexie("stockly");
    old.version(1).stores({ products: "id", movements: "++id,productId,ts" });
    await old.table("products").add({ id: 99, name: "old" });
    await old.table("movements").add({ productId: 99, type: "sale", qty: -1, ts: 1, staff: "x" });
    old.close();

    const { _internals: s } = await import("./store");
    const { buildSale, inventory, nextReceiptNo } = await import("./engine");

    const fresh = await s.load();
    expect(fresh.mode).toBe("device");
    expect(fresh.setup).toBe(true); // the old demo rows were cleared by the upgrade, and a fresh install does NOT load demo data by itself
    expect(fresh.P).toHaveLength(0);
    await s.loadDemoData();
    const snap = await s.load();
    expect(snap.setup).toBe(false); expect(snap.demo).toBe(true);
    expect(snap.P.some((p) => p.name === "old")).toBe(false); // old demo data cleared
    expect(snap.P).toHaveLength(10);
    expect(snap.CAT.length).toBeGreaterThan(0);
    expect(snap.S.length).toBeGreaterThan(20);

    const stockOf = (sn: typeof snap, id: string) => inventory(sn.P, sn.M).find((p) => p.id === id)!.stock;
    const before = stockOf(snap, "p7"); // Maize flour: plenty in stock
    const sell = (qty: number, id = s.uid()) => s.transact<object>((x) =>
      x.S.some((r) => r.id === id) ? { ok: false, errors: ["dup"] }
        : buildSale({ businessId: "t", id, receiptNo: nextReceiptNo(x.S), lines: [{ productId: "p7", qty }], P: x.P, M: x.M, staff: "J", payment: "cash", now: Date.now() }));

    // a good sale writes the sale, its items and its movements together
    const id = s.uid();
    expect((await sell(2, id)).ok).toBe(true);
    const after = await s.load();
    expect(after.S.some((r) => r.id === id)).toBe(true);
    expect(after.SI.filter((i) => i.saleId === id)).toHaveLength(1);
    expect(stockOf(after, "p7")).toBe(before - 2);

    // a duplicate id is refused and nothing changes
    expect((await sell(1, id)).ok).toBe(false);
    expect((await s.load()).S.length).toBe(after.S.length);

    // overselling is refused and nothing changes
    const r = await sell(before + 500);
    expect(r.ok).toBe(false);
    const final = await s.load();
    expect(final.S.length).toBe(after.S.length);
    expect(final.M.length).toBe(after.M.length);

    // selling the last units twice at the same time: only one can win
    const left = stockOf(final, "p7");
    const [a, b] = await Promise.all([sell(left), sell(left)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(stockOf(await s.load(), "p7")).toBe(0);
  });

  it("saves products and categories with the same safety rules", async () => {
    const { _internals: s } = await import("./store");
    const E = await import("./engine");
    const mk = (over: Partial<import("./engine").ProductInput> = {}) => s.transact<{ product: import("./engine").Product }>((x) =>
      E.buildProductCreate({ businessId: "t", id: s.uid(), input: { name: "Test item", sku: "TEST1", unit: "pack", cost: 10, price: 15, min: 2, openingStock: 5, ...over }, P: x.P, C: x.CAT, staff: "J", now: Date.now() }));

    const start = await s.load();
    const r = await mk();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.value.product.id;
    let snap = await s.load();
    expect(snap.P).toHaveLength(start.P.length + 1);
    expect(E.inventory(snap.P, snap.M).find((p) => p.id === id)!.stock).toBe(5); // from the opening movement

    expect((await mk({ sku: "test1" })).ok).toBe(false); // duplicate SKU, any case
    expect((await s.load()).P).toHaveLength(snap.P.length);

    // has history (opening stock), so deleting is refused; archiving works and keeps history
    const del = await s.transact<object>((x) => E.buildProductDelete({ businessId: "t", product: x.P.find((p) => p.id === id)!, M: x.M, SI: x.SI, C: x.C, staff: "J", now: 1 }));
    expect(del.ok).toBe(false);
    const arc = await s.transact<object>((x) => E.buildArchive({ businessId: "t", product: x.P.find((p) => p.id === id)!, archived: true, staff: "J", now: 1 }));
    expect(arc.ok).toBe(true);
    snap = await s.load();
    expect(snap.P.find((p) => p.id === id)!.archived).toBe(true);

    // a category in use can't be deleted; an unused one can
    const used = snap.CAT.find((c) => c.id === "c-groc")!;
    expect((await s.transact<object>((x) => E.buildCategoryDelete({ businessId: "t", category: used, P: x.P, staff: "J", now: 1 }))).ok).toBe(false);
    const made = await s.transact<{ category: import("./engine").Category }>((x) => E.buildCategoryCreate({ businessId: "t", id: s.uid(), name: "Temp", C: x.CAT, staff: "J", now: 1 }));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const cat = made.value.category;
    expect((await s.transact<object>((x) => E.buildCategoryDelete({ businessId: "t", category: cat, P: x.P, staff: "J", now: 1 }))).ok).toBe(true);
    expect((await s.load()).CAT.some((c) => c.id === cat.id)).toBe(false);
  });

  it("receives purchases safely: partial, no double counting, all-or-nothing, retry-proof", async () => {
    const { _internals: s } = await import("./store");
    const E = await import("./engine");
    const stock = (sn: Awaited<ReturnType<typeof s.load>>, id: string) => E.inventory(sn.P, sn.M).find((p) => p.id === id)!.stock;
    const supId = s.uid(), poId = s.uid();
    const run = <T extends object>(plan: Parameters<typeof s.transact<T>>[0]) => s.transact<T>(plan);

    let snap = await s.load();
    // demo data: PO-1002 is partially received (50 of 80 milk), PO-1003 is ordered, PO-1004 is a draft
    const st = (ref: string) => { const p = snap.PU.find((x) => x.ref === ref)!; return E.purchaseStatus(p, snap.PI, snap.RC, snap.RI); };
    expect([st("PO-1001"), st("PO-1002"), st("PO-1003"), st("PO-1004")]).toEqual(["received", "partial", "ordered", "draft"]);
    expect(stock(snap, "p2")).toBe(5);

    // a new supplier and a draft purchase: stock does not move
    expect((await run<object>((x) => E.buildSupplierCreate({ businessId: "t", id: supId, input: { name: "Test Supplier" }, SUP: x.SUP, staff: "J", now: 1 }))).ok).toBe(true);
    const made = await run<object>((x) => E.buildPurchaseCreate({ businessId: "t", id: poId, ref: E.nextPurchaseRef(x.PU), input: { supplierId: supId, lines: [{ productId: "p9", qty: 10, unitCost: 33 }, { productId: "p8", qty: 5, unitCost: 58 }] }, status: "draft", SUP: x.SUP, P: x.P, staff: "J", now: 1 }));
    expect(made.ok).toBe(true);
    snap = await s.load();
    const before9 = stock(snap, "p9"), before8 = stock(snap, "p8"), movesBefore = snap.M.length;
    const recv = (rid: string, lines: { productId: string; qty: number }[]) => run<object>((x) => x.RC.some((r) => r.id === rid) ? { ok: false, errors: ["dup"] } : E.buildReceive({ businessId: "t", id: rid, purchase: x.PU.find((p) => p.id === poId)!, PI: x.PI, RC: x.RC, RI: x.RI, lines, staff: "M", now: 2 }));

    // one bad line makes the whole delivery fail: nothing is written
    const bad = await recv(s.uid(), [{ productId: "p9", qty: 4 }, { productId: "p8", qty: 99 }]);
    expect(bad.ok).toBe(false);
    snap = await s.load();
    expect(snap.M.length).toBe(movesBefore);
    expect(snap.RC.filter((r) => r.purchaseId === poId)).toHaveLength(0);
    expect(stock(snap, "p9")).toBe(before9);

    // receive 4 of 10: partial, stock +4, and the purchase is now ordered
    const rid = s.uid();
    expect((await recv(rid, [{ productId: "p9", qty: 4 }])).ok).toBe(true);
    snap = await s.load();
    expect(stock(snap, "p9")).toBe(before9 + 4);
    const po = snap.PU.find((p) => p.id === poId)!;
    expect(E.purchaseStatus(po, snap.PI, snap.RC, snap.RI)).toBe("partial");

    // sending the same delivery again (a retry) adds nothing
    expect((await recv(rid, [{ productId: "p9", qty: 4 }])).ok).toBe(false);
    expect(stock(await s.load(), "p9")).toBe(before9 + 4);

    // cannot cancel once stock arrived
    expect((await run<object>((x) => E.buildPurchaseCancel({ businessId: "t", purchase: x.PU.find((p) => p.id === poId)!, RC: x.RC, staff: "J", now: 3 }))).ok).toBe(false);

    // receive the rest: complete, and stock is exactly the ordered total
    expect((await recv(s.uid(), [{ productId: "p9", qty: 6 }, { productId: "p8", qty: 5 }])).ok).toBe(true);
    snap = await s.load();
    expect(E.purchaseStatus(snap.PU.find((p) => p.id === poId)!, snap.PI, snap.RC, snap.RI)).toBe("received");
    expect(stock(snap, "p9")).toBe(before9 + 10);
    expect(stock(snap, "p8")).toBe(before8 + 5);

    // changing a product's cost leaves the purchase cost alone
    const prod = snap.P.find((p) => p.id === "p9")!;
    expect((await run<object>((x) => E.buildProductUpdate({ businessId: "t", product: prod, input: { name: prod.name, sku: prod.sku, unit: prod.unit, cost: 77, price: prod.price, min: prod.min, categoryId: prod.categoryId }, P: x.P, C: x.CAT, staff: "J", now: 4 }))).ok).toBe(true);
    snap = await s.load();
    expect(snap.P.find((p) => p.id === "p9")!.cost).toBe(77);
    expect(snap.PI.find((i) => i.purchaseId === poId && i.productId === "p9")!.unitCost).toBe(33);

    // an archived supplier stays in the records and can't be deleted
    expect((await run<object>((x) => E.buildSupplierArchive({ businessId: "t", supplier: x.SUP.find((u) => u.id === supId)!, archived: true, staff: "J", now: 5 }))).ok).toBe(true);
    snap = await s.load();
    expect(snap.SUP.find((u) => u.id === supId)!.archived).toBe(true);
    expect(snap.PU.find((p) => p.id === poId)!.supplierId).toBe(supId);
    expect((await run<object>((x) => E.buildSupplierDelete({ businessId: "t", supplier: x.SUP.find((u) => u.id === supId)!, PU: x.PU, staff: "J", now: 6 }))).ok).toBe(false);
    expect((await run<object>((x) => E.buildPurchaseCreate({ businessId: "t", id: s.uid(), ref: "PO-X", input: { supplierId: supId, lines: [{ productId: "p9", qty: 1, unitCost: 1 }] }, status: "draft", SUP: x.SUP, P: x.P, staff: "J", now: 7 }))).ok).toBe(false);
  });

  it("sale, cancellation and count leave exactly the right stock, and it survives closing the database", async () => {
    const { _internals: s } = await import("./store");
    const E = await import("./engine");
    const stock = (sn: Awaited<ReturnType<typeof s.load>>, id: string) => E.inventory(sn.P, sn.M, new Set(sn.S.filter((x) => x.status === "cancelled").map((x) => x.id))).find((p) => p.id === id)!.stock;
    let snap = await s.load();
    const start = stock(snap, "p4"), saleId = s.uid();
    const sale = await s.transact<object>((x) => E.buildSale({ businessId: "t", id: saleId, receiptNo: E.nextReceiptNo(x.S), lines: [{ productId: "p4", qty: 3 }], P: x.P, M: x.M, staff: "J", payment: "mpesa", now: Date.now() }));
    expect(sale.ok).toBe(true);
    snap = await s.load(); expect(stock(snap, "p4")).toBe(start - 3);
    const cancel = await s.transact<object>((x) => E.buildCancel({ businessId: "t", sale: x.S.find((r) => r.id === saleId)!, items: x.SI.filter((i) => i.saleId === saleId), staff: "J", now: Date.now() }));
    expect(cancel.ok).toBe(true);
    snap = await s.load(); expect(stock(snap, "p4")).toBe(start);
    expect((await s.transact<object>((x) => E.buildCancel({ businessId: "t", sale: x.S.find((r) => r.id === saleId)!, items: x.SI.filter((i) => i.saleId === saleId), staff: "J", now: Date.now() }))).ok).toBe(false); // can't return the stock twice
    snap = await s.load(); expect(stock(snap, "p4")).toBe(start);
    const cnt = await s.transact<object>((x) => E.buildCount({ businessId: "t", id: s.uid(), product: x.P.find((p) => p.id === "p4")!, M: x.M, counted: start - 2, reason: "Missing", staff: "J", now: Date.now() }));
    expect(cnt.ok).toBe(true);
    snap = await s.load(); expect(stock(snap, "p4")).toBe(start - 2);
    expect(E.dashboard(snap.P, snap.M, snap.S, snap.SI, snap.C).issues.some((i) => i.name === "Bread 400g" && i.short === 2)).toBe(true);

    // close the database connection and open it again, like closing and reopening the browser
    await s._internals_closeAndReopen();
    snap = await s.load();
    expect(stock(snap, "p4")).toBe(start - 2);
    expect(snap.S.find((r) => r.id === saleId)!.status).toBe("cancelled");
  });

  it("customers, staff and business details save, link to sales, and survive reopening", async () => {
    const { _internals: s, deviceStaffName } = await import("./store");
    const E = await import("./engine"), Pp = await import("./people");
    let snap = await s.load();
    expect(snap.STAFF.map((x) => x.name).sort()).toEqual(["Brian", "James", "Mary"]);
    expect(deviceStaffName(snap)).toBe("James");
    expect(snap.business.name).toBe("Demo Shop");
    expect(snap.CUS).toHaveLength(5);
    expect(snap.S.some((x) => x.customerId)).toBe(true);

    // a new customer, then a sale to them
    const custId = s.uid();
    expect((await s.transact<object>((x) => Pp.buildCustomerCreate({ businessId: "t", id: custId, input: { name: "Test Customer", phone: "0799 111 222" }, CUS: x.CUS, staff: "J", now: Date.now() }))).ok).toBe(true);
    expect((await s.transact<object>((x) => Pp.buildCustomerCreate({ businessId: "t", id: s.uid(), input: { name: "Imposter", phone: "+254 799 111 222" }, CUS: x.CUS, staff: "J", now: Date.now() }))).ok).toBe(false); // same number, different spelling
    const saleId = s.uid();
    const sold = await s.transact<object>((x) => E.buildSale({ businessId: "t", id: saleId, receiptNo: E.nextReceiptNo(x.S), lines: [{ productId: "p10", qty: 1 }], P: x.P, M: x.M, staff: "James", payment: "cash", now: Date.now(), customerId: custId, CUS: x.CUS }));
    expect(sold.ok).toBe(true);
    snap = await s.load();
    expect(snap.S.find((x) => x.id === saleId)!.customerId).toBe(custId);
    expect(Pp.customerStats(custId, snap.S, snap.SI)).toMatchObject({ count: 1, units: 1 });
    expect((await s.transact<object>((x) => Pp.buildCustomerDelete({ businessId: "t", customer: x.CUS.find((c) => c.id === custId)!, S: x.S, staff: "J", now: 1 }))).ok).toBe(false); // has a purchase

    // switch the device user and edit the business, then close and reopen the database
    expect((await s.transact<object>((x) => Pp.buildSetDeviceStaff({ businessId: "t", staffMember: x.STAFF.find((m) => m.name === "Mary")!, staff: "J", now: 2 }))).ok).toBe(true);
    expect((await s.transact<object>((x) => Pp.buildBusinessUpdate({ businessId: "t", input: { name: "Duka la Mama", location: "Kisumu" }, staff: "J", now: 3 }))).ok).toBe(true);
    await s._internals_closeAndReopen();
    snap = await s.load();
    expect(deviceStaffName(snap)).toBe("Mary");
    expect(snap.business).toMatchObject({ name: "Duka la Mama", location: "Kisumu" });
    expect(snap.CUS.some((c) => c.id === custId)).toBe(true);
  });

  it("fills in staff and settings for data saved before they existed, without touching anything else", async () => {
    const { _internals: s, deviceStaffName } = await import("./store");
    const before = await s.load();
    await s.db.staff.clear(); await s.db.settings.clear(); // what a v4 database looks like after the upgrade
    const after = await s.load();
    const onRecords = new Set([...before.M.map((m) => m.staff), ...before.S.map((x) => x.staff), ...before.C.map((c) => c.staff)]);
    expect(new Set(after.STAFF.map((x) => x.name))).toEqual(onRecords); // exactly one person for each name already on the records
    expect(["Brian", "James", "Mary"].every((n) => onRecords.has(n))).toBe(true);
    expect(after.business.name).toBe("My shop");
    expect(after.setup).toBe(false); expect(after.demo).toBe(true); // data saved before first-run setup existed counts as demo data, so nobody is sent back to setup
    expect(deviceStaffName(after)).toBe([...onRecords].sort((a, b) => a.localeCompare(b))[0]); // the first person alphabetically
    expect(after.S.length).toBe(before.S.length);
    expect(after.M.length).toBe(before.M.length);
    expect(after.P.length).toBe(before.P.length);
  });

  it("a fresh install starts empty, setup creates the shop, and erase returns to setup", async () => {
    const { _internals: s, deviceStaffName } = await import("./store");
    const Pp = await import("./people");
    await s.eraseEverything();
    let snap = await s.load();
    expect(snap.setup).toBe(true); expect(snap.P).toHaveLength(0); expect(snap.STAFF).toHaveLength(0); expect(snap.S).toHaveLength(0);

    const setup = (shop: string, you: string) => s.transact<object>(() => Pp.buildSetup({ businessId: "t", id: s.uid(), shop, you, now: Date.now() }));
    expect((await setup("  ", "Njeri")).ok).toBe(false);
    expect((await setup("Mama Njeri's Duka", "")).ok).toBe(false);
    expect((await s.load()).setup).toBe(true); // a refused setup changes nothing

    expect((await setup("  Mama Njeri's Duka ", " Njeri ")).ok).toBe(true);
    snap = await s.load();
    expect(snap.setup).toBe(false); expect(snap.demo).toBe(false);
    expect(snap.business.name).toBe("Mama Njeri's Duka");
    expect(snap.STAFF.map((x) => x.name)).toEqual(["Njeri"]);
    expect(deviceStaffName(snap)).toBe("Njeri");
    expect(snap.P).toHaveLength(0); // no demo data sneaks in

    await s.loadDemoData(); snap = await s.load();
    expect(snap.demo).toBe(true); expect(snap.P).toHaveLength(10);
    await s.eraseEverything(); snap = await s.load();
    expect(snap.setup).toBe(true); expect(snap.P).toHaveLength(0);
  });

  it("backup then restore brings back everything exactly, and a bad file changes nothing", async () => {
    const { _internals: s, deviceStaffName } = await import("./store");
    const E = await import("./engine"), Pp = await import("./people");
    await s.eraseEverything();
    await s.transact<object>(() => Pp.buildSetup({ businessId: "t", id: "me", shop: "Backup Shop", you: "Njeri", now: Date.now() }));
    const made = await s.transact<object>((x) => E.buildProductCreate({ businessId: "t", id: "prod-1", input: { name: "Unga 2kg", sku: "UNGA2", unit: "pack", cost: 120, price: 150, min: 5, openingStock: 30 }, P: x.P, C: x.CAT, staff: "Njeri", now: Date.now() }));
    expect(made.ok).toBe(true);
    const sold = await s.transact<object>((x) => E.buildSale({ businessId: "t", id: "sale-1", receiptNo: "SL-1001", lines: [{ productId: "prod-1", qty: 4 }], P: x.P, M: x.M, staff: "Njeri", payment: "mpesa", now: Date.now() }));
    expect(sold.ok).toBe(true);
    const before = await s.load();
    const stockOf = (sn: typeof before) => E.inventory(sn.P, sn.M).find((p) => p.id === "prod-1")!.stock;
    expect(stockOf(before)).toBe(26);

    const file = JSON.parse(JSON.stringify(await s.exportBackupFile())); // as if saved to a file and read back
    expect(file.app).toBe("stock-app"); expect(file.data.products).toHaveLength(1); expect(file.data.sales).toHaveLength(1);
    await s.stampBackup(); expect((await s.load()).lastBackupAt).toBeGreaterThan(0);

    await s.eraseEverything();
    expect((await s.load()).setup).toBe(true);
    const r = await s.restoreBackupFile(file);
    expect(r.ok).toBe(true);
    const after = await s.load();
    expect(after.setup).toBe(false); expect(after.business.name).toBe("Backup Shop"); expect(deviceStaffName(after)).toBe("Njeri");
    expect(stockOf(after)).toBe(26);
    expect(after.S[0]).toMatchObject({ id: "sale-1", total: 600, payment: "mpesa", status: "completed" });
    expect(after.M.length).toBe(before.M.length);
    expect(after.lastBackupAt).toBe(file.exportedAt);

    // a damaged file is refused and the data on the device is left exactly as it was
    const broken = JSON.parse(JSON.stringify(file)); broken.data.movements[0].productId = "ghost";
    const bad = await s.restoreBackupFile(broken);
    expect(bad.ok).toBe(false);
    expect((await s.restoreBackupFile({ not: "a backup" })).ok).toBe(false);
    const still = await s.load();
    expect(stockOf(still)).toBe(26); expect(still.S).toHaveLength(1);
  });

  it("keeps local records separate when the active business changes", async () => {
    const { setBusinessId } = await import("../config");
    const { _internals: s } = await import("./store");
    const E = await import("./engine");
    const businessA = s.uid(), businessB = s.uid();
    try {
      setBusinessId(businessA);
      expect((await s.load()).P).toHaveLength(0);
      const made = await s.transact<{ product: import("./engine").Product }>((snapshot) =>
        E.buildProductCreate({
          businessId: businessA,
          id: s.uid(),
          input: { name: "Private item", sku: "PRIVATE-1", unit: "piece", cost: 1, price: 2, min: 0, openingStock: 4 },
          P: snapshot.P,
          C: snapshot.CAT,
          staff: "Owner",
          now: 1,
        }));
      expect(made.ok).toBe(true);

      setBusinessId(businessB);
      expect((await s.load()).P).toHaveLength(0);
      setBusinessId(businessA);
      expect((await s.load()).P.map((product) => product.name)).toEqual(["Private item"]);
    } finally {
      setBusinessId("demo-business");
    }
  });
});
