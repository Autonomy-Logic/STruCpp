/**
 * The runtime headers and the generated header include only the standard
 * headers they use, and the replacements still behave: `FixedArray` keeps the
 * layout and constant initialisation of `std::array`, and `CURRENT_DT` reads
 * the wall clock on both of its clock paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import {
  hasGpp,
  CXX_STD,
  cxxEnv,
  RUNTIME_INCLUDE_PATH,
} from "./test-helpers.js";

const header = (name: string): string =>
  fs.readFileSync(path.join(RUNTIME_INCLUDE_PATH, name), "utf-8");

const runtimeHeaders = fs
  .readdirSync(RUNTIME_INCLUDE_PATH)
  .filter((name) => name.endsWith(".hpp"));

const PROBE_CPP = `#include "iec_array.hpp"
#include "iec_std_lib.hpp"
#include <array>
#include <cstdio>
#include <ctime>
using namespace strucpp;

static_assert(sizeof(strucpp_detail::FixedArray<int, 5>) == sizeof(std::array<int, 5>), "layout");
static_assert(alignof(strucpp_detail::FixedArray<double, 3>) == alignof(std::array<double, 3>), "alignment");
static_assert(strucpp_detail::FixedArray<int, 4>::size() == 4, "size");
constexpr strucpp_detail::FixedArray<int, 3> kTable{{7, 8, 9}};
static_assert(kTable[1] == 8 && *(kTable.end() - 1) == 9 && kTable.cbegin() == kTable.data(), "constant");

int main() {
  IEC_ARRAY_1D<INT_t, ArrayBounds<1, 3>> a;
  a[1] = 4;
  a[3] = 6;
  int sum = 0;
  for (auto& v : a) sum += static_cast<INT_t>(v);
  if (sum != 10) { std::printf("sum %d\\n", sum); return 1; }
  long long dt = static_cast<long long>(CURRENT_DT().get());
  long long now = static_cast<long long>(std::time(nullptr)) * 1000000000LL;
  long long skew = dt > now ? dt - now : now - dt;
  if (skew > 5000000000LL) { std::printf("skew %lld\\n", skew); return 2; }
  std::printf("ok\\n");
  return 0;
}
`;

describe("lean runtime includes", () => {
  it("no runtime header includes <algorithm>, <array> or <ostream>", () => {
    for (const name of runtimeHeaders) {
      const text = header(name);
      expect(text, name).not.toMatch(/#include\s*<algorithm>/);
      expect(text, name).not.toMatch(/#include\s*<array>/);
      expect(text, name).not.toMatch(/#include\s*<ostream>/);
    }
    expect(header("iec_enum.hpp")).toMatch(/#include <iosfwd>/);
  });

  it("iec_std_lib.hpp includes <chrono> only for targets without clock_gettime", () => {
    const text = header("iec_std_lib.hpp");
    expect(text).toMatch(
      /#if defined\(__wasi__\) \|\| defined\(__linux__\)\n#include <time\.h>\n#else\n#include <chrono>\n#endif/,
    );
    expect(text.match(/#include <chrono>/g)).toHaveLength(1);
  });

  it("the generated header includes neither <array> nor <string>", () => {
    const result = compile(
      `PROGRAM Main
VAR
  A : ARRAY[1..3] OF INT;
  S : STRING;
END_VAR
A[1] := 1;
S := 'x';
END_PROGRAM
CONFIGURATION C
  RESOURCE R ON PLC
    TASK T(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM I WITH T : Main;
  END_RESOURCE
END_CONFIGURATION`,
    );
    expect(result.success).toBe(true);
    expect(result.headerCode).not.toMatch(/#include <array>/);
    expect(result.headerCode).not.toMatch(/#include <string>/);
    expect(result.headerCode).toMatch(/#include <cstddef>/);
  });

  it("undefines only the C stdlib macros the generated code uses as identifiers", () => {
    const plain = compile(`PROGRAM Main
VAR
  X : INT;
END_VAR
X := X + 1;
END_PROGRAM
CONFIGURATION C
  RESOURCE R ON PLC
    TASK T(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM I WITH T : Main;
  END_RESOURCE
END_CONFIGURATION`);
    expect(plain.success).toBe(true);
    expect(plain.headerCode).not.toMatch(
      /#undef (TMP_MAX|EOF|BUFSIZ|FOPEN_MAX|FILENAME_MAX|RAND_MAX|EXIT_SUCCESS|EXIT_FAILURE)\b/,
    );

    const clashing = compile(`PROGRAM Main
VAR
  TMP_MAX : INT;
END_VAR
TMP_MAX := TMP_MAX + 1;
END_PROGRAM
CONFIGURATION C
  RESOURCE R ON PLC
    TASK T(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM I WITH T : Main;
  END_RESOURCE
END_CONFIGURATION`);
    expect(clashing.success).toBe(true);
    expect(clashing.headerCode).toMatch(/#undef TMP_MAX\b/);
    expect(clashing.headerCode).not.toMatch(/#undef (EOF|RAND_MAX)\b/);
  });
});

describe.skipIf(!hasGpp)("lean runtime headers with g++", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-lean-"));
    fs.writeFileSync(path.join(tempDir, "probe.cpp"), PROBE_CPP);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (defines: string[], name: string): string => {
    const binary = path.join(tempDir, name);
    execSync(
      `g++ -std=${CXX_STD} -Wall -Wextra -Werror ${defines.join(" ")} -I"${RUNTIME_INCLUDE_PATH}" "${path.join(tempDir, "probe.cpp")}" -o "${binary}" 2>&1`,
      { encoding: "utf-8", env: cxxEnv },
    );
    return execSync(`"${binary}"`, { encoding: "utf-8" });
  };

  it("keeps std::array's layout and reads the wall clock on the host's clock path", () => {
    expect(run([], "probe-host")).toBe("ok\n");
  });

  it("reads the wall clock through clock_gettime", () => {
    const defines = process.platform === "linux" ? [] : ["-D__wasi__"];
    expect(run(defines, "probe-clock-gettime")).toBe("ok\n");
  });

  it("lets code after the generated header include <string> and <algorithm>", () => {
    const result = compile(`PROGRAM Main
VAR
  X : INT;
END_VAR
X := X + 1;
END_PROGRAM
CONFIGURATION C
  RESOURCE R ON PLC
    TASK T(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM I WITH T : Main;
  END_RESOURCE
END_CONFIGURATION`);
    expect(result.success).toBe(true);
    fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(
      path.join(tempDir, "block.cpp"),
      '#include "generated.hpp"\n#include <string>\n#include <algorithm>\n#include <cstdio>\n' +
        'int main() { std::string s = "ab"; std::reverse(s.begin(), s.end()); return s == "ba" && EOF == -1 ? 0 : 1; }\n',
    );
    const binary = path.join(tempDir, "block");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${tempDir}" "${path.join(tempDir, "block.cpp")}" -o "${binary}" 2>&1`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(() => execSync(`"${binary}"`)).not.toThrow();
  });
});
