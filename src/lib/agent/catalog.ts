/**
 * The library catalogue: popular cars by generation, so the library agent can build their stock models
 * ahead of time. A generation covers a year range; any car added later that falls inside it gets the model
 * instantly. Cars that aren't here are added to the queue the first time someone adds one.
 */

export type Body = "supercar" | "coupe" | "sedan" | "hatchback" | "wagon" | "suv" | "offroad" | "pickup" | "van" | "roadster" | "muscle";
export interface CatalogEntry { make: string; model: string; generation: string; from: number; to: number; body: Body }

const E = (make: string, model: string, generation: string, from: number, to: number, body: Body): CatalogEntry => ({ make, model, generation, from, to, body });

export const CATALOG: CatalogEntry[] = [
  // Porsche
  E("Porsche", "911", "992", 2019, 2026, "coupe"), E("Porsche", "911", "991", 2012, 2019, "coupe"), E("Porsche", "911 GT3 RS", "992", 2023, 2026, "supercar"),
  E("Porsche", "718 Cayman", "982", 2017, 2026, "coupe"), E("Porsche", "Cayenne", "E3", 2019, 2026, "suv"), E("Porsche", "Taycan", "J1", 2020, 2026, "sedan"),
  // BMW
  E("BMW", "M3", "G80", 2021, 2026, "sedan"), E("BMW", "M3", "E46", 2001, 2006, "coupe"), E("BMW", "M4", "G82", 2021, 2026, "coupe"), E("BMW", "M2", "G87", 2023, 2026, "coupe"),
  E("BMW", "3 Series", "G20", 2019, 2026, "sedan"), E("BMW", "X5", "G05", 2019, 2026, "suv"),
  // Audi / VW
  E("Audi", "R8", "Type 4S", 2016, 2024, "supercar"), E("Audi", "RS3", "8Y", 2022, 2026, "sedan"), E("Audi", "A4", "B9", 2017, 2025, "sedan"), E("Audi", "Q5", "FY", 2018, 2025, "suv"),
  E("Volkswagen", "Golf GTI", "Mk8", 2022, 2026, "hatchback"), E("Volkswagen", "Golf GTI", "Mk7", 2015, 2021, "hatchback"), E("Volkswagen", "Golf R", "Mk8", 2022, 2026, "hatchback"),
  E("Volkswagen", "Jetta", "Mk7", 2019, 2026, "sedan"), E("Volkswagen", "Eos", "1F", 2007, 2016, "roadster"), E("Volkswagen", "Beetle", "A5", 2012, 2019, "hatchback"),
  // Mercedes
  E("Mercedes-Benz", "C-Class", "W206", 2022, 2026, "sedan"), E("Mercedes-Benz", "G-Class", "W463A", 2019, 2026, "offroad"), E("Mercedes-Benz", "AMG GT", "C190", 2016, 2021, "supercar"),
  // Japan
  E("Honda", "Civic Type R", "FL5", 2023, 2026, "hatchback"), E("Honda", "Civic Type R", "FK8", 2017, 2021, "hatchback"), E("Honda", "Civic", "11th gen", 2022, 2026, "sedan"),
  E("Honda", "Accord", "11th gen", 2023, 2026, "sedan"), E("Honda", "S2000", "AP2", 2004, 2009, "roadster"), E("Acura", "NSX", "NC1", 2017, 2022, "supercar"),
  E("Toyota", "GR Supra", "A90", 2020, 2026, "coupe"), E("Toyota", "Supra", "A80", 1993, 2002, "coupe"), E("Toyota", "GR86", "ZN8", 2022, 2026, "coupe"),
  E("Toyota", "Camry", "XV70", 2018, 2024, "sedan"), E("Toyota", "Corolla", "E210", 2019, 2026, "sedan"), E("Toyota", "Tacoma", "4th gen", 2024, 2026, "pickup"),
  E("Toyota", "Tacoma", "3rd gen", 2016, 2023, "pickup"), E("Toyota", "Tundra", "3rd gen", 2022, 2026, "pickup"), E("Toyota", "4Runner", "N280", 2010, 2024, "offroad"),
  E("Toyota", "Land Cruiser", "J200", 2008, 2021, "offroad"), E("Toyota", "Land Cruiser", "J80", 1990, 1997, "offroad"), E("Lexus", "LC 500", "Z100", 2018, 2026, "coupe"), E("Lexus", "IS", "XE30", 2014, 2026, "sedan"),
  E("Nissan", "GT-R", "R35", 2009, 2025, "supercar"), E("Nissan", "Skyline GT-R", "R34", 1999, 2002, "coupe"), E("Nissan", "Z", "RZ34", 2023, 2026, "coupe"),
  E("Nissan", "370Z", "Z34", 2009, 2020, "coupe"), E("Nissan", "350Z", "Z33", 2003, 2009, "coupe"),
  E("Mazda", "MX-5 Miata", "ND", 2016, 2026, "roadster"), E("Mazda", "MX-5 Miata", "NA", 1990, 1997, "roadster"), E("Mazda", "RX-7", "FD", 1992, 2002, "coupe"),
  E("Subaru", "WRX", "VB", 2022, 2026, "sedan"), E("Subaru", "WRX STI", "VA", 2015, 2021, "sedan"), E("Subaru", "BRZ", "ZD8", 2022, 2026, "coupe"),
  E("Mitsubishi", "Lancer Evolution", "X", 2008, 2015, "sedan"),
  // US
  E("Ford", "Mustang", "S650", 2024, 2026, "muscle"), E("Ford", "Mustang", "S550", 2015, 2023, "muscle"), E("Ford", "F-150", "14th gen", 2021, 2026, "pickup"),
  E("Ford", "F-150 Raptor", "3rd gen", 2021, 2026, "pickup"), E("Ford", "Bronco", "6th gen", 2021, 2026, "offroad"), E("Ford", "GT", "2nd gen", 2017, 2022, "supercar"),
  E("Chevrolet", "Corvette", "C8", 2020, 2026, "supercar"), E("Chevrolet", "Corvette", "C7", 2014, 2019, "coupe"), E("Chevrolet", "Camaro", "6th gen", 2016, 2024, "muscle"),
  E("Chevrolet", "Silverado 1500", "4th gen", 2019, 2026, "pickup"), E("Chevrolet", "Tahoe", "5th gen", 2021, 2026, "suv"),
  E("Dodge", "Challenger", "LC", 2008, 2023, "muscle"), E("Dodge", "Charger", "LD", 2011, 2023, "sedan"), E("Ram", "1500", "DT", 2019, 2026, "pickup"),
  E("Jeep", "Wrangler", "JL", 2018, 2026, "offroad"), E("Jeep", "Grand Cherokee", "WL", 2022, 2026, "suv"), E("Cadillac", "Escalade", "5th gen", 2021, 2026, "suv"),
  E("Tesla", "Model 3", "Highland", 2024, 2026, "sedan"), E("Tesla", "Model Y", "1st gen", 2020, 2026, "suv"), E("Tesla", "Model S", "Palladium", 2021, 2026, "sedan"),
  // Exotics and others
  E("Ferrari", "F8 Tributo", "F142MFL", 2020, 2023, "supercar"), E("Ferrari", "296 GTB", "F171", 2022, 2026, "supercar"), E("Ferrari", "488 GTB", "F142M", 2016, 2019, "supercar"),
  E("Lamborghini", "Huracán", "LB724", 2015, 2024, "supercar"), E("Lamborghini", "Aventador", "LB834", 2012, 2022, "supercar"), E("Lamborghini", "Urus", "1st gen", 2019, 2026, "suv"),
  E("McLaren", "720S", "P14", 2018, 2023, "supercar"), E("McLaren", "570S", "P13", 2016, 2021, "supercar"),
  E("Hyundai", "Elantra N", "CN7", 2022, 2026, "sedan"), E("Kia", "Stinger", "CK", 2018, 2023, "sedan"), E("Mini", "Cooper S", "F56", 2014, 2024, "hatchback"),
  E("Alfa Romeo", "Giulia Quadrifoglio", "952", 2017, 2026, "sedan"), E("Land Rover", "Defender", "L663", 2020, 2026, "offroad"), E("Land Rover", "Range Rover", "L460", 2022, 2026, "suv"),
  E("Volvo", "XC90", "2nd gen", 2016, 2026, "suv"),
];

const MAKE_ALIASES: Record<string, string> = { chevy: "chevrolet", vw: "volkswagen", mercedes: "mercedes-benz", benz: "mercedes-benz", merc: "mercedes-benz", "land-rover": "land rover", landrover: "land rover", alfa: "alfa romeo" };
export const normMake = (m: string) => { const k = m.trim().toLowerCase().replace(/\s+/g, " "); return MAKE_ALIASES[k] ?? k; };
/** "GT-R" -> "gtr", "MX-5 Miata" -> "mx5miata", "Huracán" -> "huracan". */
export const normModel = (m: string) => m.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Stable key for a library entry. */
export const entryKey = (e: { make: string; model: string; generation: string }) => `${normMake(e.make)}|${normModel(e.model)}|${normModel(e.generation)}`;

export interface Matchable { make: string; model: string; from: number; to: number }
/**
 * Best library entry for a car: same make, the entry's model name equals the car's (or one contains the other,
 * so "Golf GTI" matches "GTI" and "911 Carrera S" matches "911"), and the year inside the generation's range.
 * The closest model name wins, so "911 GT3 RS" prefers the GT3 RS entry over the plain 911.
 */
export function bestMatch<T extends Matchable>(entries: T[], car: { year: number | null; make: string; model: string }): T | null {
  const make = normMake(car.make), model = normModel(car.model);
  if (!model) return null;
  let best: T | null = null, bestScore = -1;
  for (const e of entries) {
    if (normMake(e.make) !== make) continue;
    if (car.year != null && (car.year < e.from || car.year > e.to)) continue;
    const em = normModel(e.model);
    let score = -1;
    if (em === model) score = 1000;
    else if ((model.startsWith(em) && !(/\d$/.test(em) && /^\d/.test(model.slice(em.length)))) || model.endsWith(em)) score = 500 + em.length; // owner wrote more ("911 carrera s"), but "m340i" isn't an "m3"
    else if (em.includes(model) && model.length >= 3) score = 200 + model.length; // owner wrote less ("gti")
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}
