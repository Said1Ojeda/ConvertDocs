pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const app = {
    // 
    // ESTADO COMPARTIDO
    // 
    mergeFiles: [],
    imgFiles: [],
    
    // Default fallback API Key
    DEFAULT_API_KEY: '',

     
    // GESTION DE API KEY Y CREDITOS
    
    getApiKey() {
        return localStorage.getItem('convertapiKey') || this.DEFAULT_API_KEY;
    },

    saveApiKey() {
        const input = document.getElementById('api-key-input');
        const newKey = input.value.trim();
        if (newKey) {
            localStorage.setItem('convertapiKey', newKey);
            this.toast('Clave API guardada correctamente ✓');
            input.value = '';
            this.checkCredits();
            setTimeout(() => this.navigate('home'), 1000);
        } else {
            this.toast('Ingresa una clave válida', 'error');
        }
    },

    trackLocalConversion() {
        const currentMonth = new Date().getMonth();
        let stats = JSON.parse(localStorage.getItem('convertApiStats') || '{"month": -1, "count": 0}');
        
        if (stats.month !== currentMonth) {
            stats = { month: currentMonth, count: 1 };
        } else {
            stats.count++;
        }
        localStorage.setItem('convertApiStats', JSON.stringify(stats));
    },

    getLocalConversions() {
        const currentMonth = new Date().getMonth();
        let stats = JSON.parse(localStorage.getItem('convertApiStats') || '{"month": -1, "count": 0}');
        return stats.month === currentMonth ? stats.count : 0;
    },

    checkCredits() {
        const key = this.getApiKey();
        const localCount = this.getLocalConversions();
        
        fetch(`https://v2.convertapi.com/user?Secret=${key}`)
            .then(res => res.json())
            .then(data => {
                if (data.SecondsLeft !== undefined) {
                    const text = `${data.SecondsLeft}s restantes | ${localCount} conv. este mes`;
                    document.querySelectorAll('.api-credits-count').forEach(el => {
                        el.innerText = text;
                        el.classList.remove('text-red-500');
                    });
                } else {
                    throw new Error("Clave inválida");
                }
            })
            .catch(() => {
                document.querySelectorAll('.api-credits-count').forEach(el => {
                    el.innerText = 'Clave inválida o caducada';
                    el.classList.add('text-red-500');
                });
            });
    },

    
    // UI GENERAL Y NAVEGACION (SPA FEEL)
    
    navigate(id) {
        document.querySelectorAll('.spa-section').forEach(s => s.style.display = 'none');
        const sec = document.getElementById(id);
        if (!sec) return;
        sec.style.display = 'block';
        
        const el = sec.querySelector('.animate__animated');
        if (el) { el.classList.remove('animate__fadeInUp'); void el.offsetWidth; el.classList.add('animate__fadeInUp'); }
        
        this.clearStates();
        this.resetUI(); 
        
        if(id === 'pdf-to-word' || id === 'pdf-to-excel') {
            this.checkCredits();
        }

        sec.focus(); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    toggleDarkMode() {
        document.documentElement.classList.toggle('dark');
        document.getElementById('theme-icon').className =
            document.documentElement.classList.contains('dark') ? 'fa-solid fa-sun text-xl' : 'fa-solid fa-moon text-xl';
    },

    clearStates() {
        document.querySelectorAll('.loader').forEach(l => l.style.display = 'none');
        document.querySelectorAll('[id$="-status"]').forEach(s => { s.innerText = ''; s.style.color = ''; });
        document.querySelectorAll('.progress-wrap').forEach(p => p.style.display = 'none');
        document.querySelectorAll('.progress-fill').forEach(p => p.style.width = '0%');
    },

    resetUI() {
        document.querySelectorAll('input[type="file"]').forEach(inp => inp.value = '');
        
        const mergeGrid = document.getElementById('merge-grid');
        if(mergeGrid) mergeGrid.innerHTML = '';
        const mergeListView = document.getElementById('merge-list-view');
        if(mergeListView) mergeListView.innerHTML = '';
        const mergeToolbar = document.getElementById('merge-toolbar');
        if(mergeToolbar) mergeToolbar.classList.add('hidden');
        const mergeActionBar = document.getElementById('merge-action-bar');
        if(mergeActionBar) mergeActionBar.classList.add('hidden');
        const mergeDragHint = document.getElementById('merge-drag-hint');
        if(mergeDragHint) mergeDragHint.classList.add('hidden');

        const imgList = document.getElementById('img-file-list');
        if(imgList) imgList.innerHTML = '';
        const btnImg = document.getElementById('btn-img');
        if(btnImg) btnImg.classList.add('hidden');

        this.mergeFiles = [];
        this.mergeThumbs = {};
        this.imgFiles = [];
        this.resetSplitUI();
    },

    toast(msg, type = 'success') {
        const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info' };
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<i class="fa-solid ${icons[type]}"></i> ${msg}`;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 4000);
    },

    progress(fillId, wrapId, pct) {
        const w = document.getElementById(wrapId);
        const b = document.getElementById(fillId);
        if (!w || !b) return;
        w.style.display = 'block'; b.style.width = pct + '%';
    },

    download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        requestAnimationFrame(() => URL.revokeObjectURL(url));
    },

    
    // DRAG & DROP
     
    setupDragDrop() {
        document.querySelectorAll('.drop-label').forEach(lbl => {
            lbl.addEventListener('dragover', e => { e.preventDefault(); lbl.classList.add('dragover'); });
            lbl.addEventListener('dragleave', e => { e.preventDefault(); lbl.classList.remove('dragover'); });
            lbl.addEventListener('drop', e => {
                e.preventDefault(); 
                lbl.classList.remove('dragover');
                const inp = lbl.querySelector('input[type=file]');
                if (inp && e.dataTransfer.files.length) {
                    const ev = new Event('change', { bubbles: true });
                    ev._dropFiles = e.dataTransfer.files;
                    inp.dispatchEvent(ev);
                }
            });
        });
    },

    getFiles(e) {
        return (e._dropFiles && e._dropFiles.length) ? e._dropFiles : e.target.files;
    },

    
    // 1. COMPRIMIR PDF
    
    initCompress() {
        document.getElementById('compress-input').addEventListener('change', async (e) => {
            const files = this.getFiles(e);
            const file = files?.[0];
            if (!file) return;

            const loader = document.getElementById('compress-loader');
            const status = document.getElementById('compress-status');
            const level = document.querySelector('input[name="compressionLevel"]:checked').value;
            const cfgs = { low:{scale:0.8,q:0.35}, medium:{scale:1.2,q:0.70}, high:{scale:1.8,q:0.90} };
            const cfg = cfgs[level];

            loader.style.display = 'block';
            status.innerText = 'Optimizando... no cierres la pestaña.';

            try {
                const ab = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
                const doc = new window.jspdf.jsPDF('p','pt','a4');
                const W = doc.internal.pageSize.getWidth();
                const H = doc.internal.pageSize.getHeight();

                for (let i = 1; i <= pdf.numPages; i++) {
                    this.progress('compress-pf','compress-pw', Math.round(i/pdf.numPages*100));
                    status.innerText = `Procesando página ${i} de ${pdf.numPages}...`;
                    const page = await pdf.getPage(i);
                    const vp = page.getViewport({ scale: cfg.scale });
                    const canvas = document.createElement('canvas');
                    canvas.width = vp.width; canvas.height = vp.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                    const img = canvas.toDataURL('image/jpeg', cfg.q);
                    
                    if (i > 1) doc.addPage();
                    doc.addImage(img, 'JPEG', 0, 0, W, H);
                    
                    // FIX: Liberar memoria del canvas correctamente
                    canvas.width = 0; canvas.height = 0;
                    page.cleanup();
                    await new Promise(r => requestAnimationFrame(r)); 
                }
                doc.save(`optimizado_${file.name}`);
                status.innerText = '¡Compresión exitosa!';
                this.toast('PDF comprimido ✓');
            } catch(err) {
                console.error(err);
                status.innerText = 'Error al procesar el documento.';
                this.toast('Error al comprimir', 'error');
            } finally {
                loader.style.display = 'none'; e.target.value = '';
            }
        });
    },

    
    // 2. PDF A WORD (Premium API)
    
    initWord() {
        document.getElementById('word-input').addEventListener('change', async (e) => {
            const files = this.getFiles(e);
            const file = files?.[0];
            if (!file) return;

            const loader = document.getElementById('word-loader');
            const status = document.getElementById('word-status');
            loader.style.display = 'block';
            status.innerText = 'Convirtiendo en el servidor...';

            try {
                const fd = new FormData(); fd.append('File', file);
                const res = await fetch(`https://v2.convertapi.com/convert/pdf/to/docx?Secret=${this.getApiKey()}`, { method:'POST', body:fd });
                const data = await res.json();
                
                if (!res.ok || !data.Files) throw new Error(data.Message || 'API fail');
                
                const bytes = Uint8Array.from(atob(data.Files[0].FileData), c => c.charCodeAt(0));
                this.download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), data.Files[0].FileName);
                
                status.innerText = '¡Descargado correctamente!';
                this.toast('PDF convertido a Word ✓');
                
                this.trackLocalConversion();
                this.checkCredits();
            } catch(err) {
                console.error(err);
                status.style.color = '#E5322D';
                status.innerText = 'Error en la conversión.';
                this.toast('Error en la conversión', 'error');
            } finally {
                loader.style.display = 'none'; e.target.value = '';
            }
        });
    },

    
    // 3. PDF A EXCEL (Premium API)
    
    initExcel() {
        document.getElementById('excel-input').addEventListener('change', async (e) => {
            const files = this.getFiles(e);
            const file = files?.[0];
            if (!file) return;

            const loader = document.getElementById('excel-loader');
            const status = document.getElementById('excel-status');
            loader.style.display = 'block';
            status.innerText = 'Convirtiendo en el servidor para mantener el formato exacto...';

            try {
                const fd = new FormData(); fd.append('File', file);
                const res = await fetch(`https://v2.convertapi.com/convert/pdf/to/xlsx?Secret=${this.getApiKey()}`, { method:'POST', body:fd });
                const data = await res.json();
                
                if (!res.ok || !data.Files) throw new Error(data.Message || 'API fail');
                
                const bytes = Uint8Array.from(atob(data.Files[0].FileData), c => c.charCodeAt(0));
                this.download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), data.Files[0].FileName);
                
                status.innerText = '¡Excel descargado correctamente!';
                this.toast('PDF convertido a Excel ✓');
                
                this.trackLocalConversion();
                this.checkCredits();
            } catch(err) {
                console.error(err);
                status.style.color = '#E5322D';
                status.innerText = 'Error en la conversión.';
                this.toast('Error en la conversión', 'error');
            } finally {
                loader.style.display = 'none'; e.target.value = '';
            }
        });
    },


    // 4. UNIR PDF  —  Grid + Thumbnail Edition


    mergeView: 'grid',
    mergeThumbs: {},

    setMergeView(view) {
        this.mergeView = view;
        document.getElementById('merge-grid').classList.toggle('hidden', view !== 'grid');
        document.getElementById('merge-list-view').classList.toggle('hidden', view !== 'list');
        document.getElementById('view-grid-btn').classList.toggle('active-view', view === 'grid');
        document.getElementById('view-list-btn').classList.toggle('active-view', view === 'list');
        this.renderMergeGrid();
    },

    async renderThumb(file, idx) {
        try {
            const bytes = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 0.4 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            this.mergeThumbs[idx] = canvas.toDataURL('image/jpeg', 0.7);
            // FIX: Liberar canvas de memoria tras extraer dataURL
            canvas.width = 0; canvas.height = 0;
            page.cleanup();
        } catch(e) {
            this.mergeThumbs[idx] = null;
        }
        this.renderMergeGrid();
    },

    _mergeFormatSize(bytes) {
        if (bytes >= 1048576) return (bytes/1048576).toFixed(1) + ' MB';
        return Math.round(bytes/1024) + ' KB';
    },

    _updateMergeStats() {
        const n = this.mergeFiles.length;
        const total = this.mergeFiles.reduce((s,f) => s + f.size, 0);
        const el = document.getElementById('merge-file-count');
        if (el) el.textContent = `${n} archivo${n !== 1 ? 's' : ''}`;
        const sz = document.getElementById('merge-total-size');
        if (sz) sz.textContent = this._mergeFormatSize(total);
        const sum = document.getElementById('merge-action-summary');
        if (sum) sum.textContent = `${n} PDFs · ${this._mergeFormatSize(total)} total`;

        const showControls = n > 0;
        document.getElementById('merge-toolbar').classList.toggle('hidden', !showControls);
        document.getElementById('merge-drag-hint').classList.toggle('hidden', !showControls);
        document.getElementById('merge-action-bar').classList.toggle('hidden', !showControls);
    },

    _makeDraggable(el, idx, isCard) {
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
            const to = idx;
            if (from === to) return;
            const thumbFrom = this.mergeThumbs[from];
            const thumbTo   = this.mergeThumbs[to];
            this.mergeThumbs[to]   = thumbFrom;
            this.mergeThumbs[from] = thumbTo;
            const moved = this.mergeFiles.splice(from, 1)[0];
            this.mergeFiles.splice(to, 0, moved);
            this.renderMergeGrid();
        });
    },

    renderMergeGrid() {
        this._updateMergeStats();

        const grid = document.getElementById('merge-grid');
        grid.innerHTML = '';
        this.mergeFiles.forEach((f, idx) => {
            const thumb = this.mergeThumbs[idx];
            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.dataset.idx = idx;
            card.innerHTML = `
                <div class="pdf-thumb-wrap">
                    ${thumb
                        ? `<img class="pdf-thumb-canvas" src="${thumb}" alt="Página 1 de ${f.name}">`
                        : `<div class="pdf-thumb-placeholder">
                               <i class="fa-regular fa-file-pdf"></i>
                               <span style="font-size:10px;color:#9ca3af">Sin previa</span>
                           </div>`
                    }
                    <div class="pdf-card-order">${idx + 1}</div>
                    <button class="pdf-card-delete" data-del="${idx}" title="Eliminar">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="pdf-card-footer">
                    <div class="pdf-card-name" title="${f.name}">${f.name}</div>
                    <div class="pdf-card-size">${this._mergeFormatSize(f.size)}</div>
                </div>
                <i class="fa-solid fa-grip-dots pdf-card-drag-handle"></i>`;

            card.querySelector('[data-del]').addEventListener('click', ev => {
                ev.stopPropagation();
                this._deleteMergeFile(parseInt(ev.currentTarget.dataset.del));
            });
            this._makeDraggable(card, idx, true);
            grid.appendChild(card);
        });

        const list = document.getElementById('merge-list-view');
        list.innerHTML = '';
        this.mergeFiles.forEach((f, idx) => {
            const thumb = this.mergeThumbs[idx];
            const row = document.createElement('div');
            row.className = 'merge-list-row';
            row.dataset.idx = idx;
            row.innerHTML = `
                <i class="fa-solid fa-grip-vertical text-gray-300 dark:text-gray-500 text-base flex-shrink-0"></i>
                <div class="merge-list-thumb">
                    ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><i class="fa-regular fa-file-pdf" style="color:#a78bfa;font-size:16px"></i></div>'}
                </div>
                <div style="flex:1;min-width:0">
                    <div class="pdf-card-name" title="${f.name}">${f.name}</div>
                    <div class="pdf-card-size">${this._mergeFormatSize(f.size)}</div>
                </div>
                <span style="font-size:11px;font-weight:700;color:#9333ea;background:#f3e8ff;padding:2px 8px;border-radius:99px;flex-shrink:0">${idx+1}</span>
                <button class="text-gray-300 hover:text-red-400 transition flex-shrink-0 ml-1" data-del="${idx}" title="Eliminar" style="background:none;border:none;cursor:pointer;font-size:14px"><i class="fa-solid fa-xmark"></i></button>`;

            row.querySelector('[data-del]').addEventListener('click', ev => {
                ev.stopPropagation();
                this._deleteMergeFile(parseInt(ev.currentTarget.dataset.del));
            });
            this._makeDraggable(row, idx, false);
            list.appendChild(row);
        });
    },

    _deleteMergeFile(idx) {
        const newThumbs = {};
        this.mergeFiles.forEach((_, i) => {
            if (i < idx) newThumbs[i] = this.mergeThumbs[i];
            else if (i > idx) newThumbs[i-1] = this.mergeThumbs[i];
        });
        this.mergeThumbs = newThumbs;
        this.mergeFiles.splice(idx, 1);
        this.renderMergeGrid();
    },

    _addMergeFiles(files) {
        const startIdx = this.mergeFiles.length;
        const newFiles = Array.from(files).filter(f => f.type === 'application/pdf');
        if (!newFiles.length) { this.toast('Solo se aceptan archivos PDF', 'error'); return; }
        newFiles.forEach((f, i) => {
            this.mergeFiles.push(f);
            this.renderThumb(f, startIdx + i);
        });
        this.renderMergeGrid();
    },

    initMerge() {
        document.getElementById('merge-input').addEventListener('change', (e) => {
            const files = this.getFiles(e);
            if (!files || !files.length) return;
            this.mergeFiles = [];
            this.mergeThumbs = {};
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
                const PDFDoc = PDFLib.PDFDocument;
                const merged = await PDFDoc.create();
                for (let i = 0; i < this.mergeFiles.length; i++) {
                    const bytes = await this.mergeFiles[i].arrayBuffer();
                    const pdf = await PDFDoc.load(bytes);
                    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
                    pages.forEach(p => merged.addPage(p));
                }
                const out = await merged.save();
                this.download(new Blob([out], { type: 'application/pdf' }), 'Documentos_Unidos.pdf');
                this.toast(`¡${this.mergeFiles.length} PDFs unidos correctamente! ✓`);
            } catch(err) {
                console.error(err);
                this.toast('Error al unir — ¿algún PDF está encriptado?', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-layer-group mr-1"></i><span>Unir PDFs</span>';
            }
        });
    },

    renderMergeList() { this.renderMergeGrid(); },

    
    // 5. IMAGEN A PDF
    
    initImgToPdf() {
        document.getElementById('img-input').addEventListener('change', (e) => {
            const files = this.getFiles(e);
            if (!files || !files.length) return;
            this.imgFiles = Array.from(files);
            const list = document.getElementById('img-file-list');
            list.innerHTML = '';
            
            this.imgFiles.forEach(f => {
                list.innerHTML += `
                    <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600">
                        <span class="text-sm font-medium truncate"><i class="fa-solid fa-image text-yellow-500 mr-2"></i>${f.name}</span>
                        <span class="text-xs text-gray-400 ml-2 flex-shrink-0">${(f.size/1024).toFixed(0)} KB</span>
                    </div>`;
            });
            document.getElementById('btn-img').classList.remove('hidden');
            e.target.value = '';
        });

        document.getElementById('btn-img').addEventListener('click', async () => {
            if (!this.imgFiles.length) return;
            const btn = document.getElementById('btn-img');
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Convirtiendo...';
            
            try {
                const pdfDoc = await PDFLib.PDFDocument.create();
                for (let f of this.imgFiles) {
                    const bytes = await f.arrayBuffer();
                    const img = f.type === 'image/jpeg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
                    const pg = pdfDoc.addPage([img.width, img.height]);
                    pg.drawImage(img, {x:0,y:0,width:img.width,height:img.height});
                }
                const out = await pdfDoc.save();
                this.download(new Blob([out],{type:'application/pdf'}), 'Imagenes_Convertidas.pdf');
                this.toast(`${this.imgFiles.length} imagen(es) convertidas ✓`);
            } catch(err) {
                console.error(err); this.toast('Error al convertir', 'error');
            } finally {
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Convertir a PDF Ahora';
            }
        });
    },



    // 6. EDITAR / SEPARAR PDF

    // ─────────────────────────────────────────────────────────────────────────

    splitFile: null,
    splitTotalPages: 0,
    splitThumbs: [],        // array of dataURL per page (index = pageNum-1), null = pendiente
    splitSelected: new Set(),
    _splitPdfDoc: null,     // instancia pdf.js reutilizable para lazy rendering

    // Umbrales configurables
    SPLIT_BATCH_SIZE: 5,           // páginas renderizadas en paralelo por lote
    SPLIT_LARGE_PDF_THRESHOLD: 80, // activar lazy rendering por encima de este número
    SPLIT_INITIAL_RENDER: 30,      // páginas a pre-renderizar en modo lazy

    async initSplit() {
        const handleFile = async (file) => {
            if (!file || file.type !== 'application/pdf') {
                this.toast('Por favor selecciona un PDF válido', 'error'); return;
            }

            // Cancelar cualquier renderizado previo en curso
            this._splitCancelled = true;
            await new Promise(r => setTimeout(r, 50)); // dar tiempo al loop previo a salir
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
                // FIX BUG 2: Copiar el buffer antes de dárselo a pdf.js para
                // preservar integridad cuando pdf-lib lo use más tarde.
                const originalBytes = await file.arrayBuffer();
                const pdfJsBytes = originalBytes.slice(0); // copia independiente

                const pdf = await pdfjsLib.getDocument({
                    data: pdfJsBytes,
                    // Limitar uso de memoria del worker de pdf.js
                    disableRange: false,
                    disableStream: false,
                    disableAutoFetch: false,
                }).promise;

                this._splitPdfDoc = pdf;
                this.splitTotalPages = pdf.numPages;

                // Pre-seleccionar TODAS las páginas antes de empezar a renderizar.
                // FIX BUG 1: La selección es independiente del renderizado de thumbs.
                for (let i = 1; i <= this.splitTotalPages; i++) {
                    this.splitSelected.add(i);
                    // Inicializar con placeholder para que el grid pueda
                    // mostrarse inmediatamente antes de que los thumbs terminen.
                    this.splitThumbs.push(null);
                }

                const isLarge = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD;
                const totalToRender = isLarge ? this.SPLIT_INITIAL_RENDER : this.splitTotalPages;

                document.getElementById('split-loading-text').textContent =
                    isLarge
                        ? `PDF grande (${this.splitTotalPages} págs.) — cargando vista previa...`
                        : `Renderizando ${this.splitTotalPages} páginas...`;

                // Mostrar el grid con placeholders inmediatamente para que el usuario
                // vea progreso real en vez de pantalla en blanco.
                document.getElementById('split-loading').classList.add('hidden');
                document.getElementById('split-editor').classList.remove('hidden');

                // FIX BUGS 1 y 3: Renderizado por lotes con limpieza de memoria.
                await this._renderSplitThumbBatches(pdf, 1, totalToRender);

                if (isLarge && !this._splitCancelled) {
                    // Configurar lazy rendering para el resto de páginas
                    this._setupLazyThumbRendering(pdf, totalToRender + 1, this.splitTotalPages);
                    this.toast(
                        `PDF grande: ${this.splitTotalPages} páginas cargadas. Las miniaturas restantes se cargan al desplazarte.`,
                        'info'
                    );
                }

                document.getElementById('split-filename').textContent = file.name;
                document.getElementById('split-filemeta').textContent =
                    `${this.splitTotalPages} páginas · ${this._mergeFormatSize(file.size)}`;

                this.renderSplitGrid();

            } catch(err) {
                console.error('[initSplit] Error al cargar PDF:', err);
                document.getElementById('split-loading').classList.add('hidden');
                document.getElementById('split-label').classList.remove('hidden');
                this.toast('Error al leer el PDF — ¿está encriptado?', 'error');
            }
        };

        document.getElementById('split-input').addEventListener('change', e => {
            const f = this.getFiles(e)?.[0]; if (f) handleFile(f); e.target.value = '';
        });
        document.getElementById('split-input-replace').addEventListener('change', e => {
            const f = this.getFiles(e)?.[0]; if (f) handleFile(f); e.target.value = '';
        });

        const lbl = document.getElementById('split-label');
        lbl.addEventListener('dragover', e => { e.preventDefault(); lbl.classList.add('dragover'); });
        lbl.addEventListener('dragleave', () => lbl.classList.remove('dragover'));
        lbl.addEventListener('drop', e => {
            e.preventDefault(); lbl.classList.remove('dragover');
            const f = e.dataTransfer.files[0]; if (f) handleFile(f);
        });

        document.getElementById('btn-split-extract').addEventListener('click', () => this.splitExtract(false));
        document.getElementById('btn-split-delete').addEventListener('click',  () => this.splitExtract(true));
    },

    /**
     * Renderiza páginas en lotes para no saturar el pool de pdf.js ni la VRAM.
     * @param {PDFDocumentProxy} pdf  - instancia ya resuelta de pdf.js
     * @param {number} from           - página inicial (1-based, inclusivo)
     * @param {number} to             - página final (1-based, inclusivo)
     */
    async _renderSplitThumbBatches(pdf, from, to) {
        const batchSize = this.SPLIT_BATCH_SIZE;

        for (let start = from; start <= to; start += batchSize) {
            if (this._splitCancelled) break;

            const end = Math.min(start + batchSize - 1, to);
            const batchNums = [];
            for (let n = start; n <= end; n++) batchNums.push(n);

            // Renderizar el lote en paralelo (Promise.all controlado por batchSize)
            const results = await Promise.allSettled(
                batchNums.map(pageNum => this._renderOneSplitThumb(pdf, pageNum))
            );

            // Registrar éxitos y fallos sin abortar el lote entero
            results.forEach((r, idx) => {
                const pageNum = batchNums[idx];
                if (r.status === 'fulfilled') {
                    this.splitThumbs[pageNum - 1] = r.value;
                } else {
                    console.warn(`[split] Thumb fallido pág. ${pageNum}:`, r.reason);
                    this.splitThumbs[pageNum - 1] = null; // placeholder
                }
            });

            // Actualizar progreso y ceder el hilo al navegador
            const loadingText = document.getElementById('split-loading-text');
            if (loadingText) {
                loadingText.textContent = `Renderizando página ${end} de ${this.splitTotalPages}...`;
            }
            this.renderSplitGrid(); // actualizar grid con lo que ya hay

            // Yield para que el navegador pueda actualizar la UI y el GC actuar
            await new Promise(r => setTimeout(r, 0));
        }
    },

    /**
     * Renderiza el thumbnail de UNA página y devuelve el dataURL.
     * FIX BUG 3: canvas destruido inmediatamente para liberar VRAM.
     */
    async _renderOneSplitThumb(pdf, pageNum) {
        const page = await pdf.getPage(pageNum);
        // FIX BUG 3: Escala reducida de 0.5 → 0.3 para PDFs grandes.
        // 0.3 sigue siendo legible en el grid pero usa ~64% menos memoria.
        const scale = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD ? 0.3 : 0.4;
        const vp = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width  = vp.width;
        canvas.height = vp.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Intentar WebP primero (mejor compresión); fallback a JPEG
        const fmt  = canvas.toDataURL('image/webp', 0.6);
        const dataURL = fmt.startsWith('data:image/webp') ? fmt : canvas.toDataURL('image/jpeg', 0.65);

        // FIX BUG 3: Destruir el canvas INMEDIATAMENTE para liberar VRAM.
        // Sin esto, el GC no puede reclamar el backing store del canvas.
        canvas.width  = 0;
        canvas.height = 0;
        page.cleanup();

        return dataURL;
    },

    /**
     * Configura un IntersectionObserver para renderizar thumbnails on-demand
     * conforme el usuario hace scroll (modo lazy para PDFs grandes).
     */
    _setupLazyThumbRendering(pdf, fromPage, toPage) {
        // Limpiar observer previo si existe
        if (this._lazyObserver) {
            this._lazyObserver.disconnect();
            this._lazyObserver = null;
        }

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
                    // Actualizar solo la imagen del card afectado, sin re-renderizar todo el grid
                    const img = card.querySelector('img[data-lazy]');
                    if (img) {
                        img.src = dataURL;
                        img.removeAttribute('data-lazy');
                    }
                } catch(err) {
                    console.warn(`[lazy] Thumb fallido pág. ${pageNum}:`, err);
                }
            }
        }, { rootMargin: '200px' }); // pre-cargar 200px antes de que aparezca en viewport

        // Observar todos los cards que aún no tienen thumbnail
        const grid = document.getElementById('split-page-grid');
        grid.querySelectorAll('.page-card[data-page]').forEach(card => {
            const pageNum = parseInt(card.dataset.page);
            if (pageNum >= fromPage && pageNum <= toPage) {
                this._lazyObserver.observe(card);
            }
        });
    },

    renderSplitGrid() {
        const grid = document.getElementById('split-page-grid');
        grid.innerHTML = '';
        const totalSel = this.splitSelected.size;

        document.getElementById('split-sel-count').textContent =
            `${totalSel} página${totalSel !== 1 ? 's' : ''} seleccionada${totalSel !== 1 ? 's' : ''}`;
        document.getElementById('split-total-pages').textContent =
            `${this.splitTotalPages} página${this.splitTotalPages !== 1 ? 's' : ''}`;

        document.getElementById('split-action-bar').classList.toggle('hidden', totalSel === 0);
        const remaining = this.splitTotalPages - totalSel;
        document.getElementById('split-action-summary').textContent =
            totalSel > 0
                ? `${totalSel} seleccionadas para extraer · ${remaining} se omitirán`
                : 'Selecciona páginas para continuar';
        document.getElementById('btn-split-extract-label').textContent =
            `Extraer ${totalSel} página${totalSel !== 1 ? 's' : ''}`;

        const isLarge = this.splitTotalPages > this.SPLIT_LARGE_PDF_THRESHOLD;

        this.splitThumbs.forEach((thumb, i) => {
            const pageNum = i + 1;
            const isSel   = this.splitSelected.has(pageNum);
            const card    = document.createElement('div');
            card.className = `page-card${isSel ? ' selected' : ''}`;
            card.dataset.page = pageNum;

            const thumbHtml = thumb
                ? `<img src="${thumb}" alt="Página ${pageNum}" loading="lazy">`
                : isLarge && pageNum > this.SPLIT_INITIAL_RENDER
                    // Placeholder con img lazy que el IntersectionObserver rellena
                    ? `<img data-lazy="1" src="" alt="Página ${pageNum}"
                            style="background:#f3f4f6;min-height:80px;display:block;width:100%">`
                    // Spinner para páginas que aún se están procesando en el lote
                    : `<div style="min-height:80px;display:flex;align-items:center;justify-content:center">
                           <i class="fa-solid fa-spinner fa-spin" style="color:#a78bfa"></i>
                       </div>`;

            card.innerHTML = `
                <div class="page-thumb-wrap">${thumbHtml}</div>
                <div class="page-card-check"><i class="fa-solid fa-check"></i></div>
                <div class="page-card-num">${pageNum}</div>
                <div class="page-card-footer"><span>Pág. ${pageNum}</span></div>`;

            card.addEventListener('click', () => {
                if (this.splitSelected.has(pageNum)) {
                    this.splitSelected.delete(pageNum);
                } else {
                    this.splitSelected.add(pageNum);
                }
                this.renderSplitGrid();
            });
            grid.appendChild(card);
        });

        // Re-activar lazy observer sobre los nuevos elementos del DOM
        if (isLarge && this._lazyObserver && this._splitPdfDoc) {
            const fromPage = this.SPLIT_INITIAL_RENDER + 1;
            grid.querySelectorAll('.page-card[data-page]').forEach(card => {
                const pageNum = parseInt(card.dataset.page);
                if (pageNum >= fromPage && !this.splitThumbs[pageNum - 1]) {
                    this._lazyObserver.observe(card);
                }
            });
        }
    },

    splitSelectAll()    { for(let i=1; i<=this.splitTotalPages; i++) this.splitSelected.add(i);    this.renderSplitGrid(); },
    splitSelectNone()   { this.splitSelected.clear(); this.renderSplitGrid(); },
    splitInvertSelection() {
        for (let i = 1; i <= this.splitTotalPages; i++) {
            if (this.splitSelected.has(i)) this.splitSelected.delete(i);
            else this.splitSelected.add(i);
        }
        this.renderSplitGrid();
    },

    /** extractDeleted=true → exportar todo EXCEPTO seleccionadas (borrar seleccionadas) */
    async splitExtract(extractDeleted) {
        const pagesToKeep = extractDeleted
            ? Array.from({length: this.splitTotalPages}, (_,i) => i+1).filter(p => !this.splitSelected.has(p))
            : Array.from(this.splitSelected).sort((a,b) => a-b);

        if (!pagesToKeep.length) {
            this.toast('No quedarían páginas en el PDF resultante', 'error'); return;
        }

        const btnEl = extractDeleted
            ? document.getElementById('btn-split-delete')
            : document.getElementById('btn-split-extract');
        const origHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

        try {
            // FIX BUG 2: Leer el archivo FRESCO del objeto File para obtener un
            // ArrayBuffer nuevo e independiente. No reutilizar el buffer que ya
            // consumió pdf.js (puede estar detached o parcialmente GC-eado).
            const freshBytes = await this.splitFile.arrayBuffer();

            const srcPdf = await PDFLib.PDFDocument.load(freshBytes, {
                // Ignorar objetos XRef rotos en PDFs mal formados
                ignoreEncryption: false,
            });

            const newPdf    = await PDFLib.PDFDocument.create();
            const indices   = pagesToKeep.map(p => p - 1); // 0-based

            // FIX: Copiar páginas en lotes para no saturar memoria en PDFs grandes
            const COPY_BATCH = 50;
            for (let b = 0; b < indices.length; b += COPY_BATCH) {
                const batchIdx = indices.slice(b, b + COPY_BATCH);
                const copied   = await newPdf.copyPages(srcPdf, batchIdx);
                copied.forEach(p => newPdf.addPage(p));
            }

            const out = await newPdf.save();

            const baseName = this.splitFile.name.replace(/\.pdf$/i, '');
            const suffix   = extractDeleted
                ? '_editado'
                : `_paginas_${pagesToKeep[0]}-${pagesToKeep[pagesToKeep.length-1]}`;
            this.download(new Blob([out], { type: 'application/pdf' }), `${baseName}${suffix}.pdf`);

            const action = extractDeleted ? 'eliminadas' : 'extraídas';
            this.toast(`PDF listo Jejeje — ${pagesToKeep.length} página${pagesToKeep.length!==1?'s':''} ${action} ✓`);
        } catch(err) {
            console.error('[splitExtract] Error:', err);
            // Mensaje de error más específico para facilitar diagnóstico
            const msg = err?.message?.includes('encrypt')
                ? 'El PDF está encriptado y no puede procesarse'
                : 'Error al procesar el PDF — intenta con otro archivo';
            this.toast(msg, 'error');
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

        const lbl = document.getElementById('split-label');
        if (lbl) lbl.classList.remove('hidden');
        const loading = document.getElementById('split-loading');
        if (loading) loading.classList.add('hidden');
        const editor = document.getElementById('split-editor');
        if (editor) editor.classList.add('hidden');
        const bar = document.getElementById('split-action-bar');
        if (bar) bar.classList.add('hidden');
        const grid = document.getElementById('split-page-grid');
        if (grid) grid.innerHTML = '';
    },

    // ARRANQUE
    
    init() {
        this.setupDragDrop();
        this.checkCredits();
        this.initCompress();
        this.initWord();
        this.initExcel();
        this.initMerge();
        this.initImgToPdf();
        this.initSplit();
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
