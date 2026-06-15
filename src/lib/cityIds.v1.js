// Frozen v1 city ID table for shareable itinerary links (?i=…).
//
// CONTRACT — read before editing:
//   • This array is APPEND-ONLY. The index of an entry IS its permanent city ID,
//     baked into every v1 share link ever generated.
//   • NEVER reorder, remove, or renumber entries. Doing so silently repoints
//     existing links to the wrong city.
//   • Add a new city by appending its slug to the END (it takes the next index).
//   • If a city's slug ever changes, keep the old slug here and add an alias in
//     decodeRouteCompact so old links still resolve. Do not edit the entry.
//   • `npm run check:ids` enforces this: every current city must appear here,
//     and the file must stay append-only relative to git history.
//
// Decoding is version-dispatched (the payload's first byte is the format
// version), so this table + the v1 decode path stay in the app forever, even if
// a future v2 format ships. See docs/itinerary-sharing.md.

/** @type {string[]} index → city slug. Append-only; never reorder or remove. */
export const CITY_IDS_V1 = [
  "chiang-mai", // 0
  "bangkok", // 1
  "hoi-an", // 2
  "da-nang", // 3
  "hanoi", // 4
  "bali-canggu-ubud", // 5
  "george-town-penang", // 6
  "siem-reap", // 7
  "tbilisi", // 8
  "krakow", // 9
  "budapest", // 10
  "sofia", // 11
  "belgrade", // 12
  "kotor", // 13
  "split", // 14
  "sarande", // 15
  "granada", // 16
  "seville", // 17
  "valencia", // 18
  "lisbon", // 19
  "lagos-algarve", // 20
  "catania-sicily", // 21
  "athens", // 22
  "chania-crete", // 23
  "mexico-city", // 24
  "oaxaca", // 25
  "merida", // 26
  "antigua", // 27
  "medellin", // 28
  "lake-atitlan-panajachel", // 29
  "buenos-aires", // 30
  "florianopolis", // 31
  "montevideo", // 32
  "cuenca", // 33
  "cusco", // 34
  "santiago", // 35
  "tirana", // 36
  "san-miguel-de-allende", // 37
  "ljubljana", // 38
  "porto", // 39
  "yerevan", // 40
  "puebla", // 41
  "ho-chi-minh-city", // 42
  "kuala-lumpur", // 43
  "da-lat", // 44
  "marrakech", // 45
  "istanbul", // 46
  "boquete", // 47
  "arequipa", // 48
  "taipei", // 49
  "cape-town", // 50
  "san-jose", // 51
  "paphos", // 52
  "barcelona", // 53
  "madrid", // 54
  "malaga", // 55
  "rome", // 56
  "florence", // 57
  "bologna", // 58
  "palermo", // 59
  "valletta", // 60
  "thessaloniki", // 61
  "funchal-madeira", // 62
  "las-palmas-gran-canaria", // 63
  "nice", // 64
  "prague", // 65
  "warsaw", // 66
  "vilnius", // 67
  "tallinn", // 68
  "riga", // 69
  "bucharest", // 70
  "cluj-napoca", // 71
  "bratislava", // 72
  "plovdiv", // 73
  "sarajevo", // 74
  "amsterdam", // 75
  "berlin", // 76
  "vienna", // 77
  "zurich", // 78
  "london", // 79
  "paris", // 80
  "dublin", // 81
  "copenhagen", // 82
  "stockholm", // 83
  "geneva", // 84
  "munich", // 85
  "helsinki", // 86
  "oslo", // 87
  "utrecht", // 88
  "the-hague", // 89
  "vancouver", // 90
  "melbourne", // 91
  "auckland", // 92
  "wellington", // 93
  "tokyo", // 94
  "osaka", // 95
  "nha-trang", // 96
  "ipoh", // 97
  "kuching", // 98
  "dumaguete", // 99
  "novi-sad", // 100
  "skopje", // 101
  "ohrid", // 102
  "brno", // 103
  "wroc-aw", // 104
  "gdansk", // 105
  "mendoza", // 106
  "salta", // 107
  "queretaro", // 108
  "guanajuato", // 109
  "joao-pessoa", // 110
];
