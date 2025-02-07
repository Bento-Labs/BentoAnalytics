require("dotenv").config();
const { InfluxDB, Point } = require("@influxdata/influxdb-client");
const { ethers, WebSocketProvider } = require("ethers");
const { getLastProcessedBlock, setLastProcessedBlock } = require("./utils/blockTracker");

// Create an InfluxDB client using environment variables
const clientInflux = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});

const writeApi = clientInflux.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);
//  The InfluxDB measurement name where APY data is stored.
const MEASUREMENT = "protocol_apy_data";

/**
 * @notice Fetches APY data for Ethena from blockchain logs and writes it to InfluxDB.
 * @dev The function performs the following steps:
 *   1. Retrieves the last processed block from the JSON-based tracker.
 *   2. Gets the current latest block number from the Ethereum provider.
 *   3. If there are new blocks, it fetches logs from the contract.
 *   4. For each log, it reads the data, calls the contract's totalAssets() function at that block,
 *      and calculates the APY. The APY is scaled and formatted to two decimals.
 *   5. Each data point is written to InfluxDB with tags and fields, and the timestamp is set using the block timestamp.
 *   6. Finally, the last processed block is updated.
 */
async function fetchEthenaApy() {
  try {
    console.log("Starting Ethena APY fetch...");

    // Initialize Ethereum provider via Alchemy
    const provider = new WebSocketProvider(process.env.ALCHEMY_URL);

    // Define contract details for Ethena
    const contractAddress = "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497";
    const contractAbi = ["function totalAssets() view returns (uint256)"];
    const eventTopic = "0xbb28dd7cd6be6f61828ea9158a04c5182c716a946a6d2f31f4864edb87471aa6";

    console.log("Starting Ethena APY fetch...");
    
    // Retrieve the last processed block from the tracker
    const lastBlock = getLastProcessedBlock();
    const latestBlock = await provider.getBlockNumber();

    console.log(`Last processed block: ${lastBlock}, Latest block: ${latestBlock}`);

    if (latestBlock <= lastBlock) {
      console.log("No new blocks to process. Skipping.");
      return;
    }

    // Create a filter for logs between lastBlock+1 and latestBlock
    const logsFilter = {
      address: [contractAddress],
      fromBlock: lastBlock + 1,
      toBlock: latestBlock,
      topics: [eventTopic],
    };

    // Retrieve logs from the provider
    const logs = await provider.getLogs(logsFilter);
    console.log(`Fetching ${logs.length} new log(s).`);

    if (!logs.length) {
      console.log(`No new logs found between blocks ${lastBlock + 1} and ${latestBlock}.`);
      setLastProcessedBlock(latestBlock);
      return;
    }

    // Create a contract instance to interact with Ethena
    const contract = new ethers.Contract(contractAddress, contractAbi, provider);

    // Process each log
    for (const log of logs) {
      try {
        // Convert log data to a BigInt value
        const dataNumber = BigInt(log.data);
        // Get total assets at the block of the log
        const totalAssetsPerBlock = await contract.totalAssets({ blockTag: log.blockNumber });
        const totalAssetsBigInt = BigInt(totalAssetsPerBlock);

        // Compute APY based on a formula
        const apy = dataNumber * 3n * 365n * 100n;
        const eightHourApy = Number(apy) / Number(totalAssetsBigInt);
        // Format the APY to two decimal places
        const apyToFixed = eightHourApy.toFixed(2);
        // Retrieve block information to get the timestamp
        const blockInfo = await provider.getBlock(log.blockNumber);

        // Create an InfluxDB point with both APY and weight as fields
        const point = new Point(MEASUREMENT)
          .tag("protocol", "ethena")
          .floatField("apy", parseFloat(apyToFixed))
          .floatField("weight", 25)
          .timestamp(new Date(blockInfo.timestamp * 1000));

        writeApi.writePoint(point);
      } catch (logError) {
        console.error(`Error processing log at block ${log.blockNumber}:`, logError);
      }
    }

    // Update the tracker with the latest processed block
    setLastProcessedBlock(latestBlock);
    // Flush the InfluxDB write buffer
    await writeApi.flush()
    console.log("Completed Ethena APY fetch.");
  } catch (error) {
    console.error("Ethena error fetching logs:", error);
  }
}

module.exports = { fetchEthenaApy };
