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
  board: { type: [String], default: [] }, // Dynamic size based on generated cells
  boardSize: { type: Number, default: 0 }, // Track actual board size
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  player1Symbol: { type: String, default: 'X' },
  player2Symbol: { type: String, default: 'O' },
  createdAt: { type: Date, default: Date.now },
  lastMoveAt: { type: Date, default: Date.now },
  lastMovePlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moveCount: { type: Number, default: 0 },
  // Store board layout info for win detection
  edgeCells: {
    top: { type: [Number], default: [] },
    bottom: { type: [Number], default: [] },
    left: { type: [Number], default: [] },
    right: { type: [Number], default: [] }
  },
  adjacencyMap: { type: Map, default: new Map() }
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

/* -------------------- DYNAMIC VORONOI HEX GAME LOGIC -------------------- */

function hasPath(startCells, endCells, player, board, adjacencyMap) {
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
    const neighbors = adjacencyMap.get(current.toString()) || [];
    neighbors.forEach(neighbor => {
      if (board[neighbor] === player && !visited.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }
  
  return false;
}

const checkWinner = (board, edgeCells, adjacencyMap) => {
  if (!board || board.length === 0) return null;
  
  // Check if Player 1 (X) connects top to bottom
  const topXCells = edgeCells.top.filter(i => board[i] === 'X');
  const bottomXCells = edgeCells.bottom.filter(i => board[i] === 'X');
  
  if (topXCells.length > 0 && bottomXCells.length > 0) {
    if (hasPath(topXCells, bottomXCells, 'X', board, adjacencyMap)) {
      return 'X';
    }
  }
  
  // Check if Player 2 (O) connects left to right
  const leftOCells = edgeCells.left.filter(i => board[i] === 'O');
  const rightOCells = edgeCells.right.filter(i => board[i] === 'O');
  
  if (leftOCells.length > 0 && rightOCells.length > 0) {
    if (hasPath(leftOCells, rightOCells, 'O', board, adjacencyMap)) {
      return 'O';
    }
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
      opponentGame.currentPlayer = opponentGame.player1;
      await opponentGame.save();

      const opponent = await User.findById(opponentGame.player1);
      
      res.json({
        message: 'Match found! Redirecting to game.',
        gameId: opponentGame._id,
        status: 'in_progress',
        opponent: opponent.username,
        yourSymbol: 'O',
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

// Initialize board layout (called by frontend when board is generated)
app.post('/api/game/:gameId/init-board', authenticateToken, async (req, res) => {
  const { boardSize, edgeCells, adjacencyMap } = req.body;
  
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    
    const userId = req.user.userId;
    if (!game.player1.equals(userId) && (!game.player2 || !game.player2.equals(userId))) {
      return res.status(403).json({ message: 'You are not part of this game.' });
    }

    // Initialize the board with the correct size
    if (game.boardSize === 0) {
      game.board = Array(boardSize).fill('');
      game.boardSize = boardSize;
      game.edgeCells = edgeCells;
      
      // Convert adjacency map to MongoDB Map format
      const mongoMap = new Map();
      for (const [key, value] of Object.entries(adjacencyMap)) {
        mongoMap.set(key, value);
      }
      game.adjacencyMap = mongoMap;
      
      await game.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Init board error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Get game state
app.get('/api/game/:gameId', authenticateToken, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('player1 player2 winner currentPlayer');
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    
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
      boardSize: game.boardSize,
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
    
    if (position < 0 || position >= game.board.length || game.board[position] !== '') {
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
    const winner = checkWinner(game.board, game.edgeCells, game.adjacencyMap);
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

// Match status
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