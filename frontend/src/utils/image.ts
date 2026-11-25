/**
 * Returns today's local date as YYYY-MM-DD.
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current local time as HH:MM.
 */
export function getCurrentTimeString(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Formats YYYY-MM-DD and HH:MM into a readable Japanese date/time label.
 */
export function formatTimelineDateTime(dateStr: string, timeStr: string): string {
  const today = getTodayDateString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

  if (dateStr === today) {
    return `今日 ${timeStr}`;
  }
  if (dateStr === yesterday) {
    return `昨日 ${timeStr}`;
  }

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const wd = weekdays[dateObj.getDay()] || '';
    return `${Number(m)}/${Number(d)} (${wd}) ${timeStr}`;
  }

  return `${dateStr} ${timeStr}`;
}

/**
 * Resizes and center-crops an image file to exact 1280x960 JPEG without distortion.
 */
export function resizeImageTo1280x960(file: File): Promise<Blob> {
  const TARGET_WIDTH = 1280;
  const TARGET_HEIGHT = 960;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = TARGET_WIDTH;
      canvas.height = TARGET_HEIGHT;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(file);
        return;
      }

      // Cover-crop so the output is always 1280x960 without stretching
      const scale = Math.max(TARGET_WIDTH / img.width, TARGET_HEIGHT / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const offsetX = (TARGET_WIDTH - drawWidth) / 2;
      const offsetY = (TARGET_HEIGHT - drawHeight) / 2;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      canvas.toBlob(
        (blob) => {
          resolve(blob || file);
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}
