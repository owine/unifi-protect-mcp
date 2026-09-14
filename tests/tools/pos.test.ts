import { describe, it, expect } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerPosTools } from "../../src/tools/pos.js";

describe("POS tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerPosTools(server, client, false);

  const minimal = {
    id: "cam1",
    type: "sale" as const,
    externalId: "txn-1",
    amount: 12.5,
  };

  describe("protect_ingest_pos_transaction", () => {
    it("posts a minimal transaction", async () => {
      mockFn(client, "post").mockResolvedValue({ created: true, eventId: "ev1" });
      const result = await handlers.get("protect_ingest_pos_transaction")!(minimal);
      expectSuccess(result, "ev1");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/pos/cameras/cam1/transactions",
        { type: "sale", externalId: "txn-1", amount: 12.5 }
      );
    });

    it("forwards optional fields and excludes id/dryRun from the body", async () => {
      mockFn(client, "post").mockResolvedValue({ created: true, eventId: "ev2" });
      await handlers.get("protect_ingest_pos_transaction")!({
        ...minimal,
        currency: "USD",
        lineItems: [{ title: "Coffee", quantity: 2 }],
        location: { id: "store-1", name: "Main St" },
        paymentTypes: ["visa"],
        timestamp: 1_700_000_000_000,
      });
      const [path, body] = mockFn(client, "post").mock.calls.at(-1)!;
      expect(path).toBe("/pos/cameras/cam1/transactions");
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("dryRun");
      expect(body.currency).toBe("USD");
      expect(body.lineItems).toEqual([{ title: "Coffee", quantity: 2 }]);
      expect(body.timestamp).toBe(1_700_000_000_000);
    });

    it("URL-encodes the camera id", async () => {
      mockFn(client, "post").mockResolvedValue({ created: true });
      await handlers.get("protect_ingest_pos_transaction")!({
        ...minimal,
        id: "a/../b",
      });
      expect(mockFn(client, "post").mock.calls.at(-1)![0]).toBe(
        "/pos/cameras/a%2F..%2Fb/transactions"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("409 conflict"));
      const result = await handlers.get("protect_ingest_pos_transaction")!(minimal);
      expectError(result);
    });

    it("dry-run previews without calling the client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_ingest_pos_transaction")!({
        ...minimal,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/pos/cameras/cam1/transactions");
      expect(data.body).toEqual({ type: "sale", externalId: "txn-1", amount: 12.5 });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("has WRITE annotations", () => {
      expect(configs.get("protect_ingest_pos_transaction")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("input validation", () => {
    const schema = parseInputSchema(configs, "protect_ingest_pos_transaction");

    it("accepts the documented minimum", () => {
      expect(schema.safeParse(minimal).success).toBe(true);
    });

    it("rejects an unknown transaction type", () => {
      expect(schema.safeParse({ ...minimal, type: "void" }).success).toBe(false);
    });

    it("rejects a negative amount", () => {
      expect(schema.safeParse({ ...minimal, amount: -1 }).success).toBe(false);
    });

    it("rejects an empty or overlong externalId", () => {
      expect(schema.safeParse({ ...minimal, externalId: "" }).success).toBe(false);
      expect(
        schema.safeParse({ ...minimal, externalId: "x".repeat(256) }).success
      ).toBe(false);
    });

    it("rejects a non-ISO-4217 currency", () => {
      expect(schema.safeParse({ ...minimal, currency: "usd" }).success).toBe(false);
      expect(schema.safeParse({ ...minimal, currency: "US" }).success).toBe(false);
      expect(schema.safeParse({ ...minimal, currency: "USD" }).success).toBe(true);
    });

    it("enforces the documented array caps", () => {
      const item = { title: "x", quantity: 1 };
      expect(
        schema.safeParse({ ...minimal, lineItems: Array(200).fill(item) }).success
      ).toBe(true);
      expect(
        schema.safeParse({ ...minimal, lineItems: Array(201).fill(item) }).success
      ).toBe(false);
      expect(
        schema.safeParse({ ...minimal, paymentTypes: Array(21).fill("visa") }).success
      ).toBe(false);
    });

    it("keeps undocumented line-item fields instead of stripping them", () => {
      const parsed = schema.parse({
        ...minimal,
        lineItems: [{ title: "x", quantity: 1, sku: "abc" }],
      });
      expect(parsed.lineItems![0]).toHaveProperty("sku", "abc");
    });

    it("rejects a non-integer timestamp", () => {
      expect(schema.safeParse({ ...minimal, timestamp: 1.5 }).success).toBe(false);
    });
  });

  it("registers nothing in read-only mode", () => {
    const ro = createMockServer();
    registerPosTools(ro.server, createMockClient(), true);
    expect(ro.configs.size).toBe(0);
  });
});
