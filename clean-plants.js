const fs = require('fs');
const path = require('path');

const plantsPath = path.join(__dirname, 'data', 'plants.json');

try {
  const plants = JSON.parse(fs.readFileSync(plantsPath));
  plants.forEach(p => delete p.quantity);
  fs.writeFileSync(plantsPath, JSON.stringify(plants, null, 2));
  console.log("✅ Removed 'quantity' from all plants in plants.json");
} catch (err) {
  console.error("❌ Error cleaning plants.json:", err);
}
