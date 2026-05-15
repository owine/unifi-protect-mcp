import { describe, it, expect } from "vitest";
import { z } from "zod";
import { cameraSchema } from "../../src/schemas/cameras.js";
import { DEVICE_SCHEMAS } from "../../src/schemas/devices.js";
import {
  liveviewSchema,
  nvrSchema,
  ulpUserSchema,
  userSchema,
} from "../../src/schemas/misc.js";

/**
 * Samples below are real UniFi Protect Integration API 7.1.60 responses
 * captured from a live console (2026-05-15), trimmed to representative shape.
 * These guard that the schemas accept ground truth — not just internally
 * consistent guesses.
 */

describe("output schemas (verified against live 7.1.60 responses)", () => {
  it("camera schema accepts a real camera response", () => {
    const sample = {
      id: "6805169300863503e4032252",
      mac: "847848540714",
      name: "Alley East View",
      modelKey: "camera",
      state: "CONNECTED",
      activePatrolSlot: null,
      hasPackageCamera: false,
      hdrType: "auto",
      isMicEnabled: true,
      micVolume: 100,
      videoMode: "default",
      featureFlags: {
        hasHdr: true,
        hasLedStatus: false,
        hasMic: true,
        hasSpeaker: false,
        smartDetectAudioTypes: ["alrmSmoke", "alrmSiren"],
        smartDetectTypes: ["person", "vehicle", "animal", "face", "licensePlate"],
        supportFullHdSnapshot: true,
        videoModes: ["default", "sport", "slowShutter"],
      },
      lcdMessage: {},
      ledSettings: { floodLed: true, isEnabled: true, welcomeLed: true },
      osdSettings: {
        isDateEnabled: true,
        isDebugEnabled: false,
        isLogoEnabled: false,
        isNameEnabled: true,
        overlayLocation: "topLeft",
      },
      smartDetectSettings: {
        audioTypes: ["alrmSpeak", "alrmBabyCry"],
        objectTypes: ["person", "vehicle", "licensePlate", "animal", "face"],
      },
    };
    expect(() => cameraSchema.parse(sample)).not.toThrow();
  });

  it("nvr schema accepts a real /nvrs response (single object)", () => {
    const sample = {
      id: "67f5751003927603e40003ec",
      modelKey: "nvr",
      name: "Melrose NVR Pro",
      doorbellSettings: {
        defaultMessageText: "WELCOME",
        defaultMessageResetTimeoutMs: 60000,
        customMessages: ["Please Leave Delivery at Door"],
        customImages: [],
      },
      armMode: {
        status: "disabled",
        armedAt: null,
        willBeArmedAt: null,
        breachDetectedAt: null,
        breachEventCount: 0,
        breachTriggerEventId: null,
        breachEventId: null,
      },
    };
    expect(() => nvrSchema.parse(sample)).not.toThrow();
  });

  it("user schema accepts a real user response", () => {
    const sample = {
      id: "69247bed008ea403e40a1f90",
      modelKey: "user",
      name: "Elise Wine",
      firstName: "Elise",
      lastName: "Wine",
      email: "emw@example.com",
      ucoreUserId: "65f0c58c-45ba-4361-be01-fa19d4474e0a",
    };
    expect(() => userSchema.parse(sample)).not.toThrow();
  });

  it("ulp user schema accepts a real ulp-user response", () => {
    const sample = {
      id: "fe92f806-6942-4b59-8be2-66950701cdfa",
      modelKey: "ulpUser",
      firstName: "Oliver",
      lastName: "Wine",
      fullName: "Oliver Wine",
      status: "ACTIVE",
    };
    expect(() => ulpUserSchema.parse(sample)).not.toThrow();
  });

  it("liveview schema accepts a real liveview response (slots use cameras[])", () => {
    const sample = {
      id: "6803d7bd032e3503e40061ea",
      modelKey: "liveview",
      name: "Default",
      isDefault: true,
      isGlobal: true,
      layout: 6,
      owner: "67f575af01647603e4000405",
      slots: [
        { cameras: ["6805169300863503e4032252"], cycleInterval: 10, cycleMode: "time" },
        { cameras: ["680516a200d63503e4032305"], cycleInterval: 10, cycleMode: "time" },
      ],
    };
    expect(() => liveviewSchema.parse(sample)).not.toThrow();
  });

  it("schemas tolerate sparse responses (only id)", () => {
    expect(() => cameraSchema.parse({ id: "x" })).not.toThrow();
    expect(() => nvrSchema.parse({ id: "x" })).not.toThrow();
    expect(() => userSchema.parse({ id: "x" })).not.toThrow();
  });

  it("schemas pass unknown future fields through (.passthrough())", () => {
    const result = cameraSchema.parse({ id: "x", brandNewField: 42 });
    expect((result as Record<string, unknown>).brandNewField).toBe(42);
  });

  it.each(Object.entries(DEVICE_SCHEMAS))(
    "%s (unverified) schema accepts a minimal record and passes unknowns",
    (_key, schema) => {
      const result = schema.parse({
        id: "x",
        modelKey: "k",
        name: "n",
        state: "CONNECTED",
        unverifiedDeviceField: { nested: true },
      });
      expect((result as Record<string, unknown>).unverifiedDeviceField).toEqual({
        nested: true,
      });
    }
  );

  it("does NOT reject unverified fields with unexpected primitive types", () => {
    // Regression guard: only confident identity fields are strictly typed.
    const result = z.object(cameraSchema.shape).safeParse({
      id: "x",
      isMicEnabled: "yes", // string where boolean might be expected — must pass
      micVolume: "100", // string where number might be expected — must pass
    });
    expect(result.success).toBe(true);
  });

  it("still rejects a wrong type on a confident identity field", () => {
    const result = z.object(cameraSchema.shape).safeParse({ id: 12345 });
    expect(result.success).toBe(false);
  });
});
