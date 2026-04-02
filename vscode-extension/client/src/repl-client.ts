// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * ReplClient — IPC client for the STruC++ command server.
 *
 * Connects to the debug binary's command pipe (Unix domain socket on
 * Linux/macOS, Named Pipe on Windows) and sends REPL commands as plain text.
 * The protocol is newline-delimited: one command per line, one response per line.
 *
 * Commands use the same format as the interactive REPL:
 *   "force instance0.STATE 2"  → "OK: instance0.STATE FORCED = 2"
 *   "get instance0.STATE"      → "OK: instance0.STATE : INT = 2 [FORCED]"
 *   "unforce instance0.STATE"  → "OK: instance0.STATE unforced. Value: 0"
 */

import * as net from "node:net";

/** Result from a command that may succeed or fail. */
export interface CommandResult {
  ok: boolean;
  message: string;
}

export class ReplClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private responseBuffer = "";
  private pendingResolve: ((line: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;

  /**
   * Connect to the command server pipe.
   * Retries with exponential backoff (up to ~3s total) to allow the
   * binary time to start and create the pipe.
   */
  async connect(pipePath: string): Promise<void> {
    const maxRetries = 6;
    const baseDelay = 100; // ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.tryConnect(pipePath);
        return;
      } catch {
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
      }
    }
    throw new Error(`Failed to connect to command server at ${pipePath}`);
  }

  private tryConnect(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const sock = net.createConnection({ path: pipePath }, () => {
        settled = true;
        // Disable the connection timeout now that we're connected
        sock.setTimeout(0);
        this.socket = sock;
        this.connected = true;
        this.responseBuffer = "";
        resolve();
      });

      sock.on("data", (data: Buffer) => {
        this.responseBuffer += data.toString();
        this.drainBuffer();
      });

      sock.on("close", () => {
        this.connected = false;
        this.socket = null;
        if (this.pendingReject) {
          this.pendingReject(new Error("Connection closed"));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      });

      sock.on("error", (err: Error) => {
        this.connected = false;
        this.socket = null;
        if (this.pendingReject) {
          this.pendingReject(err);
          this.pendingResolve = null;
          this.pendingReject = null;
        }
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      // Timeout only for the initial connection attempt
      sock.setTimeout(5000, () => {
        if (!settled) {
          settled = true;
          sock.destroy();
          reject(new Error("Connection timeout"));
        }
      });
    });
  }

  /** Process buffered data and resolve pending command if a complete line arrived. */
  private drainBuffer(): void {
    const nlIndex = this.responseBuffer.indexOf("\n");
    if (nlIndex >= 0 && this.pendingResolve) {
      const line = this.responseBuffer.substring(0, nlIndex);
      this.responseBuffer = this.responseBuffer.substring(nlIndex + 1);
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve(line);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.responseBuffer = "";
    if (this.pendingReject) {
      this.pendingReject(new Error("Disconnected"));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send a REPL command and wait for the response line.
   * @param command Full REPL command (e.g., "force instance0.STATE 2")
   * @returns The response line (e.g., "OK: instance0.STATE FORCED = 2")
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.socket || !this.connected) {
      throw new Error("Not connected to command server");
    }

    if (this.pendingResolve) {
      throw new Error("A command is already in progress");
    }

    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Timeout after 5 seconds
      const timeout = setTimeout(() => {
        if (this.pendingReject) {
          this.pendingReject(new Error("Command timed out"));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      }, 5000);

      // Clear timeout when resolved
      const originalResolve = this.pendingResolve;
      this.pendingResolve = (line: string) => {
        clearTimeout(timeout);
        originalResolve(line);
      };

      this.socket!.write(command + "\n");

      // Check if response already in buffer
      this.drainBuffer();
    });
  }

  /**
   * Parse a response line into a CommandResult.
   * "OK: ..." → {ok: true, message: "..."}
   * "ERR: ..." → {ok: false, message: "..."}
   */
  static parseResponse(response: string): CommandResult {
    if (response.startsWith("OK:")) {
      return { ok: true, message: response.substring(3).trimStart() };
    }
    if (response.startsWith("ERR:")) {
      return { ok: false, message: response.substring(4).trimStart() };
    }
    return { ok: false, message: response };
  }
}
