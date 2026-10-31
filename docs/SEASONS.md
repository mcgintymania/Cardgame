# Seasons, character style and future-proofing

## Seasonal takeovers (`lib/seasons.ts`)
Each season is one entry with its dates, colours, a decoration, a free gift, a hat for Lou the dealer and props some members swap in.

| Season | Dates | Gift | Lou wears |
|---|---|---|---|
| Christmas | 1–30 Dec | Santa hat | Santa hat |
| New Year | 31 Dec – 7 Jan | Champagne flute | Midnight top hat |
| Valentine's | 1–16 Feb | Box of chocolates | |
| St Patrick's | 12–19 Mar | Pint of stout | Green bowler |
| Easter | 10 days before Easter Sunday to 8 days after (worked out each year) | Daffodils | |
| Summer | 20 Jun – 31 Aug | Sunset cocktail | Panama hat |
| Halloween | 10 Oct – 7 Nov | Spooky lantern | Witch hat |

If two seasons ever overlap, the first one in the list wins.

When a season is on:
- The menus get its accent colour and a light decoration: snow, hearts, clover, petals, sun, leaves or sparks. It is hidden at the tables and stays still with reduced motion.
- Home shows a banner with the days left, a link to the seasonal shop and the free gift. The gift can be opened once per season each year; if you already own it you get 250 coins instead.
- The shop's Featured page leads with the season's bundles and items.
- Lou the dealer wears the season's hat, and about half the members swap their usual table prop for a seasonal one.

Seasonal items stay on sale all year, but the bundles only appear while the season is on. A calendar of every season is at the bottom of Featured.

**Settings › Look and seasons:**
- Seasonal events on/off.
- **Preview a season:** shows any season now, but you can't open its gift unless the season is really on.

**To add a season:** add one entry to `SEASONS`, plus its items (with `season: '<id>'`) and bundles in `catalogue.ts`. The tests check that every gift, hat, prop and bundle item exists.

**Online later:** serve this list from the server, so seasons can be added or moved without an app update. Gifts must also be claimed server-side.

## Character style
- **Lounge (default):** grown-up proportions (a smaller head and a leaner body), almond eyes with coloured irises, a modelled nose and lips, and soft light from the upper left on the face, body and limbs. The limbs are tapered and the hands are shaped.
- **Classic:** the original cartoon look.

You switch between them in Settings › Look and seasons. Both use the same wardrobe, so every item works in either.

`Look.eyeColor` is optional. Without it, the eye colour follows the hair colour.

## Future-proofing
- **Backup and restore (Settings › This device):** one JSON file with everything on the device (`{ app: 'card-club', format: 1, data }`). It's for moving between devices, and it's the route to bring local progress into an online account later.
- Seasons, bundles, boosts and cases are all data, ready to be served from the server.
- Save data is versioned (Look v2, `migrateLook`, `migrateClub`, and the backup `format`), so older saves keep loading.
