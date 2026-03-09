pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const app = {
    // 
    // ESTADO COMPARTIDO
    // 
    mergeFiles: [],
    imgFiles: [],
    
    // Default fallback API Key (la que compartiste)
    DEFAULT_API_KEY: 'nP8QrbnS5EKvSBIpS2E1xjtLX8u2FxNv',

     
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

    // Muestra lo screditod que hacen falta, del mes osea te cuenta los dias, y lo creditos restantes.
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

    
    // UI GENERAL Y NAVEGACION (SPA FEEL) JAJA PA QUE CORRA NICE
    
    navigate(id) {
        document.querySelectorAll('.spa-section').forEach(s => s.style.display = 'none');
        const sec = document.getElementById(id);
        if (!sec) return;
        sec.style.display = 'block';
        
        const el = sec.querySelector('.animate__animated');
        if (el) { el.classList.remove('animate__fadeInUp'); void el.offsetWidth; el.classList.add('animate__fadeInUp'); }
        
        this.clearStates();
        this.resetUI(); 
        
        // Actualizar creditos al entrar a secciones que lo requieren
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
        
        const mergeList = document.getElementById('merge-file-list');
        if(mergeList) mergeList.innerHTML = '';
        const btnMerge = document.getElementById('btn-merge');
        if(btnMerge) btnMerge.classList.add('hidden');
        const mergeInfo = document.getElementById('merge-info');
        if(mergeInfo) mergeInfo.classList.add('hidden');
        const mergeTotal = document.getElementById('merge-total');
        if(mergeTotal) mergeTotal.classList.add('hidden');
        
        const imgList = document.getElementById('img-file-list');
        if(imgList) imgList.innerHTML = '';
        const btnImg = document.getElementById('btn-img');
        if(btnImg) btnImg.classList.add('hidden');

        this.mergeFiles = [];
        this.imgFiles = [];
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
                    
                    canvas.width = 0; canvas.height = 0;
                    page.cleanup();
                    await new Promise(r => requestAnimationFrame(r)); 
                }
                doc.save(`optimizado_${file.name}`);
                status.innerText = '¡CompresiOn exitosa!';
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

    // 
    // 2. PDF A WORD (Premium API)
    // 
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
                status.innerText = 'Error: Dile a Said que le meta mas CrEditos.';
                this.toast('Error en la conversiOn', 'error');
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
                status.innerText = 'Error: Dile a Said que le meta mas CrEditos.';
                this.toast('Error en la conversiOn', 'error');
            } finally {
                loader.style.display = 'none'; e.target.value = '';
            }
        });
    },

    
    // 4. UNIR PDF
    
    initMerge() {
        document.getElementById('merge-input').addEventListener('change', (e) => {
            const files = this.getFiles(e);
            if (!files || !files.length) return;
            this.mergeFiles = Array.from(files);
            this.renderMergeList();
            document.getElementById('btn-merge').classList.remove('hidden');
            document.getElementById('merge-info').classList.remove('hidden');
            e.target.value = '';
        });

        document.getElementById('btn-merge').addEventListener('click', async () => {
            if (this.mergeFiles.length < 2) { this.toast('Selecciona al menos 2 PDFs', 'error'); return; }
            const btn = document.getElementById('btn-merge');
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uniendo...';
            
            try {
                const PDFDoc = PDFLib.PDFDocument;
                const merged = await PDFDoc.create();
                for (let f of this.mergeFiles) {
                    const bytes = await f.arrayBuffer();
                    const pdf = await PDFDoc.load(bytes);
                    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
                    pages.forEach(p => merged.addPage(p));
                }
                const out = await merged.save();
                this.download(new Blob([out],{type:'application/pdf'}), 'Documentos_Unidos.pdf');
                this.toast(`${this.mergeFiles.length} PDFs unidos ✓`);
            } catch(err) {
                console.error(err); this.toast('Error al unir (revisa si alguno está encriptado)', 'error');
            } finally {
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-object-group"></i> Unir Archivos Ahora';
            }
        });
    },

    renderMergeList() {
        const list = document.getElementById('merge-file-list');
        list.innerHTML = '';
        let totalKB = 0;
        
        this.mergeFiles.forEach((f, idx) => {
            totalKB += f.size / 1024;
            const div = document.createElement('div');
            div.className = 'drag-item flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600';
            div.draggable = true;
            div.dataset.idx = idx;
            div.innerHTML = `
                <i class="fa-solid fa-grip-vertical text-gray-300 dark:text-gray-500 text-lg flex-shrink-0"></i>
                <span class="flex-1 text-sm font-medium truncate"><i class="fa-solid fa-file-pdf text-purple-500 mr-2"></i>${f.name}</span>
                <span class="text-xs text-gray-400 flex-shrink-0">${(f.size/1024).toFixed(0)} KB</span>
                <span class="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-2 py-0.5 rounded-full font-bold flex-shrink-0">${idx+1}</span>
                <button class="text-gray-300 hover:text-red-400 transition flex-shrink-0" data-del="${idx}" title="Quitar"><i class="fa-solid fa-xmark"></i></button>`;

            div.addEventListener('dragstart', ev => {
                ev.dataTransfer.setData('text/plain', String(idx));
                setTimeout(() => div.classList.add('dragging'), 0);
            });
            div.addEventListener('dragend', () => div.classList.remove('dragging'));
            div.addEventListener('dragover', ev => ev.preventDefault());
            div.addEventListener('drop', ev => {
                ev.preventDefault();
                const from = parseInt(ev.dataTransfer.getData('text/plain'));
                const to = parseInt(div.dataset.idx);
                if (from === to) return;
                const moved = this.mergeFiles.splice(from, 1)[0];
                this.mergeFiles.splice(to, 0, moved);
                this.renderMergeList();
            });

            div.querySelector('[data-del]').addEventListener('click', ev => {
                const i = parseInt(ev.currentTarget.dataset.del);
                this.mergeFiles.splice(i, 1);
                if (!this.mergeFiles.length) {
                    document.getElementById('btn-merge').classList.add('hidden');
                    document.getElementById('merge-info').classList.add('hidden');
                    document.getElementById('merge-total').classList.add('hidden');
                }
                this.renderMergeList();
            });
            list.appendChild(div);
        });

        const tot = document.getElementById('merge-total');
        if (this.mergeFiles.length) {
            tot.classList.remove('hidden');
            tot.innerText = `${this.mergeFiles.length} archivos · ${(totalKB/1024 > 1 ? (totalKB/1024).toFixed(1)+' MB' : totalKB.toFixed(0)+' KB')} total estimado`;
        } else { tot.classList.add('hidden'); }
    },

    
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


    // ARRANQUE
    
    init() {
        this.setupDragDrop();
        this.checkCredits();
        this.initCompress();
        this.initWord();
        this.initExcel();
        this.initMerge();
        this.initImgToPdf();
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());