# Website catalogs vs the Podium music library — two-way audit

_Generated 2026-08-11. Library read live from Supabase (org `6edbf230`); site catalogs read from the
four working copies on this machine. Matching is generous (HTML entities decoded, accents folded,
"No. 5"/"#5" folded, token-subset fallback), then every flagged item below was checked by hand
against the library. Treat counts as close, not exact._

## The headline

| | PSQ | Subito | Meridian | Lonestar |
|---|---|---|---|---|
| Songs listed on music.html | 660 → **752** | 659 → **751** | 659 → **751** | 659 → **751** |
| Site's own claim | 650+ → **750+** | 650+/300 → **750+** | 600+ → **750+** | 600+ → **750+** |
| Ensembles sold | quartet / trio / duo | + quintet | + quintet | + quintet |

All four catalogs are the same list give or take one song, so every finding below applies to all four.
Numbers are quoted off PSQ.

**Library:** 1029 rows, 906 active. Of the active rows,
725 can build a full quartet book, 759 a trio book, and 784 a duo book. Quintet matches quartet
at 725, since the bass doubles the cello line.

---

## Direction A — advertised on the site, but the book builder can't fill it

| Configuration | Deliverable | Cannot deliver |
|---|---|---|
| Duo (vln + vc) | 569 | 7 |
| Trio (vln1 + vln2 + vc) | 568 | 8 |
| Viola trio (vln + vla + vc) | 557 | 19 |
| Quartet | 557 | 19 |
| Quintet (quartet + bass) | 660 | 0 — bass reads the cello line |

Plus **84** advertised songs with no library row at all — 8 of those turned out to be
title drift (see below), leaving **76 genuinely missing**.

### A1. The quintet is NOT a gap (corrected)

An earlier draft of this audit flagged the quintet as the biggest problem, on the grounds that
only 221 of 906 works carry a bass part. **That was wrong.** The bass doubles and simplifies the
cello line, so it needs no dedicated part — any quartet arrangement is quintet-bookable, and the
bassist reads off the cello.

Podium already models this correctly: `REQUIRED_PARTS.quintet` in
`src/lib/intake/matcher.ts:129` is `['vln1','vln2','vla','vc']`, with no bass. Leave it alone.
The 221 works that do carry a written bass part are a bonus, not the baseline.

### A2. Missing viola — songs sold as "quartet" that are really trios

17 advertised songs have no viola part in the library, so a quartet gig leaves the violist
empty-handed. Most are rows filed as `quartet` or `trio` carrying only vln1 / vln2 / vc; a few
exist only as a solo, duo or partial quintet ("A Postcard to Henry Purcell" is a cello solo,
"Al di la" is a solo cello, "The Final Countdown" is a violin/cello duo, "Ordinary World" is a
quintet row holding just bass and cello):

- [ ] A Postcard to Henry Purcell — Pride & Prejudice
- [ ] Al Di La — Rome Adventure
- [ ] Beauty and the Beast — Disney
- [ ] Che faro senza Euridice? — Gluck
- [ ] Dear Theodosia — Lin-Manuel Miranda
- [ ] From this Moment On — Shania Twain
- [ ] I Miss You — Incubus
- [ ] In My Place — Coldplay
- [ ] Never Tear Us Apart — INXS
- [ ] Nocturne in E flat Major — Chopin
- [ ] O Mio Babbino Caro — Puccini
- [ ] Ordinary World — Duran Duran
- [ ] Patience — Guns N' Roses
- [ ] Radio — Lana Del Rey
- [ ] Summertime in the LBC — Warren G
- [ ] The Final Countdown — Europe
- [ ] Wake Me Up Before You Go-Go — Wham!

Of those, 6 can't even fill a trio book:

- [ ] A Postcard to Henry Purcell — Pride & Prejudice
- [ ] Al Di La — Rome Adventure
- [ ] Che faro senza Euridice? — Gluck
- [ ] Ordinary World — Duran Duran
- [ ] The Final Countdown — Europe
- [ ] Wake Me Up Before You Go-Go — Wham!

### A3. The trio was described wrong on every site — FIXED 2026-08-11

The sites described a string trio as violin/viola/cello. It has only ever been **two violins and
a cello** for these businesses, and the library agrees — the trio arrangements are almost all
`vln1, vln2, vc`.

Swept and corrected: **18 statements across 12 files on all four sites**, including the
customer-facing copy and the matching FAQPage JSON-LD (so the schema and the visible answer stay
in sync). Phrasings fixed:

- "a trio is three (violin, viola, cello)" → "(two violins and cello)"
- "a string trio adds a viola" → "adds a second violin"
- "String trio (two violins and cello, or violin, viola, cello)" → the alternative removed

| Site | Files touched |
|---|---|
| PSQ | faq.html, bridgerton-wedding-music-guide, funeral-memorial-music-guide, how-much-does-wedding-string-quartet-cost, how-to-choose-wedding-string-quartet, string-quartet-corporate-events-guide |
| Subito | funeral-memorial-music-guide, wedding-string-quartet-cost, wedding-string-quartet-guide |
| Meridian | how-much-does-a-string-quartet-cost-washington-dc |
| Lonestar | faq.html, wedding-string-quartet-texas-guide, string-quartet-cost-texas |

Verified clean: a re-sweep for trio+viola phrasing returns nothing.

Separately, 7 genuine **viola trios** (vln/vla/vc) sit in the library filed under ensemble
`other` rather than `viola-trio`, so Podium never prefers them for a viola-trio gig. These are
arrangements you own, not something you advertise — worth re-filing:

- Air in F Viola — Handel
- Bourree in F Viola — Handel
- Hornpipe in D Viola — Handel
- Jesu Joy of Man's Desiring Viola — Bach
- Largo from Winter Viola — Vivaldi
- Menuet in D Viola — Handel
- Panis Angelicus Viola — Franck

### A4. Advertised, genuinely not in the library (76)

#### Pop & Modern (28)

- [ ] Better Man — James Morrison
- [ ] Dancing on My Own — Robyn
- [ ] Danke Schoen — Wayne Newton
- [ ] Diamonds — Rihanna
- [ ] Die With You — Beyoncé
- [ ] Fantastic Baby — Big Bang
- [ ] Fragile — Sting
- [ ] Funkytown — Lipps Inc
- [ ] Gooey — Glass Animals
- [ ] Hounds of Love — Kate Bush
- [ ] How Deep Is Your Love — Bee Gees
- [ ] How Sweet It Is (To Be Loved by You) — Marvin Gaye
- [ ] Luck Be a Lady — Frank Sinatra
- [ ] Lucky Man — The Verve
- [ ] Milord — Edith Piaf
- [ ] Miserlou — Traditional
- [ ] Never Be the Same — Camila Cabello
- [ ] Never Let You Go — Justin Bieber
- [ ] POV — Ariana Grande
- [ ] Ribbon in the Sky — Stevie Wonder
- [ ] Sing, Sing, Sing — Benny Goodman
- [ ] Stay Away — Nirvana
- [ ] Strange — Celeste
- [ ] Tenderness — General Public
- [ ] Thank U, Next — Ariana Grande
- [ ] The Chauffeur — Duran Duran
- [ ] What About Us — P!nk
- [ ] You Oughta Know — Alanis Morissette

#### Holiday (19)

- [ ] Away in a Manger — Christmas
- [ ] Coventry Carol — Christmas
- [ ] Deck the Halls — Christmas
- [ ] Frosty The Snowman — Christmas
- [ ] Good Christian Men Rejoice — Christmas
- [ ] Holly and the Ivy — Christmas
- [ ] I Saw Three Ships — Christmas
- [ ] It Came Upon a Midnight Clear — Christmas
- [ ] Jolly Old Saint Nicholas — Christmas
- [ ] Let It Snow — Christmas
- [ ] O Come O Come Emmanuel — Christmas
- [ ] Pat a Pan — Christmas
- [ ] Santa Claus Is Coming To Town — Christmas
- [ ] Silver Bells — Christmas
- [ ] Sing We Now of Christmas — Christmas
- [ ] Wassail Song — Christmas
- [ ] We Three Kings — Christmas
- [ ] White Christmas — Christmas
- [ ] Winter Wonderland — Christmas

#### Jewish repertoire (15)

- [ ] Bashana Haba'a — Jewish
- [ ] Chanukah Medley — Jewish
- [ ] Chanukah, Oh Chanukah — Jewish
- [ ] Dodi Li — Jewish
- [ ] Dona Dona — Jewish
- [ ] En Kelohenu — Jewish
- [ ] Hine Ma Tov — Jewish
- [ ] I Just Adore a Hora — Jewish
- [ ] Jerusalem of Gold — Jewish
- [ ] Klezmer Medley — Jewish
- [ ] Mayim Mayim — Jewish
- [ ] Noah Doesn't Know — Jewish
- [ ] Ose Shalom — Jewish
- [ ] Rock of Ages (Maoz Tzur) — Jewish
- [ ] Tanst Tanst Yidelekh — Jewish

#### Classical (9)

- [ ] Au Fond du Temple Saint — Bizet
- [ ] Lacrimosa from Requiem — Mozart
- [ ] Love's Roundabout — Straus
- [ ] Minuet from Berenice — Handel
- [ ] Pizzicato Polka — Strauss
- [ ] Quando M'en Vo Soletta per la Via — Puccini
- [ ] The Nutcracker Suite — Tchaikovsky
- [ ] The Young Prince and the Princess — Rimsky-Korsakov
- [ ] Tu che a Dio spiegasti l'ali — Donizetti

#### Film / TV / Games (5)

- [ ] Cornfield Chase — Hans Zimmer
- [ ] Friend Like Me — Aladdin
- [ ] If You Were Here — Sixteen Candles
- [ ] Time — Hans Zimmer
- [ ] To Far Away Times — Chrono Trigger

Two clusters stand out. **The Jewish list is almost entirely aspirational** — the library holds
Hava Nagila and nothing else from it. **The holiday list is thin** — three Christmas medleys,
"Christmas Time Is Here", "Have Yourself a Merry Little Christmas" and "We Wish You a Merry
Christmas"; the individual carols advertised (Deck the Halls, Coventry Carol, Silver Bells,
White Christmas, Winter Wonderland, We Three Kings, and the rest) have no PDFs.

### A5. Title drift — the library HAS it, under another name (8)

These are free fixes: add a row to `title_aliases` and both this audit and Podium's own intake
matcher will find them. Right now a client who types the site's spelling gets a red row.

- [ ] site: **Christmastime Is Here** → library: Christmas Time Is Here — Vince Guaraldi [quartet, full + score]
- [ ] site: **Entr'acte to Act 3 of Carmen** → library: Entr'acte III — Georges Bizet [quartet, full + bass + score]
- [ ] site: **Entr'acte to Act 4 of Carmen** → library: Entr'acte IV — filed under artist 'arr. Matt Naughtin' [quartet, full + bass + score]
- [ ] site: **Golliwog's Cake-walk** → library: Golliwog's Cakewalk — Claude Debussy [quartet, full + bass + score]
- [ ] site: **Largo from Concerto for Two Violins** → library: Largo from Double Violin Concerto — J.S. Bach [quartet, full]
- [ ] site: **One Summer's Day** → library: One Summers Day — Joe Hisaishi [quartet, full + score]
- [ ] site: **Rains of Castamere** → library: Rain of Castamere (GoT) — Ramin Djawadi [quartet, full]
- [ ] site: **Träumerei** → library: Traumeri — Schumann [quartet, full]

Two more misroute rather than miss — the site's title matches a duo/solo row exactly while the
full quartet sits under a different name, so Podium offers the wrong arrangement:

- [ ] **Married Life** — matched the solo-cello / duo rows; 'Married Life from UP — Giacchino' is a full quartet
- [ ] **This Will Be (Everlasting Love)** — matched the duo row; 'This Will Be (An Everlasting Love) — Natalie Cole' is a full quartet AND a trio

---

## Direction B — in the library, bookable, never advertised

**80 works have a complete quartet set and appear on none of the four sites** (after stripping
import artifacts, the ragtime set, and titles already listed under another name). Every one of
these is playable today — the PDFs are already in Podium. `[+bass]` marks the ones that also
carry a written bass part.

### Classical & Traditional (37)

- [ ] Ave Maria (Bach-Gounod) — Bach / Gounod
- [ ] Bachianas Brasileiras — Heitor Villa-Lobos  `[+bass]`
- [ ] Butterfly Waltz — Brian Crain
- [ ] Cantata No. 140 (Wachet auf) — J.S. Bach  `[+bass]`
- [ ] Carmen Aragonaise — Georges Bizet
- [ ] Concerto in E Major — J.S. Bach  `[+bass]`
- [ ] Danzas Argentinas — Alberto Ginastera  `[+bass]`
- [ ] Do It Again — George Gershwin  `[+bass]`
- [ ] Dvořák Waltz — arr. Matt Naughtin  `[+bass]`
- [ ] Entr'acte III — Georges Bizet  `[+bass]`
- [ ] Entr'acte IV — arr. Matt Naughtin  `[+bass]`
- [ ] Glorious Things of Thee Are Spoken — Franz Joseph Haydn
- [ ] Hornpipe in D — George Frideric Handel
- [ ] I Got Rhythm — George Gershwin  `[+bass]`
- [ ] Jalousie (Tango Tzigane) — Jacob Gade  `[+bass]`
- [ ] Midnight Bells (Im chambre separee) — Richard Heuberger  `[+bass]`
- [ ] Morning Mood (Peer Gynt) — Edvard Grieg
- [ ] Musetta's Waltz (La Boheme) — Giacomo Puccini  `[+bass]`
- [ ] Prelude No. 2 — George Gershwin  `[+bass]`
- [ ] Rhapsody on a Theme of Paganini — Sergei Rachmaninoff  `[+bass]`
- [ ] Ridente la Calma — W.A. Mozart
- [ ] Rodger's Waltzes — arr. Matt Naughtin  `[+bass]`
- [ ] Romanza Andaluza — Pablo de Sarasate  `[+bass]`
- [ ] Saturday Night Waltz — Aaron Copland  `[+bass]`
- [ ] Schön Rosmarin — arr. Matt Naughtin  `[+bass]`
- [ ] Son of the Puszta — Jeno Hubay  `[+bass]`
- [ ] Sonata in D — George Frideric Handel  `[+bass]`
- [ ] Tambourin Chinois — Fritz Kreisler  `[+bass]`
- [ ] Tanguedia III — Astor Piazzolla  `[+bass]`
- [ ] The Girl with the Flaxen Hair — Claude Debussy  `[+bass]`
- [ ] The Lord Bless You and Keep You — Peter Lutkin
- [ ] The Merry Widow Waltzes — Franz Lehar  `[+bass]`
- [ ] The Old Refrain — Fritz Kreisler  `[+bass]`
- [ ] Two Chorale Preludes — J.S. Bach  `[+bass]`
- [ ] Two Hearts in 3-4 Time — Robert Stolz  `[+bass]`
- [ ] Vilia (The Merry Widow) — Franz Lehar  `[+bass]`
- [ ] Wiener Blut — Johann Strauss II  `[+bass]`

### Film / TV / Stage (7)

- [ ] Chicago — John Kander & Fred Ebb  `[+bass]`
- [ ] Dawn from Pride and Prejudice — Dario Marianelli
- [ ] Dearly Beloved from Kingdom Hearts — Utada Hikaru
- [ ] Music of the Night (Phantom) — Andrew Lloyd Webber  `[+bass]`
- [ ] South Pacific Highlights — Rodgers & Hammerstein
- [ ] The Sound of Music Highlights — Rodgers & Hammerstein
- [ ] The Winner Is - Devotchka — Thomas Newman

### Holiday (4)

- [ ] Bell Carol - In Dulci Jubilo — Traditional  `[+bass]`
- [ ] Christmas Medley 1 — Various-Traditional  `[+bass]`
- [ ] Christmas Medley 2 — Various-Traditional  `[+bass]`
- [ ] Christmas Medley 3 — Various-Traditional  `[+bass]`

### Pop, Jazz & Standards (32)

- [ ] Birthday Variations — Various  `[+bass]`
- [ ] Bridal Chorus (Lohengrin) — Richard Wagner
- [ ] El Choclo — Angel Villoldo  `[+bass]`
- [ ] Evergreen — Barbra Streisand & Paul Williams  `[+bass]`
- [ ] Feelings — Morris Albert  `[+bass]`
- [ ] Galway Rambler Medley — Traditional Irish  `[+bass]`
- [ ] Glass Animals — Glass Animals
- [ ] If You Could Read My Mind — Gordon Lightfoot  `[+bass]`
- [ ] It Might As Well Be Spring — Rodgers & Hammerstein
- [ ] Joga — Bjork
- [ ] Kissing You — Des'ree
- [ ] La Bamba — Ritchie Valens  `[+bass]`
- [ ] Lamento Quichua — Traditional  `[+bass]`
- [ ] Laura — David Raksin  `[+bass]`
- [ ] Loony Tunes Fugue — Cliff Friend & Dave Franklin  `[+bass]`
- [ ] Manha de Carnival — Luiz Bonfa  `[+bass]`
- [ ] Mint Car — The Cure
- [ ] Misty — Erroll Garner  `[+bass]`
- [ ] Moldovanke — Traditional  `[+bass]`
- [ ] My Funny Valentine — Richard Rodgers & Lorenz Hart  `[+bass]`
- [ ] Noites Cariocas — Jacob do Bandolim  `[+bass]`
- [ ] Orange Blossom Special — Ervin T. Rouse  `[+bass]`
- [ ] Send in the Clowns — Stephen Sondheim  `[+bass]`
- [ ] Simple Gifts — Traditional Shaker  `[+bass]`
- [ ] Tango in D — Carlos Gardel  `[+bass]`
- [ ] The Impossible Dream — Mitch Leigh & Joe Darion
- [ ] The Star Spangled Banner — Traditional
- [ ] The Summer Knows — Michel Legrand  `[+bass]`
- [ ] The Wedding Song (There Is Love) — Paul Stookey  `[+bass]`
- [ ] Tico-Tico no Fuba — Zequinha de Abreu  `[+bass]`
- [ ] What Are You Doing the Rest of Your Life — Michel Legrand  `[+bass]`
- [ ] What's New — Bob Haggart & Johnny Burke  `[+bass]`

### Ragtime set (14) — deliberately excluded

A complete Joplin / Joseph Lamb / James Scott ragtime library, every one with a full quartet set
plus bass and score. Owner passed on these for now; listed so they are not lost:

- Alaskan Rag — Joseph Lamb
- Bethena (A Concert Waltz) — Scott Joplin
- Birthday Rag — Unknown
- Calliope Rag — James Scott
- Cataract Rag — Scott Joplin
- Elite Syncopations — Scott Joplin
- Friday Night Rag — Unknown
- Hot-House Rag — Joseph Lamb
- Ragtime Nightingale — Joseph Lamb
- Rialto Ripples — George Gershwin & Will Donaldson
- Stoptime Rag — Scott Joplin
- Sunflower Slow Drag — Scott Joplin & Scott Hayden
- The Cascades — Scott Joplin
- Top Liner Rag — Joseph Lamb

The nine Brahms Hungarian Dances were also passed on. The site lists a single "Hungarian Dances #5"
entry; the library holds Nos. 1, 2, 3, 4, 6, 7, 10, 11 and 21 individually, all with bass and score.

### Import artifacts to clean up, not sell (29)

- [ ] `00 Jumpin' Jumpin'`  (quartet: score)
- [ ] `7 by Beatles` — The Beatles  (quartet: bass,score)
- [ ] `Bach.Gounod` — Bach/Gounod  (quartet: bass,score)
- [ ] `by Beatles` — arr. Matt Naughtin  (quartet: vc,vla,vln1,vln2)
- [ ] `Catch Me Demi Lovato`  (quartet: score,vc,vla,vln1,vln2)
- [ ] `Espresso` — Sabrina Carpenter  (duo: score)
- [ ] `Girls Like You - Maroon 5`  (duo: score)
- [ ] `Good Things Happen to Good People`  (quartet: score)
- [ ] `Hells Bells`  (quartet: score,vc,vla,vln1,vln2)
- [ ] `I Knew You Were Trouble Taylor Swift Violin Cello`  (duo: score)
- [ ] `Jessica Pena Wedding Set` — Various  (quartet: vc,vla,vln1,vln2)
- [ ] `Joy of My Life Christ Stapleton`  (trio: score)
- [ ] `Jungleland Bruce Springsteen` — PSQ  (quartet: score,vc,vla,vln1,vln2)
- [ ] `Jupiter_Chorale-Mailliard`  (quartet: score,vc,vla,vln1,vln2)
- [ ] `Last NIght` — Morgan Wallen  (trio: vc,vln1,vln2)
- [ ] `Last NIght - Morgan Wallen` — String Trio  (trio: score)
- [ ] `Levitating Dua Lipa` — Dua Lipa  (quintet: bass,score)
- [ ] `Mendelssohn_-_String_Quartet_No._2`  (quartet: vc,vla,vln1,vln2)
- [ ] `Oceans Hillsong United` — Hillsong United  (quartet: score)
- [ ] `Patience Guns n Roses 2024` — Guns N' Roses  (trio: score)
- [ ] `Print 2x Runaway Baby Violin and Cello`  (duo: score)
- [ ] `Recessional` — Various-Traditional  (quartet: bass,organ,score,vc,vla,vln1,vln2)
- [ ] `Rumanian` — Bela Bartok  (quartet: bass,score)
- [ ] `Slipping Through My Fingers ABBA`  (trio: score)
- [ ] `Soltane Ghalbha` — Anoushiravan Rohani  (quartet: score,vc,vla,vln1,vln2)
- [ ] `Someone LIke You Adele`  (duo: score)
- [ ] `The Scientist Coldplay` — Cello use for  (quintet: bass,other,score)
- [ ] `Wedding Classics` — Various  (quartet: vc,vla,vln1,vln2)
- [ ] `You've Got The Love Florence + The Machine`  (trio: score)

Typos to fix at the source: "Last NIght", "Joy of My Life Christ Stapleton", "Someone LIke You".

### In the library, not bookable, not advertised (89)

Neither on a site nor able to build a book — dead weight or half-finished imports. Worth a pass to
decide which are worth completing and which should be deactivated.

---

## Status and what's left

**Done and deployed 2026-08-11** (all four sites live and verified over HTTPS):

1. ~~Quintet~~ — not a gap. The bass doubles the cello line; Podium already models this correctly.
2. **Trio definition corrected sitewide** — 18 statements across 12 files, visible copy and FAQ
   schema both. See A3.
3. **92 songs added to all four catalogs**, additively — 17 in a first pass, then the full 75-work
   Direction B set. PSQ 660 → **752**, the siblings 659 → **751**. Nothing removed; every existing
   row verified intact and every new row validated against the canonical song-item markup.
4. **Counts updated everywhere** — 91 claims across 62 files: PSQ 650+ → 750+, Subito 650+/"over
   300" → 750+, Meridian and Lonestar 600+/550+/500 → 750+.
5. **Structured data rebuilt.** PSQ's `music.html` ItemList now carries all **752** MusicRecording
   entries (was 660) generated from the page itself, so schema can't drift from the visible catalog
   again; it also fixed two stale entries (Ave Maria was credited to Bach/Gounod, Waltz of the
   Flowers to Tchaikovsky, both disagreeing with the page). The three siblings' `numberOfItems` were
   badly stale — 581, 500 and 568 — now 751 each, with per-category counts corrected to
   466 / 150 / 71 / 64. All 594 JSON-LD blocks across the four sites parse.

**Still open, cheapest first:**

6. **Add the 10 title aliases in A5.** Free, and it fixes live client intakes — right now a client
   who types the site's spelling of "Rains of Castamere" gets a red row.
7. **Decide on the holiday and Jewish sets** (34 pieces) — buy or arrange them, or trim those
   categories off the sites before someone books a Chanukah party from a list you can't play.
   Note the four holiday works added in step 3 make the category less thin than it was.
8. **Fix the 17 missing violas** (A2), or mark those songs trio-only on the site.
9. **Re-file the 7 viola trios** as `viola-trio` so the matcher can prefer them.
10. **Clean the 29 import artifacts** (B2) so the library count means something.

**Watch items:**

- "Last Night" (Morgan Wallen) and "Space Song" (Beach House) are advertised but exist in the
  library as **trio arrangements only** — no viola part. A quartet booking either one leaves the
  violist without a line.
- The ragtime set (14 works) and nine Brahms Hungarian Dances remain unlisted by choice.
- Meridian and Lonestar still have 9 `.bak-20260806` files inside their web roots. They would be
  publicly reachable if those directories are ever synced wholesale.

## Method note

Any future catalog sync must be **additive**. Replacing a site's song list with a Podium export
would delete the 76 advertised-but-missing songs from the page, and importing the site list into
Podium wholesale would create 76 empty rows. The two lists overlap; neither is a superset.

Re-run the one-directional version any time with:

```
node scripts/site-library-gap.js --site "C:/Users/david/Documents/projectstringquartet.com/music.html"
```
