const MAX_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1600;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('IMAGE_ENCODING_FAILED')), type, quality));
}

export async function prepareReportPhoto(file: File): Promise<File> {
  if (!ALLOWED.has(file.type)) throw new Error('Sólo se admiten imágenes JPEG, PNG o WebP.');
  if (file.size < 1 || file.size > 12 * 1024 * 1024) throw new Error('La foto original supera el límite de procesamiento.');
  if (typeof createImageBitmap !== 'function') throw new Error('Este navegador no permite reducir y limpiar metadatos de la foto. Podés enviar el informe sin adjuntos.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('IMAGE_CANVAS_UNAVAILABLE');
    context.drawImage(bitmap, 0, 0, width, height);
    const outputType = 'image/jpeg';
    let blob = await canvasBlob(canvas, outputType, .82);
    if (blob.size > MAX_BYTES) blob = await canvasBlob(canvas, outputType, .68);
    if (blob.size > MAX_BYTES) blob = await canvasBlob(canvas, outputType, .54);
    if (blob.size > MAX_BYTES) throw new Error('La foto no pudo reducirse por debajo de 4 MiB.');
    const extension = '.jpg';
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'foto';
    return new File([blob], `${base}${extension}`, { type: outputType, lastModified: Date.now() });
  } finally { bitmap.close(); }
}
