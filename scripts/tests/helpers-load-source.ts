import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
// Run the actual source with isolated infrastructure, never a production pool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadSource(path: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}): Record<string, any> {
    const filename = fileURLToPath(new URL(`../../${path}`, import.meta.url));
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const record = { exports: {} };
    new Function("require", "module", "exports", ...Object.keys(globals), code)((id: string) => {
        if (id in mocks)
            return mocks[id];
        if (!id.startsWith("@/") && !id.startsWith("."))
            return require(id);
        throw new Error(`Unexpected dependency ${id}`);
    }, record, record.exports, ...Object.values(globals));
    return record.exports;
}
