// Stime indicative per il comportamento dei bot, non perizie commerciali.
// La prima regola corrispondente vince: versione specifica -> famiglia -> marchio.
type ValueRule = { pattern: RegExp; value: number };

const MODEL_VALUES: ValueRule[] = [
  { pattern: /ferrari.*812.*(?:competizione|competezione)/, value: 1_350_000 },
  { pattern: /ferrari.*laferrari/, value: 4_200_000 }, { pattern: /ferrari.*f40/, value: 3_340_000 },
  { pattern: /ferrari.*f50/, value: 7_240_000 }, { pattern: /ferrari.*enzo/, value: 7_440_000 },
  { pattern: /ferrari.*daytona.*sp3/, value: 3_200_000 }, { pattern: /ferrari.*sf90.*xx/, value: 1_050_000 },
  { pattern: /ferrari.*sf90/, value: 470_000 }, { pattern: /ferrari.*812/, value: 360_000 },
  { pattern: /ferrari.*296/, value: 330_000 }, { pattern: /ferrari.*f8/, value: 330_000 },
  { pattern: /ferrari.*488.*pista/, value: 430_000 }, { pattern: /ferrari.*488/, value: 245_000 },
  { pattern: /ferrari.*458.*speciale/, value: 460_000 }, { pattern: /ferrari.*458/, value: 230_000 },
  { pattern: /ferrari.*roma/, value: 215_000 }, { pattern: /ferrari.*purosangue/, value: 470_000 },
  { pattern: /lamborghini.*countach/, value: 720_000 }, { pattern: /lamborghini.*revuelto/, value: 610_000 },
  { pattern: /lamborghini.*aventador.*svj/, value: 720_000 }, { pattern: /lamborghini.*aventador/, value: 430_000 },
  { pattern: /lamborghini.*huracan.*sto/, value: 340_000 }, { pattern: /lamborghini.*huracan/, value: 260_000 },
  { pattern: /lamborghini.*urus/, value: 245_000 },
  { pattern: /porsche.*918/, value: 1_650_000 }, { pattern: /porsche.*carrera.*gt/, value: 1_550_000 },
  { pattern: /porsche.*911.*gt3.*rs/, value: 330_000 }, { pattern: /porsche.*911.*gt2.*rs/, value: 410_000 },
  { pattern: /porsche.*911.*gt3/, value: 225_000 }, { pattern: /porsche.*911.*turbo.*s/, value: 245_000 },
  { pattern: /porsche.*911.*turbo/, value: 205_000 }, { pattern: /porsche.*911/, value: 145_000 },
  { pattern: /porsche.*718.*gt4.*rs/, value: 185_000 }, { pattern: /porsche.*718/, value: 82_000 },
  { pattern: /porsche.*taycan/, value: 115_000 }, { pattern: /porsche.*cayenne/, value: 110_000 },
  { pattern: /mclaren.*p1/, value: 1_650_000 }, { pattern: /mclaren.*senna/, value: 1_250_000 },
  { pattern: /mclaren.*765lt/, value: 440_000 }, { pattern: /mclaren.*750s/, value: 340_000 },
  { pattern: /mclaren.*720s/, value: 270_000 }, { pattern: /mclaren.*artura/, value: 225_000 },
  { pattern: /aston martin.*valkyrie/, value: 3_000_000 }, { pattern: /aston martin.*dbs/, value: 300_000 },
  { pattern: /aston martin.*db12/, value: 260_000 }, { pattern: /aston martin.*vantage/, value: 185_000 },
  { pattern: /maserati.*mc12/, value: 3_400_000 }, { pattern: /maserati.*mc20/, value: 245_000 },
  { pattern: /mercedes.*amg.*one/, value: 3_400_000 }, { pattern: /mercedes.*slr/, value: 480_000 },
  { pattern: /mercedes.*amg.*gt.*black/, value: 370_000 }, { pattern: /mercedes.*amg.*gt/, value: 190_000 },
  { pattern: /mercedes.*g.*63/, value: 230_000 }, { pattern: /mercedes.*a.*45/, value: 72_000 },
  { pattern: /bmw.*m4.*csl/, value: 185_000 }, { pattern: /bmw.*m4/, value: 112_000 },
  { pattern: /bmw.*m3/, value: 108_000 }, { pattern: /bmw.*m5/, value: 135_000 }, { pattern: /bmw.*m2/, value: 78_000 },
  { pattern: /audi.*r8/, value: 195_000 }, { pattern: /audi.*rs.*6/, value: 145_000 },
  { pattern: /audi.*rs.*7/, value: 155_000 }, { pattern: /audi.*rs.*3/, value: 72_000 },
  { pattern: /alfa romeo.*33.*stradale/, value: 2_000_000 },
  { pattern: /alfa romeo.*giulia.*quadrifoglio/, value: 96_000 }, { pattern: /alfa romeo.*4c/, value: 75_000 },
  { pattern: /nissan.*gt.*r.*nismo/, value: 230_000 }, { pattern: /nissan.*gt.*r/, value: 155_000 },
  { pattern: /nissan.*skyline.*r34/, value: 210_000 }, { pattern: /toyota.*(?:gr.*)?supra/, value: 68_000 },
  { pattern: /toyota.*2000gt/, value: 950_000 }, { pattern: /honda.*nsx/, value: 135_000 },
  { pattern: /ford.*gt(?!\d)/, value: 620_000 }, { pattern: /ford.*mustang.*shelby/, value: 125_000 },
  { pattern: /ford.*mustang/, value: 68_000 }, { pattern: /chevrolet.*corvette.*z06/, value: 175_000 },
  { pattern: /chevrolet.*corvette/, value: 105_000 }, { pattern: /dodge.*viper/, value: 145_000 },
  { pattern: /lotus.*emira/, value: 105_000 }, { pattern: /lotus.*evija/, value: 2_300_000 },
  { pattern: /bugatti.*chiron/, value: 3_500_000 }, { pattern: /bugatti.*veyron/, value: 2_000_000 },
  { pattern: /pagani.*huayra/, value: 3_400_000 }, { pattern: /pagani.*zonda/, value: 7_000_000 },
  { pattern: /koenigsegg/, value: 3_200_000 }, { pattern: /rimac.*nevera/, value: 2_200_000 },
  { pattern: /rolls royce.*(?:phantom|spectre)/, value: 470_000 }, { pattern: /rolls royce.*cullinan/, value: 420_000 },
  { pattern: /bentley.*continental.*gt/, value: 245_000 }, { pattern: /range rover.*sport.*sv/, value: 220_000 },
  { pattern: /range rover.*(?:velar|sport)/, value: 105_000 }, { pattern: /range rover/, value: 145_000 },
  { pattern: /tesla.*model.*s/, value: 95_000 }, { pattern: /tesla.*model.*3/, value: 48_000 },
  { pattern: /volkswagen.*golf.*r/, value: 58_000 }, { pattern: /volkswagen.*golf.*gti/, value: 47_000 },
  { pattern: /volkswagen.*golf/, value: 34_000 }, { pattern: /fiat.*500.*abarth/, value: 34_000 },
  { pattern: /fiat.*500/, value: 21_000 }, { pattern: /fiat.*panda/, value: 18_000 },
  { pattern: /renault.*clio/, value: 24_000 }, { pattern: /peugeot.*208/, value: 25_000 },
  { pattern: /mini.*cooper.*john.*cooper/, value: 49_000 }, { pattern: /mini.*cooper/, value: 36_000 },
  { pattern: /hyundai.*i30.*n/, value: 43_000 }, { pattern: /kia.*stinger/, value: 55_000 },
  { pattern: /mazda.*mx.*5/, value: 35_000 }, { pattern: /subaru.*wrx.*sti/, value: 62_000 },
  { pattern: /jeep.*wrangler/, value: 64_000 }, { pattern: /ford.*focus.*rs/, value: 55_000 },
];

const BRAND_VALUES: ValueRule[] = [
  { pattern: /bugatti|pagani|koenigsegg|rimac/, value: 2_500_000 },
  { pattern: /ferrari|lamborghini|mclaren/, value: 320_000 },
  { pattern: /rolls royce|bentley/, value: 280_000 }, { pattern: /aston martin|maserati/, value: 190_000 },
  { pattern: /porsche/, value: 135_000 }, { pattern: /lotus|alpine/, value: 95_000 },
  { pattern: /mercedes|bmw|audi|lexus|land rover|range rover|jaguar/, value: 82_000 },
  { pattern: /alfa romeo|cadillac|genesis|tesla|polestar/, value: 65_000 },
  { pattern: /ford|chevrolet|dodge|jeep|ram|gmc/, value: 58_000 },
  { pattern: /toyota|nissan|honda|subaru|mazda|mitsubishi|infiniti|acura/, value: 46_000 },
  { pattern: /volkswagen|mini|cupra|abarth|volvo/, value: 42_000 },
  { pattern: /fiat|renault|peugeot|citroen|opel|skoda|seat|hyundai|kia|suzuki|dacia/, value: 32_000 },
];

const normalize = (vehicle: string) => vehicle.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const yearFrom = (vehicle: string) => Number(vehicle.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? 0);

export const hasExactVehicleValue = (vehicle: string) => MODEL_VALUES.some(({ pattern }) => pattern.test(normalize(vehicle)));

export const estimateVehicleValue = (vehicle: string): number => {
  const normalized = normalize(vehicle); if (!normalized) return 0;
  const exact = MODEL_VALUES.find(({ pattern }) => pattern.test(normalized));
  let value = exact?.value ?? BRAND_VALUES.find(({ pattern }) => pattern.test(normalized))?.value ?? 55_000;

  if (!exact) {
    const modifier = /svj|sv|gto|speciale|competizione|black series|csl|gt3|gt2|sto|nismo/.test(normalized) ? 1.65
      : /quadrifoglio|competition|performance|turbo|shelby|type r|amg|\brs\b|\bm\d\b/.test(normalized) ? 1.32
        : /sport|carrera|coupe|spider|cabrio|v8|v10|v12/.test(normalized) ? 1.14 : 1;
    value *= modifier;
  }

  const year = yearFrom(vehicle);
  if (!exact && year >= 2010 && year < 2021) value *= .88 + (year - 2010) * .012;
  else if (!exact && year >= 2000 && year < 2010) value *= .78;
  else if (year >= 1990 && year < 2000 && !exact) value *= .72;
  else if (year > 0 && year < 1990 && !exact) value *= .8;

  return Math.max(8_000, Math.round(value / 500) * 500);
};
