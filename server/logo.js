export const LOGO_MAX_BYTES = 512 * 1024;

const checks = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (b) => b.length >= 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a'),
  'image/webp': (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

export function parseLogo(input) {
  if (typeof input !== 'string') return { error: 'Logo must be a PNG, JPEG, GIF, or WebP image' };
  const match = /^data:(image\/(?:jpeg|jpg|png|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(input.trim());
  if (!match) return { error: 'Logo must be a PNG, JPEG, GIF, or WebP image' };
  let type = match[1].toLowerCase();
  if (type === 'image/jpg') type = 'image/jpeg';
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || !checks[type](bytes)) return { error: 'Logo file does not match an allowed image type' };
  if (bytes.length > LOGO_MAX_BYTES) return { error: 'Logo must be 512 KB or smaller' };
  return { dataUrl: `data:${type};base64,${bytes.toString('base64')}` };
}
