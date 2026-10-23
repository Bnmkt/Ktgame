// Shared by the service worker and startup downloader; no account/document URLs qualify.
(function (scope) {
  const CACHE = "ktga-resources-v1";
  const revisionKey = "ktga_resource_revision";
  function allowed(value, origin) {
    try {
      const url = new URL(value, origin), home = new URL(origin);
      if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) return false;
      if (url.origin !== home.origin && !(home.hostname === "www.ktga.me" && url.origin === "https://api.ktga.me")) return false;
      if (url.search || url.hash) return false;
      const pathname = decodeURIComponent(url.pathname);
      if (/(?:^|\/)\.\.?\//.test(pathname)) return false;
      return /^\/(?:discord-activity\/)?(?:assets\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|webp|svg)|mascotte_assets\/ui\/[a-z0-9-]+\.webp|(?:audio|guides|event|pwa|locales)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|woff2?|json)|favicon\.svg|ktga-preview\.png)$/.test(pathname)
        || /^\/(?:discord-activity\/)?api\/(?:media\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)|game-images\/[a-f0-9]{64}\.(?:png|gif)|ranked\/insignia-images\/[a-f0-9]{64})$/.test(pathname);
    } catch { return false; }
  }
  scope.ktgaResourcePolicy = { CACHE, revisionKey, allowed };
})(globalThis);
