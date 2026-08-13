import { auth, db, ADMIN_EMAIL } from './firebase-config.js';
import {
    onAuthStateChanged,
    signOut,
    updateProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updatePassword,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc,
    onSnapshot,
    updateDoc,
    collection,
    query,
    where,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Live account data for the logged-in client — starts empty until Firestore loads it
let accountData = {
    balance: 0,
    totalProfit: 0,
    creditBonus: 0,
    totalDeposit: 0,
    totalWithdrawal: 0,
    portfolioHistory: []
};

// Live payment details set by the admin (shown to clients during deposit)
let paymentSettings = {
    walletAddress: '',
    walletNetwork: '',
    bankAccountName: '',
    bankName: '',
    bankAccountNumber: '',
    bankIBAN: ''
};

// Live list of this client's deposit/withdrawal requests
let clientTransactions = [];
let currentUserId = null;
let currentUserEmail = null;

// Live profile data (personal info + KYC + profile picture)
let profileData = {
    firstName: '',
    lastName: '',
    dob: '',
    phone: '',
    country: '',
    address: '',
    profilePicture: '',
    kycType: '',
    kycFrontImage: '',
    kycBackImage: '',
    kycStatus: ''
};

// SPA Routing and Data
const pages = {
    dashboard: { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', title: 'Main Dashboard' },
    wallet: { icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', title: 'Wallet' },
    trading: { icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', title: 'Trading' },
    copy: { icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z', title: 'Copy Trading' },
    algo: { icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', title: 'Algo Trading' },
    marketupdates: { icon: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0', title: 'Market Updates' },
    transactions: { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', title: 'Transaction History' },
    profile: { icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', title: 'Profile' },
    security: { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', title: 'Security Settings' },
    support: { icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z', title: 'Support' }
};

let currentChart = null;

// Guard this page: must be logged in, admin gets redirected to their own inbox
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        window.location.href = 'admin.html';
        return;
    }

    const nameEl = document.querySelector('#sidebar .sidebar-text p.font-bold');
    const initialsEl = document.querySelector('#sidebar .w-10.h-10.rounded-full');
    const defaultName = user.displayName || user.email.split('@')[0];
    const defaultInitials = defaultName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    if (nameEl) nameEl.textContent = defaultName;
    if (initialsEl) initialsEl.textContent = defaultInitials;

    currentUserId = user.uid;
    currentUserEmail = user.email;

    function updateSidebarProfile() {
        const fullName = (profileData.firstName || profileData.lastName)
            ? `${profileData.firstName} ${profileData.lastName}`.trim()
            : defaultName;
        if (nameEl) nameEl.textContent = fullName;
        if (initialsEl) {
            if (profileData.profilePicture) {
                initialsEl.innerHTML = `<img src="${profileData.profilePicture}" class="w-full h-full object-cover rounded-full">`;
            } else {
                initialsEl.textContent = fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            }
        }
    }

    const rerenderIfActive = (pageNames) => {
        const activeNavEl = document.querySelector('.nav-item[data-page].bg-neonBlue');
        if (activeNavEl && pageNames.includes(activeNavEl.dataset.page)) {
            window.loadPage(activeNavEl.dataset.page);
        }
    };

    // Live-sync account data — updates instantly whenever admin edits this client's account
    onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            accountData = {
                balance: d.balance ?? 0,
                totalProfit: d.totalProfit ?? 0,
                creditBonus: d.creditBonus ?? 0,
                totalDeposit: d.totalDeposit ?? 0,
                totalWithdrawal: d.totalWithdrawal ?? 0,
                portfolioHistory: d.portfolioHistory ?? []
            };
            profileData = {
                firstName: d.firstName ?? '',
                lastName: d.lastName ?? '',
                dob: d.dob ?? '',
                phone: d.profilePhone ?? '',
                country: d.country ?? '',
                address: d.address ?? '',
                profilePicture: d.profilePicture ?? '',
                kycType: d.kycType ?? '',
                kycFrontImage: d.kycFrontImage ?? '',
                kycBackImage: d.kycBackImage ?? '',
                kycStatus: d.kycStatus ?? ''
            };
            updateSidebarProfile();
            rerenderIfActive(['dashboard', 'wallet', 'profile']);
        }
    });

    // Live-sync payment details set by admin
    onSnapshot(doc(db, 'settings', 'paymentDetails'), (snap) => {
        if (snap.exists()) {
            paymentSettings = { ...paymentSettings, ...snap.data() };
        }
    });

    // Live-sync this client's own deposit/withdrawal requests
    const txQuery = query(collection(db, 'transactions'), where('userId', '==', user.uid));
    onSnapshot(txQuery, (snapshot) => {
        clientTransactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        clientTransactions.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        rerenderIfActive(['wallet', 'transactions']);
    });
});

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Hide loader
    setTimeout(() => {
        const loader = document.getElementById('loader');
        loader.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => loader.remove(), 500);
    }, 1000);

    // Build Sidebar Nav
    const navLinks = document.getElementById('nav-links');
    Object.keys(pages).forEach(key => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="#" onclick="loadPage('${key}', event)" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-gray-400 hover:text-white hover:bg-gray-800 nav-item" data-page="${key}">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${pages[key].icon}"></path></svg>
                <span class="font-medium text-sm sidebar-text whitespace-nowrap">${pages[key].title}</span>
            </a>
        `;
        navLinks.appendChild(li);
    });

    // Sidebar Toggle — behaves differently on mobile (slide-in drawer) vs desktop (collapse to icons)
    let isCollapsed = false;
    const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    function openMobileSidebar() {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
    }
    function closeMobileSidebar() {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
    }

    document.getElementById('mobile-sidebar-btn').addEventListener('click', openMobileSidebar);
    backdrop.addEventListener('click', closeMobileSidebar);

    // Close the mobile drawer automatically after picking a page
    document.getElementById('nav-links').addEventListener('click', (e) => {
        if (isMobile() && e.target.closest('a')) {
            closeMobileSidebar();
        }
    });

    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        if (isMobile()) {
            // On mobile this button lives inside the open drawer — just close it
            closeMobileSidebar();
            return;
        }

        const texts = document.querySelectorAll('.sidebar-text');
        const logoText = document.getElementById('sidebar-logo-text');
        
        isCollapsed = !isCollapsed;
        if(isCollapsed) {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-20');
            texts.forEach(t => t.classList.add('hidden'));
            logoText.childNodes.forEach(n => { if(n.nodeType === 3) n.textContent = ''; });
            logoText.querySelector('span:last-child').style.display = 'none';
        } else {
            sidebar.classList.remove('w-20');
            sidebar.classList.add('w-64');
            texts.forEach(t => t.classList.remove('hidden'));
            logoText.innerHTML = '<span class="w-8 h-8 rounded-lg bg-neonBlue shadow-[0_0_10px_rgba(0,243,255,0.5)] flex items-center justify-center text-darker font-bold">Q</span> QuantEdge<span class="text-neonBlue">.</span>';
        }
    });

    // Load initial page
    window.loadPage('dashboard');
});

window.loadPage = function loadPage(page, event = null) {
    if(event) event.preventDefault();
    
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-neonBlue', 'text-darker', 'shadow-[0_0_15px_rgba(0,243,255,0.3)]');
        el.classList.add('text-gray-400', 'hover:bg-gray-800');
    });
    
    const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if(activeNav) {
        activeNav.classList.remove('text-gray-400', 'hover:bg-gray-800');
        activeNav.classList.add('bg-neonBlue', 'text-darker', 'shadow-[0_0_15px_rgba(0,243,255,0.3)]');
        // keep svg icon color dark
        const svg = activeNav.querySelector('svg');
        svg.style.stroke = "#000";
    }

    document.getElementById('page-title').innerText = pages[page].title;
    const content = document.getElementById('content-area');
    
    // Fade out
    content.classList.add('opacity-0');
    
    setTimeout(() => {
        if(page === 'dashboard') content.innerHTML = renderDashboard();
        else if(page === 'wallet') content.innerHTML = renderWallet();
        else if(page === 'transactions') content.innerHTML = renderTransactionsPage();
        else if(page === 'trading') content.innerHTML = renderTrading();
        else if(page === 'copy') content.innerHTML = renderCopy();
        else if(page === 'algo') content.innerHTML = renderAlgo();
        else if(page === 'marketupdates') content.innerHTML = renderMarketUpdates();
        else if(page === 'profile') content.innerHTML = renderProfile();
        else if(page === 'security') content.innerHTML = renderSecurity();
        else if(page === 'support') content.innerHTML = renderSupport();
        else content.innerHTML = renderPlaceholder(page);
        
        // Re-init charts / live widgets if needed (script tags inside innerHTML never auto-execute)
        if(page === 'dashboard') initChart();
        if(page === 'trading') initTradingPage();
        if(page === 'marketupdates') initMarketUpdatesWidget();
        if(page === 'profile') initProfilePage();
        if(page === 'security') initSecurityPage();
        if(page === 'support') initSupportPage();

        // Fade in
        content.classList.remove('opacity-0');
        content.classList.add('transition-opacity', 'duration-300');
    }, 150);
}

// Injects a TradingView widget via real DOM script creation (innerHTML-inserted <script> tags never execute)
function injectTVWidget(containerId, scriptSrc, config) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptSrc;
    script.async = true;
    script.innerHTML = JSON.stringify(config);
    container.appendChild(script);
}

// Render Functions (Simulating HTML pages)
function renderDashboard() {
    const money = (n) => `$${(n ?? 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const profitColor = accountData.totalProfit >= 0 ? 'text-neonGreen' : 'text-neonRed';

    return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
        <div class="glass-panel p-6 rounded-2xl glow-blue">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Total Balance</h3>
            <p class="text-2xl font-display font-bold text-white">${money(accountData.balance)}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Total Profit</h3>
            <p class="text-2xl font-display font-bold ${profitColor}">${money(accountData.totalProfit)}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Credit Bonus</h3>
            <p class="text-2xl font-display font-bold text-neonGold">${money(accountData.creditBonus)}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Total Deposit</h3>
            <p class="text-2xl font-display font-bold text-white">${money(accountData.totalDeposit)}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Total Withdrawal</h3>
            <p class="text-2xl font-display font-bold text-white">${money(accountData.totalWithdrawal)}</p>
        </div>
    </div>
    
    <div class="glass-panel p-6 rounded-2xl">
        <div class="flex justify-between items-center mb-6">
            <h3 class="font-display font-bold text-lg">Portfolio Performance</h3>
            <select class="bg-gray-800 text-xs px-3 py-1 rounded-lg border-gray-700 font-medium pb-2 pt-2">
                <option>1W</option>
                <option>1M</option>
                <option selected>1Y</option>
            </select>
        </div>
        <div class="h-64 md:h-80 w-full relative">
            <canvas id="mainChart"></canvas>
            ${accountData.portfolioHistory.length === 0 ? `
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p class="text-gray-500 text-sm">No performance data yet</p>
            </div>` : ''}
        </div>
    </div>
    `;
}

function transactionRowsHtml() {
    if (clientTransactions.length === 0) {
        return `<tr><td colspan="4" class="p-8 text-center text-gray-500">No transactions yet</td></tr>`;
    }
    return clientTransactions.map(tx => {
        const isDeposit = tx.type === 'deposit';
        const typeLabel = isDeposit ? `Deposit (${tx.method === 'wallet' ? 'Crypto' : 'Bank'})` : `Withdrawal (${tx.method === 'wallet' ? 'Crypto' : 'Bank'})`;
        let statusLabel, statusClass;
        if (tx.status === 'pending') {
            statusLabel = isDeposit ? 'Deposit Pending' : 'Withdrawal Pending';
            statusClass = 'bg-yellow-900/50 text-neonGold';
        } else if (tx.status === 'approved') {
            statusLabel = isDeposit ? 'Deposit Approved' : 'Withdrawal Completed';
            statusClass = 'bg-green-900/50 text-neonGreen';
        } else {
            statusLabel = 'Rejected';
            statusClass = 'bg-red-900/50 text-neonRed';
        }
        const dateStr = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate().toLocaleDateString() : '';
        return `
        <tr>
            <td class="p-4 font-medium">${typeLabel}</td>
            <td class="p-4 ${isDeposit ? 'text-neonGreen' : 'text-white'}">${isDeposit ? '+' : '-'}$${(tx.amount ?? 0).toLocaleString()}</td>
            <td class="p-4"><span class="${statusClass} px-2 py-1 rounded text-xs">${statusLabel}</span></td>
            <td class="p-4 text-gray-400">${dateStr}</td>
        </tr>`;
    }).join('');
}

function renderTransactionsPage() {
    return `
    <div class="glass-panel p-6 rounded-2xl">
        <h3 class="font-display font-bold text-lg mb-4">All Transactions</h3>
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-800 text-gray-400">
                    <tr><th class="p-4 rounded-tl-lg">Type</th><th class="p-4">Amount</th><th class="p-4">Status</th><th class="p-4 rounded-tr-lg">Date</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                    ${transactionRowsHtml()}
                </tbody>
            </table>
        </div>
    </div>
    `;
}

function renderWallet() {
    const balanceDisplay = `$${accountData.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    return `
    <div class="glass-panel p-8 rounded-2xl mb-8 flex flex-col md:flex-row justify-between items-center glow-blue">
        <div>
            <h3 class="text-gray-400 text-lg mb-1">Available Balance</h3>
            <p class="text-5xl font-display font-bold text-white">${balanceDisplay}</p>
        </div>
        <div class="flex gap-4 mt-6 md:mt-0">
            <button onclick="openDepositModal()" class="bg-neonBlue text-darker font-bold px-8 py-3 rounded-xl shadow-[0_0_15px_rgba(0,243,255,0.4)] hover:bg-opacity-80 transition-all flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                Deposit
            </button>
            <button onclick="openWithdrawModal()" class="bg-transparent border border-gray-600 hover:border-white text-white font-bold px-8 py-3 rounded-xl transition-all flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Withdraw
            </button>
        </div>
    </div>
    <div class="glass-panel p-6 rounded-2xl">
        <h3 class="font-display font-bold text-lg mb-4">Transaction History</h3>
        <!-- Table -->
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-800 text-gray-400">
                    <tr><th class="p-4 rounded-tl-lg">Type</th><th class="p-4">Amount</th><th class="p-4">Status</th><th class="p-4 rounded-tr-lg">Date</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                    ${transactionRowsHtml()}
                </tbody>
            </table>
        </div>
    </div>
    `;
}

const TRADING_PAIRS = [
    { symbol: 'FX:EURUSD', label: 'EUR/USD', category: 'Forex' },
    { symbol: 'FX:GBPUSD', label: 'GBP/USD', category: 'Forex' },
    { symbol: 'FX:USDJPY', label: 'USD/JPY', category: 'Forex' },
    { symbol: 'FX:AUDUSD', label: 'AUD/USD', category: 'Forex' },
    { symbol: 'FX:USDCAD', label: 'USD/CAD', category: 'Forex' },
    { symbol: 'FX:USDCHF', label: 'USD/CHF', category: 'Forex' },
    { symbol: 'FX:NZDUSD', label: 'NZD/USD', category: 'Forex' },
    { symbol: 'BINANCE:BTCUSDT', label: 'BTC/USD', category: 'Crypto' },
    { symbol: 'BINANCE:ETHUSDT', label: 'ETH/USD', category: 'Crypto' },
    { symbol: 'BINANCE:SOLUSDT', label: 'SOL/USD', category: 'Crypto' },
    { symbol: 'BINANCE:XRPUSDT', label: 'XRP/USD', category: 'Crypto' },
    { symbol: 'BINANCE:BNBUSDT', label: 'BNB/USD', category: 'Crypto' },
    { symbol: 'TVC:GOLD', label: 'Gold (XAU/USD)', category: 'Commodities' },
    { symbol: 'TVC:SILVER', label: 'Silver (XAG/USD)', category: 'Commodities' },
    { symbol: 'TVC:USOIL', label: 'WTI Crude Oil', category: 'Commodities' },
    { symbol: 'TVC:UKOIL', label: 'Brent Crude Oil', category: 'Commodities' },
    { symbol: 'TVC:DJI', label: 'US30', category: 'Indices' },
    { symbol: 'TVC:NDX', label: 'NAS100', category: 'Indices' },
    { symbol: 'TVC:UKX', label: 'UK100', category: 'Indices' },
    { symbol: 'TVC:DAX', label: 'GER40', category: 'Indices' },
    { symbol: 'NASDAQ:AAPL', label: 'Apple', category: 'Stocks' },
    { symbol: 'NASDAQ:TSLA', label: 'Tesla', category: 'Stocks' },
    { symbol: 'NASDAQ:NVDA', label: 'Nvidia', category: 'Stocks' },
    { symbol: 'NASDAQ:MSFT', label: 'Microsoft', category: 'Stocks' },
    { symbol: 'NASDAQ:AMZN', label: 'Amazon', category: 'Stocks' },
    { symbol: 'NASDAQ:GOOGL', label: 'Google', category: 'Stocks' }
];
let activeTradingSymbol = TRADING_PAIRS[0];

function renderTrading() {
    return `
    <div class="mb-6 rounded-xl overflow-hidden border border-gray-800">
        <div id="trading-ticker-container"></div>
    </div>

    <div class="glass-panel p-4 md:p-6 rounded-2xl mb-6">
        <input id="pair-search" type="text" placeholder="Search pairs — EUR/USD, BTC, Gold, Apple..." class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none mb-4">
        <div id="pair-list" class="flex flex-wrap gap-2 mb-4 max-h-28 overflow-y-auto custom-scrollbar"></div>
        <div id="tv-chart-container" class="h-[450px] md:h-[550px] w-full rounded-xl overflow-hidden bg-black/30"></div>
    </div>

    <div class="glass-panel p-6 rounded-2xl">
        <h3 class="font-display font-bold text-lg mb-6">Place Order — <span id="active-symbol-label" class="text-neonBlue"></span></h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
                <label class="block text-xs text-gray-400 mb-2">Lot Size</label>
                <input id="order-lot" type="number" step="0.01" min="0.01" value="0.01" class="w-full bg-gray-800 border-none rounded-lg py-3 px-3 focus:ring-1 ring-neonBlue text-sm font-mono">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-2">Stop Loss</label>
                <input id="order-sl" type="number" step="0.0001" placeholder="Optional" class="w-full bg-gray-800 border-none rounded-lg py-3 px-3 focus:ring-1 ring-neonBlue text-sm font-mono">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-2">Take Profit</label>
                <input id="order-tp" type="number" step="0.0001" placeholder="Optional" class="w-full bg-gray-800 border-none rounded-lg py-3 px-3 focus:ring-1 ring-neonBlue text-sm font-mono">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <button onclick="placeOrder('sell')" class="bg-neonRed bg-opacity-10 hover:bg-neonRed hover:text-white text-neonRed border border-neonRed font-bold py-4 rounded-xl transition-all">SELL</button>
            <button onclick="placeOrder('buy')" class="bg-neonGreen bg-opacity-10 hover:bg-neonGreen hover:text-darker text-neonGreen border border-neonGreen font-bold py-4 rounded-xl transition-all shadow-[0_0_15px_rgba(0,255,102,0.15)]">BUY</button>
        </div>
    </div>
    `;
}

function initTradingPage() {
    injectTVWidget('trading-ticker-container', 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js', {
        symbols: TRADING_PAIRS.slice(0, 10).map(p => ({ proName: p.symbol, title: p.label })),
        colorTheme: 'dark',
        locale: 'en',
        largeChartUrl: '',
        isTransparent: true,
        showSymbolLogo: true,
        displayMode: 'adaptive'
    });

    renderPairList(TRADING_PAIRS);
    selectTradingPair(activeTradingSymbol);

    const searchInput = document.getElementById('pair-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const term = searchInput.value.trim().toLowerCase();
            const filtered = TRADING_PAIRS.filter(p => p.label.toLowerCase().includes(term) || p.symbol.toLowerCase().includes(term) || p.category.toLowerCase().includes(term));
            renderPairList(filtered);
        });
    }
}

function renderPairList(pairs) {
    const list = document.getElementById('pair-list');
    if (!list) return;
    list.innerHTML = pairs.map(p => `
        <button onclick='selectTradingPairBySymbol("${p.symbol}")' class="pair-chip px-4 py-2 rounded-lg text-sm font-medium transition-all ${p.symbol === activeTradingSymbol.symbol ? 'bg-neonBlue text-darker' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}">
            ${p.label} <span class="opacity-60 text-xs">${p.category}</span>
        </button>
    `).join('');
}

window.selectTradingPairBySymbol = (symbol) => {
    const pair = TRADING_PAIRS.find(p => p.symbol === symbol);
    if (pair) selectTradingPair(pair);
};

function selectTradingPair(pair) {
    activeTradingSymbol = pair;
    const label = document.getElementById('active-symbol-label');
    if (label) label.textContent = pair.label;
    renderPairList(TRADING_PAIRS);

    injectTVWidget('tv-chart-container', 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js', {
        autosize: true,
        symbol: pair.symbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        enable_publishing: false,
        backgroundColor: 'rgba(5,5,5,1)',
        gridColor: 'rgba(255,255,255,0.06)',
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        calendar: false,
        support_host: 'https://www.tradingview.com'
    });
}

window.placeOrder = (side) => {
    document.getElementById('insufficient-modal-symbol').textContent = activeTradingSymbol.label;
    document.getElementById('insufficient-modal').classList.remove('hidden');
};

const COPY_TRADERS = {
    'Highest ROI': [
        { name: 'Marcus Chen', img: 11, roi: 284, copiers: 1420, risk: 'High' },
        { name: 'Sofia Alvarez', img: 25, roi: 231, copiers: 980, risk: 'Medium' },
        { name: 'Daniel Whitfield', img: 14, roi: 198, copiers: 1150, risk: 'High' },
        { name: 'Amara Okafor', img: 32, roi: 176, copiers: 760, risk: 'Medium' },
        { name: 'Viktor Petrov', img: 18, roi: 165, copiers: 890, risk: 'High' },
        { name: 'Hana Kobayashi', img: 44, roi: 152, copiers: 640, risk: 'Medium' }
    ],
    'Most Copiers': [
        { name: 'James O\'Connell', img: 12, roi: 94, copiers: 5240, risk: 'Low' },
        { name: 'Priya Sharma', img: 47, roi: 88, copiers: 4870, risk: 'Low' },
        { name: 'Lucas Bergström', img: 15, roi: 102, copiers: 4310, risk: 'Medium' },
        { name: 'Chloe Dubois', img: 29, roi: 76, copiers: 3990, risk: 'Low' },
        { name: 'Ahmed Hassan', img: 22, roi: 118, copiers: 3650, risk: 'Medium' },
        { name: 'Isabella Romano', img: 36, roi: 85, copiers: 3210, risk: 'Low' }
    ],
    'Lowest Risk': [
        { name: 'Robert Kim', img: 13, roi: 42, copiers: 2100, risk: 'Very Low' },
        { name: 'Grace Müller', img: 40, roi: 38, copiers: 1870, risk: 'Very Low' },
        { name: 'Thomas Anderson', img: 16, roi: 51, copiers: 1640, risk: 'Low' },
        { name: 'Yuki Tanaka', img: 48, roi: 45, copiers: 1520, risk: 'Very Low' },
        { name: 'Emma Larsson', img: 33, roi: 47, copiers: 1390, risk: 'Low' },
        { name: 'Noah Fitzgerald', img: 19, roi: 39, copiers: 1210, risk: 'Very Low' }
    ]
};

function renderCopy() {
    const riskColor = (r) => r === 'High' ? 'text-neonRed' : r === 'Medium' ? 'text-neonGold' : 'text-neonGreen';

    return Object.entries(COPY_TRADERS).map(([category, traders]) => `
        <div class="mb-10">
            <h3 class="font-display font-bold text-xl mb-6">${category} Traders</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${traders.map(t => `
                <div class="glass-panel p-6 rounded-2xl hover:-translate-y-2 transition-transform duration-300">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3">
                            <img src="https://i.pravatar.cc/100?img=${t.img}" class="w-12 h-12 rounded-full border-2 border-neonBlue" alt="${t.name}">
                            <div>
                                <p class="font-bold text-white">${t.name}</p>
                                <p class="text-xs text-gray-400">Risk: <span class="${riskColor(t.risk)}">${t.risk}</span></p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-neonGreen font-bold text-lg">+${t.roi}%</p>
                            <p class="text-xs text-gray-400">ROI (YTD)</p>
                        </div>
                    </div>
                    <div class="flex justify-between items-center">
                        <p class="text-sm font-medium text-gray-400"><span class="text-white">${t.copiers.toLocaleString()}</span> Copiers</p>
                        <button onclick="showToast('Started copying ${t.name.replace(/'/g, "\\'")}', 'success')" class="bg-neonBlue text-darker text-sm font-bold px-6 py-2 rounded-lg hover:shadow-[0_0_15px_#00f3ff] transition-all">Copy</button>
                    </div>
                </div>`).join('')}
            </div>
        </div>
    `).join('');
}

const ALGO_SOFTWARE = [
    { name: 'QuantEdge AlphaBot', winRate: 87, desc: 'Trend-following engine tuned for major forex pairs.' },
    { name: 'NeuroTrade AI', winRate: 82, desc: 'Neural-network signal generator for crypto markets.' },
    { name: 'PulseFX Engine', winRate: 79, desc: 'High-frequency scalper for volatile FX sessions.' },
    { name: 'Momentum Reactor', winRate: 91, desc: 'Breakout detection across indices and commodities.' },
    { name: 'GoldenRatio Bot', winRate: 84, desc: 'Fibonacci-based swing trading for gold and metals.' },
    { name: 'ApexQuant Grid', winRate: 76, desc: 'Grid trading system for ranging markets.' },
    { name: 'SentinelAI Guard', winRate: 88, desc: 'Risk-managed automated trend trader.' },
    { name: 'VortexFX Scalper', winRate: 73, desc: 'Ultra-fast scalping on major currency pairs.' },
    { name: 'EchoWave Signals', winRate: 80, desc: 'Wave-pattern recognition for index trading.' },
    { name: 'TitanCore Executor', winRate: 90, desc: 'Multi-asset execution engine with adaptive risk.' }
];

function renderAlgo() {
    return `
    <div class="mb-6">
        <h3 class="font-display font-bold text-xl mb-1">Algo Trading Software</h3>
        <p class="text-gray-400 text-sm">Automated strategies you can activate on your funded account.</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${ALGO_SOFTWARE.map(a => `
        <div class="glass-panel p-6 rounded-2xl hover:-translate-y-2 transition-transform duration-300">
            <div class="flex items-center justify-between mb-3">
                <div class="w-12 h-12 rounded-xl bg-neonBlue/10 flex items-center justify-center text-neonBlue">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </div>
                <span class="text-neonGreen font-bold text-lg">${a.winRate}%</span>
            </div>
            <h4 class="font-bold text-white mb-1">${a.name}</h4>
            <p class="text-gray-400 text-xs mb-4">${a.desc}</p>
            <p class="text-xs text-gray-500 mb-4">Win Ratio</p>
            <button onclick='showAlgoDepositModal("${a.name.replace(/"/g, '&quot;')}", ${a.winRate})' class="w-full bg-neonBlue text-darker text-sm font-bold py-2.5 rounded-lg hover:shadow-[0_0_15px_#00f3ff] transition-all">Activate</button>
        </div>`).join('')}
    </div>
    `;
}

let currentAlgoDeposit = { name: '', amount: 0 };

window.showAlgoDepositModal = (name, winRate) => {
    let amount;
    if (winRate >= 85) amount = 2000;
    else if (winRate >= 80) amount = 1500;
    else amount = 1000;

    currentAlgoDeposit = { name, amount };
    document.getElementById('algo-modal-name').textContent = name;
    document.getElementById('algo-modal-amount').textContent = `$${amount.toLocaleString()}`;
    document.getElementById('algo-deposit-modal').classList.remove('hidden');
};

window.closeAlgoDepositModal = () => {
    document.getElementById('algo-deposit-modal').classList.add('hidden');
};

window.proceedAlgoDeposit = () => {
    window.closeAlgoDepositModal();
    window.loadPage('wallet');
    setTimeout(() => {
        window.openDepositModal();
        const amountInput = document.getElementById('deposit-amount');
        if (amountInput) amountInput.value = currentAlgoDeposit.amount;
    }, 200);
};

function renderMarketUpdates() {
    return `
    <div class="mb-6">
        <h3 class="font-display font-bold text-xl mb-1">Market Updates</h3>
        <p class="text-gray-400 text-sm">Live daily economic calendar — high, medium and low impact news.</p>
    </div>
    <div class="glass-panel p-4 md:p-6 rounded-2xl">
        <div id="market-updates-widget" class="h-[600px] w-full"></div>
    </div>
    `;
}

function initMarketUpdatesWidget() {
    injectTVWidget('market-updates-widget', 'https://s3.tradingview.com/external-embedding/embed-widget-events.js', {
        colorTheme: 'dark',
        isTransparent: true,
        width: '100%',
        height: '100%',
        locale: 'en',
        importanceFilter: '-1,0,1',
        countryFilter: 'us,gb,eu,jp,au,ca,nz,ch,cn'
    });
}

function renderProfile() {
    const initials = ((profileData.firstName?.[0] || '') + (profileData.lastName?.[0] || '')).toUpperCase() || (currentUserEmail?.[0] || 'U').toUpperCase();
    return `
    <div class="glass-panel p-8 rounded-2xl mb-8 flex flex-col items-center">
        <div class="relative mb-4">
            <div class="w-28 h-28 rounded-full bg-gray-800 border-2 border-neonBlue overflow-hidden flex items-center justify-center text-3xl font-bold text-neonBlue">
                ${profileData.profilePicture ? `<img id="profile-pic-preview" src="${profileData.profilePicture}" class="w-full h-full object-cover">` : `<span id="profile-pic-preview-initials">${initials}</span>`}
            </div>
            <button onclick="document.getElementById('profile-pic-input').click()" class="absolute bottom-0 right-0 w-9 h-9 bg-neonBlue rounded-full flex items-center justify-center text-darker hover:bg-opacity-80 transition-all shadow-[0_0_10px_rgba(0,243,255,0.5)]">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <input id="profile-pic-input" type="file" accept="image/*" class="hidden">
        </div>
        <p class="text-gray-400 text-sm">Tap the pencil to update your profile picture</p>
        ${profileData.kycStatus === 'verified' ? `
            <span class="mt-3 inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-neonGreen/10 text-neonGreen">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Verified Account
            </span>
        ` : ''}
    </div>

    <div class="glass-panel p-8 rounded-2xl mb-8">
        <h3 class="font-display font-bold text-lg mb-6">Personal Information</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
                <label class="block text-sm text-gray-400 mb-2">First Name</label>
                <input id="pf-first-name" type="text" value="${escapeAttr(profileData.firstName)}" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Last Name</label>
                <input id="pf-last-name" type="text" value="${escapeAttr(profileData.lastName)}" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Date of Birth</label>
                <input id="pf-dob" type="date" value="${escapeAttr(profileData.dob)}" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Phone Number</label>
                <input id="pf-phone" type="tel" value="${escapeAttr(profileData.phone)}" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Country</label>
                <input id="pf-country" type="text" value="${escapeAttr(profileData.country)}" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Address</label>
                <input id="pf-address" type="text" value="${escapeAttr(profileData.address)}" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
            </div>
        </div>
        <button id="save-profile-btn" onclick="saveProfileInfo()" class="bg-neonBlue text-darker font-bold px-8 py-3 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all">Save Changes</button>
    </div>

    <div class="glass-panel p-8 rounded-2xl">
        <div class="flex items-center justify-between mb-2">
            <h3 class="font-display font-bold text-lg">KYC Verification</h3>
            ${profileData.kycStatus === 'verified' ? `
                <span class="flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-neonGreen/10 text-neonGreen">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Verified Account
                </span>
            ` : profileData.kycStatus === 'pending' ? `
                <span class="text-xs font-bold px-3 py-1 rounded-full bg-neonGold/10 text-neonGold">Pending Review</span>
            ` : ''}
        </div>
        <p class="text-gray-400 text-sm mb-6">Upload both sides of a valid ID document to verify your account.</p>
        <div class="mb-4">
            <label class="block text-sm text-gray-400 mb-2">Document Type</label>
            <select id="kyc-type" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
                <option value="NIC" ${profileData.kycType === 'NIC' ? 'selected' : ''}>National ID Card (NIC)</option>
                <option value="Driving License" ${profileData.kycType === 'Driving License' ? 'selected' : ''}>Driving License</option>
            </select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="block text-sm text-gray-400 mb-2">Front Side</label>
                <input id="kyc-front-input" type="file" accept="image/*" class="w-full text-sm text-gray-400 mb-3 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neonBlue file:text-darker file:font-bold hover:file:bg-opacity-80 file:cursor-pointer cursor-pointer">
                ${profileData.kycFrontImage ? `<img src="${profileData.kycFrontImage}" class="w-full rounded-xl border border-gray-700">` : ''}
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Back Side</label>
                <input id="kyc-back-input" type="file" accept="image/*" class="w-full text-sm text-gray-400 mb-3 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neonBlue file:text-darker file:font-bold hover:file:bg-opacity-80 file:cursor-pointer cursor-pointer">
                ${profileData.kycBackImage ? `<img src="${profileData.kycBackImage}" class="w-full rounded-xl border border-gray-700">` : ''}
            </div>
        </div>
        <button id="save-kyc-btn" onclick="uploadKycDocument()" class="bg-neonBlue text-darker font-bold px-8 py-3 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all">Upload Documents</button>
    </div>
    `;
}

function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;');
}

function initProfilePage() {
    const picInput = document.getElementById('profile-pic-input');
    if (picInput) {
        picInput.addEventListener('change', async () => {
            if (!picInput.files[0]) return;
            try {
                const compressed = await compressImage(picInput.files[0]);
                await updateDoc(doc(db, 'users', currentUserId), { profilePicture: compressed });
                showToast('Profile picture updated', 'success');
            } catch (err) {
                showToast('Could not update picture. Please try again.', 'error');
            }
        });
    }
}

window.saveProfileInfo = async () => {
    const btn = document.getElementById('save-profile-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    try {
        const firstName = document.getElementById('pf-first-name').value.trim();
        const lastName = document.getElementById('pf-last-name').value.trim();
        await updateDoc(doc(db, 'users', currentUserId), {
            firstName,
            lastName,
            dob: document.getElementById('pf-dob').value,
            profilePhone: document.getElementById('pf-phone').value.trim(),
            country: document.getElementById('pf-country').value.trim(),
            address: document.getElementById('pf-address').value.trim()
        });
        if (auth.currentUser && (firstName || lastName)) {
            updateProfile(auth.currentUser, { displayName: `${firstName} ${lastName}`.trim() }).catch(() => {});
        }
        showToast('Profile updated', 'success');
    } catch (err) {
        showToast('Could not save. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.uploadKycDocument = async () => {
    const frontFile = document.getElementById('kyc-front-input').files[0];
    const backFile = document.getElementById('kyc-back-input').files[0];

    if (!frontFile && !profileData.kycFrontImage) {
        showToast('Upload the front side of your document', 'error');
        return;
    }
    if (!backFile && !profileData.kycBackImage) {
        showToast('Upload the back side of your document', 'error');
        return;
    }

    const btn = document.getElementById('save-kyc-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Uploading...';
    btn.disabled = true;

    try {
        const updates = {
            kycType: document.getElementById('kyc-type').value,
            kycStatus: 'pending'
        };
        if (frontFile) updates.kycFrontImage = await compressImage(frontFile, 650, 0.5);
        if (backFile) updates.kycBackImage = await compressImage(backFile, 650, 0.5);

        await updateDoc(doc(db, 'users', currentUserId), updates);
        showToast('Documents uploaded for review', 'success');
    } catch (err) {
        showToast(err.message || 'Could not upload. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

function renderSecurity() {
    return `
    <div class="glass-panel p-8 rounded-2xl max-w-lg">
        <h3 class="font-display font-bold text-lg mb-6">Change Password</h3>
        <div class="space-y-4 mb-2">
            <div class="relative">
                <label class="block text-sm text-gray-400 mb-2">Current Password</label>
                <input id="sec-current-password" type="password" class="w-full px-4 py-3 pr-12 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
                <button type="button" onclick="togglePasswordVisibility('sec-current-password', this)" class="absolute right-3 top-[42px] text-gray-400 hover:text-white">${eyeIconOpen()}</button>
            </div>
            <div class="relative">
                <label class="block text-sm text-gray-400 mb-2">New Password</label>
                <input id="sec-new-password" type="password" class="w-full px-4 py-3 pr-12 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
                <button type="button" onclick="togglePasswordVisibility('sec-new-password', this)" class="absolute right-3 top-[42px] text-gray-400 hover:text-white">${eyeIconOpen()}</button>
            </div>
            <div class="relative">
                <label class="block text-sm text-gray-400 mb-2">Re-enter New Password</label>
                <input id="sec-confirm-password" type="password" class="w-full px-4 py-3 pr-12 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
                <button type="button" onclick="togglePasswordVisibility('sec-confirm-password', this)" class="absolute right-3 top-[42px] text-gray-400 hover:text-white">${eyeIconOpen()}</button>
            </div>
        </div>
        <p id="sec-forgot-link" class="hidden text-sm text-neonBlue hover:underline cursor-pointer mb-4" onclick="sendSecurityPasswordReset()">Forgot your current password? Reset it via email</p>
        <button id="save-password-btn" onclick="changeUserPassword()" class="w-full bg-neonBlue text-darker font-bold py-3 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all">Update Password</button>
    </div>
    `;
}

function eyeIconOpen() {
    return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>`;
}
function eyeIconClosed() {
    return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path></svg>`;
}

window.togglePasswordVisibility = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden ? eyeIconClosed() : eyeIconOpen();
};

function initSecurityPage() {
    // no-op currently, hook exists for future setup
}

window.changeUserPassword = async () => {
    const current = document.getElementById('sec-current-password').value;
    const newPass = document.getElementById('sec-new-password').value;
    const confirm = document.getElementById('sec-confirm-password').value;
    const forgotLink = document.getElementById('sec-forgot-link');

    if (!current || !newPass || !confirm) {
        showToast('Fill in all password fields', 'error');
        return;
    }
    if (newPass !== confirm) {
        showToast('New passwords do not match', 'error');
        return;
    }
    if (newPass.length < 6) {
        showToast('New password should be at least 6 characters', 'error');
        return;
    }

    const btn = document.getElementById('save-password-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Updating...';
    btn.disabled = true;

    try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, current);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPass);
        showToast('Password updated successfully', 'success');
        document.getElementById('sec-current-password').value = '';
        document.getElementById('sec-new-password').value = '';
        document.getElementById('sec-confirm-password').value = '';
        forgotLink.classList.add('hidden');
    } catch (err) {
        if (err.code && err.code.includes('wrong-password')) {
            showToast('Current password is incorrect', 'error');
            forgotLink.classList.remove('hidden');
        } else if (err.code && err.code.includes('invalid-credential')) {
            showToast('Current password is incorrect', 'error');
            forgotLink.classList.remove('hidden');
        } else {
            showToast('Could not update password. Please try again.', 'error');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.sendSecurityPasswordReset = () => {
    sendPasswordResetEmail(auth, currentUserEmail).then(() => {
        showToast('Password reset email sent — check your inbox', 'success');
    }).catch(() => {
        showToast('Could not send reset email. Please try again.', 'error');
    });
};

function renderSupport() {
    return `
    <div class="glass-panel p-8 rounded-2xl max-w-2xl mb-8">
        <h3 class="font-display font-bold text-xl mb-2">Get in Touch</h3>
        <p class="text-gray-400 text-sm mb-6">Send us a message and our team will respond as soon as possible.</p>
        <form id="support-form" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm text-gray-400 mb-2">First Name</label>
                    <input id="sup-first-name" type="text" required class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-2">Last Name</label>
                    <input id="sup-last-name" type="text" required class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none">
                </div>
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-2">Message</label>
                <textarea id="sup-message" required rows="4" class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue outline-none resize-none"></textarea>
            </div>
            <button type="submit" class="w-full md:w-auto bg-neonBlue text-darker font-bold px-8 py-4 rounded-xl shadow-[0_0_15px_rgba(0,243,255,0.4)] hover:shadow-[0_0_25px_rgba(0,243,255,0.5)] transition-all">Send Message</button>
        </form>
    </div>

    <div class="max-w-2xl">
        <h3 class="font-display font-bold text-lg mb-4">Your Messages</h3>
        <div id="support-history" class="space-y-4">
            <p class="text-gray-500 text-sm">Loading...</p>
        </div>
    </div>
    `;
}

function initSupportPage() {
    const form = document.getElementById('support-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Sending...';
            btn.disabled = true;

            try {
                await addDoc(collection(db, 'messages'), {
                    name: `${document.getElementById('sup-first-name').value.trim()} ${document.getElementById('sup-last-name').value.trim()}`.trim(),
                    email: currentUserEmail,
                    message: document.getElementById('sup-message').value.trim(),
                    userId: currentUserId,
                    status: 'unread',
                    reply: null,
                    createdAt: serverTimestamp()
                });
                showToast('Message sent successfully!', 'success');
                form.reset();
            } catch (err) {
                showToast('Could not send message. Please try again.', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }

    // Live list of this client's own messages + admin replies
    const q = query(collection(db, 'messages'), where('userId', '==', currentUserId));
    onSnapshot(q, (snapshot) => {
        const historyEl = document.getElementById('support-history');
        if (!historyEl) return;

        let msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        msgs.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

        if (msgs.length === 0) {
            historyEl.innerHTML = `<p class="text-gray-500 text-sm">No messages yet.</p>`;
            return;
        }

        historyEl.innerHTML = msgs.map(m => {
            const dateStr = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleDateString() : '';
            return `
            <div class="glass-panel p-5 rounded-xl">
                <p class="text-xs text-gray-500 mb-1">${dateStr}</p>
                <p class="text-white text-sm mb-3">${(m.message || '').replace(/</g, '&lt;')}</p>
                ${m.reply ? `
                <div class="border-t border-gray-800 pt-3 mt-3">
                    <p class="text-xs text-neonBlue font-bold mb-1">Reply from admin</p>
                    <p class="text-gray-300 text-sm">${(m.reply || '').replace(/</g, '&lt;')}</p>
                </div>` : `<p class="text-xs text-neonGold">Awaiting reply</p>`}
            </div>`;
        }).join('');
    });
}

function renderPlaceholder(page) {
    return `
    <div class="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center h-[60vh]">
        <svg class="w-16 h-16 text-neonBlue mb-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${pages[page].icon}"></path></svg>
        <h2 class="text-3xl font-display font-bold mb-2">${pages[page].title}</h2>
        <p class="text-gray-400 text-center max-w-md">This section is part of the QuantEdge Advanced Platform. Full UI rendering dynamically injected via JS router.</p>
        <button onclick="loadPage('dashboard')" class="mt-8 bg-transparent border border-neonBlue text-neonBlue hover:bg-neonBlue hover:text-darker font-bold px-6 py-2 rounded-xl transition-all shadow-[0_0_10px_rgba(0,243,255,0.2)]">Return to Main Dashboard</button>
    </div>
    `;
}

// Chart.js Setup
function initChart() {
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    
    if(currentChart) currentChart.destroy();
    
    // Gradient Stroke
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 243, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 243, 255, 0.0)');

    const hasHistory = accountData.portfolioHistory && accountData.portfolioHistory.length > 0;
    const labels = hasHistory ? accountData.portfolioHistory.map(p => p.label) : ['', '', '', '', '', ''];
    const dataPoints = hasHistory ? accountData.portfolioHistory.map(p => p.value) : [0, 0, 0, 0, 0, 0];

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Performance',
                data: dataPoints,
                borderColor: '#00f3ff',
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#050505',
                pointBorderColor: '#00f3ff',
                pointBorderWidth: 2,
                pointRadius: hasHistory ? 4 : 0,
                pointHoverRadius: hasHistory ? 6 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hasHistory,
                    backgroundColor: '#0f0f13',
                    titleColor: '#fff',
                    bodyColor: '#00f3ff',
                    borderColor: '#333',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#888' }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#888' },
                    beginAtZero: true
                }
            }
        }
    });
}

window.logout = function() {
    showToast('Logging out...', 'info');
    signOut(auth).finally(() => {
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 800);
    });
};

// ---------- Deposit flow ----------
let depositState = { amount: 0, method: null };

function showDepositStep(n) {
    document.querySelectorAll('.deposit-step').forEach((el, i) => {
        el.classList.toggle('hidden', i !== n - 1);
    });
}

window.openDepositModal = () => {
    depositState = { amount: 0, method: null };
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-proof-preview').classList.add('hidden');
    document.getElementById('deposit-proof-input').value = '';
    showDepositStep(1);
    document.getElementById('deposit-modal').classList.remove('hidden');
};

window.closeDepositModal = () => {
    document.getElementById('deposit-modal').classList.add('hidden');
};

window.depositNext = (fromStep) => {
    if (fromStep === 1) {
        const amount = parseFloat(document.getElementById('deposit-amount').value);
        if (!amount || amount <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }
        depositState.amount = amount;
        showDepositStep(2);
    } else if (fromStep === 3) {
        showDepositStep(4);
    }
};

window.depositBack = (fromStep) => {
    showDepositStep(fromStep - 1);
};

window.chooseDepositMethod = (method) => {
    depositState.method = method;
    const box = document.getElementById('deposit-details-box');

    if (method === 'wallet') {
        box.innerHTML = `
            <div>
                <label class="block text-xs text-gray-500 mb-1">${paymentSettings.walletNetwork || 'Crypto Wallet Address'}</label>
                <div class="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] border border-gray-700 rounded-xl px-4 py-3">
                    <span id="copy-wallet-address" class="text-sm font-mono text-neonBlue break-all flex-1">${paymentSettings.walletAddress || 'Not set yet — contact support'}</span>
                    <button onclick="copyToClipboard('copy-wallet-address')" class="text-gray-400 hover:text-neonBlue flex-shrink-0">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                </div>
            </div>
            <p class="text-xs text-gray-500">Send exactly $${depositState.amount.toLocaleString()} worth, then continue.</p>
        `;
    } else {
        box.innerHTML = `
            <div>
                <label class="block text-xs text-gray-500 mb-1">Bank Name</label>
                <div class="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] border border-gray-700 rounded-xl px-4 py-3">
                    <span id="copy-bank-name" class="text-sm font-mono text-neonBlue flex-1">${paymentSettings.bankName || 'Not set yet'}</span>
                    <button onclick="copyToClipboard('copy-bank-name')" class="text-gray-400 hover:text-neonBlue flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
                </div>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Account Name</label>
                <div class="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] border border-gray-700 rounded-xl px-4 py-3">
                    <span id="copy-bank-account-name" class="text-sm font-mono text-neonBlue flex-1">${paymentSettings.bankAccountName || 'Not set yet'}</span>
                    <button onclick="copyToClipboard('copy-bank-account-name')" class="text-gray-400 hover:text-neonBlue flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
                </div>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Account Number / IBAN</label>
                <div class="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] border border-gray-700 rounded-xl px-4 py-3">
                    <span id="copy-bank-account-num" class="text-sm font-mono text-neonBlue flex-1">${paymentSettings.bankAccountNumber || paymentSettings.bankIBAN || 'Not set yet'}</span>
                    <button onclick="copyToClipboard('copy-bank-account-num')" class="text-gray-400 hover:text-neonBlue flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
                </div>
            </div>
            <p class="text-xs text-gray-500">Transfer $${depositState.amount.toLocaleString()}, then continue.</p>
        `;
    }
    showDepositStep(3);
};

window.copyToClipboard = (elId) => {
    const text = document.getElementById(elId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(() => {
        showToast('Could not copy — please copy manually', 'error');
    });
};

function compressImage(file, maxWidth = 800, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'deposit-proof-input' && e.target.files[0]) {
        const preview = document.getElementById('deposit-proof-preview');
        preview.src = URL.createObjectURL(e.target.files[0]);
        preview.classList.remove('hidden');
    }
});

window.submitDeposit = async () => {
    const fileInput = document.getElementById('deposit-proof-input');
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please upload a screenshot of your payment', 'error');
        return;
    }

    const btn = document.getElementById('deposit-submit-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Submitting...';
    btn.disabled = true;

    try {
        const proofImage = await compressImage(file);
        await addDoc(collection(db, 'transactions'), {
            userId: currentUserId,
            userEmail: currentUserEmail,
            userName: (profileData.firstName || profileData.lastName) ? `${profileData.firstName} ${profileData.lastName}`.trim() : (auth.currentUser?.displayName || currentUserEmail),
            type: 'deposit',
            amount: depositState.amount,
            method: depositState.method,
            proofImage,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        showToast('Deposit submitted — we\'ll verify and credit it shortly', 'success');
        window.closeDepositModal();
    } catch (err) {
        showToast('Could not submit deposit. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ---------- Withdrawal flow ----------
let withdrawState = { amount: 0, method: null };

window.openWithdrawModal = () => {
    withdrawState = { amount: 0, method: null };
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-wallet-address').value = '';
    document.getElementById('withdraw-bank-name-holder').value = '';
    document.getElementById('withdraw-bank-name').value = '';
    document.getElementById('withdraw-bank-account').value = '';
    document.querySelectorAll('.withdraw-step').forEach((el, i) => el.classList.toggle('hidden', i !== 0));
    document.getElementById('withdraw-modal').classList.remove('hidden');
};

window.closeWithdrawModal = () => {
    document.getElementById('withdraw-modal').classList.add('hidden');
};

window.chooseWithdrawMethod = (method) => {
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    if (!amount || amount <= 0) {
        showToast('Enter a valid amount first', 'error');
        return;
    }
    withdrawState.amount = amount;
    withdrawState.method = method;

    document.getElementById('withdraw-wallet-fields').classList.toggle('hidden', method !== 'wallet');
    document.getElementById('withdraw-bank-fields').classList.toggle('hidden', method !== 'bank');

    document.querySelectorAll('.withdraw-step').forEach((el, i) => el.classList.toggle('hidden', i !== 1));
};

window.withdrawBack = () => {
    document.querySelectorAll('.withdraw-step').forEach((el, i) => el.classList.toggle('hidden', i !== 0));
};

window.submitWithdrawal = async () => {
    let destination = {};
    if (withdrawState.method === 'wallet') {
        const address = document.getElementById('withdraw-wallet-address').value.trim();
        if (!address) {
            showToast('Enter your wallet address', 'error');
            return;
        }
        destination = { walletAddress: address };
    } else {
        const holder = document.getElementById('withdraw-bank-name-holder').value.trim();
        const bank = document.getElementById('withdraw-bank-name').value.trim();
        const account = document.getElementById('withdraw-bank-account').value.trim();
        if (!holder || !bank || !account) {
            showToast('Fill in all bank details', 'error');
            return;
        }
        destination = { accountHolder: holder, bankName: bank, accountNumber: account };
    }

    const btn = document.getElementById('withdraw-submit-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Submitting...';
    btn.disabled = true;

    try {
        await addDoc(collection(db, 'transactions'), {
            userId: currentUserId,
            userEmail: currentUserEmail,
            userName: (profileData.firstName || profileData.lastName) ? `${profileData.firstName} ${profileData.lastName}`.trim() : (auth.currentUser?.displayName || currentUserEmail),
            type: 'withdrawal',
            amount: withdrawState.amount,
            method: withdrawState.method,
            destination,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        showToast('Withdrawal request submitted', 'success');
        window.closeWithdrawModal();
    } catch (err) {
        showToast('Could not submit withdrawal. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
