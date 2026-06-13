#!/usr/bin/env python3
"""Build data/safety-inputs-v3.json — the hand-set per-city inputs for Safety v3.

Each entry carries only the new hand-researched fields. The recompute script
(scripts/safety_v3.py) merges these with the World Bank country homicide baseline
(data/worldbank-homicide.json) and the existing advisory data in travel-data.json.

Defaults when a field is omitted:
  homicideOverride -> None (use country baseline; scope "country")
  touristMod       -> 1.0
  touristTags      -> []
  localLevel       -> existing safety.regionalLevel
  localArea        -> None

propertySub / womensSafety are REQUIRED for every city (0-100, higher = safer),
hand-set per the plan's rubrics (Gallup feel-safe anchor + city adjustment;
women's = gender-split anchor). No Numbeo numbers are used.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "safety-inputs-v3.json")

# Shorthand: P=propertySub, W=womensSafety, M=touristMod, T=tags,
# H=(rate, scope, source, url) override, LL=localLevel, LA=localArea,
# RN=touristRationale, PN=propertyNote, WN=womensSafetyNote
SD = "OSAC Crime & Safety Reports / U.S. State Dept guidance"

C = {}
def add(name, P, W, PN, WN, M=1.0, T=None, RN="", H=None, LL=None, LA=None):
    C[name] = dict(propertySub=P, womensSafety=W, propertyNote=PN, womensSafetyNote=WN,
                   touristMod=M, touristRationale=RN, touristTags=T or [])
    if H: C[name].update(homicideOverride=H[0], homicideScope=H[1], homicideSource=H[2], homicideUrl=H[3])
    if LL is not None: C[name]["localLevel"] = LL
    if LA is not None: C[name]["localArea"] = LA

# ---------------- MEXICO (reseeded from prototype; property now hand-set) ----------------
WB = "https://en.wikipedia.org/wiki/List_of_Mexican_states_by_homicides"
add("Mexico City", 45, 42, "Central boroughs (Roma, Condesa, Polanco) low theft; metro-wide petty crime", "Gallup MX women feel-safe low; central districts patrolled",
    M=1.08, T=["tourist-zones-safer","petty-theft","express-kidnapping-taxi"],
    RN="Central tourist boroughs far safer than the citywide figure; main visitor risks are petty theft and express kidnapping via unregulated taxis.",
    H=(10.0,"entity","CDMX SESNSP (~13/100k 2020, declining)",WB), LL=2)
add("Mérida", 80, 78, "Safest state capital; very low street theft", "Yucatán women report high safety",
    M=1.12, T=["very-low-crime","tourist-safe"], RN="Safest state capital in Mexico; violent crime against residents and visitors is rare.",
    H=(1.8,"city","Yucatán SESNSP 2024 (~1.8/100k)","https://yucatanmagazine.com/merida-has-lowest-crime-rate-mexico-safety/"), LL=1)
add("Oaxaca", 70, 64, "Calm colonial tourist core; modest petty theft", "Moderate; harassment less than border/coast",
    M=1.12, T=["tourist-zones-safer","violence-elsewhere-in-state"], RN="State violence is concentrated in the Isthmus and coast, not the capital; the tourist core is calm.",
    H=(15.0,"state","Oaxaca state SESNSP (19.5/100k 2020; capital lower)",WB), LL=2)
add("Puebla", 55, 50, "Well-policed historic center; petty theft + highway risk around", "Survey: many women report feeling unsafe citywide",
    M=1.08, T=["tourist-zones-safer","petty-theft","highway-caution"], RN="Historic center is well-policed; risks are petty theft and intercity-highway crime, not tourist-targeted violence.",
    H=(12.0,"state","Puebla state SESNSP (~13.7/100k 2020)",WB), LL=2)
add("San Miguel de Allende", 75, 68, "Walkable expat core, very low street theft", "Expat community reports feeling safe; statewide women's safety low",
    M=1.40, T=["intra-cartel","expat-haven","tourist-rarely-targeted"],
    RN="Guanajuato's Bajío cartel war is intra-criminal; SMA's large expat community sees little violent crime (0 homicides Oct 2025). Tourists rarely targeted.",
    H=(49.3,"city","SESNSP via Mexico News Daily, 50th most violent municipality, 12mo to Aug 2025","https://mexiconewsdaily.com/news/5-tourism-destinations-among-mexico-most-violent-municipalities/"), LL=3, LA="Guanajuato")

# ---------------- OTHER LATAM / S AMERICA ----------------
add("Antigua", 55, 50, "Tourist-friendly colonial town; petty theft and scams", "Moderate; tour with awareness",
    M=1.15, T=["tourist-zones-safer","violence-elsewhere-in-state","scams-common"],
    RN="Guatemala's violence is concentrated elsewhere; Antigua is a managed tourist town, though it sits under a national Level-3 advisory.",
    H=(7.0,"region","Sacatepéquez among Guatemala's safer departments (estimate)", None))
add("Lake Atitlán (Panajachel)", 55, 50, "Lakeside tourist villages; petty theft, occasional robbery", "Moderate",
    M=1.15, T=["tourist-zones-safer","violence-elsewhere-in-state"],
    RN="Sololá highlands are calmer than Guatemala's violent corridors; national Level-3 advisory still applies.",
    H=(6.0,"region","Sololá among Guatemala's safer departments (estimate)", None))
add("San José", 50, 48, "Notable petty theft, bag-snatching, scams in the capital", "Moderate; harassment reported",
    M=1.05, T=["petty-theft","scams-common"], RN="Costa Rica's tourism is well-managed; San José sees property crime more than tourist-targeted violence.",
    H=(12.0,"city","San José metro estimate (CR national 17.8/100k 2023)", None))
add("Boquete", 65, 64, "Quiet expat mountain town; little street crime", "Calm; expats report feeling safe",
    M=1.05, T=["expat-haven","very-low-crime"], RN="Chiriquí highlands are among Panama's safest areas; established retiree community.",
    H=(2.5,"region","Chiriquí province well below Panama's 11.7/100k national (estimate)", None))
add("Medellín", 50, 46, "Petty theft and scams common in tourist zones (Poblado, Laureles)", "Drugging/robbery risk via dating apps; women advised caution",
    M=0.95, T=["scams-common","nightlife-risk","women-safety-caution"],
    RN="Homicides at an 80-year low, but tourists face real targeted risk: scopolamine drugging, dating-app robbery and overdose deaths.",
    H=(11.0,"city","Medellín 2024 ~11/100k, lowest since 1942","https://colombiaone.com/2024/12/16/medellin-homicide-rate/"))
add("Cuenca", 62, 58, "Calm Andean expat city; modest petty theft", "Highland city; women report feeling relatively safe",
    M=1.12, T=["expat-haven","violence-elsewhere-in-state"],
    RN="Ecuador's homicide crisis is a coastal trafficking crisis; Cuenca sits in the Andes off the routes (1.4/100k H1 2025) — far safer than the national figure.",
    H=(1.4,"city","Cuenca/Azuay H1 2025 ~1.4/100k","https://cuencahighlife.com/cuencas-murder-rate-drops-dramatically-while-most-other-crime-categories-show-reductions/"))
add("Cusco", 50, 48, "Tourist hub; pickpocketing, scams, occasional strangle-robbery at night", "Moderate; harassment reported",
    M=1.0, T=["petty-theft","scams-common"], RN="Andean tourist center; property crime and scams are the main visitor risks.")
add("Arequipa", 52, 50, "Colonial tourist city; pickpocketing and taxi scams", "Moderate", M=1.0, T=["petty-theft","scams-common"])
add("Buenos Aires", 52, 52, "Pickpocketing and bag-snatching common; violent crime low", "Generally comfortable in central barrios; petty crime aside",
    M=1.0, T=["petty-theft","bag-snatching"], RN="Homicide at a 31-year low; the visitor issue is property crime, not violence.",
    H=(4.6,"city","CABA 2023 ~4.6/100k, lowest in 31 years","https://buenosairesherald.com/society/buenos-aires-city-records-lowest-homicide-rate-in-31-years"))
add("Montevideo", 55, 54, "Petty theft and phone-snatching; some armed robbery in outer areas", "Moderate",
    M=1.0, T=["petty-theft","bag-snatching"], H=(13.0,"city","Montevideo above Uruguay's 11.3/100k national (estimate)", None))
add("Santiago", 50, 50, "Rising property crime, pickpocketing, smash-and-grab", "Moderate", M=1.0, T=["petty-theft","scams-common"])
add("Florianópolis", 58, 54, "One of Brazil's safer capitals; beach-area petty theft", "Moderate",
    M=1.05, T=["tourist-zones-safer","petty-theft"], RN="Santa Catarina is among Brazil's safest states; far below the national homicide figure.",
    H=(10.0,"city","Santa Catarina among Brazil's safest states (estimate; national 19.3/100k)", None))

# ---------------- WESTERN / NORTHERN EUROPE ----------------
add("Vienna", 85, 83, "Very low street crime; isolated pickpocketing", "Women report high safety")
add("Berlin", 72, 70, "Some pickpocketing and bike theft; districts vary", "Generally safe; nightlife awareness", T=["petty-theft"])
add("Paris", 52, 56, "Heavy pickpocketing and bag-snatching in tourist zones/metro", "Metro harassment reported", T=["bag-snatching","petty-theft"])
add("Nice", 58, 60, "Riviera petty theft, beach and station pickpocketing", "Moderate", T=["petty-theft"])
add("London", 60, 60, "Phone-snatching and pickpocketing; violent crime localized", "Generally safe; transport awareness", T=["petty-theft"])
add("Dublin", 60, 62, "City-center pickpocketing, bike theft, some antisocial nighttime crime", "Moderate; nightlife awareness", T=["petty-theft"])
add("Amsterdam", 74, 72, "Pickpocketing and bike theft in tourist core; otherwise calm", "Women report high safety", T=["petty-theft"])
add("Copenhagen", 82, 80, "Very safe; occasional pickpocketing at stations", "Women report high safety")
add("Stockholm", 68, 66, "Pickpocketing in tourist zones; gang violence is localized and not tourist-facing", "Women report high safety",
    M=1.05, T=["petty-theft"], RN="Sweden's gang shootings are intra-criminal in specific suburbs, not in visitor areas.")
add("Zurich", 88, 86, "Very low crime; rare pickpocketing", "Women report very high safety")

# ---------------- SOUTHERN EUROPE ----------------
add("Lisbon", 70, 70, "Pickpocketing on trams and in tourist zones; violent crime low", "Women report relatively high safety", T=["petty-theft"])
add("Porto", 74, 73, "Modest pickpocketing; calm overall", "Relatively high safety")
add("Lagos (Algarve)", 80, 78, "Quiet resort town; low crime off-season", "High safety")
add("Funchal (Madeira)", 85, 83, "Very safe island capital", "Very high safety")
add("Madrid", 66, 66, "Pickpocketing in center and metro; violent crime low", "Generally safe", T=["petty-theft"])
add("Barcelona", 48, 55, "Among Europe's worst for pickpocketing and bag-snatching", "Violence low but theft pervasive in tourist zones", T=["bag-snatching","petty-theft"])
add("Seville", 70, 70, "Some pickpocketing at festivals/center; calm overall", "Generally safe")
add("Valencia", 70, 70, "Beach and center petty theft; calm overall", "Generally safe")
add("Málaga", 70, 70, "Tourist-zone pickpocketing; calm overall", "Generally safe")
add("Granada", 70, 70, "Modest pickpocketing in tourist areas", "Generally safe")
add("Las Palmas (Gran Canaria)", 65, 64, "Resort and port petty theft", "Generally safe", T=["petty-theft"])
add("Rome", 52, 56, "Heavy pickpocketing/bag-snatching at sights and on transit", "Harassment reported near stations", T=["bag-snatching","petty-theft"])
add("Florence", 62, 64, "Tourist-zone pickpocketing", "Generally safe", T=["petty-theft"])
add("Bologna", 60, 62, "Station-area petty theft and some drug-market nuisance", "Generally safe", T=["petty-theft"])
add("Catania (Sicily)", 50, 54, "Notable pickpocketing, scooter bag-snatching, scams", "Moderate", T=["bag-snatching","petty-theft","scams-common"])
add("Palermo", 50, 54, "Pickpocketing, scooter bag-snatching, scams in center/markets", "Moderate", T=["bag-snatching","petty-theft","scams-common"])
add("Athens", 55, 56, "Pickpocketing on metro/Monastiraki; periodic protests", "Moderate", T=["petty-theft","protest-unrest"])
add("Thessaloniki", 58, 58, "Some pickpocketing; calmer than Athens", "Moderate", T=["petty-theft"])
add("Chania (Crete)", 68, 68, "Low-key resort town; minor theft", "Generally safe")
add("Valletta", 80, 78, "Very safe small capital", "High safety")
add("Paphos", 78, 76, "Quiet resort; low crime", "High safety")
add("Ljubljana", 88, 86, "Very low crime", "Very high safety")
add("Split", 84, 82, "Tourist-zone petty theft aside, very safe", "High safety")

# ---------------- EASTERN EUROPE / CAUCASUS ----------------
add("Prague", 62, 66, "Tourist-area pickpocketing, taxi/currency scams", "Generally safe", T=["petty-theft","scams-common"])
add("Kraków", 78, 78, "Low crime; minor tourist-zone pickpocketing", "High safety")
add("Warsaw", 74, 74, "Low crime; some pickpocketing", "High safety")
add("Budapest", 70, 70, "Pickpocketing and nightlife/taxi scams in center", "Generally safe", T=["petty-theft","scams-common"])
add("Bucharest", 68, 66, "Pickpocketing and ATM/taxi scams; calm overall", "Generally safe", T=["petty-theft","scams-common"])
add("Cluj-Napoca", 74, 72, "Low crime university city", "Generally safe")
add("Sofia", 64, 62, "Pickpocketing and taxi scams; calm overall", "Moderate", T=["petty-theft","scams-common"])
add("Plovdiv", 70, 68, "Low crime; minor petty theft", "Generally safe")
add("Belgrade", 70, 68, "Low street crime; nightlife awareness", "Generally safe")
add("Sarajevo", 72, 70, "Low crime; some pickpocketing; legacy-mine warnings off-trail", "Generally safe")
add("Tirana", 66, 62, "Pickpocketing and traffic chaos; calm overall", "Moderate", T=["petty-theft"])
add("Sarandë", 66, 62, "Coastal resort petty theft", "Moderate")
add("Kotor", 78, 74, "Very safe walled town; minor seasonal theft", "Generally safe")
add("Tbilisi", 80, 74, "Notably safe city; minor petty theft", "Generally safe; some harassment")
add("Yerevan", 80, 74, "Notably safe city; little street crime", "Generally safe")
add("Tallinn", 80, 78, "Low crime; old-town pickpocketing", "High safety")
add("Riga", 70, 68, "Old-town pickpocketing and nightlife scams", "Generally safe", T=["petty-theft","scams-common"])
add("Vilnius", 70, 68, "Low crime; minor pickpocketing", "Generally safe")
add("Bratislava", 78, 76, "Low crime; minor tourist-zone theft", "High safety")

# ---------------- W ASIA / TURKEY ----------------
add("Istanbul", 58, 52, "Tourist-zone pickpocketing, bait-and-switch and taxi scams", "Harassment reported; dress/area awareness",
    M=1.0, T=["petty-theft","scams-common","women-safety-caution"])

# ---------------- SE / E ASIA ----------------
add("Bangkok", 62, 60, "Scams (gem/tuk-tuk), pickpocketing; violent crime against tourists rare", "Generally safe; nightlife awareness",
    T=["scams-common","petty-theft"])
add("Chiang Mai", 74, 72, "Low crime; minor scams", "Generally safe")
add("Bali (Canggu/Ubud)", 64, 62, "Scooter bag-snatching, ATM skimming, theft from rentals", "Generally safe", T=["bag-snatching","petty-theft"])
add("Siem Reap", 55, 52, "Bag-snatching from motorbikes, pickpocketing, scams", "Moderate", T=["bag-snatching","scams-common","petty-theft"])
add("Kuala Lumpur", 55, 52, "Motorcycle bag-snatching, credit-card and ATM fraud", "Moderate", T=["bag-snatching","petty-theft","scams-common"])
add("George Town (Penang)", 62, 60, "Bag-snatching and petty theft; calmer than KL", "Generally safe", T=["bag-snatching"])
add("Hanoi", 66, 64, "Pickpocketing and bag-snatching; taxi/scooter scams", "Generally safe", T=["petty-theft","scams-common"])
add("Ho Chi Minh City", 50, 50, "Notorious drive-by phone/bag-snatching by motorbike", "Generally safe but guard valuables", T=["bag-snatching","petty-theft"])
add("Da Nang", 72, 70, "Low crime beach city; minor theft", "Generally safe")
add("Da Lat", 74, 72, "Quiet highland town; low crime", "Generally safe")
add("Hoi An", 72, 70, "Low crime tourist town; minor theft", "Generally safe")
add("Taipei", 88, 86, "Very low crime; rare petty theft", "Women report very high safety")

# ---------------- AFRICA ----------------
add("Marrakech", 55, 38, "Aggressive scams, souk pickpocketing, motorbike bag-snatching", "Persistent harassment of women travelers",
    M=0.95, T=["scams-common","petty-theft","women-safety-caution"],
    RN="Tourists are actively worked by scams and aggressive touts; harassment of women is common.")
add("Cape Town", 40, 38, "Muggings on hiking trails and after dark; tourist zones privately secured", "Real risk; women advised strong caution",
    M=1.20, T=["tourist-zones-safer","women-safety-caution"],
    RN="One of the world's highest murder rates, but homicide is concentrated in the Cape Flats; V&A Waterfront, Atlantic Seaboard and Table Mountain are heavily secured — though trail muggings of tourists do occur.",
    H=(70.2,"city","Cape Town 2024 70.2/100k (SAPS); SA national 42","https://africacheck.org/fact-checks/reports/cape-town-south-africas-second-most-dangerous-city-heres-what-numbers-show"))

with open(OUT, "w") as f:
    json.dump(C, f, indent=2, ensure_ascii=False)
print(f"wrote {len(C)} city inputs -> {os.path.relpath(OUT, ROOT)}")
