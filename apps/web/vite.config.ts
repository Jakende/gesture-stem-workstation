import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { basename, extname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const demoDirectory = resolve(repositoryRoot, "uploads/ES_Nazca Lines - Lonov");
const mediapipeWasmDirectory = resolve(repositoryRoot, "node_modules/@mediapipe/tasks-vision/wasm");
const handModel = resolve(repositoryRoot, "models/hand_landmarker.task");

const demoFiles = [
  { filename: "ES_Nazca Lines STEMS DRUMS - Lonov.wav", role: "drums", name: "Drums" },
  { filename: "ES_Nazca Lines STEMS BASS - Lonov.wav", role: "bass", name: "Bass" },
  { filename: "ES_Nazca Lines STEMS MELODY - Lonov.wav", role: "melody", name: "Melody" },
  { filename: "ES_Nazca Lines STEMS INSTRUMENTS - Lonov.wav", role: "other", name: "Instruments" }
] as const;

function demoAudioPlugin(): Plugin {
  return {
    name: "local-demo-audio",
    configureServer(server) {
      server.middlewares.use("/__demo_manifest", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(demoFiles.map((file) => ({
          ...file,
          url: `/__demo_audio/${encodeURIComponent(file.filename)}`,
          available: existsSync(resolve(demoDirectory, file.filename))
        }))));
      });
      server.middlewares.use("/__demo_audio", (request, response) => {
        const filename = decodeURIComponent((request.url ?? "").replace(/^\//, ""));
        const candidate = resolve(demoDirectory, filename);
        if (!demoFiles.some((entry) => resolve(demoDirectory, entry.filename) === candidate) || !existsSync(candidate)) {
          response.statusCode = 404;
          response.end("Demo stem not found");
          return;
        }
        const size = statSync(candidate).size;
        const range = request.headers.range;
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Type", "audio/wav");
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          const start = match?.[1] ? Number(match[1]) : 0;
          const end = match?.[2] ? Number(match[2]) : size - 1;
          response.statusCode = 206;
          response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          response.setHeader("Content-Length", end - start + 1);
          createReadStream(candidate, { start, end }).pipe(response);
          return;
        }
        response.setHeader("Content-Length", size);
        createReadStream(candidate).pipe(response);
      });
    }
  };
}

function localVisionAssetsPlugin(): Plugin {
  const sendFile = (candidate: string, response: ServerResponse): void => {
    if (!existsSync(candidate)) {
      response.statusCode = 404;
      response.end("Local vision asset not found. Run ./scripts/fetch-models.");
      return;
    }
    const contentTypes: Record<string, string> = {
      ".js": "text/javascript",
      ".wasm": "application/wasm",
      ".task": "application/octet-stream"
    };
    response.setHeader("Content-Type", contentTypes[extname(candidate)] ?? "application/octet-stream");
    response.setHeader("Content-Length", statSync(candidate).size);
    createReadStream(candidate).pipe(response);
  };

  return {
    name: "local-mediapipe-assets",
    configureServer(server) {
      server.middlewares.use("/__mediapipe_wasm", (request, response) => {
        const filename = basename(decodeURIComponent((request.url ?? "").replace(/^\//, "")));
        sendFile(resolve(mediapipeWasmDirectory, filename), response);
      });
      server.middlewares.use("/__models/hand_landmarker.task", (_request, response) => sendFile(handModel, response));
    },
    writeBundle(options) {
      const outputDirectory = typeof options.dir === "string" ? options.dir : resolve(import.meta.dirname, "dist");
      mkdirSync(resolve(outputDirectory, "mediapipe-wasm"), { recursive: true });
      cpSync(mediapipeWasmDirectory, resolve(outputDirectory, "mediapipe-wasm"), { recursive: true });
      if (existsSync(handModel)) {
        mkdirSync(resolve(outputDirectory, "models"), { recursive: true });
        cpSync(handModel, resolve(outputDirectory, "models/hand_landmarker.task"));
      }
    }
  };
}

export default defineConfig({
  plugins: [demoAudioPlugin(), localVisionAssetsPlugin()],
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  build: { target: "es2022" }
});
