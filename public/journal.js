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

let optionTrades = [];

async function loadWebullTrades() {

    const response =
        await fetch(
            "/api/webull/options-history"
        );


    if (!response.ok) {

        throw new Error(
            `Webull API error: ${response.status}`
        );
    }


    const data =
        await response.json();


    optionTrades =
        data.trades || [];


    console.log(
        "Loaded Webull trades:",
        optionTrades
    );


    return optionTrades;
}



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

    return {

        pnl:
            Number(
                trade.pnl || 0
            ),

        returnPercent:
            Number(
                trade.returnPercent || 0
            )
    };
}



// ==================================================
// CALCULATE JOURNAL STATS
// ==================================================

function calculateStats() {

    const totalTrades =
        optionTrades.length;


    const winners =
        optionTrades.filter(
            trade =>
                trade.pnl > 0
        );


    const losers =
        optionTrades.filter(
            trade =>
                trade.pnl < 0
        );


    const totalPnL =
        optionTrades.reduce(
            (sum, trade) =>
                sum + trade.pnl,
            0
        );


    const grossProfit =
        winners.reduce(
            (sum, trade) =>
                sum + trade.pnl,
            0
        );


    const grossLoss =
        Math.abs(
            losers.reduce(
                (sum, trade) =>
                    sum + trade.pnl,
                0
            )
        );


    const winRate =
        totalTrades > 0
            ? (
                winners.length /
                totalTrades
            ) * 100
            : 0;


    const avgWinner =
        winners.length > 0
            ?
            grossProfit /
            winners.length
            :
            0;


    const avgLoser =
        losers.length > 0
            ?
            losers.reduce(
                (sum, trade) =>
                    sum + trade.pnl,
                0
            ) /
            losers.length
            :
            0;


    const profitFactor =
        grossLoss > 0
            ?
            grossProfit /
            grossLoss
            :
            grossProfit > 0
                ? Infinity
                : 0;


    const bestTrade =
        totalTrades > 0
            ?
            Math.max(
                ...optionTrades.map(
                    trade =>
                        trade.pnl
                )
            )
            :
            0;


    const worstTrade =
        totalTrades > 0
            ?
            Math.min(
                ...optionTrades.map(
                    trade =>
                        trade.pnl
                )
            )
            :
            0;


    const avgReturn =
        totalTrades > 0
            ?
            optionTrades.reduce(
                (sum, trade) =>
                    sum +
                    trade.returnPercent,
                0
            ) /
            totalTrades
            :
            0;


    return {

        totalPnL,

        totalTrades,

        winRate,

        winners:
            winners.length,

        losers:
            losers.length,

        avgWinner,

        avgLoser,

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
            trade.pnl;

        const returnPercent =
            trade.returnPercent;

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
                    ${formatDate(trade.date)}
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

function formatDate(dateString) {

    const date =
        new Date(dateString);

    return date.toLocaleDateString(
        "en-US",
        {
            month: "2-digit",
            day: "2-digit",
            year: "numeric"
        }
    );
}

// ==================================================
// START JOURNAL
// ==================================================

async function startJournal() {

    try {

        await loadWebullTrades();

        renderStats();

        renderTrades();

        console.log(
            `Journal loaded ${optionTrades.length} Webull trades.`
        );

    } catch (error) {

        console.error(
            "Failed to start journal:",
            error
        );

        const tableBody =
            document.getElementById(
                "journal-body"
            );

        if (tableBody) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="10">
                        Failed to load Webull trades.
                    </td>
                </tr>
            `;
        }
    }
}

startJournal();