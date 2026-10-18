// Repairs champion avatar urls saved with a display name instead of the Data Dragon id
// ("…/champion/Lee Sin.png" 404s; the file is "LeeSin.png"). Anything that is not a Data Dragon champion url is returned unchanged.
// Saved by name before Data Dragon's id was known: "Wukong" is the file MonkeyKing.png.
const ALIASES = { wukong: 'MonkeyKing' };
const ODD = { chogath: 'Chogath', kaisa: 'Kaisa', khazix: 'Khazix', velkoz: 'Velkoz', belveth: 'Belveth', leblanc: 'Leblanc', nunuwillump: 'Nunu', nunuandwillump: 'Nunu', renataglasc: 'Renata', ksante: 'KSante', kogmaw: 'KogMaw', reksai: 'RekSai', drmundo: 'DrMundo', jarvaniv: 'JarvanIV' };

export function fixAvatarUrl(url) {
    if (typeof url !== 'string') return url;
    const m = url.match(/^(https?:\/\/ddragon\.leagueoflegends\.com\/cdn\/[^/]+\/img\/champion\/)([^/?#]+?)(\.png)$/i);
    if (!m) return url;
    let name;
    try { name = decodeURIComponent(m[2]); } catch { name = m[2]; }
    if (ALIASES[name.toLowerCase()]) return m[1] + ALIASES[name.toLowerCase()] + m[3];
    if (!/[^A-Za-z0-9]/.test(name)) return url;
    const id = name.replace(/[^A-Za-z0-9]/g, '');
    return m[1] + (ODD[id.toLowerCase()] || id) + m[3];
}

// The splash art that goes with an avatar: the skin shown in the picture (tile or icon url with _<skin>), else the classic
// splash of the champion named by the avatar. null when the avatar is not a champion.
export function splashFromAvatar(avatar) {
    if (!avatar || avatar.type !== 'url') return null;
    const base = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/';
    const m = /\/champion\/(?:tiles\/)?([A-Za-z0-9]+?)(?:_(\d+))?\.(?:png|jpg)(?:[?#].*)?$/.exec(fixAvatarUrl(String(avatar.value || '')));
    if (m) return `${base}${m[1]}_${m[2] || 0}.jpg`;
    const id = String(avatar.name || '').replace(/[^A-Za-z0-9]/g, '');
    return id ? `${base}${ALIASES[id.toLowerCase()] || id}_0.jpg` : null;
}
