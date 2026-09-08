// ==================================================
// SETTINGS
// ==================================================

const tickers = [
    "AAPL",
    "NVDA",
    "META",
    "AMD",
    "TSLA",
    "AMZN",
    "GOOGL",
    "MSFT",
    "NFLX",
    "AVGO",
    "MU",
    "PLTR",
    "INTC",
    "QCOM",
    "ORCL",
    "CRM",
    "JPM",
    "COIN",
    "SPY",
    "QQQ"
];


// Refresh stock prices every 5 seconds
const SCANNER_REFRESH_MS =
    5000;


// Refresh PMH/PML every 60 seconds
// while premarket is active
const PREMARKET_REFRESH_MS =
    60000;


// Stores PMH/PML
const premarketCache = {};


// Prevent overlapping requests
let scannerLoading = false;

let premarketLoading = false;



// ==================================================
// FORMAT VOLUME
// ==================================================

function formatVolume(volume) {

    if (
        volume === null ||
        volume === undefined
    ) {
        return "-";
    }


    if (volume >= 1_000_000) {

        return (
            volume /
            1_000_000
        ).toFixed(2) + "M";
    }


    if (volume >= 1_000) {

        return (
            volume /
            1_000
        ).toFixed(2) + "K";
    }


    return volume.toString();
}



// ==================================================
// BREAK INDICATOR
// ==================================================

function createBreakCell(
    broken,
    direction
) {

    if (!broken) {
        return "";
    }


    if (direction === "up") {

        return `
            <span class="break-up">
                ●
            </span>
        `;
    }


    return `
        <span class="break-down">
            ●
        </span>
    `;
}



// ==================================================
// BASIC TREND
// ==================================================

function determineTrend(
    price,
    previousClose
) {

    if (price > previousClose) {
        return "bullish";
    }


    if (price < previousClose) {
        return "bearish";
    }


    return "neutral";
}



function createTrend(trend) {

    if (trend === "bullish") {

        return `
            <span class="bullish">
                ▲
            </span>
        `;
    }


    if (trend === "bearish") {

        return `
            <span class="bearish">
                ▼
            </span>
        `;
    }


    return `
        <span class="neutral">
            ⚠
        </span>
    `;
}



// ==================================================
// GET ALL SNAPSHOTS
// ONE request for all tickers
// ==================================================

async function getAllSnapshots() {

    const symbols =
        tickers.join(",");


    const response =
        await fetch(
            `/api/snapshots?symbols=${encodeURIComponent(symbols)}`
        );


    if (!response.ok) {

        throw new Error(
            "Could not load snapshots"
        );
    }


    const data =
        await response.json();


    return data.snapshots;
}



// ==================================================
// GET ALL PMH / PML LEVELS
// ONE request for all tickers
// ==================================================

async function getPremarketLevels() {

    const symbols =
        tickers.join(",");


    const response =
        await fetch(
            `/api/premarket?symbols=${encodeURIComponent(symbols)}`
        );


    if (!response.ok) {

        throw new Error(
            "Could not load premarket levels"
        );
    }


    return response.json();
}



// ==================================================
// DETECT CURRENT EASTERN TIME
// ==================================================

function getEasternTime() {

    const parts =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    "America/New_York",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                hourCycle:
                    "h23"
            }
        ).formatToParts(
            new Date()
        );


    const hour =
        Number(
            parts.find(
                part =>
                    part.type === "hour"
            )?.value
        );


    const minute =
        Number(
            parts.find(
                part =>
                    part.type === "minute"
            )?.value
        );


    return {
        hour,
        minute
    };
}



// ==================================================
// SHOULD PMH/PML STILL UPDATE?
//
// 4:00 AM → 9:35 AM ET
//
// Extra 5 minutes allows one final refresh
// after premarket closes.
// ==================================================

function shouldRefreshPremarket() {

    const {
        hour,
        minute
    } =
        getEasternTime();


    const minutesSinceMidnight =
        hour * 60 +
        minute;


    const start =
        4 * 60;


    const stop =
        9 * 60 + 35;


    return (
        minutesSinceMidnight >= start &&
        minutesSinceMidnight < stop
    );
}



// ==================================================
// UPDATE PREMARKET CACHE
// ==================================================

async function refreshPremarketLevels() {

    if (premarketLoading) {
        return;
    }


    premarketLoading = true;


    try {

        const data =
            await getPremarketLevels();


        const levels =
            data.levels || {};


        for (const ticker of tickers) {

            premarketCache[ticker] =
                levels[ticker] || {
                    pmh: null,
                    pml: null
                };
        }


        console.log(
            "PMH/PML updated:",
            data.date
        );

    }

    catch (error) {

        console.error(
            "Premarket update failed:",
            error
        );
    }

    finally {

        premarketLoading = false;
    }
}



// ==================================================
// MAIN SCANNER
// ==================================================

async function loadScanner() {

    if (scannerLoading) {
        return;
    }

    scannerLoading = true;

    try {

        const snapshots =
            await getAllSnapshots();

        const scannerRows = [];

        for (const ticker of tickers) {

            const data =
                snapshots[ticker];

            if (!data) {
                continue;
            }

            const price =
                data.latestTrade?.p ??
                data.minuteBar?.c ??
                data.dailyBar?.c;

            if (
                price === null ||
                price === undefined
            ) {
                continue;
            }

            const volume =
                data.dailyBar?.v ?? 0;

            const previousClose =
                data.prevDailyBar?.c;

            const previousHigh =
                data.prevDailyBar?.h;

            const previousLow =
                data.prevDailyBar?.l;

            if (
                previousClose === undefined ||
                previousHigh === undefined ||
                previousLow === undefined
            ) {
                continue;
            }

            const percentChange =
                (
                    (
                        price -
                        previousClose
                    ) /
                    previousClose
                ) * 100;

            const pdhBreak =
                price > previousHigh;

            const pdlBreak =
                price < previousLow;

            const premarket =
                premarketCache[ticker] || {
                    pmh: null,
                    pml: null
                };

            const pmh =
                premarket.pmh;

            const pml =
                premarket.pml;

            const pmhBreak =
                pmh !== null &&
                price > pmh;

            const pmlBreak =
                pml !== null &&
                price < pml;

            const trend =
                determineTrend(
                    price,
                    previousClose
                );

            // ----------------------------------
            // PRIORITY SCORE
            // ----------------------------------

            let priority = 0;

            // Bullish strongest:
            // broke BOTH PDH and PMH
            if (pdhBreak && pmhBreak) {
                priority = 5;
            }

            // Bearish strongest:
            // broke BOTH PDL and PML
            else if (pdlBreak && pmlBreak) {
                priority = 5;
            }

            // Bullish single breakout
            else if (pdhBreak || pmhBreak) {
                priority = 4;
            }

            // Bearish single breakdown
            else if (pdlBreak || pmlBreak) {
                priority = 4;
            }

            // No major breakout
            else {
                priority = 1;
            }

            scannerRows.push({
                ticker,
                price,
                volume,
                percentChange,

                previousHigh,
                previousLow,

                pmh,
                pml,

                pdhBreak,
                pdlBreak,
                pmhBreak,
                pmlBreak,

                trend,
                priority
            });
        }


        // ----------------------------------
        // SORT
        // ----------------------------------

        scannerRows.sort(
            (a, b) => {

                // First: breakout priority
                if (
                    b.priority !==
                    a.priority
                ) {
                    return (
                        b.priority -
                        a.priority
                    );
                }

                // Second:
                // strongest % mover
                return (
                    Math.abs(
                        b.percentChange
                    ) -
                    Math.abs(
                        a.percentChange
                    )
                );
            }
        );


        // ----------------------------------
        // BUILD TABLE
        // ----------------------------------

        let tableHTML = "";

        for (const stock of scannerRows) {

            const {
                ticker,
                price,
                volume,
                percentChange,

                previousHigh,
                previousLow,

                pmh,
                pml,

                pdhBreak,
                pdlBreak,
                pmhBreak,
                pmlBreak,

                trend
            } = stock;

            const changeClass =
                percentChange >= 0
                    ? "positive"
                    : "negative";

            const pmhDisplay =
                pmh === null
                    ? "-"
                    : createBreakCell(
                        pmhBreak,
                        "up"
                    );

            const pmlDisplay =
                pml === null
                    ? "-"
                    : createBreakCell(
                        pmlBreak,
                        "down"
                    );

            tableHTML += `

                <tr>

                    <td class="ticker">
                        $${ticker}
                    </td>

                    <td>
                        ${price.toFixed(2)}
                    </td>

                    <td>
                        ${formatVolume(volume)}
                    </td>

                    <td class="${changeClass}">
                        ${percentChange.toFixed(2)}%
                    </td>

                    <td
                        title="PDH: ${previousHigh.toFixed(2)}"
                    >
                        ${createBreakCell(
                            pdhBreak,
                            "up"
                        )}
                    </td>

                    <td
                        title="PDL: ${previousLow.toFixed(2)}"
                    >
                        ${createBreakCell(
                            pdlBreak,
                            "down"
                        )}
                    </td>

                    <td
                        title="${
                            pmh !== null
                                ? `PMH: ${pmh.toFixed(2)}`
                                : "PMH unavailable"
                        }"
                    >
                        ${pmhDisplay}
                    </td>

                    <td
                        title="${
                            pml !== null
                                ? `PML: ${pml.toFixed(2)}`
                                : "PML unavailable"
                        }"
                    >
                        ${pmlDisplay}
                    </td>

                    <td>
                        ${createTrend(trend)}
                    </td>

                </tr>
            `;
        }

        document.getElementById(
            "scanner-body"
        ).innerHTML =
            tableHTML;

    }

    catch (error) {

        console.error(
            "Scanner update failed:",
            error
        );
    }

    finally {

        scannerLoading = false;
    }
}



// ==================================================
// START SCANNER
// ==================================================

async function startScanner() {

    console.log(
        "Starting Market Scanner..."
    );


    // Get today's PMH / PML
    await refreshPremarketLevels();


    // Get initial stock prices
    await loadScanner();


    // ------------------------------------------
    // STOCK DATA
    // every 5 seconds
    // ------------------------------------------

    setInterval(
        loadScanner,
        SCANNER_REFRESH_MS
    );


    // ------------------------------------------
    // PMH / PML
    // every 60 seconds during premarket
    // ------------------------------------------

    setInterval(
        async () => {

            if (
                shouldRefreshPremarket()
            ) {

                await refreshPremarketLevels();


                // Immediately redraw table
                // after PMH/PML changes
                await loadScanner();
            }

        },

        PREMARKET_REFRESH_MS
    );
}



startScanner();