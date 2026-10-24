// el css ya va generado en css/tailwind.css
// si agregas clases nuevas en el html o el js hay que volver a correr
//   npx tailwindcss -i css/tailwind.src.css -o css/tailwind.css --minify
module.exports = {
    content: ['./index.html', './js/**/*.js'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: { primary: '#E5322D' }
        }
    }
};
