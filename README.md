# Mi Dinero

App sencilla para llevar el control de **ingresos y gastos** desde el teléfono.

- Registra cada movimiento con monto, categoría, nota y fecha.
- Muestra ingresos, gastos y balance de cada mes.
- Muestra en qué categorías se va el dinero.
- Se instala en el teléfono como una app y funciona sin internet.

## Dónde se guardan los datos

Los movimientos se guardan **solo en el navegador del teléfono** (localStorage). No se suben a ningún lado.
Usa **Descargar respaldo** de vez en cuando: si borras los datos del navegador o cambias de teléfono, con **Restaurar respaldo** los recuperas.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | La estructura de la pantalla |
| `styles.css` | Los colores y el diseño |
| `app.js` | La lógica: guardar, sumar, dibujar la lista |
| `manifest.json` | Nombre e icono para instalarla en el teléfono |
| `sw.js` | Permite abrirla sin internet |

## Plan del proyecto

1. ✅ App web básica para el teléfono
2. ⬜ Registrar movimientos escribiendo en lenguaje normal con la API de Claude ("gasté 150 en gasolina")
3. ⬜ Automatización con n8n (resumen semanal, bot de Telegram)
4. ⬜ Skill propia para analizar mis finanzas con Claude
