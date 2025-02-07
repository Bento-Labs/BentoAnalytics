const fs = require('fs');
const path = require('path');

/**
 * @notice This module provides helper functions to track and retrieve the last processed block
 *         for Ethena. The block number is stored in a JSON file so that subsequent runs can continue
 *         processing from the last processed block.
 * @dev The block number is stored in a JSON file (data/ethena_last_block.json) with the key `lastBlock`.
 *      If the file is missing or an error occurs while reading, the function returns a predefined 
 *      INITIAL_BLOCK as a default.
 */

// The file path for storing the last processed block.
const BLOCK_TRACKER_FILE = path.join(__dirname, '..', 'data', 'ethena_last_block.json');

// The default starting block number if no data is found.
const INITIAL_BLOCK = 20206857;

/**
 * @notice Retrieves the last processed block number for Ethena.
 * @dev Reads from a JSON file that stores the block number under the key `lastBlock`.
 *      If the file does not exist or an error occurs, it returns the INITIAL_BLOCK.
 */
function getLastProcessedBlock() {
  try {
    if (fs.existsSync(BLOCK_TRACKER_FILE)) {
      const data = fs.readFileSync(BLOCK_TRACKER_FILE, 'utf8');
      const json = JSON.parse(data);
      return json.lastBlock;
    }
  } catch (error) {
    console.error('Error reading last processed block:', error);
  }
  return INITIAL_BLOCK;
}

/**
 * @notice Updates the stored last processed block number for Ethena.
 * @dev Writes a JSON object with the key `lastBlock` to the tracker file.
 */
function setLastProcessedBlock(blockNumber) {
  try {
    const data = { lastBlock: blockNumber };
    fs.writeFileSync(BLOCK_TRACKER_FILE, JSON.stringify(data), 'utf8');
    console.log(`Updated last processed block to: ${blockNumber}`);
  } catch (error) {
    console.error('Error writing last processed block:', error);
  }
}

module.exports = { getLastProcessedBlock, setLastProcessedBlock };
