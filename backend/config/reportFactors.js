// Environmental conversion factors per kg of e-waste recycled. These are rough,
// documented estimates for demonstration — override any of them via REPORT_* env
// vars without touching code.
module.exports = {
  co2KgPerKg: Number(process.env.REPORT_CO2_PER_KG) || 1.2, // kg CO₂e avoided per kg
  energyKwhPerKg: Number(process.env.REPORT_ENERGY_PER_KG) || 3.5, // kWh saved per kg
  waterLitersPerKg: Number(process.env.REPORT_WATER_PER_KG) || 12, // litres saved per kg
  landfillKgPerKg: Number(process.env.REPORT_LANDFILL_PER_KG) || 1, // kg diverted per kg
  // ~20 kg CO₂/tree/year → 0.05 tree-years per kg CO₂.
  treesPerCo2Kg: Number(process.env.REPORT_TREES_PER_CO2) || 0.05,
};
