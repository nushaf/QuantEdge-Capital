import { auth, db, ADMIN_EMAIL } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const steps = document.querySelectorAll('.auth-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    const progressLine = document.getElementById('progress-line');
    let currentStep = 0;

    const showStep = (stepIndex) => {
        steps.forEach((step, index) => {
            step.classList.toggle('hidden', index !== stepIndex);
            if (index === stepIndex) {
                step.classList.remove('opacity-0', 'translate-y-4');
                step.classList.add('opacity-100', 'translate-y-0', 'transition-all', 'duration-500');
            } else {
                step.classList.add('opacity-0', 'translate-y-4');
                step.classList.remove('opacity-100', 'translate-y-0');
            }
        });

        progressSteps.forEach((step, index) => {
            if (index <= stepIndex) {
                step.classList.add('bg-neonBlue', 'border-neonBlue', 'shadow-[0_0_10px_#00f3ff]');
                step.classList.remove('border-gray-600', 'bg-dark');
                if (step.querySelector('svg')) {
                    step.querySelector('svg').classList.remove('text-gray-400');
                    step.querySelector('svg').classList.add('text-darker');
                }
            } else {
                step.classList.remove('bg-neonBlue', 'border-neonBlue', 'shadow-[0_0_10px_#00f3ff]');
                step.classList.add('border-gray-600', 'bg-dark');
                if (step.querySelector('svg')) {
                    step.querySelector('svg').classList.add('text-gray-400');
                    step.querySelector('svg').classList.remove('text-darker');
                }
            }
        });

        if (progressLine) {
            progressLine.style.width = `${(stepIndex / (steps.length - 1)) * 100}%`;
        }
    };

    window.nextStep = () => {
        // Basic validation: require filled inputs on the current step before moving on
        const currentStepEl = steps[currentStep];
        const requiredInputs = currentStepEl.querySelectorAll('input[required]');
        for (const input of requiredInputs) {
            if (!input.value.trim()) {
                showToast('Please fill in all fields', 'error');
                input.focus();
                return;
            }
        }
        if (currentStep < steps.length - 1) {
            currentStep++;
            showStep(currentStep);
            window.scrollTo(0, 0);
        }
    };

    window.prevStep = () => {
        if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
            window.scrollTo(0, 0);
        }
    };

    window.submitForm = async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;
        btn.disabled = true;

        const email = document.querySelector('#step-1 input[type="email"]').value.trim();
        const password = document.getElementById('register-password').value;
        const fullName = document.querySelector('#step-2 input[type="text"]').value.trim();
        const phone = document.querySelector('#step-2 input[type="tel"]').value.trim();

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: fullName });
            await setDoc(doc(db, 'users', userCred.user.uid), {
                fullName,
                email,
                phone,
                createdAt: serverTimestamp(),
                // Real account starts empty — admin fills this in manually as the client deposits/trades
                balance: 0,
                activePositions: 0,
                todaysProfit: 0,
                todaysProfitPercent: 0,
                portfolioHistory: [],
                recentActivity: []
            });

            showToast('Registration successful! Redirecting to dashboard...', 'success');
            setTimeout(() => {
                window.location.href = (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? 'admin.html' : 'dashboard.html';
            }, 1500);
        } catch (err) {
            showToast(friendlyAuthError(err), 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    window.login = async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Authenticating...`;
        btn.disabled = true;

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            const rememberCheckbox = document.getElementById('remember-me');
            if (rememberCheckbox && rememberCheckbox.checked) {
                localStorage.setItem('qe_remember_email', email);
            } else {
                localStorage.removeItem('qe_remember_email');
            }
            showToast('Login successful! Loading dashboard...', 'success');
            setTimeout(() => {
                window.location.href = (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? 'admin.html' : 'dashboard.html';
            }, 1000);
        } catch (err) {
            showToast(friendlyAuthError(err), 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    window.toggleMode = () => {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const isLogin = !loginForm.classList.contains('hidden');

        if (isLogin) {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            document.getElementById('auth-title').innerText = 'Create Account';
            showStep(0);
        } else {
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            document.getElementById('auth-title').innerText = 'Welcome Back';
        }
    };

    function friendlyAuthError(err) {
        const code = err.code || '';
        if (code.includes('email-already-in-use')) return 'That email is already registered — try logging in instead.';
        if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
        if (code.includes('invalid-email')) return 'Please enter a valid email address.';
        if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password.';
        return err.message || 'Something went wrong. Please try again.';
    }

    const eyeOpenSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>`;
    const eyeClosedSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path></svg>`;

    window.toggleLoginPasswordVisibility = () => {
        const input = document.getElementById('login-password');
        const btn = document.getElementById('login-password-eye');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.innerHTML = isHidden ? eyeClosedSVG : eyeOpenSVG;
    };

    window.toggleRegisterPasswordVisibility = () => {
        const input = document.getElementById('register-password');
        const btn = document.getElementById('register-password-eye');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.innerHTML = isHidden ? eyeClosedSVG : eyeOpenSVG;
    };

    window.forgotPassword = () => {
        const email = document.getElementById('login-email').value.trim();
        if (!email) {
            showToast('Enter your email above first, then tap "Forgot password?"', 'error');
            return;
        }
        sendPasswordResetEmail(auth, email).then(() => {
            showToast('Password reset email sent — check your inbox', 'success');
        }).catch((err) => {
            showToast(friendlyAuthError(err), 'error');
        });
    };

    if (steps.length > 0) {
        steps.forEach(s => s.classList.add('opacity-0', 'translate-y-4'));
        showStep(currentStep);
    }

    // If arrived via a "Log In" link, show the login form instead of the default signup form
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'login') {
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('auth-title').innerText = 'Welcome Back';
    }

    // Remember me — restores the last-used email (never the password; browsers handle that securely)
    const rememberCheckbox = document.getElementById('remember-me');
    const loginEmailInput = document.getElementById('login-email');
    const savedEmail = localStorage.getItem('qe_remember_email');
    if (savedEmail && loginEmailInput) {
        loginEmailInput.value = savedEmail;
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }
});
