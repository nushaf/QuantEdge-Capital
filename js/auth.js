document.addEventListener('DOMContentLoaded', () => {
    const steps = document.querySelectorAll('.auth-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    const progressLine = document.getElementById('progress-line');
    let currentStep = 0;

    const showStep = (stepIndex) => {
        steps.forEach((step, index) => {
            step.classList.toggle('hidden', index !== stepIndex);
            
            // Add slight animation
            if(index === stepIndex) {
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
                
                // Update icon color to darker if background is neon
                if(step.querySelector('svg')) {
                    step.querySelector('svg').classList.remove('text-gray-400');
                    step.querySelector('svg').classList.add('text-darker');
                }
            } else {
                step.classList.remove('bg-neonBlue', 'border-neonBlue', 'shadow-[0_0_10px_#00f3ff]');
                step.classList.add('border-gray-600', 'bg-dark');
                if(step.querySelector('svg')) {
                    step.querySelector('svg').classList.add('text-gray-400');
                    step.querySelector('svg').classList.remove('text-darker');
                }
            }
        });

        if(progressLine) {
            progressLine.style.width = `${(stepIndex / (steps.length - 1)) * 100}%`;
        }
    };

    window.nextStep = () => {
        // Here we could add validation
        if (currentStep < steps.length - 1) {
            currentStep++;
            showStep(currentStep);
            window.scrollTo(0,0);
        }
    };

    window.prevStep = () => {
        if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
            window.scrollTo(0,0);
        }
    };

    window.submitForm = (e) => {
        e.preventDefault();
        
        // Change button state
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;
        btn.disabled = true;

        setTimeout(() => {
            showToast('Registration successful! Redirecting to dashboard...', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        }, 1500);
    };

    window.login = (e) => {
        e.preventDefault();
        
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Authenticating...`;
        btn.disabled = true;

        setTimeout(() => {
            showToast('Login successful! Loading dashboard...', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        }, 1000);
    };
    
    window.toggleMode = () => {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const isLogin = !loginForm.classList.contains('hidden');
        
        if (isLogin) {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            document.getElementById('auth-title').innerText = 'Create Account';
            document.getElementById('auth-subtitle').innerText = 'Join QuantEdge Capital today';
            showStep(0);
        } else {
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            document.getElementById('auth-title').innerText = 'Welcome Back';
            document.getElementById('auth-subtitle').innerText = 'Log in to your account';
        }
    };

    if(steps.length > 0) {
        steps.forEach(s => s.classList.add('opacity-0', 'translate-y-4'));
        showStep(currentStep);
    }
});
