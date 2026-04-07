const { DateTime } = require("luxon");

function parseUTC(isoString) {
  return DateTime.fromISO(isoString, { zone: "utc" });
}

function toNY(dtUTC) {
  return dtUTC.setZone("America/New_York");
}

function formatNY(utcDateString, format = "yyyy-MM-dd HH:mm:ss") {
  return parseUTC(utcDateString).setZone("America/New_York").toFormat(format);
}

module.exports = { parseUTC, toNY, formatNY };
