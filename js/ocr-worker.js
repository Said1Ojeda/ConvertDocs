// el ocr corre en un worker aparte porque tarda y si va en la pagina se congela todo
// usa el core de tesseract directo, sin tesseract.js, porque ese no se podia bajar sin internet

let api = null;
let Tess = null;

// mismo chequeo de simd que usa wasm-feature-detect
const tieneSimd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));

async function arrancar() {
    if (api) return;

    importScripts(tieneSimd
        ? '../vendor/tesseract/tesseract-core-simd-lstm.wasm.js'
        : '../vendor/tesseract/tesseract-core-lstm.wasm.js');

    Tess = await TesseractCore({
        TesseractProgress(pct) { postMessage({ tipo: 'avance', pct }); },
    });

    // el modelo va comprimido para que el repo no pese tanto
    const res = await fetch('../vendor/tesseract/spa.traineddata.gz');
    if (!res.ok) throw new Error('No se encontró el modelo de español');
    const datos = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    Tess.FS.writeFile('spa.traineddata', new Uint8Array(datos));

    api = new Tess.TessBaseAPI();
    // 1 = solo lstm, es lo unico que trae este core
    if (api.Init(null, 'spa', 1, undefined) === -1) {
        api = null;
        throw new Error('No arrancó tesseract');
    }
}

onmessage = async (e) => {
    const { id, imagen } = e.data;
    try {
        await arrancar();
        Tess.FS.writeFile('/input', new Uint8Array(imagen));
        if (api.SetImageFile(1, 0) === 1) throw new Error('No pudo leer la imagen');
        api.Recognize(null);
        postMessage({ tipo: 'listo', id, texto: api.GetUTF8Text() });
    } catch (err) {
        postMessage({ tipo: 'error', id, error: String(err && err.message || err) });
    }
};
