# Mi Dinero

App sencilla para llevar el control de **ingresos y gastos** desde el teléfono.

- Registra cada movimiento con monto, categoría, nota y fecha.
- Muestra ingresos, gastos y balance de cada mes.
- Muestra en qué categorías se va el dinero.
- Se instala en el teléfono como una app y funciona sin internet.

## Dónde se guardan los datos

- **En el teléfono** (localStorage), para que la app abra rápido y funcione sin internet.
- **En la nube**, en una hoja de Google Sheets tuya, si la conectas con el botón ⚙. Los cambios hechos sin internet se suben solos cuando vuelve la conexión.
- **Respaldo manual**: un archivo que puedes descargar cuando quieras.

Para conectar la nube y la IA, sigue [`nube/INSTRUCCIONES.md`](nube/INSTRUCCIONES.md).

## Escribir con IA

En la caja de arriba puedes escribir como hablas: *"me pagaron 3000 de la quincena"*, *"ayer gasté 80 en el camión"*. Claude lo convierte en un movimiento y te lo muestra para que lo revises antes de guardar.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | La estructura de la pantalla |
| `styles.css` | Los colores y el diseño |
| `app.js` | La lógica: guardar, sumar, dibujar la lista |
| `manifest.json` | Nombre e icono para instalarla en el teléfono |
| `sw.js` | Permite abrirla sin internet |
| `nube/Code.gs` | El servidor en Google: guarda en la hoja y habla con la API de Claude |

## Plan del proyecto

1. ✅ App web básica para el teléfono
2. ✅ Guardar en la nube (Google Sheets) y registrar movimientos escribiendo en lenguaje normal con la API de Claude
3. ⬜ Automatización con n8n (resumen semanal, bot de Telegram)
4. ⬜ Skill propia para analizar mis finanzas con Claude
