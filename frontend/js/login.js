// ========================================
// LOGIN.JS - PERBAIKAN
// Smart Door Security System - Login Handler
// FIXED: BASE_URL consistency dengan main.js
// ========================================

console.log('🔐 Login.js loaded successfully');

// ✅ PERBAIKAN: Gunakan window.BASE_URL untuk consistency
// Fallback ke Render URL jika window.BASE_URL belum terdefinisi
const getBaseURL = () => {
    if (typeof window.BASE_URL !== 'undefined') {
        return window.BASE_URL;
    }
    // Fallback ke Render URL
    return 'https://smartdoor-alkadir.onrender.com';
};

const BASE_API_URL = `${getBaseURL()}/api/users/login`;

console.log('🌐 Using API URL:', BASE_API_URL);

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded');
    initLoginPage();
});

// Initialize login page
function initLoginPage() {
    console.log('🚀 Initializing login page...');

    const loginForm = document.getElementById('loginForm');
    
    if (!loginForm) {
        console.error('❌ Login form not found in DOM!');
        return;
    }

    console.log('✅ Login form found, attaching event listener...');
    loginForm.addEventListener('submit', handleLogin);

    // Auto-focus on username field
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.focus();
        console.log('✅ Username field focused');
    }

    // Enter key handler for better UX
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin(e);
            }
        });
    }

    console.log('✅ Login page initialized successfully');
}

// Handle login form submission
async function handleLogin(e) {
    e.preventDefault();
    
    console.log('');
    console.log('='.repeat(50));
    console.log('🔒 LOGIN ATTEMPT STARTED');
    console.log('='.repeat(50));

    // Get form inputs
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.querySelector('.btn-login');

    // Validate inputs exist
    if (!usernameInput || !passwordInput) {
        console.error('❌ Input fields not found in DOM');
        showMessage('Form error: Input fields not found', 'error');
        return;
    }

    // Get values
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    console.log('📝 Login Details:');
    console.log('   Username:', username);
    console.log('   Password length:', password.length);
    console.log('   Password (hidden):', '*'.repeat(password.length));

    // Validate empty fields
    if (!username || !password) {
        console.warn('⚠️ Validation failed: Empty fields');
        showMessage('⚠️ Please enter both username and password', 'error');
        return;
    }

    // Disable submit button to prevent double submission
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
        submitBtn.style.opacity = '0.6';
        console.log('🔒 Submit button disabled');
    }

    try {
        console.log('');
        console.log('📤 Sending login request to server...');
        console.log('   Endpoint:', BASE_API_URL);
        console.log('   Method: POST');

        const requestBody = { username, password };
        console.log('   Request body:', { username, password: '***' });

        // ✅ PERBAIKAN: Menggunakan BASE_API_URL yang sudah dinamis
        const response = await fetch(BASE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('');
        console.log('📥 Response Received:');
        console.log('   Status:', response.status);
        console.log('   Status Text:', response.statusText);
        console.log('   OK:', response.ok);

        // Parse response
        const data = await response.json();
        console.log('   Response Data:', data);

        if (data.success) {
            console.log('');
            console.log('✅ LOGIN SUCCESSFUL!');
            console.log('='.repeat(50));
            console.log('👤 User Information:');
            console.log('   Username:', data.user.username);
            console.log('   User Type:', data.user.userType);
            console.log('   User ID:', data.user._id);
            console.log('   Device:', data.user.device);
            console.log('='.repeat(50));

            // Save session data
            console.log('');
            console.log('💾 Saving session data to sessionStorage...');
            sessionStorage.setItem('userName', data.user.username);
            sessionStorage.setItem('userType', data.user.userType);
            sessionStorage.setItem('userId', data.user._id);
            sessionStorage.setItem('userDevice', data.user.device || 'esp32cam');
            
            console.log('✅ Session data saved:');
            console.log('   userName:', sessionStorage.getItem('userName'));
            console.log('   userType:', sessionStorage.getItem('userType'));

            // Show success message
            showMessage('✅ Login successful! Redirecting to dashboard...', 'success');

            // Redirect after delay
            console.log('');
            console.log('🔄 Redirecting to dashboard in 1 second...');
            
            setTimeout(() => {
                console.log('➡️ Redirecting to: index.html');
                window.location.href = 'index.html';
            }, 1000);

        } else {
            // Login failed
            console.log('');
            console.log('❌ LOGIN FAILED!');
            console.log('='.repeat(50));
            console.error('   Reason:', data.message);
            console.log('='.repeat(50));
            
            showMessage('❌ ' + (data.message || 'Login failed. Please check your credentials.'), 'error');
            
            // Re-enable button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login';
                submitBtn.style.opacity = '1';
                console.log('🔓 Submit button re-enabled');
            }

            // Clear password field
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }

    } catch (error) {
        console.log('');
        console.log('❌ ERROR OCCURRED!');
        console.log('='.repeat(50));
        console.error('   Error Type:', error.name);
        console.error('   Error Message:', error.message);
        console.error('   Full Error:', error);
        console.log('='.repeat(50));
        
        let errorMessage = '❌ Connection error. ';
        
        if (error.message.includes('Failed to fetch')) {
            errorMessage += 'Cannot connect to server. Please check:\n';
            errorMessage += '• Server is running\n';
            errorMessage += '• Network connection\n';
            errorMessage += '• CORS settings';
        } else {
            errorMessage += error.message;
        }
        
        showMessage(errorMessage, 'error');
        
        // Re-enable button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
            submitBtn.style.opacity = '1';
            console.log('🔓 Submit button re-enabled');
        }
    }
}

// Show message to user
function showMessage(message, type) {
    console.log('');
    console.log('📢 SHOWING MESSAGE TO USER:');
    console.log('   Type:', type.toUpperCase());
    console.log('   Message:', message);
    
    const messageDiv = document.getElementById('message');
    
    if (!messageDiv) {
        console.error('❌ Message div not found in DOM');
        console.log('   Falling back to alert()');
        alert(message);
        return;
    }

    // Set message content and style
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';

    console.log('✅ Message displayed to user');

    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
            console.log('🔕 Error message auto-hidden after 5 seconds');
        }, 5000);
    }
}

// Check if user is already logged in
function checkExistingSession() {
    const userName = sessionStorage.getItem('userName');
    
    if (userName) {
        console.log('ℹ️ Existing session found for:', userName);
        console.log('   Redirecting to dashboard...');
        window.location.href = 'index.html';
    }
}

// Call on page load
checkExistingSession();

console.log('');
console.log('✅ Login.js fully loaded and ready!');
console.log('');