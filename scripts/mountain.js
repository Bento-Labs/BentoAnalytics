require("dotenv").config();
const { InfluxDB, Point } = require("@influxdata/influxdb-client");
const { getBlockNumberByTimestamp, getLastFetchedTimestamp, setLastFetchedTimestamp } = require("./utils/timestampTracker");
const { ethers, WebSocketProvider } = require("ethers");

const clientInflux = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});
const writeApi = clientInflux.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);
const MEASUREMENT = "protocol_apy_data";

async function fetchMountainApy() {
  try {
     // Get the last fetched timestamp 
     let lastTimestamp = getLastFetchedTimestamp("mountain");
     const nowTimestamp = Math.floor(Date.now() / 1000);
 
     const interval = 24 * 3600; 
 
    // Calculate the number of full 24-hour intervals to process
    const intervalsToProcess = Math.floor((nowTimestamp - lastTimestamp) / interval);
    if (intervalsToProcess <= 0) {
      console.log("No new 24‑hour intervals to process. Skipping.");
      return;
    }
    console.log(`Processing ${intervalsToProcess} 24‑hour intervals for Mountain.`);

    const provider = new WebSocketProvider(process.env.ALCHEMY_URL);
    const contractAddress = "0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C";
    const ABI = [
      "function rewardMultiplier() view returns (uint256)",
      "function totalSupply() view returns (uint256)"
    ];
    const contract = new ethers.Contract(contractAddress, ABI, provider);

    const initialBlock = await getBlockNumberByTimestamp(provider, lastTimestamp);
    let previousMultiplier = await contract.rewardMultiplier({ blockTag: initialBlock });

    for (let i = 1; i <= intervalsToProcess; i++) {
      const currentTimestamp = lastTimestamp + i * interval; // each interval’s timestamp

      const blockNum = await getBlockNumberByTimestamp(provider, currentTimestamp);
      const blockInfo = await provider.getBlock(blockNum);
      if (!blockInfo) {
        console.log(`Could not fetch block info for block ${blockNum} at ${currentTimestamp}.`);
        continue;
      }
      const rewardMultiplier = await contract.rewardMultiplier({ blockTag: blockNum });
      const totalSupply = await contract.totalSupply({ blockTag: blockNum });

      let dailyApy = 0;
      if (previousMultiplier) {
        const ratio = Number(rewardMultiplier) / Number(previousMultiplier);
        dailyApy = Number(totalSupply) * (ratio - 1); 
      }

      previousMultiplier = rewardMultiplier;

      const apy = dailyApy / 1e23;
      const toPercent = apy * 100;
      const apyToFixed = toPercent.toFixed(2);

      console.log(`At timestamp ${currentTimestamp}: Mountain APY = ${apyToFixed}%, multiplier: ${rewardMultiplier}, totalSupply: ${totalSupply}`);

      // Create an InfluxDB data point 
      const point = new Point(MEASUREMENT)
        .tag("protocol", "mountain")
        .floatField("apy", parseFloat(apyToFixed))
        .floatField("weight", 25)
        .timestamp(new Date(currentTimestamp * 1000));

      writeApi.writePoint(point);
    }

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