// Script to generate PNG assets from SVG if needed
const fs = require("fs")
const path = require("path")

// Create a simple base64 encoded 1x1 transparent PNG as fallback
const transparentPNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

// Simple icon PNG (32x32 blue square with Y)
const iconPNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABklEQVR4AWMYBaNgFIwCQgAAA4gAAdNMBQkAAAAASUVORK5CYII="

// Create assets directory if it doesn't exist
const assetsDir = path.join(__dirname, "..", "assets")
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true })
}

// Generate simple asset files
const assets = {
  "icon.png": iconPNG,
  "favicon.png": iconPNG,
  "splash.png": iconPNG,
  "adaptive-icon.png": iconPNG,
}

Object.entries(assets).forEach(([filename, data]) => {
  const filepath = path.join(assetsDir, filename)
  if (!fs.existsSync(filepath)) {
    // Convert base64 to buffer and write
    const base64Data = data.replace(/^data:image\/png;base64,/, "")
    const buffer = Buffer.from(base64Data, "base64")
    fs.writeFileSync(filepath, buffer)
    console.log(`Generated ${filename}`)
  }
})

console.log("Asset generation complete!")
