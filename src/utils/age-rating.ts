import { getLocales } from "expo-localization";

const US_REGIONS = new Set(["US", "CA", "PR", "GU", "VI", "AS", "MP", "UM"]);
const CIS_REGIONS = new Set([
  "RU",
  "BY",
  "KZ",
  "KG",
  "UZ",
  "TJ",
  "TM",
  "AM",
  "AZ",
  "MD",
  "UA",
  "GE",
]);
const EAST_ASIA_15_REGIONS = new Set(["JP", "KR"]);
const ASIA_REGIONS = new Set([
  "CN",
  "HK",
  "MO",
  "TW",
  "SG",
  "MY",
  "TH",
  "VN",
  "ID",
  "PH",
  "IN",
  "BD",
  "PK",
  "LK",
  "NP",
  "MM",
  "KH",
  "LA",
  "MN",
  "BN",
]);

export function suggestiveAgeLabel(regionCode?: string | null): string {
  const region = (regionCode ?? "").toUpperCase();
  if (US_REGIONS.has(region)) return "17+";
  if (EAST_ASIA_15_REGIONS.has(region)) return "15+";
  if (CIS_REGIONS.has(region)) return "16+";
  if (ASIA_REGIONS.has(region)) return "16+";
  return "16+";
}

let cached: string | null = null;

export function getSuggestiveAgeLabel(): string {
  if (cached) return cached;
  let region: string | null = null;
  try {
    region = getLocales()[0]?.regionCode ?? null;
  } catch {}
  cached = suggestiveAgeLabel(region);
  return cached;
}
