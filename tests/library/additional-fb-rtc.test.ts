/**
 * RTC behaviour tests: compiles the RTC source from the Additional Function
 * Blocks library and runs ST test blocks against it through g++.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { compileStlib } from "../../src/library/library-compiler.js";
import { hasGpp, runE2ETestPipeline } from "../integration/test-helpers.js";

const RTC_SOURCE = path.resolve(
  __dirname,
  "../../libs/sources/additional-function-blocks/rtc.st",
);

const TEST_ST = `
TEST 'IN FALSE: Q is FALSE and CDT follows the runtime clock'
  VAR c : RTC; first : DT; END_VAR
  c(IN := FALSE, PDT := DT#2000-01-01-00:00:00);
  ASSERT_FALSE(c.Q);
  first := c.CDT;
  ADVANCE_TIME(T#3s);
  c(IN := FALSE, PDT := DT#2000-01-01-00:00:00);
  ASSERT_EQ(c.CDT - first, T#3s);
END_TEST

TEST 'rising edge: Q is TRUE and CDT equals PDT'
  VAR c : RTC; END_VAR
  c(IN := TRUE, PDT := DT#2024-03-01-12:00:00);
  ASSERT_TRUE(c.Q);
  ASSERT_EQ(c.CDT, DT#2024-03-01-12:00:00);
END_TEST

TEST 'IN TRUE: CDT advances by the elapsed time'
  VAR c : RTC; END_VAR
  c(IN := TRUE, PDT := DT#2024-03-01-12:00:00);
  ADVANCE_TIME(T#5s);
  c(IN := TRUE, PDT := DT#2024-03-01-12:00:00);
  ASSERT_EQ(c.CDT, DT#2024-03-01-12:00:05);
  ADVANCE_TIME(T#1m);
  c(IN := TRUE, PDT := DT#2024-03-01-12:00:00);
  ASSERT_EQ(c.CDT, DT#2024-03-01-12:01:05);
END_TEST

TEST 'IN TRUE: PDT is latched on the rising edge only'
  VAR c : RTC; END_VAR
  c(IN := TRUE, PDT := DT#2024-03-01-12:00:00);
  ADVANCE_TIME(T#2s);
  c(IN := TRUE, PDT := DT#1999-12-31-23:59:59);
  ASSERT_EQ(c.CDT, DT#2024-03-01-12:00:02);
END_TEST

TEST 'falling edge: Q is FALSE and CDT returns to the runtime clock'
  VAR c : RTC; clock : RTC; END_VAR
  c(IN := TRUE, PDT := DT#2040-01-01-00:00:00);
  ASSERT_EQ(c.CDT, DT#2040-01-01-00:00:00);
  c(IN := FALSE, PDT := DT#2040-01-01-00:00:00);
  clock(IN := FALSE, PDT := DT#2040-01-01-00:00:00);
  ASSERT_FALSE(c.Q);
  ASSERT_EQ(c.CDT, clock.CDT);
END_TEST

TEST 'a new rising edge latches the new PDT'
  VAR c : RTC; END_VAR
  c(IN := TRUE, PDT := DT#2024-03-01-12:00:00);
  ADVANCE_TIME(T#10s);
  c(IN := FALSE, PDT := DT#2024-03-01-12:00:00);
  c(IN := TRUE, PDT := DT#2030-06-15-08:30:00);
  ASSERT_EQ(c.CDT, DT#2030-06-15-08:30:00);
END_TEST
`;

describe.skipIf(!hasGpp)("RTC function block", () => {
  it("passes the ST behaviour tests", () => {
    const lib = compileStlib(
      [{ source: fs.readFileSync(RTC_SOURCE, "utf-8"), fileName: "rtc.st" }],
      { name: "rtc-under-test", version: "1.0.0", namespace: "strucpp" },
    );
    expect(lib.success).toBe(true);

    const { stdout, exitCode } = runE2ETestPipeline({
      sourceST: "PROGRAM Dummy END_PROGRAM",
      testST: TEST_ST,
      testFileName: "test_rtc.st",
      isTestBuild: true,
      tempDirPrefix: "strucpp-rtc-",
      compileOptions: { libraries: [lib.archive] },
    });
    expect(stdout).not.toContain("[FAIL]");
    expect(exitCode).toBe(0);
  }, 60000);
});
