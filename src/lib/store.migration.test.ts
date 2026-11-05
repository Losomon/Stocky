import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

const isUuid = (id: string | undefined) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

describe("store migrations", () => {
  it("migrates populated v5 data to UUID row IDs and keeps backup/restore intact", async () => {
    const old = new Dexie("stockly");
    old.version(5).stores({
      products: "id,sku,categoryId", categories: "id", movements: "++id,productId,ts,refId",
      sales: "id,ts,receiptNo", saleItems: "++id,saleId,productId", counts: "id,ts,productId",
      audit: "++id,ts,entity", suppliers: "id,name", purchases: "id,ts,supplierId",
      purchaseItems: "++id,purchaseId,productId", receipts: "id,purchaseId,ts",
      receiptItems: "++id,receiptId,productId", customers: "id,name,phone", staff: "id,name", settings: "key",
    });
    await old.open();
    await old.table("products").add({ id: "p1", businessId: "biz", name: "Rice", sku: "RICE", categoryId: "c1", unit: "bag", cost: 5, price: 8, min: 2, archived: false, createdAt: 1, updatedAt: 1 });
    await old.table("categories").add({ id: "c1", businessId: "biz", name: "Food" });
    await old.table("movements").add({ businessId: "biz", productId: "p1", type: "opening", qty: 15, ts: 1, staff: "A" });
    await old.table("movements").add({ businessId: "biz", productId: "p1", type: "sale", qty: -2, ts: 2, staff: "A", refId: "sale1" });
    await old.table("sales").add({ id: "sale1", businessId: "biz", receiptNo: "SL-1", ts: 2, staff: "A", payment: "cash", total: 16, status: "completed" });
    await old.table("saleItems").add({ saleId: "sale1", productId: "p1", qty: 2, unitPrice: 8, unitCost: 5 });
    await old.table("audit").add({ businessId: "biz", ts: 2, staff: "A", action: "sale.created", entity: "sale", entityId: "sale1", oldValue: "legacy" });
    await old.table("suppliers").add({ id: "sup1", businessId: "biz", name: "Supplier", archived: false, createdAt: 1, updatedAt: 1 });
    await old.table("purchases").add({ id: "po1", businessId: "biz", ref: "PO-1", supplierId: "sup1", ts: 1, staff: "A", status: "ordered" });
    await old.table("purchaseItems").add({ purchaseId: "po1", productId: "p1", qty: 4, unitCost: 5 });
    await old.table("receipts").add({ id: "receipt1", businessId: "biz", purchaseId: "po1", ts: 1, staff: "A" });
    await old.table("receiptItems").add({ receiptId: "receipt1", productId: "p1", qty: 4 });
    await old.table("movements").add({ businessId: "biz", productId: "p1", type: "purchase", qty: 4, ts: 1, staff: "A", refId: "receipt1" });
    await old.table("staff").add({ id: "staff1", businessId: "biz", name: "A", archived: false, createdAt: 1 });
    await old.table("settings").bulkAdd([
      { key: "business", value: { name: "My shop" } },
      { key: "deviceStaffId", value: "staff1" },
      { key: "onboarded", value: true },
    ]);
    const oldMovementIds = await old.table("movements").toCollection().primaryKeys();
    const oldSaleItemIds = await old.table("saleItems").toCollection().primaryKeys();
    const oldPurchaseItemIds = await old.table("purchaseItems").toCollection().primaryKeys();
    const oldReceiptItemIds = await old.table("receiptItems").toCollection().primaryKeys();
    const oldAuditIds = await old.table("audit").toCollection().primaryKeys();
    old.close();

    const { _internals: store } = await import("./store");
    let snapshot = await store.load();
    expect(snapshot.mode).toBe("device");
    expect(snapshot.P).toHaveLength(1);
    expect(snapshot.M).toHaveLength(3);
    expect(snapshot.SI).toHaveLength(1);
    expect(snapshot.PI).toHaveLength(1);
    expect(snapshot.RI).toHaveLength(1);
    expect(snapshot.M.map((row) => row.qty).sort((a, b) => a - b)).toEqual([-2, 4, 15]);
    expect(snapshot.SI[0]).toMatchObject({ saleId: "sale1", productId: "p1", qty: 2 });
    expect(snapshot.PI[0]).toMatchObject({ purchaseId: "po1", productId: "p1" });
    expect(snapshot.RI[0]).toMatchObject({ receiptId: "receipt1", productId: "p1" });
    expect(snapshot.M.find((row) => row.refId === "sale1")).toBeDefined();
    const { inventory } = await import("./engine");
    expect(inventory(snapshot.P, snapshot.M)[0].stock).toBe(17);

    const groups = [
      [snapshot.M.map((row) => row.id), oldMovementIds],
      [snapshot.SI.map((row) => row.id), oldSaleItemIds],
      [snapshot.PI.map((row) => row.id), oldPurchaseItemIds],
      [snapshot.RI.map((row) => row.id), oldReceiptItemIds],
      [(await store.db.audit.toArray()).map((row) => row.id), oldAuditIds],
    ] as const;
    for (const [ids, oldIds] of groups) {
      expect(ids.every(isUuid)).toBe(true);
      expect(ids).toHaveLength(oldIds.length);
      expect(ids.some((id) => oldIds.map(String).includes(id ?? ""))).toBe(false);
    }
    expect(await store.db.audit.toArray()).toMatchObject([{ action: "sale.created", entityId: "sale1", oldValue: "legacy" }]);

    const backup = await store.exportBackupFile();
    expect((await store.restoreBackupFile(backup)).ok).toBe(true);
    snapshot = await store.load();
    expect(snapshot.M.map((row) => row.id)).toEqual(groups[0][0]);
    expect(snapshot.SI.map((row) => row.id)).toEqual(groups[1][0]);
    expect(snapshot.PI.map((row) => row.id)).toEqual(groups[2][0]);
    expect(snapshot.RI.map((row) => row.id)).toEqual(groups[3][0]);
    expect((await store.db.audit.toArray()).map((row) => row.id)).toEqual(groups[4][0]);
    expect(snapshot.M.map((row) => row.qty).sort((a, b) => a - b)).toEqual([-2, 4, 15]);

    const legacyBackup = await store.exportBackupFile();
    for (const table of ["movements", "saleItems", "purchaseItems", "receiptItems", "audit"] as const) {
      legacyBackup.data[table].forEach((row) => { row.id = 7; });
    }
    expect((await store.restoreBackupFile(legacyBackup)).ok).toBe(true);
    snapshot = await store.load();
    expect([
      ...snapshot.M.map((row) => row.id),
      ...snapshot.SI.map((row) => row.id),
      ...snapshot.PI.map((row) => row.id),
      ...snapshot.RI.map((row) => row.id),
      ...(await store.db.audit.toArray()).map((row) => row.id),
    ].every(isUuid)).toBe(true);

    const write = await store.transact<{ marker: string }>(() => ({
      ok: true, marker: "written",
      movements: [{ businessId: "biz", productId: "p1", type: "adjustment", qty: 1, ts: 3, staff: "A" }],
      audit: [],
    }));
    expect(write.ok).toBe(true);
    snapshot = await store.load();
    expect(snapshot.M.every((row) => isUuid(row.id))).toBe(true);
  });
});
