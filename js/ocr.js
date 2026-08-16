/**
 * Reading a scanned CV, in this browser.
 *
 * A scanned PDF has no text layer — it is a photograph of a document — so
 * `extractText` correctly reports that it cannot read it. Until now that was the
 * end of the conversation, and anybody whose CV had been through a scanner was
 * told to type their profile in by hand.
 *
 * The privacy rule is absolute and structural
 * -------------------------------------------
 *
 * OCR runs in the user's browser. The page image is never uploaded, and there is
 * no cloud OCR call anywhere in this file — not as a fallback, not for "hard"
 * pages. That is not a preference: a tool whose whole promise is that a CV never
 * leaves the device cannot make an exception for the CVs it finds difficult.
 *
 * The engine is loaded from the site's own `assets/vendor/` when it has been
 * fetched there, and only otherwise from a public CDN. A CDN can see that
 * somebody downloaded a script; it cannot see the document, because the document
 * never goes anywhere.
 *
 * Cost, and why it is not paid up front
 * -------------------------------------
 *
 * The engine and its English training data are several megabytes. Nothing here
 * loads until somebody has been shown what OCR is and has pressed the button, so
 * a visitor who never uploads a CV — or whose CV has a text layer — downloads
 * none of it.
 */

const VENDOR = new URL("../assets/vendor/", import.meta.url);
const CDN_ENGINE = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const CDN_WORKER_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js";
const CDN_CORE_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1";
const CDN_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";

/** Rendering scale. Below about 2x, OCR accuracy on body text falls off badly. */
const RENDER_SCALE = 2.2;

/** More pages than a CV has. A 40-page scan is not a CV and would take minutes. */
export const MAX_PAGES = 8;

export class OcrUnavailableError extends Error {}
export class OcrCancelledError extends Error {}

let enginePromise = null;

/**
 * Does this PDF look scanned?
 *
 * Asked of the *extracted text*, not of the file, because that is the thing that
 * actually failed. A PDF with a thin text layer — a scan somebody ran through a
 * poor OCR tool years ago — fails the same way and benefits from the same offer.
 */
export function looksScanned(text, pageCount) {
  const letters = String(text || "").replace(/[^a-zA-Z]/g, "").length;
  if (!pageCount) return letters < 200;
  // Fewer than about forty letters a page is not a document anybody wrote.
  return letters / pageCount < 40;
}

/**
 * Load the OCR engine.
 *
 * Cached, because a second attempt after a cancellation should not re-download
 * several megabytes. Throws `OcrUnavailableError` rather than a raw network
 * error so the caller can offer the manual route instead of showing a stack
 * trace to somebody who just wanted to upload a CV.
 */
async function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const sources = [new URL("tesseract.min.js", VENDOR).href, CDN_ENGINE];
    for (const source of sources) {
      try {
        await loadScript(source);
        if (window.Tesseract) return window.Tesseract;
      } catch (ignored) { /* try the next source */ }
    }
    throw new OcrUnavailableError(
      "The text-recognition engine could not be loaded. You can still build "
      + "your profile manually, and nothing about your CV has been sent "
      + "anywhere.");
  })();
  try {
    return await enginePromise;
  } catch (error) {
    // A failed load must not poison every later attempt.
    enginePromise = null;
    throw error;
  }
}

/**
 * Where the worker, the WASM core and the training data come from.
 *
 * Vendored copies are preferred and probed for once. A real deployment should
 * run `tools/fetch_libraries.py` so nothing at all is fetched from a third party
 * while somebody is reading a CV — the CDN can only ever see that a script was
 * downloaded, never the document, but "no third-party request at all" is a
 * cleaner promise than "a harmless one".
 */
let vendoredOcr = null;

async function workerOptions() {
  if (vendoredOcr === null) {
    vendoredOcr = await exists(new URL("tesseract-worker.min.js", VENDOR).href);
  }
  if (vendoredOcr) {
    return {
      workerPath: new URL("tesseract-worker.min.js", VENDOR).href,
      corePath: new URL("tesseract-core/", VENDOR).href,
      langPath: new URL("tessdata/", VENDOR).href,
      logger: () => {},
    };
  }
  return {
    workerPath: CDN_WORKER_PATH,
    corePath: CDN_CORE_PATH,
    langPath: CDN_LANG_PATH,
    logger: () => {},
  };
}

async function exists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (ignored) {
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Read a scanned PDF into text.
 *
 * @param {File}     file
 * @param {object}   options.pdfjs     the already-loaded PDF library
 * @param {Function} options.onProgress ({stage, page, pages, percent}) => void
 * @param {AbortSignal} options.signal  cancellation
 * @returns {Promise<{text, pages, engine}>}
 */
export async function readScannedPdf(file, { pdfjs, onProgress, signal } = {}) {
  const report = (update) => { if (onProgress) onProgress(update); };
  const stop = () => {
    if (signal && signal.aborted) throw new OcrCancelledError("cancelled");
  };

  report({ stage: "preparing", percent: 0,
           message: "Preparing the document" });
  stop();

  const Tesseract = await loadEngine();
  stop();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PAGES);

  const worker = await Tesseract.createWorker("eng", 1,
                                              await workerOptions());

  const pages = [];
  try {
    for (let number = 1; number <= pageCount; number += 1) {
      stop();
      report({
        stage: "reading", page: number, pages: pageCount,
        percent: Math.round(((number - 1) / pageCount) * 90),
        message: `Reading page ${number} of ${pageCount}`,
      });

      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      await page.render({ canvasContext: context, viewport }).promise;

      const { data: result } = await worker.recognize(canvas);
      pages.push(result.text || "");

      /*
       * Wipe the page image as soon as it has been read.
       *
       * The canvas holds a picture of somebody's CV — name, address, employment
       * history, the lot. Clearing it and collapsing the element means the image
       * is not sitting in memory for the rest of the session waiting for a
       * garbage collector that has no urgency about it.
       */
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await worker.terminate().catch(() => {});
    await doc.destroy().catch(() => {});
  }

  report({ stage: "building", percent: 95,
           message: "Building your career profile" });

  return {
    text: pages.join("\n"),
    pages: pageCount,
    truncated: doc.numPages > MAX_PAGES,
    engine: "Tesseract.js, in this browser",
  };
}

/**
 * How much to trust what came back.
 *
 * OCR of a scanned CV is materially worse than reading a text layer, and the
 * review step has to say so rather than presenting a mangled profile with the
 * same confidence as a clean one. This is a crude but honest measure: the
 * proportion of the text that is ordinary words.
 */
export function textQuality(text) {
  const clean = String(text || "");
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 40) {
    return { key: "poor", label: "Poor", ratio: 0,
             message: "Very little readable text came out of this scan." };
  }
  const plausible = words.filter((word) => /^[A-Za-z][A-Za-z'-]{1,}$/.test(word));
  const ratio = plausible.length / words.length;
  if (ratio >= 0.75) {
    return { key: "fair", label: "Reasonable", ratio,
             message: "The scan read reasonably well, but check every field "
                    + "below — OCR misreads names, dates and abbreviations more "
                    + "often than it misreads prose." };
  }
  if (ratio >= 0.5) {
    return { key: "mixed", label: "Mixed", ratio,
             message: "Parts of this scan read poorly. Treat everything below "
                    + "as a rough draft and correct it." };
  }
  return { key: "poor", label: "Poor", ratio,
           message: "This scan did not read well. It may be quicker to build "
                  + "your profile manually than to correct what came out." };
}
