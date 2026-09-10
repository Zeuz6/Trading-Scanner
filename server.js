const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT =
    process.env.PORT || 3000;


// ==================================================
// ALPACA HEADERS
// ==================================================

const ALPACA_HEADERS = {

    "APCA-API-KEY-ID":
        process.env.ALPACA_API_KEY,

    "APCA-API-SECRET-KEY":
        process.env.ALPACA_SECRET_KEY
};


// Make sure credentials exist
if (
    !process.env.ALPACA_API_KEY ||
    !process.env.ALPACA_SECRET_KEY
) {

    console.error(
        "❌ Missing Alpaca API keys. Check your .env file."
    );
}



// ==================================================
// SERVE WEBSITE
// ==================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);



// ==================================================
// HELPER: SLEEP
// ==================================================

function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}



// ==================================================
// FETCH WITH RETRY
// ==================================================

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

            const response =
                await fetch(
                    url,
                    {
                        ...options,

                        signal:
                            AbortSignal.timeout(
                                10000
                            )
                    }
                );


            // Retry temporary server errors
            if (
                response.status === 429 ||
                response.status >= 500
            ) {

                if (
                    attempt < retries
                ) {

                    console.log(
                        `⚠️ Alpaca returned ${response.status}. Retrying...`
                    );

                    await sleep(
                        750 *
                        (attempt + 1)
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

            if (
                attempt === retries
            ) {

                throw error;
            }


            console.log(
                `⚠️ Request failed: ${error.message}`
            );

            console.log(
                "Retrying..."
            );


            await sleep(
                750 *
                (attempt + 1)
            );
        }
    }
}



// ==================================================
// PARSE STOCK SYMBOLS
// ==================================================

function parseSymbols(
    symbolString
) {

    if (!symbolString) {

        return [];
    }


    return symbolString

        .split(",")

        .map(
            symbol =>
                symbol
                    .trim()
                    .toUpperCase()
        )

        .filter(
            symbol =>
                /^[A-Z0-9.-]+$/.test(
                    symbol
                )
        )

        .slice(
            0,
            30
        );
}



// ==================================================
// NEW YORK DATE / TIME
// Automatically handles EST / EDT
// ==================================================

function getNewYorkInfo() {

    const now =
        new Date();


    const formatter =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    "America/New_York",

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit",

                hourCycle:
                    "h23"
            }
        );


    const parts =
        formatter.formatToParts(
            now
        );


    const get =
        type =>
            parts.find(
                part =>
                    part.type === type
            )?.value;


    const year =
        Number(
            get("year")
        );

    const month =
        Number(
            get("month")
        );

    const day =
        Number(
            get("day")
        );

    const hour =
        Number(
            get("hour")
        );

    const minute =
        Number(
            get("minute")
        );

    const second =
        Number(
            get("second")
        );


    // Convert New York wall-clock time
    // into a timezone offset.
    const newYorkAsUTC =
        Date.UTC(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        );


    const offsetMinutes =
        Math.round(
            (
                newYorkAsUTC -
                now.getTime()
            ) /
            60000
        );


    const sign =
        offsetMinutes >= 0
            ? "+"
            : "-";


    const absoluteOffset =
        Math.abs(
            offsetMinutes
        );


    const offsetHours =
        Math.floor(
            absoluteOffset / 60
        );


    const offsetMins =
        absoluteOffset % 60;


    const offset =
        `${sign}${String(
            offsetHours
        ).padStart(
            2,
            "0"
        )}:${String(
            offsetMins
        ).padStart(
            2,
            "0"
        )}`;


    const nyDate =
        `${year}-${String(
            month
        ).padStart(
            2,
            "0"
        )}-${String(
            day
        ).padStart(
            2,
            "0"
        )}`;


    return {

        nyDate,

        hour,

        minute,

        second,

        offset
    };
}



// ==================================================
// FETCH MULTI-SYMBOL BARS
//
// IMPORTANT:
// Automatically follows Alpaca pagination.
// ==================================================

async function getAllBars({

    symbols,

    timeframe,

    start,

    end,

    feed

}) {

    const barsBySymbol = {};

    for (
        const symbol
        of symbols
    ) {

        barsBySymbol[symbol] =
            [];
    }


    let nextPageToken =
        null;


    do {

        const params =
            new URLSearchParams({

                symbols:
                    symbols.join(","),

                timeframe,

                start,

                end,

                feed,

                adjustment:
                    "raw",

                sort:
                    "asc",

                limit:
                    "10000"
            });


        if (
            nextPageToken
        ) {

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


        const returnedBars =
            data.bars || {};


        for (
            const [
                symbol,
                bars
            ]
            of Object.entries(
                returnedBars
            )
        ) {

            if (
                !barsBySymbol[
                    symbol
                ]
            ) {

                barsBySymbol[
                    symbol
                ] = [];
            }


            barsBySymbol[
                symbol
            ].push(
                ...bars
            );
        }


        nextPageToken =
            data.next_page_token ||
            null;


    } while (
        nextPageToken
    );


    return barsBySymbol;
}



// ==================================================
// SNAPSHOT ROUTE
//
// Example:
// /api/snapshots?symbols=AAPL,NVDA,SPY
// ==================================================

app.get(
    "/api/snapshots",

    async (
        req,
        res
    ) => {

        try {

            const symbols =
                parseSymbols(
                    req.query.symbols
                );


            if (
                symbols.length === 0
            ) {

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

                    feed:
                        "iex"
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

                snapshots:
                    data
            });

        }

        catch (error) {

            console.error(
                "❌ Snapshot error:",
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
// PREMARKET ROUTE
//
// 4:00 AM → 9:29:59 AM ET
//
// Before 9:45:
//     IEX provisional levels
//
// After 9:45:
//     SIP finalized levels
//
// Example:
// /api/premarket?symbols=NVDA
// ==================================================

app.get(
    "/api/premarket",

    async (
        req,
        res
    ) => {

        try {

            const symbols =
                parseSymbols(
                    req.query.symbols
                );


            if (
                symbols.length === 0
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "No valid symbols provided"
                    });
            }


            const {

                nyDate,

                hour,

                minute,

                offset

            } =
                getNewYorkInfo();


            // ------------------------------------------
            // PREMARKET SESSION
            // ------------------------------------------

            const start =
                `${nyDate}T04:00:00${offset}`;


            const end =
                `${nyDate}T09:29:59${offset}`;



            // ------------------------------------------
            // CHOOSE DATA FEED
            // ------------------------------------------

            const easternMinutes =
                hour * 60 +
                minute;


            const SIP_START_TIME =
                9 * 60 + 45;


            const feed =
                easternMinutes >=
                SIP_START_TIME

                    ? "sip"

                    : "iex";


            console.log(
                `📊 Premarket feed: ${feed.toUpperCase()}`
            );


            // ------------------------------------------
            // GET PREMARKET BARS
            // ------------------------------------------

            const barsBySymbol =
                await getAllBars({

                    symbols,

                    timeframe:
                        "1Min",

                    start,

                    end,

                    feed
                });



            // ------------------------------------------
            // CALCULATE PMH / PML
            // ------------------------------------------

            const levels =
                {};


            for (
                const symbol
                of symbols
            ) {

                const bars =
                    barsBySymbol[
                        symbol
                    ] || [];


                if (
                    bars.length === 0
                ) {

                    levels[
                        symbol
                    ] = {

                        pmh:
                            null,

                        pml:
                            null
                    };


                    continue;
                }


                let pmh =
                    -Infinity;


                let pml =
                    Infinity;


                for (
                    const bar
                    of bars
                ) {

                    if (
                        bar.h >
                        pmh
                    ) {

                        pmh =
                            bar.h;
                    }


                    if (
                        bar.l <
                        pml
                    ) {

                        pml =
                            bar.l;
                    }
                }


                levels[
                    symbol
                ] = {

                    pmh,

                    pml
                };
            }



            // ------------------------------------------
            // NVDA DEBUG
            // ------------------------------------------

            if (
                symbols.includes(
                    "NVDA"
                )
            ) {

                console.log(
                    "--------------------------------"
                );

                console.log(
                    "NVDA PMH:",
                    levels[
                        "NVDA"
                    ]?.pmh
                );

                console.log(
                    "NVDA PML:",
                    levels[
                        "NVDA"
                    ]?.pml
                );

                console.log(
                    "NVDA bars:",
                    barsBySymbol[
                        "NVDA"
                    ]?.length ||
                    0
                );

                console.log(
                    "Feed:",
                    feed
                );

                console.log(
                    "--------------------------------"
                );
            }



            res.json({

                date:
                    nyDate,

                feed,

                start,

                end,

                levels
            });

        }

        catch (error) {

            console.error(
                "❌ Premarket error:",
                error.message
            );


            res
                .status(500)
                .json({

                    error:
                        "Failed to calculate premarket levels",

                    message:
                        error.message
                });
        }
    }
);



// ==================================================
// 10 MINUTE 8EMA ROUTE
//
// Example:
// /api/ema?symbols=AAPL,NVDA,SPY
// ==================================================

app.get(
    "/api/ema",

    async (
        req,
        res
    ) => {

        try {

            const symbols =
                parseSymbols(
                    req.query.symbols
                );


            if (
                symbols.length === 0
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "No valid symbols provided"
                    });
            }



            // Get enough history
            // to calculate a stable EMA
            const endDate =
                new Date();


            const startDate =
                new Date(
                    endDate.getTime() -
                    (
                        14 *
                        24 *
                        60 *
                        60 *
                        1000
                    )
                );


            const barsBySymbol =
                await getAllBars({

                    symbols,

                    timeframe:
                        "10Min",

                    start:
                        startDate
                            .toISOString(),

                    end:
                        endDate
                            .toISOString(),

                    feed:
                        "iex"
                });



            const result =
                {};


            const period =
                8;


            const multiplier =
                2 /
                (
                    period +
                    1
                );



            for (
                const symbol
                of symbols
            ) {

                const bars =
                    barsBySymbol[
                        symbol
                    ] || [];


                if (
                    bars.length <
                    period
                ) {

                    result[
                        symbol
                    ] = {

                        ema8:
                            null
                    };


                    continue;
                }


                const closes =
                    bars.map(
                        bar =>
                            bar.c
                    );



                // ------------------------------------------
                // INITIAL SMA
                // ------------------------------------------

                let ema =
                    closes
                        .slice(
                            0,
                            period
                        )
                        .reduce(
                            (
                                sum,
                                close
                            ) =>
                                sum +
                                close,

                            0
                        )
                    /
                    period;



                // ------------------------------------------
                // EMA CALCULATION
                // ------------------------------------------

                for (
                    let i =
                        period;

                    i <
                    closes.length;

                    i++
                ) {

                    ema =
                        (
                            (
                                closes[
                                    i
                                ] -
                                ema
                            )
                            *
                            multiplier
                        )
                        +
                        ema;
                }


                result[
                    symbol
                ] = {

                    ema8:
                        ema,

                    barsUsed:
                        bars.length
                };
            }



            res.json({

                ema:
                    result
            });

        }

        catch (error) {

            console.error(
                "❌ EMA error:",
                error.message
            );


            res
                .status(500)
                .json({

                    error:
                        "Failed to calculate EMA",

                    message:
                        error.message
                });
        }
    }
);



// ==================================================
// HEALTH CHECK
// Used by Render
// ==================================================

app.get(
    "/api/health",

    (
        req,
        res
    ) => {

        res.json({

            status:
                "ok",

            server:
                "Trading Scanner"
        });
    }
);



// ==================================================
// START SERVER
// ==================================================

app.listen(
    PORT,
    "0.0.0.0",

    () => {

        console.log(
            "================================"
        );

        console.log(
            `🚀 Scanner running on port ${PORT}`
        );

        console.log(
            `Local: http://localhost:${PORT}`
        );

        console.log(
            "================================"
        );
    }
);