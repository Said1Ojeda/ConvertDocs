// arma un .docx sencillo sin librerias, solo parrafos y saltos de pagina
// un docx es un zip con unos xml adentro, el zip va sin comprimir porque word lo abre igual
const Docx = {
    escapar(t) {
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            // caracteres de control que a veces trae el pdf y hacen que word diga que el archivo esta malo
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    },

    // paginas es un array de arrays de parrafos
    documentXml(paginas) {
        const cuerpo = paginas.map((parrafos, i) => {
            const ps = parrafos.map(p =>
                `<w:p><w:r><w:t xml:space="preserve">${this.escapar(p)}</w:t></w:r></w:p>`).join('');
            const salto = i < paginas.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
            return ps + salto;
        }).join('');

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
            cuerpo +
            '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
            '</w:body></w:document>';
    },

    archivos(paginas) {
        return {
            '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
            '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
            'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
            // calibri 11 y un poco de espacio entre parrafos, como un word normal
            'word/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-GT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>',
            'word/document.xml': this.documentXml(paginas),
        };
    },

    crcTabla: null,
    crc32(bytes) {
        if (!this.crcTabla) {
            this.crcTabla = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                this.crcTabla[n] = c >>> 0;
            }
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = this.crcTabla[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    // zip sin compresion (metodo 0), lo justo para que word lo abra
    zip(archivos) {
        const enc = new TextEncoder();
        const partes = [];
        const central = [];
        let offset = 0;

        for (const [nombre, contenido] of Object.entries(archivos)) {
            const nom = enc.encode(nombre);
            const datos = enc.encode(contenido);
            const crc = this.crc32(datos);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true); // nombres en utf8
            local.setUint32(14, crc, true);
            local.setUint32(18, datos.length, true);
            local.setUint32(22, datos.length, true);
            local.setUint16(26, nom.length, true);
            partes.push(local.buffer, nom, datos);

            const cd = new DataView(new ArrayBuffer(46));
            cd.setUint32(0, 0x02014b50, true);
            cd.setUint16(4, 20, true);
            cd.setUint16(6, 20, true);
            cd.setUint16(8, 0x0800, true);
            cd.setUint32(16, crc, true);
            cd.setUint32(20, datos.length, true);
            cd.setUint32(24, datos.length, true);
            cd.setUint16(28, nom.length, true);
            cd.setUint32(42, offset, true);
            central.push(cd.buffer, nom);

            offset += 30 + nom.length + datos.length;
        }

        const tamCentral = central.reduce((s, b) => s + b.byteLength, 0);
        const fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true);
        fin.setUint16(8, Object.keys(archivos).length, true);
        fin.setUint16(10, Object.keys(archivos).length, true);
        fin.setUint32(12, tamCentral, true);
        fin.setUint32(16, offset, true);

        return new Blob([...partes, ...central, fin.buffer], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
    },

    crear(paginas) {
        return this.zip(this.archivos(paginas));
    },
};
