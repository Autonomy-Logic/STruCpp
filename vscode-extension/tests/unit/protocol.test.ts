// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import {
  CompileRequest,
  BuildRequest,
  GetSettingsRequest,
  CompileLibRequest,
  GetLibrariesRequest,
  LibrariesChangedNotification,
} from "../../shared/protocol.js";
import type { ExtensionSettings } from "../../shared/protocol.js";

describe("protocol request types", () => {
  it("CompileRequest has correct method name", () => {
    expect(CompileRequest.method).toBe("strucpp/compile");
  });

  it("BuildRequest has correct method name", () => {
    expect(BuildRequest.method).toBe("strucpp/build");
  });

  it("GetSettingsRequest has correct method name", () => {
    expect(GetSettingsRequest.method).toBe("strucpp/getSettings");
  });

  it("CompileLibRequest has correct method name", () => {
    expect(CompileLibRequest.method).toBe("strucpp/compileLib");
  });

  it("GetLibrariesRequest has correct method name", () => {
    expect(GetLibrariesRequest.method).toBe("strucpp/getLibraries");
  });

  it("LibrariesChangedNotification has correct method name", () => {
    expect(LibrariesChangedNotification.method).toBe("strucpp/librariesChanged");
  });
});

describe("ExtensionSettings type", () => {
  it("has formatOnSave field", () => {
    const settings: ExtensionSettings = {
      libraryPaths: [],
      autoDiscoverLibraries: true,
      outputDirectory: "./generated",
      gppPath: "g++",
      ccPath: "cc",
      cxxFlags: "",
      globalConstants: {},
      autoAnalyze: true,
      analyzeDelay: 400,
      formatOnSave: false,
    };
    expect(settings.formatOnSave).toBe(false);
  });
});
