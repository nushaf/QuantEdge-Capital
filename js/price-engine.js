// Price engine — real live prices for crypto (via Binance's free public feed),
// and a realistic continuous simulator for Forex/Commodities/Indices/Stocks
// (no free keyless live feed exists for these outside of paid data subscriptions).

// Seed prices — realistic starting points; the simulator walks smoothly from here.
export const SEED_PRICES = {
    'FX:EURUSD': 1.0845, 'FX:GBPUSD': 1.2715, 'FX:USDJPY': 150.20, 'FX:AUDUSD': 0.6520,
    'FX:USDCAD': 1.3680, 'FX:USDCHF': 0.8815, 'FX:NZDUSD': 0.5990,
    'TVC:GOLD': 2385.50, 'TVC:SILVER': 28.45, 'TVC:USOIL': 78.30, 'TVC:UKOIL': 82.10,
    'TVC:DJI': 39150, 'TVC:NDX': 18240, 'TVC:UKX': 8120, 'TVC:DAX': 18310,
    'NASDAQ:AAPL': 195.40, 'NASDAQ:TSLA': 245.80, 'NASDAQ:NVDA': 120.30,
    'NASDAQ:MSFT': 421.50, 'NASDAQ:AMZN': 182.20, 'NASDAQ:GOOGL': 165.90,
    'BINANCE:BTCUSDT': 64000, 'BINANCE:ETHUSDT': 3400, 'BINANCE:SOLUSDT': 145,
    'BINANCE:XRPUSDT': 0.52, 'BINANCE:BNBUSDT': 580
};

// How "jittery" each instrument's simulated walk is, roughly matching real-world volatility character
const VOLATILITY = {
    'FX:EURUSD': 0.00006, 'FX:GBPUSD': 0.00008, 'FX:USDJPY': 0.012, 'FX:AUDUSD': 0.00007,
    'FX:USDCAD': 0.00006, 'FX:USDCHF': 0.00006, 'FX:NZDUSD': 0.00007,
    'TVC:GOLD': 0.35, 'TVC:SILVER': 0.015, 'TVC:USOIL': 0.03, 'TVC:UKOIL': 0.03,
    'TVC:DJI': 4.5, 'TVC:NDX': 3.2, 'TVC:UKX': 2.1, 'TVC:DAX': 3.8,
    'NASDAQ:AAPL': 0.06, 'NASDAQ:TSLA': 0.18, 'NASDAQ:NVDA': 0.10,
    'NASDAQ:MSFT': 0.12, 'NASDAQ:AMZN': 0.09, 'NASDAQ:GOOGL': 0.08
};

const BINANCE_SYMBOL_MAP = {
    'BINANCE:BTCUSDT': 'btcusdt',
    'BINANCE:ETHUSDT': 'ethusdt',
    'BINANCE:SOLUSDT': 'solusdt',
    'BINANCE:XRPUSDT': 'xrpusdt',
    'BINANCE:BNBUSDT': 'bnbusdt'
};

const currentPrices = { ...SEED_PRICES };
const subscribers = {}; // symbol -> Set of callback fns
const wsConnections = {}; // symbol -> WebSocket

function notify(symbol) {
    const price = currentPrices[symbol];
    (subscribers[symbol] || new Set()).forEach(cb => cb(price));
}

function startSimulatedFeed(symbol) {
    const vol = VOLATILITY[symbol] || (currentPrices[symbol] * 0.0005);
    setInterval(() => {
        // gentle mean-reverting random walk so prices don't drift wildly over long sessions
        const drift = (SEED_PRICES[symbol] - currentPrices[symbol]) * 0.002;
        const noise = (Math.random() - 0.5) * vol;
        currentPrices[symbol] = Math.max(0.0001, currentPrices[symbol] + drift + noise);
        notify(symbol);
    }, 1200 + Math.random() * 800);
}

function startBinanceFeed(symbol) {
    const pair = BINANCE_SYMBOL_MAP[symbol];
    if (!pair) return;
    try {
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@trade`);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const price = parseFloat(data.p);
                if (!isNaN(price)) {
                    currentPrices[symbol] = price;
                    notify(symbol);
                }
            } catch (e) { /* ignore malformed tick */ }
        };
        ws.onerror = () => {
            // fall back to simulated movement if the live feed drops
            if (!wsConnections[symbol + '_fallback']) {
                wsConnections[symbol + '_fallback'] = true;
                startSimulatedFeed(symbol);
            }
        };
        wsConnections[symbol] = ws;
    } catch (e) {
        startSimulatedFeed(symbol);
    }
}

const startedFeeds = new Set();

export function ensureFeedStarted(symbol) {
    if (startedFeeds.has(symbol)) return;
    startedFeeds.add(symbol);
    if (BINANCE_SYMBOL_MAP[symbol]) {
        startBinanceFeed(symbol);
    } else {
        startSimulatedFeed(symbol);
    }
}

export function getPrice(symbol) {
    ensureFeedStarted(symbol);
    return currentPrices[symbol] ?? SEED_PRICES[symbol] ?? 1;
}

export function subscribe(symbol, callback) {
    ensureFeedStarted(symbol);
    if (!subscribers[symbol]) subscribers[symbol] = new Set();
    subscribers[symbol].add(callback);
    // fire immediately with current price so consumers don't wait for the first tick
    callback(currentPrices[symbol] ?? SEED_PRICES[symbol]);
    return () => subscribers[symbol].delete(callback);
}

export function isLiveSymbol(symbol) {
    return !!BINANCE_SYMBOL_MAP[symbol];
}
