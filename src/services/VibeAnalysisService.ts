/**
 * Service for analyzing venue vibe from images
 * Uses TensorFlow.js ML model with heuristic fallback
 */
import * as tf from '@tensorflow/tfjs';

class VibeAnalysisService {
  private model: tf.LayersModel | null = null
  private modelLoaded = false
  private loadPromise: Promise<void> | null = null

  constructor() {
    this.loadPromise = this.loadMLModel()
  }

  async ensureModelLoaded(): Promise<boolean> {
    if (this.modelLoaded && this.model) {
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
    this.model = null;
    this.modelLoaded = false;
    this.loadPromise = this.loadMLModel();
    await this.loadPromise;
  }

  isModelLoaded(): boolean {
    return this.modelLoaded && this.model !== null;
  }

  async loadMLModel(): Promise<void> {
    try {
      console.log('VibeAnalysisService: Loading ML model...');
      
      await tf.ready();
      console.log('TensorFlow.js ready, backend:', tf.getBackend());

      try {
        console.log('VibeAnalysisService: Loading layers model from /vibe_model_tfjs/model.json...');
        
        // First verify the model files are accessible
        console.log('VibeAnalysisService: Fetching model.json to verify...');
        const modelJsonResponse = await fetch('/vibe_model_tfjs/model.json');
        if (!modelJsonResponse.ok) {
          throw new Error(`Failed to fetch model.json: ${modelJsonResponse.status} ${modelJsonResponse.statusText}`);
        }
        const modelJson = await modelJsonResponse.json();
        const weightFiles = modelJson.weightsManifest?.[0]?.paths || [];
        console.log('VibeAnalysisService: model.json fetched successfully, weights:', weightFiles.length, 'files');
        
        // Check each weight file
        console.log('VibeAnalysisService: Checking weight files...');
        for (const weightFile of weightFiles) {
          const fileResponse = await fetch(`/vibe_model_tfjs/${weightFile}`, { method: 'HEAD' });
          if (!fileResponse.ok) {
            console.error(`VibeAnalysisService: ❌ Weight file NOT accessible: ${weightFile}, status:`, fileResponse.status);
          } else {
            console.log(`VibeAnalysisService: ✓ Weight file accessible: ${weightFile}`);
          }
        }
        
        // Now load the model with custom request options and IndexedDB caching
        console.log('VibeAnalysisService: Calling tf.loadLayersModel with explicit options...');
        
        // Configure IOHandler with requestInit for caching
        const modelUrl = '/vibe_model_tfjs/model.json';
        
        // Add timeout to prevent hanging
        const timeoutMs = 60000; // 60 seconds max
        
        try {
          console.log('VibeAnalysisService: Starting model load (max 60s timeout)...');
          
          const loadPromise = tf.loadLayersModel(modelUrl, {
            onProgress: (fraction) => {
              console.log('VibeAnalysisService: Loading progress:', Math.round(fraction * 100) + '%');
            }
          });
          
          const timeoutPromise = new Promise<tf.LayersModel>((_, reject) => 
            setTimeout(() => reject(new Error('Model loading timeout after 60s')), timeoutMs)
          );
          
          this.model = await Promise.race([loadPromise, timeoutPromise]);
          
          if (this.model) {
            this.modelLoaded = true;
            console.log('VibeAnalysisService: ✅ ML model loaded successfully from TensorFlow.js format');
            console.log('Model inputs:', this.model.inputs.map(i => i.name));
            console.log('Model outputs:', this.model.outputs.map(o => o.name));
          }
          return;
        } catch (loadError) {
          console.error('VibeAnalysisService: tf.loadLayersModel failed:', loadError);
        }
      } catch (e) {
        console.error('TensorFlow.js format failed:', e);
        console.log('VibeAnalysisService: Will try SavedModel format as fallback...');
      }
    } catch (error) {
      console.error('VibeAnalysisService: Failed to load ML model, using heuristic:', error);
      this.modelLoaded = false;
    }
    
    console.log('VibeAnalysisService: Model loading completed, modelLoaded:', this.modelLoaded);
    
    // Log final state
    if (this.modelLoaded) {
      console.log('VibeAnalysisService: ✅ Model ready for inference');
    } else {
      console.log('VibeAnalysisService: ⚠️ Model failed to load, will use heuristic fallback');
    }
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
    console.log('VibeAnalysisService.analyzeVibeImage called, modelLoaded:', this.modelLoaded)
    
    if (!this.modelLoaded || !this.model) {
      if (this.loadPromise) {
        console.log('VibeAnalysisService: Waiting for model to load...');
        try {
          await this.loadPromise;
          console.log('VibeAnalysisService: Model load completed, modelLoaded:', this.modelLoaded);
        } catch {
          console.log('VibeAnalysisService: Using heuristic after load failure');
        }
      }
    }

    if (this.modelLoaded && this.model) {
      try {
        console.log('VibeAnalysisService: Using ML model');
        const result = await this.predictFromModel(imageUri);
        return result;
      } catch (error) {
        console.warn('VibeAnalysisService: ML prediction failed:', error);
      }
    }

    console.log('VibeAnalysisService: Using heuristic analysis');
    const { ratings, vibeRating } = await this.analyzeWithHeuristics(imageUri);
    return { vibeRating, analysisData: ratings };
  }

  private async predictFromModel(imageUri: string): Promise<{
    vibeRating: number
    analysisData: {
      crowdDensity: number
      lightingQuality: number
      energyLevel: number
      musicVibes: number
      overallAtmosphere: number
    }
  }> {
    return new Promise((resolve, reject) => {
      console.log('VibeAnalysisService: Loading image for prediction...')
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = async () => {
        console.log('VibeAnalysisService: Image loaded, creating tensor...')
        try {
          const tensor = tf.browser.fromPixels(img)
            .resizeNearestNeighbor([224, 224])
            .toFloat()
            .expandDims(0)

          console.log('VibeAnalysisService: Running model.predict()...')
          const prediction = this.model!.predict(tensor) as tf.Tensor
          const values = await prediction.data()

          tensor.dispose()
          prediction.dispose()

          const probs = Array.from(values)
          const predictedClass = probs.indexOf(Math.max(...probs))
          const confidence = Math.max(...probs)

          console.log(`VibeAnalysisService: Prediction complete - class=${predictedClass}, confidence=${confidence.toFixed(2)}`)

          const classRatings = [
            { crowdDensity: 0.5, lightingQuality: 0.3, energyLevel: 0.2, musicVibes: 0.3, overallAtmosphere: 0.2 },
            { crowdDensity: 1.8, lightingQuality: 1.5, energyLevel: 1.5, musicVibes: 1.5, overallAtmosphere: 1.5 },
            { crowdDensity: 2.5, lightingQuality: 2.5, energyLevel: 2.5, musicVibes: 2.5, overallAtmosphere: 2.5 },
            { crowdDensity: 3.2, lightingQuality: 3.5, energyLevel: 3.5, musicVibes: 3.2, overallAtmosphere: 3.2 },
            { crowdDensity: 4.0, lightingQuality: 4.2, energyLevel: 4.0, musicVibes: 4.0, overallAtmosphere: 4.0 },
            { crowdDensity: 4.8, lightingQuality: 4.8, energyLevel: 4.8, musicVibes: 4.8, overallAtmosphere: 4.8 },
          ]

          const ratings = classRatings[predictedClass]
          const vibeRating = Math.round(
            (ratings.crowdDensity * 0.3 + ratings.lightingQuality * 0.2 +
             ratings.energyLevel * 0.25 + ratings.musicVibes * 0.15 +
             ratings.overallAtmosphere * 0.1) * 10
          ) / 10

          console.log(`ML: class=${predictedClass}, confidence=${confidence.toFixed(2)}, rating=${vibeRating}`)

          resolve({
            vibeRating: Math.min(5, Math.max(0, vibeRating)),
            analysisData: {
              crowdDensity: ratings.crowdDensity,
              lightingQuality: ratings.lightingQuality,
              energyLevel: ratings.energyLevel,
              musicVibes: ratings.musicVibes,
              overallAtmosphere: ratings.overallAtmosphere,
            },
          })
        } catch (error) {
          reject(error)
        }
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUri
    })
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
          let brightPixels = 0, darkPixels = 0
          let totalPixels = data.length / 4

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            rSum += r; gSum += g; bSum += b
            const brightness = (r + g + b) / 3
            if (brightness > 180) brightPixels++
            if (brightness < 50) darkPixels++
          }

          const avgR = rSum / totalPixels, avgG = gSum / totalPixels, avgB = bSum / totalPixels
          const avgBrightness = (avgR + avgG + avgB) / 3
          const brightnessRatio = brightPixels / totalPixels
          const darknessRatio = darkPixels / totalPixels

          const crowdDensity = Math.min(5, Math.max(0, 2.5 + brightnessRatio * 2 + (Math.random() - 0.5) * 0.5))
          const lightingQuality = Math.min(5, Math.max(0, (avgBrightness / 255) * 5 + (Math.random() - 0.5) * 0.5))
          const energyLevel = Math.min(5, Math.max(0, 3.5 - darknessRatio * 3 + brightnessRatio * 1.5 + (Math.random() - 0.5) * 0.5))
          const colorVariance = Math.abs(avgR - avgG) + Math.abs(avgG - avgB) + Math.abs(avgB - avgR)
          const musicVibes = Math.min(5, Math.max(0, 3 + colorVariance / 100 + (Math.random() - 0.5) * 0.5))
          const overallAtmosphere = Math.min(5, Math.max(0, crowdDensity * 0.25 + lightingQuality * 0.25 + energyLevel * 0.25 + musicVibes * 0.15 + 0.2))

          const ratings = {
            crowdDensity: Math.round(crowdDensity * 10) / 10,
            lightingQuality: Math.round(lightingQuality * 10) / 10,
            energyLevel: Math.round(energyLevel * 10) / 10,
            musicVibes: Math.round(musicVibes * 10) / 10,
            overallAtmosphere: Math.round(overallAtmosphere * 10) / 10,
          }

          const vibeRating = Math.min(5, Math.max(0, Math.round((ratings.crowdDensity * 0.3 + ratings.lightingQuality * 0.2 + ratings.energyLevel * 0.25 + ratings.musicVibes * 0.15 + ratings.overallAtmosphere * 0.1) * 10) / 10))

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