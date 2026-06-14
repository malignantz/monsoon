#!/usr/bin/env python3
"""
Populate per-passport tourist-visa data on every city.

Visa rules are per-country (cities in the same country share them), so we build a
table keyed by country and stamp every city's `visa` field with:

    visa = { US|UK|EU|AU: { visaFree: bool, days: int|null, note: str } }

Passports: US, UK, EU (treated as freedom-of-movement inside the EU/EEA+CH),
and AU (Australia). Verified June 2026 — re-verify before travel; rules shift.

Key dated facts baked in (verified 2026-06):
  - ETIAS not yet live (expected Q4 2026): Schengen stays visa-free for US/UK/AU now.
  - UK ETA mandatory from 2026-02-25 for US/EU/AU visitors.
  - EU Entry/Exit System (EES) live since Oct 2025 (biometric, no extra auth).
  - Brazil e-visa reinstated: US/AU (Apr 2025), EU (Jan 1 2026); UK still visa-free.
  - Thailand 60-day exemption being cut to 30 days (cabinet-approved May 2026).
  - Bulgaria & Romania: full Schengen since Jan 1 2025.
  - Cyprus: EU but NOT yet Schengen (targeting 2026); own 90/180.
  - Turkey: US/UK/EU visa-free 90/180; AU needs e-visa.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "travel-data.json"

def e(visaFree, days, note):
    return {"visaFree": visaFree, "days": days, "note": note}

# --- reusable building blocks -------------------------------------------------
FREEDOM = e(True, None, "Freedom of movement — live/work/stay with no time limit (EU/EEA citizen).")

ETIAS = "ETIAS travel authorisation required from late 2026."
def schengen_visitor():
    return e(True, 90, f"Visa-free 90 days per 180 across the Schengen Area. {ETIAS}")

# Schengen destinations: US/UK/AU get 90/180 visitor; EU = freedom of movement.
SCHENGEN = [
    "Austria","Bulgaria","Croatia","Czech Republic","Denmark","Estonia","Finland",
    "France","Germany","Greece","Hungary","Italy","Latvia","Lithuania","Malta",
    "Netherlands","Norway","Poland","Portugal","Romania","Sicily","Slovakia",
    "Slovenia","Spain","Sweden","Switzerland",
]

def schengen_entry():
    return {"US": schengen_visitor(), "UK": schengen_visitor(),
            "EU": FREEDOM, "AU": schengen_visitor()}

VISA = {c: schengen_entry() for c in SCHENGEN}

# --- EU but not Schengen ------------------------------------------------------
VISA["Cyprus"] = {
    "US": e(True, 90, "Visa-free 90 days per 180. Not yet in Schengen — counts separately."),
    "UK": e(True, 90, "Visa-free 90 days per 180. Not yet in Schengen — counts separately."),
    "EU": FREEDOM,
    "AU": e(True, 90, "Visa-free 90 days per 180. Not yet in Schengen — counts separately."),
}
VISA["Ireland"] = {
    "US": e(True, 90, "Visa-free up to 90 days. Ireland is outside Schengen and the UK ETA scheme."),
    "UK": e(True, None, "Common Travel Area — live/work/stay with no time limit."),
    "EU": FREEDOM,
    "AU": e(True, 90, "Visa-free up to 90 days. Ireland is outside Schengen."),
}

# --- United Kingdom -----------------------------------------------------------
UK_ETA = "Visa-free visit up to 6 months; UK ETA required before travel (from 25 Feb 2026)."
VISA["United Kingdom"] = {
    "US": e(True, 180, UK_ETA),
    "UK": e(True, None, "Home country — no restriction."),
    "EU": e(True, 180, UK_ETA + " Irish citizens exempt (Common Travel Area)."),
    "AU": e(True, 180, UK_ETA),
}

# --- Non-EU Europe / Caucasus / Balkans --------------------------------------
def all_same(visaFree, days, note):
    return {p: e(visaFree, days, note) for p in ("US","UK","EU","AU")}

VISA["Georgia"] = all_same(True, 365, "Visa-free up to 1 year.")
VISA["Armenia"] = all_same(True, 180, "Visa-free up to 180 days per year.")
VISA["Serbia"] = all_same(True, 90, "Visa-free 90 days per 180.")
VISA["Montenegro"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Bosnia & Herzegovina"] = all_same(True, 90, "Visa-free 90 days per 180.")
VISA["North Macedonia"] = all_same(True, 90, "Visa-free 90 days per 180.")
VISA["Albania"] = {
    "US": e(True, 365, "Visa-free up to 1 year (US citizens)."),
    "UK": e(True, 90, "Visa-free 90 days per 180."),
    "EU": e(True, 90, "Visa-free 90 days per 180."),
    "AU": e(True, 90, "Visa-free 90 days per 180."),
}
VISA["Turkey"] = {
    "US": e(True, 90, "Visa-free 90 days per 180."),
    "UK": e(True, 90, "Visa-free 90 days per 180."),
    "EU": e(True, 90, "Visa-free 90 days per 180 (most EU nationals)."),
    "AU": e(False, 90, "e-Visa required (evisa.gov.tr); up to 90 days per 180."),
}
VISA["Morocco"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["South Africa"] = all_same(True, 90, "Visa-free up to 90 days.")

# --- Asia ---------------------------------------------------------------------
TH_NOTE = "Visa-free 60 days (being cut to 30 days in 2026); Thailand Digital Arrival Card (TDAC) required."
VISA["Thailand"] = all_same(True, 60, TH_NOTE)
VISA["Vietnam"] = all_same(False, 90, "e-Visa required (single/multi-entry, up to 90 days).")
VISA["Indonesia"] = all_same(False, 30, "e-VOA / visa on arrival, 30 days, extendable once to 60.")
VISA["Malaysia"] = all_same(True, 90, "Visa-free up to 90 days; MDAC digital arrival card required.")
VISA["Cambodia"] = all_same(False, 30, "e-Visa / visa on arrival, 30 days.")
VISA["Taiwan"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Philippines"] = all_same(True, 30, "Visa-free 30 days, extendable.")
VISA["Japan"] = {
    "US": e(True, 90, "Visa-free up to 90 days."),
    "UK": e(True, 90, "Visa-free up to 90 days (extendable to 180)."),
    "EU": e(True, 90, "Visa-free up to 90 days (some nationals extendable to 180)."),
    "AU": e(True, 90, "Visa-free up to 90 days."),
}

# --- Americas -----------------------------------------------------------------
VISA["Mexico"] = all_same(True, 180, "Visa-free up to 180 days (length set by officer / FMM).")
VISA["Guatemala"] = all_same(True, 90, "Visa-free 90 days (CA-4 region shared with neighbours).")
VISA["Colombia"] = all_same(True, 90, "Visa-free 90 days, extendable to 180 per year.")
VISA["Argentina"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Uruguay"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Ecuador"] = all_same(True, 90, "Visa-free 90 days per year.")
VISA["Peru"] = all_same(True, 90, "Visa-free up to 90 days (up to 183/year at discretion).")
VISA["Chile"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Panama"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Costa Rica"] = all_same(True, 90, "Visa-free up to 90 days.")
VISA["Brazil"] = {
    "US": e(False, 90, "e-Visa required (since Apr 2025); 90 days per visit, 180/year."),
    "UK": e(True, 90, "Visa-free up to 90 days."),
    "EU": e(False, 90, "e-Visa required (since Jan 2026); 90 days per visit, 180/year."),
    "AU": e(False, 90, "e-Visa required (since Apr 2025); 90 days per visit, 180/year."),
}
VISA["Canada"] = {
    "US": e(True, 180, "Visa-free up to 6 months; no eTA needed."),
    "UK": e(True, 180, "Visa-free up to 6 months; eTA required for air travel."),
    "EU": e(True, 180, "Visa-free up to 6 months; eTA required for air travel."),
    "AU": e(True, 180, "Visa-free up to 6 months; eTA required for air travel."),
}

# --- Oceania ------------------------------------------------------------------
VISA["Australia"] = {
    "US": e(False, 90, "ETA (subclass 601) required; up to 90 days per visit."),
    "UK": e(False, 90, "eVisitor (subclass 651) required; up to 90 days per visit."),
    "EU": e(False, 90, "eVisitor (subclass 651) required; up to 90 days per visit."),
    "AU": e(True, None, "Home country — no restriction."),
}
VISA["New Zealand"] = {
    "US": e(True, 90, "Visa-free up to 90 days; NZeTA required before travel."),
    "UK": e(True, 180, "Visa-free up to 6 months; NZeTA required before travel."),
    "EU": e(True, 90, "Visa-free up to 90 days; NZeTA required before travel."),
    "AU": e(True, None, "Visa-free — Australians can live, work and study without a visa or NZeTA."),
}

# --- apply --------------------------------------------------------------------
def main():
    data = json.loads(DATA.read_text())
    missing = sorted({c["country"] for c in data["cities"]} - set(VISA))
    if missing:
        sys.exit(f"No visa rule for: {missing}")
    for c in data["cities"]:
        c["visa"] = VISA[c["country"]]
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"Stamped visa data on {len(data['cities'])} cities across {len(VISA)} countries.")

if __name__ == "__main__":
    main()
