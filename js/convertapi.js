// word y excel eran el mismo codigo copiado dos veces, solo cambia el formato
Object.assign(app, {
    FORMATOS_API: {
        word:  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', listo: '¡Descargado correctamente!', toast: 'PDF convertido a Word ✓', esperando: 'Convirtiendo en el servidor...' },
        excel: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', listo: '¡Excel descargado correctamente!', toast: 'PDF convertido a Excel ✓', esperando: 'Convirtiendo en el servidor para mantener el formato exacto...' },
    },

    async convertirConApi(file, tipo) {
        const fmt = this.FORMATOS_API[tipo];
        const loader = document.getElementById(`${tipo}-loader`);
        const status = document.getElementById(`${tipo}-status`);

        if (!this.needApiKey()) return;
        loader.style.display = 'block';
        status.style.color = '';
        status.innerText = fmt.esperando;

        try {
            const fd = new FormData();
            fd.append('File', file);
            const res = await fetch(`https://v2.convertapi.com/convert/pdf/to/${fmt.ext}?Secret=${this.getApiKey()}`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok || !data.Files) throw new Error(data.Message || 'API fail');

            // el archivo viene en base64 dentro del json
            const bytes = Uint8Array.from(atob(data.Files[0].FileData), c => c.charCodeAt(0));
            this.download(new Blob([bytes], { type: fmt.mime }), data.Files[0].FileName);

            status.innerText = fmt.listo;
            this.toast(fmt.toast);
            this.trackLocalConversion();
            this.checkCredits();
        } catch (err) {
            console.error(err);
            status.style.color = '#E5322D';
            status.innerText = navigator.onLine ? 'Error en la conversión.' : 'Sin internet, esto necesita conexión.';
            this.toast('Error en la conversión', 'error');
        } finally {
            loader.style.display = 'none';
        }
    },

    initConvertApi() {
        ['word', 'excel'].forEach(tipo => {
            document.getElementById(`${tipo}-input`).addEventListener('change', async (e) => {
                const file = this.getFiles(e)?.[0];
                if (file && tipo === 'word' && this.wordMode === 'local') await this.wordLocal(file);
                else if (file) await this.convertirConApi(file, tipo);
                e.target.value = '';
            });
        });
    },
});

app.inits.push(app.initConvertApi);
