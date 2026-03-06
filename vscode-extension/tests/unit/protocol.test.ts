// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import {
  CompileRequest,
  BuildRequest,
  GetSettingsRequest,
} from "../../shared/protocol.js";

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
});
