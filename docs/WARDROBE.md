# Characters, wardrobe and shop

Everything here is cosmetic. Club coins are earned by playing and can't be bought: **there is no real money in Card Club, ever.** Until the online version is connected, coins, XP and items are saved on the device only and are labelled "Local mode".

## Characters
- Full-body SVG figures (`apps/web/src/design/Character.tsx`, viewBox 200×400). There is also a bust crop for round avatars.
- **Body**: 8 skin tones, 3 builds, 11 hair styles, 12 hair colours, 4 eyes, 3 brows, 4 mouths, 5 facial-hair options.
- **Wear slots**: hat, glasses, top, jacket, neckwear, pin, watch, trousers, shoes.
- **Poses**: stand, wave, thumbs up, clap, cheer, shrug, tip hat, facepalm, fist pump. They are animated, and the arms are posed with two-segment inverse kinematics.
- **Champion extras**: stars on the jacket sleeve for titles held, plus a title belt.
- **The club's members**: all 25 have their own full outfit, and each wears their signature piece.

## Economy (`lib/progress.ts`)
- **Starting out**: 300 coins plus a starter wardrobe. A new player picks one of 4 starter outfits.
- **Earning**: every table pays 10 coins, plus 8 for each player beaten. Bonuses:
  - first win of the day: +50
  - Cup final: +40
  - Cup won: +250
  - title won: +150
  - title defended: +100
- **Levels**: level n costs 100 + 40(n−1) XP.
- **Tiers**: Member (level 1), Regular (5), Gold (12), Black Card (20). Higher tiers open shop stock and level rewards.
- **Coin history**: every coin movement goes into a ledger, which you can view in the shop.

## Catalogue (`lib/catalogue.ts`, about 148 items)
- **Rarities**: common, rare, epic, legendary.
- **How items unlock**: starter, shop (price, sometimes needs a tier), level, signature, achievement.
- **Signature collection**: one piece per member. Beat that member 5 times in any game to win it. Signature pieces can't be bought.
- **Achievement items**: first win, win a Cup, win a title, become champion, 3 Cups, 3 defences, beat 10 different members.
- **Table cosmetics**: felt colour, rail wood, card backs, and the win celebration (confetti, chips, sparkle, fireworks).
- **Emotes**: you use them at the table, and members react to wins, knockouts and your emotes.

## Screens
- **Character creator**: two steps, first body then starter outfit.
- **Wardrobe**: a dressing-room mirror where you can try poses, with tabs for every slot. Save and undo are explicit.
- **Shop**: daily featured picks, clothing, accessories, your table, emotes and celebrations, the signature collection, and membership tiers.

## Shop & stash (inspired by Prominence Poker's shop, minus "Buy chips")
There is no way to buy coins or chips with real money, and there never will be. Everything below costs club coins earned by playing.
- **Sections:** Featured, Bundles, Boosts, Mystery cases, Table items, Emotes, Outfits, Headwear, Accessories, Tattoos, Signature collection, Membership. On phones they're tabs; on big screens they're a menu down the side.
- **Table props** (`slot: 'prop'`, drawn in `design/Props.tsx`): a drink or charm by your seat at every table. Members have their own (`MEMBER_PROPS` in `lib/look.ts`). You start with a cup of coffee; "None" is allowed.
- **Tattoos** (`slot: 'tattoo'`): forearm tattoos (left arm) show with short sleeves (tee, polo) and no jacket. Neck tattoos (swallow, stars) always show. The shop preview swaps to a tee so you can see them.
- **Halloween** (`season: 'halloween'`, featured 10 Oct to 7 Nov): witch, wizard and gnome hats, pumpkin felt, cobweb and starry backs, a lantern, pumpkin, cauldron and crystal ball. The items can be bought all year; the seasonal bundles only show in season.
- **Bundles:** a quarter off, and you only pay for the pieces you don't already own.
- **Boosts:** Double XP and a coin boost (+50%), for 1 or 12 hours. They run on the clock, and buying again adds time. The rings on Home show the time left.
- **Mystery cases:** a Club case (70/25/5/0) and a Gold case (30/45/20/5). The odds are always shown. A case never gives a duplicate: if you own everything of the rarity rolled, you get the nearest rarity you don't own. Rolls use crypto randomness.
- **Daily Cut:** 50, 75, 100, 125, 150, 200, then 300 coins over a seven-day run. Miss a day and it starts again.
- **Quick Play** (Home): a random shown multiplayer game with your saved rules and opponents picked for you.
- **Online later:** coins, boosts and case rolls must move to the server so they can't be edited in the browser.

## Online later
Wallets, ownership and purchases will move server-side, so the server validates buys and rewards. Results are reported by the authoritative game server, never by the browser.

## Tattoos (45 designs, `design/Tattoos.tsx`)
- Three places, worn together: **arm** (`tattoo`, left forearm; shows with short sleeves and no jacket), **neck** (`necktat`) and **hand** (`handtat`, back of the left hand). Neck and hand tattoos always show.
- Every design is drawn once, centred on (0, 0), and placed at a different size for each spot, so any design can be offered anywhere. Shop thumbnails show the design large on your own skin tone.
- Ink bundles: Fresh Ink, Old School, Gambler's Ink and Into the Wild. Royal flush (three Club Cups) and Crown (a title or a Cup) are earned, not bought.
- Old saves that had a neck tattoo in the arm slot are moved to the neck slot automatically.

## At the table
- **Quick phrases:** the ☺ button now has a Say tab ("Well played", "You were lucky", "Hurry up!" and more). Members sometimes answer, and they say the odd line when they win or get knocked out.
- **Seated players (big screens):** members sit in club chairs at the table, drawn to the waist, and their emotes play on the character. Their table prop sits on the felt in front of them, with a chip stack (poker, draw and blackjack) that grows with their stack. Phones keep the round portraits with a small prop badge.

## Earning items by playing (`EARN` in `lib/catalogue.ts`)
Most of the wardrobe is now earned at the tables. The shop keeps the basics (common clothes, felts and props), the seasonal items, bundles, boosts and cases. Every bundle contains only shop items, and a test checks this.
- **Games played (any game):** rewards at 3, 5, 10, 15, 20, 25, 40, 50, 75, 100, 150 and 200 games.
- **Wins (any game):** rewards at 5, 10, 15, 25, 40 and 50 wins.
- **Per game:** for each game, playing 10 and winning 5 and 20 each unlock an item. Solitaire has a reward for 10 wins and the Pyramid one for 5 wins.
- **Achievements (feats):** 22 moments in a game, each with a reward:
  - **Take 2:** rainbow hand (your last four cards are one of each suit), passing a skip on with an 8, stacking a 2 on a 2.
  - **Hearts:** shooting the moon, a hand with no points.
  - **Gin Rummy:** going gin, an undercut.
  - **Poker:** full house, four of a kind, royal flush, winning without a showdown after betting, winning after going all in.
  - **Blackjack:** a natural blackjack, a five-card Charlie, winning a double down.
  - **Solitaire:** a win, a win in under 3 minutes, winning the Daily Deal.
  - **Beat the Pyramid:** beating any pyramid, beating a 9-row pyramid.
  - **Across all games:** three wins in a row, playing every game at least once.
- Locked items show what to do and a progress bar. Feats pop up wherever you are. The Profile lists every achievement with its reward, plus games played, games won and your win streak.
- Club games are counted from the club record. Solitaire and Pyramid counts are kept in the wallet; older saves get theirs from their stats.

## Hair and beards (Lounge)
- New hair styles: mohawk and undercut. New facial hair: big beard.
- Hair and beards have a fine strand texture with highlights. Curly hair and afros get curls. Long hair gets falling strands. Stubble is drawn as fine dots. A slight rough edge stops hair looking cut out of card.
