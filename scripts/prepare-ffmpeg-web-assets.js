const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(projectRoot, "public", "vibe-ffmpeg");
const assets = [
  { sourceDirectory: path.join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "umd"), name: "ffmpeg.js" },
  { sourceDirectory: path.join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "umd"), name: "814.ffmpeg.js" },
  { sourceDirectory: path.join(projectRoot, "node_modules", "@ffmpeg", "core", "dist", "umd"), name: "ffmpeg-core.js" },
  { sourceDirectory: path.join(projectRoot, "node_modules", "@ffmpeg", "core", "dist", "umd"), name: "ffmpeg-core.wasm" },
];

function prepareFfmpegWebAssets() {
  fs.mkdirSync(outputDirectory, { recursive: true });

  for (const asset of assets) {
    const source = path.join(asset.sourceDirectory, asset.name);
    const destination = path.join(outputDirectory, asset.name);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing FFmpeg web asset: ${source}. Run npm install before starting or building the web app.`);
    }
    fs.copyFileSync(source, destination);
  }
}

if (require.main === module) prepareFfmpegWebAssets();

module.exports = prepareFfmpegWebAssets;
