// What the viewer wants to be told about. Stored per browser (localStorage) - an anonymous account is per browser anyway.
//   notifyFrom : who may put ally/rival rows in my bell     'everyone' | 'following' | 'nobody'
//   toastFrom  : whose votes may pop up as a toast          'everyone' | 'following' | 'off'
//   rivalAlerts: alerts when someone votes AGAINST me (a mute; votes with me are unaffected)   true | false
//   popups / socialPopups / chatterPopups: master pop-up switch, then people alerts, then welcome / encouragement lines   true | false
//   matchAlerts: "you're behind / nailbiter / comeback" alerts for matches I voted in   true | false
export const NOTIFICATION_PREF_DEFAULTS = { notifyFrom: 'everyone', toastFrom: 'everyone', matchAlerts: true, rivalAlerts: true, popups: true, socialPopups: true, chatterPopups: true };

export function readNotificationPrefs(storage = globalThis.localStorage) {
    const get = k => { try { return storage?.getItem(k); } catch { return null; } };
    const pick = (v, ok, d) => (ok.includes(v) ? v : d);
    return {
        notifyFrom: pick(get('notifyFrom'), ['everyone', 'following', 'nobody'], NOTIFICATION_PREF_DEFAULTS.notifyFrom),
        toastFrom: pick(get('toastFrom'), ['everyone', 'following', 'off'], NOTIFICATION_PREF_DEFAULTS.toastFrom),
        matchAlerts: get('matchAlerts') !== 'false',
        rivalAlerts: get('rivalAlerts') !== 'false',
        popups: get('popups') !== 'false',
        socialPopups: get('socialPopups') !== 'false',
        chatterPopups: get('chatterPopups') !== 'false'
    };
}

// isFollowed: does the viewer follow the person who voted?
// isAlly: true = voted with me, false = voted against me (rival), undefined = not a vote alert (follows, likes ...)
export const shouldSaveSocial = (prefs, isFollowed, isAlly) =>
    !(isAlly === false && prefs.rivalAlerts === false) && (prefs.notifyFrom === 'everyone' || (prefs.notifyFrom === 'following' && !!isFollowed));
export const shouldToastSocial = (prefs, isFollowed, isAlly) =>
    shouldSaveSocial(prefs, isFollowed, isAlly) && (prefs.toastFrom === 'everyone' || (prefs.toastFrom === 'following' && !!isFollowed));

