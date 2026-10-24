// el worker va local, en el server no hay internet para jalarlo del cdn
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.js';

// cada herramienta vive en su propio archivo en js/ y se le pega a este objeto
const app = {
    // la clave ya no va en el codigo, sale del navegador o de config.local.js si existe
    getApiKey() {
        return localStorage.getItem('convertapiKey') || window.CONVERTDOCS_API_KEY || '';
    },

    saveApiKey() {
        const input = document.getElementById('api-key-input');
        const newKey = input.value.trim();
        if (!newKey) {
            this.toast('Ingresa una clave válida', 'error');
            return;
        }
        localStorage.setItem('convertapiKey', newKey);
        this.toast('Clave API guardada correctamente ✓');
        input.value = '';
        this.checkCredits();
        setTimeout(() => this.navigate('home'), 1000);
    },

    clearApiKey() {
        localStorage.removeItem('convertapiKey');
        this.toast('Clave borrada de este navegador', 'info');
        this.checkCredits();
    },

    needApiKey() {
        if (this.getApiKey()) return true;
        this.toast('Primero pon tu clave de ConvertAPI', 'error');
        setTimeout(() => this.navigate('config-api'), 800);
        return false;
    },

    // ConvertAPI no dice cuantas conversiones van, este contador es solo de este navegador
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
        const stats = JSON.parse(localStorage.getItem('convertApiStats') || '{"month": -1, "count": 0}');
        return stats.month === currentMonth ? stats.count : 0;
    },

    checkCredits() {
        const key = this.getApiKey();
        const localCount = this.getLocalConversions();
        const pintar = (texto, mal) => {
            document.querySelectorAll('.api-credits-count').forEach(el => {
                el.innerText = texto;
                el.classList.toggle('text-red-500', mal);
            });
        };

        if (!key) {
            pintar('Sin clave, ponla en el engrane', true);
            return;
        }

        fetch(`https://v2.convertapi.com/user?Secret=${key}`)
            .then(res => res.json())
            .then(data => {
                if (data.SecondsLeft === undefined) throw new Error('Clave inválida');
                pintar(`${data.SecondsLeft}s restantes | ${localCount} conv. este mes`, false);
            })
            .catch(() => pintar(navigator.onLine ? 'Clave inválida o caducada' : 'Sin internet', true));
    },

    navigate(id) {
        document.querySelectorAll('.spa-section').forEach(s => s.style.display = 'none');
        const sec = document.getElementById(id);
        if (!sec) return;
        sec.style.display = 'block';

        // truco para que la animacion de entrada vuelva a correr
        const el = sec.querySelector('.animate__animated');
        if (el) { el.classList.remove('animate__fadeInUp'); void el.offsetWidth; el.classList.add('animate__fadeInUp'); }

        this.clearStates();
        this.resetUI();

        if (id === 'pdf-to-word' || id === 'pdf-to-excel') this.checkCredits();

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

    // cada herramienta registra aca su propia limpieza
    resetters: [],

    resetUI() {
        document.querySelectorAll('input[type="file"]').forEach(inp => inp.value = '');
        this.resetters.forEach(fn => fn.call(this));
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
        w.style.display = 'block';
        b.style.width = pct + '%';
    },

    download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        requestAnimationFrame(() => URL.revokeObjectURL(url));
    },

    formatSize(bytes) {
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
        return Math.round(bytes / 1024) + ' KB';
    },

    // al soltar un archivo se dispara el mismo change del input, asi cada herramienta
    // solo escucha un evento
    setupDragDrop() {
        document.querySelectorAll('.drop-label').forEach(lbl => {
            if (lbl.id === 'split-label') return; // separar maneja su propio drop
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

    inits: [],

    init() {
        this.setupDragDrop();
        this.checkCredits();
        this.inits.forEach(fn => fn.call(this));
    }
};
