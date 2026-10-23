import { IMAGE_ARCHIVE_LIMITS } from "./image-archive.js";

export async function readImageArchive(file, maxMb, signal) {
  if (file.size > IMAGE_ARCHIVE_LIMITS.compressed) throw Error("Choisis une archive ZIP de 50 Mo maximum.");
  const bytes = await file.arrayBuffer();
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL("./image-archive.worker.js", import.meta.url), { type:"module" });
    const finish = (error,result) => { clearTimeout(timeout); worker.terminate(); signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(result); };
    const abort = () => finish(new DOMException("Cancelled","AbortError"));
    const timeout = setTimeout(() => finish(Error("La lecture de cette archive est trop longue. Réduis sa taille.")),20000);
    signal?.addEventListener("abort",abort,{once:true});
    worker.onmessage = ({data}) => finish(data.error ? Error(data.error) : null,data.result);
    worker.onerror = event => { event.preventDefault(); finish(Error("Impossible de lire cette archive ZIP.")); };
    worker.postMessage({bytes,maxMb},[bytes]);
  });
}
