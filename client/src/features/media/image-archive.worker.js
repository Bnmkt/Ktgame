import { extractImageArchive } from "./image-archive.js";
self.onmessage = ({ data }) => {
  try { self.postMessage({ result:extractImageArchive(new Uint8Array(data.bytes), data.maxMb) }); }
  catch (error) { self.postMessage({ error:error.message || "Archive ZIP invalide." }); }
};
