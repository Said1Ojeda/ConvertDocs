// pdf a word sin internet
// si la pagina trae texto se saca directo con pdf.js, si es escaneada se le pasa ocr
// no copia el formato ni las tablas, eso solo lo hace ConvertAPI, pero el texto sale completo
Object.assign(app, {
    wordMode: 'local',
    _ocrWorker: null,
    _ocrPendientes: new Map(),
    _ocrId: 0,

    // menos de esto y se asume que la pagina es una foto o un escaneo
    MIN_CARACTERES_TEXTO: 15,
    ESCALA_OCR: 2.5,

    setWordMode(modo) {
        this.wordMode = modo;
        document.querySelectorAll('[data-word-mode]').forEach(b =>
            b.classList.toggle('active-view', b.dataset.wordMode === modo));
        document.getElementById('word-api-info').classList.toggle('hidden', modo !== 'api');
        document.getElementById('word-local-info').classList.toggle('hidden', modo !== 'local');
        if (modo === 'api') this.checkCredits();
    },

    ocrWorker() {
        if (this._ocrWorker) return this._ocrWorker;
        this._ocrWorker = new Worker('js/ocr-worker.js');
        this._ocrWorker.onmessage = (e) => {
            const { tipo, id } = e.data;
            if (tipo === 'avance') {
                if (this._ocrAvance) this._ocrAvance(e.data.pct);
                return;
            }
            const p = this._ocrPendientes.get(id);
            if (!p) return;
            this._ocrPendientes.delete(id);
            if (tipo === 'listo') p.resolve(e.data.texto);
            else p.reject(new Error(e.data.error));
        };
        this._ocrWorker.onerror = (err) => {
            // si el worker truena se rechaza todo lo que estaba esperando
            this._ocrPendientes.forEach(p => p.reject(err));
            this._ocrPendientes.clear();
            this._ocrWorker = null;
        };
        return this._ocrWorker;
    },

    ocrImagen(buffer) {
        return new Promise((resolve, reject) => {
            const id = ++this._ocrId;
            this._ocrPendientes.set(id, { resolve, reject });
            this.ocrWorker().postMessage({ id, imagen: buffer }, [buffer]);
        });
    },

    // pdf.js da pedacitos de texto sueltos con su posicion, aca se arman lineas y parrafos
    textoAParrafos(items) {
        const piezas = items.filter(it => it.str && it.str.trim());
        if (!piezas.length) return [];

        const lineas = [];
        piezas
            .map(it => ({ x: it.transform[4], y: it.transform[5], h: it.height || 10, str: it.str }))
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .forEach(p => {
                const ultima = lineas[lineas.length - 1];
                // misma linea si la altura casi no cambia
                if (ultima && Math.abs(ultima.y - p.y) < Math.max(2, p.h * 0.4)) {
                    ultima.partes.push(p);
                    ultima.h = Math.max(ultima.h, p.h);
                } else {
                    lineas.push({ y: p.y, h: p.h, partes: [p] });
                }
            });

        let yAnterior = null;
        let hAnterior = 0;
        const renglones = [];
        lineas.forEach(l => {
            const texto = l.partes.sort((a, b) => a.x - b.x).map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
            if (!texto) return;
            const espacio = yAnterior !== null && (yAnterior - l.y) > Math.max(l.h, hAnterior) * 1.7;
            renglones.push({ texto, aparte: espacio });
            yAnterior = l.y;
            hAnterior = l.h;
        });
        return this.juntarRenglones(renglones);
    },

    // un renglon corto casi siempre es fin de parrafo, como en las cartas y oficios
    // los largos se pegan con el siguiente porque es el mismo parrafo partido
    juntarRenglones(renglones) {
        const largo = Math.max(...renglones.map(r => r.texto.length), 1);
        const parrafos = [];
        let actual = '';
        renglones.forEach(r => {
            if (actual && r.aparte) { parrafos.push(actual); actual = ''; }
            if (!actual) actual = r.texto;
            else if (actual.endsWith('-')) actual = actual.slice(0, -1) + r.texto; // palabra partida
            else actual += ' ' + r.texto;

            const corto = r.texto.length < largo * 0.7;
            if (corto || r.texto.endsWith(':')) { parrafos.push(actual); actual = ''; }
        });
        if (actual) parrafos.push(actual);
        return parrafos;
    },

    // el ocr devuelve renglones, una linea en blanco tambien es cambio de parrafo
    ocrAParrafos(texto) {
        const renglones = [];
        let aparte = false;
        texto.split('\n').forEach(l => {
            const t = l.trim();
            if (!t) { aparte = true; return; }
            renglones.push({ texto: t, aparte });
            aparte = false;
        });
        return renglones.length ? this.juntarRenglones(renglones) : [];
    },

    async paginaAPng(page) {
        const vp = page.getViewport({ scale: this.ESCALA_OCR });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        // fondo blanco, si no las paginas transparentes salen negras para el ocr
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        canvas.width = 0; canvas.height = 0;
        return blob.arrayBuffer();
    },

    async wordLocal(file) {
        const loader = document.getElementById('word-loader');
        const status = document.getElementById('word-status');
        loader.style.display = 'block';
        status.style.color = '';
        status.innerText = 'Leyendo el PDF...';

        let usoOcr = 0;
        try {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            const paginas = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const base = (i - 1) / pdf.numPages * 100;
                this.progress('word-pf', 'word-pw', Math.round(base));
                const page = await pdf.getPage(i);
                const contenido = await page.getTextContent();
                let parrafos = this.textoAParrafos(contenido.items);

                if (parrafos.join('').replace(/\s/g, '').length < this.MIN_CARACTERES_TEXTO) {
                    usoOcr++;
                    status.innerText = usoOcr === 1 && i === 1
                        ? `Página ${i} es escaneada, cargando el OCR (la primera vez tarda un poco)...`
                        : `Leyendo con OCR la página ${i} de ${pdf.numPages}...`;
                    this._ocrAvance = (pct) =>
                        this.progress('word-pf', 'word-pw', Math.round(base + pct / pdf.numPages));
                    const texto = await this.ocrImagen(await this.paginaAPng(page));
                    parrafos = this.ocrAParrafos(texto);
                } else {
                    status.innerText = `Sacando texto de la página ${i} de ${pdf.numPages}...`;
                }

                paginas.push(parrafos.length ? parrafos : ['']);
                page.cleanup();
            }
            this._ocrAvance = null;
            this.progress('word-pf', 'word-pw', 100);

            const nombre = file.name.replace(/\.pdf$/i, '') + '.docx';
            this.download(Docx.crear(paginas), nombre);

            status.innerText = usoOcr
                ? `¡Listo! ${usoOcr} página${usoOcr !== 1 ? 's' : ''} se leyeron con OCR, revisa el texto por si algo salió raro.`
                : '¡Listo! Descargado sin usar internet.';
            this.toast('PDF convertido a Word ✓');
        } catch (err) {
            console.error('[word local]', err);
            status.style.color = '#E5322D';
            status.innerText = err?.name === 'PasswordException'
                ? 'El PDF tiene contraseña.'
                : 'No se pudo convertir: ' + (err?.message || 'error raro');
            this.toast('Error en la conversión', 'error');
        } finally {
            loader.style.display = 'none';
            this._ocrAvance = null;
        }
    },
});
