require("dotenv").config();
const { InfluxDB, Point } = require("@influxdata/influxdb-client");
const { ApolloClient, InMemoryCache, gql } = require("@apollo/client/core");
const { HttpLink } = require("@apollo/client/link/http");
const fetch = require("cross-fetch");
const { getLastFetchedTimestamp, setLastFetchedTimestamp } = require("./utils/timestampTracker");

// Create an InfluxDB client using environment variables
const clientInflux = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});
const writeApi = clientInflux.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);
//  The InfluxDB measurement name where APY data is stored.
const MEASUREMENT = "protocol_apy_data";

/**
 * @notice Vaults configuration for Morpho.
 * @dev Each vault has an Ethereum address and a constant weight value.
 */
const VAULTS = {
  USDC: {
    address: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
    weight: 12.5,
  },
  USDT: {
    address: "0xbEef047a543E45807105E51A8BBEFCc5950fcfBa",
    weight: 12.5,
  },
};

/**
 * @notice GraphQL query for retrieving historical APY data.
 * @dev The query requires an address and a TimeseriesOptions object containing the startTimestamp and interval.
 */
const GET_HISTORICAL_APY = gql`
  query VaultApys($address: String!, $options: TimeseriesOptions) {
    vaultByAddress(address: $address) {
      address
      historicalState {
        apy(options: $options) {
          x
          y
        }
      }
    }
  }
`;

/**
 * @notice Fetches historical APY data for Morpho and writes it to InfluxDB.
 * @dev For each vault (USDC, USDT), this function:
 *   - Retrieves the last fetched timestamp using the protocol key.
 *   - Queries the Morpho GraphQL API for APY data since that timestamp.
 *   - Processes each data point by converting the APY to a percentage and formatting it to 2 decimals.
 *   - Writes a point to InfluxDB with the APY and weight fields.
 *   - Updates the timestamp tracker with the latest processed timestamp.
 */
async function fetchMorphoApy() {
  try {
    console.log("Starting Morpho APY fetch...");

    const endpoint = "https://blue-api.morpho.org/graphql";
    const apolloClient = new ApolloClient({
      link: new HttpLink({ uri: endpoint, fetch }),
      cache: new InMemoryCache(),
    });

    // Iterate through each vault configuration
    for (const [vaultKey, vaultInfo] of Object.entries(VAULTS)) {
      // Retrieve the last fetched timestamp for this vault (in seconds)
      const lastFetchedTimestamp = getLastFetchedTimestamp(vaultKey);
      const startTimestamp = lastFetchedTimestamp;
      // Use a daily interval.
      const interval = "DAY";

      // Options for the GraphQL query
      const options = {
        startTimestamp,
        interval,
      };

      // Variables of the vault address and options
      const variables = {
        address: vaultInfo.address,
        options,
      };

      // Execution of query
      const { data } = await apolloClient.query({
        query: GET_HISTORICAL_APY,
        variables,
      });

      // Extract data from the response
      const apyData = data?.vaultByAddress?.historicalState?.apy;
      if (!apyData || apyData.length === 0) {
        console.log(`No APY data returned for vault ${vaultKey}.`);
        continue;
      }

      // For each returned data point, calculate and write a point to InfluxDB
      apyData.forEach((dataPoint) => {
        // Convert the APY value from decimal to percentage
        const apy = parseFloat(dataPoint.y) * 100;
        // Format the APY value with two decimals
        const apyToFixed = apy.toFixed(2);
        // Create a data point with the APY and weight
        const point = new Point(MEASUREMENT)
          .tag("protocol", `morpho-${vaultKey}`)
          .floatField("apy", parseFloat(apyToFixed))
          .floatField("weight", vaultInfo.weight)
          .timestamp(new Date(dataPoint.x * 1000));

        writeApi.writePoint(point);
      });

      // Flush points for the current vault
      await writeApi.flush();

      // Update the last fetched timestamp for the vault
      const latestTimestamp = apyData[0].x;
      setLastFetchedTimestamp(vaultKey, latestTimestamp);
    }
    console.log("Completed Morpho APY fetch.");
  } catch (error) {
    console.error("Morpho Error fetching data:", error);
  }
}

module.exports = { fetchMorphoApy };
