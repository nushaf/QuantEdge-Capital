import { auth, db, ADMIN_EMAIL } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Live account data for the logged-in client — starts empty until Firestore loads it
let accountData = {
    balance: 0,
    activePositions: 0,
    todaysProfit: 0,
    todaysProfitPercent: 0,
    portfolioHistory: [],
    recentActivity: []
};

// SPA Routing and Data
const pages = {
    dashboard: { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', title: 'Main Dashboard' },
    wallet: { icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', title: 'Wallet' },
    markets: { icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z', title: 'Markets (Advanced)' },
    trading: { icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', title: 'Trading' },
    copy: { icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z', title: 'Copy Trading' },
    signals: { icon: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0', title: 'Signals' },
    accounts: { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', title: 'Account Management' },
    algo: { icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', title: 'Algo Trading' },
    profile: { icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', title: 'Profile' },
    security: { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', title: 'Security Settings' },
    documents: { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', title: 'Documents' },
    transactions: { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', title: 'Transaction History' },
    notifications: { icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', title: 'Notifications' },
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

    const name = user.displayName || user.email.split('@')[0];
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const nameEl = document.querySelector('#sidebar .sidebar-text p.font-bold');
    const initialsEl = document.querySelector('#sidebar .w-10.h-10.rounded-full');
    if (nameEl) nameEl.textContent = name;
    if (initialsEl) initialsEl.textContent = initials;

    // Live-sync account data — updates instantly whenever admin edits this client's account
    onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            accountData = {
                balance: d.balance ?? 0,
                activePositions: d.activePositions ?? 0,
                todaysProfit: d.todaysProfit ?? 0,
                todaysProfitPercent: d.todaysProfitPercent ?? 0,
                portfolioHistory: d.portfolioHistory ?? [],
                recentActivity: d.recentActivity ?? []
            };
            const activeNavEl = document.querySelector('.nav-item[data-page].bg-neonBlue');
            if (activeNavEl) {
                window.loadPage(activeNavEl.dataset.page);
            }
        }
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

    // Sidebar Toggle
    let isCollapsed = false;
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
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
        else if(page === 'trading') content.innerHTML = renderTrading();
        else if(page === 'copy') content.innerHTML = renderCopy();
        else content.innerHTML = renderPlaceholder(page);
        
        // Re-init charts if needed
        if(page === 'dashboard' || page === 'trading') initChart();

        // Fade in
        content.classList.remove('opacity-0');
        content.classList.add('transition-opacity', 'duration-300');
    }, 150);
}

// Render Functions (Simulating HTML pages)
function renderDashboard() {
    const balanceDisplay = `$${accountData.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const profitDisplay = `${accountData.todaysProfit >= 0 ? '+' : ''}$${accountData.todaysProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const profitPercentDisplay = `${accountData.todaysProfitPercent >= 0 ? '+' : ''}${accountData.todaysProfitPercent}% today`;
    const profitColor = accountData.todaysProfit >= 0 ? 'text-neonGreen' : 'text-neonRed';
    const hasActivity = accountData.recentActivity && accountData.recentActivity.length > 0;

    return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="glass-panel p-6 rounded-2xl glow-blue">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Total Balance</h3>
            <p class="text-3xl font-display font-bold text-white">${balanceDisplay}</p>
            <p class="text-gray-500 text-sm mt-2">${accountData.balance === 0 ? 'No funds yet' : 'Updated by QuantEdge'}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Active Positions</h3>
            <p class="text-3xl font-display font-bold text-white">${accountData.activePositions}</p>
            <p class="text-gray-500 text-sm mt-2">${accountData.activePositions === 0 ? 'No open positions' : 'Across your markets'}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
            <h3 class="text-gray-400 text-sm font-medium mb-1">Today's Profit</h3>
            <p class="text-3xl font-display font-bold text-white">${profitDisplay}</p>
            <p class="${profitColor} text-sm mt-2">${profitPercentDisplay}</p>
        </div>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 glass-panel p-6 rounded-2xl">
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
        
        <div class="glass-panel p-6 rounded-2xl flex flex-col">
            <h3 class="font-display font-bold text-lg mb-4">Recent Activity</h3>
            <div class="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                ${hasActivity ? accountData.recentActivity.map(a => `
                <div class="flex items-center justify-between border-b border-gray-800 pb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-neonBlue">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <p class="text-sm text-white font-medium">${a.label}</p>
                            <p class="text-xs text-gray-400">${a.date || ''}</p>
                        </div>
                    </div>
                    <span class="text-sm font-bold ${a.amount < 0 ? 'text-neonRed' : 'text-neonGreen'}">${a.amount < 0 ? '-' : '+'}$${Math.abs(a.amount).toLocaleString()}</span>
                </div>`).join('') : `<p class="text-gray-500 text-sm text-center py-8">No activity yet</p>`}
            </div>
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
            <button onclick="showToast('Contact us to arrange a deposit', 'info')" class="bg-neonBlue text-darker font-bold px-8 py-3 rounded-xl shadow-[0_0_15px_rgba(0,243,255,0.4)] hover:bg-opacity-80 transition-all flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                Deposit
            </button>
            <button onclick="showToast('Withdrawal requires 2FA', 'error')" class="bg-transparent border border-gray-600 hover:border-white text-white font-bold px-8 py-3 rounded-xl transition-all flex items-center gap-2">
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
                    ${accountData.recentActivity && accountData.recentActivity.length > 0 ? accountData.recentActivity.map(a => `
                    <tr><td class="p-4 font-medium">${a.label}</td><td class="p-4 ${a.amount < 0 ? 'text-white' : 'text-neonGreen'}">${a.amount < 0 ? '-' : '+'}$${Math.abs(a.amount).toLocaleString()}</td><td class="p-4"><span class="bg-green-900/50 text-neonGreen px-2 py-1 rounded text-xs">Completed</span></td><td class="p-4 text-gray-400">${a.date || ''}</td></tr>
                    `).join('') : `<tr><td colspan="4" class="p-8 text-center text-gray-500">No transactions yet</td></tr>`}
                </tbody>
            </table>
        </div>
    </div>
    `;
}

function renderTrading() {
    return `
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">
        <!-- Sidebar Markets -->
        <div class="glass-panel rounded-2xl p-4 flex flex-col h-full bg-darkCard overflow-hidden">
            <input type="text" placeholder="Search pairs..." class="w-full bg-gray-800 border-none px-4 py-2 rounded-lg text-sm mb-4">
            <div class="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                <div class="flex justify-between items-center p-3 cursor-pointer bg-gray-800 rounded-lg border border-neonBlue shadow-[0_0_10px_rgba(0,243,255,0.1)]">
                    <div><p class="font-bold text-white text-sm">EUR/USD</p><p class="text-xs text-gray-400">Forex</p></div>
                    <div class="text-right"><p class="text-sm font-mono text-neonGreen">1.0845</p><p class="text-xs text-neonGreen">+0.12%</p></div>
                </div>
                <div class="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-800 rounded-lg border border-transparent transition-all">
                    <div><p class="font-bold text-white text-sm">BTC/USD</p><p class="text-xs text-gray-400">Crypto</p></div>
                    <div class="text-right"><p class="text-sm font-mono text-neonRed">64,230.00</p><p class="text-xs text-neonRed">-1.50%</p></div>
                </div>
                 <div class="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-800 rounded-lg border border-transparent transition-all">
                    <div><p class="font-bold text-white text-sm">GOLD</p><p class="text-xs text-gray-400">Commodity</p></div>
                    <div class="text-right"><p class="text-sm font-mono text-neonGreen">2,340.50</p><p class="text-xs text-neonGreen">+0.80%</p></div>
                </div>
            </div>
        </div>
        
        <!-- Main Chart & Orders -->
        <div class="lg:col-span-3 flex flex-col gap-6">
            <!-- Chart Area -->
            <div class="glass-panel p-4 rounded-2xl flex-1 relative flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-display font-bold text-xl flex items-center gap-2"><span class="text-neonBlue">EUR/USD</span> <span class="text-sm text-gray-400 font-normal">Live Chart</span></h3>
                    <div class="flex gap-2">
                        <button class="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs font-bold transition-all">1H</button>
                        <button class="bg-neonBlue text-darker px-3 py-1 rounded text-xs font-bold shadow-[0_0_8px_#00f3ff]">4H</button>
                        <button class="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs font-bold transition-all">1D</button>
                    </div>
                </div>
                <div class="flex-1 w-full min-h-[300px]">
                    <canvas id="mainChart"></canvas>
                </div>
            </div>
            
            <!-- Buy / Sell Panel -->
            <div class="glass-panel p-6 rounded-2xl flex gap-6 mt-auto">
                <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-2">Lot Size</label>
                    <div class="flex bg-gray-800 rounded-lg overflow-hidden">
                        <button class="px-3 text-gray-400 hover:text-white hover:bg-gray-700">-</button>
                        <input type="number" value="1.0" class="w-full bg-transparent border-none text-center font-mono py-2 focus:ring-0 text-white" />
                        <button class="px-3 text-gray-400 hover:text-white hover:bg-gray-700">+</button>
                    </div>
                </div>
                <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-2">Stop Loss</label>
                    <input type="text" placeholder="1.0800" class="w-full bg-gray-800 border-none rounded-lg py-2 px-3 focus:ring-1 ring-neonBlue text-sm font-mono">
                </div>
                <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-2">Take Profit</label>
                    <input type="text" placeholder="1.0900" class="w-full bg-gray-800 border-none rounded-lg py-2 px-3 focus:ring-1 ring-neonBlue text-sm font-mono">
                </div>
                <div class="flex-[2] flex gap-4 items-end">
                    <button onclick="showToast('Sell Order Executed at 1.0845', 'info')" class="flex-1 bg-neonRed bg-opacity-20 hover:bg-neonRed hover:text-white text-neonRed border border-neonRed font-bold py-2 rounded-lg transition-all text-sm">SELL<br><span class="text-xs font-mono font-normal opacity-80">1.0845</span></button>
                    <button onclick="showToast('Buy Order Executed at 1.0846', 'success')" class="flex-1 bg-neonGreen bg-opacity-20 hover:bg-neonGreen hover:text-darker text-neonGreen border border-neonGreen font-bold py-2 rounded-lg transition-all text-sm shadow-[0_0_15px_rgba(0,255,102,0.2)]">BUY<br><span class="text-xs font-mono font-normal opacity-80">1.0846</span></button>
                </div>
            </div>
        </div>
    </div>
    `;
}

function renderCopy() {
    return `
    <div class="flex justify-between items-center mb-6">
        <h3 class="font-display font-bold text-xl">Top Performing Traders</h3>
        <select class="bg-gray-800 text-sm px-4 py-2 rounded-lg border-gray-700 font-medium">
            <option>Highest ROI</option>
            <option>Most Copiers</option>
            <option>Lowest Risk</option>
        </select>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${[1,2,3,4,5,6].map(i => `
        <div class="glass-panel p-6 rounded-2xl hover:-translate-y-2 transition-transform duration-300">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <img src="https://i.pravatar.cc/100?img=${i+10}" class="w-12 h-12 rounded-full border-2 border-neonBlue" alt="Trader">
                    <div>
                        <p class="font-bold text-white">Trader Alpha ${i}</p>
                        <p class="text-xs text-gray-400">Risk Score: <span class="text-neonGold">Medium</span></p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-neonGreen font-bold text-lg">+${120 + i*15}%</p>
                    <p class="text-xs text-gray-400">ROI (YTD)</p>
                </div>
            </div>
            <div class="h-16 mb-6">
                <!-- Mini canvas representation could go here -->
                <div class="w-full h-full bg-gray-800 rounded flex items-center justify-center opacity-50 text-xs">Chart Data</div>
            </div>
            <div class="flex justify-between items-center">
                <p class="text-sm font-medium text-gray-400"><span class="text-white">${300 + i*50}</span> Copiers</p>
                <button onclick="showToast('Started copying Trader Alpha ${i}', 'success')" class="bg-neonBlue text-darker text-sm font-bold px-6 py-2 rounded-lg hover:shadow-[0_0_15px_#00f3ff] transition-all">Copy</button>
            </div>
        </div>`).join('')}
    </div>
    `;
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
