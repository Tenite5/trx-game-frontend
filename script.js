document.addEventListener('DOMContentLoaded', () => {
    const authForms = document.getElementById('auth-forms');
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');
    const regMessage = document.getElementById('reg-message');
    const loginMessage = document.getElementById('login-message');
    const loginContainer = document.getElementById('login-form-container');
    const registerContainer = document.getElementById('register-form-container');
    const showLoginLink = document.getElementById('show-login');
    const showRegisterLink = document.getElementById('show-register');

    // Dashboard elements
    const usernameDisplay = document.getElementById('username-display');
    const balanceDisplay = document.getElementById('balance-display');
    const statusMessage = document.getElementById('status-message');
    const queueButton = document.getElementById('queue-button');
    const cancelQueueButton = document.getElementById('cancel-queue-button');
    const logoutButton = document.getElementById('logout-button');
    const depositButton = document.getElementById('deposit-button');
    const withdrawButton = document.getElementById('withdraw-button');

    // Game results
    const gameResultsSection = document.getElementById('game-results');
    const gameStatusDisplay = document.getElementById('game-status');
    const opponentNameDisplay = document.getElementById('opponent-name');
    const winnerNameDisplay = document.getElementById('winner-name');

    const API_URL = 'https://trx-game-backend.onrender.com/api';
    let queueInterval = null;

    if (document.body.contains(usernameDisplay)) {
        initDashboard();
    }

    const switchForm = (formToShow) => {
        if (formToShow === 'login') {
            loginContainer.classList.add('active');
            registerContainer.classList.remove('active');
        } else {
            registerContainer.classList.add('active');
            loginContainer.classList.remove('active');
        }
    };

    if (showLoginLink) showLoginLink.addEventListener('click', e => {
        e.preventDefault();
        switchForm('login');
    });

    if (showRegisterLink) showRegisterLink.addEventListener('click', e => {
        e.preventDefault();
        switchForm('register');
    });

    if (registerForm) registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        regMessage.textContent = '';

        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (response.ok) {
                regMessage.textContent = data.message;
                regMessage.style.color = 'green';
                setTimeout(() => switchForm('login'), 2000);
            } else {
                regMessage.textContent = data.message;
                regMessage.style.color = 'red';
            }
        } catch {
            regMessage.textContent = 'Network error. Could not register.';
            regMessage.style.color = 'red';
        }
    });

    if (loginForm) loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        loginMessage.textContent = '';

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', username);
                window.location.href = 'dashboard.html';
            } else {
                loginMessage.textContent = data.message;
                loginMessage.style.color = 'red';
            }
        } catch {
            loginMessage.textContent = 'Network error. Could not log in.';
            loginMessage.style.color = 'red';
        }
    });

    async function initDashboard() {
        const token = localStorage.getItem('token');
        if (!token) return window.location.href = 'index.html';

        const username = localStorage.getItem('username');
        if (username) usernameDisplay.textContent = username;

        fetchBalance(token);

        queueButton.addEventListener('click', () => queueForGame(token));
        cancelQueueButton.addEventListener('click', () => cancelQueue(token));

        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = 'index.html';
        });

        depositButton.addEventListener('click', async () => {
            const amount = parseFloat(prompt("Enter the amount of TRX to deposit:"));
            if (isNaN(amount) || amount <= 0) return alert("Invalid amount.");
            try {
                const response = await fetch(`${API_URL}/deposit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ amount })
                });
                const data = await response.json();
                if (response.ok && data.paymentUrl) {
                    window.open(data.paymentUrl, '_blank');
                } else {
                    alert(`Deposit failed: ${data.message || 'No payment URL returned'}`);
                }
            } catch (error) {
                console.error('Deposit error:', error);
                alert('Network error. Could not create deposit.');
            }
        });

        withdrawButton.addEventListener('click', async () => {
            const amount = parseFloat(prompt("Enter the amount of TRX to withdraw:"));
            if (isNaN(amount) || amount <= 0) return alert("Invalid amount.");
            const tronWalletAddress = prompt("Enter your TRX wallet address:");
            if (!tronWalletAddress) return alert("TRX wallet address is required.");
            try {
                const response = await fetch(`${API_URL}/withdraw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ amount, tronWalletAddress })
                });
                const data = await response.json();
                if (response.ok) {
                    alert(data.message);
                    fetchBalance(token);
                } else {
                    alert(`Withdrawal failed: ${data.message}`);
                }
            } catch (error) {
                console.error('Withdrawal error:', error);
                alert('Network error. Could not withdraw.');
            }
        });
    }

    async function fetchBalance(token) {
        try {
            const response = await fetch(`${API_URL}/balance`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                balanceDisplay.textContent = data.trx_balance;
            } else balanceDisplay.textContent = 'Error fetching balance.';
        } catch {
            balanceDisplay.textContent = 'Network error.';
        }
    }

    async function queueForGame(token) {
        statusMessage.textContent = 'Queuing for a game...';
        statusMessage.style.color = '#007bff';
        gameResultsSection.style.display = 'none';

        try {
            const response = await fetch(`${API_URL}/queue`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) {
                statusMessage.textContent = data.message;
                statusMessage.style.color = 'red';
                return;
            }

            statusMessage.textContent = data.message;
            statusMessage.style.color = 'green';
            console.log('Queue response:', data);

            if (data.status === 'queued') {
                queueInterval = setInterval(async () => {
                    const matchResponse = await fetch(`${API_URL}/match-status/${data.gameId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    const matchData = await matchResponse.json();
                    if (matchData.status === 'completed') {
                        clearInterval(queueInterval);
                        queueInterval = null;
                        showGameResults(matchData, token);
                    } else {
                        statusMessage.textContent = `Still in queue...`;
                    }
                }, 3000);
            } else showGameResults(data, token);

        } catch {
            statusMessage.textContent = 'Network error. Could not join queue.';
            statusMessage.style.color = 'red';
        }
    }

    async function cancelQueue(token) {
        if (!queueInterval) return alert('You are not in queue.');
        try {
            const response = await fetch(`${API_URL}/cancel-queue`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (response.ok) {
                clearInterval(queueInterval);
                queueInterval = null;
                statusMessage.textContent = 'Queue canceled.';
                statusMessage.style.color = 'orange';
                console.log('Queue canceled successfully.');
            } else {
                alert(data.message);
            }
        } catch {
            alert('Network error. Could not cancel queue.');
        }
    }

    function showGameResults(matchData, token) {
        gameResultsSection.style.display = 'block';
        gameStatusDisplay.textContent = 'Completed';
