// editar o separar, se escogen paginas y se saca un pdf nuevo solo con esas
// o con todas menos esas, tambien se pueden girar y cambiar de orden
Object.assign(app, {
    splitFile: null,
    splitTotalPages: 0,
    splitThumbs: [],        // dataURL por pagina original, null mientras no se dibuja
    splitSelected: new Set(),
    splitOrder: [],         // numeros de pagina original en el orden que va a salir
    splitRot: {},           // grados extra por pagina original, 0 90 180 o 270
    _splitDims: {},         // ancho y alto de cada pagina ya con su giro propio
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
        this.splitOrder = [];
        this.splitRot = {};
        this._splitDims = {};
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
                this.splitOrder.push(i);
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

        // de paso se guarda la medida, sirve para saber si la hoja va vertical u horizontal
        this._splitDims[pageNum] = { w: vp.width, h: vp.height };

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
                    if (img) {
                        img.src = dataURL;
                        img.removeAttribute('data-lazy');
                        img.style.transform = this._splitThumbTransform(pageNum);
                    }
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

    // la miniatura se gira con css, al exportar se gira de verdad con pdf-lib
    // de lado se escala para que llene la tarjeta de 3 por 4 sin salirse
    _splitThumbTransform(pageNum) {
        const r = this.splitRot[pageNum] || 0;
        if (!r) return '';
        if (r % 180 === 0) return `rotate(${r}deg)`;

        let s = 0.75;
        const d = this._splitDims[pageNum];
        if (d) {
            const k = Math.min(3 / d.w, 4 / d.h);
            s = Math.min(3 / (d.h * k), 4 / (d.w * k));
        }
        return `rotate(${r}deg) scale(${s.toFixed(3)})`;
    },

    _splitRotLabel(pageNum) {
        const r = this.splitRot[pageNum] || 0;
        return r ? `Pág. ${pageNum} · ${r}°` : `Pág. ${pageNum}`;
    },

    _splitCambios() {
        const giradas = Object.keys(this.splitRot).length;
        const movidas = this.splitOrder.some((p, i) => p !== i + 1);
        return { giradas, movidas };
    },

    renderSplitGrid() {
        const grid = document.getElementById('split-page-grid');
        grid.innerHTML = '';
        const totalSel = this.splitSelected.size;
        const s = totalSel !== 1 ? 's' : '';
        const { giradas, movidas } = this._splitCambios();

        document.getElementById('split-sel-count').textContent = `${totalSel} página${s} seleccionada${s}`;
        document.getElementById('split-total-pages').textContent =
            `${this.splitTotalPages} página${this.splitTotalPages !== 1 ? 's' : ''}`;
        document.getElementById('split-action-bar').classList.toggle('hidden', this.splitTotalPages === 0);

        const partes = [];
        if (totalSel > 0) partes.push(`${totalSel} seleccionadas · ${this.splitTotalPages - totalSel} sin seleccionar`);
        else partes.push('Ninguna página seleccionada');
        if (giradas) partes.push(`${giradas} girada${giradas !== 1 ? 's' : ''}`);
        if (movidas) partes.push('orden cambiado');
        document.getElementById('split-action-summary').textContent = partes.join(' · ');

        document.getElementById('btn-split-extract-label').textContent = `Extraer ${totalSel} página${s}`;
        document.getElementById('btn-split-extract').disabled = totalSel === 0;
        document.getElementById('btn-split-delete').disabled = totalSel === 0 || totalSel === this.splitTotalPages;
        document.getElementById('btn-split-reset').classList.toggle('hidden', !giradas && !movidas);

        const isLarge = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD;

        this.splitOrder.forEach((pageNum, idx) => {
            const thumb = this.splitThumbs[pageNum - 1];
            const card = document.createElement('div');
            card.className = `page-card${this.splitSelected.has(pageNum) ? ' selected' : ''}`;
            card.dataset.page = pageNum;
            card.draggable = true;

            const tf = this._splitThumbTransform(pageNum);
            const tfStyle = tf ? ` style="transform:${tf}"` : '';
            let thumbHtml;
            if (thumb) {
                thumbHtml = `<img src="${thumb}" alt="Página ${pageNum}" loading="lazy" draggable="false"${tfStyle}>`;
            } else if (isLarge && pageNum > this.SPLIT_INITIAL_RENDER) {
                thumbHtml = `<img data-lazy="1" src="" alt="Página ${pageNum}" draggable="false" style="background:#f3f4f6;min-height:80px;${tf ? 'transform:' + tf : ''}">`;
            } else {
                thumbHtml = `<div style="min-height:80px;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-spinner fa-spin" style="color:#a78bfa"></i></div>`;
            }

            card.innerHTML = `
                <div class="page-thumb-wrap">${thumbHtml}</div>
                <div class="page-card-check"><i class="fa-solid fa-check"></i></div>
                <div class="page-card-num" title="Posición en el PDF nuevo">${idx + 1}</div>
                <button type="button" class="page-card-zoom" data-act="zoom" title="Ver en grande"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                <div class="page-card-footer">
                    <button type="button" class="page-card-rot" data-act="left" title="Girar a la izquierda"><i class="fa-solid fa-rotate-left"></i></button>
                    <span data-label>${this._splitRotLabel(pageNum)}</span>
                    <button type="button" class="page-card-rot" data-act="right" title="Girar a la derecha"><i class="fa-solid fa-rotate-right"></i></button>
                </div>`;

            card.addEventListener('click', ev => {
                const act = ev.target.closest('[data-act]')?.dataset.act;
                if (act === 'left') return this._splitGirar([pageNum], -90);
                if (act === 'right') return this._splitGirar([pageNum], 90);
                if (act === 'zoom') return this.splitPreview(pageNum);

                if (this.splitSelected.has(pageNum)) this.splitSelected.delete(pageNum);
                else this.splitSelected.add(pageNum);
                this.renderSplitGrid();
            });
            this._splitDraggable(card, idx);
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

    // arrastrar una tarjeta encima de otra la pone en ese lugar
    _splitDraggable(el, idx) {
        el.addEventListener('dragstart', ev => {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(idx));
            setTimeout(() => el.classList.add('dragging-card'), 0);
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging-card');
            document.querySelectorAll('#split-page-grid .drag-over-card').forEach(c => c.classList.remove('drag-over-card'));
        });
        el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('drag-over-card'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over-card'));
        el.addEventListener('drop', ev => {
            ev.preventDefault();
            el.classList.remove('drag-over-card');
            const from = parseInt(ev.dataTransfer.getData('text/plain'));
            if (isNaN(from) || from === idx) return;
            const moved = this.splitOrder.splice(from, 1)[0];
            this.splitOrder.splice(idx, 0, moved);
            this.renderSplitGrid();
        });
    },

    // cambia el giro sin redibujar todo el grid, asi se ve la animacion
    _splitGirar(pages, delta) {
        pages.forEach(p => {
            const r = (((this.splitRot[p] || 0) + delta) % 360 + 360) % 360;
            if (r) this.splitRot[p] = r;
            else delete this.splitRot[p];
        });

        pages.forEach(p => {
            const card = document.querySelector(`#split-page-grid .page-card[data-page="${p}"]`);
            if (!card) return;
            const img = card.querySelector('.page-thumb-wrap img');
            if (img) img.style.transform = this._splitThumbTransform(p);
            const lbl = card.querySelector('[data-label]');
            if (lbl) lbl.textContent = this._splitRotLabel(p);
        });

        // solo se refresca el resumen de abajo
        const { giradas, movidas } = this._splitCambios();
        const sel = this.splitSelected.size;
        const partes = [sel > 0 ? `${sel} seleccionadas · ${this.splitTotalPages - sel} sin seleccionar` : 'Ninguna página seleccionada'];
        if (giradas) partes.push(`${giradas} girada${giradas !== 1 ? 's' : ''}`);
        if (movidas) partes.push('orden cambiado');
        document.getElementById('split-action-summary').textContent = partes.join(' · ');
        document.getElementById('btn-split-reset').classList.toggle('hidden', !giradas && !movidas);
    },

    // si no hay nada seleccionado se avisa, no se le aplica a todo de sorpresa
    _splitObjetivo() {
        const pages = this.splitOrder.filter(p => this.splitSelected.has(p));
        if (!pages.length) this.toast('Selecciona al menos una página', 'error');
        return pages;
    },

    splitRotateSel(delta) {
        const pages = this._splitObjetivo();
        if (pages.length) this._splitGirar(pages, delta);
    },

    // pone las hojas seleccionadas en vertical o en horizontal segun su medida
    async splitOrientar(modo) {
        const pages = this._splitObjetivo();
        if (!pages.length) return;

        const faltan = pages.filter(p => !this._splitDims[p]);
        for (const p of faltan) {
            try {
                const page = await this._splitPdfDoc.getPage(p);
                const vp = page.getViewport({ scale: 1 });
                this._splitDims[p] = { w: vp.width, h: vp.height };
            } catch (err) {
                console.warn(`[split] medida pag ${p}`, err);
            }
        }

        const aGirar = pages.filter(p => {
            const d = this._splitDims[p];
            if (!d || Math.abs(d.w - d.h) < 1) return false;
            const deLado = (this.splitRot[p] || 0) % 180 !== 0;
            const ancho = deLado ? d.h : d.w;
            const alto = deLado ? d.w : d.h;
            return modo === 'vertical' ? ancho > alto : alto > ancho;
        });

        if (!aGirar.length) {
            this.toast(`Esas páginas ya están en ${modo}`, 'info');
            return;
        }
        this._splitGirar(aGirar, 90);
        this.toast(`${aGirar.length} página${aGirar.length !== 1 ? 's' : ''} quedaron en ${modo}`);
    },

    splitResetCambios() {
        this.splitRot = {};
        this.splitOrder = Array.from({ length: this.splitTotalPages }, (_, i) => i + 1);
        this.renderSplitGrid();
        this.toast('Se quitaron los giros y el orden volvió al original', 'info');
    },

    // entiende cosas como 1-3, 5, 8-10 y tambien rangos al reves como 10-8
    _parseRangos(texto, max) {
        const set = new Set();
        const trozos = texto.split(/[,;\s]+/).filter(Boolean);
        if (!trozos.length) return null;
        for (const t of trozos) {
            const m = t.match(/^(\d+)(?:-(\d+))?$/);
            if (!m) return null;
            let a = parseInt(m[1]);
            let b = m[2] ? parseInt(m[2]) : a;
            if (a > b) [a, b] = [b, a];
            if (a < 1 || b > max) return null;
            for (let i = a; i <= b; i++) set.add(i);
        }
        return set;
    },

    splitSelectRange() {
        const input = document.getElementById('split-range-input');
        const set = this._parseRangos(input.value.trim(), this.splitTotalPages);
        if (!set) {
            this.toast(`Escribe páginas entre 1 y ${this.splitTotalPages}, por ejemplo 1-3, 5`, 'error');
            return;
        }
        this.splitSelected = set;
        this.renderSplitGrid();
        this.toast(`${set.size} página${set.size !== 1 ? 's' : ''} seleccionada${set.size !== 1 ? 's' : ''}`, 'info');
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

    // vista grande de una pagina, se puede pasar a la otra y girar desde ahi
    async splitPreview(pageNum) {
        let box = document.getElementById('split-preview');
        if (!box) {
            box = document.createElement('div');
            box.id = 'split-preview';
            box.className = 'split-preview';
            box.innerHTML = `
                <div class="split-preview-bar">
                    <button type="button" data-pv="prev" title="Anterior"><i class="fa-solid fa-chevron-left"></i></button>
                    <span data-pv-label></span>
                    <button type="button" data-pv="next" title="Siguiente"><i class="fa-solid fa-chevron-right"></i></button>
                    <span class="split-preview-sep"></span>
                    <button type="button" data-pv="left" title="Girar a la izquierda"><i class="fa-solid fa-rotate-left"></i></button>
                    <button type="button" data-pv="right" title="Girar a la derecha"><i class="fa-solid fa-rotate-right"></i></button>
                    <span class="split-preview-sep"></span>
                    <button type="button" data-pv="close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="split-preview-body"><canvas></canvas></div>`;
            document.body.appendChild(box);

            box.addEventListener('click', ev => {
                const act = ev.target.closest('[data-pv]')?.dataset.pv;
                if (!act && ev.target.closest('.split-preview-body canvas')) return;
                if (!act || act === 'close') return this._splitClosePreview();
                const p = this._previewPage;
                const idx = this.splitOrder.indexOf(p);
                if (act === 'prev' && idx > 0) this.splitPreview(this.splitOrder[idx - 1]);
                if (act === 'next' && idx < this.splitOrder.length - 1) this.splitPreview(this.splitOrder[idx + 1]);
                if (act === 'left' || act === 'right') {
                    this._splitGirar([p], act === 'left' ? -90 : 90);
                    this.splitPreview(p);
                }
            });

            this._previewKeys = ev => {
                if (!document.getElementById('split-preview')?.classList.contains('open')) return;
                if (ev.key === 'Escape') this._splitClosePreview();
                if (ev.key === 'ArrowLeft') box.querySelector('[data-pv="prev"]').click();
                if (ev.key === 'ArrowRight') box.querySelector('[data-pv="next"]').click();
            };
            document.addEventListener('keydown', this._previewKeys);
        }

        this._previewPage = pageNum;
        box.classList.add('open');
        const idx = this.splitOrder.indexOf(pageNum);
        box.querySelector('[data-pv-label]').textContent =
            `${idx + 1} de ${this.splitOrder.length} · ${this._splitRotLabel(pageNum)}`;

        const token = (this._previewToken || 0) + 1;
        this._previewToken = token;
        try {
            const page = await this._splitPdfDoc.getPage(pageNum);
            const rotation = (page.rotate + (this.splitRot[pageNum] || 0)) % 360;
            const base = page.getViewport({ scale: 1, rotation });
            const fit = Math.min((window.innerWidth - 48) / base.width, (window.innerHeight * 0.8) / base.height);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const vp = page.getViewport({ scale: fit * dpr, rotation });

            if (token !== this._previewToken) return;
            const canvas = box.querySelector('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            canvas.style.width = `${vp.width / dpr}px`;
            canvas.style.height = `${vp.height / dpr}px`;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        } catch (err) {
            console.warn('[split] vista grande', err);
        }
    },

    _splitClosePreview() {
        const box = document.getElementById('split-preview');
        if (!box) return;
        box.classList.remove('open');
        const canvas = box.querySelector('canvas');
        canvas.width = 0;
        canvas.height = 0;
    },

    // modo extraer saca lo seleccionado, quitar saca todo menos eso y todo saca el pdf completo
    async splitExtract(modo) {
        let pagesToKeep;
        if (modo === 'quitar') pagesToKeep = this.splitOrder.filter(p => !this.splitSelected.has(p));
        else if (modo === 'todo') pagesToKeep = this.splitOrder.slice();
        else pagesToKeep = this.splitOrder.filter(p => this.splitSelected.has(p));

        if (!pagesToKeep.length) {
            this.toast('No quedarían páginas en el PDF resultante', 'error');
            return;
        }

        const btnId = { quitar: 'btn-split-delete', todo: 'btn-split-all' }[modo] || 'btn-split-extract';
        const btnEl = document.getElementById(btnId);
        const origHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

        try {
            // se lee de nuevo el archivo, el buffer que uso pdf.js ya no sirve
            const srcPdf = await PDFLib.PDFDocument.load(await this.splitFile.arrayBuffer());
            const newPdf = await PDFLib.PDFDocument.create();

            // de 50 en 50 para no reventar la memoria con pdfs enormes
            for (let b = 0; b < pagesToKeep.length; b += 50) {
                const lote = pagesToKeep.slice(b, b + 50);
                const copied = await newPdf.copyPages(srcPdf, lote.map(p => p - 1));
                copied.forEach((pg, i) => {
                    const extra = this.splitRot[lote[i]] || 0;
                    if (extra) {
                        // se suma al giro que ya traia la hoja
                        const actual = pg.getRotation().angle || 0;
                        pg.setRotation(PDFLib.degrees(((actual + extra) % 360 + 360) % 360));
                    }
                    newPdf.addPage(pg);
                });
            }

            const out = await newPdf.save();
            const baseName = this.splitFile.name.replace(/\.pdf$/i, '');
            const { giradas, movidas } = this._splitCambios();
            const enOrden = pagesToKeep.every((p, i) => i === 0 || p > pagesToKeep[i - 1]);
            const suffix = (modo === 'extraer' && enOrden && !giradas && !movidas)
                ? `_paginas_${pagesToKeep[0]}-${pagesToKeep[pagesToKeep.length - 1]}`
                : '_editado';
            this.download(new Blob([out], { type: 'application/pdf' }), `${baseName}${suffix}.pdf`);

            const n = pagesToKeep.length;
            this.toast(`PDF listo jeje, ${n} página${n !== 1 ? 's' : ''} ${modo === 'extraer' ? 'extraídas' : 'quedaron'} ✓`);
        } catch (err) {
            console.error('[split] al exportar', err);
            this.toast(err?.message?.includes('encrypt')
                ? 'El PDF tiene contraseña y no se puede procesar'
                : 'Error al procesar el PDF, prueba con otro archivo', 'error');
        } finally {
            btnEl.innerHTML = origHtml;
            btnEl.disabled = false;
            this.renderSplitGrid();
        }
    },

    resetSplitUI() {
        this._splitCancelled = true;
        if (this._lazyObserver) {
            this._lazyObserver.disconnect();
            this._lazyObserver = null;
        }
        this._splitClosePreview();
        this.splitFile = null;
        this.splitThumbs = [];
        this.splitSelected = new Set();
        this.splitOrder = [];
        this.splitRot = {};
        this._splitDims = {};
        this.splitTotalPages = 0;
        this._splitPdfDoc = null;

        document.getElementById('split-label').classList.remove('hidden');
        ['split-loading', 'split-editor', 'split-action-bar'].forEach(id => document.getElementById(id).classList.add('hidden'));
        document.getElementById('split-page-grid').innerHTML = '';
        document.getElementById('split-range-input').value = '';
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

        document.getElementById('split-range-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this.splitSelectRange(); }
        });

        document.getElementById('btn-split-extract').addEventListener('click', () => this.splitExtract('extraer'));
        document.getElementById('btn-split-delete').addEventListener('click', () => this.splitExtract('quitar'));
        document.getElementById('btn-split-all').addEventListener('click', () => this.splitExtract('todo'));
    },
});

app.inits.push(app.initSplit);
app.resetters.push(app.resetSplitUI);
