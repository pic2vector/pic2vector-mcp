import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writePng } from "../tests/fixtures.mjs";

const outDir = path.resolve(process.argv[2] ?? "assets/demo-src");
await mkdir(outDir, { recursive: true });

const input = path.join(outDir, "logo.png");
writePng(input, 180, 180, (x, y) => {
  const disk = (x - 78) ** 2 + (y - 92) ** 2 < 48 ** 2;
  const block = x > 96 && x < 152 && y > 28 && y < 84;
  if (block) return [32, 92, 168, 255];
  if (disk) return [210, 48, 52, 255];
  return [0, 0, 0, 0];
});

const output = path.join(outDir, "logo.svg");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/index.js")],
  cwd: outDir,
  stderr: "pipe",
});
const client = new Client({ name: "pic2vector-demo", version: "1.0.0" });
await client.connect(transport);
const listed = await client.listTools();
const result = await client.callTool({
  name: "vectorize_image",
  arguments: { input, mode: "color", output_path: output },
});
await client.close();

const payload = {
  input,
  output,
  description: listed.tools[0].description,
  summary: result.content[0].text,
  structured: result.structuredContent,
};
await writeFile(path.join(outDir, "result.json"), JSON.stringify(payload, null, 2));
console.log(payload.summary);
