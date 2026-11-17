/**
 * Smanjuje sliku u pregledniku prije slanja: brže učitavanje i manje mjesta.
 * Logo ostaje PNG (zbog prozirne pozadine), fotografije postaju JPEG.
 */
export async function resizeImage(file: File, maxSide: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error('IMAGE_TYPE');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('IMAGE_TYPE'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('IMAGE_TYPE');
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
    if (!blob) throw new Error('IMAGE_TYPE');
    if (blob.size > 2 * 1024 * 1024) throw new Error('IMAGE_SIZE');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
