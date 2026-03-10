import { describe, it, expect } from "vitest";
import { safePath } from "../../src/utils/safety.js";

describe("safePath", () => {
  it("leaves normal segments unchanged", () => {
    expect(safePath`/cameras/${"abc123"}`).toBe("/cameras/abc123");
  });

  it("encodes path traversal characters", () => {
    expect(safePath`/cameras/${"../meta/info"}`).toBe(
      "/cameras/..%2Fmeta%2Finfo"
    );
  });

  it("encodes query injection characters", () => {
    expect(safePath`/cameras/${"test?admin=true"}`).toBe(
      "/cameras/test%3Fadmin%3Dtrue"
    );
  });

  it("encodes fragment injection characters", () => {
    expect(safePath`/cameras/${"test#fragment"}`).toBe(
      "/cameras/test%23fragment"
    );
  });

  it("encodes percent characters to prevent double-encoding attacks", () => {
    expect(safePath`/cameras/${"test%2F..%2Fadmin"}`).toBe(
      "/cameras/test%252F..%252Fadmin"
    );
  });

  it("encodes spaces", () => {
    expect(safePath`/cameras/${"my camera"}`).toBe("/cameras/my%20camera");
  });

  it("handles multiple interpolated values", () => {
    expect(safePath`/cameras/${"a/b"}/ptz/goto/${"1?x"}`).toBe(
      "/cameras/a%2Fb/ptz/goto/1%3Fx"
    );
  });

  it("converts numbers to strings before encoding", () => {
    expect(safePath`/cameras/${"cam1"}/ptz/patrol/start/${42}`).toBe(
      "/cameras/cam1/ptz/patrol/start/42"
    );
  });

  it("handles empty string values", () => {
    expect(safePath`/cameras/${""}`).toBe("/cameras/");
  });

  it("returns literal path when no interpolations", () => {
    expect(safePath`/cameras`).toBe("/cameras");
  });
});
