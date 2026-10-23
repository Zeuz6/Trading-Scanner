// ==================================================
// OPTIONS JOURNAL DATA
// ==================================================
//
// For now these trades are entered manually.
// Later this array will be replaced by Webull API data.
//
// IMPORTANT:
// This journal is OPTIONS ONLY.
// Stock holdings are not included.
// ==================================================

const optionTrades = [

  {
        date: "10/23/2026",
        ticker: "CRWD",
        type: "Call",
        strike: "-",
        entry: 34.00,
        exit: 26.00,
        notes: ""
    },  
    {
        date: "10/23/2026",
        ticker: "XOM",
        type: "Call",
        strike: "-",
        entry: 24.00,
        exit: 12.00,
        notes: ""
    },
    {
        date: "10/22/2026",
        ticker: "AMZN",
        type: "Call",
        strike: "-",
        entry: 39.14,
        exit: 62.86,
        notes: ""
    },

    {
        date: "10/21/2026",
        ticker: "PLTR",
        type: "Call",
        strike: "-",
        entry: 23.05,
        exit: 36.94,
        notes: ""
    },

    {
        date: "10/20/2026",
        ticker: "MSTR",
        type: "Call",
        strike: "-",
        entry: 16.05,
        exit: 20.94,
        notes: ""
    },

    {
        date: "10/20/2026",
        ticker: "INTC",
        type: "Put",
        strike: "-",
        entry: 29.05,
        exit: 20.94,
        notes: ""
    }

];



// ==================================================
// MONEY FORMATTER
// ==================================================

function formatMoney(value) {

    const sign =
        value > 0
            ? "+"
            : "";

    return (
        sign +
        "$" +
        value.toFixed(2)
    );
}



// ==================================================
// CALCULATE TRADE P/L
// ==================================================

function calculateTradePnL(trade) {

    return (
        trade.exit -
        trade.entry
    );
}



// ==================================================
// CALCULATE JOURNAL STATS
// ==================================================

function calculateStats() {

    if (optionTrades.length === 0) {

        return {
            totalPnL: 0,
            winRate: 0,
            winners: 0,
            losers: 0,
            avgWinner: 0,
            avgLoser: 0,
            totalTrades: 0,
            profitFactor: 0,
            bestTrade: 0,
            worstTrade: 0,
            avgReturn: 0
        };
    }


    const results =
        optionTrades.map(
            trade => {

                const pnl =
                    calculateTradePnL(
                        trade
                    );


                const returnPercent =
                    (
                        pnl /
                        trade.entry
                    ) * 100;


                return {
                    pnl,
                    returnPercent
                };
            }
        );


    const pnlValues =
        results.map(
            result =>
                result.pnl
        );


    const returnValues =
        results.map(
            result =>
                result.returnPercent
        );


    const winningTrades =
        pnlValues.filter(
            pnl =>
                pnl > 0
        );


    const losingTrades =
        pnlValues.filter(
            pnl =>
                pnl < 0
        );


    const totalPnL =
        pnlValues.reduce(
            (sum, pnl) =>
                sum + pnl,
            0
        );


    const winners =
        winningTrades.length;


    const losers =
        losingTrades.length;


    const totalTrades =
        optionTrades.length;


    const winRate =
        (
            winners /
            totalTrades
        ) * 100;


    const avgWinner =
        winners > 0
            ? winningTrades.reduce(
                (sum, pnl) =>
                    sum + pnl,
                0
            ) / winners
            : 0;


    const avgLoser =
        losers > 0
            ? losingTrades.reduce(
                (sum, pnl) =>
                    sum + pnl,
                0
            ) / losers
            : 0;


    // ------------------------------------------
    // PROFIT FACTOR
    //
    // Gross wins / Gross losses
    // ------------------------------------------

    const grossProfit =
        winningTrades.reduce(
            (sum, pnl) =>
                sum + pnl,
            0
        );


    const grossLoss =
        Math.abs(
            losingTrades.reduce(
                (sum, pnl) =>
                    sum + pnl,
                0
            )
        );


    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : grossProfit > 0
                ? Infinity
                : 0;


    // ------------------------------------------
    // BEST / WORST
    // ------------------------------------------

    const bestTrade =
        Math.max(
            ...pnlValues
        );


    const worstTrade =
        Math.min(
            ...pnlValues
        );


    // ------------------------------------------
    // AVG RETURN %
    // ------------------------------------------

    const avgReturn =
        returnValues.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        returnValues.length;


    return {

        totalPnL,

        winRate,

        winners,

        losers,

        avgWinner,

        avgLoser,

        totalTrades,

        profitFactor,

        bestTrade,

        worstTrade,

        avgReturn
    };
}



// ==================================================
// UPDATE STAT CARDS
// ==================================================

function renderStats() {

    const stats =
        calculateStats();


    document.getElementById(
        "total-pnl"
    ).textContent =
        formatMoney(
            stats.totalPnL
        );


    document.getElementById(
        "win-rate"
    ).textContent =
        `${stats.winRate.toFixed(1)}%`;


    document.getElementById(
        "winner-count"
    ).textContent =
        stats.winners;


    document.getElementById(
        "loser-count"
    ).textContent =
        stats.losers;


    document.getElementById(
        "avg-winner"
    ).textContent =
        formatMoney(
            stats.avgWinner
        );


    document.getElementById(
        "avg-loser"
    ).textContent =
        formatMoney(
            stats.avgLoser
        );


    // ------------------------------------------
    // Color total P/L
    // ------------------------------------------

    const totalElement =
        document.getElementById(
            "total-pnl"
        );


    totalElement.classList.remove(
        "positive",
        "negative"
    );


    if (
        stats.totalPnL >= 0
    ) {

        totalElement.classList.add(
            "positive"
        );

    } else {

        totalElement.classList.add(
            "negative"
        );
    }
    document.getElementById(
        "total-trades"
    ).textContent =
        stats.totalTrades;


    document.getElementById(
        "profit-factor"
    ).textContent =
        Number.isFinite(
            stats.profitFactor
        )
            ? stats.profitFactor.toFixed(2)
            : "∞";


    document.getElementById(
        "best-trade"
    ).textContent =
        formatMoney(
            stats.bestTrade
        );


    document.getElementById(
        "worst-trade"
    ).textContent =
        formatMoney(
            stats.worstTrade
        );


    document.getElementById(
        "avg-return"
    ).textContent =
        `${stats.avgReturn >= 0 ? "+" : ""}${stats.avgReturn.toFixed(2)}%`;
}



// ==================================================
// CREATE TRADE ROWS
// ==================================================

function renderTrades() {

    const tableBody =
        document.getElementById(
            "journal-body"
        );


    let tableHTML =
        "";


    for (
        const trade
        of optionTrades
    ) {

        const pnl =
            calculateTradePnL(
                trade
            );
        
        const returnPercent =
        (
            pnl /
            trade.entry
        ) * 100;

        const isWin =
            pnl > 0;


        const pnlClass =
            isWin
                ? "positive"
                : "negative";


        const resultClass =
            isWin
                ? "win"
                : "loss";


        const resultText =
            isWin
                ? "Win"
                : "Loss";


        tableHTML += `

            <tr>

                <td>
                    ${trade.date}
                </td>


                <td class="ticker">
                    $${trade.ticker}
                </td>


                <td>
                    ${trade.type}
                </td>


                <td>
                    ${trade.strike}
                </td>


                <td>
                    $${trade.entry.toFixed(2)}
                </td>


                <td>
                    $${trade.exit.toFixed(2)}
                </td>


                <td class="${pnlClass}">
                    ${formatMoney(pnl)}
                </td>

                <td class="${pnlClass}">
                  ${
                      returnPercent >= 0
                          ? "+"
                          : ""
                  }${returnPercent.toFixed(2)}%
                </td>

                <td>

                    <span
                        class="trade-result ${resultClass}"
                    >
                        ${resultText}
                    </span>

                </td>


                <td>
                    ${trade.notes || "-"}
                </td>

            </tr>
        `;
    }


    tableBody.innerHTML =
        tableHTML;
}



// ==================================================
// START JOURNAL
// ==================================================

function startJournal() {

    renderStats();

    renderTrades();
}


startJournal();