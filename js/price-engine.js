// Price engine — real live prices for crypto (BTC/ETH/SOL/XRP via Coinbase's free public feed,
// matching the exchange most comparison charts show; BNB via Binance since Coinbase doesn't list it),
// real (periodically refreshed) prices for Forex majors, Gold/Silver, and major Stocks
// (via Twelve Data's free tier, proxied through a free CORS bridge since Twelve Data
// blocks direct browser requests), and a realistic continuous simulator for anything else
// (Oil, Indices — ticker support for these is inconsistent on free data tiers).
import { TWELVE_DATA_API_KEY } from './market-data-config.js';

// Seed prices — realistic starting points; the simulator walks smoothly from here.
export const SEED_PRICES = {
    'FX:EURUSD': 1.1570, 'FX:GBPUSD': 1.3500, 'FX:USDJPY': 150.20, 'FX:AUDUSD': 0.6520,
    'FX:USDCAD': 1.3680, 'FX:USDCHF': 0.8815, 'FX:NZDUSD': 0.5990,
    'TVC:GOLD': 4390.00, 'TVC:SILVER': 52.00, 'TVC:USOIL': 82.40, 'TVC:UKOIL': 86.10,
    'TVC:DJI': 53730, 'TVC:NDX': 26730, 'TVC:UKX': 8120, 'TVC:DAX': 18310,
    'NASDAQ:AAPL': 195.40, 'NASDAQ:TSLA': 245.80, 'NASDAQ:NVDA': 120.30,
    'NASDAQ:MSFT': 421.50, 'NASDAQ:AMZN': 182.20, 'NASDAQ:GOOGL': 165.90,
    'BINANCE:BTCUSDT': 63000, 'BINANCE:ETHUSDT': 3400, 'BINANCE:SOLUSDT': 145,
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
    'BINANCE:BNBUSDT': 'bnbusdt' // Coinbase doesn't list BNB, so this one stays on Binance
};

// Coinbase — matches the exchange most price-comparison charts (like TradingView's default) show
const COINBASE_SYMBOL_MAP = {
    'BINANCE:BTCUSDT': 'BTC-USD',
    'BINANCE:ETHUSDT': 'ETH-USD',
    'BINANCE:SOLUSDT': 'SOL-USD',
    'BINANCE:XRPUSDT': 'XRP-USD'
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

// Real historical 15-minute OHLC candles — used to build the actual chart shape,
// not just the current price. Crypto via Binance (free, no key), Forex/Gold/Silver/Stocks
// via Twelve Data (free tier, proxied). Returns null if no real source is available for
// this symbol, so the caller can fall back to the simulator.
export async function fetchHistoricalCandles(symbol) {
    if (COINBASE_SYMBOL_MAP[symbol]) {
        try {
            const product = COINBASE_SYMBOL_MAP[symbol];
            const res = await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=900`);
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return null;
            // Coinbase returns [time, low, high, open, close, volume], newest-first
            return data
                .map(c => ({ time: c[0], open: c[3], high: c[2], low: c[1], close: c[4] }))
                .sort((a, b) => a.time - b.time)
                .slice(-60);
        } catch (e) { return null; }
    }

    if (BINANCE_SYMBOL_MAP[symbol]) {
        try {
            const pair = BINANCE_SYMBOL_MAP[symbol].toUpperCase();
            const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=15m&limit=60`);
            if (!res.ok) return null;
            const data = await res.json();
            return data.map(k => ({
                time: Math.floor(k[0] / 1000),
                open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4])
            }));
        } catch (e) { return null; }
    }

    if (TWELVE_DATA_SYMBOL_MAP[symbol]) {
        try {
            const ticker = TWELVE_DATA_SYMBOL_MAP[symbol];
            const targetUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=15min&outputsize=60&apikey=${TWELVE_DATA_API_KEY}`;
            const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.values || !Array.isArray(data.values)) return null;
            return data.values.map(v => ({
                time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
                open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close)
            })).reverse(); // Twelve Data returns newest-first; charts need oldest-first
        } catch (e) { return null; }
    }

    return null;
}

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
                // Reject an implausible jump on refresh (likely bad API response) — but always accept the first real reading
                if (!firstTime) {
                    const prev = currentPrices[ourSymbol];
                    if (prev && Math.abs(price - prev) / prev > 0.05) return;
                }
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

// Instruments that trade like Forex (~24/5, closed Fri 21:00 UTC \u2192 Sun 21:00 UTC)
const FOREX_LIKE = new Set(['FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 'FX:AUDUSD', 'FX:USDCAD', 'FX:USDCHF', 'FX:NZDUSD', 'TVC:GOLD', 'TVC:SILVER']);
// Individual stocks — approx NYSE/NASDAQ hours, Mon\u2013Fri 13:30\u201320:00 UTC (DST/holidays not modeled)
const STOCK_LIKE = new Set(['NASDAQ:AAPL', 'NASDAQ:TSLA', 'NASDAQ:NVDA', 'NASDAQ:MSFT', 'NASDAQ:AMZN', 'NASDAQ:GOOGL']);

export function isMarketOpen(symbol) {
    if (COINBASE_SYMBOL_MAP[symbol] || BINANCE_SYMBOL_MAP[symbol]) return true; // crypto: 24/7

    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const totalMin = now.getUTCHours() * 60 + now.getUTCMinutes();

    if (FOREX_LIKE.has(symbol)) {
        if (day === 6) return false;
        if (day === 5 && totalMin >= 21 * 60) return false;
        if (day === 0 && totalMin < 21 * 60) return false;
        return true;
    }
    if (STOCK_LIKE.has(symbol)) {
        if (day === 0 || day === 6) return false;
        return totalMin >= 13 * 60 + 30 && totalMin < 20 * 60;
    }
    return true;
}

function startSimulatedFeed(symbol) {
    const vol = VOLATILITY[symbol] || (currentPrices[symbol] * 0.0005);
    setInterval(() => {
        if (!isMarketOpen(symbol)) return; // frozen while the real market is closed — matches real platforms
        // gentle mean-reverting random walk so prices don't drift wildly over long sessions
        const drift = (SEED_PRICES[symbol] - currentPrices[symbol]) * 0.002;
        const noise = (Math.random() - 0.5) * vol * 0.6;
        currentPrices[symbol] = Math.max(0.0001, currentPrices[symbol] + drift + noise);
        notify(symbol);
    }, 350 + Math.random() * 400);
}

function startCoinbaseFeed(symbol) {
    const product = COINBASE_SYMBOL_MAP[symbol];
    if (!product) return;
    try {
        const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'subscribe', product_ids: [product], channels: ['ticker'] }));
        };
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type !== 'ticker' || !data.price) return;
                const price = parseFloat(data.price);
                const prev = currentPrices[symbol];
                if (!isNaN(price) && price > 0) {
                    if (prev && Math.abs(price - prev) / prev > 0.02) return;
                    currentPrices[symbol] = price;
                    notify(symbol);
                }
            } catch (e) { /* ignore malformed tick */ }
        };
        ws.onerror = () => {
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

function startBinanceFeed(symbol) {
    const pair = BINANCE_SYMBOL_MAP[symbol];
    if (!pair) return;
    try {
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@trade`);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const price = parseFloat(data.p);
                const prev = currentPrices[symbol];
                if (!isNaN(price) && price > 0) {
                    // Reject implausible single-tick jumps (bad/glitched data) — real trades don't gap this much
                    if (prev && Math.abs(price - prev) / prev > 0.02) return;
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

export function seedRealPrice(symbol, price) {
    // Authoritatively sets the known-real price (e.g. from historical candle close) so that
    // any subscriber firing before the live feed's first tick doesn't see the static hardcoded fallback.
    if (price && price > 0) {
        currentPrices[symbol] = price;
        SEED_PRICES[symbol] = price;
    }
}

export function ensureFeedStarted(symbol) {
    if (startedFeeds.has(symbol)) return;
    startedFeeds.add(symbol);
    if (COINBASE_SYMBOL_MAP[symbol]) {
        startCoinbaseFeed(symbol);
    } else if (BINANCE_SYMBOL_MAP[symbol]) {
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
    return !!COINBASE_SYMBOL_MAP[symbol] || !!BINANCE_SYMBOL_MAP[symbol] || realDataSymbols.has(symbol);
}
