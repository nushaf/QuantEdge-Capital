import { auth, db, ADMIN_EMAIL } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.handleLogout = () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
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
});

function listenForMessages() {
    const messagesList = document.getElementById('messages-list');
    const emptyState = document.getElementById('empty-state');
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        messagesList.innerHTML = '';

        if (snapshot.empty) {
            emptyState.classList.remove('hidden');
            return;
        }
        emptyState.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const id = docSnap.id;
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
                        <button data-id="${id}" data-email="${escapeHtml(msg.email || '')}" class="reply-btn bg-neonBlue text-darker font-bold px-6 py-2.5 rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all text-sm">Send Reply</button>
                    </div>
                `}
            `;
            messagesList.appendChild(card);
        });

        // Wire up reply buttons
        document.querySelectorAll('.reply-btn').forEach((btn) => {
            btn.addEventListener('click', () => handleReply(btn.dataset.id, btn.dataset.email));
        });
    });
}

async function handleReply(messageId, clientEmail) {
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

        // Open the admin's email client, pre-filled, to actually send it to the client
        const subject = encodeURIComponent('Re: Your message to QuantEdge Capital');
        const body = encodeURIComponent(replyText);
        window.location.href = `mailto:${clientEmail}?subject=${subject}&body=${body}`;

        showToast('Reply saved — your email app will open to send it', 'success');
    } catch (err) {
        showToast('Could not save reply. Please try again.', 'error');
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
