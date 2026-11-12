// Price guide for the Info tab. Rough Australian prices (AUD) at the HIGHER end of what people usually
// pay, written November 2026. Research-peptide prices are per vial from online sellers and vary a lot;
// prescription medicines are private-script prices. A guide for budgeting only, not a quote.
// Shared file: the same copy is used in all the peptide apps. Each entry matches library names that
// start with one of its keys (lowercase letters and numbers only); the longest key wins.
window.PRICE_NOTE = 'Rough Australian price at the higher end, November 2026. Sellers vary a lot.';
window.PEP_PRICES = [
  // Healing
  { keys: ['bpc157', 'bodyprotectioncompound'], price: 'About A$130 per 10 mg vial' },
  { keys: ['tb500', 'thymosinbeta4', 'tb4'], price: 'About A$160 per 10 mg vial' },
  { keys: ['ara290', 'cibinetide'], price: 'About A$170 per 10 mg vial' },
  { keys: ['kpv'], price: 'About A$130 per 10 mg vial' },
  { keys: ['ll37'], price: 'About A$160 per 5 mg vial' },
  { keys: ['thymosinalpha1', 'thymosina1', 'ta1', 'zadaxin'], price: 'About A$170 per 5 mg vial (A$250 for 10 mg)' },
  { keys: ['larazotide'], price: 'About A$160 per 5 mg vial' },
  { keys: ['vip', 'vasoactive'], price: 'About A$200 per 5 mg vial' },
  // Weight
  { keys: ['semaglutide', 'ozempic', 'wegovy', 'rybelsus'], price: 'Wegovy pens about A$460 a month on a private script (Ozempic about A$200). Research vials about A$200 per 10 mg' },
  { keys: ['tirzepatide', 'mounjaro', 'zepbound'], price: 'Mounjaro pens about A$650 a month on a private script at the higher doses. Research vials about A$320 per 30 mg' },
  { keys: ['retatrutide', 'reta'], price: 'About A$220 per 10 mg vial, A$350 per 20 mg' },
  { keys: ['cagrilintide', 'cagri'], price: 'About A$180 per 5 mg vial' },
  { keys: ['liraglutide', 'saxenda', 'victoza'], price: 'Saxenda about A$420 a month on a private script (5 pens)' },
  { keys: ['mazdutide'], price: 'About A$280 per 10 mg vial' },
  { keys: ['survodutide'], price: 'About A$280 per 10 mg vial' },
  { keys: ['aod9604', 'aod'], price: 'About A$130 per 5 mg vial' },
  { keys: ['motsc', 'mots'], price: 'About A$170 per 10 mg vial' },
  { keys: ['5amino1mq', 'amino1mq'], price: 'About A$160 for 60 capsules (50 mg)' },
  // Growth hormone
  { keys: ['cjc1295', 'cjc'], price: 'About A$120 per 5 mg vial (no DAC), A$160 with DAC' },
  { keys: ['cjc1295nodac', 'modgrf'], price: 'About A$120 per 5 mg vial' },
  { keys: ['cjc1295withdac', 'cjc1295dac'], price: 'About A$160 per 5 mg vial' },
  { keys: ['ipamorelin', 'ipa'], price: 'About A$110 per 5 mg vial (A$170 for 10 mg)' },
  { keys: ['sermorelin'], price: 'About A$130 per 5 mg vial. Compounded on script about A$300 a month' },
  { keys: ['tesamorelin', 'egrifta'], price: 'About A$280 per 10 mg vial' },
  { keys: ['ghrp2'], price: 'About A$90 per 5 mg vial' },
  { keys: ['ghrp6'], price: 'About A$90 per 5 mg vial' },
  { keys: ['hexarelin'], price: 'About A$110 per 5 mg vial' },
  { keys: ['mk677', 'ibutamoren'], price: 'About A$130 for 30 capsules (25 mg)' },
  { keys: ['igf1lr3', 'igf1', 'igf'], price: 'About A$220 per 1 mg vial' },
  // Brain and mood
  { keys: ['semax'], price: 'About A$130 per 30 mg (vial or nasal spray)' },
  { keys: ['selank'], price: 'About A$130 per 10 mg (vial or nasal spray)' },
  { keys: ['cerebrolysin'], price: 'About A$280 for a box of 5 x 10 mL ampoules' },
  { keys: ['dihexa'], price: 'About A$170 for 30 capsules' },
  { keys: ['pinealon'], price: 'About A$130 per 10 mg vial' },
  { keys: ['oxytocin'], price: 'About A$100 per 5 mg vial. Compounded on script about A$120' },
  // Sleep and longevity
  { keys: ['dsip', 'deltasleep'], price: 'About A$100 per 5 mg vial' },
  { keys: ['epitalon', 'epithalon', 'epithalamin'], price: 'About A$130 per 10 mg vial (A$280 for 50 mg)' },
  { keys: ['ss31', 'elamipretide'], price: 'About A$220 per 10 mg vial (A$550 for 50 mg)' },
  { keys: ['nad', 'nicotinamide'], price: 'About A$200 per 500 mg vial. Clinic IV drips about A$700 each' },
  { keys: ['glutathione', 'gsh'], price: 'About A$130 per 1500 mg vial. Clinic IV push about A$200' },
  { keys: ['humanin'], price: 'About A$200 per 10 mg vial' },
  // Skin and hair
  { keys: ['ghkcu', 'ghk', 'copperpeptide'], price: 'About A$120 per 50 mg vial (A$170 for 100 mg). Serums about A$90' },
  { keys: ['snap8'], price: 'About A$90 for a 30 mL serum' },
  { keys: ['argireline', 'acetylhexapeptide'], price: 'About A$90 for a 30 mL serum' },
  { keys: ['matrixyl', 'palmitoyl'], price: 'About A$90 for a 30 mL serum' },
  { keys: ['melanotan', 'mt2', 'mtii'], price: 'About A$100 per 10 mg vial' },
  { keys: ['lemonbottle'], price: 'About A$100 per 10 mL vial (A$350 for a box of 5)' },
  // Sexual health
  { keys: ['pt141', 'bremelanotide', 'vyleesi'], price: 'About A$130 per 10 mg vial' },
  { keys: ['kisspeptin', 'kiss'], price: 'About A$120 per 5 mg vial (A$170 for 10 mg)' },
  { keys: ['gonadorelin'], price: 'About A$100 per 2 mg vial' }
];
window.priceFor = function (name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let best = null, len = 0;
  for (const e of window.PEP_PRICES) for (const k of e.keys) if (n.startsWith(k) && k.length > len) { best = e; len = k.length; }
  return best ? best.price : '';
};
