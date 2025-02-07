const fs = require('fs');
const path = require('path');
/**
 * @notice This module provides helper functions to track and retrieve the last fetched timestamp
 *         and to perform block number lookups based on a given target timestamp.
 * @dev The timestamp is stored in a JSON file (data/last_timestamp.json) using the protocol as a key.
 *      The getBlockNumberByTimestamp function uses a binary search to find the block number closest
 *      to a specified Unix timestamp.
 */

// The path to the JSON file that stores the last fetched timestamp
const TIMESTAMP_TRACKER_FILE = path.join(__dirname, '..', 'data', 'last_timestamp.json');

/**
 * @notice Finds the block number whose timestamp is closest to the target timestamp using binary search.
 * @param {Object} provider - An ethers.js provider instance used to fetch blockchain data.
 * @param {number} targetTimestamp - The target Unix timestamp in seconds for which to find the closest block.
 */
async function getBlockNumberByTimestamp(provider, targetTimestamp) {
  let earliest = 0;
  let latest = await provider.getBlockNumber();
  let closestBlock = earliest;

  while (earliest <= latest) {
    const mid = Math.floor((earliest + latest) / 2);
    const block = await provider.getBlock(mid);
    if (!block) break;
    if (block.timestamp === targetTimestamp) {
      return mid;
    } else if (block.timestamp < targetTimestamp) {
      closestBlock = mid;
      earliest = mid + 1;
    } else {
      latest = mid - 1;
    }
  }
  return closestBlock;
}

/**
 * @notice Retrieves the last fetched timestamp for a given protocol from the tracker file.
 * @param {string} protocol - The protocol key to look up in the timestamp tracker.
 */
function getLastFetchedTimestamp(protocol) {
  try {
    if (fs.existsSync(TIMESTAMP_TRACKER_FILE)) {
      const data = fs.readFileSync(TIMESTAMP_TRACKER_FILE, 'utf8');
      const json = JSON.parse(data);
      return json[protocol];
    }
  } catch (error) {
    console.error('Error reading last fetched timestamp:', error);
  }
}

/**
 * @notice Updates the last fetched timestamp for a given protocol in the tracker file.
 * @param {string} protocol - The protocol key to update in the timestamp tracker.
 * @param {number} timestamp - The new last fetched timestamp in seconds.
 */
function setLastFetchedTimestamp(protocol, timestamp) {
  try {
    let data = {};
    if (fs.existsSync(TIMESTAMP_TRACKER_FILE)) {
      const fileData = fs.readFileSync(TIMESTAMP_TRACKER_FILE, 'utf8');
      data = JSON.parse(fileData);
    }
    data[protocol] = timestamp;
    fs.writeFileSync(TIMESTAMP_TRACKER_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated last fetched timestamp for ${protocol} to: ${timestamp}`);
  } catch (error) {
    console.error('Error writing last fetched timestamp:', error);
  }
}

module.exports = { getBlockNumberByTimestamp, getLastFetchedTimestamp, setLastFetchedTimestamp };
