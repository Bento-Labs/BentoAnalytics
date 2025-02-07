# BentoAnalytics

Bento Analytics is a Node.js application that fetches APY data from various DeFi protocols (such as Ethena, Morpho, Mountain, and Spark) and stores it in an InfluxDB database for analysis and visualization.

## Features

- **Multi-Protocol Data Collection:**  
  Retrieves APY data from multiple protocols using blockchain logs and GraphQL APIs.
  
- **Scheduled Data Fetching:**  
  Uses cron jobs (via [node-cron](https://www.npmjs.com/package/node-cron)) to run periodic data collection tasks.
  
- **State Tracking:**  
  Tracks the last processed block or timestamp using JSON-based utilities to enable incremental data ingestion.
  
- **InfluxDB Integration:**  
  Stores time-series data (including APY, weight, and metadata) in InfluxDB for efficient querying.

## Prerequisites

- **Node.js:** v22.7.0 
- **npm:** Node Package Manager  
- **InfluxDB v2:** A running InfluxDB instance with a configured bucket  
- **Ethereum Node Access:** An endpoint via Alchemy for blockchain data

## Installation

1. **Clone the Repository**
   ```bash
   git clone project
   cd bento-server

2. **Install Dependencies**
   ```bash
   npm install

3. **Create a .env file in the project root with:**
   ```bash
   INFLUX_URL=http://localhost:8086
   INFLUX_TOKEN=your_influxdb_token
   INFLUX_ORG=your_influxdb_org
   INFLUX_BUCKET=your_influxdb_bucket
   ALCHEMY_URL=wss://eth-mainnet.alchemy.com/v2/your_api_key

## Usage

- **Start application**
   ```bash
   npm start

## Project Structure
    bentoAnalytics/
    ├── app.js                      # Main entry point and cron job scheduler
    ├── package.json                # Project configuration and dependencies
    ├── .env                        # Environment variables (not committed to source control)
    ├── data/                       # JSON state files (e.g., last_timestamp.json, ethena_last_block.json)
    ├── scripts/                    # Modules for fetching APY data from various protocols
    │   ├── fetchEthenaApy.js
    │   ├── fetchMorphoApy.js
    │   ├── fetchMountainApy.js
    │   └── fetchSparkApy.js
    └── utils/                      # Utility modules
        ├── blockTracker.js         # Tracks the last processed block for Ethena
        └── timestampTracker.js     # Tracks the last fetched timestamp (for Mountain, Spark, etc.)

## APY Calculations

## Spark
Calls the contract’s ssr() function at that block (The per second Sky Savings Rate (compounding rate)).
Formula for calculation: ( (ssr^SECONDS_PER_YEAR) - 1 ) * 100. 

**Example:**
    ```bash
    ssr = 1.0000001
    SECONDS_PER_YEAR = 31536000
    Annual Growth Factor = 1.0000001^31536000
    Net Yield = 1.05 − 1 = 0.05
    APY = 0.05×100 = 5%.

## Mountain
Calcuation is based on rewardMultiplier() function, and computes the APY.
Formula for calculation: ((currentMultiplier / previousMultiplier) - 1) * 100

**Example:**
    ```bash
    previousMultiplier = 1.00 
    currentMultiplier = 1.047
    ratio = 1.047/1.00 = 1.047
    netGrowth = 1.047 − 1 = 0.047
    APY = 0.047 * 100 = 4.7%

## Ethena
Calculation is based on rewardsTransfer event which is send every 8 hours.
The APY is calculated using the formula:
(rewardsTransfer * 3 * 365 * 100) / totalAssets

**Example**
    ```bash
   rewardsTransfer = 500
   totalAssets = 2 000 000
   dailyRewards = 500 * 3 = 1500 ( 8 * 3 = 24 hours )
   rewardsAnnualy = 1,500 × 365 = 547 500
   scalling = 547 500 * 100 = 54 750 000
   APY = 54 750 000 / 2 000 000 = 27.375%


## Initial timestamp/block

- **timestamp**
   ```bash
  spark: 1726628400
  mountain: 1716552000
  morphoUSDC: 1706140800
  morphoUSDT: 1707523200

- **block**
   ```bash
  ethena: 20206857