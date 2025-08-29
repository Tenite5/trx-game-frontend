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
    const logoutButton = document.getElementById('logout-button');
    const depositButton = document.getElementById('deposit-button');
    const withdrawButton = document.getElementById('withdraw-button');
    
    // Game results
    const gameResultsSection = document.getElementById('game-results');
    const gameStatusDisplay = document.getElementById('game-status');
    const opponentNameDisplay = document.getElementById('opponent-name');
    const winnerNameDisplay = document.getElementById('winner-name');
    const refreshButton = document.getElementById('refresh-button');

    // API URL - IMPORTANT: Change this if you deploy your server
    const API_URL = 'https://trx-game-backend.onrender.com/api';

    // Check if the user is on the dashboard page
    if (document.body.contains(usernameDisplay)) {
        initDashboard();
    }

    // Function to switch between login and register forms
    const switchForm = (formToShow) => {
        if (formToShow === 'login') {
            loginContainer.classList.add('active');
            registerContainer.classList.remove('active');
        } else {
            registerContainer.classList.add('active');
            loginContainer.classList.remove('active');
        }
    };
    if (showLoginLink) showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('login');
    });
    if (showRegisterLink) showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('register');
    });

    // Handle user registration
    if (registerForm) registerForm.addEventListener('submit', async (e) => {
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
                setTimeout(() => switchForm('login'), 2000); // Switch to login on success
            } else {
                regMessage.textContent = data.message;
                regMessage.style.color = 'red';
            }
        } catch (error) {
            regMessage.textContent = 'Network error. Could not register.';
            regMessage.style.color = 'red';
        }
    });

    // Handle user login
    if (loginForm) loginForm.addEventListener('submit', async (e) => {
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
                localStorage.setItem('token', data.token); // Store the JWT token
                localStorage.setItem('username', username);
                window.location.href = 'dashboard.html';
            } else {
                loginMessage.textContent = data.message;
                loginMessage.style.color = 'red';
            }
        } catch (error) {
            loginMessage.textContent = 'Network error. Could not log in.';
            loginMessage.style.color = 'red';
        }
    });

    // --- Dashboard Logic ---
    async function initDashboard() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'index.html'; // Redirect to login if no token
            return;
        }

        const username = localStorage.getItem('username');
        if (username) {
            usernameDisplay.textContent = username;
        }

        fetchBalance(token);

        queueButton.addEventListener('click', () => queueForGame(token));
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = 'index.html';
        });
        depositButton.addEventListener('click', () => alert("Deposit function coming soon!")); // Placeholder
        withdrawButton.addEventListener('click', () => alert("Withdrawal function coming soon!")); // Placeholder
    }

    async function fetchBalance(token) {
        try {
            const response = await fetch(`${API_URL}/balance`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                balanceDisplay.textContent = data.trx_balance;
            } else {
                balanceDisplay.textContent = 'Error fetching balance.';
            }
        } catch (error) {
            balanceDisplay.textContent = 'Network error.';
            console.error('Error fetching balance:', error);
        }
    }

    async function queueForGame(token) {
        statusMessage.textContent = 'Queuing for a game...';
        statusMessage.style.color = '#007bff';
        gameResultsSection.style.display = 'none';

        try {
            const response = await fetch(`${API_URL}/queue`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (response.ok) {
                statusMessage.textContent = data.message;
                statusMessage.style.color = 'green';
                fetchBalance(token); // Update balance after staking

                if (data.status === 'queued') {
                    // Start checking for a match
                    let checkCount = 0;
                    const maxChecks = 10;
                    const interval = setInterval(async () => {
                        if (checkCount >= maxChecks) {
                            clearInterval(interval);
                            statusMessage.textContent = 'Still in queue. Check back later.';
                            return;
                        }

                        const matchResponse = await fetch(`${API_URL}/match-status/${data.gameId}`, {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const matchData = await matchResponse.json();

                        if (matchData.status === 'completed') {
                            clearInterval(interval);
                            showGameResults(matchData, token);
                        } else {
                            statusMessage.textContent = `Still in queue... (${checkCount + 1}/${maxChecks})`;
                        }
                        checkCount++;
                    }, 5000); // Check every 5 seconds
                } else {
                    // Match found immediately
                    showGameResults(data, token);
                }
            } else {
                statusMessage.textContent = data.message;
                statusMessage.style.color = 'red';
                fetchBalance(token); // Re-fetch balance in case of error
            }
        } catch (error) {
            statusMessage.textContent = 'Network error. Could not join queue.';
            statusMessage.style.color = 'red';
            console.error('Queue error:', error);
        }
    }
    
    function showGameResults(matchData, token) {
        gameResultsSection.style.display = 'block';
        gameStatusDisplay.textContent = 'Completed';
        opponentNameDisplay.textContent = matchData.player1 === localStorage.getItem('username') ? matchData.player2 : matchData.player1;
        winnerNameDisplay.textContent = matchData.winner;

        if (matchData.winner === localStorage.getItem('username')) {
            gameResultsSection.style.borderColor = 'green';
            statusMessage.textContent = 'You won the match!';
        } else {
            gameResultsSection.style.borderColor = 'red';
            statusMessage.textContent = 'You lost the match.';
        }
        
        fetchBalance(token); // Update balance after game
    }
});