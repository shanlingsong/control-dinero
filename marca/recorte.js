// Funciones para quitar el fondo blanco a la mascota y armar el ícono.

// Quita el fondo blanco "inundando" desde los bordes todo lo que es casi blanco.
function sinFondo(imagen) {
  const W = imagen.naturalWidth, H = imagen.naturalHeight;
  const lienzo = document.createElement('canvas'); lienzo.width = W; lienzo.height = H;
  const g = lienzo.getContext('2d'); g.drawImage(imagen, 0, 0);
  const datos = g.getImageData(0, 0, W, H), d = datos.data;
  const blanco = (k) => d[k * 4] > 230 && d[k * 4 + 1] > 230 && d[k * 4 + 2] > 230;
  const fuera = new Uint8Array(W * H), pila = [];
  for (let x = 0; x < W; x++) pila.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) pila.push(y * W, y * W + W - 1);
  while (pila.length) {
    const k = pila.pop();
    if (fuera[k] || !blanco(k)) continue;
    fuera[k] = 1;
    const x = k % W;
    if (x > 0) pila.push(k - 1);
    if (x < W - 1) pila.push(k + 1);
    if (k >= W) pila.push(k - W);
    if (k < W * (H - 1)) pila.push(k + W);
  }
  // Huecos blancos encerrados (entre brazos y cuerpo): si un charco blanco es grande, también es fondo.
  const visto = new Uint8Array(W * H);
  for (let inicio = 0; inicio < W * H; inicio++) {
    if (fuera[inicio] || visto[inicio] || !blanco(inicio)) continue;
    const charco = [], cola = [inicio];
    visto[inicio] = 1;
    while (cola.length) {
      const k = cola.pop();
      charco.push(k);
      const x = k % W;
      for (const v of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
        if (v >= 0 && v < W * H && !visto[v] && !fuera[v] && blanco(v)) { visto[v] = 1; cola.push(v); }
      }
    }
    if (charco.length > 400) for (const k of charco) fuera[k] = 1;
  }
  // Distancia (en pixeles) de cada punto al fondo, hasta 4: la orilla es donde se mezcló con el blanco.
  const MAX = 4;
  const distancia = new Uint8Array(W * H).fill(255);
  let frente = [];
  for (let k = 0; k < W * H; k++) if (fuera[k]) { distancia[k] = 0; frente.push(k); }
  for (let paso = 1; paso <= MAX; paso++) {
    const siguiente = [];
    for (const k of frente) {
      const x = k % W;
      for (const v of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
        if (v >= 0 && v < W * H && distancia[v] === 255) { distancia[v] = paso; siguiente.push(v); }
      }
    }
    frente = siguiente;
  }

  const luz = (k) => 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
  const original = new Uint8ClampedArray(d);
  for (let k = 0; k < W * H; k++) {
    if (fuera[k]) { d[k * 4 + 3] = 0; continue; }
    if (distancia[k] > MAX) continue;
    // El color "verdadero" de la orilla es el más oscuro de alrededor (el contorno del dibujo).
    const x = k % W, y = (k / W) | 0;
    let oscuro = -1, luzOscuro = 999;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const v = yy * W + xx;
      if (fuera[v]) continue;
      const l = 0.299 * original[v * 4] + 0.587 * original[v * 4 + 1] + 0.114 * original[v * 4 + 2];
      if (l < luzOscuro) { luzOscuro = l; oscuro = v; }
    }
    if (oscuro < 0) continue;
    // Cuánto de este pixel era dibujo y cuánto era blanco: lo blanco se vuelve transparente.
    const l = 0.299 * original[k * 4] + 0.587 * original[k * 4 + 1] + 0.114 * original[k * 4 + 2];
    const opaco = Math.max(0, Math.min(1, (255 - l) / Math.max(1, 255 - luzOscuro)));
    if (opaco >= 0.98) continue;
    d[k * 4] = original[oscuro * 4];
    d[k * 4 + 1] = original[oscuro * 4 + 1];
    d[k * 4 + 2] = original[oscuro * 4 + 2];
    d[k * 4 + 3] = Math.round(255 * opaco);
  }
  g.putImageData(datos, 0, 0);
  return lienzo;
}

// Ícono: fondo oscuro, círculo rojo chile y la cara del chango.
function icono(recorte, lado) {
  const c = document.createElement('canvas'); c.width = c.height = lado;
  const g = c.getContext('2d');
  g.fillStyle = '#0B0F17'; g.fillRect(0, 0, lado, lado);
  g.fillStyle = '#FF5A4E'; g.beginPath(); g.arc(lado / 2, lado * 0.58, lado * 0.4, 0, Math.PI * 2); g.fill();
  const cuadro = 380, cx = 492, cy = 190; // la cabeza en la imagen original
  // El cuerpo se queda dentro del círculo; la cabeza puede salirse por arriba.
  g.save();
  g.beginPath();
  g.arc(lado / 2, lado * 0.58, lado * 0.4, 0, Math.PI * 2);
  g.rect(0, 0, lado, lado * 0.58);
  g.clip();
  g.drawImage(recorte, cx - cuadro / 2, cy - cuadro / 2, cuadro, cuadro, lado * 0.06, lado * 0.1, lado * 0.88, lado * 0.88);
  g.restore();
  return c;
}

