Object.assign(app, {
    mergeFiles: [],
    mergeView: 'grid',
    // las miniaturas van por archivo y no por posicion, antes al reordenar se cruzaban
    mergeThumbs: new Map(),

    setMergeView(view) {
        this.mergeView = view;
        document.getElementById('merge-grid').classList.toggle('hidden', view !== 'grid');
        document.getElementById('merge-list-view').classList.toggle('hidden', view !== 'list');
        document.getElementById('view-grid-btn').classList.toggle('active-view', view === 'grid');
        document.getElementById('view-list-btn').classList.toggle('active-view', view === 'list');
        this.renderMergeGrid();
    },

    async renderThumb(file) {
        try {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 0.4 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            this.mergeThumbs.set(file, canvas.toDataURL('image/jpeg', 0.7));
            canvas.width = 0; canvas.height = 0;
            page.cleanup();
        } catch (e) {
            // pdf con clave o roto, se queda con el icono
            this.mergeThumbs.set(file, null);
        }
        if (this.mergeFiles.includes(file)) this.renderMergeGrid();
    },

    _updateMergeStats() {
        const n = this.mergeFiles.length;
        const total = this.mergeFiles.reduce((s, f) => s + f.size, 0);
        document.getElementById('merge-file-count').textContent = `${n} archivo${n !== 1 ? 's' : ''}`;
        document.getElementById('merge-total-size').textContent = this.formatSize(total);
        document.getElementById('merge-action-summary').textContent = `${n} PDFs · ${this.formatSize(total)} total`;

        const hay = n > 0;
        document.getElementById('merge-toolbar').classList.toggle('hidden', !hay);
        document.getElementById('merge-drag-hint').classList.toggle('hidden', !hay);
        document.getElementById('merge-action-bar').classList.toggle('hidden', !hay);
    },

    _makeDraggable(el, idx) {
        el.draggable = true;
        el.addEventListener('dragstart', ev => {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(idx));
            setTimeout(() => el.classList.add('dragging-card'), 0);
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging-card');
            document.querySelectorAll('.drag-over-card').forEach(c => c.classList.remove('drag-over-card'));
        });
        el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('drag-over-card'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over-card'));
        el.addEventListener('drop', ev => {
            ev.preventDefault();
            el.classList.remove('drag-over-card');
            const from = parseInt(ev.dataTransfer.getData('text/plain'));
            if (isNaN(from) || from === idx) return;
            const moved = this.mergeFiles.splice(from, 1)[0];
            this.mergeFiles.splice(idx, 0, moved);
            this.renderMergeGrid();
        });
    },

    _mergeDeleteBtn(el, idx) {
        el.querySelector('[data-del]').addEventListener('click', ev => {
            ev.stopPropagation();
            this.mergeFiles.splice(idx, 1);
            this.renderMergeGrid();
        });
    },

    renderMergeGrid() {
        this._updateMergeStats();

        const grid = document.getElementById('merge-grid');
        const list = document.getElementById('merge-list-view');
        grid.innerHTML = '';
        list.innerHTML = '';

        this.mergeFiles.forEach((f, idx) => {
            const thumb = this.mergeThumbs.get(f);

            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.innerHTML = `
                <div class="pdf-thumb-wrap">
                    ${thumb
                        ? `<img class="pdf-thumb-canvas" src="${thumb}" alt="Página 1 de ${f.name}">`
                        : `<div class="pdf-thumb-placeholder">
                               <i class="fa-regular fa-file-pdf"></i>
                               <span style="font-size:10px;color:#9ca3af">Sin previa</span>
                           </div>`}
                    <div class="pdf-card-order">${idx + 1}</div>
                    <button class="pdf-card-delete" data-del title="Eliminar"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="pdf-card-footer">
                    <div class="pdf-card-name" title="${f.name}">${f.name}</div>
                    <div class="pdf-card-size">${this.formatSize(f.size)}</div>
                </div>`;
            this._mergeDeleteBtn(card, idx);
            this._makeDraggable(card, idx);
            grid.appendChild(card);

            const row = document.createElement('div');
            row.className = 'merge-list-row';
            row.innerHTML = `
                <i class="fa-solid fa-grip-vertical text-gray-300 dark:text-gray-500 text-base flex-shrink-0"></i>
                <div class="merge-list-thumb">
                    ${thumb
                        ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">`
                        : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><i class="fa-regular fa-file-pdf" style="color:#a78bfa;font-size:16px"></i></div>'}
                </div>
                <div style="flex:1;min-width:0">
                    <div class="pdf-card-name" title="${f.name}">${f.name}</div>
                    <div class="pdf-card-size">${this.formatSize(f.size)}</div>
                </div>
                <span style="font-size:11px;font-weight:700;color:#9333ea;background:#f3e8ff;padding:2px 8px;border-radius:99px;flex-shrink:0">${idx + 1}</span>
                <button class="text-gray-300 hover:text-red-400 transition flex-shrink-0 ml-1" data-del title="Eliminar" style="background:none;border:none;cursor:pointer;font-size:14px"><i class="fa-solid fa-xmark"></i></button>`;
            this._mergeDeleteBtn(row, idx);
            this._makeDraggable(row, idx);
            list.appendChild(row);
        });
    },

    _addMergeFiles(files) {
        const nuevos = Array.from(files).filter(f => f.type === 'application/pdf');
        if (!nuevos.length) { this.toast('Solo se aceptan archivos PDF', 'error'); return; }
        nuevos.forEach(f => {
            this.mergeFiles.push(f);
            this.renderThumb(f);
        });
        this.renderMergeGrid();
    },

    resetMerge() {
        this.mergeFiles = [];
        this.mergeThumbs = new Map();
        document.getElementById('merge-grid').innerHTML = '';
        document.getElementById('merge-list-view').innerHTML = '';
        ['merge-toolbar', 'merge-action-bar', 'merge-drag-hint'].forEach(id => document.getElementById(id).classList.add('hidden'));
    },

    initMerge() {
        document.getElementById('merge-input').addEventListener('change', (e) => {
            const files = this.getFiles(e);
            if (!files || !files.length) return;
            this.resetMerge();
            this._addMergeFiles(files);
            e.target.value = '';
        });

        document.getElementById('merge-input-add').addEventListener('change', (e) => {
            const files = this.getFiles(e);
            if (!files || !files.length) return;
            this._addMergeFiles(files);
            e.target.value = '';
        });

        document.getElementById('btn-merge').addEventListener('click', async () => {
            if (this.mergeFiles.length < 2) { this.toast('Selecciona al menos 2 PDFs', 'error'); return; }
            const btn = document.getElementById('btn-merge');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Uniendo...';

            try {
                const merged = await PDFLib.PDFDocument.create();
                for (const f of this.mergeFiles) {
                    const pdf = await PDFLib.PDFDocument.load(await f.arrayBuffer());
                    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
                    pages.forEach(p => merged.addPage(p));
                }
                const out = await merged.save();
                this.download(new Blob([out], { type: 'application/pdf' }), 'Documentos_Unidos.pdf');
                this.toast(`¡${this.mergeFiles.length} PDFs unidos correctamente! ✓`);
            } catch (err) {
                console.error(err);
                this.toast('Error al unir, ¿algún PDF tiene contraseña?', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-layer-group mr-1"></i><span>Unir PDFs</span>';
            }
        });
    },
});

app.inits.push(app.initMerge);
app.resetters.push(app.resetMerge);
