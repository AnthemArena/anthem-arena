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

**Proposed rules (to confirm):** bracket of 16 or 32; Jinx is the clear focus; public YouTube video that allows embedding; original (no re-uploads); one entry per creator; random draw; creator names hidden in early rounds to reduce follower-count bias; message creators before launch (they do not have to opt in, but notification drives sharing); keep the fan-project disclaimer and a visible takedown contact.

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
- **One master pool, many tournaments:** `data/edits.json` holds every edit (characters detected from titles and descriptions, a `tournaments` list per edit); each tournament is a selection from it. Tournament rules differ (Jinx cup: Jinx-focused; Major: any Arcane edit), but one entry per creator in each tournament.
- **Architecture:** Phase 1 put the tournament ID in `arcane-config.js`. Running several tournaments needs the ID chosen per page (URL parameter such as `?t=jinx-cup-1`, with the config value as the default). The Phase 1 groundwork makes that a contained change.
- **Scope:** "League of Legends / Arcane edits" widens it. Riot's fan content policy applies as well as the Arcane (Netflix / Fortiche) footage; keep the disclaimer and takedown contact.
- **Scale risk:** the Major needs a large audience and a large bracket (64 or 128, or play-ins). Start small; each cup builds the audience for the Major. Not committed to a timeline.
- **Importer (edits-tool/tools/edits-import.js):** generic. `data/edit-urls.txt` in, `data/edits.json` out; `--character Jinx` flags edits that never mention Jinx; characters auto-detected (Powder counted as Jinx); reruns keep tags, notes, short titles and tournament entries and refresh stats. Tested offline only.

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
11. `stats`, `profile`, `feed`, `activity`, then `about`, legal pages and blog. *(Me, with your review of the legal text)*

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
5. `about.html`, legal pages (`terms`, `privacy`, `disclosure`) and blog. These need proper rewriting. Read the legal text carefully (not a lawyer).

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