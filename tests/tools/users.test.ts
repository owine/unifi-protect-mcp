import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
import { registerUserTools } from "../../src/tools/users.js";

describe("user tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerUserTools(server, client);

  const cases: { tool: string; path: string }[] = [
    { tool: "protect_list_users", path: "/users" },
    { tool: "protect_list_ulp_users", path: "/ulp-users" },
  ];

  for (const { tool, path } of cases) {
    describe(tool, () => {
      it("lists items", async () => {
        mockFn(client, "get").mockResolvedValue([{ id: "u1", name: "Alice" }]);
        const result = await handlers.get(tool)!({});
        expectSuccess(result, "Alice");
        expect(mockFn(client, "get")).toHaveBeenCalledWith(path);
      });

      it("returns error on failure", async () => {
        mockFn(client, "get").mockRejectedValue(new Error("fail"));
        const result = await handlers.get(tool)!({});
        expectError(result);
      });

      it("has read-only annotations", () => {
        expect(configs.get(tool)!.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
        });
      });
    });
  }

  const getCases: { tool: string; path: string }[] = [
    { tool: "protect_get_user", path: "/users/u1" },
    { tool: "protect_get_ulp_user", path: "/ulp-users/u1" },
  ];

  for (const { tool, path } of getCases) {
    describe(tool, () => {
      it("gets by ID", async () => {
        mockFn(client, "get").mockResolvedValue({ id: "u1", name: "Alice" });
        const result = await handlers.get(tool)!({ id: "u1" });
        expectSuccess(result, "Alice");
        expect(mockFn(client, "get")).toHaveBeenCalledWith(path);
      });

      it("returns error on failure", async () => {
        mockFn(client, "get").mockRejectedValue(new Error("not found"));
        const result = await handlers.get(tool)!({ id: "u1" });
        expectError(result);
      });

      it("has read-only annotations", () => {
        expect(configs.get(tool)!.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
        });
      });
    });
  }
});
