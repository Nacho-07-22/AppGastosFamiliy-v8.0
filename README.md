# Control de Gastos Familiar — Icon Update

Para actualizar los iconos de la app con tu imagen proporcionada (`source-icon.png`):

Requisitos:

- Node.js instalado

Pasos:

1. Coloca tu imagen de alta resolución en `source-icon.png` (ya está incluida).
2. Instala dependencias y genera los iconos:

```markdown
# Control de Gastos Familiar — icono vectorial

Este proyecto ahora usa un icono SVG (`icon.svg`) para garantizar que el icono se vea correctamente en la web y al agregar la PWA a la pantalla de inicio.

Cambios clave:

- Se eliminó el uso de imágenes raster (PNG).
- `manifest.json` y `index.html` apuntan a `icon.svg`.

Cómo probar localmente:

1. Abre `index.html` en Chrome/Edge en tu teléfono o en escritorio.
2. En Chrome móvil: abre el menú y selecciona "Añadir a pantalla de inicio".
3. En la vista de manifest (DevTools > Application > Manifest) deberías ver `icon.svg` listado.

Notas:

- SVG es preferible para iconos simples y contraste. Si quieres un icono optimizado para Android (raster), puedo generarlo a partir del SVG.
- No se tocaron archivos de configuración sensibles.
```
