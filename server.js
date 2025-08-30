require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

/* -------------------- DATABASE -------------------- */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas!'))
  .catch(err => console.error('MongoDB connection error:', err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  trx_balance: { type: Number, default: 0 },
});
const User = mongoose.model('User', UserSchema);

const GameSchema = new mongoose.Schema({
  player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stake: { type: Number, required: true },
  status: { type: String, enum: ['queued', 'in_progress', 'completed'], default: 'queued' },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  board: { type: [String], default: Array(16).fill('') }, // 16-cell Voronoi board
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  player1Symbol: { type: String, default: 'X' },
  player2Symbol: { type: String, default: 'O' },
  createdAt: { type: Date, default: Date.now },
  lastMoveAt: { type: Date, default: Date.now },
  lastMovePlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Track who made the last move for draw condition
  moveCount: { type: Number, default: 0 }, // Track total moves for draw detection
});
const Game = mongoose.model('Game', GameSchema);

/* -------------------- AUTH -------------------- */
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'my_secret_key', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

/* -------------------- VORONOI HEX GAME LOGIC -------------------- */

// Predefined adjacency map for 16-cell Voronoi board
// This represents which cells are adjacent to each other
const ADJACENCY_MAP = {
  0: [1, 4, 5],
  1: [0, 2, 4, 5, 6],
  2: [1, 3, 5, 6, 7],
  3: [2, 6, 7],
  4: [0, 1, 8, 9],
  5: [0, 1, 2, 8, 9, 10],
  6: [1, 2, 3, 9, 10, 11],
  7: [2, 3, 10, 11],
  8: [4, 5, 12, 13],
  9: [4, 5, 6, 12, 13, 14],
  10: [5, 6, 7, 13, 14, 15],
  11: [6, 7, 14, 15],
  12: [8, 9],
  13: [8, 9, 10],
  14: [9, 10, 11],
  15: [10, 11]
};

// Define edge cells for connection checking
const TOP_CELLS = [0, 1, 2, 3];
const BOTTOM_CELLS = [12, 13, 14, 15];
const LEFT_CELLS = [0, 4, 8, 12];
const RIGHT_CELLS = [3, 7, 11, 15];

function hasPath(startCells, endCells, player, board) {
  const visited = new Set();
  const queue = [];
  
  // Add all start cells that belong to the player to the queue
  startCells.forEach(cellIndex => {
    if (board[cellIndex] === player) {
      queue.push(cellIndex);
    }
  });
  
  while (queue.length > 0) {
    const current = queue.shift();
    
    if (visited.has(current)) continue;
    visited.add(current);
    
    // Check if we've reached any end cell
    if (endCells.includes(current)) {
      return true;
    }
    
    // Add adjacent cells of the same player
    const neighbors = ADJACENCY_MAP[current] || [];
    neighbors.forEach(neighbor => {
      if (board[neighbor] === player && !visited.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }
  
  return false;
}

const checkWinner = (board, moveCount) => {
  // Check if Player 1 (X) connects top to bottom
  if (hasPath(TOP_CELLS, BOTTOM_CELLS, 'X', board)) {
    return 'X';
  }
  
  // Check if Player 2 (O) connects left to right
  if (hasPath(LEFT_CELLS, RIGHT_CELLS, 'O', board)) {
    return 'O';
  }
  
  // Check for draw (board full)
  if (board.every(cell => cell !== '')) {
    return 'draw';
  }
  
  return null; // game continues
};

/* -------------------- AUTH ROUTES -------------------- */
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: 'User created successfully.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid username or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid username or password.' });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'my_secret_key',
      { expiresIn: '1h' }
    );
    res.json({ message: 'Login successful.', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

/* -------------------- GAME ROUTES -------------------- */
app.post('/api/queue', authenticateToken, async (req, res) => {
  const STAKE = 10;
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.trx_balance < STAKE) return res.status(400).json({ message: 'Insufficient funds.' });

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    await Game.deleteMany({ status: 'queued', createdAt: { $lt: twoMinutesAgo } });

    user.trx_balance -= STAKE;
    await user.save();

    const opponentGame = await Game.findOne({
      status: 'queued',
      player1: { $ne: user._id },
      createdAt: { $gte: twoMinutesAgo }
    });

    if (opponentGame) {
      opponentGame.player2 = user._id;
      opponentGame.status = 'in_progress';
      opponentGame.currentPlayer = opponentGame.player1; // player1 goes first
      await opponentGame.save();

      const opponent = await User.findById(opponentGame.player1);
      
      res.json({
        message: 'Match found! Redirecting to game.',
        gameId: opponentGame._id,
        status: 'in_progress',
        opponent: opponent.username,
        yourSymbol: 'O', // second player gets O
        currentPlayer: opponent.username
      });
    } else {
      const newGame = new Game({ 
        player1: user._id, 
        stake: STAKE,
        currentPlayer: user._id 
      });
      await newGame.save();
      res.json({
        message: 'You are queued. Waiting for opponent.',
        gameId: newGame._id,
        status: 'queued'
      });
    }
  } catch (error) {
    console.error('Queue error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Get game state
app.get('/api/game/:gameId', authenticateToken, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('player1 player2 winner currentPlayer');
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    
    // Check if user is part of this game
    const userId = req.user.userId;
    if (!game.player1._id.equals(userId) && (!game.player2 || !game.player2._id.equals(userId))) {
      return res.status(403).json({ message: 'You are not part of this game.' });
    }

    const isPlayer1 = game.player1._id.equals(userId);
    const yourSymbol = isPlayer1 ? game.player1Symbol : game.player2Symbol;
    
    res.json({
      gameId: game._id,
      status: game.status,
      board: game.board,
      player1: game.player1.username,
      player2: game.player2?.username || null,
      yourSymbol,
      currentPlayer: game.currentPlayer?.username || null,
      winner: game.winner?.username || null,
      isYourTurn: game.currentPlayer && game.currentPlayer._id.equals(userId)
    });
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Make a move
app.post('/api/game/:gameId/move', authenticateToken, async (req, res) => {
  const { position } = req.body;
  
  try {
    const game = await Game.findById(req.params.gameId).populate('player1 player2');
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    if (game.status !== 'in_progress') return res.status(400).json({ message: 'Game is not in progress.' });
    
    const userId = req.user.userId;
    if (!game.currentPlayer.equals(userId)) {
      return res.status(400).json({ message: 'Not your turn.' });
    }
    
    if (position < 0 || position > 15 || game.board[position] !== '') {
      return res.status(400).json({ message: 'Invalid move.' });
    }
    
    // Make the move
    const isPlayer1 = game.player1._id.equals(userId);
    const symbol = isPlayer1 ? game.player1Symbol : game.player2Symbol;
    game.board[position] = symbol;
    game.lastMoveAt = new Date();
    game.lastMovePlayer = userId;
    game.moveCount += 1;
    
    // Check for winner
    const winner = checkWinner(game.board, game.moveCount);
    if (winner) {
      game.status = 'completed';
      if (winner === 'draw') {
        // Draw - last player to move loses, other player gets the pot
        const loser = game.lastMovePlayer;
        const winnerId = loser.equals(game.player1._id) ? game.player2._id : game.player1._id;
        game.winner = winnerId;
        
        const winnerUser = await User.findById(winnerId);
        winnerUser.trx_balance += game.stake * 2 * 0.975; // 2.5% fee
        await winnerUser.save();
      } else {
        // Someone won by connecting their sides
        const winnerId = winner === game.player1Symbol ? game.player1._id : game.player2._id;
        game.winner = winnerId;
        
        const winnerUser = await User.findById(winnerId);
        winnerUser.trx_balance += game.stake * 2 * 0.975; // 2.5% fee
        await winnerUser.save();
      }
    } else {
      // Switch turns
      game.currentPlayer = isPlayer1 ? game.player2._id : game.player1._id;
    }
    
    await game.save();
    
    res.json({
      success: true,
      board: game.board,
      status: game.status,
      winner: winner,
      currentPlayer: game.currentPlayer,
      isYourTurn: game.status === 'in_progress' && game.currentPlayer && game.currentPlayer.equals(userId)
    });
  } catch (error) {
    console.error('Move error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Cancel queue
app.post('/api/cancel-queue', authenticateToken, async (req, res) => {
  try {
    const game = await Game.findOne({ status: 'queued', player1: req.user.userId });
    if (game) {
      // Refund the player
      const user = await User.findById(req.user.userId);
      user.trx_balance += game.stake;
      await user.save();
      await Game.deleteOne({ _id: game._id });
    }
    res.json({ message: 'Queue cancelled.' });
  } catch (error) {
    console.error('Cancel queue error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Match status (updated for new flow)
app.get('/api/match-status/:gameId', authenticateToken, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('player1 player2 winner');
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    
    res.json({
      status: game.status,
      player1: game.player1.username,
      player2: game.player2?.username || null,
      winner: game.winner?.username || null,
      gameId: game._id
    });
  } catch (error) {
    console.error('Match status error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Balance
app.get('/api/balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ username: user.username, trx_balance: user.trx_balance });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

/* -------------------- OXAPAY INTEGRATION -------------------- */
const oxaPayApiUrl = 'https://api.oxapay.com/v1';

// Deposit
app.post('/api/deposit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const order_id = `${userId}_${Date.now()}`;
    const { amount } = req.body;

    const response = await axios.post(`${oxaPayApiUrl}/payment/invoice`, {
      amount,
      currency: 'TRX',
      order_id,
      callback_url: `${process.env.BACKEND_URL}/api/deposit-webhook`,
      return_url: `${process.env.FRONTEND_URL}/dashboard.html`,
      lifetime: 30,
      sandbox: true
    }, {
      headers: { 
        'merchant_api_key': process.env.OXAPAY_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    res.json({ paymentUrl: response.data.data.payment_url });
  } catch (error) {
    console.error('Deposit error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to create deposit invoice.' });
  }
});

// Deposit webhook
app.post('/api/deposit-webhook', async (req, res) => {
  try {
    const { status, amount, order_id } = req.body;
    if (status === 'Paid' || status === 'Completed') {
      const userId = order_id.split('_')[0];
      const user = await User.findById(userId);
      if (user) {
        user.trx_balance += Number(amount);
        await user.save();
        console.log(`Deposit confirmed: ${amount} TRX for ${user.username}`);
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Withdraw
app.post('/api/withdraw', authenticateToken, async (req, res) => {
  const { amount, tronWalletAddress } = req.body;
  const FEE = 0.10;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (amount > user.trx_balance) return res.status(400).json({ message: 'Insufficient funds.' });

    const payoutAmount = amount - (amount * FEE);

    await axios.post(`${oxaPayApiUrl}/payout`, {
      amount: payoutAmount,
      currency: 'TRX',
      address: tronWalletAddress,
      sandbox: true
    }, {
      headers: { 
        'payout_api_key': process.env.OXAPAY_PAYOUT_KEY,
        'Content-Type': 'application/json'
      }
    });

    user.trx_balance -= amount;
    await user.save();

    res.json({ message: 'Withdrawal successful.', payoutAmount, newBalance: user.trx_balance });
  } catch (error) {
    console.error('Withdraw error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Withdrawal failed.' });
  }
});

/* -------------------- START SERVER -------------------- */
app.get('/', (req, res) => res.send('Welcome to the TRX Voronoi Hex Game Backend!'));

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));