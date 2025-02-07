require("dotenv").config();
const cron = require("node-cron");

const { fetchEthenaApy } = require("./scripts/ethena");
const { fetchMorphoApy } = require("./scripts/morpho");
const { fetchMountainApy } = require("./scripts/mountain");
const { fetchSparkApy } = require("./scripts/spark");

// Run Ethena schedule every 8 hours, starting 4AM
cron.schedule("0 4,12,20 * * *", async () => {
  try {
    console.log("Ethena schedule triggered at:", new Date());
    await fetchEthenaApy();
  } catch (error) {
    console.error("Ethena error cron job:", error);
  }
});

// Run Morpho schedule everyday 1PM
cron.schedule("0 13 * * *", async () => {
  try {
    console.log("Morpho schedule triggered at:", new Date());
    await fetchMorphoApy();
  } catch (error) {
    console.error("Morpho error cron job:", error);
  }
});

// Run Spark schedule every 8 hours, starting 4AM
cron.schedule("0 4,12,20 * * *", async () => {
  try {
    console.log("Spark schedule triggered at:", new Date());
    await fetchSparkApy();
  } catch (error) {
    console.error("Spark error cron job:", error);
  }
});

// Run Mountain schedule everyday 1PM
cron.schedule("0 13 * * *", async () => {
  try {
    console.log("Mountain schedule triggered at:", new Date());
    await fetchMountainApy();
  } catch (error) {
    console.error("Mountain error cron job:", error);
  }
});

// Initial data collection
(async () => {
  console.log("Initial fetch...");
  await fetchEthenaApy();
  await fetchMorphoApy();
  await fetchSparkApy();
  await fetchMountainApy();
  console.log("Done initial fetch");
})();

