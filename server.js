const express = require("express");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();
const WEBULL_ACCESS_TOKEN =
    process.env.WEBULL_ACCESS_TOKEN;

const WEBULL_ACCOUNT_ID =
    process.env.WEBULL_ACCOUNT_ID;

const app = express();

const PORT =
    process.env.PORT || 3000;

// ==================================================
// WEBULL SETTINGS
// ==================================================

const WEBULL_APP_KEY =
    process.env.WEBULL_APP_KEY;

const WEBULL_APP_SECRET =
    process.env.WEBULL_APP_SECRET;


// Production Webull Trading API host
const WEBULL_HOST =
    "api.webull.com";

const WEBULL_BASE_URL =
    `https://${WEBULL_HOST}`;

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
// WEBULL SIGNATURE
// ==================================================

function createWebullSignature(
    path,
    queryParams = {},
    bodyString = ""
) {

    const timestamp =
        new Date()
            .toISOString()
            .replace(
                /\.\d{3}Z$/,
                "Z"
            );


    const nonce =
        crypto
            .randomUUID()
            .replace(
                /-/g,
                ""
            );


    const signingParams = {

        ...queryParams,

        host:
            WEBULL_HOST,

        "x-app-key":
            WEBULL_APP_KEY,

        "x-signature-algorithm":
            "HMAC-SHA1",

        "x-signature-nonce":
            nonce,

        "x-signature-version":
            "1.0",

        "x-timestamp":
            timestamp
    };


    const sortedKeys =
        Object
            .keys(
                signingParams
            )
            .sort();


    const str1 =
        sortedKeys
            .map(
                key =>
                    `${key}=${signingParams[key]}`
            )
            .join("&");


    let str3 =
        `${path}&${str1}`;


    if (bodyString) {

        const bodyMd5 =
            crypto
                .createHash(
                    "md5"
                )
                .update(
                    bodyString
                )
                .digest(
                    "hex"
                )
                .toUpperCase();


        str3 +=
            `&${bodyMd5}`;
    }


    const encodedString =
        encodeURIComponent(
            str3
        );


    const signingKey =
        `${WEBULL_APP_SECRET}&`;


    const signature =
        crypto
            .createHmac(
                "sha1",
                signingKey
            )
            .update(
                encodedString
            )
            .digest(
                "base64"
            );


    return {

        timestamp,

        nonce,

        signature
    };
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

// ==================================================
// WEBULL REQUEST HELPER
// ==================================================

async function webullRequest(
    method,
    path,
    queryParams = {},
    body = null
) {

    const bodyString =
        body
            ? JSON.stringify(
                body
            )
            : "";


    const {
        timestamp,
        nonce,
        signature
    } =
        createWebullSignature(
            path,
            queryParams,
            bodyString
        );


    const params =
        new URLSearchParams(
            queryParams
        );


    const queryString =
        params.toString();


    const url =
        queryString
            ? `${WEBULL_BASE_URL}${path}?${queryString}`
            : `${WEBULL_BASE_URL}${path}`;


    const headers = {

        "x-access-token":
            WEBULL_ACCESS_TOKEN,

        "x-app-key":
            WEBULL_APP_KEY,

        "x-timestamp":
            timestamp,

        "x-signature":
            signature,

        "x-signature-algorithm":
            "HMAC-SHA1",

        "x-signature-version":
            "1.0",

        "x-signature-nonce":
            nonce,

        "x-version":
            "v3"
    };


    if (body) {

        headers[
            "Content-Type"
        ] =
            "application/json";
    }


    const response =
        await fetch(
            url,
            {

                method,

                headers,

                body:
                    body
                        ? bodyString
                        : undefined
            }
        );


    const text =
        await response.text();


    let data;


    try {

        data =
            JSON.parse(
                text
            );

    } catch {

        data =
            text;
    }


    if (
        !response.ok
    ) {

        throw new Error(
            `Webull ${response.status}: ${JSON.stringify(data)}`
        );
    }


    return data;
}

// ==================================================
// WEBULL ACCOUNT TEST
// ==================================================

app.get(
    "/api/webull/accounts",

    async (
        req,
        res
    ) => {

        try {

            const data =
                await webullRequest(
                    "GET",
                    "/trading/accounts/list"
                );


            res.json(
                data
            );

        }

        catch (error) {

            console.error(
                "Webull account error:",
                error.message
            );


            res
                .status(500)
                .json({

                    error:
                        "Failed to connect to Webull",

                    message:
                        error.message
                });
        }
    }
);

// ==================================================
// CREATE WEBULL ACCESS TOKEN
// ==================================================

app.post(
    "/api/webull/create-token",

    async (req, res) => {

        try {

            const data =
                await webullRequest(
                    "POST",
                    "/auth/tokens/create"
                );

            console.log(
                "Webull token response:",
                data
            );

            res.json(data);

        } catch (error) {

            console.error(
                "Create token error:",
                error.message
            );

            res
                .status(500)
                .json({
                    error:
                        "Failed to create Webull token",

                    message:
                        error.message
                });
        }
    }
);

// ==================================================
// CHECK WEBULL TOKEN STATUS
// ==================================================

app.post(
    "/api/webull/check-token",

    async (req, res) => {

        try {

            const data =
                await webullRequest(
                    "POST",
                    "/auth/tokens/check",
                    {},
                    {
                        token:
                            WEBULL_ACCESS_TOKEN
                    }
                );


            res.json(data);

        } catch (error) {

            console.error(
                "Check token error:",
                error.message
            );


            res
                .status(500)
                .json({
                    error:
                        "Failed to check Webull token",

                    message:
                        error.message
                });
        }
    }
);



// ==================================================
// WEBULL COMPLETED OPTIONS JOURNAL
// ==================================================

app.get(
    "/api/webull/options-history",

    async (req, res) => {

        try {

            const accountId =
                WEBULL_ACCOUNT_ID;

            if (!accountId) {

                return res
                    .status(500)
                    .json({
                        error:
                            "WEBULL_ACCOUNT_ID is missing from .env"
                    });
            }


            const queryParams = {

                account_id:
                    accountId,

                start_time:
                    req.query.start_time ||
                    "2026-10-01T00:00:00.000Z",

                end_time:
                    req.query.end_time ||
                    new Date().toISOString()
            };


            const data =
                await webullRequest(
                    "GET",
                    "/trading/orders/historical-orders/list",
                    queryParams
                );


            // ==========================================
            // FLATTEN FILLED OPTION ORDERS
            // ==========================================

            const filledOrders = [];


            for (const group of data.data || []) {

                for (const order of group.orders || []) {

                    if (
                        order.instrument_type !== "OPTION" ||
                        order.status !== "FILLED" ||
                        Number(order.filled_quantity) <= 0
                    ) {
                        continue;
                    }


                    const leg =
                        order.legs?.[0];


                    if (!leg) {
                        continue;
                    }


                    const fees =
                        (order.fees || [])
                            .reduce(
                                (sum, fee) =>
                                    sum +
                                    Number(
                                        fee.actual_value || 0
                                    ),
                                0
                            );


                    filledOrders.push({

                        symbol:
                            order.symbol,

                        side:
                            order.side,

                        positionIntent:
                            order.position_intent || null,

                        quantity:
                            Number(
                                order.filled_quantity
                            ),

                        price:
                            Number(
                                order.filled_price
                            ),

                        filledAt:
                            order.filled_time_at,

                        optionType:
                            leg.option_type,

                        strike:
                            Number(
                                leg.strike_price
                            ),

                        expiration:
                            leg.option_expire_date,

                        multiplier:
                            Number(
                                leg.option_contract_multiplier ||
                                100
                            ),

                        fees:
                            fees,

                        orderType:
                            order.order_type
                    });
                }
            }


            // Oldest first
            filledOrders.sort(
                (a, b) =>
                    new Date(a.filledAt) -
                    new Date(b.filledAt)
            );


            // ==========================================
            // CONTRACT MATCHING
            // ==========================================

            function contractKey(order) {

                return [
                    order.symbol,
                    order.optionType,
                    order.strike,
                    order.expiration
                ].join("|");
            }


            const openTrades =
                new Map();

            const completedTrades =
                [];


            // ==========================================
            // PROCESS ORDERS
            // ==========================================

            for (const order of filledOrders) {

                const key =
                    contractKey(order);


                // --------------------------------------
                // BUY = OPEN LONG OPTION
                // --------------------------------------

                if (
                    order.side === "BUY" &&
                    (
                        order.positionIntent ===
                            "BUY_TO_OPEN" ||
                        !order.positionIntent
                    )
                ) {

                    if (!openTrades.has(key)) {

                        openTrades.set(
                            key,
                            []
                        );
                    }


                    openTrades
                        .get(key)
                        .push({

                            symbol:
                                order.symbol,

                            optionType:
                                order.optionType,

                            strike:
                                order.strike,

                            expiration:
                                order.expiration,

                            multiplier:
                                order.multiplier,

                            entryTime:
                                order.filledAt,

                            entryPrice:
                                order.price,

                            originalQuantity:
                                order.quantity,

                            remainingQuantity:
                                order.quantity,

                            entryFees:
                                order.fees,

                            exitQuantity:
                                0,

                            exitValue:
                                0,

                            exitFees:
                                0,

                            lastExitTime:
                                null
                        });


                    continue;
                }


                // --------------------------------------
                // SELL = CLOSE LONG OPTION
                //
                // Important:
                // Webull stop-loss fills may NOT contain
                // position_intent, so SELL is enough when
                // a matching open position exists.
                // --------------------------------------

                if (order.side === "SELL") {

                    const lots =
                        openTrades.get(key);


                    if (!lots?.length) {
                        continue;
                    }


                    let quantityToClose =
                        order.quantity;


                    for (const trade of lots) {

                        if (
                            quantityToClose <= 0
                        ) {
                            break;
                        }


                        if (
                            trade.remainingQuantity <= 0
                        ) {
                            continue;
                        }


                        const matchedQuantity =
                            Math.min(
                                trade.remainingQuantity,
                                quantityToClose
                            );


                        const exitFeeShare =
                            order.fees *
                            (
                                matchedQuantity /
                                order.quantity
                            );


                        trade.exitQuantity +=
                            matchedQuantity;


                        trade.exitValue +=
                            (
                                order.price *
                                order.multiplier *
                                matchedQuantity
                            );


                        trade.exitFees +=
                            exitFeeShare;


                        trade.remainingQuantity -=
                            matchedQuantity;


                        trade.lastExitTime =
                            order.filledAt;


                        quantityToClose -=
                            matchedQuantity;


                        // ==================================
                        // TRADE COMPLETELY CLOSED
                        // ==================================

                        if (
                            trade.remainingQuantity === 0
                        ) {

                            const entryValue =
                                trade.entryPrice *
                                trade.multiplier *
                                trade.originalQuantity;


                            const averageExitPrice =
                                trade.exitValue /
                                (
                                    trade.multiplier *
                                    trade.exitQuantity
                                );


                            const grossPnL =
                                trade.exitValue -
                                entryValue;


                            const totalFees =
                                trade.entryFees +
                                trade.exitFees;


                            const netPnL =
                                grossPnL -
                                totalFees;


                            const returnPercent =
                                (
                                    netPnL /
                                    entryValue
                                ) * 100;


                            completedTrades.push({

                                date:
                                    trade.lastExitTime,

                                ticker:
                                    trade.symbol,

                                type:
                                    trade.optionType,

                                strike:
                                    trade.strike,

                                expiration:
                                    trade.expiration,

                                quantity:
                                    trade.originalQuantity,

                                entry:
                                    Number(
                                        trade.entryPrice
                                            .toFixed(2)
                                    ),

                                exit:
                                    Number(
                                        averageExitPrice
                                            .toFixed(2)
                                    ),

                                entryValue:
                                    Number(
                                        entryValue
                                            .toFixed(2)
                                    ),

                                exitValue:
                                    Number(
                                        trade.exitValue
                                            .toFixed(2)
                                    ),

                                grossPnL:
                                    Number(
                                        grossPnL
                                            .toFixed(2)
                                    ),

                                fees:
                                    Number(
                                        totalFees
                                            .toFixed(2)
                                    ),

                                pnl:
                                    Number(
                                        netPnL
                                            .toFixed(2)
                                    ),

                                returnPercent:
                                    Number(
                                        returnPercent
                                            .toFixed(2)
                                    ),

                                result:
                                    netPnL >= 0
                                        ? "WIN"
                                        : "LOSS",

                                entryTime:
                                    trade.entryTime,

                                exitTime:
                                    trade.lastExitTime
                            });
                        }
                    }
                }
            }


            // ==========================================
            // NEWEST FIRST
            // ==========================================

            completedTrades.sort(
                (a, b) =>
                    new Date(b.exitTime) -
                    new Date(a.exitTime)
            );


            // ==========================================
            // STILL-OPEN POSITIONS
            // ==========================================

            const openPositions = [];


            for (const lots of openTrades.values()) {

                for (const trade of lots) {

                    if (
                        trade.remainingQuantity > 0
                    ) {

                        openPositions.push({

                            ticker:
                                trade.symbol,

                            type:
                                trade.optionType,

                            strike:
                                trade.strike,

                            expiration:
                                trade.expiration,

                            quantity:
                                trade.remainingQuantity,

                            entry:
                                trade.entryPrice,

                            entryTime:
                                trade.entryTime
                        });
                    }
                }
            }


            res.json({

                filled_option_orders:
                    filledOrders.length,

                completed_trades:
                    completedTrades.length,

                trades:
                    completedTrades,

                open_positions:
                    openPositions
            });


        } catch (error) {

            console.error(
                "Webull options history error:",
                error.message
            );


            res
                .status(500)
                .json({
                    error:
                        "Failed to load Webull options history",

                    message:
                        error.message
                });
        }
    }
);