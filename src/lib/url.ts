const RAW_BASE = import.meta.env.BASE_URL;
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE.slice(0, -1) : RAW_BASE;

export function url(path: string): string {
  if (!path) return BASE + '/';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : '/' + path;
  return BASE + normalized;
}
