# Project Plan: Arcane Moments (paused) and the Card Game (current focus)

Last updated: 4 Oct 2026. Focus moved to the card game (section 0). Arcane Moments is paused, not removed. Kept in sync with the chat, not with the repo.

---

## 0. Current focus: original-IP card game (built on the tournament / voting infrastructure)

**Status of Arcane Moments:** paused. The landing page, channel and test tournament stay live as they are. Sections 1 to 9 below are kept as reference and as a to-do list if it is ever resumed. The Arcane to-do list (1b) is **on hold**.

**The idea**
- A Top Trumps-style card game: each round, a stat pairing is compared, but instead of "higher wins", the stats set a **modifier to a dice roll**. Higher stats still win most of the time, but upsets can happen.
- Ability cards that change a roll, a stat or a card. First example: a time-manipulating character that can **re-roll a die**.
- Matches can be **played** as well as voted on and predicted, using the existing tournament infrastructure.
- Goal: **own IP**, reusable tournaments, and a clearer commercial path than clips of other people's footage.

**Decisions made**
- Dice size, ability rules (once per match? per round? keep the better roll or take the second?) and stat scales are **decided by simulation**, not by guessing.
- Matches are tuned and played with the same rules engine.

**What the first simulation showed (illustrative, 200k trials each)**

| Stat gap | d20 + stat each | 2d6 + stat each | one d20 + gap vs 11 |
|---|---|---|---|
| 2 | 60% | 71% | 58% |
| 5 | 72% | 92% | 73% |
| 8 | 82% | 99% | 88% |

- Chance the higher stat wins. A d20 leaves upsets alive (about 28% at a gap of 5). 2d6 makes stats much more decisive.
- Rounding stats into modifiers (for example `(stat - 10) // 2`) can erase small gaps: a gap of 1 won exactly 50%. Keep the stat scale small, or avoid rounding.
- A re-roll where you keep the better of two d20 rolls is worth about **+3.3** to the roll (about three stat points). Price every ability in "stat points" and balance on that.

**Architecture notes**
- **One pure rules engine** (cards + seed in, results out) used by both the simulator and the live game.
- **Rolls on the server** (edge function) with a **seeded** generator: no tampering, exact replays, and "how that upset happened" can be shown.
- **Asynchronous, turn-based play first.** Suits a small audience and the existing Firestore setup.
- **Spectators:** the engine gives real odds ("A 68% / B 32%"), which makes prediction meaningful and an upset an event. The existing upset detection and toasts fit this.
- **Reusable from the current site:** accounts and anonymous sign-in, match records, live widget, edge caching, XP and achievements, toast / companion system, brackets.

**SRD-based stat system and hearts (design notes, to be tuned by simulation)**
- **Licence:** SRD 5.1 and 5.2 are both CC-BY-4.0 (commercial use allowed with attribution; cannot be revoked). Only SRD content is covered: no D&D name or logos, no trademarked monsters (beholders, illithids), and not the D&D Beyond Basic Rules / Free Rules. Read the exact attribution wording before publishing. Not legal advice.
- **Stat block:** six scores (STR, DEX, CON, INT, WIS, CHA), modifier `floor((score - 10) / 2)`, d20 roll. One stat compared per round. Contested roll (both roll) or roll against a fixed target: simulate both.
- **Advantage / disadvantage** (two d20, keep higher / lower) is the time-manipulation ability. Worth about +3.3 on a d20.
- **Proficiency** idea: each card is proficient in 2 of its 6 stats (bonus applies there). Adds a decision: a high stat versus a stat the card is good at.
- **Watch-outs:** modifiers change only every 2 points, so a gap of 1 can vanish (tested: 50%), and one modifier step is only about +5% on a d20. Stats may feel weak; options are a smaller die, a bigger modifier scale, or using the raw score gap. Six stats on a phone screen needs a layout check. SRD content is shared by everyone, so the IP is the characters, names, art, world and specific rules, not the stat-block format.
- **Hearts (1 to 5):** a card loses one heart each time it loses a stat battle; at 0 it is out. Hearts double as a power tier (5 = very strong, 1 = weak).
- **Test results (3d6 stats, picker chooses the best stat gap, ties repeat the round):**
  - Equal 3-heart duels: the first picker wins about 55%, and changing who picks next (winner / loser / alternate) barely changed that. Matches last about 4 to 4.5 rounds.
  - Hearts dominate: 4 vs 3 hearts wins about 73%, 5 vs 3 about 85%, 5 vs 1 about 99%. Adding +2 to every stat on the stronger card only adds about 5 to 7 points on top.
  - So hearts and stats double-count. Use a **point budget** (hearts + stats), match equal-heart cards, or make hearts a deck-building resource, so a 5-heart card cannot simply win.
- **Turn order in usual Top Trumps** (from memory): the deck is dealt out, the starting player calls a stat, the higher card wins both cards and calls next, ties go to a pile that the next winner takes, and the game ends when one player holds every card. Hearts change this: cards do not change hands, they are fighters. Closer to a duel or team battle.
- **Open choices for the simulator:** who picks the next stat, first-pick fix (for example the second player gets a small bonus), multi-creature decks (order of play is a decision), and how abilities cost hearts or stat points.

**Stat system v0 draft (battle stats vs build stats; names are placeholders)**
- **Battle stats v1** (compared each round, the picker chooses one): **Might** (physical force), **Finesse** (speed, precision, trickery), **Magic** (arcane power), **Resolve** (willpower, endurance, nerve). Wits dropped (overlapped Spirit; cunning moves into Finesse). Each must be the best pick in some matchup, or it is a dead stat; archetypes: Berserker = Might, Rogue = Finesse, Battle Mage = Magic, Guardian / Healer = Resolve. Avoid 'Arcane' / 'Arcana' in names.
- **Build stats** (shape the card, never compared): **Vitality** sets hearts; **Tempo** sets initiative (who picks first, bench order); **Focus** sets ability potency or uses (for example how much a healer restores).
- **Rules:** no stat does two jobs; hearts are priced steeply and tied to a stat budget, so more hearts means weaker battle stats; use the modifier directly as the stat value (about -1 to +6) to avoid the rounding problem.
- **Heart exchange rate (CORRECTED, `game-sim/heart-price.js`):** the earlier figure (+4 on every stat, 16 to 24 points) was in 3d6 score points, not modifiers. In modifier units: d20 3v4 hearts one heart ≈ +1.6 per stat (~6 total); d20 5v6 ≈ +0.9; d20 8v9 ≈ +0.6; d12 3v4 ≈ +0.9; d10 3v4 ≈ +0.7 (~2.8 total); d10 5v6 ≈ +0.5; d10 8v9 ≈ +0.3. Duel length: 5 rounds at 3 hearts, ~9 at 5, ~14-15 at 8. Leaning d10/d12 with 3 to 5 hearts (heart worth ~2 to 3 stat points, duels 5 to 9 rounds). Not final.
- **Example shapes (unbalanced on purpose):** Brawler (Might +5, 4 hearts), Healer (Spirit +4, low Might, 2 hearts, Focus 3), Trickster (Finesse +4, Wits +3, Tempo 4, 2 hearts), Guardian (5 hearts, modest stats, likely far too strong at the current exchange rate).
- **To test:** point budget per heart; dead stats; whether Tempo fixes the first-pick edge (about 5 points) without becoming too strong; Healer performance in a team.
- If the system moves far from the SRD's six abilities, use own names and keep only the d20-plus-modifier idea. Less to attribute, clearer IP, less D&D familiarity.

**Cost model v1 (`game-sim/balance.js`, d10, 1v1, per-value regression; rough, measured against a fixed field of 40 reference cards)**
- Unit: 1 point = the power gained by one stat going +0 to +1. (The earlier `heart-price.js` figure measured raising ALL four stats together, so it is a different unit; use this one for building cards. Only the best-gap stat is used each round, so a single point is worth less than a uniform one.)
- **The picker rule changes the heart price enormously.** Loser picks (rubber-banding): a heart is worth about 8 to 9 points, so hearts swamp stats. Winner picks (the winner keeps choosing): a heart is worth about 2.5 points, so stats matter. Winner-picks also fits a Berserker leaning on Might on his turn.
- Fitted prices, winner picks: stat steps cost 1.0 / 0.96 / 0.87 / 0.74 / 0.59 / 0.53 (0 to 6), hearts 2 / 3 / 4 / 5 = 0 / 2.6 / 4.7 / 6.6, plus a **peak premium of about 0.9 per point of the card's highest stat** (spikes beat balanced cards at equal total, so the top stat needs extra cost).
- Balance achieved: equal-cost cards within about 2 points of each other (std), though the extremes at a given cost can still be 8 to 9 points apart (for example a +6 spike beats a balanced card of the same cost). Interactions are not fully captured by an additive price.
- Leaning: winner picks, d10, 3 to 5 hearts. Not final. Still to test: team battles, abilities priced in the same units, initiative (Tempo) and first-pick.

**Ability prices re-measured under d10 / winner picks (`node sim.js 40000 10 winner 2`; 3v3, ability on one card, win-rate change; converted to cost units at roughly 2.2 team win-rate points per cost unit, cross-checked: +1 to all four stats on one card = +11 pts, about 5 cost units, matching the fitted stat prices)**
- Advantage once: +2.7 pts, about 1.2 cost. "Radiant Light" (-2 to the opponent's roll, once): +3.1, about 1.4. Heal +1 heart, once: +5.4, about 2.4 (equal to a free heart). "I Am Your Shield" as written: about 0 (+1.2 if used only to protect a stronger fighter), about 0.5 cost. All rough.
- Abilities should be bought from the card's budget in the same units, so a legendary has room for a strong ability while a common must trade stats for one. Leave room in the card format for abilities to be added later.

**Power tiers (design requirement: the roster must NOT be flat)**
- Equal cost means equal strength within a tier, not across the roster. Tiers come from different budgets.
- Cost to win rate vs the average card (winner picks, d10): cost 5 ~25%, 8 ~32%, 11 ~40%, 14 ~49%, 17 ~59%, 20 ~69%, 23 ~78%. About +10 points per +3 cost. Head-to-head estimate (to verify in direct duels): a 3-point gap gives the stronger card ~60%, a 6-point gap ~70%.
- Example budgets: Common ~10, Uncommon ~14, Rare ~18, Legendary ~22 (each tier beats the one below ~60 to 65%; legendary beats common ~85%; upsets stay alive).
- Variety levers: different shapes at the same tier; cheap cards with strong abilities (support value vs weak duels); a team budget (for example 42: one legendary + two commons vs three uncommons); tier limits for ranked play, mixed tiers for spectator matches (favourites and underdogs make predictions and upset toasts worth having).
- Open: are tiers a collectable rarity, or an open draft where any card can be taken at its cost?

**Specialists vs generalists (`game-sim/specialist-test.js`, 1v1, 3 hearts, equal stat totals of +8)**
- Berserker (+6 Might) and Rogue (+6 Finesse) beat a +2/+2/+2/+2 Generalist about 58% of the time, because the picker chooses the best stat. Berserker vs Rogue is 50% (mirror images). Picker rule (winner / loser) made almost no difference.
- "No repeat" (a stat just used cannot be picked next round) cuts the specialist edge to about 52 to 56%.
- Options: no-repeat or fatigue (-1 per consecutive use), convex stat pricing (high stats cost more), hidden simultaneous picks, counters through abilities (for example a Rogue whose "Evasive" gives the opponent's Might rolls -2). **Decision:** no repeat limit (a Berserker may pick Might every turn); handle matchups with counter abilities (for example Evasive / Warded), and price high stats convexly so spikes do not beat generalists for free.

**Team battles and supports (planned, after 1v1 is tuned)**
- Teams of creatures (start with 3). Order of play is a decision; hearts across the team are a resource. Supports (healers, buffers) restore a heart to an ally or buff a stat.
- **Test (3v3, 3 hearts each, random stats, contested d20, loser picks):** baseline 52.4% (first-pick edge); heal one heart once per match 63.8%; advantage on one roll once per match 55.7%; heal vs advantage 61.3%. One healed heart is worth about 11 points of win rate, about three times a single advantage roll. Rough heuristics, use for scale only.
- **Pricing rule of thumb:** price every ability in win-rate points from the simulator. A heal must cost something (limited uses, a turn, weaker body, a cap).
- **Risks:** stalling when both teams heal; every team bringing a healer. Buffs (one stat, one round) are cheaper to balance than heals.
- **Rule to test:** a support action replaces a fight turn instead of being free (built-in price).
- **Simulator knobs:** team size, heart budget per team (1 to 5 per card), picker rule, ability uses per match, whether an ability costs the turn, heal amount and cap.

**Simulator v0 (`game-sim/sim.js`) first ability prices** (3v3, 3 hearts each, d20, contested rolls, ability on one card, 40k battles, win-rate change vs baseline; rough heuristics)
- Advantage once (on last heart): +3.3 pts. "Radiant Light" (-3 to the opponent's roll, once): +2.7. Heal +1 heart to an ally, once: +10.9 (identical to a free heart). "I Am Your Shield" as written: about 0, because it moves a heart instead of creating one; if only used to protect a stronger fighter: +0.8.
- References: +1 heart on one card +10.9; +1 to all stats on one card +5.2.
- Lesson: price abilities by what they change. Anything that creates hearts costs like hearts. Redirects need extra value (for example the shield holder takes reduced damage, or the protected fighter keeps a bonus) to be worth a card slot.
- Bug history: a first run showed 0.0 for heal and shield because supports sat on the first fighter; fixed by placing supports on the bench and letting healing work from the bench.

**Simulation suite should measure:** win rate per card, upset frequency by stat gap, win-rate change per ability (against its cost), first-player advantage, and match length.

**Cautions**
- "Top Trumps" is a trademark. The mechanic is not ownable, but the name and look are. Use an original name.
- **Own IP means original characters, world and art.** The Arcane champion companions (Jinx, Vi, Caitlyn) are Riot's and cannot carry over. The champion packs need replacing with original characters before anything ships.
- The Arcane audience does not transfer. This starts from zero.
- Prediction plus randomness resembles gambling. Keep it free with no cash-value prizes. If that ever changes (real money, paid entry, cash prizes), check the UK Gambling Commission's rules. Not legal advice.
- Digital card games are a hard market. Test the fun before building.
- **The current repo is public.** Anything committed is readable (rules, balance data, card lists). Start the game in a **new private repo** and copy over only what is reusable.

**First steps**
1. **Design note:** card format (name, 4 stats, optional ability), round rules, a first set of 20 to 30 cards, 5 or 6 abilities.
2. **Simulator:** a Node script that plays thousands of matches with the rules engine and prints the metrics above.
3. **Paper test** with real dice and a friend (10 matches) alongside the simulator. If it does not make you want another round, rethink the rules before building.
4. **Decide the reusable core:** list which files from the current site carry over, and make the wording generic (the labels-object idea) so the tournament pages stop saying "song" or "moment".
5. Later: a playable web prototype, then spectators and predictions.

---

## 0b. Pivot (Oct 2026): Arcane Moments becomes an Arcane edits tournament, Jinx first

The card game (section 0) continues as a separate project. This section covers the Arcane Moments site.

**Direction:** curated YouTube edits (embedded, never re-uploaded), first tournament = **Jinx edits**. The moments tournament plan (sections 3 to 5: scene tags, arcs, sibling draw rule) is parked.

**What the existing code already supports**
- The vote page uses a standard YouTube embed and thumbnail by video ID, so any YouTube edit works. Vertical Shorts are pillarboxed in the 16:9 frame.
- Cards show `artist • year`; the creator name can go in `artist` with no code change. A link to the creator's channel is a small addition.
- Match entries are plain JSON (id, title, slug, videoId, characters, seed); edits fit the same format.

**Changes from the moments plan:** no scene tags / arcs / sibling rule; new curation step, creator credit, embeddability check, creator notification; the "song" wording migration now needs "edit" wording; the Jinx champion companion fits.

**Proposed rules (to confirm):** bracket of 16 or 32; Jinx is the clear focus; public YouTube video that allows embedding; original (no re-uploads); several edits per creator are allowed (decided 11 Oct 2026); random draw; creator names hidden in early rounds to reduce follower-count bias; message creators before launch (they do not have to opt in, but notification drives sharing); keep the fan-project disclaimer and a visible takedown contact.

**First build:** an import script (run in the Codespace with the existing YouTube API key): list of YouTube links in, checks (public, embeddable, duration, duplicate creators, view count, publish date) and a report out, tournament-ready JSON written. Test the logic offline with sample data; real calls need the user's key.

**Tournaments run one at a time (decided).** No multi-tournament engine or URL parameter. Switching cups = change the ID in `js/arcane-config.js` AND the two edge-function copies (`netlify/edge-functions/firebase-cache.js`, `live-matches.js`). Verified on latest `main` that `api-client.js` and the other Phase 1 files read the config.

**Between-cups checklist (found by reading the code)**
1. **Vote ID collision:** votes are stored as `{matchId}_{userId}` in a shared `votes` collection. Reusing `round-1-match-1` in the next cup would block earlier voters ("already voted"). Fix with data only: give every cup's matches IDs that include the tournament, for example `jinx-cup-1-round-1-match-1`. `brackets.js` only uses the ID for a label (`formatMatchReference`); a longer ID shows the raw ID (cosmetic; could use the last 4 segments).
2. **My Votes dropdown** (`my-votes.html`, hard-coded `2025-worlds-anthems` / "Anthem Arena S1") needs each new cup added. `match-card-renderer.js` `formatTournamentName` needs a display name per cup (currently `arcane-test-01` = "Arcane Moments").
3. **Archive results:** with one active ID the Brackets page only shows the current cup. Save a small results file per cup (`data/results/jinx-cup-1.json`: winner, finalists, bracket) for gallery badges and Major qualifiers.
4. **Cleanup:** `js/username-system.js` (~line 522) backfill writes `tournamentId: '2025-worlds-anthems'` onto activity records. Leftover; would mislabel activity if it ran.
5. Test data (votes, activity, profiles, Founding Member counter) must be cleared before the first public cup (see section 8).

**End goal (Oct 2026): a series of Arcane / League edit tournaments, with a "Major" as the biggest**
- Many themed tournaments (character cups such as Jinx first, then others) plus a **Major** open to any Arcane edit.
- **Qualifier structure (idea):** winners / finalists of the themed cups qualify for the Major. Results from the cups also give the Major a natural seeding (popularity seeding was dropped earlier), and a qualification story people can follow.
- **One master pool, many tournaments:** `data/edits.json` holds every edit (characters detected from titles and descriptions, a `tournaments` list per edit); each tournament is a selection from it. Tournament rules differ (Jinx cup: Jinx-focused; Major: any Arcane edit), and several edits by one creator are allowed in a tournament (decided 11 Oct 2026).
- **Architecture:** Phase 1 put the tournament ID in `arcane-config.js`. Running several tournaments needs the ID chosen per page (URL parameter such as `?t=jinx-cup-1`, with the config value as the default). The Phase 1 groundwork makes that a contained change.
- **Scope:** "League of Legends / Arcane edits" widens it. Riot's fan content policy applies as well as the Arcane (Netflix / Fortiche) footage; keep the disclaimer and takedown contact.
- **Scale risk:** the Major needs a large audience and a large bracket (64 or 128, or play-ins). Start small; each cup builds the audience for the Major. Not committed to a timeline.
- **Importer (edits-tool/tools/edits-import.js):** generic. `data/edit-urls.txt` in, `data/edits.json` out; `--character Jinx` flags edits that never mention Jinx; characters auto-detected (Powder counted as Jinx); reruns keep tags, notes, short titles and tournament entries and refresh stats. Tested offline only.
- **Headings (edits-tool/tools/edits-groups.js):** a line like `#jinxandvi` (a `#` and one word) in `data/edit-urls.txt` starts a group; each edit gets `"group"` and its `characters` from the heading (`"charactersSource": "heading"`), names joined by `and`, `&`, `+` or `-`. Without a heading, characters come from the title only. Set `"charactersSource": "manual"` to keep hand-edited characters. Convention: one cup per edit, by its heading; pairing edits wait in the pool until there are enough for their own cup. The report has a group filter.
- **Switching the active cup (tools/switch-cup.mjs):** the active cup id lives in FOUR places that must agree: `js/arcane-config.js`, `netlify/edge-functions/firebase-cache.js`, `netlify/edge-functions/live-matches.js` and `firestore.rules` (`activeTournament()`). `node tools/switch-cup.mjs <cup-id>` changes all four in one go (all-or-nothing; `--dry-run` previews), and `node tools/switch-cup.mjs --check` reports the id in each and exits 1 if they disagree. The first three go live with a commit and deploy; **the rules must also be PUBLISHED in the Firebase console** (Firestore Database > Rules), which the tool cannot do or verify: until then every vote on the new cup is rejected. Tests: `node tools/test-switch-cup.mjs`.
- **Group stage (js/group-builder.js, tools/group-preview.mjs, tools/test-group-builder.mjs):** admin build and knockout buttons in `js/init-group-tournament.js` + `admin.html` (format drop-down next to Build Bracket; "Build Knockout from Group Results"; Reset rebuilds the SAME draw from the saved `seeding`); the **brackets page is group-aware** (Group stage / Knockout tabs, a standings card per group, filter chips; see below); gallery standing and live page are NOT yet. Groups of 4, everyone plays everyone (6 matches), top 2 qualify into a normal knockout; sizes 8, 16, 32, 64, 128 or 256 entries. Seeded draw: edits ranked by the average of their views rank and likes rank (hidden likes estimated from views), split into 4 pots, one edit per pot per group, pots shuffled with the published draw seed. One cup, two stages: the group stage is round 1 (`stage: "group"`, `batch` = group, so Open Batch opens one group; never round 0, because several pages treat a falsy round as 1) and the knockout is rounds 2 and up (`stage: "knockout"`, same `sourceMatch` links). Standings: wins, then share of the group's votes, then total votes, then draw position. Knockout round 1 pairs group winners with runners-up of another group (A1 v B2, B1 v A2). Preview a draw with `node tools/group-preview.mjs --demo 64 --simulate`. Tests: `node tools/test-group-builder.mjs`, `node tools/test-group-firestore.mjs` (real Firestore code against an in-memory fake), optional `python3 tools/test-admin-browser.py` (real admin page in headless Chromium).
- **Brackets page for group cups (js/brackets-groups.js, css/brackets-groups.css, js/brackets.js):** a cup is a group cup when its matches have `stage: "group"` (`describeCup` in group-builder.js, worked out from the match documents, no extra read). The page then shows tabs: **Group stage** (a card per group with a standings table, "Qualified" / "Out" only once the group is finished, a collapsible match list that opens by itself for live groups, filter chips All / Live now / Finished) and **Knockout** (the normal bracket columns, group matches kept out so the tree spacing still works; a note until the knockout is built). Default tab: Groups until the knockout has started. The info panel has its own wording (`cupSummary`). Percentages on live matches stay hidden until the visitor has voted, as on the bracket cards. A single-elimination cup renders byte-for-byte as before. Tests: `node tools/test-brackets-groups.mjs`, optional `python3 tools/test-brackets-browser.py`. The edge function lists matches page by page (`fetchAllPages`), test: `node tools/test-edge-matches.mjs`.
- **Aspect (edits-tool/tools/edits-aspect.js):** the importer sets each edit's picture shape from the YouTube API's embed size (`part=player&maxWidth=720`: 720x720 = 1:1, 720x1280 = 9:16, 720x405 = 16:9), recorded as `"aspectSource": "api"`. Thumbnail bars (`"auto"`) are only a fallback for videos the API cannot size and always carry `aspectCheck` (the "? check" pill), because they proved unreliable on real thumbnails. `"aspectSource": "manual"` is never overwritten. `node tools/edits-aspect.js` re-runs just this step.

**Gallery as the edits directory (idea, agreed in principle):** the existing `music-gallery.html` + `js/music-gallery.js` loads one JSON file (`music-videos.json`) and does search, sort and filters in the browser. Its records already carry views, likes, uploadDate, embedAllowed, mood, category, videoId and artist, the same fields the YouTube API returns, so one `data/jinx-edits.json` can feed both the gallery (all edits in the pool) and the tournament (entries flagged `inTournament`).
- Needed changes: generate the creator filter from the data (the filter checkboxes are hard-coded in the HTML); remove music-tournament stats (championships, seed, "Legend" / "Champion" badges, `api-client` / `bookMappings` imports); handle non-embeddable videos (link to YouTube, exclude from bracket); filters = creator, upload date, mood or style tags, optional length filter, search.
- The gallery doubles as the "spotlight" directory idea: a reason to visit before the tournament, a showcase for creators, a curation tool, and a link to send creators.
- Suggested record shape: id, title, shortTitle, slug, artist (creator name), creatorUrl, channelId, year, uploadDate, views, likes, duration, videoId, embedAllowed, characters, tags, category "edit", inTournament, status.
- Build order: (1) import script writing `data/jinx-edits.json`, (2) adapt the gallery page to read it, (3) draw the bracket from flagged entries.

**Open questions:** 16 or 32 to start; confirm the messaging-creators plan.

---

## 1. Where things stand

**Live (merged to `main`, deployed on arcanemoments.netlify.app)**
- Landing page with Latest Shorts and Season 1 rows.
- Card titles are cleaned (everything after the first `|` is dropped).
- Season 1 sorts ascending by the `#N` in the title (`numbered: true` in `SITE_CONFIG`).
- Phase 1: the tournament ID is read from `js/arcane-config.js` (15 files). The edge function `live-matches.js` still holds its own copy of the ID with a "keep in sync" comment.

**Tested in the Codespace (Netlify dev, port 8888)**
- Matches, Brackets and My Votes show the two test matches.
- A fresh vote from a private window worked: vote record, API submission, counts, activity and social post all succeeded.

**Not yet checked**
- The live widget on the Community page.

**Socials and channel**
- TikTok and Instagram bios say fan-made / unofficial.
- YouTube description updated with the disclaimer and contact.
- Instagram link on the site is `rollingrealm` (intentional for now; change to the arcanemoments name later).

---

## 1b. Priority to-do list (Arcane Moments: ON HOLD)

Ordered by what helps most right now. "You" = needs your input or action; "Me" = I draft or build it as a patch for you to check in the Codespace.

**Now (high value, small)**
1. **Finish checking the live widget** on the Community page, then clear it. *(You)*
2. **Keep uploading Shorts** and finish episodes 1 to 7. This is the real critical path for the audience and the tournament. *(You)*
3. **Fix the 8 data gaps** in the new sheet tab: six blank episode 7 timestamps, Jinx Is Perfect's end time, the duplicate timestamp on The World Will Never Be the Same / The Hexcore. *(You)*

**Next (the toast / champion pack work)**
4. **Add a `default` achievement entry** to the Jinx, Vi and Caitlyn packs, so unmatched achievements use a voiced fallback instead of generic text, plus the `{xp}`/`{name}`/`{description}` placeholder fix. *(Me, small. **Patch built: `champion-defaults.patch`, to apply and check.**)*
5. **Jinx pack: write the 26 missing achievements** (Arcane voice, no spoilers; first draft from your short voice sheet: 3 to 4 speech habits, what excites or angers them, one thing they'd never say) (3 to 4 variants each: message, detail, button), then clean out her orphaned music-era entries. *(Me drafts, you edit)*
6. **Vi and Caitlyn packs:** same as above, one at a time. *(Me drafts, you edit)*
7. **Decide on Lux:** remove her pack, or replace with an Arcane character. *(You decide)*
8. **Check the alert triggers** by reading the relevant parts of `global-notifications.js`, and migrate the remaining music wording in the `alerts` sections. *(Me)*

**Then (the tournament migration)**
9. **Labels object** in `arcane-config.js`, plus `vote.html` + `vote.js` wording. *(Me)*
10. `matches`, `my-votes`, then `brackets` and `live`. *(Me)*
11. `stats`, `profile`, `feed`, `activity`, then `about`, legal pages. *(Me, with your review of the legal text)*

**When the content is ready**
12. **Landing page rows:** episode playlists when episode 2 starts, then one arc row as a test. *(You create the playlists, I check the config)*
13. **Scene tags** for moments that share a scene, then the **draw script** with a published shuffle seed. *(Me drafts candidates, you correct)*
14. **Decide bracket size** (64, 128 with byes, or arc group stages). *(You)*
15. **Social head-to-head polls** to gauge readiness. *(You)*

**Before going public**
16. The full checklist in section 8: clear test data, reset the Founding Member counter, fix the follower fan-out permissions error, remove public test pages, and split the tournament onto its own Netlify site. *(Mixed)*

**Parked**
- **Voice analysis from the show's dialogue:** extract a character's lines (from transcripts or subtitles you supply) to study speaking style, tone and vocabulary, then polish the champion packs from it. For analysis only. Keep the raw lines out of the public repo, and write new lines in the style rather than reusing the dialogue.
- Arcane Edits (fan edit spotlight) as a separate project.
- A story map / timeline page, until an arc row shows people care about the connections.
- A moment-by-moment context entry for all 113 moments (arc and character tags first).

---

## 2. Decisions made

| Topic | Decision |
|---|---|
| Hub | arcanemoments.netlify.app stays the permanent landing page. |
| Tournament type | **Moments only.** No mixing with fan edits. |
| Fan edits ("Arcane Edits") | Parked. Possible later as a separate project. Would be curated, linked and embedded, never re-uploaded. |
| Pairing | **Fully random draw.** No popularity seeding, so each tournament has fresh matchups. |
| Same-scene clips | Must not meet in round 1 (or earlier than a chosen round). Needs a scene tag. |
| Seeds | Hidden / unused with a random draw. Upset flags switch off. |
| Timeline | **No fixed launch date.** Launch when the audience is big enough. The channel is one week old. |
| Champion pack voice | **Arcane is the reference** (the new canon for the characters), not the League of Legends version. **No spoilers** in toast lines. Original lines only; don't reuse actual dialogue from the show. |
| Internal names | `songId`, `song1`, `music-videos.json` etc. stay as they are. Only visible text changes. |
| Site structure | Keep the landing page moments-only. Any story-map / timeline would be its own page. |

---

## 3. The moments data

Source: `Arcane - Moments` Google Sheet, exported as CSV (113 rows, episodes 1 to 7).

| Episode | Moments |
|---|---|
| 1 | 15 |
| 2 | 12 |
| 3 | 15 |
| 4 | 16 |
| 5 | 20 |
| 6 | 17 |
| 7 | 18 |
| **Total** | **113** (about 145 expected for 9 episodes) |

Cleaned files produced in the chat: `moments-clean.csv`, `moments.json`, `needs-attention.txt`.

**What the cleanup did**
- Unique IDs: `S1E02-B01`, `S1E02-B02`... (episode 1 is `B00` to `B14`). The old ID is kept in an `Old ID` column.
- Timestamps normalised to `m:ss – m:ss`. The `22-30` and `35-43` typos were corrected.
- Categories (Big/Medium/Small) left exactly as filled in. 61 are blank on purpose.

**Rows still needing a decision (8)**
- Six blank timestamps in episode 7: I Can't Leave Her Again, Liar, False Firelights, She's Turning You Against Me, The Boy Savior, Ekko vs. Jinx.
- Jinx Is Perfect (ep 5) has a start time only (`28:56`).
- The World Will Never Be the Same and The Hexcore (ep 5) have identical timestamps (`25:45 – 28:55`), so one is probably a copy/paste.

**Notes**
- Timestamps are *source scene ranges*, not clip lengths. Clips are condensed to 60 seconds.
- Contiguous timestamps do not reliably mean "same scene" after episode 1, because episodes 5 to 7 are covered almost end to end and cut between storylines. Scene tags must be hand-set.
- **Do not commit the sheet exports to the public repo.** The repo is public and Netlify publishes the whole folder, so anything in it is readable by URL (unreleased moments and notes included).
- When a page needs the data, generate a *trimmed JSON of published moments only*, with just the fields the page uses.

---

## 4. Tournament design

**Pool and bracket size (open)**
- 113 moments now, around 145 by episode 9. Options: trim to 64; 128 with byes or play-ins; or **group stages by arc**, feeding winners into a main bracket.
- With a small audience, fewer and more meaningful matchups are better than a huge bracket.

**Scenes, parts and arcs**
- **Episode**: where a moment sits in the show.
- **Scene**: the continuous stretch a clip was cut from. Needs a `scene` tag, for example `ekko-jinx-standoff`.
- **Arc**: a chain of cause and effect across scenes, for example *the explosion → "We Had a Deal" → Silco learns Vander's in trouble*. A moment gets one primary arc.
- Rule of thumb for the announcement: *each moment is one beat that stands on its own, so a big scene can produce several.*

**Draw script (to write)**
- Reads moments, shuffles with a **published shuffle seed** so anyone can re-run it, and swaps pairs until no two clips from the same scene meet in round 1. Reports if the rule can't be met.
- Writes the matches JSON that the admin page already loads. No change to live voting code.

**Ties**
- Old rule: higher seed wins, which no longer applies. Proposed: extend voting 24 hours, then a coin flip recorded at draw time.

**Card presentation**
- Titles that name the beat, an optional "Part 2 of 3" or "leads to…" line, and a link to the arc. Hide seed badges.

---

## 5. Landing page ideas

- **Episode rows:** create one YouTube playlist per episode when episode 2 starts (or episode 1 passes 12 to 15 moments). Add to `SITE_CONFIG.playlists`. No code needed.
- **Arc rows:** an arc is just a playlist in story order (leave `numbered` off and arrange it in YouTube Studio). Neutral, non-spoiler names. Try one arc, for example the explosion chain, before building more.
- **Story map / timeline page:** only worth building if the *connections* between moments (not just their order) prove compelling. Test with an arc row first. The Season 1 playlist already shows order.
- **Teaser card:** the "Coming soon: tournament" card is the place to link to anything new.

---

## 6. Migration to Arcane Moments (tournament site)

The scan found song-era wording across many files: about 119 string hits in `vote.js`, 113 in `stats.js`, 90 in `my-votes.js`, 66 hits in `about.html`. These counts include internal names, so the visible changes are fewer.

**Method:** one page and its own script at a time, each as a patch, checked in the Codespace before committing.

**Order**
1. A shared labels object in `arcane-config.js` (item, items, "this moment", and so on) so pages read their wording from one place.
2. `vote.html` + `vote.js`, then `matches`, then `my-votes`.
3. `brackets` and `live`.
4. `stats`, `profile`, `feed`, `activity`.
5. `about.html`, legal pages (`terms`, `privacy`, `disclosure`). These need proper rewriting. Read the legal text carefully (not a lawyer).

**Leave alone:** internal names, and the retiring files `homepage.js`, `music-gallery.js`, `init-firebase.js`.

---

## 7. Toast alerts and champion packs

Files read: `champion-packs/*.json`, `js/champion-loader.js`, `js/achievements.js`. Not yet read in detail: the 3,681-line `global-notifications.js`, which decides *when* a toast fires.

**How it works**
- A pack is a JSON file per champion: `alerts` (live-match toasts such as danger, nailbiter, winning, comeback, ally and rival streaks, round opening, match won/lost), `achievements` (a set of messages, details and buttons per achievement), a `theme` (colours, background) and a `buttonPrefix`.
- Each alert has voice lines with conditions (for example "vote difference of 50 or more") and `{momentTitle}`-style placeholders. The loader picks a random variation each time.
- The loader already supports the Arcane placeholders (`{momentTitle}`, `{opponentTitle}`, `{moment1}`, `{yourMoment}`...) and still accepts the old `{songTitle}` ones, so packs can be migrated gradually.
- **Packs available:** Jinx, Vi, Caitlyn (enabled in the manifest) and Lux (file exists, **not in the manifest**, and Lux is not an Arcane character). New users default to Jinx.

**The main finding: the packs and the achievements are out of sync**
- `achievements.js` has **32 achievements already rewritten for Arcane** (First Choice, Arcane Regular, Deep in the Story, Spark, Against the Grain, Signal Boost...).
- The packs still hold **49 old music-era achievements** (Opening Act, Encore, Pentakill, Chart-Topper, Headliner, World Tour, Music Historian...). Only 6 IDs match the new list: `unstoppable`, `rebel-heart`, `dark-horse`, `nail-biter`, `comeback-believer`, `night-owl`.
- So **26 of 32 achievements have no champion line in any pack.** The loader looks for the achievement ID, then a `default` entry. The three champion packs have no `default` entry, so they return nothing and the toast falls back to generic text. That is the `first-choice not found in pack` warning from the test vote.
- Roughly 40 to 49 music-themed words remain in each champion pack (song, music, headliner, chart, encore...). The `alerts` sections have already been partly migrated (the Jinx danger line uses `{momentTitle}`).

**Bug found (fixed in `champion-defaults.patch`)**
- `replacePlaceholders` in `champion-loader.js` never substituted `{xp}`, `{name}`, `{description}` or `{rarity}`, although the packs use them (for example "+{xp} XP"). Any achievement that did match a pack would have shown the braces literally. It was hidden because most achievements fell back to generic text.

**What this means**
- The champion voices are the most distinctive part of the site, and right now most achievement toasts do not use them.
- Fix order: (1) add a `default` achievement entry to each champion pack, as a quick safety net; (2) write the 26 missing achievements per champion, as lines in each character's voice (Jinx chaotic, Vi blunt, Caitlyn precise); (3) remove or rename the orphaned music-era entries; (4) decide whether Lux stays.
- That is about 26 x 3 champions of writing, with 3 to 4 variants each. It is a good job to do together in batches, one champion at a time.

**Ideas for later (not decided)**
- Arc-aware lines ("you backed the explosion"), using the arc tags once they exist.
- Lines that reference the voter's Season 1 episode progress.
- Additional Arcane-only companions (for example Ekko or Silco) in place of Lux.

---

## 8. Before the tournament goes public

- [ ] Reword visible "song" / "music video" text (section 6).
- [ ] Champion packs: add a `default` achievement entry, write the 26 missing achievements per champion, clean out music-era entries, decide on Lux (section 7).
- [ ] Clear test data: votes, activity, profiles, achievements, social feed posts, match counts. Test votes used up Founding Member slots (counter showed 2/1000).
- [ ] Reset the Founding Member counter. Consider lowering the cap (for example to 100) given the small audience.
- [ ] Fix `Fan-out error: Missing or insufficient permissions` (`fanOutToFollowers` in `social-feed.js`), a Firestore rules rejection.
- [ ] Silence the "Polling" console logs. Cosmetic: `H2H Record: undefined`, `Error getting unread count`.
- [ ] Remove public `fix-*`, `backfill-*`, test pages and `arcane-moments-fixes.patch` from the public site.
- [ ] Hosting split: tournament on its own Netlify site, hub stays put. Only the production deploy changes; local Netlify dev must keep working. Test on a deploy preview.
- [ ] Add the scene tags, write the draw script and decide bracket size.
- [ ] Run a few social head-to-head polls to gauge readiness.

---

## 9. Quick reference

- Repo: `anthemarena/anthem-arena`. Working branch `arcane-moments`. Merge to `main` through a pull request to go live. The repo is public.
- Playlists are fetched server-side by `netlify/functions/arcane-playlist.js` (the API key is not exposed). Playlist IDs and row config live in `js/arcane-home.js` (`SITE_CONFIG`).
- Voters are identified by a `userId` in localStorage (with anonymous Firebase auth). A private window is a fresh voter for testing.
- Tournament ID: `arcane-test-01` in `js/arcane-config.js`.
- Handy commands: `git status`, `git add -u`, `git commit -m "…"`, `git push`. Delete patch files after applying.
## Profile cup history (patch 1 of 2)

People who vote in more than one cup keep their history. Votes were never deleted: the profile used to hide votes whose match was not in the active cup's match list, so after a cup switch everything looked empty.

- `data/cups.json` lists the real cups (oldest first). Only listed cups count in history, so test cups are left out on purpose. **When you switch to a new cup, add it here** (`status: "active"`), and set the old one to `complete` with a `champion`. A test (`tools/test-cup-history-model.mjs`) fails if the active cup is missing.
- `/api/matches?tournament=<cupId>` returns a past cup's matches (id format checked; cached separately). Default is still the active cup.
- `js/cup-history-model.js` (pure, tested): per cup votes, participation, "picks that won"; lifetime votes, cups entered, average participation (a lifetime % would shrink every cup, so the average is used), pick accuracy.
- Profile > Journey tab shows lifetime totals and one collapsible row per cup (`js/cup-history.js`, `css/cup-history.css`).
- Still current-cup only by design: the Votes tab list and count, and the participation circle.
- Patch 2 (done, below): stats page cup selector + All cups tab.

## Stats: cup selector and All cups tab (patch 2 of 2)

- With two or more cups in `data/cups.json`, the stats header shows a cup picker (also `?cup=<id>`). Picking a finished cup shows its final numbers on every tab; its records are not links, because finished cups have no vote page. The live cup still refreshes every minute.
- New **All cups** tab: votes, cups and finished matches across every listed cup, a cup-by-cup table (votes, matches done, edits, champion) and the best records of all time (most voted match, closest finish, biggest landslide, biggest upset), each naming its cup.
- New record **Biggest upset** (also on the Records tab): the lowest seed to beat a higher seed, by seed gap. Random-draw cups have no seeds, so it is simply absent there.
- `compareCups()` in `js/stats-model.js`; a cup whose matches fail to load is listed as "Could not load", not fatal.
- Not included: unique voters per cup. That needs a count of distinct voters from the votes collection, which the match list cannot give. Add it with a small edge endpoint if wanted.

## Participation counts opened matches only

Profile participation (the circle, the round rows and Cup History) is measured against matches that have opened, not every match in the cup. With 384 group matches opening a group at a time, counting all of them left everyone at about 0% for weeks. Matches still `upcoming` are left out. Anything under 1% shows one decimal (0.3%) instead of a flat 0%. The group stage is one row named "Group stage".

## Match list no longer queries votes per match (429 fix)

On 16 Oct the site lost all its matches: `/api/matches` returned `Firebase error: 429 Too Many Requests`. The match list used to run one votes query per match (384 for a full group stage) on every cache refresh; Firestore rate-limited the burst and the pages showed "Match data not found".

- The list now reads the vote counters stored on each match document (every vote increments them in the same batch), so one list request replaces about 385. A single match (`?matchId=`) still counts its votes exactly.
- If Firestore refuses a request, the edge function retries 429/503 twice, then serves its last good copy (up to 10 minutes old, header `X-Cache: STALE`) instead of an error.
- Still heavy, worth fixing later: `/api/total-votes` (founding member threshold) reads every vote document each refresh. It should read the match counters or a single counter document. `/api/live-matches` queries votes per live match, which is fine while few matches are live.

## Edge functions now send the project key (second 429 fix)

After the counters fix `/api/matches` still answered 429 even though the day's reads (32k) were under the Spark cap of 50k. The edge functions called Firestore's REST API anonymously, and Google throttles anonymous calls per source address; Netlify's edge servers share addresses with many other sites. Every Firestore call in `firebase-cache.js`, `live-matches.js` and `profile.js` now goes through `fsFetch()`, which adds the project's web key so the call counts against this project. **The key is not in the code**: set the Netlify environment variable `FIREBASE_WEB_API_KEY` (Site configuration > Environment variables) to the `apiKey` value from `js/firebase-config.js`, then redeploy. Without the variable, calls go out without a key as before. (GitGuardian flagged the first version, which had the key hardcoded; a Firebase web key is public by design, but there is no reason to repeat it.) If the key is ever refused with 403 the call is repeated without it. Errors now include the first part of Firestore's reply, so a 500 says why (`RESOURCE_EXHAUSTED`, rules, key...). If 429 persists, read that text first.

## Firestore read budget (the real cause of the 429s)

The 429s were `RESOURCE_EXHAUSTED / Quota exceeded`: the Spark plan's 50,000 reads a day. The Firebase console's usage graph lags, so it under-reported. Firestore bills one read per document returned, and the edge functions were re-reading everything every 30 seconds. Fixes:

- **Match list** (`fetchMatchListCheaply` in `firebase-cache.js`): two queries. Opened matches (`status != upcoming`) are read fresh every 30 s; upcoming matches are cached for 10 minutes. A 384-match group stage with one group open costs about 24 reads per refresh instead of 384. A match that opens in between shows as opened (the fresh copy wins). A new cup's upcoming matches can take up to 10 minutes to appear. If the cheap query fails for a reason other than quota, the full list is read as before.
- **Total votes** (`/api/total-votes`): one COUNT aggregation (about 1 read per 1,000 votes) instead of reading every vote. It now counts the **active cup only**. Before, it counted votes in every cup including the test cups, so test votes counted towards the Founding Member 1,000. (An earlier note here said it was per cup; it was not.) It falls back to the old full read if the aggregation is unavailable.
- Both fall back to a stale copy (up to 10 minutes old) when Firestore answers 429.
- Still to watch: every page that calls `/api/matches` shares this budget; Blaze plan costs about $0.06 per 100,000 reads, so a budget alert of a few dollars is plenty.

## Feed sidebar widgets (cup-aware)
- **Tournament Progress** (`loadRoundProgress`): built by `js/participation-model.js` (`buildParticipation`), same rule as the profile: only matches that have opened count, stage by stage (Groups, R64…). The old hard-coded 29/16/8/4/2/1 bracket is gone.
- **Recent Activity**: reads the newest 40 `activity` docs, keeps only the current cup (`tournamentId` or `matchId` prefix), shows 5. Thumbnails come from `activity.songId` (the video id), no `music-videos.json` fetch.
- **Tournament Stats**: Total Votes = sum of match counters, Matches Live, Matches Completed. It no longer reads the whole `votes` collection (that was thousands of reads per visit and counted voters from test cups). "Active Voters" was removed; a per-cup unique-voters counter could bring it back.
- **Your Top Moment**: thumbnail from `videoId`, Arcane styling scoped to `#topSongWidget` in `css/arcane-theme.css`.
- Widgets share one matches fetch and one "my votes" query per page load.
- Avatars: new users get an Arcane champion (`getChampionImageUrl`, no 'Lee Sin'); `feed-page.js` handles `champion` avatars, encodes emoji SVGs, and swaps any failing avatar image for an emoji tile.
- Tests: `node tools/test-participation-model.mjs` (10).

## Feed mix, strips and filters
- **Automatic vote posts can't bury written posts** (`js/feed-mix-model.js`, `mixFeed`): in All Activity, written posts are never truncated by votes (votes are capped at 100 on their own), and runs of 4+ vote posts in a row collapse into one expandable digest row ("A, B and 7 others cast 9 votes"). New **Posts** tab = written posts only. The vote posts shown are still the 100 newest activity docs.
- **Posts index:** `getFeed('all')` in `js/social-feed.js` now asks for the newest 100 public posts (`where privacy == public`, `orderBy timestamp desc`). That needs a composite index on `posts` (privacy Ascending, timestamp Descending). Until it exists the query is refused and the code falls back to the old unordered read (console warning "posts index missing"). To create it: open the feed, copy the link from that Firestore error in the console (or Firebase console > Firestore > Indexes > Add: collection `posts`, fields privacy asc + timestamp desc), wait for Enabled.
- **Strips above the tabs** (`js/feed-strip-model.js`, `loadFeedStrips`): pinned announcement from `data/announcement.json` (`enabled`, `id`, `text`, `linkText`, `linkUrl`, `expires`; only `/path` or https links; a new `id` shows again for people who dismissed the old one), and "You haven't voted in N open matches · next closes in 2d 3h" linking to the soonest one (logged out: "N matches are open").
- Tests: `node tools/test-feed-mix-model.mjs` (12), `test-feed-strip-model.mjs` (15), `python3 tools/test-feed-digest-browser.py`.

## Share menu and Trending
- **Share** (`js/share-model.js`, `sharePost` in `js/feed-page.js`): the share button opens a menu: native share sheet (where the device has one), Copy link, Copy as message, X, Reddit, WhatsApp. A vote post shares `/vote?match=<id>` (so the recipient can vote); a written post shares `/feed.html?post=<id>`. Opening that link scrolls to the post, loads more of the feed if needed, and flashes it (old `#post-<id>` links work too).
- Not done: rich link previews. Every shared link shows the site's generic og-image; a per-match preview needs an edge function that renders the og tags for `/vote?match=...`.
- **Trending** (`rankTrending` in `js/feed-mix-model.js`): this week only, score = likes + 2 x comments, written posts and vote posts together. Vote posts are loaded by the shared `loadVotePosts()` helper (also used by All Activity).
- Tests: `node tools/test-share-model.mjs` (10), `test-feed-mix-model.mjs` (15), `python3 tools/test-feed-browser.py` (share menu, copy link, trending tab).

## Link previews for shared matches
- A shared `/vote?match=<id>` link now unfurls (Discord, X, Slack, WhatsApp, Facebook ...) with the match title, a description (cup, round, votes so far, time left) and a generated 1200x630 image: both edits' thumbnails, "VS", creators, vote count, status.
- `netlify/edge-functions/vote-meta.js` (paths `/vote`, `/vote.html`): ONLY for preview bots (user-agent list in `netlify/shared/og-model.js`) and only with `?match=`; it rewrites the title/description/og:*/twitter:* tags of vote.html using the cached `/api/matches` list. Real visitors are untouched. Any failure serves the normal page.
- `netlify/functions/og-match.js` (served at `/og/match.png?match=<id>`): fetches the match list and both YouTube thumbnails, draws with satori + resvg (`netlify/shared/og-card.js`), PNG cached 1h at the edge. Unknown match or any error: redirect to `/og-image.png`. Fonts: Inter 700/800 (OFL licence), embedded as base64 in `netlify/shared/og-fonts.js` (rebuild with `node tools/embed-og-fonts.mjs` from `netlify/functions/assets/*.woff`). They are embedded because reading the .woff files by path failed once Netlify bundled the function. Add `&debug=1` to the image URL to see the error text instead of the redirect to the default image. Emoji and non-Latin characters are dropped from names (the font has Latin only).
- New dependencies: `satori`, `@resvg/resvg-js` (package.json + package-lock.json; netlify.toml keeps resvg external and includes the font files).
- Fixed: the default og:image on about, brackets, matches and vote pointed to `/images/og-image.png`, which does not exist; the file is `/og-image.png`.
- Test: `node tools/test-og-preview.mjs [--save out.png]` (18 checks: helpers, the edge function, a real render, and the function handler end to end). The bundled function was also run standalone with esbuild to mimic Netlify's bundling. Not testable here: Netlify's bundling and the live YouTube thumbnail fetch, so check after deploy (below).
- To check after deploy: open `https://<site>/og/match.png?match=<a real match id>` in a browser (should show the card); paste a `/vote?match=` link into a Discord message; if a platform shows an old preview, re-scrape it (Facebook sharing debugger, X card validator) since they cache.

### Preview card styling (follow-up)
- `netlify/shared/og-card.js` uses the theme's own values (`--bg #06070e`, `--pink`, `--pink-bright`, `--card`, `--border`, `--radius 22px`, text `#f6f3f7` / muted `#b7b2bc`, the pink glows of the page background). It cannot load `arcane-theme.css` (satori draws from a small CSS subset), so if the theme colours change, update the constants at the top of that file. The cover image is deliberately not used as a backdrop (3 MB, and its logo sits mid-picture).
- YouTube thumbnails of vertical videos come with black bars. `contentRect()` (jpeg-js) measures the picture inside the bars and the card scales it to fill the frame; a thumbnail without bars, or a black/unreadable one, is shown whole. `jpeg-js` moved from devDependencies to dependencies.

### Preview image speed (do not add shadows)
- The first live version took 13 s (Netlify log: "Duration: 13124 ms"), so X's crawler gave up and showed the default logo. Cause: CSS `box-shadow` becomes an SVG blur filter and resvg needs ~5-6 s per card for it. Fixed by dropping the panel shadows and drawing the VS glow as a radial gradient: render ~0.45 s locally. `loadSystemFonts: false` is also set (satori already turns text into paths).
- Rule for `netlify/shared/og-card.js`: no `box-shadow`, `filter` or blur. `node tools/test-og-preview.mjs` fails if the SVG has a `<filter>` or a warm render takes over 1.5 s.
- Link-preview bots wait only a few seconds, so the first fetch also needs the match list and two YouTube thumbnails (3 s timeouts each, in parallel). If X still shows the logo, test with a new URL (`&v=2`: X caches cards per URL) and check the function Duration in Netlify's log.

### Who counts as a preview bot
`isPreviewBot` (netlify/shared/og-model.js) is true for the named bots, for any user-agent that looks automated (bot, crawl, preview, fetch, tumblr ...) and for any user-agent that does NOT start with "Mozilla/" (every real browser does; many link fetchers, e.g. Tumblr's, do not). To see exactly what a bot receives: PowerShell `curl.exe -A "Twitterbot/1.0" "https://<site>/vote.html?match=<id>"` and look at the og: / twitter: lines.

### Preview image cache (X)
X (and others) remember the preview image per address, including a failed fetch: while the image still took 13 s, X cached the logo for `/og/match.png?match=<id>`. The og:image address now carries `&v=<IMAGE_VERSION>` (`netlify/shared/og-model.js`); raise the number whenever a platform is stuck on an old image. Tumblr, which had never cached it, showed the card correctly.

## Emotes: sender hardening (notifications review, part 1)
- `sendEmoteReaction` (js/emote-system.js) built its document with whatever `matchData` it was given. Firestore refuses a document with an `undefined` field, so an emote whose match title or song title was missing failed silently ("Error sending emote" in the console, the sender saw a failure). It now sends only the fields that exist, cuts values to the lengths the security rules allow (message 200, type 30), refuses an unknown emote type instead of crashing, and falls back to the `username` key when `tournamentUsername` is not set.
- Test: `node tools/test-emote-send.mjs` (7 checks; the in-memory fake Firestore in tools/test-support now has addDoc/updateDoc/query helpers and refuses undefined fields like the real SDK).
- Still to check (needs the live site): the composite indexes the notification queries need (unread count, notification list, emote listener). Console snippet in the chat history; any failed-precondition error contains a create-index link.
- Note for testing as a normal visitor: the admin sign-in has a different Firebase user than the saved voter id, so notifications/emotes read as "permission denied" while signed in as admin. Test from a private window (visitor) instead.

## Notifications: ally / rival rows, rival emote, missed toasts
- Ally ("voted the same") and rival ("voted against you") notifications now look like their toast: the other voter's face with the active champion pack's portrait pinned to the corner (ring = green for ally, pack colour for rival), pack-coloured row via `data-from-champion`. Logic in `renderNotificationItem` (js/notification-center.js); `isSocialNotification` in js/notification-model.js.
- Rival button now sends a `rivalry` emote ("Challenge: …") instead of just opening the match; a small "View match" link sits next to the time. Ally button still sends `thanks`.
- Missed toasts: `getRecentUnshownNotifications` used a 4-filter query needing a composite index that was never built, so it failed silently and returning visitors never got the toast. It now queries by `userId` only and filters in code (`pickUnshown`). The "away at least 5 min" rule is now a 10 min look-back minimum. Still only fires when the last visit was over 2 min ago, once per browser session.
- Link previews (`vote-meta`) accept `?id=` as well as `?match=`.
- Test: `node tools/test-notification-model.mjs`.
- Live toast: `checkRecentVotes` saved ally/rival rows but never showed a toast while the page was open (only the on-return "missed" path did). It now shows one toast per check for votes from the last hour (page visible), with the emote button, and marks that row as shown.
- Grouped rows ("X voted in 2 matches"): the emote button looked up the notification by the joined id string, so it showed generic "Send Emote" and did nothing on click. It now uses the first id and clears every id in the group. "Show all matches" popup restyled to Arcane.
- Ally/rival only for votes cast AFTER yours: a vote that predates your own vote in that match is skipped (it used to fire a "just voted" rival line for someone who voted hours earlier). Compared with `userVotes[matchId].timestamp`.
- Compact notification rows: detail clamps to two lines, the "Show all N matches" button became an "All N matches" link beside the time, and ally rows get a green accent bar (`data-relationship`).
- Ally/rival rows: footer is time + link on one line with the action as a full-width bar below; the "All N matches" popup lists each match as a link with a "Same pick as you / Voted against you" tag instead of repeating the champion line.

## Notification preferences + relationship-aware grouping
- Settings modal > "🔔 Notifications" (stored per browser in localStorage: `notifyFrom` everyone|following|nobody, `toastFrom` everyone|following|off, `matchAlerts` true|false; js/notification-prefs.js). Defaults: everyone / everyone / on. They cover ally/rival vote alerts and the "you're behind / nailbiter / comeback" match alerts; likes, comments, follows and emotes are not filtered (emotes already have "Who can send you emotes").
- Follow lookup: `getFollowingIds(userId)` in js/follow-system.js (one equality query on `follows.followerId`, no index, cached 5 min). `checkRecentVotes` skips (and remembers) votes the prefs exclude; a toast only shows for something that is also saved.
- Bell grouping (js/notification-model.js `groupNotifications` / `groupHeadline`): ally/rival from people you follow = one row per person ("Kai voted against you in 2 matches"); from strangers = one row per match ("3 people voted against you in <match>", names in the detail, button = View match). Other types group per person as before.
- Tests: `node tools/test-notification-prefs.mjs`.
- Ally/rival wording: the headline is now short and title-free ("FireReaper voted against you" / "voted with you", `socialHeadline`), Jinx's line is the detail, and the match is one muted ellipsised line ("in <title>"). Applied at render time, so rows saved earlier with the long pack headline are shown in the new form too. Crowd rows: "3 people voted against you" + names + match line.

## Ally / rival alerts: the "versus" design (toast + bell row)
- One design at two sizes, js/notification-visuals.js (all classes prefixed `nv-`; `.vs-circle` already exists on match pages): [their avatar] VS [your avatar] (= when they voted with you), headline with the voter's avatar in front of the name, Jinx (pack skin tile via `championBadgeUrl`) + her line, action button. Rival accent = pack colour, ally = green.
- Toast (`showBulletin`, branch for `relationship` ally/opponent): speech bubble for Jinx's line, full-width button (Challenge -> rivalry emote / Say thanks -> thanks emote); clicking the body opens the match (`window.openBulletinMatch`). No song titles or match name in the toast.
- Bell row (`socialRowHtml`, called from `renderNotificationItem`): same pieces, Jinx's portrait sits before her quoted line, no match line or chips; the whole row is clickable to the match, with the match title as a hover tooltip; a per-person group row opens its "All N matches" list instead; a stranger crowd row ("3 people voted against you") shows stacked avatars and no button.
- Avatars: `avatarSrc()` accepts a url, stored avatar object, JSON string or emoji; `buildSocialNotification` now stores a plain url (a raw object used to become "[object Object]"). Your own avatar comes from localStorage `avatar` (`viewerAvatarSrc`). Missing picture -> the initial letter shows instead.
- Group rows: dismiss/read now apply to every id in the group (they used to pass the joined id string).
- Test: `node tools/test-notification-visuals.mjs`.
- Avatars and edit pictures for ally/rival alerts (js/notification-social-context.js): saved notifications never kept the voter's avatar (`saveNotification` doesn't store `thumbnailUrl`, and the rules key list is fixed), so they are looked up when drawn - voter avatar from `profiles/{userId}` (cached), the two edits' pictures from the cached match list (`pickThumbs`: rival = their pick is the other edit, ally = the same one; your side from localStorage `userVotes[matchId].songId`). Each avatar carries its edit's picture as a small badge (theirs bottom-left, yours bottom-right). Someone with no picture gets a stable Arcane champion (`fallbackAvatarFor(name)`, same list new accounts pick from). Toasts fetch the same context just before showing (2.5-3 s cap, never blocks).
- Jinx on these alerts is now the pack icon (`championBadgeUrl`), not the dark Arcane skin tile, which was unreadable at small sizes.

## Notifications: VS pair shows the match's two edits

Ally/rival toasts and bell rows now show the match's two edit thumbnails as `[edit A] VS [edit B]`. Picks are ringed (theirs in the accent colour, yours in white, a shared pick in green) and the other edit is dimmed. The voter's avatar and yours sit on the outer edge of the edit each picked (the second tucks in beside the first when you both picked the same edit). Thumbnails come from the match data and your stored `userVotes` at render time (`matchEdits` in `js/notification-visuals.js`, lookups in `js/notification-social-context.js`). If the match or your vote cannot be found, it falls back to the avatar pair.

## Fewer Firestore reads

- Activity check for ally/rival alerts: every 60 s (was 30), skipped while the tab is hidden (the return-to-tab check catches up), and after a failed read it waits 5 minutes before trying again.
- Notification context lookups share one matches request per open bell; a failure is remembered for a minute instead of retried per row.
- The @mention user list (whole `profiles` collection) is saved in `localStorage` (`mentionUsersCache`, about 10 minutes) so each page load doesn't re-read it.

## Champion avatar urls repaired (`js/avatar-url.js`)

Some saved avatars point at `…/champion/Lee Sin.png` (display name, with a space). Data Dragon's file is `LeeSin.png`, so the picture 404ed and the site fell back to the 🎵 tile. `fixAvatarUrl` repairs these where avatars are drawn (nav, feed, widgets, profile, settings preview, notifications) and the nav rewrites the repaired url into `localStorage`. Other urls are returned unchanged.

## Taste match on profiles (`js/taste-match.js`)

On another person's profile, a card under the header reads "You and X agree on N of M matches" with a bar, a label (Kindred spirits 80%+, Similar taste 60%+, Mixed opinions 40%+, Natural rivals below; "Just getting started" under 3 shared matches) and two tabs: matches you voted differently in (default) and matches with the same pick, each linking to the match.

- Compares the matches both people voted in (`compareVotes`, pure and tested in `tools/test-taste-match.mjs`).
- Uses the shared, cached `fetchUserVotes` in `profile-page.js`: the profile's votes are already loaded, so the only extra read is your own vote list, once per page load.
- Hidden on your own profile, when you have no votes, and when you have no matches in common. Any failure just leaves the card hidden.
- Votes are publicly readable and the profile already lists them, so nothing new is exposed. The feed tag ("agrees with you" on vote posts) is not built yet.

### Taste match: labels and layout (polish)

Labels (`tasteTier` in `js/taste-match.js`). Fewer than 3 shared matches: neutral "N matches in common", no percent, no bar. From 3 shared:

| Agreement | Label | Colour |
|---|---|---|
| 100% (5+ shared) | Soul mates | green |
| 90-100% | Kindred spirits | green |
| 75-89% | Same wavelength | green |
| 60-74% | Similar taste | green |
| 40-59% | Split decision | amber |
| 25-39% | Different tastes | pink |
| 1-24% | Rivals | pink |
| 0% (5+ shared) | Arch-rivals | pink |

Rows show the two edit thumbnails and titles in aligned columns with a VS between (your pick white, theirs pink, shared green); the first 3 rows show with "Show all N" to expand.

### Edit thumbnails: one shared lookup (`js/song-thumb.js`)

Match song objects don't reliably carry the YouTube id under `videoId`. `songThumb(song, lookup?)` tries `videoId`, then `id` (only a real 11-character YouTube id counts), then the music list (id/seed → video, profile page only), then a ready-made `thumbnail` url. Used by the taste-match rows and the notification VS pair.

### Settings: notification section fixes

The Match alerts switch was missing the `toggle-input` class, so the browser's native checkbox showed beside the switch and the switch's on/off look didn't follow it. It now uses the same markup as the other switches. The Notifications section also got the same heading style, a one-line description ("saved on this browser") and emoji labels like the Privacy section.

### VS pair: no avatars on the thumbnails

With real thumbnails the round avatars on the pictures were cluttered (and the voter's face is already in the headline). The two edits now carry only the ring colours (their pick in the accent colour, yours in white, a shared pick green); no avatars and no labels.

### Toast polish

Ally/rival toast: avatar and name on one line with "voted against you" underneath (a long name ellipsises instead of wrapping the sentence), padding trimmed, Jinx portrait 62 -> 52 px, speech bubble and button a little tighter, and the close button is a small dark translucent circle instead of the white one. Bell rows are unchanged.

## New-follower notifications (champion style)

- **Social tab fix:** follows are saved as `new-follower`, but the Social tab only looked for `follow`, so they never appeared there. The tab now lists follows, likes, comments, mentions, replies and the ally/rival alerts (`isSocialTabItem` in `js/notification-model.js`).
- **Bell row** (`followRowHtml`): their avatar, "X followed you", a Jinx line (stable per row, `followQuip`) and one button: "Follow back" (follows them from the bell, then shows "✓ Following") or "View profile" if you already follow them. The whole row opens their profile.
- **Toast** (`followToastHtml`): their face, name, "followed you", Jinx's line, the same button on the bar. Only while the tab is visible, and it follows the existing "Pop-up alerts" setting (everyone / people I follow / off).
- **Live listener** (`setupFollowListener` in `js/global-notifications.js`): `onSnapshot` on this user's own unshown `new-follower` rows (equality filters only, no composite index needed). New rows wait in a pending list while the tab is hidden (a background window used to consume the row and skip the toast); when the tab is visible they are marked shown and the newest one under 2 hours old may pop up; older ones just wait in the bell. The console logs each decision (`👂 New-follower listener active`, hidden/waiting, too old, skipped by setting). New-follower rows are excluded from the "missed while away" toasts so they are not shown twice.
- **Follow back:** `followUser` checks whether the other person already follows you; if so the notification message is "X followed you back" (no rules change needed). The row/toast then say "followed you back", use their own Jinx lines (`FOLLOW_BACK_QUIPS`) and always show "View profile".

## Like / comment / reply / mention notifications (champion style)

- **One card for four kinds** (`contentRowHtml` / `contentToastHtml` in `js/notification-visuals.js`): face (stacked faces for a crowd), a small kind icon (❤️ 💬 ↩️ 📢) + "who + action", the words that were liked or written (2-line quote, escaped), and one button that opens the post ("View post / comment / reply").
- **Grouping is per post and kind** (`groupNotifications`, `groupKind: 'content'`): "Kai liked your post", "Kai and Rex liked your post", "3 people liked your post" (names listed under it), "Kai commented 2 times on your post". The quote is the newest text. Previously these were grouped per person and a group was mislabelled "voted in N matches".
- **Wording helpers** (pure, tested in `tools/test-notification-model.mjs`): `contentHeadline`, `contentQuote`, `contentCta`, `mentionWhere` (post / comment / reply, read from the saved message).
- **Live toast** (`setupContentListeners` in `js/global-notifications.js`): one equality-only `onSnapshot` per kind on this user's own unshown rows. New rows are collected for ~2.5 s so a burst becomes one toast, and the most direct kind wins (reply > comment/mention > like). Nothing is marked shown until a visible tab handles it; older than 2 hours or blocked by the Pop-up alerts setting means bell only. For "only people I follow", a crowd counts if anyone in it is followed. These kinds are excluded from the "missed while away" path so they never show twice. Console lines: `👂 Like / comment / reply / mention listeners active`, hidden/waiting, too old, skipped by setting.
- **Feed links:** a notification link to a post while already on the feed only changes the `#hash`, so `feed-page.js` now also scrolls to the post on `hashchange`.
- **Vote posts (the automatic "X voted for A over B" feed items):** the owner is the voter (the post carries their `userId`). Likes and comments on them are saved with `eventType: 'vote'` and the alert says "X liked your pick" / "commented on your pick", quoting "A over B" (`votePostSummary` in `js/feed-page.js`), button "View pick". Fix: a comment on a vote post inside a collapsed "cast N votes" digest sent no alert, because the comment code looked the post up only among top-level feed items; `findPostById` (`js/feed-mix-model.js`) now also searches inside digests, and a warning is logged if a post still cannot be found. The reply icon is now 💬 (↩️ drew as a blue box on Windows).
- **STATUS: emotes are switched off** (`EMOTES_ENABLED = false` in `js/features.js`; see "Emotes switched off" below). The notes in this bullet describe the code that is still there for when they come back.
- **Emotes ("X challenged you / gave you props / sent you thanks / hype")** use the same card. `sendEmoteReaction` (`js/emote-system.js`) now also saves a `user-notifications` row (`type: 'emote-received'`, `eventType` = the emote kind, `shownAsToast: true`, only fields the rules allow) so the receiver keeps it in the bell (Social tab); the live emote listener still pops the toast, now drawn with `contentToastHtml` (their face, their message, "View match") instead of the old plain banner. The emote row is excluded from the content listeners (it is already shown). The old "View X's profile" second link on that toast is gone. Emotes sent before this change have no bell row. `deleteDoc` was added to the fake Firestore in `tools/test-support` so `notification-storage.js` can load in tests.
- Avatars come from `enrichSocial` / `socialContextFor` (profile lookup, cached); only ally/rival rows load the two edit pictures now.


## Emotes switched off (feature flag)

Emotes (Say thanks / Challenge between voters) felt too PvP, so they are off for now. One switch, `EMOTES_ENABLED` in `js/features.js` (currently `false`); nothing was deleted.

With it off:
- Ally / rival alerts ("X voted with / against you") stay, but their button is a plain "View match" (`withoutEmoteCta`, applied when the alert is built, in `showBulletin` and in the bell renderer, so alerts saved earlier are fixed too).
- `sendEmoteReaction` refuses to send, `setupRealtimeEmoteListener` does not start (no `user-reactions` reads), and received `emote-received` notifications are filtered out of `getUnreadNotifications` (hidden, not deleted).
- The "Who can send you emotes" privacy setting is hidden in the settings modal (the stored value is untouched).

To bring them back, set the flag to `true`. A possible future use mentioned: one user awarding another something (kudos), which would be a new design rather than the current preset messages.


## Mentions fix and profile tooltip

- **Mention alerts never worked** (post, comment or reply): `js/feed-page.js` called `saveNotification` directly but only imported it inside some helper functions, so each call threw a ReferenceError that the per-mention try/catch swallowed (console: "Error sending mention notification"). It is now imported at the top; `tools/test-feed-mix-model.mjs` checks the import stays.
- `extractMentions(text, users)` (in `js/feed-mix-model.js`, tested) replaces the inline loop: case-insensitive, each person once (`@kai @kai` no longer sends two alerts), unknown names ignored.
- `ensureMentionUsers`: the user list is cached for up to 10 minutes (the "fewer reads" change), so a user who joined since was invisible to mentions. If the text has an @name that is not in the list, it reloads the list once (at most once a minute) before sending alerts.
- **Tooltip** (`.mention-tooltip` in `css/feed.css`): it sits inside `.post-text`, which has `white-space: pre-wrap`, so the line breaks and indents in the tooltip's template rendered as big blank gaps (432px tall instead of ~139px); it also inherited the mention's hover underline. Now `white-space: normal`, no underline, and restyled to the pink card look (name in white, rank in pink, pink stats).
- Own-account tooltip stats: the saved `stats` object could say Level 1 / 0 votes for a Level 5 user; level and rank now come from `getUserRank(getUserXPFromStorage())` (same as the nav bar) and votes from the larger of the synced profile, saved votes and stats. Other people's tooltips still show what their profile document last synced (updated after each of their votes).

- **Vote count in tooltips (follow-up):** other people's tooltips showed 0 votes for someone with 3. The synced profile's `totalVotes` was written from the saved `stats.votes` number, which lags. `localVoteCount()` (`js/rank-system.js`, tested in `tools/test-profile-votes.mjs`) now uses the larger of that and the saved votes; `syncProfileStatsToFirestore` uses it, and when the feed loads the user list it refreshes your own profile once in the background if the synced level or votes are out of date. Other people's tooltips correct themselves the next time that person votes or opens the feed.

## Bell card squashed + double posting (fix)
- **Bell card tall/truncated:** the bell rows used bare class names (`comment`, `follow`, `content`) that `feed.css` also styles (`.comment{display:flex…}`), so on the feed page the card was squashed. Rows now use prefixed classes only (`nv-follow-row`, `nv-content-row nv-kind-<type>`). Test guards against bare names.
- **Deleted post "came back":** the Post button had its click handler registered twice, so one click created two identical posts; deleting one left the other. Removed the duplicate handler and added an in-flight guard (`postingNow`, reset in `finally`). Existing duplicates must be deleted one by one.

## Tooltip votes still 0 for another account (fix)
Tooltips for other people read their saved profile. The refresh of our own profile only ran when the user list was freshly loaded, so a cached list skipped it and the profile stayed at 0 votes. The feed now calls `publishOwnProfileStats()` on every load; it syncs only when votes/XP changed since last published (`profileStatsPublished` in localStorage) and clears the mention cache afterwards.

## Tooltip vote count = saved votes (fix)
The saved profile vote count now comes from the votes stored in Firestore, counting only votes whose match still exists (`countLiveVotes`, same rule as the profile page). Previously it used this browser's copy, which included a vote from a deleted test match (3 vs 2 on the profile page). `profileStatsPublished` key bumped to `v2|…` so every account re-publishes once.

## New visitors stuck as Anonymous (fix) — js/profile-bootstrap.js
A first-time visitor got a made-up id (IP + fingerprint), but the security rules only allow writing `profiles/{firebase uid}`, so the profile save was refused: the account stayed "Anonymous", had no avatar and could not post. Now `waitForAuthUid` waits for the anonymous sign-in and `ensureOwnProfile` creates/restores the profile for that uid. The vote page uses it for first-time visitors and whenever there is no usable name; the feed runs `repairMissingProfile()` on load, so an account already stuck as Anonymous is repaired by opening the feed.

## Pop-ups: splash backdrop + champion bubble
`.versus-toast` pop-ups (ally/rival, follow, like/comment/reply/mention, achievement) now sit on the champion's splash art (`--nv-splash`, `toastSplashUrl(pack)`), darkened toward the bottom, and the champion's line uses the vote-modal bubble look (`bubbleHtml`). Achievements use the same family (`achievementToastHtml`: icon, ACHIEVEMENT UNLOCKED, name, XP/rarity chips, champion line, button). Bell rows keep the plain card (repeating art on every row was too busy). Other bulletin types (level-up, danger, etc.) still use the older layout.

## Pop-up backdrop for like/comment alerts
Like / comment / reply / mention pop-ups have no champion speaking, so their backdrop is the viewer's own profile banner (`profileSplashUrl`: chosen champion, "auto" = the avatar's champion, default gradient → cup champion). Pop-ups with a champion bubble keep the champion's splash. Overlay lightened so the art shows through.

Update: like/comment/reply/mention pop-ups now use the splash of the sender's own champion avatar (`splashFromAvatarSrc`, read from the avatar picture's address, no extra database read); no champion avatar → the viewer's profile banner → cup champion.

Fix: achievement pop-ups still showed the old layout because an older `type === 'achievement'` branch in `showBulletin` ran first and the new one was unreachable. The old branch is removed; `tools/test-achievement-toast.mjs` guards that only one remains.

## Bell panel: Clear all, tabs, achievements
- "Clear Old" only dismissed notifications older than 48 h, but the panel lists the last 72 h, so it nearly always said "Nothing to Clear". It is now **Clear all**: dismisses everything in the tab you are on (second tap to confirm; not for Messages).
- The five tabs overflowed the panel on desktop (Achievements cut off, Messages hidden): tighter padding/font in arcane-theme.css.
- Unlocking an achievement now also saves a bell notification (`type: 'achievement'`, saved as already-toasted), so the Achievements tab is no longer empty. Achievements unlocked before this change are not back-filled.

## Live results hidden until you vote (feed + homepage)
- Feed vote posts showed the live percentage split and bar to everyone. For a **live** match you have not voted in (and that is not your own post) they now show a lock instead of the percentages, a "Vote in this match to see how it is going" line instead of the bar, and the button reads "Vote to see results". Ended matches show the result to everyone. `resultsVisible()` in feed-mix-model.js; the vote is read from the local `vote_<cup>_<match>` record like the sidebar cards.
- Homepage "Most voted edits" now counts **finished matches only** (an edit's total in a live match would reveal who is ahead); before any match has finished the section falls back to "Most watched edits".

## live.html merged into the homepage
- The open-matches block (round banner, champion line, "N matches need your vote", match cards, "Your votes") now lives in `index.html` under the hero (`<section id="vote">`), filled in by the unchanged `js/live.js`. The hero's "Vote now" jumps to it (`#vote`). `live.html` is deleted; `/live` and `/live.html` 301-redirect to `/` (netlify.toml). Links in music-gallery, about, stats, music-gallery.js and the "matches need your vote" alert now point to `/#vote`.
- On the homepage `live.js` skips the activity ticker and the mini activity feed (the Feed page does that job; saves reads and page length) and hides the whole block when nothing is live (the hero already says so).
- The "Match of the day" block was removed: the open matches are directly under the hero now. (`homeState().featured` still exists in home-model.js, unused.)
- The nav "Live" item was never this page (it opens activity.html) and is unchanged.
- tools/test-home-browser.py checks: Vote now → #vote, cards under the hero before "Latest results", cards show no vote results, no ticker/mini feed, block hidden when nothing is live.

## Fewer matches requests per page (usage)
`getAllMatches()` (js/api-client.js) is called many times while a page loads (the page, the notification system, widgets; the homepage now twice with the merged open matches). Each call was its own request to the server (the console showed repeated "Cache: MISS"). Calls within 8 seconds now share one request per tournament; `getAllMatches(true)` (admin, refresh) always goes to the server, and a failed request is not shared. `tools/test-api-client-share.mjs`.
Also fixed: the homepage drew as soon as the matches arrived, so "New edits" / "Most watched" stayed empty until the next 60 s refresh whenever the matches came back before `edits.json` (sharing the matches request made that the usual order). It now draws once both are loaded (`js/home.js`).

## CDN caching of the public API answers (Netlify usage)
Edge function responses are only cached by Netlify's CDN when the route opts in with `cache: "manual"` and the response has `Cache-Control` with `s-maxage` ([docs](https://docs.netlify.com/build/edge-functions/optional-configuration/)); a cached answer is served WITHOUT running the function. `netlify/edge-functions/firebase-cache.js` now has `cache: "manual"` in its config and `s-maxage` (30 s, the same as the existing `max-age`) on its public GET answers (matches, match, view-stats, total-votes, activity), so repeats within 30 s no longer invoke it. The `/api/track-view` POST sets no cache header and is never cached; `?_refresh=` (admin/refresh) uses a unique URL so it always reaches the function. Data can be up to 30 s old (as before, via the browser cache). **Verify after deploy:** `curl -sI https://arcanemoments.netlify.app/api/matches` twice; the second should show `cache-status: "Netlify Edge"; hit`. `total-votes` was already a COUNT aggregation (earlier fix); nothing more to do there.
Follow-up: "Messages" was still clipped on desktop after the tab padding change, so the bell tab icons are hidden everywhere (css/arcane-theme.css); the words stay.

## Direct messaging removed (18 Oct 2026)

Nobody knew it existed, so it is gone: `js/message-system.js`, the bell **Messages** tab, the message composer, the profile **Message** button, the sidebar Messages handler, the "Who Can Message You?" setting and `messagePrivacy` from new profiles, plus `saveMessageNotification` and the `canMessage` permission checks. The bell now has four tabs (All, Votes, Social, Achievements). The `messages` block was removed from `firestore.rules` (**deploy the rules**; with no rule, messages are denied). Old `messages` documents and `messagePrivacy` fields in Firestore are simply left unused. `tools/test-no-messaging.mjs` guards against it creeping back. Leftover: a `.message-item` rule in css/navigation.css is now unused.

## Bell vote rows: edit pictures after a slow match list (18 Oct 2026)

A "voted against you" row in the bell showed the two avatars instead of the two edit thumbnails (the toast showed the edits). The edit pictures come from the cached match list; `socialContextFor` gave up after 3 s and remembered the failure, so a slow list on a busy page left every row on avatars. Now the request keeps running after a caller gives up and fills the cache when it lands (`startMatchesFetch`), and the bell redraws once (`matchesLoaded`) if any vote row was missing its edits. A `console.debug` line ("social context: no edit pictures") shows matchId / your pick / whether matches were loaded if it still happens. "Voted with you" uses the same path.

## Alert timing tidy-up (18 Oct 2026)

How alerts arrive: follows, emotes, likes/comments/replies/mentions use live Firestore listeners (instant, Firestore reads only). Ally/rival vote alerts poll `/api/activity` every 60 s while the tab is visible. Your own match alerts (danger, nailbiter, comeback, round opening, "matches need your vote") poll every 2 min (5 min if you have no votes). Changes: the match-alert poll no longer runs in a hidden tab (it used to keep fetching in the background, which cost requests for toasts nobody could see), and when you return to a tab that was away for more than 30 s both checks run once after 1.5 s instead of waiting for the next tick. `tools/test-alert-timing.mjs` checks both. Not changed: the intervals themselves (shorter polling means more Netlify requests; revisit after the usage page has a few days of data). Idea if instant ally/rival alerts ever matter: the voter's browser writes a small notification row to the ally/rival, delivered by the existing listener (more Firestore writes, new rules).

## Jinx voice review, first pass (18 Oct 2026)

Voice sheets for Jinx, Vi and Caitlyn were drawn from a transcript of the show's dialogue (patterns only; no lines copied). Jinx's `alerts` (267 lines: danger, nailbiter, winning, comeback, ally/rival and streaks, closing reminders, no/low votes, round opening, match won/lost/tied, faction alerts, encouragement, welcome) were rewritten from the cartoon, all-caps voice to the show's dry, sarcastic one. Same triggers, same placeholders, same shape (a script checked that no placeholder was added and no section changed structure). Her achievements, bubble, modal and page lines were already in the quieter voice and were left alone. Full before/after list and the voice sheet: `docs/jinx-voice-review.md`. Notes: items 4 and 5 of the champion list (the `default` achievement and the missing achievement lines) appear to be done already in the Jinx pack (35 entries, including `default`); worth confirming the list is up to date. Next: the same pass for Vi and Caitlyn, then Lux decision, then check live-match alert triggers.

Button wording rule for match alerts (danger, nailbiter, winning, comeback): the viewer has already voted in that match, and the button only opens the match page (which has a Share section). So the labels must not say "vote" or "fix it"; for danger and nailbiter they now ask the viewer to rally others ("Rally some votes", "Call for backup", "Spread the word"). Apply the same rule to the Vi and Caitlyn packs when they are reviewed. Closing-time reminders and no/low-vote alerts are for matches the viewer has NOT voted in, so "Vote now" is right there.

## Share box on the vote page (18 Oct 2026)

- **What:** one share box (`js/share-box.js`): the champion's line for the moment (no text box to edit) plus X, Reddit, WhatsApp, Facebook, Copy link, "New line" (next wording) and, on phones with a share sheet, "Share…". Sharing sends that line plus the match link, and still earns the existing +5 XP (`trackShare`). Heading: "Share the match and rally support".
- **Three places:** the section at the bottom of `vote.html` (line shown as a quote), the post-vote modal (replaced the old three-button row; line shown as a quote under the modal's own champion line), and a slim share modal that opens by itself when an alert button brings a viewer who has voted to the match (`?share=1`). In the slim modal the champion's speech bubble IS the share line and "New line" swaps it; Esc or the cross closes it. Nothing opens for someone who has not voted.
- **Which wording:** `js/match-share.js` (pure, `tools/test-match-share.mjs`) picks a kind from the viewer's situation: `invite` (not voted: no numbers, because results stay hidden until you vote), `voted` (match finished), `early`, `tied`, `nailbiter`, `losing-close`, `losing-bad`, `winning-close`, `dominating` (same thresholds the post-vote modal already used). Lines live in `champion-packs/<id>.json` under `share` (3 per kind; Jinx written, other packs fall back to plain lines until their voice pass). Placeholders per kind are in `SHARE_VARS`; the test fails if a pack uses one a kind does not provide. Names have trailing punctuation dropped so the line can add its own.
- **Link:** `/vote?match=<id>&ref=share`, so the social preview card (`vote-meta`) still works and visits from shares can be counted later.
- **From alerts:** danger, nailbiter, winning and comeback alert buttons open the match with `&share=1`.
- **Old code removed / fixed:** the page had a delegated click handler for any `.twitter`, `.facebook`, `.reddit`, `.copy` button that opened a share with the old "League Music Tournament" wording. It is gone (it would have opened a second tab next to the new box). The post-vote share buttons also used that old wording and the "Losing close" modal buttons sent the "early" wording; both now come from the builder.
- **Tests:** `tools/test-vote-browser.py` checks the page box, the slim modal (opens, line in the bubble, New line, Esc, fits phone and desktop, does not open when not voted) and that X opens exactly one window with the line and tagged link. The achievement checks in that file were stale (old pop-up classes) and were updated.
- **Not built (ideas):** count shares (one write each), Vi/Caitlyn/Lux share lines, a "you arrived from a share" welcome line, letting people edit the text (removed on purpose: the champion's line is the point).

## Caitlyn voice pass (18 Oct 2026)

`champion-packs/caitlyn.json` rewritten end to end: every alert section (same conditions and counts, placeholders checked by script against the old pack and Jinx's), new `lowvotes` and `encouragement` alerts, all 35 achievements (incl. `default`, `level-up`, `founding-member`), and new `bubble`, `modal`, `pages` and `share` sections mirroring Jinx's keys. Voice: formal, precise, dry; no emoji, caps or nicknames. The button wording rule applies (danger/nailbiter/winning/comeback buttons ask the viewer to rally or review, never "vote"). Sample lines: `docs/caitlyn-voice-review.md`. Next: Vi, then Lux decision.

## Vi voice pass (18 Oct 2026)

`champion-packs/vi.json` rewritten the same way as Caitlyn's: all alert sections (same conditions, counts and placeholders, script-checked), all 35 achievements, `welcome.encouragement` (with a matching top-level `encouragement`, as Jinx and Caitlyn have), and new `bubble`, `modal`, `pages` and `share` sections. Voice: blunt, tough, loyal, short lines; no emoji, caps or nicknames. Button wording rule applied. The pack `description` was also reworded (it was the old brawler line). Sample lines: `docs/vi-voice-review.md`. Note: Caitlyn's `welcome` has no `encouragement` entry (only a top-level one); check which one the code reads when the live-match alert triggers are reviewed. Next: Lux decision.

## Faction alerts and Lux removed (18 Oct 2026)

The Team Jinx/Vi/Caitlyn faction idea (alerts spoken between champions rather than to the viewer) never took off and no live code read `factionAlerts`, so the section is removed from the Jinx, Vi and Caitlyn packs, along with the Faction block in `test-toasts.html`. `champion-packs/lux.json` is deleted (it was not in the manifest and Lux is not an Arcane character); `tools/test-champion-achievements.mjs` now checks Jinx, Vi and Caitlyn. Lux is still a normal avatar choice in profile/settings pickers (separate from the packs). Champions speak to the viewer directly.

## Leftover music wording, alert and page text (18 Oct 2026)

Champion packs (Jinx, Vi, Caitlyn) have no music wording left after the voice passes. This sweep fixed the rest of the visible text outside the packs: toast fallbacks in `js/global-notifications.js` ("music soulmates", "League Music Tournament" welcome, "favorite songs"), `champion-packs/default.json` welcome line, the vote page's stakes text ("these songs" is now "these edits"), fallback names and alt text in `js/vote.js` ("Unknown Song", "League of Legends Music Video", "Unknown Artist"), the My Votes headings ("Your Edits Coming Up", "Your Most Supported Edits", "Edit Journeys"), and the page title/meta in `matches.html` and `vote.html`. Not changed on purpose: internal names (`song1`, `songId`, CSS classes), code comments, console logs, `music-gallery.html` and the retiring files. Still to check later: `default.json` still holds old music-era achievement entries (`encore`, `chart-topper`); `about.html`, `legal/terms.html`, `stats.html`, `profile.html`, `admin.html` and `brackets.html` were not swept for visible wording.

## Full music-wording sweep (18 Oct 2026)

Second pass over everything a visitor can read, on top of the earlier toast/vote-page/My Votes fixes. Changed: fallback names ("Unknown Song" is now "Unknown edit"; "Song 1/2" is "Edit 1/2"; "a song" is "an edit"; artist fallback "Artist" is "Creator") in `activity.js`, `global-notifications.js`, `live.js`, `match-card-renderer.js`; the vote page's "Artist" label is now "Creator" and the remaining "these songs" in the tied-match text; My Votes badge/description text ("Edit Champion", "Edit Enthusiast", "Visual map of how far your edits have travelled") and music-note icons replaced by the film icon (also in `live.js` and `brackets.html`); profile bio placeholder; `admin.html` title and table headers; page title/comment text in `battleship.html`, `test-toasts.html`, `robots.txt` ("Anthem Arena" and "League Music Tournament" gone). `champion-packs/default.json`: removed seven music-era achievement entries nothing uses (`opening-act`, `encore`, `pentakill`, `chart-topper`, `hall-of-fame`, `hot-streak`, `legendary-streak`); the file is also re-saved in the standard JSON format, so its diff looks bigger than the change.

Left on purpose: internal names (`song1`, `songId`, CSS class names, comments, console logs), the trademark wording in the footer and terms pages (it says Riot owns the music), the real music in the Battleship game, and `music-gallery.html` plus the retiring files.

## Domain switched, Battleship removed (18 Oct 2026)

- **Domain:** canonical, `og:url`, `og:image` and JSON-LD URLs on `vote.html`, `about.html`, `brackets.html`, `matches.html`, the `Sitemap:` line in `robots.txt`, the default host in `netlify/shared/og-card.js` and the README now use `https://arcanemoments.netlify.app`. When a real domain is chosen, search and replace that address. `robots.txt` points at `/sitemap.xml`, but no sitemap file exists in the repo yet. The footer social links (`AnthemArena` handles on X, TikTok, Instagram, Facebook, Tumblr) are account names, not the domain, and were left alone.
- **Battleship ("Hextech Warfare") removed:** it was an old side game using League characters, and was dropped to stay clear of Riot's IP. Deleted: `battleship.html`, `css/battleship.css`, `js/battleship-ai.js`, `js/battleship-game.js`, `js/battleship-ui.js`, plus `js/music-manager.js` and `js/character-quotes.js` / `.json` (only the game used them). Removed the dead Battleship stats and match-history code in `js/profile-page.js`, the Battleship-only rules in `css/profile.css` (shared match-card rules were kept), the commented-out nav link, and the `battleship_matches` notes in `firestore.rules` (that collection stays locked by the catch-all rule; existing documents, if any, can be deleted in the Firebase console). No separate card game existed in the repo. The rank title "Hextech Adept" stays (rank title, not the game). Buy Me a Coffee widget id `anthemarena` went with `battleship.html`.
- **Test status:** all unit tests and all browser tests pass. Two browser tests were failing before this change and were fixed as test problems, not site bugs: `tools/test-live-browser.py` loaded `live.html`, which no longer exists (the open-matches block lives in `index.html`), so it now loads the home page and no longer checks the old hero ordering or the removed "Community Activity" mini feed; `tools/test-feed-browser.py` and `tools/test-feed-digest-browser.py` waited a fixed 4 s for the feed, which is now too short, so they wait for the vote post or digest row to appear (up to 20 s).

## Ally and rival alerts: View profile button (18 Oct 2026)

Decision: emotes stay off (`js/features.js`, code kept). Likes on vote posts and Follow already cover "thanks for voting the same", and an emote only lands if the other person has the tab open.

- **What changed:** while emotes are off, the button on an ally ("voted with you") or rival ("voted against you") alert is **View profile** and opens `/profile.html?user=<name>` (Follow and the taste profile live there). The alert itself still opens the match: in the toast, tapping the body (`openBulletinMatch`); in the bell, tapping the row. Done in `withoutEmoteCta` (`js/features.js`), so it also fixes alerts already saved in the bell (they are matched by type `live-activity` + relationship `ally` / `opponent`). The bell row button reads `ctaUrl` (`socialRowHtml`), the toast button is handled in `handleBulletinCTA`. The unused `secondaryCta` on these alerts was removed.
- **Pack button wording:** the `buttons` lists under `ally` and `rival` in the Jinx, Vi and Caitlyn packs are not shown while emotes are off (the label is fixed to "View profile" so it always says what it does). They would come back into use if emotes are switched on.
- **Tests:** `tools/test-emote-send.mjs`, `tools/test-notification-visuals.mjs`, new `tools/test-social-toast-browser.py` (button opens the profile, body opens the match, desktop and phone).
- **Check by hand:** an ally or rival whose profile is private or not yet created: see what the profile page shows when you tap View profile.

## Match-event alerts: new card design (18 Oct 2026)

The older generic pop-up (small thumbnail, message, detail, button) is replaced by one card, same family as the ally/rival, follow, content and achievement cards, for: **danger, nailbiter, winning, comeback, closing soon (24h/3h/final/several), no votes, low votes, round opening / new matches, match won / lost / tied**.

- **Card:** the match's two edit pictures with the viewer's pick ringed in the alert's colour and the other dimmed (a match nobody has voted in shows both evenly; round alerts have no pictures), a small tag line ("Your pick is behind", "Too close to call", "Round 3 is open"...), the champion's line in a bubble, the champion's detail line, chips (percentages for a voted match, number of new matches), one button. The whole card and the button both open the match; alerts about a match you already voted in (danger, nailbiter, winning, comeback) open it with the share panel in view. Pop-up: `eventToastHtml`; bell row: `eventRowHtml` (`js/notification-visuals.js`). Types, tags, colours, link and chip rules are in `js/notification-model.js` (`EVENT_KINDS`, `eventTag`, `eventUrl`, `eventChips`), so adding an alert type is one table entry.
- **Colours:** behind = red, nailbiter / closing = amber, winning / comeback / won = green, lost = soft red, tied = lilac, needs votes / round open = the champion pack's colour.
- **Pictures:** the toast appears at once and the two edit pictures are added a moment later once the match list is at hand (`eventContextFor` in `js/notification-social-context.js`); the bell looks them up with the other rows (`enrichSocial`).
- **Bug found and fixed on the way:** round-opening / new-matches alerts were being dropped by a safety check that wanted a match id, so they never showed (and, being the top-priority check, used up that tick). They are now allowed without a match. Also `danger-repeat` alerts had a button that did nothing; every event alert now opens its match.
- **Not changed yet (next):** welcome, encouragement, streak, trending / most viewed and level-up still use their older layouts.
- **Tests:** `tools/test-notification-model.mjs`, `tools/test-notification-visuals.mjs`, and `tools/test-social-toast-browser.py` (all 12 alert types, desktop and phone: tag, no old thumbnail, two pictures, fits on screen, button and card open the right page). The browser test takes about four minutes.

## Remaining alerts moved to the card design; trending / most-viewed removed (18 Oct 2026)

- **Now on the same card family:** welcome ("Welcome" / "Welcome back"), encouragement ("Still deciding?" or "Closing soon"), level up (big level number, tag "Level up", the champion's words, "View progress"), and streaks ("Mia has voted with you 10 matches in a row", the ally / rival look, button and card open the profile). Streaks also use that look in the bell (`isStreakNotification`, `streakView` in `js/notification-model.js`). With these, every pop-up and bell row uses one of the new designs (the old thumbnail layout is only left as a fallback for unknown alert types).
- **Encouragement now uses the champion's own lines** (`alerts.encouragement` in each pack). Before, the pop-up used hard-coded text and those pack lines were never shown. The "closing soon" variant (non-voters with matches about to close) keeps short plain wording.
- **Removed: "trending" and "most viewed" alerts.** They called `/api/view-stats` for every live match you had not voted in on each check (extra Netlify requests), needed 10 recent views or 30 total views to fire (rare at current traffic), and used fixed English text instead of the champion's voice. `/api/view-stats` is no longer called by the site (the edge function stays; `/api/track-view` still counts views).
- **Fixed on the way:** the streak pop-up button did nothing (it had no action). A welcome pop-up on the vote page (button "dismiss") only closes and does not reload the page.
- **Tests:** `tools/test-notification-model.mjs` (tags, streak view) and `tools/test-social-toast-browser.py` (welcome, welcome on the vote page, encouragement, level up, ally and rival streaks; desktop and phone).

## Match-event cards: symbol instead of heading

The small heading line on match-event pop-ups (e.g. "Your pick is behind") was hard to read over the splash art and mostly repeated the champion's line. It is gone. The state is now a symbol in the circle design: between the two edits (▼ behind, ▲ ahead, = too close or tied, ⇄ comeback, ✓ won, ✕ lost, ⏳ closing, ▶ round open, VS for plain), or alone in a ringed circle when there is no match to show (welcome 👋, encouragement 👀). The text moved to the picture's hover / screen-reader label, and the useful extras became chips (Round N, Last chance). Level-up keeps its number circle with a small ▲. The bell rows keep their bold title and use the same picture. Symbols live in `eventGlyph` (js/notification-model.js); the builder is `eventLeadHtml` (js/notification-visuals.js).

Follow-up to the symbol cards: perfect tie / nailbiter and tied-match results ring both edits the same colour (`both` in `EVENT_KINDS`); alerts about a match you may not have voted in (no votes, low votes, closing) show both edits evenly; round-opening and new-matches alerts add a short strip of the edits entering (`entrantsStrip` / `stripHtml`, built from the live matches of that round). The test page's sample alerts borrow the first real match and only pretend you voted for the alert types in `VOTED_KINDS`. Browser test: `tools/test-sample-toasts-browser.py`.

Second pass on the event cards: welcome (all four variants) and "still deciding?" now add the same strip of edits as round opening. A first visit shows every live edit; the others show only live matches the person has not voted in (urgent encouragement lists the soonest to close first); nothing shows if they have voted in everything. The second line under the champion's words is dropped (`quiet: true` in `EVENT_KINDS`) for match-state, round, welcome and encouragement alerts; the facts it carried became chips ("Behind by 15", "Ahead by 5", "1 vote apart"). Closing, no-votes, low-votes, level-up and achievements keep their detail line. The pack's detail lines are untouched, so any type can bring it back by removing its `quiet` flag.

Alerts with a strip of edits (round opening, new matches, welcome, still deciding) open the matches list (`/matches.html`), not a single match. On the matches page itself the button just closes the alert. `eventUrl` returns the list for these types, which also fixes old bell rows saved with `/vote.html`.

## Tie-breaker alert

New alert type `tiebreaker`: a live match that is exactly level (at least 10 votes in total, still open) and that you have not voted in. The champion's line comes from `tiebreaker` (or `tiebreaker-final` inside the last 3 hours) in each pack; the card rings both edits alike with "=" and a "Level at 24–24" chip, and the button opens the match to vote. Each step is announced once per match per device (`localStorage.tiebreakerShown`), and a tied open match is left out of the generic closing-soon alert. The selection logic is `tieBreakerCandidates` in `js/notification-model.js`; test-page buttons: Tie-breaker, Tie-breaker (last hours).

How a tie is settled when a match closes level: the admin close (`js/admin.js`) leaves a tied match live and the admin casts the deciding vote, then closes again. The champion lines deliberately do not mention this. The old "match tied" result alert is removed (code in `js/match-outcomes.js`, the `match-tied-alert` / `match-tied` pack entries, the test-page button): a match can no longer close level, so the admin's deciding vote leads to the usual won / lost alert. (`docs/*-voice-review.md` still list the old lines; they are history.)

## Welcome lines fix

The welcome alert asked the pack for `welcomeDialogs`, a section the Jinx, Vi and Caitlyn packs no longer have (their welcome lines are under `alerts.welcome`), so the real daily welcome found no lines and stayed silent for anyone on those packs. `js/champion-lines.js` (`dialogFor`, tested by `tools/test-champion-lines.mjs`) now looks in `welcomeDialogs`, then `alerts.welcome`, then `alerts.encouragement` for "still deciding?", and a pack with no streak / comeback welcome (the default pack) uses its "welcome back" lines. Vi's duplicate `alerts.welcome.encouragement` is removed. Not done: Vi and Caitlyn have no `portrait.skin` (Jinx uses skin 37), so their speech-bubble portrait is the base skin; add one per pack if you want a specific Arcane skin.

## Affiliate wording removed

The Amazon affiliate link is gone (footer link earlier, now also the "As an Amazon Associate" note, the footer's Affiliate Disclosure link, and `legal/disclosure.html`). Terms, Privacy and About no longer mention Amazon; Terms say Ko-fi donations are voluntary and give no say in votes or results. `/legal/disclosure` redirects to `/legal/terms` (netlify.toml). Money plan: donations first (Ko-fi); a supporter membership is a possible later step and, per Riot's General Policies, needs the product registered on the Developer Portal (see the notes on registration and monetization).
## Roadmap after the alert round (agreed 18 October 2026)

**Next round, in this order**
1. **Achievements and level-up audit.** Review the existing achievements, ranks and XP, and write an *unlock table* at the same time: which skin, banner or art unlocks at which level or achievement (rarer achievements, rarer art; everyone keeps free default looks; existing avatar choices are kept).
2. **Champion skin data.** A script writes a data file (champions, skin numbers and names, skipping chromas: entries with `parentSkin`), taking the newest build from `https://ddragon.leagueoflegends.com/api/versions.json`. One version constant replaces the three scattered ones (13.24.1, 14.1.1, 14.24.1; Data Dragon was at 16.20.1 on 18 Oct 2026). Splash and loading art are unversioned (`cdn/img/champion/splash/Vi_<num>.jpg`); only square icons are versioned. The tile path we use (`cdn/img/champion/tiles/`) is not in Riot's docs, so build the picker on splash. Also possible: Data Dragon profile icons as extra avatar options. Set `portrait.skin` for Vi and Caitlyn (Jinx uses 37).
3. **Skin picker and unlock cards.** Locked and unlocked states; the level-up and achievement cards show the unlocked art with an "Unlocked" chip.
4. **Past tournaments and gallery accolades.** Per-cup results files (`data/results/<cup>.json`: winner, finalists, bracket) plus `data/cups.json` and `/api/matches?tournament=<cupId>` feed a read-only "Past tournaments" page (champion and bracket per cup) and badges on gallery edits ("Jinx Cup 1 champion", "Finalist", Major qualifier).

**Money plan (phase in once there is steady traffic)**
- No ads and no affiliate links on the site today (affiliate wording removed). Donations stay on Ko-fi.
- **Now:** a supporters page and a supporter badge fed by a hand-kept list (`data/supporters.json`, opt-in names). No payments code.
- **Gate 1: register the product on the Riot Developer Portal.** Riot's General Policies: you may monetize "as long as your product is registered on the Developer Portal" (status Approved or Acknowledged); you must keep a free tier (which may include ads); subscriptions, donations and crowdfunding are allowed; charging for content must be transformative; no gouging, no gambling. Registration is encouraged even without the API. Reviewers want a complete site and look for player benefit. Ask Riot's support first (draft in this chat: free fan-made voting site, Data Dragon only, no Riot API, optional donations). Include the "not endorsed by Riot Games and doesn't reflect their views or opinions" wording.
- **Gate 2: a recoverable sign-in.** Votes use anonymous sign-in, so a paying supporter could lose their account by clearing the browser. Upgrade anonymous accounts to email or Google sign-in (Firebase keeps the same user ID), and update the privacy page.
- **Then:** Stripe subscriptions (about £3.99 a month idea): checkout with the account ID passed in, a Netlify function for the webhook, a supporter flag, automatic badge and supporters page; "no ads" only means something if ads are ever added (update the privacy page first). Ask an accountant about UK tax / VAT and consumer rules for recurring digital payments. Afterwards decide whether to keep Ko-fi for one-off tips.
- Do not sell Riot art or skins directly.

**Small leftovers**
- Generate `sitemap.xml` (`robots.txt` points at it).
- Deploy `firestore.rules` after merge.
- Clear test data before the first public cup (section 8).
- Optional cleanups: unused `.message-item` CSS, a redundant Firestore index entry, the own-vote tooltip count, old `battleship_matches` documents in Firestore.
- Voice-review sheets (`docs/*-voice-review.md`) still list removed lines (tied result, faction alerts); they are history.

## Arcane art in alerts (18 October 2026)
Toast backdrops and the champion's face in toasts and bell rows now use the pack's Arcane skin (`portrait.skin`): splash via `toastSplashUrl`, face via `championBadgeUrl` (tile `<Id>_<skin>.jpg`, plain icon when no skin is set). Jinx 37, Vi 29 (Arcane Undercity; Arcane Brawler is 48). Caitlyn 28 (Arcane Enforcer; Arcane Commander is 50). Change `portrait.skin` in a pack to switch the look everywhere.
