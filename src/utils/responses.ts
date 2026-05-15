export function formatSuccess(data: unknown) {
  // structuredContent must be an object/record per MCP spec. When the response
  // is a primitive or array, wrap it under `result` so the SDK accepts it and
  // schemas downstream wrap accordingly.
  const structured =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { result: data };
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
    structuredContent: structured,
  };
}

export function formatError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
