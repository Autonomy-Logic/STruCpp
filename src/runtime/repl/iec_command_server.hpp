// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ IPC Command Server
 *
 * Listens on a platform-specific pipe (Unix domain socket on Linux/macOS,
 * Named Pipe on Windows) for text commands from the VSCode extension.
 * Commands are processed by process_command() from iec_repl.hpp — the same
 * code path used by the interactive REPL.
 *
 * Protocol: newline-delimited text. Each line is a REPL command
 * (e.g., "force instance0.STATE 2"). Response is a single line
 * starting with "OK:" or "ERR:".
 */

#pragma once

#include "iec_repl.hpp"
#include <thread>
#include <atomic>
#include <string>
#include <cstring>
#include <cstdio>

// =============================================================================
// Platform-specific includes
// =============================================================================

#if defined(_WIN32)
#  include <windows.h>
#else
#  include <sys/socket.h>
#  include <sys/un.h>
#  include <unistd.h>
#  include <fcntl.h>
#  include <errno.h>
#endif

namespace strucpp {

class CommandServer {
public:
    CommandServer(const std::string& pipe_path,
                  ProgramDescriptor* programs, size_t program_count)
        : pipe_path_(pipe_path)
        , programs_(programs)
        , program_count_(program_count)
    {}

    ~CommandServer() { stop(); }

    // Non-copyable
    CommandServer(const CommandServer&) = delete;
    CommandServer& operator=(const CommandServer&) = delete;

    void start() {
        if (running_.load()) return;
        running_.store(true);
        listener_thread_ = std::thread([this]() { listener_loop(); });
    }

    void stop() {
        if (!running_.exchange(false)) return;
#if defined(_WIN32)
        // Wake up ConnectNamedPipe by connecting briefly
        HANDLE h = CreateFileA(pipe_path_.c_str(), GENERIC_READ, 0,
                               nullptr, OPEN_EXISTING, 0, nullptr);
        if (h != INVALID_HANDLE_VALUE) CloseHandle(h);
#else
        if (server_fd_ >= 0) {
            shutdown(server_fd_, SHUT_RDWR);
            close(server_fd_);
            server_fd_ = -1;
        }
        unlink(pipe_path_.c_str());
#endif
        if (listener_thread_.joinable()) {
            listener_thread_.join();
        }
    }

private:
    std::string pipe_path_;
    ProgramDescriptor* programs_;
    size_t program_count_;
    std::atomic<bool> running_{false};
    std::thread listener_thread_;

#if !defined(_WIN32)
    int server_fd_{-1};
#endif

    // =========================================================================
    // Platform: Linux / macOS (Unix domain socket)
    // =========================================================================
#if !defined(_WIN32)

    void listener_loop() {
        // Remove stale socket from previous crash
        unlink(pipe_path_.c_str());

        server_fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
        if (server_fd_ < 0) {
            fprintf(stderr, "[cmd-server] socket() failed: %s\n", strerror(errno));
            return;
        }

        struct sockaddr_un addr{};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, pipe_path_.c_str(), sizeof(addr.sun_path) - 1);

        if (bind(server_fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
            fprintf(stderr, "[cmd-server] bind(%s) failed: %s\n",
                    pipe_path_.c_str(), strerror(errno));
            close(server_fd_);
            server_fd_ = -1;
            return;
        }

        if (listen(server_fd_, 1) < 0) {
            fprintf(stderr, "[cmd-server] listen() failed: %s\n", strerror(errno));
            close(server_fd_);
            server_fd_ = -1;
            return;
        }

        // Set accept timeout so we can check running_ periodically
        struct timeval tv{};
        tv.tv_sec = 0;
        tv.tv_usec = 500000; // 500ms
        setsockopt(server_fd_, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

        fprintf(stderr, "[cmd-server] Listening on %s\n", pipe_path_.c_str());

        while (running_.load()) {
            int client_fd = accept(server_fd_, nullptr, nullptr);
            if (client_fd < 0) {
                if (errno == EAGAIN || errno == EWOULDBLOCK) continue; // timeout
                if (!running_.load()) break; // shutting down
                fprintf(stderr, "[cmd-server] accept() failed: %s\n", strerror(errno));
                continue;
            }
            handle_client(client_fd);
            close(client_fd);
        }

        if (server_fd_ >= 0) {
            close(server_fd_);
            server_fd_ = -1;
        }
        unlink(pipe_path_.c_str());
    }

    void handle_client(int client_fd) {
        // Set read timeout so a dead client doesn't block the server forever
        struct timeval tv{};
        tv.tv_sec = 1;
        tv.tv_usec = 0;
        setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

        std::string buffer;
        char chunk[1024];

        while (running_.load()) {
            ssize_t n = read(client_fd, chunk, sizeof(chunk));
            if (n < 0) {
                if (errno == EAGAIN || errno == EWOULDBLOCK) continue; // read timeout, check running_
                break; // real error
            }
            if (n == 0) break; // client disconnected

            buffer.append(chunk, static_cast<size_t>(n));

            // Process complete lines
            size_t pos;
            while ((pos = buffer.find('\n')) != std::string::npos) {
                std::string line = buffer.substr(0, pos);
                buffer.erase(0, pos + 1);

                if (line.empty()) continue;

                std::string response = process_command(line, programs_, program_count_);
                response += "\n";

                // Write full response
                size_t written = 0;
                while (written < response.size()) {
                    ssize_t w = write(client_fd, response.data() + written,
                                      response.size() - written);
                    if (w <= 0) return; // write error
                    written += static_cast<size_t>(w);
                }
            }
        }
    }

    // =========================================================================
    // Platform: Windows (Named Pipe)
    // =========================================================================
#else

    void listener_loop() {
        fprintf(stderr, "[cmd-server] Listening on %s\n", pipe_path_.c_str());

        while (running_.load()) {
            HANDLE pipe = CreateNamedPipeA(
                pipe_path_.c_str(),
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                1,       // max instances
                4096,    // output buffer
                4096,    // input buffer
                500,     // default timeout ms (for ConnectNamedPipe)
                nullptr  // security attributes
            );

            if (pipe == INVALID_HANDLE_VALUE) {
                fprintf(stderr, "[cmd-server] CreateNamedPipe failed: %lu\n", GetLastError());
                return;
            }

            // Wait for client connection (blocks, but stop() wakes it)
            BOOL connected = ConnectNamedPipe(pipe, nullptr)
                             ? TRUE
                             : (GetLastError() == ERROR_PIPE_CONNECTED ? TRUE : FALSE);

            if (!running_.load()) {
                CloseHandle(pipe);
                break;
            }

            if (connected) {
                handle_client_win(pipe);
            }

            DisconnectNamedPipe(pipe);
            CloseHandle(pipe);
        }
    }

    void handle_client_win(HANDLE pipe) {
        std::string buffer;
        char chunk[1024];

        while (running_.load()) {
            DWORD bytesRead = 0;
            BOOL ok = ReadFile(pipe, chunk, sizeof(chunk), &bytesRead, nullptr);
            if (!ok || bytesRead == 0) break;

            buffer.append(chunk, bytesRead);

            size_t pos;
            while ((pos = buffer.find('\n')) != std::string::npos) {
                std::string line = buffer.substr(0, pos);
                buffer.erase(0, pos + 1);

                if (line.empty()) continue;

                std::string response = process_command(line, programs_, program_count_);
                response += "\n";

                DWORD written = 0;
                WriteFile(pipe, response.data(),
                          static_cast<DWORD>(response.size()), &written, nullptr);
            }
        }
    }

#endif // _WIN32
};

} // namespace strucpp
