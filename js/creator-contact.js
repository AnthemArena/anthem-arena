// Where creators write if they want their edit left out or removed. One place, so the address is changed here only.
// Any link with  data-creator-mail  (or data-contact-mail)  gets its mailto: (with a subject) and, if it has data-show-address, the address as its text.
// Without JavaScript the link text still says to email Arcane Moments, so nothing breaks. Building the address here instead of
// writing it into every page also keeps it out of the simplest address-harvesting bots.
export const CREATOR_EMAIL = 'arcanemomentsfanpage@gmail.com';
export const REMOVAL_SUBJECT = 'Edit removal request';

export function removalMailto(editTitle = '') {
    const t = String(editTitle || '').trim();
    const body = `Hi,\n\nI'm the creator of ${t ? `"${t}"` : 'an edit'} and I'd like it removed from Arcane Moments.\n\nLink to my video: \n\nThanks`;
    return `mailto:${CREATOR_EMAIL}?subject=${encodeURIComponent(REMOVAL_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

// data-creator-mail  -> removal request (subject and starter message).   data-contact-mail -> a plain email to the same address.
// data-show-address  -> also write the address as the link text (into a [data-address] child if there is one).
export function wireCreatorLinks(root = document) {
    root.querySelectorAll('a[data-creator-mail], a[data-contact-mail]').forEach(a => {
        a.href = a.hasAttribute('data-creator-mail') ? removalMailto() : `mailto:${CREATOR_EMAIL}`;
        if (a.hasAttribute('data-show-address')) (a.querySelector('[data-address]') || a).textContent = CREATOR_EMAIL;
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wireCreatorLinks());
    else wireCreatorLinks();
}
