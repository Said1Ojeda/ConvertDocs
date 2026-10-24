// cada imagen queda como una pagina de su mismo tamano, sin margenes
Object.assign(app, {
    imgFiles: [],

    resetImgs() {
        this.imgFiles = [];
        document.getElementById('img-file-list').innerHTML = '';
        document.getElementById('btn-img').classList.add('hidden');
    },

    initImgToPdf() {
        document.getElementById('img-input').addEventListener('change', (e) => {
            const files = this.getFiles(e);
            if (!files || !files.length) return;
            this.imgFiles = Array.from(files).filter(f => f.type === 'image/jpeg' || f.type === 'image/png');
            if (!this.imgFiles.length) { this.toast('Solo JPG o PNG', 'error'); return; }

            document.getElementById('img-file-list').innerHTML = this.imgFiles.map(f => `
                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600">
                    <span class="text-sm font-medium truncate"><i class="fa-solid fa-image text-yellow-500 mr-2"></i>${f.name}</span>
                    <span class="text-xs text-gray-400 ml-2 flex-shrink-0">${this.formatSize(f.size)}</span>
                </div>`).join('');
            document.getElementById('btn-img').classList.remove('hidden');
            e.target.value = '';
        });

        document.getElementById('btn-img').addEventListener('click', async () => {
            if (!this.imgFiles.length) return;
            const btn = document.getElementById('btn-img');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Convirtiendo...';

            try {
                const pdfDoc = await PDFLib.PDFDocument.create();
                for (const f of this.imgFiles) {
                    const bytes = await f.arrayBuffer();
                    const img = f.type === 'image/jpeg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
                    const pg = pdfDoc.addPage([img.width, img.height]);
                    pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                }
                const out = await pdfDoc.save();
                this.download(new Blob([out], { type: 'application/pdf' }), 'Imagenes_Convertidas.pdf');
                this.toast(`${this.imgFiles.length} imagen(es) convertidas ✓`);
            } catch (err) {
                console.error(err);
                this.toast('Error al convertir', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Convertir a PDF Ahora';
            }
        });
    },
});

app.inits.push(app.initImgToPdf);
app.resetters.push(app.resetImgs);
