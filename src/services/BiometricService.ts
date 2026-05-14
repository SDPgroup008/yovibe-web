// Simulated biometric service for eye scanning
export class BiometricService {
  static async isAvailable(): Promise<boolean> {
    // Simulate checking if biometric hardware is available
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 500)
    })
  }

  static async captureBiometric(): Promise<string> {
    // Simulate capturing biometric data (eye scan)
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate successful capture with a mock hash
        const mockBiometricHash = `bio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        resolve(mockBiometricHash)
      }, 2000)
    })
  }

  static async verifyBiometric(storedHash: string, capturedData: string): Promise<boolean> {
    // Simulate biometric verification
    return new Promise((resolve) => {
      setTimeout(() => {
        // For demo purposes, we'll simulate a 95% success rate
        const isMatch = Math.random() > 0.05
        resolve(isMatch)
      }, 1500)
    })
  }

  static generateBiometricHash(rawData: string): string {
    // Simulate generating a secure hash from biometric data
    return `hash_${btoa(rawData)}_${Date.now()}`
  }
}

export default BiometricService
