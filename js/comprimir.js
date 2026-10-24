// comprimir = volver a dibujar cada pagina como jpg mas liviano
// ojo que el texto deja de ser seleccionable, queda como imagen
Object.assign(app, {
    NIVELES_COMPRESION: {
        low:    { scale: 0.8, q: 0.35 },
        medium: { scale: 1.2, q: 0.70 },
        high:   { scale: 1.8, q: 0.90 },
    },

    initCompress() {
        document.getElementById('compress-input').addEventListener('change', async (e) => {
            const file = this.getFiles(e)?.[0];
            if (!file) return;

            const loader = document.getElementById('compress-loader');
            const status = document.getElementById('compress-status');
            const level = document.querySelector('input[name="compressionLevel"]:checked').value;
            const cfg = this.NIVELES_COMPRESION[level];

            loader.style.display = 'block';
            status.innerText = 'Optimizando... no cierres la pestaña.';

            try {
                const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                const doc = new window.jspdf.jsPDF('p', 'pt', 'a4');
                const W = doc.internal.pageSize.getWidth();
                const H = doc.internal.pageSize.getHeight();

                for (let i = 1; i <= pdf.numPages; i++) {
                    this.progress('compress-pf', 'compress-pw', Math.round(i / pdf.numPages * 100));
                    status.innerText = `Procesando página ${i} de ${pdf.numPages}...`;
                    const page = await pdf.getPage(i);
                    const vp = page.getViewport({ scale: cfg.scale });
                    const canvas = document.createElement('canvas');
                    canvas.width = vp.width; canvas.height = vp.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                    const img = canvas.toDataURL('image/jpeg', cfg.q);

                    if (i > 1) doc.addPage();
                    doc.addImage(img, 'JPEG', 0, 0, W, H);

                    // si no se suelta el canvas con pdfs de muchas paginas se acaba la memoria
                    canvas.width = 0; canvas.height = 0;
                    page.cleanup();
                    await new Promise(r => requestAnimationFrame(r));
                }
                doc.save(`optimizado_${file.name}`);
                status.innerText = '¡Compresión exitosa!';
                this.toast('PDF comprimido ✓');
            } catch (err) {
                console.error(err);
                status.innerText = 'Error al procesar el documento.';
                this.toast('Error al comprimir', 'error');
            } finally {
                loader.style.display = 'none';
                e.target.value = '';
            }
        });
    },
});

app.inits.push(app.initCompress);
