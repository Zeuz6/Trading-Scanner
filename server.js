const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Scanner running on port ${PORT}`);
});

const ALPACA_HEADERS = {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY
};


// --------------------------------------------------
// Make sure API keys exist
// --------------------------------------------------

if (
    !process.env.ALPACA_API_KEY ||
    !process.env.ALPACA_SECRET_KEY
) {
    console.error(
        "Missing Alpaca API keys. Check your .env file."
    );
}


// --------------------------------------------------
// Serve files inside /public
// --------------------------------------------------

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// --------------------------------------------------
// Sleep helper
// --------------------------------------------------

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}


// --------------------------------------------------
// Fetch with retry protection
// Helps with ECONNRESET / temporary Alpaca errors
// --------------------------------------------------

async function fetchWithRetry(
    url,
    options = {},
    retries = 2
) {

    for (
        let attempt = 0;
        attempt <= retries;
        attempt++
    ) {

        try {

            const response = await fetch(
                url,
                {
                    ...options,

                    // Give Alpaca 10 seconds
                    // before abandoning the request
                    signal:
                        AbortSignal.timeout(10000)
                }
            );


            // Retry rate limits and server errors
            if (
                response.status === 429 ||
                response.status >= 500
            ) {

                if (attempt < retries) {

                    console.log(
                        `Alpaca returned ${response.status}. Retrying...`
                    );

                    await sleep(
                        750 * (attempt + 1)
                    );

                    continue;
                }
            }


            if (!response.ok) {

                const message =
                    await response.text();

                throw new Error(
                    `Alpaca ${response.status}: ${message}`
                );
            }


            return response;

        }

        catch (error) {

            if (attempt === retries) {
                throw error;
            }

            console.log(
                `Connection failed (${error.message}). Retrying...`
            );

            await sleep(
                750 * (attempt + 1)
            );
        }
    }
}


// --------------------------------------------------
// Clean ticker symbols coming from browser
// --------------------------------------------------

function parseSymbols(symbolString) {

    if (!symbolString) {
        return [];
    }

    return symbolString
        .split(",")
        .map(symbol =>
            symbol
                .trim()
                .toUpperCase()
        )
        .filter(symbol =>
            /^[A-Z0-9.-]+$/.test(symbol)
        )
        .slice(0, 30);
}


// --------------------------------------------------
// Get today's New York date + UTC offset
// --------------------------------------------------

function getNewYorkDateInfo() {

    const now = new Date();


    const dateParts =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    "America/New_York",

                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(now);


    const getPart = type =>
        dateParts.find(
            part =>
                part.type === type
        )?.value;


    const year =
        getPart("year");

    const month =
        getPart("month");

    const day =
        getPart("day");


    const nyDate =
        `${year}-${month}-${day}`;


    // Automatically handles EST / EDT
    const offsetParts =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    "America/New_York",

                hour: "2-digit",

                timeZoneName:
                    "longOffset"
            }
        ).formatToParts(now);


    const offsetName =
        offsetParts.find(
            part =>
                part.type ===
                "timeZoneName"
        )?.value;


    // Example:
    // GMT-04:00 → -04:00
    const offset =
        offsetName
            ?.replace("GMT", "")
        || "-04:00";


    return {
        nyDate,
        offset
    };
}


// ==================================================
// API ROUTE #1
// ALL STOCK SNAPSHOTS
//
// Example:
// /api/snapshots?symbols=AAPL,NVDA,SPY
// ==================================================

app.get(
    "/api/snapshots",
    async (req, res) => {

        try {

            const symbols =
                parseSymbols(
                    req.query.symbols
                );


            if (symbols.length === 0) {

                return res
                    .status(400)
                    .json({
                        error:
                            "No valid symbols provided"
                    });
            }


            const params =
                new URLSearchParams({
                    symbols:
                        symbols.join(","),

                    feed: "iex"
                });


            const url =
                `https://data.alpaca.markets/v2/stocks/snapshots?${params}`;


            const response =
                await fetchWithRetry(
                    url,
                    {
                        headers:
                            ALPACA_HEADERS
                    }
                );


            const data =
                await response.json();


            res.json({
                snapshots: data
            });

        }

        catch (error) {

            console.error(
                "Snapshot error:",
                error.message
            );


            res
                .status(500)
                .json({
                    error:
                        "Failed to load stock snapshots"
                });
        }
    }
);


// ==================================================
// API ROUTE #2
// PREMARKET HIGH + LOW
//
// Calculates:
// 4:00 AM → 9:29:59 AM Eastern
//
// Example:
// /api/premarket?symbols=AAPL,NVDA,SPY
// ==================================================

app.get(
    "/api/premarket",
    async (req, res) => {

        try {

            const symbols =
                parseSymbols(
                    req.query.symbols
                );


            if (symbols.length === 0) {

                return res
                    .status(400)
                    .json({
                        error:
                            "No valid symbols provided"
                    });
            }


            const {
                nyDate,
                offset
            } =
                getNewYorkDateInfo();


            // 4:00 AM Eastern
            const start =
                `${nyDate}T04:00:00${offset}`;


            // Stop BEFORE 9:30 regular market candle
            const end =
                `${nyDate}T09:29:59${offset}`;


            // Default levels
            const levels = {};

            for (const symbol of symbols) {

                levels[symbol] = {
                    pmh: null,
                    pml: null
                };
            }


            let nextPageToken = null;


            do {

                const params =
                    new URLSearchParams({
                        symbols:
                            symbols.join(","),

                        timeframe:
                            "1Min",

                        start,
                        end,

                        feed:
                            "iex",

                        adjustment:
                            "raw",

                        sort:
                            "asc",

                        limit:
                            "10000"
                    });


                if (nextPageToken) {

                    params.set(
                        "page_token",
                        nextPageToken
                    );
                }


                const url =
                    `https://data.alpaca.markets/v2/stocks/bars?${params}`;


                const response =
                    await fetchWithRetry(
                        url,
                        {
                            headers:
                                ALPACA_HEADERS
                        }
                    );


                const data =
                    await response.json();


                const barsBySymbol =
                    data.bars || {};


                // Calculate high and low
                for (
                    const [
                        symbol,
                        bars
                    ]
                    of Object.entries(
                        barsBySymbol
                    )
                ) {

                    if (!levels[symbol]) {
                        continue;
                    }


                    for (const bar of bars) {

                        const high =
                            bar.h;

                        const low =
                            bar.l;


                        if (
                            levels[symbol].pmh === null ||
                            high >
                            levels[symbol].pmh
                        ) {
                            levels[symbol].pmh =
                                high;
                        }


                        if (
                            levels[symbol].pml === null ||
                            low <
                            levels[symbol].pml
                        ) {
                            levels[symbol].pml =
                                low;
                        }
                    }
                }


                nextPageToken =
                    data.next_page_token ||
                    null;


            } while (nextPageToken);


            res.json({
                date: nyDate,
                start,
                end,
                levels
            });

        }

        catch (error) {

            console.error(
                "Premarket error:",
                error.message
            );


            res
                .status(500)
                .json({
                    error:
                        "Failed to calculate premarket levels"
                });
        }
    }
);


// --------------------------------------------------
// Simple server health test
// --------------------------------------------------

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            status: "ok"
        });
    }
);

app.get(
    "/api/ema",
    async (req, res) => {

        try {

            const symbols =
                parseSymbols(
                    req.query.symbols
                );

            if (symbols.length === 0) {

                return res
                    .status(400)
                    .json({
                        error:
                            "No valid symbols provided"
                    });
            }


            // Get enough history for a stable EMA
            const end =
                new Date();

            const start =
                new Date(
                    end.getTime() -
                    5 * 24 * 60 * 60 * 1000
                );


            const params =
                new URLSearchParams({
                    symbols:
                        symbols.join(","),

                    timeframe:
                        "10Min",

                    start:
                        start.toISOString(),

                    end:
                        end.toISOString(),

                    feed:
                        "iex",

                    adjustment:
                        "raw",

                    sort:
                        "asc",

                    limit:
                        "10000"
                });


            const url =
                `https://data.alpaca.markets/v2/stocks/bars?${params}`;


            const response =
                await fetchWithRetry(
                    url,
                    {
                        headers:
                            ALPACA_HEADERS
                    }
                );


            const data =
                await response.json();


            const result = {};


            for (const symbol of symbols) {

                const bars =
                    data.bars?.[symbol] || [];


                if (bars.length < 8) {

                    result[symbol] = {
                        ema8: null
                    };

                    continue;
                }


                const closes =
                    bars.map(
                        bar => bar.c
                    );


                // -----------------------------
                // EMA(8)
                // -----------------------------

                const period = 8;

                const multiplier =
                    2 / (period + 1);


                // Start EMA with SMA of
                // first 8 closes
                let ema =
                    closes
                        .slice(0, period)
                        .reduce(
                            (sum, close) =>
                                sum + close,
                            0
                        ) / period;


                for (
                    let i = period;
                    i < closes.length;
                    i++
                ) {

                    ema =
                        (
                            closes[i] -
                            ema
                        ) *
                        multiplier +
                        ema;
                }


                result[symbol] = {
                    ema8: ema
                };
            }


            res.json({
                ema: result
            });

        }

        catch (error) {

            console.error(
                "EMA error:",
                error.message
            );


            res
                .status(500)
                .json({
                    error:
                        "Failed to calculate EMA"
                });
        }
    }
);

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(
    PORT,
    () => {

        console.log(
            `Scanner running at http://localhost:${PORT}`
        );
    }
);