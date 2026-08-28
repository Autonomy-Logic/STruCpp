import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function () {
  execSync("node " + resolve(__dirname, "scripts/rebuild-libs.mjs"), {
    stdio: "inherit",
  });
}
