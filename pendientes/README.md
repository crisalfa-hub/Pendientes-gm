# Pendientes

Planificador minimalista de metas y tareas. PWA instalable, sin cuenta, sin dependencias y con los datos guardados solo en el dispositivo.

## Funciones
- Metas con subtareas anidadas y progreso automático (`hechas/total` y barra fina).
- Marcar una meta marca todas sus subtareas; las tareas repetitivas no cuentan en el progreso.
- Fecha, hora y repetición (cada día, semana o mes). Al completar una repetitiva pasa a su siguiente fecha.
- Pestaña **Hoy** con atrasadas y de hoy.
- Recordatorios a la hora de la tarea (ver límite abajo).
- Copia de seguridad: exportar e importar JSON desde el menú (⋯).
- Funciona sin conexión; modo claro y oscuro automático.

## Cómo probarlo
Los service workers y las notificaciones requieren `http://localhost` o HTTPS (no funcionan abriendo el archivo con doble clic).

```bash
cd pendientes
python3 -m http.server 8000
# abre http://localhost:8000
```

## Cómo instalarlo en el celular
Publica la carpeta en cualquier hosting estático con HTTPS (GitHub Pages, Netlify, Cloudflare Pages) y abre la URL en el celular:
- Android (Chrome): menú ⋮ → «Instalar app».
- iPhone (Safari): Compartir → «Añadir a pantalla de inicio». Las notificaciones en iPhone requieren iOS 16.4 o superior y que la app esté instalada así.

## Límite de los recordatorios
Los avisos los dispara la propia app, así que llegan mientras esté abierta o en segundo plano, pero un navegador puede suspenderla y retrasarlos. Los avisos con la app totalmente cerrada requieren notificaciones push desde un servidor, que esta versión no incluye a propósito (para no necesitar cuenta ni backend).
Las tareas vencidas hace más de 6 horas no se notifican al abrir la app; solo aparecen como atrasadas.

## Archivos
- `core.js`: lógica pura (fechas, progreso, repetición, recordatorios, importación segura).
- `app.js`: interfaz.
- `style.css`, `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`.

Si cambias archivos y ya instalaste la app, sube la versión de `CACHE` en `sw.js` para forzar la actualización.
