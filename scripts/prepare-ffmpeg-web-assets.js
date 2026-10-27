const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceDirectory = path.join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "umd");
const outputDirectory = path.join(projectRoot, "public", "vibe-ffmpeg");
const assetNames = ["ffmpeg.js", "814.ffmpeg.js"];

function prepareFfmpegWebAssets() {
  fs.mkdirSync(outputDirectory, { recursive: true });

  for (const assetName of assetNames) {
    const source = path.join(sourceDirectory, assetName);
    const destination = path.join(outputDirectory, assetName);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing FFmpeg web asset: ${source}. Run npm install before starting or building the web app.`);
    }
    fs.copyFileSync(source, destination);
  }
}

if (require.main === module) prepareFfmpegWebAssets();

module.exports = prepareFfmpegWebAssets;
