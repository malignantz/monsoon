# Itinerary & city sharing

Every share feature puts everything needed to reconstruct the view **in the URL**:
no backend, no database, no link shortener. A link is self-contained and works
forever (subject to the durability contract below).

## City and comparison links — `?city=<key>`, `?compare=<a>,<b>`

The city sheet is deep-linked: `?city=lisbon&m=jun` opens Lisbon's sheet on June
over This month. The sheet's Share button emits exactly that (`cityShareUrl` in
[urlState.js](../src/lib/urlState.js)): the native share sheet on phones, a
clipboard copy elsewhere (`shareOrCopy` in [data.svelte.js](../src/lib/data.svelte.js)).
The comparison's Share button emits `?compare=lisbon,porto&m=jun` the same way
(`compareShareUrl`). Nothing to encode: the slugs *are* the payload. The other
browse params (`view`, `m`, `sort`, `layout`, `region`) are described in
[urlState.js](../src/lib/urlState.js) and the README.

## Itinerary links — `?i=<base64url>` (compact, the format we emit)

A My year route is an array of stays: `{ key, start, len }` — city slug, start month
(0–11), and length in months (1–12), with gaps allowed. We pack that into a tiny
versioned binary payload and base64url it.

### Wire format (v1)

A byte array, then base64url (no padding):

```
byte 0        : version = 1
byte 1, 2     : stop 0  →  [ cityId ] [ (start << 4) | (len - 1) ]
byte 3, 4     : stop 1  →  …
…
```

- **cityId** (1 byte, 0–255) indexes the frozen `CITY_IDS_V1` table.
- **start** (high nibble, 0–11) and **len − 1** (low nibble, 0–11) share one byte.
  Storing `start` explicitly means a route with gaps round-trips exactly.

So each stay is 2 bytes; a payload is `1 + 2·stops` bytes.

### Why it's this short

| stops | `?i=` (base64url) | readable `?route=` equivalent |
|-------|-------------------|-------------------------------|
| 4     | **12 chars**      | ~48–55 chars                  |
| 8     | **23 chars**      | ~110 chars                    |
| 12 (full year) | **34 chars** | ~165 chars                |

The worst case (every month a different city) is still ~34 chars.

### Encode / decode

`encodeRouteCompact(stays)` and `decodeRouteCompact(str)` live in
[data.svelte.js](../src/lib/data.svelte.js). base64url is done with `btoa`/`atob`
plus two character swaps, no dependency. Decoding runs every parsed stop through
`sanitizeStays`, which migrates renamed cities through `SLUG_ALIASES` and drops
unknown city IDs, out-of-range months, and stays whose months collide with one
already placed (so a stale or hand-mangled link can never render a broken board).
Stays whose city has no v1 ID are left out when encoding.

### Trip name — `&n=<name>`

An optional, decorative trip name rides alongside (`shareRoute` in
[MyYear.svelte](../src/lib/MyYear.svelte) adds it when the trip has a name). It is
read independently of the route and capped at 60 characters, so a missing or
malformed name never affects the itinerary.

## Durability — how a v1 link decodes *forever*

1. **Frozen ID table.** [cityIds.v1.js](../src/lib/cityIds.v1.js) is an
   **append-only** array: `index → slug`. The index *is* the permanent city ID baked
   into every link. New cities are appended (next free index); entries are **never
   reordered, renumbered, or removed**. Because the table — not the live
   `travel-data.json` order — is the source of truth, cities can be reordered or
   added without breaking an existing link. `npm run check:ids`
   ([scripts/check-city-ids.mjs](../scripts/check-city-ids.mjs)) enforces the
   contract: every current city has an ID, no duplicates, and the table stays
   append-only versus git HEAD.

2. **Version dispatch.** The payload's first byte is the format version. If the
   format ever needs to change, a **v2** ships under a new version byte; v1 links
   keep resolving against the frozen v1 table through the v1 decode path.

**City renames.** If a city's slug changes, leave its frozen entry untouched and add
`oldSlug → newSlug` to `SLUG_ALIASES` in `data.svelte.js`. The same aliases migrate
saved routes and favorites.

## Readable fallback — `?route=key~start~len_…`

`decodeRoute` still exists and `?route=` is still accepted on load
(`?i=` is tried first). It is not emitted by the UI; it is kept for debugging and
hand-authoring test links. `~` and `_` are URL-unreserved and never appear in a
slug, so it needs no percent-encoding.

## Landing experience

Opening a `?i=` or `?route=` link drops the visitor into **My year**
([App.svelte](../src/App.svelte) decodes it on load):

- **No saved year yet:** the shared route becomes their own year straight away
  (`adoptRoute(…, 'auto')` in [route.svelte.js](../src/lib/route.svelte.js)), saved
  to `localStorage`. A one-line banner says someone shared it and it is now their
  starting point, with **Keep it** and **Undo** (back to the empty board). The
  share params are stripped so a reload shows their year.
- **Already has a saved year:** a **read-only preview** (`sharedRoute` →
  `previewing` in [MyYear.svelte](../src/lib/MyYear.svelte)) that never silently
  overwrites theirs. The banner offers **Save a copy** (replaces their year, with an
  Undo banner until the first edit) or **Show my year**. Adding a city from a sheet
  during the preview goes to their own year; the toast says so and offers **Show my
  year**.

On resolve, `i`, `route` and `n` are dropped from the URL. A shared route carries
only the itinerary, not the sharer's lens or party size: it renders under the
*visitor's* settings. The itinerary is the shareable unit; the lens is personal.

My year's **Copy as text** includes the same `?i=` link at the end of the
plain-text itinerary.
