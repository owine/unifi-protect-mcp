import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  cameraSchema,
  talkbackSessionOutputSchema,
} from "../../src/schemas/cameras.js";
import {
  DEVICE_SCHEMAS,
  chimeSchema,
  lightSchema,
} from "../../src/schemas/devices.js";
import {
  armProfileSchema,
  fileSchema,
  liveviewSchema,
  nvrSchema,
  ulpUserSchema,
  userSchema,
} from "../../src/schemas/misc.js";

/**
 * Samples below are REAL UniFi Protect Integration API responses captured from
 * a live console running 7.1.83 (2026-06-20), trimmed to representative shape.
 * Device types with no instances on the console (light, arm profile, file) use
 * the verbatim 7.1.83 doc response samples. These guard that the schemas accept
 * ground truth — including explicit nulls — not just internally consistent
 * guesses.
 */

describe("output schemas (verified against live 7.1.83 responses)", () => {
  it("camera schema accepts a real camera response with a typed lcdMessage", () => {
    const sample = {
      id: "683f6e44001d1603e4320bd8",
      mac: "1C6A1B86607D",
      name: "Doorbell",
      modelKey: "camera",
      state: "CONNECTED",
      activePatrolSlot: null,
      hasPackageCamera: true,
      hdrType: "auto",
      isMicEnabled: true,
      micVolume: 100,
      videoMode: "default",
      featureFlags: {
        hasHdr: true,
        hasLedStatus: true,
        hasMic: true,
        hasSpeaker: true,
        smartDetectAudioTypes: ["alrmSmoke", "alrmCmonx"],
        smartDetectTypes: ["person", "vehicle", "animal", "package"],
        supportFullHdSnapshot: true,
        videoModes: ["default", "sport", "slowShutter"],
      },
      // The live null-trap: resetAt is null when the message has no expiry.
      lcdMessage: { type: "CUSTOM_MESSAGE", resetAt: null, text: "1317 W Melrose Please Ring" },
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

  it("camera schema accepts an empty lcdMessage object (non-doorbell cameras)", () => {
    expect(() => cameraSchema.parse({ id: "x", lcdMessage: {} })).not.toThrow();
  });

  it("talkback session schema accepts the full audio config", () => {
    const schema = z.object(talkbackSessionOutputSchema).passthrough();
    expect(() =>
      schema.parse({
        url: "rtp://192.168.1.123:7004",
        codec: "opus",
        samplingRate: 24000,
        bitsPerSample: 16,
      })
    ).not.toThrow();
  });

  it("nvr schema accepts a real /nvrs response (single object, armMode disabled)", () => {
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

  it("nvr schema accepts an armed armMode with armProfileId (7.1.83 docs)", () => {
    const sample = {
      id: "x",
      armMode: { status: "arming", armProfileId: "66d025b301ebc903e80003ea", armedAt: 0 },
    };
    expect(() => nvrSchema.parse(sample)).not.toThrow();
  });

  it("user schema accepts a real user AND a null-bearing service account", () => {
    expect(() =>
      userSchema.parse({
        id: "67f575af01647603e4000405",
        modelKey: "user",
        name: "Oliver Wine",
        firstName: "Oliver",
        lastName: "Wine",
        email: "ow@example.com",
        ucoreUserId: "fe92f806-6942-4b59-8be2-66950701cdfa",
      })
    ).not.toThrow();
    // The trap: integration/service accounts return explicit nulls.
    expect(() =>
      userSchema.parse({
        id: "698cf0c202244b03e41cf869",
        modelKey: "user",
        name: "UniFi Protect MCP (owine)",
        firstName: "UniFi Protect MCP (owine)",
        lastName: null,
        email: null,
        ucoreUserId: null,
      })
    ).not.toThrow();
  });

  it("ulp user schema accepts a real ulp-user response (incl. empty-string lastName)", () => {
    expect(() =>
      ulpUserSchema.parse({
        id: "222eb570-10db-4636-bc06-fff0ec31f0ac",
        modelKey: "ulpUser",
        firstName: "scrypted",
        lastName: "",
        fullName: "scrypted",
        status: "ACTIVE",
      })
    ).not.toThrow();
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

  it("chime schema accepts a real chime response (verified live 7.1.83)", () => {
    const sample = {
      id: "6840599400101603e43b749a",
      modelKey: "chime",
      state: "CONNECTED",
      name: "Chime Office",
      mac: "1C6A1B86C6EB",
      cameraIds: ["683f6e44001d1603e4320bd8"],
      ringSettings: [
        {
          cameraId: "683f6e44001d1603e4320bd8",
          volume: 80,
          ringtoneId: "67f575aa00427603e40003f1",
          repeatTimes: 1,
        },
      ],
    };
    expect(() => chimeSchema.parse(sample)).not.toThrow();
  });

  it("light schema accepts the 7.1.83 doc response sample", () => {
    const sample = {
      id: "66d025b301ebc903e80003ea",
      modelKey: "light",
      state: "CONNECTED",
      name: "Front Door",
      mac: "24A43C3DFEB9",
      lightModeSettings: { mode: "always", enableAt: "fulltime" },
      lightDeviceSettings: { isIndicatorEnabled: true, pirDuration: 30000, pirSensitivity: 50, ledLevel: 6 },
      isDark: true,
      isLightOn: true,
      isLightForceEnabled: true,
      lastMotion: 1445408038748,
      isPirMotionDetected: true,
      camera: "66d025b301ebc903e80003ea",
    };
    expect(() => lightSchema.parse(sample)).not.toThrow();
  });

  it("arm profile schema accepts the 7.1.83 doc response sample (no modelKey)", () => {
    const sample = {
      id: "66d025b301ebc903e80003ea",
      name: "Arm Profile",
      automations: [],
      creator: "66d025b301ebc903e80003ea",
      schedules: [],
      recordEverything: true,
      activationDelay: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(() => armProfileSchema.parse(sample)).not.toThrow();
  });

  it("file schema accepts the 7.1.83 doc response sample (name/type/originalName/path)", () => {
    const sample = {
      name: "34225b30-fe6a-11af-1690-29424bd911c2.png",
      type: "animations",
      originalName: "welcome-animation.png",
      path: "/data/animations/34225b30-fe6a-11af-1690-29424bd911c2.png",
    };
    expect(() => fileSchema.parse(sample)).not.toThrow();
  });

  it("schemas tolerate sparse responses (only id)", () => {
    expect(() => cameraSchema.parse({ id: "x" })).not.toThrow();
    expect(() => nvrSchema.parse({ id: "x" })).not.toThrow();
    expect(() => userSchema.parse({ id: "x" })).not.toThrow();
    expect(() => chimeSchema.parse({ id: "x" })).not.toThrow();
  });

  it("schemas pass unknown future fields through (.passthrough())", () => {
    const result = cameraSchema.parse({ id: "x", brandNewField: 42 });
    expect((result as Record<string, unknown>).brandNewField).toBe(42);
  });

  it.each(Object.entries(DEVICE_SCHEMAS))(
    "%s schema accepts a minimal record and passes unknowns",
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
