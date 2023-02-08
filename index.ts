const { launch } = require("puppeteer");
require("dotenv").config();

const { GoogleSpreadsheet } = require("google-spreadsheet");

const cheerio = require("cheerio");
const axios = require("axios");

const SPREADSHEET_ID = "1BS8oimF6-noNkr7fVAg2X96rvY_m8usqqbFt5YxAba4";
// credentials from env
const credentials = {
  client_email: process.env.GAPI_CLIENT_EMAIL,
  private_key: process.env.GAPI_PRIVATE_KEY,
};

// understand the pattern of the above html and use it to make a cheerio function to scrape the data

function convertData(data) {
  return data.map((item) => {
    const poolCellData = item.poolCellData;
    let pool_name, pool_desc;
    if (poolCellData[0].includes("Stake")) {
      const index = poolCellData[0].indexOf("Stake");
      pool_name = poolCellData[0].substring(0, index).trim();
      pool_desc = poolCellData[0].substring(index);
    } else {
      pool_name = poolCellData[0].trim();
      pool_desc = "";
    }
    return {
      pool_name,
      pool_desc,
      apr: poolCellData[2].startsWith("Locked APR")
        ? poolCellData[2].split("Up to")[1].trim()
        : poolCellData[2].split("APR")[1].trim(),
    };
  });
}

async function scrapeCheerio(html) {
  const $ = cheerio.load(html);
  const poolRows = $('div[role="row"]');
  const poolData = [];
  poolRows.each((i, row) => {
    const poolCellData = $(row)
      .find("div[role='cell']")
      .map((i, cell) => {
        return $(cell).text();
      })
      .get();
    // @ts-ignore
    poolData.push({ poolCellData: poolCellData });
  });

  const data = convertData(poolData);

  return data;
}

async function performScraping() {
  const browser = await launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("https://pancakeswap.finance/pools");
  await page.waitForSelector("div[class='sc-c56ebc7d-0 feFKuX']");
  // then wait for 2 seconds
  await page.waitForTimeout(3000);
  const html = await page.content();
  const rowsData = await scrapeCheerio(html);

  await browser.close();
  return rowsData;
}

const addDataToSpreadSheet = async () => {
  const rowsdata = await performScraping();

  const headerValues = ["PoolName", "PoolDesc", "APR"];

  const rows = rowsdata.map((row) => {
    return {
      PoolName: row.pool_name,
      PoolDesc: row.pool_desc,
      APR: row.apr,
    };
  });
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(credentials);
  await doc.loadInfo(); // loads document properties and worksheets
  console.log(doc.title);

  const sheet = doc.sheetsByIndex[0]; // or use doc.sheetsById[id]
  //   everytime you run this script, remove all rows except header and addRows
  await sheet.clear();
  await sheet.setHeaderRow(headerValues);
  const result = await sheet.addRows(rows);

  console.log(result);
};

setInterval(() => {
  addDataToSpreadSheet();
}, 120000);
