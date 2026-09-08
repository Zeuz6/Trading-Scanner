// ==================================================
// SETTINGS
// ==================================================

const pinnedETFs = [
    "SPY",
    "QQQ",
    "IWM"
];

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
    "QQQ",
    "IWM"
];


// Refresh stock prices every 5 seconds
const SCANNER_REFRESH_MS = 5000;


// Refresh PMH / PML every 60 seconds
const PREMARKET_REFRESH_MS = 60000;


// Refresh EMA every 60 seconds
const EMA_REFRESH_MS = 60000;


// Stores data
const premarketCache = {};
const emaCache = {};


// Prevent overlapping requests
let scannerLoading = false;
let premarketLoading = false;
let emaLoading = false;



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
            volume / 1_000_000
        ).toFixed(2) + "M";
    }

    if (volume >= 1_000) {

        return (
            volume / 1_000
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
// TREND
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
// SNAPSHOT DATA
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

    return data.snapshots || {};
}



// ==================================================
// EMA DATA
// ==================================================

async function getEMAData() {

    const symbols =
        tickers.join(",");

    const response =
        await fetch(
            `/api/ema?symbols=${encodeURIComponent(symbols)}`
        );

    if (!response.ok) {

        throw new Error(
            "Could not load EMA data"
        );
    }

    return response.json();
}


async function refreshEMAData() {

    if (emaLoading) {
        return;
    }

    emaLoading = true;

    try {

        const data =
            await getEMAData();

        const values =
            data.ema || {};

        for (const ticker of tickers) {

            emaCache[ticker] =
                values[ticker] || {
                    ema8: null
                };
        }

        console.log(
            "10m 8EMA updated"
        );

    }

    catch (error) {

        console.error(
            "EMA update failed:",
            error
        );
    }

    finally {

        emaLoading = false;
    }
}



// ==================================================
// PREMARKET DATA
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
// EASTERN TIME
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
// SHOULD PREMARKET DATA REFRESH?
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
// REFRESH PREMARKET CACHE
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


        // ------------------------------------------
        // BUILD DATA OBJECTS
        // ------------------------------------------

        for (const ticker of tickers) {

            const data =
                snapshots[ticker];

            if (!data) {
                continue;
            }


            // Current price
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


            // Volume
            const volume =
                data.dailyBar?.v ?? 0;


            // Previous day
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


            // ------------------------------------------
            // % CHANGE
            // ------------------------------------------

            const percentChange =
                (
                    (
                        price -
                        previousClose
                    ) /
                    previousClose
                ) * 100;


            // ------------------------------------------
            // PDH / PDL BREAKS
            // ------------------------------------------

            const pdhBreak =
                price > previousHigh;

            const pdlBreak =
                price < previousLow;


            // ------------------------------------------
            // PREMARKET LEVELS
            // ------------------------------------------

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


            // ------------------------------------------
            // TREND
            // ------------------------------------------

            const trend =
                determineTrend(
                    price,
                    previousClose
                );


            // ------------------------------------------
            // 10 MINUTE 8EMA
            // ------------------------------------------

            const emaData =
                emaCache[ticker] || {
                    ema8: null
                };

            const ema8 =
                emaData.ema8;

            let emaDistance =
                null;

            if (
                ema8 !== null &&
                ema8 !== 0
            ) {

                emaDistance =
                    (
                        (
                            price -
                            ema8
                        ) /
                        ema8
                    ) * 100;
            }


            // ------------------------------------------
            // BREAKOUT PRIORITY
            // ------------------------------------------

            let priority = 0;

            // Broke both bullish levels
            if (
                pdhBreak &&
                pmhBreak
            ) {
                priority = 5;
            }

            // Broke both bearish levels
            else if (
                pdlBreak &&
                pmlBreak
            ) {
                priority = 5;
            }

            // Single bullish breakout
            else if (
                pdhBreak ||
                pmhBreak
            ) {
                priority = 4;
            }

            // Single bearish breakdown
            else if (
                pdlBreak ||
                pmlBreak
            ) {
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

                ema8,

                emaDistance,

                trend,

                priority
            });
        }



        // ==================================================
        // SORT
        // ==================================================

        scannerRows.sort(
            (a, b) => {

                const aPinned =
                    pinnedETFs.includes(
                        a.ticker
                    );

                const bPinned =
                    pinnedETFs.includes(
                        b.ticker
                    );


                // ------------------------------------------
                // 1. PINNED ETFs FIRST
                // ------------------------------------------

                if (
                    aPinned &&
                    !bPinned
                ) {
                    return -1;
                }

                if (
                    !aPinned &&
                    bPinned
                ) {
                    return 1;
                }


                // Maintain:
                // SPY → QQQ → IWM
                if (
                    aPinned &&
                    bPinned
                ) {

                    return (
                        pinnedETFs.indexOf(
                            a.ticker
                        ) -
                        pinnedETFs.indexOf(
                            b.ticker
                        )
                    );
                }


                // ------------------------------------------
                // 2. BREAKOUT PRIORITY
                // ------------------------------------------

                if (
                    b.priority !==
                    a.priority
                ) {

                    return (
                        b.priority -
                        a.priority
                    );
                }


                // ------------------------------------------
                // 3. BIGGEST % MOVER
                // ------------------------------------------

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



        // ==================================================
        // BUILD TABLE
        // ==================================================

        let tableHTML =
            "";


        for (
            const stock
            of scannerRows
        ) {

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

                ema8,

                emaDistance,

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


            // ------------------------------------------
            // PINNED ETF ROW
            // Must happen BEFORE template string
            // ------------------------------------------

            const isPinnedETF =
                pinnedETFs.includes(ticker);


            // Only true when BOTH bullish levels break
            const bullishBreak =
                pdhBreak && pmhBreak;


            // Only true when BOTH bearish levels break
            const bearishBreak =
                pdlBreak && pmlBreak;


            const rowClasses = [];


            // ----------------------------------
            // PINNED ETFs ALWAYS BLUE
            // ----------------------------------

            if (isPinnedETF) {

                rowClasses.push(
                    "pinned-etf"
                );

            }

            // ----------------------------------
            // NORMAL STOCKS
            // ----------------------------------

            else {

                if (bullishBreak) {

                    rowClasses.push(
                        "bullish-break-row"
                    );
                }

                if (bearishBreak) {

                    rowClasses.push(
                        "bearish-break-row"
                    );
                }
            }


            const rowClass =
                rowClasses.join(" ");


            // ------------------------------------------
            // TABLE ROW
            // ------------------------------------------

            tableHTML += `

                <tr class="${rowClass}">


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
                        class="level-col"
                        title="PDH: ${previousHigh.toFixed(2)}"
                    >

                        ${createBreakCell(
                            pdhBreak,
                            "up"
                        )}

                    </td>


                    <td
                        class="level-col"

                        title="${
                            pmh !== null
                                ? `PMH: ${pmh.toFixed(2)}`
                                : "PMH unavailable"
                        }"
                    >

                        ${pmhDisplay}

                    </td>


                    <td
                        class="level-col"

                        title="PDL: ${previousLow.toFixed(2)}"
                    >

                        ${createBreakCell(
                            pdlBreak,
                            "down"
                        )}

                    </td>


                    <td
                        class="level-col"

                        title="${
                            pml !== null
                                ? `PML: ${pml.toFixed(2)}`
                                : "PML unavailable"
                        }"
                    >

                        ${pmlDisplay}

                    </td>


                    <td>

                        ${
                            ema8 !== null
                                ? ema8.toFixed(2)
                                : "-"
                        }

                    </td>


                    <td class="${
                        emaDistance === null
                            ? ""
                            : emaDistance >= 0
                                ? "positive"
                                : "negative"
                    }">

                        ${
                            emaDistance !== null
                                ? `${emaDistance >= 0 ? "+" : ""}${emaDistance.toFixed(2)}%`
                                : "-"
                        }

                    </td>


                    <td>

                        ${createTrend(
                            trend
                        )}

                    </td>


                </tr>
            `;
        }



        // ------------------------------------------
        // UPDATE PAGE
        // ------------------------------------------

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

        scannerLoading =
            false;
    }
}



// ==================================================
// START SCANNER
// ==================================================

async function startScanner() {

    console.log(
        "Starting Market Scanner..."
    );


    // Load PMH / PML
    await refreshPremarketLevels();


    // Load 10m 8EMA
    await refreshEMAData();


    // Initial scanner render
    await loadScanner();



    // ------------------------------------------
    // STOCK SNAPSHOTS
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

                await loadScanner();
            }

        },

        PREMARKET_REFRESH_MS
    );



    // ------------------------------------------
    // 10 MINUTE 8EMA
    // every 60 seconds
    // ------------------------------------------

    setInterval(
        async () => {

            await refreshEMAData();

            await loadScanner();

        },

        EMA_REFRESH_MS
    );
}



// ==================================================
// RUN
// ==================================================

startScanner();