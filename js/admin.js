import { auth, db, ADMIN_EMAIL } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    query,
    orderBy,
    where,
    onSnapshot,
    doc,
    updateDoc,
    setDoc,
    deleteDoc,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.handleLogout = () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    });
};

window.openLightbox = (src) => {
    if (!src) return;
    document.getElementById('lightbox-img').src = src;
    document.getElementById('image-lightbox').classList.remove('hidden');
};
window.closeLightbox = () => {
    document.getElementById('image-lightbox').classList.add('hidden');
};

function trashIconBtn(collectionName, id, extraClass = '') {
    return `<button onclick="deleteRecord('${collectionName}', '${id}')" class="text-neonRed hover:text-red-300 hover:scale-110 transition-all ${extraClass}" title="Delete">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
    </button>`;
}

window.deleteRecord = async (collectionName, id) => {
    const labels = { messages: 'this message', transactions: 'this request', users: "this client's account data" };
    const confirmed = window.confirm(`Delete ${labels[collectionName] || 'this record'}? This only removes it from your admin dashboard and cannot be undone.`);
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, collectionName, id));
        showToast('Deleted', 'success');
    } catch (err) {
        showToast('Could not delete. Please try again.', 'error');
    }
};

window.switchTab = (tab) => {
    const tabs = { inbox: 'tab-inbox', clients: 'tab-clients', requests: 'tab-requests', trading: 'tab-trading', settings: 'tab-settings' };
    const panels = { inbox: 'panel-inbox', clients: 'panel-clients', requests: 'panel-requests', trading: 'panel-trading', settings: 'panel-settings' };

    Object.keys(tabs).forEach((key) => {
        const tabEl = document.getElementById(tabs[key]);
        const panelEl = document.getElementById(panels[key]);
        if (key === tab) {
            tabEl.classList.add('bg-neonBlue', 'text-darker');
            tabEl.classList.remove('text-gray-400');
            panelEl.classList.remove('hidden');
        } else {
            tabEl.classList.remove('bg-neonBlue', 'text-darker');
            tabEl.classList.add('text-gray-400');
            panelEl.classList.add('hidden');
        }
    });
};

onAuthStateChanged(auth, (user) => {
    const accessCheck = document.getElementById('access-check');
    const inboxMain = document.getElementById('inbox-main');

    if (!user) {
        // Not logged in at all -> send to login
        window.location.href = 'auth.html';
        return;
    }

    if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        // Logged in, but not the admin -> send to their normal dashboard
        window.location.href = 'dashboard.html';
        return;
    }

    // Confirmed admin
    accessCheck.classList.add('hidden');
    inboxMain.classList.remove('hidden');
    listenForMessages();
    listenForClients();
    listenForRequests();
    loadPaymentSettings();
    initTradingTab();
});

let allMessages = [];

function listenForMessages() {
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        allMessages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMessages();
    });

    document.getElementById('messages-search').addEventListener('input', renderMessages);
}

function renderMessages() {
    const messagesList = document.getElementById('messages-list');
    const emptyState = document.getElementById('empty-state');
    const searchTerm = (document.getElementById('messages-search').value || '').trim().toLowerCase();

    const filtered = searchTerm
        ? allMessages.filter(m => (m.email || '').toLowerCase().includes(searchTerm))
        : allMessages;

    messagesList.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.textContent = searchTerm ? 'No messages found for that email.' : 'No messages yet. New client messages will show up here automatically.';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    filtered.forEach((msg) => {
        const id = msg.id;
        const isReplied = msg.status === 'replied';
        const time = msg.createdAt && msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleString() : 'Just now';

        const card = document.createElement('div');
        card.className = 'glass-panel p-6 md:p-8 rounded-2xl reveal';
        card.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                    <h3 class="font-display font-bold text-lg">${escapeHtml(msg.name || 'Unknown')}</h3>
                    <a href="mailto:${escapeHtml(msg.email || '')}" class="text-neonBlue text-sm font-mono hover:underline">${escapeHtml(msg.email || '')}</a>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs text-gray-500">${time}</span>
                    <span class="text-xs font-bold px-3 py-1 rounded-full ${isReplied ? 'bg-neonGreen/10 text-neonGreen' : 'bg-neonGold/10 text-neonGold'}">${isReplied ? 'Replied' : 'Unread'}</span>
                    ${trashIconBtn('messages', id)}
                </div>
            </div>
            <p class="text-gray-300 mb-6 leading-relaxed">${escapeHtml(msg.message || '')}</p>
            ${isReplied ? `
                <div class="border-t border-gray-800 pt-4">
                    <p class="text-xs text-gray-500 mb-1">Your reply:</p>
                    <p class="text-sm text-gray-400">${escapeHtml(msg.reply || '')}</p>
                </div>
            ` : `
                <div class="border-t border-gray-800 pt-4">
                    <textarea id="reply-${id}" rows="3" placeholder="Type your reply..." class="w-full px-4 py-3 rounded-xl border border-gray-700 bg-[rgba(255,255,255,0.03)] focus:border-neonBlue focus:ring-1 focus:ring-neonBlue outline-none transition-all resize-none mb-3"></textarea>
                    <button data-id="${id}" data-email="${escapeHtml(msg.email || '')}" data-userid="${msg.userId || ''}" class="reply-btn bg-neonBlue text-darker font-bold px-6 py-2.5 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all text-sm">Send Reply</button>
                </div>
            `}
        `;
        messagesList.appendChild(card);
    });

    // Wire up reply buttons
    document.querySelectorAll('.reply-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleReply(btn.dataset.id, btn.dataset.email, btn.dataset.userid));
    });
}

async function handleReply(messageId, clientEmail, userId) {
    const textarea = document.getElementById(`reply-${messageId}`);
    const replyText = textarea.value.trim();

    if (!replyText) {
        showToast('Write a reply first', 'error');
        return;
    }

    try {
        // Save the reply in the database so it's tracked
        await updateDoc(doc(db, 'messages', messageId), {
            status: 'replied',
            reply: replyText,
            repliedAt: serverTimestamp()
        });

        if (userId && userId !== 'null' && userId !== 'undefined') {
            // Registered client — they'll see your reply right on their Get in Touch page
            showToast('Reply saved — visible to the client in their Support page', 'success');
        } else {
            // Guest (not logged in) — only reachable by email
            const subject = encodeURIComponent('Re: Your message to QuantEdge Capital');
            const body = encodeURIComponent(replyText);
            window.location.href = `mailto:${clientEmail}?subject=${subject}&body=${body}`;
            showToast('Reply saved — your email app will open to send it', 'success');
        }
    } catch (err) {
        showToast('Could not save reply. Please try again.', 'error');
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---------- Clients management ----------
let currentEditClientId = null;
let allClients = [];

function listenForClients() {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        // Admin's own account doc (if it exists) shouldn't show up as a "client"
        allClients = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(c => (c.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase());
        renderClients();
    });

    document.getElementById('clients-search').addEventListener('input', renderClients);
}

function renderClients() {
    const clientsList = document.getElementById('clients-list');
    const emptyState = document.getElementById('clients-empty-state');
    const searchTerm = (document.getElementById('clients-search').value || '').trim().toLowerCase();

    const filtered = searchTerm
        ? allClients.filter(c => (c.email || '').toLowerCase().includes(searchTerm))
        : allClients;

    clientsList.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.textContent = searchTerm ? 'No clients found for that email.' : 'No registered clients yet.';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    filtered.forEach((client) => {
        const id = client.id;
        const balance = client.balance ?? 0;

        const kycBadge = client.kycStatus === 'verified'
            ? `<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-neonGreen/10 text-neonGreen">Verified</span>`
            : client.kycStatus === 'pending'
            ? `<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-neonGold/10 text-neonGold">KYC Pending</span>`
            : `<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-800 text-gray-400">No KYC</span>`;

        const card = document.createElement('div');
        card.className = 'glass-panel p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 reveal';
        card.innerHTML = `
            <div>
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 class="font-display font-bold text-lg">${escapeHtml(client.fullName || 'Unnamed Client')}</h3>
                    ${kycBadge}
                </div>
                <p class="text-neonBlue text-sm font-mono">${escapeHtml(client.email || '')}</p>
                <p class="text-gray-500 text-xs mt-1">Contact: ${client.phone ? escapeHtml(client.phone) : 'Not provided'}</p>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
                <div class="text-right">
                    <p class="text-xs text-gray-500">Balance</p>
                    <p class="font-display font-bold text-white">$${balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
                ${client.kycFrontImage ? `<button data-id="${id}" class="review-kyc-btn bg-transparent border border-neonBlue text-neonBlue font-bold px-5 py-2.5 rounded-xl hover:bg-neonBlue hover:text-darker transition-all text-sm">Review KYC</button>` : ''}
                <button data-id="${id}" class="edit-client-btn bg-neonBlue text-darker font-bold px-5 py-2.5 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all text-sm">Edit</button>
                ${trashIconBtn('users', id)}
            </div>
        `;
        clientsList.appendChild(card);
    });

    document.querySelectorAll('.edit-client-btn').forEach((btn) => {
        const id = btn.dataset.id;
        const client = filtered.find(c => c.id === id);
        btn.addEventListener('click', () => openEditModal(id, client));
    });

    document.querySelectorAll('.review-kyc-btn').forEach((btn) => {
        const id = btn.dataset.id;
        const client = filtered.find(c => c.id === id);
        btn.addEventListener('click', () => openKycModal(id, client));
    });

    // Keep the Trading tab's client picker in sync with the same underlying data
    if (typeof renderTradingClientList === 'function') renderTradingClientList();
}

function openEditModal(id, client) {
    currentEditClientId = id;
    document.getElementById('edit-modal-name').textContent = `${client.fullName || 'Client'} — ${client.email || ''}`;
    document.getElementById('edit-balance').value = client.balance ?? 0;
    document.getElementById('edit-profit').value = client.totalProfit ?? 0;
    document.getElementById('edit-credit-bonus').value = client.creditBonus ?? 0;
    document.getElementById('edit-total-deposit').value = client.totalDeposit ?? 0;
    document.getElementById('edit-total-withdrawal').value = client.totalWithdrawal ?? 0;
    document.getElementById('edit-modal').classList.remove('hidden');
}

window.closeEditModal = () => {
    currentEditClientId = null;
    document.getElementById('edit-modal').classList.add('hidden');
};

let currentKycClientId = null;

function openKycModal(id, client) {
    currentKycClientId = id;
    document.getElementById('kyc-modal-name').textContent = `${client.fullName || 'Client'} — ${client.email || ''}`;
    document.getElementById('kyc-modal-type').textContent = client.kycType || 'Not specified';
    const frontImg = document.getElementById('kyc-modal-front');
    const backImg = document.getElementById('kyc-modal-back');
    frontImg.src = client.kycFrontImage || '';
    backImg.src = client.kycBackImage || '';
    frontImg.onclick = () => window.openLightbox(client.kycFrontImage);
    backImg.onclick = () => window.openLightbox(client.kycBackImage);
    document.getElementById('kyc-modal').classList.remove('hidden');
}

window.closeKycModal = () => {
    currentKycClientId = null;
    document.getElementById('kyc-modal').classList.add('hidden');
};

window.verifyKyc = async () => {
    if (!currentKycClientId) return;
    try {
        await updateDoc(doc(db, 'users', currentKycClientId), { kycStatus: 'verified' });
        showToast('Client marked as verified', 'success');
        window.closeKycModal();
    } catch (err) {
        showToast('Could not update. Please try again.', 'error');
    }
};

window.rejectKyc = async () => {
    if (!currentKycClientId) return;
    try {
        await updateDoc(doc(db, 'users', currentKycClientId), { kycStatus: 'rejected' });
        showToast('KYC marked as rejected', 'info');
        window.closeKycModal();
    } catch (err) {
        showToast('Could not update. Please try again.', 'error');
    }
};

window.saveClientEdit = async () => {
    if (!currentEditClientId) return;
    const btn = document.getElementById('save-client-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    const balance = parseFloat(document.getElementById('edit-balance').value) || 0;
    const totalProfit = parseFloat(document.getElementById('edit-profit').value) || 0;
    const creditBonus = parseFloat(document.getElementById('edit-credit-bonus').value) || 0;
    const totalDeposit = parseFloat(document.getElementById('edit-total-deposit').value) || 0;
    const totalWithdrawal = parseFloat(document.getElementById('edit-total-withdrawal').value) || 0;

    try {
        await updateDoc(doc(db, 'users', currentEditClientId), {
            balance,
            totalProfit,
            creditBonus,
            totalDeposit,
            totalWithdrawal
        });
        showToast('Client account updated — reflects live on their dashboard', 'success');
        window.closeEditModal();
    } catch (err) {
        showToast('Could not save. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ---------- Deposit / Withdrawal requests ----------
let allRequests = [];

function listenForRequests() {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderRequests();
    });

    document.getElementById('requests-search').addEventListener('input', renderRequests);
}

function renderRequests() {
    const list = document.getElementById('requests-list');
    const emptyState = document.getElementById('requests-empty-state');
    const searchTerm = (document.getElementById('requests-search').value || '').trim().toLowerCase();

    const filtered = searchTerm
        ? allRequests.filter(tx => (tx.userEmail || '').toLowerCase().includes(searchTerm))
        : allRequests;

    list.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.textContent = searchTerm ? 'No requests found for that email.' : 'No deposit or withdrawal requests yet.';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    filtered.forEach((tx) => {
        const id = tx.id;
        const isDeposit = tx.type === 'deposit';
        const isPending = tx.status === 'pending';
        const time = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate().toLocaleString() : 'Just now';

        let statusBadge;
        if (tx.status === 'pending') statusBadge = `<span class="text-xs font-bold px-3 py-1 rounded-full bg-neonGold/10 text-neonGold">${isDeposit ? 'Deposit Pending' : 'Withdrawal Pending'}</span>`;
        else if (tx.status === 'approved') statusBadge = `<span class="text-xs font-bold px-3 py-1 rounded-full bg-neonGreen/10 text-neonGreen">${isDeposit ? 'Deposit Approved' : 'Withdrawal Completed'}</span>`;
        else statusBadge = `<span class="text-xs font-bold px-3 py-1 rounded-full bg-neonRed/10 text-neonRed">Rejected</span>`;

        let detailsHtml = '';
        if (isDeposit) {
            detailsHtml = `
                <p class="text-sm text-gray-400 mb-2">Method: <span class="text-white">${tx.method === 'wallet' ? 'Crypto Wallet' : 'Bank Transfer'}</span></p>
                ${tx.proofImage ? `<img src="${tx.proofImage}" class="proof-thumb w-28 h-28 object-cover rounded-xl border border-gray-700 mt-2 cursor-zoom-in hover:opacity-80 transition-opacity" alt="Payment proof (click to enlarge)">` : `<p class="text-gray-500 text-sm">No proof image attached</p>`}
            `;
        } else {
            if (tx.method === 'wallet') {
                detailsHtml = `<p class="text-sm text-gray-400">Send to wallet: <span class="text-neonBlue font-mono break-all">${escapeHtml(tx.destination?.walletAddress || '')}</span></p>`;
            } else {
                detailsHtml = `
                    <p class="text-sm text-gray-400">Account Holder: <span class="text-white">${escapeHtml(tx.destination?.accountHolder || '')}</span></p>
                    <p class="text-sm text-gray-400">Bank: <span class="text-white">${escapeHtml(tx.destination?.bankName || '')}</span></p>
                    <p class="text-sm text-gray-400">Account No: <span class="text-white font-mono">${escapeHtml(tx.destination?.accountNumber || '')}</span></p>
                `;
            }
        }

        const card = document.createElement('div');
        card.className = 'glass-panel p-6 md:p-8 rounded-2xl reveal';
        card.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                    <h3 class="font-display font-bold text-lg">${isDeposit ? 'Deposit' : 'Withdrawal'} — $${(tx.amount ?? 0).toLocaleString()}</h3>
                    <p class="text-neonBlue text-xs font-mono">${escapeHtml(tx.userName || tx.userEmail || tx.userId || 'Unknown client')}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs text-gray-500">${time}</span>
                    ${statusBadge}
                    ${trashIconBtn('transactions', id)}
                </div>
            </div>
            <div class="mb-4">${detailsHtml}</div>
            ${isPending ? `
                <div class="flex gap-3 border-t border-gray-800 pt-4">
                    <button data-id="${id}" data-type="${tx.type}" data-amount="${tx.amount}" data-user="${tx.userId}" class="approve-btn flex-1 bg-neonGreen/10 border border-neonGreen text-neonGreen font-bold py-2.5 rounded-xl hover:bg-neonGreen hover:text-darker transition-all text-sm">Approve</button>
                    <button data-id="${id}" class="reject-btn flex-1 bg-neonRed/10 border border-neonRed text-neonRed font-bold py-2.5 rounded-xl hover:bg-neonRed hover:text-white transition-all text-sm">Reject</button>
                </div>
            ` : ''}
        `;
        list.appendChild(card);
    });

    document.querySelectorAll('.approve-btn').forEach((btn) => {
        btn.addEventListener('click', () => approveRequest(btn.dataset.id, btn.dataset.type, parseFloat(btn.dataset.amount), btn.dataset.user));
    });
    document.querySelectorAll('.reject-btn').forEach((btn) => {
        btn.addEventListener('click', () => rejectRequest(btn.dataset.id));
    });
    document.querySelectorAll('.proof-thumb').forEach((imgEl) => {
        imgEl.addEventListener('click', () => window.openLightbox(imgEl.src));
    });
}

async function approveRequest(id, type, amount, userId) {
    try {
        await updateDoc(doc(db, 'transactions', id), {
            status: 'approved',
            reviewedAt: serverTimestamp()
        });

        if (type === 'deposit') {
            await updateDoc(doc(db, 'users', userId), {
                balance: increment(amount),
                totalDeposit: increment(amount)
            });
        } else {
            await updateDoc(doc(db, 'users', userId), {
                balance: increment(-amount),
                totalWithdrawal: increment(amount)
            });
        }

        showToast('Request approved — client account updated', 'success');
    } catch (err) {
        showToast('Could not approve request. Please try again.', 'error');
    }
}

async function rejectRequest(id) {
    try {
        await updateDoc(doc(db, 'transactions', id), {
            status: 'rejected',
            reviewedAt: serverTimestamp()
        });
        showToast('Request rejected', 'info');
    } catch (err) {
        showToast('Could not reject request. Please try again.', 'error');
    }
}

// ---------- Payment settings ----------
function loadPaymentSettings() {
    onSnapshot(doc(db, 'settings', 'paymentDetails'), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            document.getElementById('settings-wallet-address').value = d.walletAddress || '';
            document.getElementById('settings-wallet-network').value = d.walletNetwork || '';
            document.getElementById('settings-bank-name').value = d.bankName || '';
            document.getElementById('settings-bank-account-name').value = d.bankAccountName || '';
            document.getElementById('settings-bank-account-number').value = d.bankAccountNumber || '';
        }
    });
}

window.savePaymentSettings = async () => {
    const btn = document.getElementById('save-settings-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    try {
        await setDoc(doc(db, 'settings', 'paymentDetails'), {
            walletAddress: document.getElementById('settings-wallet-address').value.trim(),
            walletNetwork: document.getElementById('settings-wallet-network').value.trim(),
            bankName: document.getElementById('settings-bank-name').value.trim(),
            bankAccountName: document.getElementById('settings-bank-account-name').value.trim(),
            bankAccountNumber: document.getElementById('settings-bank-account-number').value.trim()
        }, { merge: true });
        showToast('Payment details updated — live for all clients now', 'success');
    } catch (err) {
        showToast('Could not save. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ---------- Trading oversight ----------
let selectedTradingClientId = null;
let unsubscribeClientTrades = null;
let clientOpenPositions = [];
let currentCloseTradeId = null;
let currentCloseOutcome = 'profit';

function initTradingTab() {
    document.getElementById('trading-search').addEventListener('input', renderTradingClientList);
}

function renderTradingClientList() {
    const listEl = document.getElementById('trading-clients-list');
    const emptyEl = document.getElementById('trading-clients-empty');
    const searchTerm = (document.getElementById('trading-search').value || '').trim().toLowerCase();

    const filtered = searchTerm
        ? allClients.filter(c => (c.email || '').toLowerCase().includes(searchTerm))
        : allClients;

    listEl.innerHTML = '';

    if (filtered.length === 0) {
        emptyEl.textContent = searchTerm ? 'No clients found for that email.' : 'No registered clients yet.';
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');

    filtered.forEach((client) => {
        const card = document.createElement('div');
        card.className = 'glass-panel p-6 rounded-2xl flex items-center justify-between gap-4 reveal cursor-pointer hover:border-neonBlue/40 transition-all';
        card.innerHTML = `
            <div>
                <h3 class="font-display font-bold text-lg">${escapeHtml(client.fullName || 'Unnamed Client')}</h3>
                <p class="text-neonBlue text-sm font-mono">${escapeHtml(client.email || '')}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        `;
        card.addEventListener('click', () => openTradingClientDetail(client));
        listEl.appendChild(card);
    });
}

function openTradingClientDetail(client) {
    selectedTradingClientId = client.id;
    document.getElementById('trading-client-list-view').classList.add('hidden');
    document.getElementById('trading-client-detail-view').classList.remove('hidden');
    document.getElementById('trading-detail-name').textContent = client.fullName || 'Unnamed Client';
    document.getElementById('trading-detail-email').textContent = client.email || '';

    if (unsubscribeClientTrades) unsubscribeClientTrades();
    const q = query(collection(db, 'trades'), where('userId', '==', client.id));
    unsubscribeClientTrades = onSnapshot(q, (snapshot) => {
        clientOpenPositions = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(t => t.status === 'open');
        renderClientPositions();
    });
}

window.backToTradingClientList = () => {
    selectedTradingClientId = null;
    if (unsubscribeClientTrades) { unsubscribeClientTrades(); unsubscribeClientTrades = null; }
    document.getElementById('trading-client-detail-view').classList.add('hidden');
    document.getElementById('trading-client-list-view').classList.remove('hidden');
};

function renderClientPositions() {
    const listEl = document.getElementById('trading-positions-list');
    const emptyEl = document.getElementById('trading-positions-empty');

    if (clientOpenPositions.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');

    listEl.innerHTML = clientOpenPositions.map(t => `
        <div class="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h4 class="font-display font-bold">${escapeHtml(t.label || t.symbol)} <span class="${t.side === 'buy' ? 'text-neonGreen' : 'text-neonRed'} text-sm font-bold ml-2">${(t.side || '').toUpperCase()}</span></h4>
                <p class="text-gray-400 text-xs mt-1">Lot ${t.lotSize} · Entry ${t.entryPrice} ${t.sl ? `· SL ${t.sl}` : ''} ${t.tp ? `· TP ${t.tp}` : ''}</p>
            </div>
            <button data-id="${t.id}" data-label="${escapeHtml(t.label || t.symbol)}" class="admin-close-trade-btn bg-neonBlue text-darker font-bold px-6 py-2.5 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all text-sm">Close Position</button>
        </div>
    `).join('');

    document.querySelectorAll('.admin-close-trade-btn').forEach((btn) => {
        btn.addEventListener('click', () => openAdminCloseModal(btn.dataset.id, btn.dataset.label));
    });
}

function openAdminCloseModal(tradeId, label) {
    currentCloseTradeId = tradeId;
    document.getElementById('admin-close-trade-label').textContent = label;
    document.getElementById('admin-close-amount').value = '';
    window.setCloseOutcome('profit');
    document.getElementById('admin-close-trade-modal').classList.remove('hidden');
}

window.setCloseOutcome = (outcome) => {
    currentCloseOutcome = outcome;
    const profitBtn = document.getElementById('outcome-profit-btn');
    const lossBtn = document.getElementById('outcome-loss-btn');
    profitBtn.classList.toggle('bg-neonGreen', outcome === 'profit');
    profitBtn.classList.toggle('text-darker', outcome === 'profit');
    profitBtn.classList.toggle('text-gray-400', outcome !== 'profit');
    lossBtn.classList.toggle('bg-neonRed', outcome === 'loss');
    lossBtn.classList.toggle('text-white', outcome === 'loss');
    lossBtn.classList.toggle('text-gray-400', outcome !== 'loss');
};

window.closeAdminTradeModal = () => {
    currentCloseTradeId = null;
    document.getElementById('admin-close-trade-modal').classList.add('hidden');
};

window.confirmAdminCloseTrade = async () => {
    if (!currentCloseTradeId || !selectedTradingClientId) return;
    const amountRaw = parseFloat(document.getElementById('admin-close-amount').value);
    if (isNaN(amountRaw) || amountRaw < 0) {
        showToast('Enter a valid amount', 'error');
        return;
    }
    const pnl = currentCloseOutcome === 'profit' ? amountRaw : -amountRaw;

    const btn = document.getElementById('admin-close-confirm-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Closing...';
    btn.disabled = true;

    try {
        await updateDoc(doc(db, 'trades', currentCloseTradeId), {
            status: 'closed', pnl, closeReason: 'manual', closedAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'users', selectedTradingClientId), {
            balance: increment(pnl), totalProfit: increment(pnl)
        });
        showToast('Position closed and balance updated', 'success');
        window.closeAdminTradeModal();
    } catch (err) {
        showToast('Could not close position. Please try again.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
