# Conectar Mi Dinero a la nube (Google Sheets) y a la IA

La app guarda tus movimientos en una **hoja de cálculo de Google** tuya. Ahí no se borran aunque cambies de teléfono, y puedes verlos y abrirlos en Excel cuando quieras.

Toma unos 10 minutos. Solo se hace una vez.

## Parte 1: la hoja y el servidor

1. Entra a [sheets.new](https://sheets.new) con tu cuenta de Google. Se crea una hoja nueva; ponle de nombre **Mi Dinero**.
2. En el menú: **Extensiones → Apps Script**. Se abre un editor de código.
3. Borra todo lo que aparece ahí y pega el contenido completo de [`Code.gs`](Code.gs). Guarda (ícono de disquete o `Ctrl + S`).
4. A la izquierda, da clic en **⚙ Configuración del proyecto**. Baja hasta **Propiedades del script** → **Agregar propiedad del script**:
   - Propiedad: `CLAVE_APP` · Valor: una contraseña que inventes (larga, por ejemplo tres palabras y números). **No uses una contraseña que ya uses en otro lado.**
   - Guarda.
5. Arriba a la derecha: **Implementar → Nueva implementación**.
   - En el engrane de "Seleccionar tipo", elige **Aplicación web**.
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier usuario. (Nadie puede leer tus datos sin tu `CLAVE_APP`.)
   - Da clic en **Implementar**. Google te pedirá **autorizar el acceso**: elige tu cuenta → "Configuración avanzada" → "Ir a Mi Dinero" → **Permitir**. Es tu propio script pidiendo permiso para usar tu hoja.
6. Copia la **URL de la aplicación web** (termina en `/exec`).
7. En la app Mi Dinero toca **⚙**, pega la URL y escribe tu `CLAVE_APP`. Guarda.

Arriba debe aparecer **☁ Guardado en la nube**, y en tu hoja una pestaña **Movimientos** con tus datos.

## Parte 2: la IA (opcional)

Para escribir cosas como *"gasté 150 en tacos ayer"* y que se llenen solas, el servidor necesita una llave de la API de Claude.

- La cuenta de la API se crea en [console.anthropic.com](https://console.anthropic.com). **Es para mayores de 18 años y se paga aparte con tarjeta**, así que la tiene que crear un adulto (por ejemplo tu mamá o papá).
- Cuesta centavos: cada movimiento que la IA interpreta cuesta aproximadamente **$0.01 dólar**. Se puede poner un límite de gasto mensual en la consola.

Cuando tengan la llave (empieza con `sk-ant-`):

1. En Apps Script → **⚙ Configuración del proyecto → Propiedades del script**, agrega:
   - Propiedad: `ANTHROPIC_API_KEY` · Valor: la llave.
2. Listo. No hay que volver a implementar: las propiedades se leen en cada petición.
3. Cierra y vuelve a abrir la app: aparecerá la caja **✨ Escribe: gasté 150 en tacos**. Mientras el servidor no tenga la llave, esa caja está oculta.

**La llave nunca va en la app ni en GitHub**: vive solo en tu servidor de Google, así nadie puede verla ni gastar tu saldo.

## Si cambias el código de `Code.gs`

Cada vez que pegues una versión nueva: **Implementar → Administrar implementaciones → ✏ Editar → Versión: Nueva versión → Implementar**. La URL sigue siendo la misma.
