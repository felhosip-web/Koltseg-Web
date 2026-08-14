const fs = require('fs');
let js = fs.readFileSync('js/ui-controller.js', 'utf8');

js = js.replace(/this\.exportController\.exportExcel\(\);\s*\}/, "this.exportController.exportWorkExcel();\n        }");
js = js.replace(/this\.exportController\.exportPdf\(\);\s*\}/, "this.exportController.exportWorkPdf();\n        }");
js = js.replace(/this\.exportController\.exportJson\(\);\s*\}/, "this.exportController.exportWorkJson();\n        }");
js = js.replace(/this\.exportController\.importJson\(\);\s*\}/, "this.exportController.importWorkJson();\n        }");

// Let's do it safer with regex that looks for the exact IDs
js = js.replace(
    /document\.getElementById\('btnExportExcelWork'\)\?\.addEventListener\('click', \(\) => \{\s*this\.togglePanel\('exportMenuWork'\);\s*this\.exportController\.exportExcel\(\);\s*\}\);/,
    `document.getElementById('btnExportExcelWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.exportWorkExcel();
        });`
);
js = js.replace(
    /document\.getElementById\('btnExportPdfWork'\)\?\.addEventListener\('click', \(\) => \{\s*this\.togglePanel\('exportMenuWork'\);\s*this\.exportController\.exportPdf\(\);\s*\}\);/,
    `document.getElementById('btnExportPdfWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.exportWorkPdf();
        });`
);
js = js.replace(
    /document\.getElementById\('btnExportJsonWork'\)\?\.addEventListener\('click', \(\) => \{\s*this\.togglePanel\('exportMenuWork'\);\s*this\.exportController\.exportJson\(\);\s*\}\);/,
    `document.getElementById('btnExportJsonWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.exportWorkJson();
        });`
);
js = js.replace(
    /document\.getElementById\('btnImportJsonWork'\)\?\.addEventListener\('click', \(\) => \{\s*this\.togglePanel\('exportMenuWork'\);\s*this\.exportController\.importJson\(\);\s*\}\);/,
    `document.getElementById('btnImportJsonWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.importWorkJson();
        });`
);

fs.writeFileSync('js/ui-controller.js', js);
console.log('Patched js/ui-controller.js for work exports');
