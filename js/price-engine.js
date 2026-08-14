// Price engine — real live prices for crypto (via Binance's free public feed),
// real (periodically refreshed) prices for Forex majors, Gold/Silver, and major Stocks
// (via Twelve Data's free tier, proxied through a free CORS bridge since Twelve Data
// blocks direct browser requests), and a realistic continuous simulator for anything else
// (Oil, Indices — ticker support for these is inconsistent on free data tiers).
import { TWELVE_DATA_API_KEY } from './market-data-config.js';

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

// Symbols we pull real (periodically refreshed) prices for via Twelve Data's free tier
const TWELVE_DATA_SYMBOL_MAP = {
    'FX:EURUSD': 'EUR/USD', 'FX:GBPUSD': 'GBP/USD', 'FX:USDJPY': 'USD/JPY', 'FX:AUDUSD': 'AUD/USD',
    'FX:USDCAD': 'USD/CAD', 'FX:USDCHF': 'USD/CHF', 'FX:NZDUSD': 'NZD/USD',
    'TVC:GOLD': 'XAU/USD', 'TVC:SILVER': 'XAG/USD',
    'NASDAQ:AAPL': 'AAPL', 'NASDAQ:TSLA': 'TSLA', 'NASDAQ:NVDA': 'NVDA',
    'NASDAQ:MSFT': 'MSFT', 'NASDAQ:AMZN': 'AMZN', 'NASDAQ:GOOGL': 'GOOGL'
};
const TD_TICKER_TO_SYMBOL = Object.fromEntries(Object.entries(TWELVE_DATA_SYMBOL_MAP).map(([k, v]) => [v, k]));
const realDataSymbols = new Set(); // populated once a symbol has had at least one successful real fetch

const CORS_PROXY = 'https://api.codetabs.com/v1/proxy/?quest=';

async function fetchRealAnchors() {
    const tickers = Object.values(TWELVE_DATA_SYMBOL_MAP).join(',');
    const targetUrl = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tickers)}&apikey=${TWELVE_DATA_API_KEY}`;
    try {
        const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
        if (!res.ok) return;
        const data = await res.json();

        // Twelve Data returns either a single {price: "..."} object, or (for multi-symbol
        // requests) an object keyed by ticker — handle both shapes defensively.
        const entries = data.price !== undefined && Object.keys(TWELVE_DATA_SYMBOL_MAP).length === 1
            ? [[tickers, data]]
            : Object.entries(data);

        entries.forEach(([ticker, val]) => {
            const ourSymbol = TD_TICKER_TO_SYMBOL[ticker];
            const price = val && parseFloat(val.price);
            if (ourSymbol && !isNaN(price) && price > 0) {
                const firstTime = !realDataSymbols.has(ourSymbol);
                realDataSymbols.add(ourSymbol);
                SEED_PRICES[ourSymbol] = price; // simulator drifts toward this real anchor
                if (firstTime) {
                    currentPrices[ourSymbol] = price; // snap immediately on first real reading
                    notify(ourSymbol);
                }
            }
        });
    } catch (e) {
        // Silent, graceful degradation — keep using the simulator/last known price if this fails
    }
}

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
        const noise = (Math.random() - 0.5) * vol * 0.6;
        currentPrices[symbol] = Math.max(0.0001, currentPrices[symbol] + drift + noise);
        notify(symbol);
    }, 350 + Math.random() * 400);
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
let realDataPollingStarted = false;

function ensureRealDataPolling() {
    if (realDataPollingStarted) return;
    realDataPollingStarted = true;
    fetchRealAnchors();
    setInterval(fetchRealAnchors, 120000); // stays comfortably within the free tier's daily quota
}

export function ensureFeedStarted(symbol) {
    if (startedFeeds.has(symbol)) return;
    startedFeeds.add(symbol);
    if (BINANCE_SYMBOL_MAP[symbol]) {
        startBinanceFeed(symbol);
    } else {
        if (TWELVE_DATA_SYMBOL_MAP[symbol]) ensureRealDataPolling();
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
    return !!BINANCE_SYMBOL_MAP[symbol] || realDataSymbols.has(symbol);
}
