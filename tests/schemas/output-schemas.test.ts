import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  cameraSchema,
  rtspStreamOutputSchema,
  rtspStreamSchema,
  talkbackSessionOutputSchema,
} from "../../src/schemas/cameras.js";
import {
  DEVICE_SCHEMAS,
  alarmHubSchema,
  chimeSchema,
  fobSchema,
  itemOutputShape,
  lightSchema,
  linkStationSchema,
  sensorSchema,
} from "../../src/schemas/devices.js";
import {
  armProfileSchema,
  fileOutputSchema,
  fileSchema,
  liveviewSchema,
  nvrSchema,
  ulpUserSchema,
  userSchema,
} from "../../src/schemas/misc.js";
import { posTransactionOutputSchema } from "../../src/schemas/pos.js";

/**
 * Samples below are REAL UniFi Protect Integration API responses captured from
 * a live console running 7.3.47 (2026-09-14), trimmed to representative shape,
 * and re-verified against 7.3.70 (2026-10-12): the chime and liveview samples
 * were re-captured live on 7.3.70.
 * Device types with no instances on the console (light, sensor, siren, fob,
 * relay, viewer, speaker, bridge, link station, alarm hub, arm profile, file,
 * POS) use the verbatim published doc response samples (7.3.70 docs where the
 * test says so; older tests keep their original 7.1.83 doc samples). These
 * guard that the schemas accept ground truth — including explicit nulls — not
 * just internally consistent guesses.
 */

/** GET /v1/lights/{id} — 7.3.70 docs response sample, verbatim. */
const LIGHT_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "light",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  lightModeSettings: {
    mode: "always",
    enableAt: "fulltime",
  },
  lightDeviceSettings: {
    isIndicatorEnabled: true,
    pirDuration: 30000,
    pirSensitivity: 50,
    ledLevel: 6,
  },
  isDark: true,
  isLightOn: true,
  isLightForceEnabled: true,
  lastMotion: 1445408038748,
  isPirMotionDetected: true,
  camera: "66d025b301ebc903e80003ea",
};

/** GET /v1/sensors/{id} — 7.3.70 docs response sample, verbatim. */
const SENSOR_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "sensor",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  mountType: "door",
  batteryStatus: {
    percentage: 95,
    isLow: true,
  },
  featureFlags: {
    temperature: {
      channelCount: 1,
    },
    humidity: {
      channelCount: 1,
    },
    light: {
      channelCount: 1,
    },
    motion: {
      channelCount: 1,
    },
    waterLeak: {
      channelCount: 1,
    },
    open: {
      channelCount: 1,
    },
    tamper: {
      channelCount: 1,
    },
    smoke: {
      channelCount: 1,
    }
  },
  stats: {
    light: {
      value: 22.5,
      status: "high",
    },
    humidity: {
      value: 22.5,
      status: "high",
    },
    temperature: {
      value: 22.5,
      status: "high",
    }
  },
  lightSettings: {
    isEnabled: true,
    margin: 10,
    lowThreshold: 20,
    highThreshold: 100,
  },
  humiditySettings: {
    isEnabled: true,
    margin: 1,
    lowThreshold: 30,
    highThreshold: 80,
  },
  temperatureSettings: {
    isEnabled: true,
    margin: 0.1,
    lowThreshold: 20,
    highThreshold: 25,
  },
  isOpened: true,
  openStatusChangedAt: 1445408038748,
  isMotionDetected: true,
  motionDetectedAt: 1445408038748,
  motionSettings: {
    isEnabled: true,
    sensitivity: 50,
    sensitivityWhenArmed: 50,
  },
  glassBreakSettings: {
    isEnabled: true,
    sensitivity: 25,
    sensitivityWhenArmed: 50,
  },
  scheduleMode: "always",
  armProfileIds: [
    "string",
  ],
  hasCustomSensitivityWhenArmed: true,
  alarmTriggeredAt: 1445408038748,
  alarmSettings: {
    isEnabled: true,
  },
  leakDetectedAt: 1445408038748,
  externalLeakDetectedAt: 1445408038748,
  leakSettings: {
    isInternalEnabled: true,
    isExternalEnabled: true,
  },
  tamperingDetectedAt: 1445408038748,
  wirelessConnectionState: {
    signalState: {
      signalQuality: 85,
      signalStrength: -45,
    },
    batteryStatus: {
      percentage: 95,
      isLow: true,
    },
    bridge: "66d025b301ebc903e80003ea",
  }
};

/** GET /v1/sirens/{id} — 7.3.70 docs response sample, verbatim. */
const SIREN_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "siren",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  volume: 80,
  ledSettings: {
    isEnabled: true,
  },
  sirenStatus: {
    isActive: true,
    activatedAt: 1445408038748,
    duration: 5000,
  },
  connectionType: "lora",
  wirelessConnectionState: {
    signalState: {
      signalQuality: 85,
      signalStrength: -45,
    },
    batteryStatus: {
      percentage: 95,
      isLow: true,
    },
    bridge: "66d025b301ebc903e80003ea",
  }
};

/** GET /v1/fobs/{id} — 7.3.70 docs response sample, verbatim. */
const FOB_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "fob",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  awayState: "ONLINE",
  buttonLabels: "securityActions",
  featureFlags: {
    buttons: [
      "arm",
      "disarm",
      "panic",
    ],
    hasKeypad: false,
  },
  armControlSettings: {
    enabled: true,
    armProfileId: "string",
    nightProfileId: "string",
  },
  keypadSettings: {
    beepEnabled: true,
    beepVolume: 100,
  },
  wirelessConnectionState: {
    signalState: {
      signalQuality: 85,
      signalStrength: -45,
    },
    batteryStatus: {
      percentage: 95,
      isLow: true,
    },
    bridge: "66d025b301ebc903e80003ea",
  }
};

/** GET /v1/relays/{id} — 7.3.70 docs response sample, verbatim. */
const RELAY_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "relay",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  ledSettings: {
    isEnabled: true,
  },
  outputs: [
    {
      id: 0,
      name: "Garage Door",
      type: "garageDoor",
      delay: 0,
      pulseDuration: 1000,
      state: "off",
      rebootState: "off",
    }
  ],
  inputs: [
    {
      id: 0,
      name: "Door Sensor",
      state: "off",
      actionTrigger: "switchedOn",
      actionType: "toggleOutput",
      actionOutputId: 0,
    }
  ],
  wirelessConnectionState: {
    signalState: {
      signalQuality: 85,
      signalStrength: -45,
    },
    batteryStatus: {
      percentage: 95,
      isLow: true,
    },
    bridge: "66d025b301ebc903e80003ea",
  }
};

/** GET /v1/viewers/{id} — 7.3.70 docs response sample, verbatim. */
const VIEWER_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "viewer",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  liveview: "66d025b301ebc903e80003ea",
  streamLimit: 1,
};

/** GET /v1/speakers/{id} — 7.3.70 docs response sample, verbatim. */
const SPEAKER_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "speaker",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  volume: 80,
  micVolume: 80,
  isMicEnabled: true,
  speakerState: {
    status: "idle",
    mode: "listen",
  },
  featureFlags: {
    hasMic: true,
  }
};

/** GET /v1/bridges/{id} — 7.3.70 docs response sample, verbatim. */
const BRIDGE_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "bridge",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  platform: "mt7621",
  clients: [
    "AABBCCDDEEFF",
    "112233445566",
  ],
  maxClients: 7,
};

/** GET /v1/link-stations/{id} — 7.3.70 docs response sample, verbatim (repeated "property2" map entries dropped). */
const LINKSTATION_DOC_7_3_70 = {
  id: "66d025b301ebc903e80003ea",
  modelKey: "linkstation",
  state: "CONNECTED",
  name: "Front Door",
  type: "UVC Micro",
  guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
  mac: "24A43C3DFEB9",
  isAlarmHub: true,
  ledSettings: {
    isEnabled: true,
  },
  lastEvent: 1445408038748,
  alarmHub: {
    armed: "on",
    battery: {
      charging: "on",
      connection: "connected",
      voltage: 0,
      batteryStatus: "ok",
    },
    buckboost: "on",
    connector: {
      emergency: {
        "+": "connected",
        "-": "connected",
      },
      "12v": {
        property1: {
          "+": "connected",
          "-": "connected",
        }
      },
      relay: {
        property1: {
          com: "connected",
          nc: "connected",
          no: "connected",
        }
      },
      tb: {
        property1: {
          "+": "connected",
          "-": "connected",
        }
      },
      battery: "connected",
      poeout: "connected",
    },
    cover: {
      distance: 0,
      status: "open",
    },
    deviceTamperStatus: "tampered",
    currentMeterChannelStatus: {
      property1: {
        criticalAlarm: "normal",
        criticalThreshold: 0,
        value: 0,
        warningAlarm: "normal",
        warningThreshold: 0,
      }
    },
    currentMeterStatus: {
      property1: {
        critical: "normal",
        efuse: "normal",
        enable: "on",
        powerValid: "normal",
        timingControl: "normal",
        warning: "normal",
      }
    },
    inputPower: {
      bt: "low",
      typ1: "low",
      typ2: "low",
    },
    poeout: {
      connection: "connected",
      powerSupply: "on",
    },
    powerMeter: {
      property1: {
        alarm: "normal",
        current: 0,
        efuse: "normal",
        enable: "on",
        power: 0,
        powerThreshold: 0,
        voltage: 0,
      }
    },
    output: {
      property1: {
        enable: "on",
        active: "on",
        status: "wet",
        delay: 0,
        duration: 0,
        name: "string",
      }
    },
    input: {
      property1: {
        enable: "on",
        type: "no",
        eolr: 2,
        resistor: 10,
        status: "normal",
        trigger: 0,
        name: "string",
        inputType: "MOTION",
        allowedArmingProfiles: [
          "string",
        ],
        triggerWhenDisarmed: "on",
        triggerOnCurrentArmingProfile: "on",
        lastTriggeredAt: 0,
        cameraId: "string",
        powerReset: true,
      }
    },
    inputTerminalStatus: {
      property1: {
        plusPinStatus: "disabled",
        minusPinStatus: "disabled",
        terminalStatus: "disabled",
        idleSubState: "open",
      }
    },
    outputTerminalStatus: {
      property1: {
        pins: {
          no: "disabled",
          com: "disabled",
          nc: "disabled",
        },
        statusLabel: "disabled",
        mode: "dry-contact",
        efuseAlert: "none",
        wiredPins: [
          "+",
        ]
      },
    },
    emergencyTerminalStatus: {
      plusPinStatus: "disabled",
      minusPinStatus: "disabled",
      terminalStatus: "disabled",
      idleSubState: "open",
    },
    auxiliaryPowerTerminalStatus: {
      property1: {
        plusPinStatus: "disabled",
        minusPinStatus: "disabled",
        status: "not-connected",
        currentMa: 0,
        loadPercent: 0,
      }
    },
  },
  threadState: {
    network: {
      status: "ready",
      role: "disabled",
      networkName: "string",
      channel: 11,
      panId: "^0$",
      extendedPanId: "^0$",
      joinedDeviceCount: 0,
      errorReason: "string",
      lastUpdatedAt: 0,
    }
  },
};

describe("output schemas (verified against live 7.3.47 responses, re-verified 7.3.70)", () => {
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

  it("rtsp stream schema accepts the 7.3.70 doc sample (low/package explicitly null)", () => {
    const sample = {
      high: "rtsps://192.168.1.1:7441/5nPr7RCmueGTKMP7?enableSrtp",
      medium: "rtsps://192.168.1.1:7441/AbUgnDb5IqIEMidk?enableSrtp",
      low: null,
      package: null,
    };
    expect(rtspStreamSchema.parse(sample)).toEqual(sample);
    // The tool-facing shape (what the SDK validates structuredContent against).
    expect(z.object(rtspStreamOutputSchema).safeParse(sample).success).toBe(true);
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

  it("nvr schema accepts explicit null doorbellSettings and armMode", () => {
    const result = nvrSchema.safeParse({
      id: "67f5751003927603e40003ec",
      modelKey: "nvr",
      doorbellSettings: null,
      armMode: null,
    });
    expect(result.success).toBe(true);
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

  it("liveview schema accepts a real liveview response (captured live 7.3.70)", () => {
    const sample = {
      id: "6803d7bd032e3503e40061ea",
      modelKey: "liveview",
      name: "Default",
      isDefault: true,
      isGlobal: true,
      owner: "67f575af01647603e4000405",
      layout: 6,
      slots: [{ cameras: ["6805169300863503e4032252"], cycleMode: "time", cycleInterval: 10 }],
    };
    expect(liveviewSchema.parse(sample)).toEqual(sample);
  });

  it("liveview schema accepts explicit null slots", () => {
    expect(liveviewSchema.safeParse({ id: "x", slots: null }).success).toBe(true);
  });

  it("chime schema accepts a real chime response (verified live 7.3.70)", () => {
    const sample = {
      id: "681ae63102e89003e4003d1e",
      modelKey: "chime",
      state: "CONNECTED",
      name: "Chime Kitchen",
      type: "UP Chime PoE",
      guid: "caf4395d-53d6-4a67-93fb-69c7dd879c93",
      mac: "F4E2C6775C9F",
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
    const parsed = chimeSchema.parse(sample);
    expect(parsed).toEqual(sample);
    expect(parsed.type).toBe("UP Chime PoE");
  });

  it("light schema accepts the 7.3.70 doc response sample", () => {
    const sample = LIGHT_DOC_7_3_70;
    expect(lightSchema.parse(sample)).toEqual(sample);
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

  it("file upload output schema accepts the 7.3.70 doc upload response sample", () => {
    const sample = {
      name: "34225b30-fe6a-11af-1690-29424bd911c2.png",
      type: "animations",
      originalName: "welcome-animation.png",
      path: "/data/animations/34225b30-fe6a-11af-1690-29424bd911c2.png",
    };
    const parsed = z.object(fileOutputSchema).parse(sample);
    expect(parsed).toEqual(sample);
  });

  it("POS transaction output schema accepts the 7.3.70 doc response sample", () => {
    const sample = {
      created: true,
      eventId: "string",
    };
    const parsed = z.object(posTransactionOutputSchema).parse(sample);
    expect(parsed).toEqual(sample);
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

  // --- Fields added in Protect 7.3.x ---

  it("camera schema accepts the 7.3.x type/guid pair (captured live 7.3.47)", () => {
    const parsed = cameraSchema.parse({
      id: "6803e86a017e3503e4006b50",
      modelKey: "camera",
      state: "CONNECTED",
      name: "Front Camera",
      type: "UVC G6 Turret",
      guid: "be9d8e45-62a8-ae84-8b23-71723c7decaf",
      mac: "84784824E645",
    });
    expect(parsed.type).toBe("UVC G6 Turret");
    expect(parsed.guid).toBe("be9d8e45-62a8-ae84-8b23-71723c7decaf");
  });

  it("guid is a model identifier, not a device identity (two units, one guid)", () => {
    // Captured live 7.3.47: distinct cameras of the same model share a guid.
    // This is documented in the schema description; the test pins the fact so a
    // future edit cannot quietly re-describe guid as unique per device.
    const shared = "be9d8e45-62a8-ae84-8b23-71723c7decaf";
    const a = cameraSchema.parse({ id: "6803e86a017e3503e4006b50", guid: shared });
    const b = cameraSchema.parse({ id: "68d5eab800308d03e40321f9", guid: shared });
    expect(a.guid).toBe(b.guid);
    expect(a.id).not.toBe(b.id);
  });

  it("nvr schema accepts the 7.3.x type/guid/mac fields (captured live 7.3.47)", () => {
    const parsed = nvrSchema.parse({
      id: "67f5751003927603e40003ec",
      modelKey: "nvr",
      name: "Melrose NVR Pro",
      type: "UNVR-PRO",
      guid: "10b3fc63-28eb-4f7e-b8de-7579cd609cf5",
      mac: "0CEA1447C0A4",
    });
    expect(parsed.mac).toBe("0CEA1447C0A4");
  });

  it("ulp user schema accepts the 7.3.x email field, incl. a service account", () => {
    // Captured live 7.3.47: service accounts return "" rather than null here,
    // but nullableString must tolerate both.
    expect(() =>
      ulpUserSchema.parse({
        id: "fe92f806-6942-4b59-8be2-66950701cdfa",
        modelKey: "ulpUser",
        firstName: "Oliver",
        lastName: "Wine",
        fullName: "Oliver Wine",
        email: "ow@mroliverwine.com",
        status: "ACTIVE",
      })
    ).not.toThrow();
    expect(() =>
      ulpUserSchema.parse({
        id: "222eb570-10db-4636-bc06-fff0ec31f0ac",
        modelKey: "ulpUser",
        firstName: "scrypted",
        lastName: "",
        fullName: "scrypted",
        email: "",
        status: "ACTIVE",
      })
    ).not.toThrow();
    expect(() => ulpUserSchema.parse({ id: "x", email: null })).not.toThrow();
  });

  it("sensor schema accepts the full 7.3.70 doc response sample", () => {
    const sample = SENSOR_DOC_7_3_70;
    const parsed = sensorSchema.parse(sample);
    expect(parsed).toEqual(sample);
    expect(parsed.featureFlags).toBeDefined();
  });

  it("fob schema accepts the 7.3.70 doc response sample (hasKeypad inside featureFlags, no backlight)", () => {
    const sample = FOB_DOC_7_3_70;
    const parsed = fobSchema.parse(sample);
    expect(parsed).toEqual(sample);
    expect(parsed.featureFlags).toEqual({ buttons: ["arm", "disarm", "panic"], hasKeypad: false });
    // 7.3.70: hasKeypad is a featureFlags member, not a top-level fob field.
    expect(Object.keys(fobSchema.shape)).not.toContain("hasKeypad");
    // The docs also render these collapsed as bare {} on the list endpoint.
    expect(() =>
      fobSchema.parse({ id: "x", armControlSettings: {}, keypadSettings: {} })
    ).not.toThrow();
  });

  it("alarm hub schema accepts the 7.3.70 doc sample (deviceTamperStatus nested in alarmHub)", () => {
    // Trimmed from the /v1/alarm-hubs/{id} doc sample: alarmHub keeps only a
    // few of its members, values and nesting verbatim.
    const sample = {
      id: "66d025b301ebc903e80003ea",
      modelKey: "linkstation",
      state: "CONNECTED",
      name: "Front Door",
      type: "UVC Micro",
      guid: "6b8fdd7c-7e4c-4156-bb39-be05ca855491",
      mac: "24A43C3DFEB9",
      isAlarmHub: true,
      ledSettings: {
        isEnabled: true,
      },
      lastEvent: 1445408038748,
      alarmHub: {
        armed: "on",
        cover: {
          distance: 0,
          status: "open",
        },
        deviceTamperStatus: "tampered",
        emergencyTerminalStatus: {
          plusPinStatus: "disabled",
          minusPinStatus: "disabled",
          terminalStatus: "disabled",
          idleSubState: "open",
        },
      },
      threadState: {
        network: {
          status: "ready",
          role: "disabled",
          networkName: "string",
          channel: 11,
          panId: "^0$",
          extendedPanId: "^0$",
          joinedDeviceCount: 0,
          errorReason: "string",
          lastUpdatedAt: 0,
        },
      },
    };
    const parsed = alarmHubSchema.parse(sample);
    expect(parsed).toEqual(sample);
    expect((parsed.alarmHub as Record<string, unknown>).deviceTamperStatus).toBe("tampered");
    // 7.3.70: deviceTamperStatus lives inside alarmHub, not at the top level.
    expect(Object.keys(alarmHubSchema.shape)).not.toContain("deviceTamperStatus");
    expect(Object.keys(linkStationSchema.shape)).not.toContain("deviceTamperStatus");
  });

  // --- Verbatim 7.3.70 GET-by-id doc response samples ---
  // No instances of these device types on the console, so the published docs
  // are the ground truth. Copied verbatim; the link-station sample drops the
  // repeated "property2" entries of its channel-keyed maps (property1 kept).

  const DOC_SAMPLES_7_3_70: [keyof typeof DEVICE_SCHEMAS, Record<string, unknown>][] = [
    ["light", LIGHT_DOC_7_3_70],
    ["sensor", SENSOR_DOC_7_3_70],
    ["siren", SIREN_DOC_7_3_70],
    ["fob", FOB_DOC_7_3_70],
    ["relay", RELAY_DOC_7_3_70],
    ["viewer", VIEWER_DOC_7_3_70],
    ["speaker", SPEAKER_DOC_7_3_70],
    ["bridge", BRIDGE_DOC_7_3_70],
    ["link_station", LINKSTATION_DOC_7_3_70],
  ];

  it.each(DOC_SAMPLES_7_3_70)(
    "%s schema accepts the verbatim 7.3.70 doc response sample",
    (key, sample) => {
      // Full schema (passthrough) round-trips the sample unchanged.
      expect(DEVICE_SCHEMAS[key].parse(sample)).toEqual(sample);
      // The tool-facing outputSchema shape the SDK validates against.
      expect(z.object(itemOutputShape(key)).safeParse(sample).success).toBe(true);
    }
  );
});
