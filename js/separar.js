// editar o separar, se escogen paginas y se saca un pdf nuevo solo con esas
// o con todas menos esas (boton eliminar seleccion)
Object.assign(app, {
    splitFile: null,
    splitTotalPages: 0,
    splitThumbs: [],        // dataURL por pagina, null mientras no se dibuja
    splitSelected: new Set(),
    _splitPdfDoc: null,

    // con pdfs de cientos de paginas el navegador se trababa dibujando todo de un solo
    SPLIT_BATCH_SIZE: 5,
    SPLIT_LARGE_PDF_THRESHOLD: 80,
    SPLIT_INITIAL_RENDER: 30,  // en pdfs grandes solo estas se dibujan de entrada, el resto al hacer scroll

    async cargarSplit(file) {
        if (!file || file.type !== 'application/pdf') {
            this.toast('Por favor selecciona un PDF válido', 'error');
            return;
        }

        // si estaba dibujando otro pdf se corta ese loop primero
        this._splitCancelled = true;
        await new Promise(r => setTimeout(r, 50));
        this._splitCancelled = false;

        this.splitFile = file;
        this.splitThumbs = [];
        this.splitSelected = new Set();
        this._splitPdfDoc = null;

        document.getElementById('split-label').classList.add('hidden');
        document.getElementById('split-loading').classList.remove('hidden');
        document.getElementById('split-editor').classList.add('hidden');
        document.getElementById('split-action-bar').classList.add('hidden');

        try {
            // ojo, pdf.js se queda con el buffer que le das, por eso va una copia
            // y al exportar se vuelve a leer el archivo
            const pdf = await pdfjsLib.getDocument({ data: (await file.arrayBuffer()).slice(0) }).promise;
            this._splitPdfDoc = pdf;
            this.splitTotalPages = pdf.numPages;

            // todas seleccionadas de entrada, aunque no tengan miniatura todavia
            for (let i = 1; i <= this.splitTotalPages; i++) {
                this.splitSelected.add(i);
                this.splitThumbs.push(null);
            }

            const isLarge = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD;
            const totalToRender = isLarge ? this.SPLIT_INITIAL_RENDER : this.splitTotalPages;

            document.getElementById('split-loading-text').textContent = isLarge
                ? `PDF grande (${this.splitTotalPages} págs.), cargando vista previa...`
                : `Renderizando ${this.splitTotalPages} páginas...`;

            document.getElementById('split-filename').textContent = file.name;
            document.getElementById('split-filemeta').textContent =
                `${this.splitTotalPages} páginas · ${this.formatSize(file.size)}`;

            // se ensena el grid de una vez con spinners, mejor que pantalla en blanco
            document.getElementById('split-loading').classList.add('hidden');
            document.getElementById('split-editor').classList.remove('hidden');

            await this._renderSplitThumbBatches(pdf, 1, totalToRender);

            if (isLarge && !this._splitCancelled) {
                this._setupLazyThumbRendering(pdf, totalToRender + 1, this.splitTotalPages);
                this.toast(`PDF grande: ${this.splitTotalPages} páginas. Las miniaturas que faltan salen al bajar.`, 'info');
            }

            this.renderSplitGrid();
        } catch (err) {
            console.error('[split] no se pudo leer', err);
            document.getElementById('split-loading').classList.add('hidden');
            document.getElementById('split-label').classList.remove('hidden');
            this.toast('Error al leer el PDF, ¿tiene contraseña?', 'error');
        }
    },

    async _renderSplitThumbBatches(pdf, from, to) {
        for (let start = from; start <= to; start += this.SPLIT_BATCH_SIZE) {
            if (this._splitCancelled) break;

            const end = Math.min(start + this.SPLIT_BATCH_SIZE - 1, to);
            const nums = [];
            for (let n = start; n <= end; n++) nums.push(n);

            // allSettled para que una pagina mala no tumbe el lote
            const results = await Promise.allSettled(nums.map(n => this._renderOneSplitThumb(pdf, n)));
            results.forEach((r, i) => {
                if (r.status === 'rejected') console.warn(`[split] miniatura pag ${nums[i]}`, r.reason);
                this.splitThumbs[nums[i] - 1] = r.status === 'fulfilled' ? r.value : null;
            });

            const loadingText = document.getElementById('split-loading-text');
            if (loadingText) loadingText.textContent = `Renderizando página ${end} de ${this.splitTotalPages}...`;
            this.renderSplitGrid();

            // se le da un respiro al navegador entre lote y lote
            await new Promise(r => setTimeout(r, 0));
        }
    },

    async _renderOneSplitThumb(pdf, pageNum) {
        const page = await pdf.getPage(pageNum);
        const scale = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD ? 0.3 : 0.4;
        const vp = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

        // webp pesa menos, si el navegador no lo soporta devuelve png y ahi se usa jpg
        const webp = canvas.toDataURL('image/webp', 0.6);
        const dataURL = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.65);

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        return dataURL;
    },

    _setupLazyThumbRendering(pdf, fromPage, toPage) {
        if (this._lazyObserver) this._lazyObserver.disconnect();

        this._lazyObserver = new IntersectionObserver(async (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const card = entry.target;
                const pageNum = parseInt(card.dataset.page);
                if (!pageNum || this.splitThumbs[pageNum - 1]) continue;

                this._lazyObserver.unobserve(card);
                try {
                    const dataURL = await this._renderOneSplitThumb(pdf, pageNum);
                    this.splitThumbs[pageNum - 1] = dataURL;
                    // solo se cambia esa imagen, redibujar todo el grid aca se siente feo
                    const img = card.querySelector('img[data-lazy]');
                    if (img) { img.src = dataURL; img.removeAttribute('data-lazy'); }
                } catch (err) {
                    console.warn(`[split] miniatura lazy pag ${pageNum}`, err);
                }
            }
        }, { rootMargin: '200px' });

        document.querySelectorAll('#split-page-grid .page-card[data-page]').forEach(card => {
            const n = parseInt(card.dataset.page);
            if (n >= fromPage && n <= toPage) this._lazyObserver.observe(card);
        });
    },

    renderSplitGrid() {
        const grid = document.getElementById('split-page-grid');
        grid.innerHTML = '';
        const totalSel = this.splitSelected.size;
        const s = totalSel !== 1 ? 's' : '';

        document.getElementById('split-sel-count').textContent = `${totalSel} página${s} seleccionada${s}`;
        document.getElementById('split-total-pages').textContent =
            `${this.splitTotalPages} página${this.splitTotalPages !== 1 ? 's' : ''}`;
        document.getElementById('split-action-bar').classList.toggle('hidden', totalSel === 0);
        document.getElementById('split-action-summary').textContent = totalSel > 0
            ? `${totalSel} seleccionadas para extraer · ${this.splitTotalPages - totalSel} se omitirán`
            : 'Selecciona páginas para continuar';
        document.getElementById('btn-split-extract-label').textContent = `Extraer ${totalSel} página${s}`;

        const isLarge = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD;

        this.splitThumbs.forEach((thumb, i) => {
            const pageNum = i + 1;
            const card = document.createElement('div');
            card.className = `page-card${this.splitSelected.has(pageNum) ? ' selected' : ''}`;
            card.dataset.page = pageNum;

            let thumbHtml;
            if (thumb) {
                thumbHtml = `<img src="${thumb}" alt="Página ${pageNum}" loading="lazy">`;
            } else if (isLarge && pageNum > this.SPLIT_INITIAL_RENDER) {
                thumbHtml = `<img data-lazy="1" src="" alt="Página ${pageNum}" style="background:#f3f4f6;min-height:80px;display:block;width:100%">`;
            } else {
                thumbHtml = `<div style="min-height:80px;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-spinner fa-spin" style="color:#a78bfa"></i></div>`;
            }

            card.innerHTML = `
                <div class="page-thumb-wrap">${thumbHtml}</div>
                <div class="page-card-check"><i class="fa-solid fa-check"></i></div>
                <div class="page-card-num">${pageNum}</div>
                <div class="page-card-footer"><span>Pág. ${pageNum}</span></div>`;

            card.addEventListener('click', () => {
                if (this.splitSelected.has(pageNum)) this.splitSelected.delete(pageNum);
                else this.splitSelected.add(pageNum);
                this.renderSplitGrid();
            });
            grid.appendChild(card);
        });

        // al redibujar el grid los cards son nuevos, hay que volver a observarlos
        if (isLarge && this._lazyObserver && this._splitPdfDoc) {
            grid.querySelectorAll('.page-card[data-page]').forEach(card => {
                const n = parseInt(card.dataset.page);
                if (n > this.SPLIT_INITIAL_RENDER && !this.splitThumbs[n - 1]) this._lazyObserver.observe(card);
            });
        }
    },

    splitSelectAll() {
        for (let i = 1; i <= this.splitTotalPages; i++) this.splitSelected.add(i);
        this.renderSplitGrid();
    },

    splitSelectNone() {
        this.splitSelected.clear();
        this.renderSplitGrid();
    },

    splitInvertSelection() {
        for (let i = 1; i <= this.splitTotalPages; i++) {
            if (this.splitSelected.has(i)) this.splitSelected.delete(i);
            else this.splitSelected.add(i);
        }
        this.renderSplitGrid();
    },

    // quitarSeleccion true = sale todo menos lo seleccionado
    async splitExtract(quitarSeleccion) {
        const pagesToKeep = quitarSeleccion
            ? Array.from({ length: this.splitTotalPages }, (_, i) => i + 1).filter(p => !this.splitSelected.has(p))
            : Array.from(this.splitSelected).sort((a, b) => a - b);

        if (!pagesToKeep.length) {
            this.toast('No quedarían páginas en el PDF resultante', 'error');
            return;
        }

        const btnEl = document.getElementById(quitarSeleccion ? 'btn-split-delete' : 'btn-split-extract');
        const origHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

        try {
            // se lee de nuevo el archivo, el buffer que uso pdf.js ya no sirve
            const srcPdf = await PDFLib.PDFDocument.load(await this.splitFile.arrayBuffer());
            const newPdf = await PDFLib.PDFDocument.create();
            const indices = pagesToKeep.map(p => p - 1);

            // de 50 en 50 para no reventar la memoria con pdfs enormes
            for (let b = 0; b < indices.length; b += 50) {
                const copied = await newPdf.copyPages(srcPdf, indices.slice(b, b + 50));
                copied.forEach(p => newPdf.addPage(p));
            }

            const out = await newPdf.save();
            const baseName = this.splitFile.name.replace(/\.pdf$/i, '');
            const suffix = quitarSeleccion
                ? '_editado'
                : `_paginas_${pagesToKeep[0]}-${pagesToKeep[pagesToKeep.length - 1]}`;
            this.download(new Blob([out], { type: 'application/pdf' }), `${baseName}${suffix}.pdf`);

            const n = pagesToKeep.length;
            this.toast(`PDF listo jeje, ${n} página${n !== 1 ? 's' : ''} ${quitarSeleccion ? 'quedaron' : 'extraídas'} ✓`);
        } catch (err) {
            console.error('[split] al exportar', err);
            this.toast(err?.message?.includes('encrypt')
                ? 'El PDF tiene contraseña y no se puede procesar'
                : 'Error al procesar el PDF, prueba con otro archivo', 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.innerHTML = origHtml;
        }
    },

    resetSplitUI() {
        this._splitCancelled = true;
        if (this._lazyObserver) {
            this._lazyObserver.disconnect();
            this._lazyObserver = null;
        }
        this.splitFile = null;
        this.splitThumbs = [];
        this.splitSelected = new Set();
        this.splitTotalPages = 0;
        this._splitPdfDoc = null;

        document.getElementById('split-label').classList.remove('hidden');
        ['split-loading', 'split-editor', 'split-action-bar'].forEach(id => document.getElementById(id).classList.add('hidden'));
        document.getElementById('split-page-grid').innerHTML = '';
    },

    initSplit() {
        ['split-input', 'split-input-replace'].forEach(id => {
            document.getElementById(id).addEventListener('change', e => {
                const f = this.getFiles(e)?.[0];
                if (f) this.cargarSplit(f);
                e.target.value = '';
            });
        });

        const lbl = document.getElementById('split-label');
        lbl.addEventListener('dragover', e => { e.preventDefault(); lbl.classList.add('dragover'); });
        lbl.addEventListener('dragleave', () => lbl.classList.remove('dragover'));
        lbl.addEventListener('drop', e => {
            e.preventDefault();
            lbl.classList.remove('dragover');
            const f = e.dataTransfer.files[0];
            if (f) this.cargarSplit(f);
        });

        document.getElementById('btn-split-extract').addEventListener('click', () => this.splitExtract(false));
        document.getElementById('btn-split-delete').addEventListener('click', () => this.splitExtract(true));
    },
});

app.inits.push(app.initSplit);
app.resetters.push(app.resetSplitUI);
