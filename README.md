# Mi Dinero

App sencilla para llevar el control de **ingresos y gastos** desde el teléfono.

- Registra cada movimiento con monto, categoría, nota y fecha.
- Muestra ingresos, gastos y balance de cada mes, y cuánto dinero tienes en total.
- Muestra en qué categorías se va el dinero.
- **Metas de ahorro**: apartas dinero para algo y ves cuánto te falta.
- **Racha**: cuenta los días seguidos que registras algo, para crear el hábito.
- **Pagos pendientes**: lo que debes y lo que te deben, con fecha; al pagarlo se anota solo como gasto o ingreso.
- **Telegram**: recordatorio cada noche que no registres nada o tengas pagos por vencer, y resumen de tu semana cada domingo.

La app tiene 4 secciones en la barra de abajo: **Dinero**, **Metas**, **Racha** y **Pagos**.
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
3. ✅ Metas, racha y resumen semanal por Telegram (con Apps Script)
4. ⬜ Automatizaciones más grandes con n8n
5. ⬜ Skill propia para analizar mis finanzas con Claude
