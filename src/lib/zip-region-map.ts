const ZIP_PREFIX_TO_REGION: Record<string, string> = {
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
  // Chicago
  '606': 'Chicago', '607': 'Chicago', '608': 'Chicago',
  // St. Louis
  '630': 'St. Louis', '631': 'St. Louis',
  // Kansas City
  '640': 'Kansas City', '641': 'Kansas City',
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
