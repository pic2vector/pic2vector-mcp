import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ATTRIBUTION_URL, TOOL_DESCRIPTION, TOOL_NAME } from "./constants.js";
import { InputError } from "./errors.js";
import { ensureVtracerReady } from "./trace/load-vtracer.js";
import { parseVectorizeArguments, vectorizeImage } from "./tool/vectorize-image.js";

const tool = {
  name: TOOL_NAME,
  title: "Vectorize image",
  description: TOOL_DESCRIPTION,
  inputSchema: {
    type: "object" as const,
    properties: {
      input: {
        type: "string",
        description:
          "Absolute path to a local PNG or JPG, or an http(s) URL. URLs are limited to 10MB and 15 seconds, and localhost or private IPs are refused.",
      },
      mode: {
        type: "string",
        enum: ["color", "bw"],
        description:
          'color (default) traces full-color illustrations and logos. bw traces line art, signatures, and scans.',
      },
      output_path: {
        type: "string",
        description:
          "SVG destination. Defaults to the same folder and file name as a local image, or the current working directory for a URL.",
      },
    },
    required: ["input"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      output_path: { type: "string" },
      width: { type: "integer" },
      height: { type: "integer" },
      mode: { type: "string", enum: ["color", "bw"] },
      path_count: { type: "integer" },
      size_bytes: { type: "integer" },
      attribution: { type: "string" },
    },
    required: ["output_path", "width", "height", "mode", "path_count", "size_bytes", "attribution"],
    additionalProperties: false,
  },
  annotations: {
    title: "Vectorize image",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export function createServer(): Server {
  const server = new Server(
    {
      name: "pic2vector",
      version: readPackageVersion(),
      title: "Pic2Vector",
      description: "Convert PNG and JPG images to SVG vectors.",
      websiteUrl: ATTRIBUTION_URL,
    },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name !== TOOL_NAME) {
        return errorResult(`Unknown tool: ${request.params.name}`);
      }
      const args = parseVectorizeArguments(request.params.arguments);
      return await vectorizeImage(args);
    } catch (error) {
      if (error instanceof InputError) return errorResult(error.message);
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Vectorization failed: ${message}`);
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  await ensureVtracerReady();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function errorResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "..", "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? "0.0.0";
}
