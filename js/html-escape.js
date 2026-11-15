// Escaping for text that people wrote (usernames, posts, comments, picture addresses) before it goes into innerHTML.
// Escapes quotes too, so a value is safe inside an attribute as well as in element text.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A picture address that can sit in src="...": http(s), an image data: url or a path on this site; any other scheme
// (javascript:, data:text/html ...) becomes ''.
export function safeImageUrl(url) {
    const u = String(url ?? '').trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return /^(https?:\/\/|data:image\/)/i.test(u) ? escapeHtml(u) : '';
    return escapeHtml(u);
}
