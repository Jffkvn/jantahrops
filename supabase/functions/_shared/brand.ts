// JantaHR brand details for emails. Mirrors BRAND in the website repo
// (src/lib/constants.ts); keep the two in step when contact details change.

export const BRAND = {
  name: 'JantaHR',
  legalName: 'JantaHR Consulting',
  site: 'https://www.jantahr.com',
  privacyUrl: 'https://www.jantahr.com/privacy',
  logoOnDark: 'https://www.jantahr.com/logo-light.png',
  email: 'hello@jantahr.com',
  phones: ['+256 776 777034', '+256 752 600250'],
  location: 'Kampala, Uganda',
  hours: 'Monday to Friday, 8:00 AM to 6:00 PM, and Saturday, 9:00 AM to 1:00 PM (East Africa Time)',
  socials: [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/jantahr/' },
    { label: 'Instagram', url: 'https://www.instagram.com/janta_hr/' },
    { label: 'X', url: 'https://x.com/janta_hr' },
  ],
  cvRetentionMonths: 24,
  colors: {
    deep: '#0B2B3B',
    primary: '#006c8b',
    accent: '#2EC3E5',
    offwhite: '#F6F7F9',
    muted: '#5B6974',
    border: '#E3E8EC',
  },
} as const;
