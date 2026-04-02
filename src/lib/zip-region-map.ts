const ZIP_PREFIX_TO_REGION: Record<string, string> = {
  // --- CALIFORNIA ---
  // SF Bay Area
  '940': 'SF Bay Area', '941': 'SF Bay Area', '942': 'SF Bay Area',
  '943': 'SF Bay Area', '944': 'SF Bay Area', '945': 'SF Bay Area',
  '946': 'SF Bay Area', '947': 'SF Bay Area', '948': 'SF Bay Area',
  '949': 'SF Bay Area', '950': 'SF Bay Area', '951': 'SF Bay Area',
  // Los Angeles
  '900': 'Los Angeles', '901': 'Los Angeles', '902': 'Los Angeles',
  '903': 'Los Angeles', '904': 'Los Angeles', '905': 'Los Angeles',
  '906': 'Los Angeles', '907': 'Los Angeles', '908': 'Los Angeles',
  '910': 'Los Angeles', '911': 'Los Angeles', '912': 'Los Angeles',
  '913': 'Los Angeles', '914': 'Los Angeles', '915': 'Los Angeles',
  '916': 'Los Angeles', '917': 'Los Angeles', '918': 'Los Angeles',
  // Orange County
  '926': 'Orange County', '927': 'Orange County', '928': 'Orange County',
  // San Diego
  '919': 'San Diego', '920': 'San Diego', '921': 'San Diego',
  // Sacramento
  '956': 'Sacramento', '957': 'Sacramento', '958': 'Sacramento',

  // --- NORTHEAST ---
  // New York City
  '100': 'New York City', '101': 'New York City', '102': 'New York City',
  '103': 'New York City', '104': 'New York City', '110': 'New York City',
  '111': 'New York City', '112': 'New York City', '113': 'New York City',
  '114': 'New York City', '116': 'New York City',
  // Boston
  '021': 'Boston', '022': 'Boston', '023': 'Boston', '024': 'Boston',
  // Philadelphia
  '190': 'Philadelphia', '191': 'Philadelphia', '192': 'Philadelphia',
  '193': 'Philadelphia',
  // Pittsburgh
  '150': 'Pittsburgh', '151': 'Pittsburgh', '152': 'Pittsburgh',
  // Washington DC
  '200': 'Washington DC', '201': 'Washington DC', '202': 'Washington DC',
  '203': 'Washington DC', '204': 'Washington DC', '205': 'Washington DC',
  '206': 'Washington DC', '207': 'Washington DC', '208': 'Washington DC',
  '209': 'Washington DC',
  // Baltimore
  '210': 'Baltimore', '211': 'Baltimore', '212': 'Baltimore',
  // Hartford
  '060': 'Hartford', '061': 'Hartford', '062': 'Hartford',
  // New Jersey (Northern)
  '070': 'Northern New Jersey', '071': 'Northern New Jersey',
  '072': 'Northern New Jersey', '073': 'Northern New Jersey',
  '074': 'Northern New Jersey',

  // --- SOUTHEAST ---
  // Atlanta
  '300': 'Atlanta', '301': 'Atlanta', '303': 'Atlanta',
  '304': 'Atlanta', '305': 'Atlanta', '311': 'Atlanta',
  // Miami / South Florida
  '330': 'Miami', '331': 'Miami', '332': 'Miami', '333': 'Miami',
  '341': 'Miami',
  // Orlando
  '327': 'Orlando', '328': 'Orlando', '347': 'Orlando',
  // Tampa
  '335': 'Tampa', '336': 'Tampa', '337': 'Tampa', '346': 'Tampa',
  // Jacksonville
  '320': 'Jacksonville', '321': 'Jacksonville', '322': 'Jacksonville',
  // Charlotte
  '280': 'Charlotte', '281': 'Charlotte', '282': 'Charlotte',
  // Raleigh-Durham
  '275': 'Raleigh-Durham', '276': 'Raleigh-Durham', '277': 'Raleigh-Durham',
  // Nashville
  '370': 'Nashville', '371': 'Nashville', '372': 'Nashville',
  // Memphis
  '380': 'Memphis', '381': 'Memphis',
  // Richmond
  '230': 'Richmond', '231': 'Richmond', '232': 'Richmond',
  // New Orleans
  '700': 'New Orleans', '701': 'New Orleans',
  // Charleston
  '294': 'Charleston',

  // --- MIDWEST ---
  // Chicago
  '606': 'Chicago', '607': 'Chicago', '608': 'Chicago',
  // St. Louis
  '630': 'St. Louis', '631': 'St. Louis',
  // Kansas City
  '640': 'Kansas City', '641': 'Kansas City',
  '660': 'Kansas City', '661': 'Kansas City',
  // Detroit
  '480': 'Detroit', '481': 'Detroit', '482': 'Detroit', '483': 'Detroit',
  // Minneapolis-St. Paul
  '550': 'Minneapolis', '551': 'Minneapolis', '553': 'Minneapolis',
  '554': 'Minneapolis', '555': 'Minneapolis',
  // Cleveland
  '440': 'Cleveland', '441': 'Cleveland', '442': 'Cleveland',
  // Columbus
  '430': 'Columbus', '431': 'Columbus', '432': 'Columbus',
  // Cincinnati
  '450': 'Cincinnati', '451': 'Cincinnati', '452': 'Cincinnati',
  // Indianapolis
  '460': 'Indianapolis', '461': 'Indianapolis', '462': 'Indianapolis',
  // Milwaukee
  '530': 'Milwaukee', '531': 'Milwaukee', '532': 'Milwaukee',

  // --- SOUTH CENTRAL ---
  // Dallas-Fort Worth
  '750': 'Dallas-Fort Worth', '751': 'Dallas-Fort Worth',
  '752': 'Dallas-Fort Worth', '753': 'Dallas-Fort Worth',
  '760': 'Dallas-Fort Worth', '761': 'Dallas-Fort Worth',
  '762': 'Dallas-Fort Worth',
  // Houston
  '770': 'Houston', '771': 'Houston', '772': 'Houston',
  '773': 'Houston', '774': 'Houston', '775': 'Houston',
  // San Antonio
  '780': 'San Antonio', '781': 'San Antonio', '782': 'San Antonio',
  // Austin
  '786': 'Austin', '787': 'Austin', '788': 'Austin',

  // --- MOUNTAIN WEST ---
  // Denver
  '800': 'Denver', '801': 'Denver', '802': 'Denver', '803': 'Denver',
  '804': 'Denver', '805': 'Denver',
  // Phoenix
  '850': 'Phoenix', '851': 'Phoenix', '852': 'Phoenix', '853': 'Phoenix',
  // Salt Lake City
  '840': 'Salt Lake City', '841': 'Salt Lake City',
  // Las Vegas
  '889': 'Las Vegas', '890': 'Las Vegas', '891': 'Las Vegas',
  // Albuquerque
  '870': 'Albuquerque', '871': 'Albuquerque',

  // --- PACIFIC NORTHWEST ---
  // Seattle
  '980': 'Seattle', '981': 'Seattle', '982': 'Seattle',
  '983': 'Seattle', '984': 'Seattle',
  // Portland
  '970': 'Portland', '971': 'Portland', '972': 'Portland',

  // --- HAWAII ---
  '967': 'Honolulu', '968': 'Honolulu',
}

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
] as const

export function getRegionFromZip(zip: string): string | null {
  const cleaned = zip.replace(/\D/g, '')
  if (cleaned.length < 3) return null
  return ZIP_PREFIX_TO_REGION[cleaned.substring(0, 3)] ?? null
}
