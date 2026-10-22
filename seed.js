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
