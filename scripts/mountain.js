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
 * @notice Fetches historical APY data for Mountain Protocol.
 * @dev This function:
 *   - Retrieves the last fetched timestamp (in seconds) for the "mountain" protocol.
 *   - Determines the number of full 24‑hour intervals (86400 seconds) that have passed 
 *     since the last timestamp.
 *   - For each interval, it finds the block closest to the target timestamp using a binary search,
 *     queries the smart contract for the reward multiplier at that block, and computes the APY as:
 *
 *         APY (%) = ((currentMultiplier / previousMultiplier) - 1) * 100
 *
 *   - Writes a data point to InfluxDB for each interval with the calculated APY and a constant weight.
 *   - Updates the timestamp tracker with the new last fetched timestamp.
 */
async function fetchMountainApy() {
  try {
    // Retrieve the last fetched timestamp (in seconds)
    let lastTimestamp = getLastFetchedTimestamp("mountain");
    const nowTimestamp = Math.floor(Date.now() / 1000);

    // Define a 24-hour interval in seconds
    const interval = 24 * 3600;

    // Calculate the number of full 24-hour intervals to process
    const intervalsToProcess = Math.floor((nowTimestamp - lastTimestamp) / interval);
    if (intervalsToProcess <= 0) {
      console.log("No new 24‑hour intervals to process. Skipping.");
      return;
    }
    console.log(`Processing ${intervalsToProcess} 24‑hour intervals for Mountain.`);

    // Initialize a WebSocketProvider to interact with Ethereum
    const provider = new WebSocketProvider(process.env.ALCHEMY_URL);
    const contractAddress = "0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C";
    const ABI = [
      "function rewardMultiplier() view returns (uint256)"
    ];
    const contract = new ethers.Contract(contractAddress, ABI, provider);

    // Get the initial reward multiplier from the block corresponding to the last fetched timestamp
    const initialBlock = await getBlockNumberByTimestamp(provider, lastTimestamp);
    let previousMultiplierBig = await contract.rewardMultiplier({ blockTag: initialBlock });
    // Convert the multiplier from BigNumber to a float assuming 18 decimals
    let previousMultiplier = Number(previousMultiplierBig) / 1e18;

    // Process each 24-hour interval
    for (let i = 1; i <= intervalsToProcess; i++) {
      const currentTimestamp = lastTimestamp + i * interval; // target timestamp for the interval

      // Get the block number closest to the current timestamp
      const blockNum = await getBlockNumberByTimestamp(provider, currentTimestamp);
      const blockInfo = await provider.getBlock(blockNum);
      if (!blockInfo) {
        console.log(`Could not fetch block info for block ${blockNum} at timestamp ${currentTimestamp}.`);
        continue;
      }

      // Fetch the reward multiplier at this block
      let rewardMultiplierBig;
      try {
        rewardMultiplierBig = await contract.rewardMultiplier({ blockTag: blockNum });
      } catch (error) {
        console.log(`Error calling rewardMultiplier() at block ${blockNum}:`, error);
        continue;
      }
      if (!rewardMultiplierBig || rewardMultiplierBig.toString() === "0x" || rewardMultiplierBig.toString() === "0") {
        console.log(`rewardMultiplier returned empty data at block ${blockNum}.`);
        continue;
      }
      let currentMultiplier = Number(rewardMultiplierBig) / 1e18;
      if (!currentMultiplier) {
        console.log(`Current rewardMultiplier is 0 at block ${blockNum}.`);
        continue;
      }

      // Compute the interval APY as the percentage change between the current and previous multiplier.
      // APY (%) = ((currentMultiplier / previousMultiplier) - 1) * 100
      const intervalYield = (currentMultiplier / previousMultiplier) - 1;
      const dailyApy = intervalYield * 100;
      // Update the previous multiplier for the next interval
      previousMultiplier = currentMultiplier;

      // Format the APY with two decimals
      const apyToFixed = dailyApy.toFixed(2);
      const apyFloat = parseFloat(apyToFixed);

      console.log(`At timestamp ${currentTimestamp} (block ${blockNum}): Mountain APY = ${apyToFixed}%, rewardMultiplier = ${currentMultiplier}`);

      // Create an InfluxDB data point for this interval
      const point = new Point(MEASUREMENT)
        .tag("protocol", "mountain")
        .floatField("apy", apyFloat)
        .floatField("weight", 25)
        .timestamp(new Date(currentTimestamp * 1000));

      writeApi.writePoint(point);
    }

    // Flush all pending writes to InfluxDB
    await writeApi.flush();

    // Update the last fetched timestamp to the last interval processed
    const newLastTimestamp = lastTimestamp + intervalsToProcess * interval;
    setLastFetchedTimestamp("mountain", newLastTimestamp);
    console.log("Mountain APY fetch and write completed successfully.");
  } catch (err) {
    console.error("Mountain error:", err);
  }
}

module.exports = { fetchMountainApy };
