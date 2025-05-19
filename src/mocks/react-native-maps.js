// This file mocks react-native-maps for web
// It prevents the bundler from trying to import native modules

const MockMapView = () => null
const MockMarker = () => null
const MockCallout = () => null
const MockPolyline = () => null

MockMapView.Marker = MockMarker
MockMapView.Callout = MockCallout
MockMapView.Polyline = MockPolyline

// Mock the PROVIDER_GOOGLE constant
const PROVIDER_GOOGLE = "google"

export { PROVIDER_GOOGLE }
export { MockMarker as Marker }
export { MockCallout as Callout }
export { MockPolyline as Polyline }
export default MockMapView
