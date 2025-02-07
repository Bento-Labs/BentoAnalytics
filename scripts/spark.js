require("dotenv").config();
const { InfluxDB, Point } = require("@influxdata/influxdb-client");
const { ethers, WebSocketProvider } = require("ethers");
const { getBlockNumberByTimestamp, getLastFetchedTimestamp, setLastFetchedTimestamp } = require("./utils/timestampTracker");

// Create an InfluxDB client using environment variables
const clientInflux = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});
const writeApi = clientInflux.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);
//  The InfluxDB measurement name where APY data is stored.
const MEASUREMENT = "protocol_apy_data";

/**
 * @notice Fetches historical Spark APY data at 8‑hour intervals.
 * @dev For each 8‑hour interval since the last processed timestamp:
 *  - Finds the block number closest to the target timestamp.
 *  - Calls the contract’s ssr() function at that block.
 *  - Computes the annual APY as: ( (ssrFloat^SECONDS_PER_YEAR) - 1 ) * 100.
 *  - Writes a point to InfluxDB with fields "apy" and "weight" and the corresponding timestamp.
 *  - Updates the timestamp tracker to the latest processed interval.
 */
async function fetchSparkApy() {
  try {
    // Retrieve the last fetched timestamp (in seconds)
    let lastTimestamp = getLastFetchedTimestamp("spark");
    const nowTimestamp = Math.floor(Date.now() / 1000);

    // Define an 8‑hour interval in seconds
    const interval = 8 * 3600;

    // Calculate the number of full 8‑hour intervals that have passed since the last timestamp
    const intervalsToProcess = Math.floor((nowTimestamp - lastTimestamp) / interval);
    if (intervalsToProcess <= 0) {
      console.log("No new 8‑hour intervals to process. Skipping.");
      return;
    }
    console.log(`Processing ${intervalsToProcess} 8‑hour intervals from ${lastTimestamp}.`);

    // Initialize a provider and contract
    const provider = new WebSocketProvider(process.env.ALCHEMY_URL);
    const contractAddress = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD";
    const ABI = ["function ssr() view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, ABI, provider);

    // Process each 8‑hour interval
    for (let i = 1; i <= intervalsToProcess; i++) {
      const currentTimestamp = lastTimestamp + i * interval; // Target timestamp for this interval

      // Get the block number closest to the target timestamp
      const blockNum = await getBlockNumberByTimestamp(provider, currentTimestamp);
      const blockInfo = await provider.getBlock(blockNum);
      if (!blockInfo) {
        console.log(`Could not fetch block info for block ${blockNum}. Skipping interval at ${currentTimestamp}.`);
        continue;
      }

      // Call the contract's ssr() function at block
      let ssrBig;
      try {
        ssrBig = await contract.ssr({ blockTag: blockNum });
      } catch (error) {
        console.log(`Error calling ssr() at block ${blockNum}:`, error);
        continue;
      }

      // If the call returns empty data, skip this interval
      if (!ssrBig || ssrBig.toString() === "0x" || ssrBig.toString() === "0") {
        console.log(`ssr() returned empty data at block ${blockNum}. Skipping this interval.`);
        continue;
      }

      // Define constant for seconds per year
      const SECONDS_PER_YEAR = 3600 * 24 * 365;

      // Convert ssrBig to a float by dividing by 1e27
      const ssrFloat = Number(ssrBig) / 1e27;

      // Calculate the annual factor
      // Then compute annual APY
      const annualFactor = Math.pow(ssrFloat, SECONDS_PER_YEAR);
      const annualApy = (annualFactor - 1) * 100;

      // Format the APY to 2 decimal places. Note: toFixed returns a string.
      const apyToFixed = annualApy.toFixed(2);

      console.log(`At timestamp ${currentTimestamp} (block ${blockNum}): SSR = ${ssrFloat}, APY = ${apyToFixed}%`);

      // Create a single InfluxDB data point with both fields
      const point = new Point(MEASUREMENT)
        .tag("protocol", "spark")
        .floatField("apy", parseFloat(apyToFixed))
        .floatField("weight", 25)
        .timestamp(new Date(currentTimestamp * 1000));

      writeApi.writePoint(point);
    }

    // Flush all points to InfluxDB
    await writeApi.flush();

    // Update the last fetched timestamp to the end of the last processed interval
    const newLastTimestamp = lastTimestamp + intervalsToProcess * interval;
    setLastFetchedTimestamp("spark", newLastTimestamp);
    console.log("Spark APY fetch and write completed successfully.");
  } catch (err) {
    console.error("Spark error:", err);
  }
}

module.exports = { fetchSparkApy };
