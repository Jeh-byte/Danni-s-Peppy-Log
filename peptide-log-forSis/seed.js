// Starting inventory. Loaded once on first run; everything is editable in the Peptides tab.
// Vial sizes are left blank on purpose: set each one to match your vials.
window.SEED_PEPTIDES = [
  { name: 'TB-500', vialAmount: null, vialUnit: 'mg', vialCount: 0 },
  { name: 'BPC-157', vialAmount: null, vialUnit: 'mg', vialCount: 0 },
  { name: 'GHK-Cu', vialAmount: null, vialUnit: 'mg', vialCount: 0 },
  { name: 'KPV', vialAmount: null, vialUnit: 'mg', vialCount: 0 }
];

// Mixing ingredients, not peptides. Edit the size and count under Peptides.
window.SEED_SUPPLIES = [
  { name: 'Bacteriostatic water', amount: 10, unit: 'mL', count: 0 }
];
