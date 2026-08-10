// Valori indicativi usati esclusivamente per simulare il limite dei bot.
// Le voci più specifiche devono precedere i modelli generici.
const VEHICLE_MARKET_VALUES: Array<[RegExp, number]> = [
  [/ferrari.*812.*competizione/i, 1_350_000], [/ferrari.*812/i, 360_000],
  [/ferrari.*sf90/i, 470_000], [/ferrari.*f8/i, 330_000], [/ferrari.*488/i, 245_000], [/ferrari.*roma/i, 215_000],
  [/porsche.*911.*gt3\s*rs/i, 320_000], [/porsche.*911.*gt3/i, 225_000], [/porsche.*911.*turbo\s*s/i, 245_000], [/porsche.*911/i, 145_000], [/porsche.*718/i, 82_000],
  [/lamborghini.*revuelto/i, 560_000], [/lamborghini.*aventador/i, 430_000], [/lamborghini.*huracan/i, 260_000], [/lamborghini.*urus/i, 245_000],
  [/mclaren.*750s/i, 340_000], [/mclaren.*720s/i, 270_000], [/mclaren.*artura/i, 225_000],
  [/aston martin.*dbs/i, 300_000], [/aston martin.*db12/i, 260_000], [/aston martin.*vantage/i, 185_000],
  [/mercedes.*amg.*gt/i, 190_000], [/mercedes.*a\s*45/i, 72_000], [/mercedes.*g\s*63/i, 230_000],
  [/bmw.*m4.*csl/i, 185_000], [/bmw.*m4/i, 112_000], [/bmw.*m3/i, 108_000], [/bmw.*m2/i, 78_000],
  [/audi.*r8/i, 195_000], [/audi.*rs\s*6/i, 145_000], [/audi.*rs\s*3/i, 72_000],
  [/alfa romeo.*giulia.*quadrifoglio/i, 96_000], [/alfa romeo.*4c/i, 75_000],
  [/maserati.*mc20/i, 245_000], [/nissan.*gt\s*r/i, 155_000], [/toyota.*supra/i, 68_000],
  [/ford.*mustang.*shelby/i, 125_000], [/ford.*mustang/i, 68_000], [/chevrolet.*corvette.*z06/i, 175_000], [/chevrolet.*corvette/i, 105_000],
];

const normalizeVehicleName = (vehicle: string) => vehicle
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\b(?:19|20)\d{2}\b/g, " ")
  .replace(/[^a-z0-9]+/gi, " ").trim();

export const estimateVehicleValue = (vehicle: string): number | null => {
  const normalized = normalizeVehicleName(vehicle);
  return VEHICLE_MARKET_VALUES.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
};
