// What the viewer wants to be told about. Stored per browser (localStorage) - an anonymous account is per browser anyway.
//   notifyFrom : who may put ally/rival rows in my bell     'everyone' | 'following' | 'nobody'
//   toastFrom  : whose votes may pop up as a toast          'everyone' | 'following' | 'off'
//   matchAlerts: "you're behind / nailbiter / comeback" alerts for matches I voted in   true | false
export const NOTIFICATION_PREF_DEFAULTS = { notifyFrom: 'everyone', toastFrom: 'everyone', matchAlerts: true };

export function readNotificationPrefs(storage = globalThis.localStorage) {
    const get = k => { try { return storage?.getItem(k); } catch { return null; } };
    const pick = (v, ok, d) => (ok.includes(v) ? v : d);
    return {
        notifyFrom: pick(get('notifyFrom'), ['everyone', 'following', 'nobody'], NOTIFICATION_PREF_DEFAULTS.notifyFrom),
        toastFrom: pick(get('toastFrom'), ['everyone', 'following', 'off'], NOTIFICATION_PREF_DEFAULTS.toastFrom),
        matchAlerts: get('matchAlerts') !== 'false'
    };
}

// isFollowed: does the viewer follow the person who voted?
export const shouldSaveSocial = (prefs, isFollowed) => prefs.notifyFrom === 'everyone' || (prefs.notifyFrom === 'following' && !!isFollowed);
export const shouldToastSocial = (prefs, isFollowed) =>
    shouldSaveSocial(prefs, isFollowed) && (prefs.toastFrom === 'everyone' || (prefs.toastFrom === 'following' && !!isFollowed));

// How pop-up alerts look (this browser only; the same words and buttons in every style).
//   classic: splash art as a header strip   full: art behind the whole card   side: a tall art column on the left
//   minimal: no art, no thumbnails, no button: just the champion's portrait and words
export const TOAST_STYLES = ['classic', 'full', 'side', 'minimal'];
export const DEFAULT_TOAST_STYLE = 'classic';
export function readToastStyle(storage = globalThis.localStorage) {
    try { const v = storage?.getItem('toastStyle'); return TOAST_STYLES.includes(v) ? v : DEFAULT_TOAST_STYLE; } catch { return DEFAULT_TOAST_STYLE; }
}
