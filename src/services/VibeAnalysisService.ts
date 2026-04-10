/**
 * Service for analyzing venue vibe from images
 * Uses heuristic-based image analysis for vibe prediction
 */

class VibeAnalysisService {
  private modelLoaded = false
  private loadPromise: Promise<void> | null = null

  constructor() {
    this.loadPromise = this.loadMLModel()
  }

  async ensureModelLoaded(): Promise<boolean> {
    if (this.modelLoaded) {
      return true;
    }
    if (this.loadPromise) {
      try {
        await this.loadPromise;
        return this.modelLoaded;
      } catch {
        return false;
      }
    }
    return false;
  }

  async reloadModel(): Promise<void> {
    this.modelLoaded = false;
    this.loadPromise = this.loadMLModel();
    await this.loadPromise;
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  async loadMLModel(): Promise<void> {
    this.modelLoaded = true;
    console.log('VibeAnalysisService: Ready with heuristic-based analysis');
  }

  async analyzeVibeImage(imageUri: string): Promise<{
    vibeRating: number
    analysisData: {
      crowdDensity: number
      lightingQuality: number
      energyLevel: number
      musicVibes: number
      overallAtmosphere: number
    }
  }> {
    if (!this.modelLoaded) {
      if (this.loadPromise) {
        try {
          await this.loadPromise;
        } catch {
          console.log('VibeAnalysisService: Using heuristic analysis after failed init');
        }
      }
    }

    console.log('VibeAnalysisService: Using heuristic-based analysis')
    const { ratings, vibeRating } = await this.analyzeWithHeuristics(imageUri)

    return {
      vibeRating,
      analysisData: ratings,
    }
  }

  private async analyzeWithHeuristics(imageUri: string): Promise<{
    ratings: {
      crowdDensity: number
      lightingQuality: number
      energyLevel: number
      musicVibes: number
      overallAtmosphere: number
    }
    vibeRating: number
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          
          const imageData = ctx.getImageData(0, 0, img.width, img.height)
          const data = imageData.data
          
          let rSum = 0, gSum = 0, bSum = 0
          let brightPixels = 0
          let darkPixels = 0
          let totalPixels = data.length / 4
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            rSum += r
            gSum += g
            bSum += b
            
            const brightness = (r + g + b) / 3
            if (brightness > 180) brightPixels++
            if (brightness < 50) darkPixels++
          }
          
          const avgR = rSum / totalPixels
          const avgG = gSum / totalPixels
          const avgB = bSum / totalPixels
          const avgBrightness = (avgR + avgG + avgB) / 3
          
          const brightnessRatio = brightPixels / totalPixels
          const darknessRatio = darkPixels / totalPixels
          
          const crowdDensity = Math.min(5, Math.max(0, 2.5 + (brightnessRatio * 2) + (Math.random() - 0.5) * 0.5))
          const lightingQuality = Math.min(5, Math.max(0, (avgBrightness / 255) * 5 + (Math.random() - 0.5) * 0.5))
          const energyLevel = Math.min(5, Math.max(0, 3.5 - (darknessRatio * 3) + (brightnessRatio * 1.5) + (Math.random() - 0.5) * 0.5))
          
          const colorVariance = Math.abs(avgR - avgG) + Math.abs(avgG - avgB) + Math.abs(avgB - avgR)
          const musicVibes = Math.min(5, Math.max(0, 3 + (colorVariance / 100) + (Math.random() - 0.5) * 0.5))
          
          const overallAtmosphere = Math.min(5, Math.max(0,
            (crowdDensity * 0.25 + lightingQuality * 0.25 + energyLevel * 0.25 + musicVibes * 0.15 + 0.2)
          ))

          const ratings = {
            crowdDensity: Math.round(crowdDensity * 10) / 10,
            lightingQuality: Math.round(lightingQuality * 10) / 10,
            energyLevel: Math.round(energyLevel * 10) / 10,
            musicVibes: Math.round(musicVibes * 10) / 10,
            overallAtmosphere: Math.round(overallAtmosphere * 10) / 10,
          }

          const vibeRating = Math.min(5, Math.max(0,
            Math.round(
              (ratings.crowdDensity * 0.3 +
                ratings.lightingQuality * 0.2 +
                ratings.energyLevel * 0.25 +
                ratings.musicVibes * 0.15 +
                ratings.overallAtmosphere * 0.1) * 10
            ) / 10
          ))

          resolve({ ratings, vibeRating })
        } catch (error) {
          reject(error)
        }
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUri
    })
  }

  getVibeDescription(rating: number): string {
    if (rating >= 4.5) return "🔥 Absolutely Electric!"
    if (rating >= 4.0) return "⚡ High Energy Vibes"
    if (rating >= 3.5) return "🎉 Great Atmosphere"
    if (rating >= 3.0) return "😊 Good Vibes"
    if (rating >= 2.5) return "👍 Decent Energy"
    if (rating >= 2.0) return "😐 Moderate Vibes"
    if (rating >= 1.5) return "😕 Low Energy"
    if (rating >= 1.0) return "😴 Quiet Night"
    return "💤 Very Calm"
  }

  getVibeColor(rating: number): string {
    if (rating >= 4.5) return "#FF3B30"
    if (rating >= 4.0) return "#FF9500"
    if (rating >= 3.5) return "#FFCC00"
    if (rating >= 3.0) return "#34C759"
    if (rating >= 2.5) return "#007AFF"
    if (rating >= 2.0) return "#5856D6"
    return "#8E8E93"
  }
}

export default new VibeAnalysisService()