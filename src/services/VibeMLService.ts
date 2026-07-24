/**
 * Lazily-loaded TensorFlow.js ML model for vibe analysis.
 * TensorFlow.js is loaded from CDN (not bundled) to avoid Metro/webpack chunk issues.
 * Only imported by AddVibeScreen — never bundled on app startup.
 */

type ProgressCallback = (percent: number) => void
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

/** Load TensorFlow.js from CDN script tag */
function loadTFJSFromCDN(onProgress?: (frac: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('tfjs-script')
    if (existing) {
      resolve((window as any).tf)
      return
    }
    const script = document.createElement('script')
    script.id = 'tfjs-script'
    script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'
    script.async = true
    script.onload = () => {
      onProgress?.(1)
      resolve((window as any).tf)
    }
    script.onerror = () => reject(new Error('Failed to load TensorFlow.js from CDN'))
    document.head.appendChild(script)
  })
}

class VibeMLService {
  private tf: any = null
  private model: any = null
  private loadState: LoadState = 'idle'
  private loadError: string | null = null
  private loadPromise: Promise<void> | null = null

  get state(): LoadState { return this.loadState }
  get error(): string | null { return this.loadError }
  get modelReady(): boolean { return this.loadState === 'ready' && this.model !== null }

  /**
   * Dynamically import TensorFlow.js from CDN and load the ML model.
   * @param onProgress — called with 0-100 percentage during loading.
   */
  async loadModel(onProgress?: ProgressCallback): Promise<void> {
    if (this.loadState === 'loading' && this.loadPromise) {
      return this.loadPromise
    }
    if (this.loadState === 'ready') return

    this.loadState = 'loading'
    this.loadError = null
    this.loadPromise = this.doLoad(onProgress)
    return this.loadPromise
  }

  /**
   * Reset state and reload from scratch (used by retry).
   */
  async reloadModel(onProgress?: ProgressCallback): Promise<void> {
    this.model = null
    this.tf = null
    this.loadState = 'idle'
    this.loadError = null
    this.loadPromise = null
    return this.loadModel(onProgress)
  }

  /**
   * Run inference on an image. Must call loadModel() first.
   */
  async predict(imageUri: string): Promise<{
    predictedClass: number
    confidence: number
  }> {
    if (!this.modelReady || !this.model || !this.tf) {
      throw new Error('Model not loaded. Call loadModel() first.')
    }
    const tf = this.tf
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = async () => {
        try {
          const tensor = tf.browser.fromPixels(img)
            .resizeNearestNeighbor([224, 224])
            .toFloat()
            .expandDims(0)

          const prediction = this.model.predict(tensor) as any
          const values = await prediction.data()

          tensor.dispose()
          prediction.dispose()

          const probs = Array.from(values)
          const predictedClass = probs.indexOf(Math.max(...probs))
          const confidence = Math.max(...probs)
          resolve({ predictedClass, confidence })
        } catch (error) {
          reject(error)
        }
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUri
    })
  }

  private async doLoad(onProgress?: ProgressCallback): Promise<void> {
    onProgress?.(0)
    console.log('[VibeMLService] Loading TensorFlow.js from CDN...')

    try {
      const tf = await loadTFJSFromCDN()
      this.tf = tf
      onProgress?.(5)
      console.log('[VibeMLService] TensorFlow.js loaded, backend:', this.tf?.getBackend())

      await this.tf.ready()
      onProgress?.(10)
      console.log('[VibeMLService] tf.ready() done')

      // Verify model.json is accessible
      console.log('[VibeMLService] Fetching model.json...')
      const modelJsonResponse = await fetch('/vibe_model_tfjs/model.json')
      if (!modelJsonResponse.ok) {
        throw new Error(`Failed to fetch model.json: ${modelJsonResponse.status} ${modelJsonResponse.statusText}`)
      }
      const modelJson = await modelJsonResponse.json()
      const weightFiles = modelJson.weightsManifest?.[0]?.paths || []
      console.log('[VibeMLService] model.json OK, weights:', weightFiles.length)

      for (const wf of weightFiles) {
        const fr = await fetch(`/vibe_model_tfjs/${wf}`, { method: 'HEAD' })
        if (!fr.ok) console.warn(`[VibeMLService] Weight not accessible: ${wf}`)
      }

      // Load the model with progress
      const modelUrl = '/vibe_model_tfjs/model.json'
      const timeoutMs = 60000

      const loadPromise = tf.loadLayersModel(modelUrl, {
        onProgress: (fraction: number) => {
          const pct = 10 + Math.round(fraction * 80)
          onProgress?.(pct)
          console.log(`[VibeMLService] Load progress: ${pct}%`)
        },
      })

      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Model loading timeout after 60s')), timeoutMs)
      )

      this.model = await Promise.race([loadPromise, timeoutPromise])
      this.loadState = 'ready'
      onProgress?.(100)
      console.log('[VibeMLService] ✅ ML model loaded successfully')
    } catch (err: any) {
      this.model = null
      this.loadState = 'error'
      this.loadError = err.message || 'Unknown error loading ML model'
      this.loadPromise = null
      console.error('[VibeMLService] ❌ Failed to load ML model:', this.loadError)
      throw err
    }
  }
}

export default new VibeMLService()
