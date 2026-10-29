// Starting inventory. Loaded once on first run; everything is editable in the Peptides tab.
// Vial sizes are left blank on purpose: set each one to match your vials.
window.SEED_PEPTIDES = [
  { name: 'TB-500', vialAmount: null, vialUnit: 'mg', vialCount: 0 },
  { name: 'BPC-157', vialAmount: null, vialUnit: 'mg', vialCount: 0 },
  { name: 'GHK-Cu', vialAmount: null, vialUnit: 'mg', vialCount: 0 },
  { name: 'KPV', vialAmount: null, vialUnit: 'mg', vialCount: 0 }
];

// Starting daily schedule: shows as a tick list on the Today card. Volume is units on a U-100 syringe.
window.SEED_SCHEDULES = [
  { peptide: 'BPC-157', dose: 250, doseUnit: 'mcg', volume: 5 },
  { peptide: 'TB-500', dose: 500, doseUnit: 'mcg', volume: 10 },
  { peptide: 'KPV', dose: 250, doseUnit: 'mcg', volume: 5 },
  { peptide: 'GHK-Cu', dose: null, doseUnit: 'mcg', volume: 4 }
];

// Mixing ingredients, not peptides. Edit the size and count under Peptides.
window.SEED_SUPPLIES = [
  { name: 'Bacteriostatic water', amount: 10, unit: 'mL', count: 0 }
];

// One-off changes to her existing data. Each runs once on the phone (tracked by id), then never again.
// Peptides match by name (so 'Retatrutide' also finds 'Retatrutide 20mg') and are added if missing.
// Changing the mix clears saved units on that peptide's schedules so they are worked out from the new mix.
window.SEED_UPDATES = [
  {
    id: '2026-10-29-3ml-mix-and-reta',
    peptides: [
      { name: 'KPV', vialAmount: 10, vialUnit: 'mg', bacMl: 3 },
      { name: 'TB-500', vialAmount: 10, vialUnit: 'mg', bacMl: 3 },
      { name: 'BPC-157', vialAmount: 10, vialUnit: 'mg', bacMl: 3 },
      { name: 'Retatrutide', vialAmount: 20, vialUnit: 'mg', bacMl: 3 }
    ],
    // Weekly on Thursdays, first dose 29 Oct 2026. 2 mg at 20 mg / 3 mL = 30 units.
    schedules: [
      { peptide: 'Retatrutide', dose: 2, doseUnit: 'mg', repeat: 'weekly', days: [4], start: '2026-10-29' }
    ]
  }
];
