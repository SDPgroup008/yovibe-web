// Add URL polyfill for React Native
if (typeof URL !== "undefined" && !URL.prototype.hasOwnProperty("protocol")) {
  Object.defineProperty(URL.prototype, "protocol", {
    get: function () {
      const match = this.href.match(/^([^:]+:)/)
      return match ? match[1] : ""
    },
  })
}
