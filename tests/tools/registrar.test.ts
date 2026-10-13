import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { instrumentTools } from "../../src/tools/registrar.js";
import { READ_ONLY, WRITE } from "../../src/utils/safety.js";

function rawServer() {
  const registerTool = vi.fn();
  return { server: { registerTool } as unknown as McpServer, registerTool };
}

const handler = () => ({ content: [] });

describe("instrumentTools", () => {
  // Modules return early before their write tools in read-only mode; this is
  // the second line, so a write tool placed above that return fails startup
  // instead of being served.
  it("refuses a write tool in read-only mode", () => {
    const { server } = rawServer();
    expect(() => instrumentTools(server, true).registerTool("protect_x", { annotations: WRITE }, handler))
      .toThrow("protect_x is a write tool registered in read-only mode");
  });

  it("registers a read-only tool in read-only mode", () => {
    const { server, registerTool } = rawServer();
    instrumentTools(server, true).registerTool("protect_get_x", { annotations: READ_ONLY }, handler);
    expect(registerTool).toHaveBeenCalledOnce();
  });

  it("lets a tool declare openWorldHint itself", () => {
    const { server, registerTool } = rawServer();
    instrumentTools(server, false).registerTool("protect_x", { annotations: { ...WRITE, openWorldHint: true } }, handler);
    expect(registerTool.mock.calls[0][1]).toMatchObject({ annotations: { openWorldHint: true } });
  });
});
