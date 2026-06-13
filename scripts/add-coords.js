#!/usr/bin/env node
// Adds lat/lng to every city in travel-data.json.
// Coordinates are the city/area center; tourist-district centers used for
// metro areas where the draw is a specific neighborhood (e.g. Canggu/Ubud).

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../data/travel-data.json');

const COORDS = {
  'Chiang Mai':                  { lat: 18.7883, lng: 98.9853 },
  'Bangkok':                     { lat: 13.7563, lng: 100.5018 },
  'Hoi An':                      { lat: 15.8801, lng: 108.3380 },
  'Da Nang':                     { lat: 16.0544, lng: 108.2022 },
  'Hanoi':                       { lat: 21.0285, lng: 105.8542 },
  'Bali (Canggu/Ubud)':          { lat: -8.6478, lng: 115.1385 }, // midpoint Canggu–Ubud
  'George Town (Penang)':        { lat: 5.4141,  lng: 100.3288 },
  'Siem Reap':                   { lat: 13.3671, lng: 103.8448 },
  'Tbilisi':                     { lat: 41.6938, lng: 44.8015  },
  'Kraków':                      { lat: 50.0647, lng: 19.9450  },
  'Budapest':                    { lat: 47.4979, lng: 19.0402  },
  'Sofia':                       { lat: 42.6977, lng: 23.3219  },
  'Belgrade':                    { lat: 44.8176, lng: 20.4569  },
  'Kotor':                       { lat: 42.4247, lng: 18.7712  },
  'Split':                       { lat: 43.5081, lng: 16.4402  },
  'Sarandë':                     { lat: 39.8752, lng: 20.0038  },
  'Granada':                     { lat: 37.1773, lng: -3.5986  },
  'Seville':                     { lat: 37.3891, lng: -5.9845  },
  'Valencia':                    { lat: 39.4699, lng: -0.3763  },
  'Lisbon':                      { lat: 38.7169, lng: -9.1399  },
  'Lagos (Algarve)':             { lat: 37.1024, lng: -8.6748  },
  'Catania (Sicily)':            { lat: 37.5079, lng: 15.0830  },
  'Athens':                      { lat: 37.9838, lng: 23.7275  },
  'Chania (Crete)':              { lat: 35.5138, lng: 24.0180  },
  'Mexico City':                 { lat: 19.4326, lng: -99.1332 },
  'Oaxaca':                      { lat: 17.0732, lng: -96.7266 },
  'Mérida':                      { lat: 20.9674, lng: -89.5926 },
  'Antigua':                     { lat: 14.5586, lng: -90.7295 },
  'Medellín':                    { lat: 6.2442,  lng: -75.5812 },
  'Lake Atitlán (Panajachel)':   { lat: 14.7408, lng: -91.1555 },
  'Buenos Aires':                { lat: -34.6037, lng: -58.3816 },
  'Florianópolis':               { lat: -27.5954, lng: -48.5480 },
  'Montevideo':                  { lat: -34.9011, lng: -56.1645 },
  'Cuenca':                      { lat: -2.9001,  lng: -79.0059 },
  'Cusco':                       { lat: -13.5320, lng: -71.9675 },
  'Santiago':                    { lat: -33.4489, lng: -70.6693 },
  'Tirana':                      { lat: 41.3275, lng: 19.8187  },
  'San Miguel de Allende':       { lat: 20.9144, lng: -100.7452 },
  'Ljubljana':                   { lat: 46.0569, lng: 14.5058  },
  'Porto':                       { lat: 41.1579, lng: -8.6291  },
  'Yerevan':                     { lat: 40.1792, lng: 44.4991  },
  'Puebla':                      { lat: 19.0414, lng: -98.2063 },
  'Ho Chi Minh City':            { lat: 10.8231, lng: 106.6297 },
  'Kuala Lumpur':                { lat: 3.1390,  lng: 101.6869 },
  'Da Lat':                      { lat: 11.9404, lng: 108.4583 },
  'Marrakech':                   { lat: 31.6295, lng: -7.9811  },
  'Istanbul':                    { lat: 41.0082, lng: 28.9784  },
  'Boquete':                     { lat: 8.7781,  lng: -82.4415 },
  'Arequipa':                    { lat: -16.4090, lng: -71.5375 },
  'Taipei':                      { lat: 25.0330, lng: 121.5654 },
  'Cape Town':                   { lat: -33.9249, lng: 18.4241 },
  'San José':                    { lat: 9.9281,  lng: -84.0907 },
  'Paphos':                      { lat: 34.7754, lng: 32.4243  },
  'Barcelona':                   { lat: 41.3851, lng: 2.1734   },
  'Madrid':                      { lat: 40.4168, lng: -3.7038  },
  'Málaga':                      { lat: 36.7213, lng: -4.4213  },
  'Rome':                        { lat: 41.9028, lng: 12.4964  },
  'Florence':                    { lat: 43.7696, lng: 11.2558  },
  'Bologna':                     { lat: 44.4949, lng: 11.3426  },
  'Palermo':                     { lat: 38.1157, lng: 13.3615  },
  'Valletta':                    { lat: 35.8989, lng: 14.5146  },
  'Thessaloniki':                { lat: 40.6401, lng: 22.9444  },
  'Funchal (Madeira)':           { lat: 32.6669, lng: -16.9241 },
  'Las Palmas (Gran Canaria)':   { lat: 28.1235, lng: -15.4363 },
  'Nice':                        { lat: 43.7102, lng: 7.2620   },
  'Prague':                      { lat: 50.0755, lng: 14.4378  },
  'Warsaw':                      { lat: 52.2297, lng: 21.0122  },
  'Vilnius':                     { lat: 54.6872, lng: 25.2797  },
  'Tallinn':                     { lat: 59.4370, lng: 24.7536  },
  'Riga':                        { lat: 56.9496, lng: 24.1052  },
  'Bucharest':                   { lat: 44.4268, lng: 26.1025  },
  'Cluj-Napoca':                 { lat: 46.7712, lng: 23.6236  },
  'Bratislava':                  { lat: 48.1486, lng: 17.1077  },
  'Plovdiv':                     { lat: 42.1354, lng: 24.7453  },
  'Sarajevo':                    { lat: 43.8486, lng: 18.3564  },
  'Amsterdam':                   { lat: 52.3676, lng: 4.9041   },
  'Berlin':                      { lat: 52.5200, lng: 13.4050  },
  'Vienna':                      { lat: 48.2082, lng: 16.3738  },
  'Zurich':                      { lat: 47.3769, lng: 8.5417   },
  'London':                      { lat: 51.5074, lng: -0.1278  },
  'Paris':                       { lat: 48.8566, lng: 2.3522   },
  'Dublin':                      { lat: 53.3498, lng: -6.2603  },
  'Copenhagen':                  { lat: 55.6761, lng: 12.5683  },
  'Stockholm':                   { lat: 59.3293, lng: 18.0686  },
  'Geneva':                      { lat: 46.2044, lng: 6.1432   },
  'Munich':                      { lat: 48.1351, lng: 11.5820  },
  'Helsinki':                    { lat: 60.1699, lng: 24.9384  },
  'Oslo':                        { lat: 59.9139, lng: 10.7522  },
  'Utrecht':                     { lat: 52.0907, lng: 5.1214   },
  'The Hague':                   { lat: 52.0705, lng: 4.3007   },
  'Vancouver':                   { lat: 49.2827, lng: -123.1207 },
  'Melbourne':                   { lat: -37.8136, lng: 144.9631 },
  'Auckland':                    { lat: -36.8509, lng: 174.7645 },
  'Wellington':                  { lat: -41.2865, lng: 174.7762 },
  'Tokyo':                       { lat: 35.6762, lng: 139.6503 },
  'Osaka':                       { lat: 34.6937, lng: 135.5023 },
  'Nha Trang':                   { lat: 12.2388, lng: 109.1967 },
  'Ipoh':                        { lat: 4.5975,  lng: 101.0901 },
  'Kuching':                     { lat: 1.5497,  lng: 110.3433 },
  'Dumaguete':                   { lat: 9.3068,  lng: 123.3054 },
  'Novi Sad':                    { lat: 45.2671, lng: 19.8335  },
  'Skopje':                      { lat: 41.9981, lng: 21.4254  },
  'Ohrid':                       { lat: 41.1231, lng: 20.8016  },
  'Brno':                        { lat: 49.1951, lng: 16.6068  },
  'Wrocław':                     { lat: 51.1079, lng: 17.0385  },
  'Gdańsk':                      { lat: 54.3520, lng: 18.6466  },
  'Mendoza':                     { lat: -32.8908, lng: -68.8272 },
  'Salta':                       { lat: -24.7821, lng: -65.4232 },
  'Querétaro':                   { lat: 20.5888, lng: -100.3899 },
  'Guanajuato':                  { lat: 21.0190, lng: -101.2574 },
  'João Pessoa':                 { lat: -7.1195,  lng: -34.8450 },
};

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

let updated = 0;
let missing = [];

for (const city of data.cities) {
  const coords = COORDS[city.name];
  if (coords) {
    city.lat = coords.lat;
    city.lng = coords.lng;
    updated++;
  } else {
    missing.push(city.name);
  }
}

if (missing.length) {
  console.warn('No coords for:', missing.join(', '));
}

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
console.log(`Updated ${updated}/${data.cities.length} cities.`);
