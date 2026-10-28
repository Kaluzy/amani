// Local hosting uses the Node API; Pages uses a public, timestamped JSON export.
const meta = name => typeof document === 'undefined' ? '' : document.querySelector(`meta[name="${name}"]`)?.content || '';
export const basePath = meta('amani-base').replace(/\/$/, '');
export const staticMode = meta('amani-hosting') === 'github-pages';
export const repositoryURL = meta('amani-repository') || 'https://github.com/Kaluzy/amani';
export function sitePath(path) {
  if (!basePath || !path.startsWith('/') || path === basePath || path.startsWith(basePath + '/')) return path;
  return basePath + path;
}
export function routeURL(value = location.href) {
  const url = new URL(value);
  if (basePath && (url.pathname === basePath || url.pathname.startsWith(basePath + '/'))) url.pathname = url.pathname.slice(basePath.length) || '/';
  return url;
}
export function prepareLinks(root = document) {
  for (const link of root.querySelectorAll('a[href^="/"]')) link.setAttribute('href', sitePath(link.getAttribute('href')));
}
export function dataURL(url) {
  return staticMode && url.startsWith('/api/') ? sitePath('/data' + url.slice(4).split('?')[0] + '.json') : url;
}
