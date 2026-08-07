import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Sending...';
        btn.disabled = true;

        const firstName = document.getElementById('cf-first-name').value.trim();
        const lastName = document.getElementById('cf-last-name').value.trim();
        const email = document.getElementById('cf-email').value.trim();
        const message = document.getElementById('cf-message').value.trim();

        try {
            await addDoc(collection(db, 'messages'), {
                name: `${firstName} ${lastName}`.trim(),
                email,
                message,
                userId: currentUser ? currentUser.uid : null,
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
});
