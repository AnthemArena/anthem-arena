// Feature switches. Flip one to true to bring a feature back; the code stays in place.

// Emotes (Say thanks / Challenge between voters) are switched off for now. With this false:
//  - ally / rival alerts ("X voted with / against you") stay, but their button just opens the match
//  - no emote can be sent, no emote listener runs, emotes already sitting in the bell are hidden
//  - the "Who can send you emotes" privacy setting is hidden
export let EMOTES_ENABLED = false;
export function __setEmotesEnabledForTests(v) { EMOTES_ENABLED = !!v; }      // tests only

// While emotes are off, an ally / rival alert ("X voted with / against you") has its own button: "View profile" opens the
// other voter's profile (Follow lives there, and their taste profile). The alert itself (toast body, bell row) still opens the match.
// Any other alert whose button would send an emote becomes a plain "View match". Also fixes alerts saved earlier.
export function withoutEmoteCta(n, enabled = EMOTES_ENABLED) {
    if (enabled || !n) return n;
    const user = n.triggerUsername || n.username;
    if (n.type === 'live-activity' && (n.relationship === 'ally' || n.relationship === 'opponent') && user) {
        return {
            ...n,
            ctaAction: 'navigate', action: 'navigate', ctaText: 'View profile', cta: 'View profile',
            ctaData: undefined, emoteData: undefined,
            ctaUrl: `/profile.html?user=${encodeURIComponent(user)}`,
            targetUrl: n.targetUrl || (n.matchId ? `/vote.html?match=${encodeURIComponent(n.matchId)}` : undefined)
        };
    }
    if (n.ctaAction !== 'send-emote' && n.action !== 'send-emote') return n;
    return {
        ...n,
        ctaAction: 'navigate', action: 'navigate', ctaText: 'View match', cta: 'View match',
        ctaData: undefined, emoteData: undefined,
        targetUrl: n.targetUrl || (n.matchId ? `/vote.html?match=${encodeURIComponent(n.matchId)}` : undefined)
    };
}
