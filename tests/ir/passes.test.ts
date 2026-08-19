import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import {
  runPasses,
  PassVerificationError,
  type IrPass,
} from "../../src/ir/passes/pass.js";
import type { IrModule } from "../../src/ir/ir.js";

function moduleOf(src: string): IrModule {
  const { ast } = analyze(src);
  return lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
}

const SRC = `
  PROGRAM Main
  VAR a : INT; b : INT; END_VAR
    b := a + 1;
  END_PROGRAM
`;

const identity: IrPass = { name: "identity", run: (m) => m };

describe("pass runner", () => {
  it("runs a pipeline and returns the module", () => {
    const m = moduleOf(SRC);
    const { module } = runPasses(m, [identity, identity]);
    expect(module).toBe(m);
  });

  it("collects notes only in verbose mode", () => {
    const chatty: IrPass = {
      name: "chatty",
      run: (m, ctx) => {
        ctx.note("did a thing");
        return m;
      },
    };
    expect(runPasses(moduleOf(SRC), [chatty]).notes).toEqual([]);
    const verbose = runPasses(moduleOf(SRC), [chatty], { verbose: true });
    expect(verbose.notes).toEqual([{ pass: "chatty", message: "did a thing" }]);
  });

  it("verifies after each pass and blames the pass that broke the IR", () => {
    const breaker: IrPass = {
      name: "breaker",
      run: (m) => {
        // Corrupt a branch target so verification fails.
        const fn = m.functions[0]!;
        const term = fn.blocks.at(-1)!.instrs.at(-1)!;
        if (term.op === "ret") {
          fn.blocks[fn.blocks.length - 1]!.instrs.push({
            id: 9999,
            op: "br",
            target: "does-not-exist",
            type: { kind: "void" },
            operands: [],
          });
        }
        return m;
      },
    };
    try {
      runPasses(moduleOf(SRC), [breaker]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PassVerificationError);
      expect((e as PassVerificationError).pass).toBe("breaker");
    }
  });

  it("can skip verification when asked", () => {
    const m = moduleOf(SRC);
    expect(() =>
      runPasses(m, [identity], { verifyAfterEach: false }),
    ).not.toThrow();
  });
});
