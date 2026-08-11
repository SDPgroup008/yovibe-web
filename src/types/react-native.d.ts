// Type augmentation for React Native Web web-only props that are missing from
// the core react-native typings. Declares `loading` on Image so the web-only
// lazy-loading prop type-checks without changing behavior.
import "react-native"

declare module "react-native" {
  interface ImagePropsBase {
    loading?: "lazy" | "eager"
  }
}
