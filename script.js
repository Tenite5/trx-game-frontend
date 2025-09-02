// Make the move
    const isPlayer1 = game.player1._id.equals(userId);// Generate board by deforming a 4x4 grid then mirroring
function generateGameBoard() {
  const seed = Date.now();
  const width = 500;
  const height = 500;
  
  // Seeded random number generator
  let rng = seed;
  function seededRandom() {
    rng = (rng * 1664525 + 1013904223) % Math.pow(2, 32);
    return (rng / Math.pow(2, 32));
  }
  
  // Create 4x4 grid of squares in one quadrant
  const gridSize = 4;
  const cellSize = (width/2) / gridSize;
  const baseCells = [];
  
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * cellSize;
      const y = row * cellSize;
      
      // Base square vertices
      let vertices = [
        { x: x, y: y },                    // top-left
        { x: x + cellSize, y: y },         // top-right
        { x: x + cellSize, y: y + cellSize }, // bottom-right
        { x: x, y: y + cellSize }          // bottom-left
      ];
      
      // Add 0-3 random vertices to each edge
      const numNewVertices = Math.floor(seededRandom() * 4); // 0-3 vertices
      
      for (let v = 0; v < numNewVertices; v++) {
        const edge = Math.floor(seededRandom() * 4); // which edge (0=top, 1=right, 2=bottom, 3=left)
        const position = seededRandom(); // position along edge (0-1)
        
        let newVertex;
        switch (edge) {
          case 0: // top edge
            newVertex = { x: x + position * cellSize, y: y };
            break;
          case 1: // right edge
            newVertex = { x: x + cellSize, y: y + position * cellSize };
            break;
          case 2: // bottom edge
            newVertex = { x: x + position * cellSize, y: y + cellSize };
            break;
          case 3: // left edge
            newVertex = { x: x, y: y + position * cellSize };
            break;
        }
        
        // Insert vertex in correct position to maintain clockwise order
        vertices.splice(edge + 1 + v, 0, newVertex);
      }
      
      // Randomly move interior vertices (not on the grid boundary)
      vertices = vertices.map(vertex => {
        const isOnBoundary = (
          vertex.x === 0 || vertex.x === width/2 || 
          vertex.y === 0 || vertex.y === height/2
        );
        
        if (!isOnBoundary) {
          // Move vertex randomly within the cell bounds
          const maxOffset = cellSize * 0.2; // 20% of cell size
          const offsetX = (seededRandom() - 0.5) * 2 * maxOffset;
          const offsetY = (seededRandom() - 0.5) * 2 * maxOffset;
          
          return {
            x: Math.max(x + 5, Math.min(x + cellSize - 5, vertex.x + offsetX)),
            y: Math.max(y + 5, Math.min(y + cellSize - 5, vertex.y + offsetY))
          };
        }
        
        return vertex;
      });
      
      baseCells.push({
        id: row * gridSize + col,
        center: { x: x + cellSize/2, y: y + cellSize/2 },
        vertices: vertices
      });
    }
  }
  
  // Mirror the quadrant to create full 8x8 board
  const allCells = [];
  
  // Original quadrant (top-left)
  baseCells.forEach(cell => {
    allCells.push({
      ...cell,
      id: allCells.length
    });
  });
  
  // Mirror horizontally (top-right)
  baseCells.forEach(cell => {
    const mirroredVertices = cell.vertices.map(v => ({
      x: width - v.x,
      y: v.y
    }));
    
    allCells.push({
      id: allCells.length,
      center: { x: width - cell.center.x, y: cell.center.y },
      vertices: mirroredVertices
    });
  });
  
  // Mirror vertically (bottom-left)
  baseCells.forEach(cell => {
    const mirroredVertices = cell.vertices.map(v => ({
      x: v.x,
      y: height - v.y
    }));
    
    allCells.push({
      id: allCells.length,
      center: { x: cell.center.x, y: height - cell.center.y },
      vertices: mirroredVertices
    });
  });
  
  // Mirror both ways (bottom-right)
  baseCells.forEach(cell => {
    const mirroredVertices = cell.vertices.map(v => ({
      x: width - v.x,
      y: height - v.y
    }));
    
    allCells.push({
      id: allCells.length,
      center: { x: width - cell.center.x, y: height - cell.center.y },
      vertices: mirroredVertices
    });
  });
  
  // Build adjacency map based on shared edges
  const adjacencyMap = new Map();
  allCells.forEach((cell, index) => {
    const neighbors = [];
    allCells.forEach((otherCell, otherIndex) => {
      if (index !== otherIndex && cellsShareEdge(cell, otherCell)) {
        neighbors.push(otherIndex);
      }
    });
    adjacencyMap.set(index.toString(), neighbors);
  });
  
  // Determine edge cells
  const edgeCells = {
    top: [],
    bottom: [],
    left: [],
    right: []
  };
  
  const edgeThreshold = cellSize;
  allCells.forEach((cell, index) => {
    if (cell.center.y < edgeThreshold) edgeCells.top.push(index);
    if (cell.center.y > height - edgeThreshold) edgeCells.bottom.push(index);
    if (cell.center.x < edgeThreshold) edgeCells.left.push(index);
    if (cell.center.x > width - edgeThreshold) edgeCells.right.push(index);
  });
  
  console.log(`Generated ${allCells.length} deformed grid cells (64 total)`);
  
  return {
    cells: allCells,
    edgeCells: edgeCells,
    adjacencyMap: adjacencyMap,
    seed: seed
  };
}

// Compute Voronoi cell boundaries
function computeVoronoiCell(center, allPoints, width, height) {
  const [cx, cy] = center;
  const vertices = [];
  
  // Sample points around the perimeter to find Voronoi boundaries
  const samples = 100;
  const boundaryPoints = [];
  
  // Sample around the entire perimeter
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * 2 * Math.PI;
    const maxRadius = Math.sqrt(width * width + height * height);
    
    for (let r = 10; r < maxRadius; r += 10) {
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      
      // Check if this point is within bounds
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        // Check if this point is closest to our center
        let isClosest = true;
        const distToCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        
        for (const otherPoint of allPoints) {
          if (otherPoint[0] === cx && otherPoint[1] === cy) continue;
          const distToOther = Math.sqrt((x - otherPoint[0]) ** 2 + (y - otherPoint[1]) ** 2);
          if (distToOther < distToCenter - 1) { // Small tolerance
            isClosest = false;
            break;
          }
        }
        
        if (isClosest) {
          boundaryPoints.push([x, y]);
          break; // Found boundary in this direction
        }
      }
    }
  }
  
  // Also check canvas boundaries
  const canvasBoundary = [
    [0, 0], [width, 0], [width, height], [0, height]
  ];
  
  canvasBoundary.forEach(point => {
    const [x, y] = point;
    let isClosest = true;
    const distToCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    
    for (const otherPoint of allPoints) {
      if (otherPoint[0] === cx && otherPoint[1] === cy) continue;
      const distToOther = Math.sqrt((x - otherPoint[0]) ** 2 + (y - otherPoint[1]) ** 2);
      if (distToOther < distToCenter) {
        isClosest = false;
        break;
      }
    }
    
    if (isClosest) {
      boundaryPoints.push(point);
    }
  });
  
  // Remove duplicates and sort by angle
  const uniquePoints = [];
  boundaryPoints.forEach(point => {
    const isDuplicate = uniquePoints.some(existing => 
      Math.abs(existing[0] - point[0]) < 5 && Math.abs(existing[1] - point[1]) < 5
    );
    if (!isDuplicate) {
      uniquePoints.push(point);
    }
  });
  
  // Sort by angle from center
  uniquePoints.sort((a, b) => {
    const angleA = Math.atan2(a[1] - cy, a[0] - cx);
    const angleB = Math.atan2(b[1] - cy, b[0] - cx);
    return angleA - angleB;
  });
  
  return uniquePoints;
}

function cellsShareEdge(cell1, cell2) {
  const tolerance = 8;
  let sharedVertices = 0;
  
  for (const v1 of cell1.vertices) {
    for (const v2 of cell2.vertices) {
      const distance = Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
      if (distance <= tolerance) {
        sharedVertices++;
      }
    }
  }
  
  return sharedVertices >= 2;
}require('dotenv').config();
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
  board: { type: [String], default: [] },
  boardSize: { type: Number, default: 0 },
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  player1Symbol: { type: String, default: 'X' },
  player2Symbol: { type: String, default: 'O' },
  createdAt: { type: Date, default: Date.now },
  lastMoveAt: { type: Date, default: Date.now },
  turnStartTime: { type: Date, default: Date.now }, // When current turn started
  lastMovePlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moveCount: { type: Number, default: 0 },
  // Store the actual board layout so both players see the same board
  boardLayout: {
    cells: { type: Array, default: [] }, // Array of cell objects with vertices
    edgeCells: {
      top: { type: [Number], default: [] },
      bottom: { type: [Number], default: [] },
      left: { type: [Number], default: [] },
      right: { type: [Number], default: [] }
    },
    adjacencyMap: { type: Map, default: new Map() }
  }
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

/* -------------------- VORONOI GENERATION -------------------- */
function generateSymmetricVoronoi() {
  const width = 500;
  const height = 500;
  
  // Use a seeded random approach for consistent generation
  const seed = Math.floor(Math.random() * 1000000);
  console.log('Board generation seed:', seed);
  
  // Create deterministic base points using the seed
  const basePoints = [];
  let rng = seed;
  
  // Simple LCG for deterministic randomness
  function seededRandom() {
    rng = (rng * 1664525 + 1013904223) % Math.pow(2, 32);
    return (rng / Math.pow(2, 32));
  }
  
  const clusters = [
    { x: width/4, y: height/6, count: 3, spread: 80 },
    { x: width/6, y: height/3, count: 2, spread: 60 },
    { x: width/3, y: height/4, count: 4, spread: 90 },
    { x: width/5, y: height/2.5, count: 2, spread: 50 },
    { x: width/2.5, y: height/5, count: 3, spread: 70 }
  ];
  
  clusters.forEach(cluster => {
    for (let i = 0; i < cluster.count; i++) {
      const angle = (i / cluster.count) * 2 * Math.PI + (seededRandom() - 0.5) * Math.PI;
      const radius = seededRandom() * cluster.spread;
      
      const x = cluster.x + Math.cos(angle) * radius;
      const y = cluster.y + Math.sin(angle) * radius;
      
      basePoints.push([
        Math.max(15, Math.min(width/2 - 15, x)),
        Math.max(15, Math.min(height/2 - 15, y))
      ]);
    }
  });
  
  // Add random points
  for (let i = 0; i < 3; i++) {
    basePoints.push([
      seededRandom() * (width/2 - 30) + 15,
      seededRandom() * (height/2 - 30) + 15
    ]);
  }
  
  // Mirror points for symmetry
  const allPoints = [];
  basePoints.forEach(point => {
    const x = point[0], y = point[1];
    allPoints.push([x, y]);
    allPoints.push([width - x, y]);
    allPoints.push([x, height - y]);
    allPoints.push([width - x, height - y]);
  });

  // Add boundary points
  const boundaryPoints = [
    [5, 5], [width/2, 5], [width-5, 5],
    [5, height/2], [width-5, height/2],
    [5, height-5], [width/2, height-5], [width-5, height-5]
  ];
  allPoints.push(...boundaryPoints);

  // Note: This would require D3.js on the backend, which isn't installed
  // For now, return a fixed layout that both players can use
  return {
    seed: seed,
    points: allPoints,
    width: width,
    height: height
  };
}

function buildAdjacencyMapFromCells(cells) {
  const adjacencyMap = new Map();
  
  cells.forEach((cell, index) => {
    const neighbors = [];
    
    cells.forEach((otherCell, otherIndex) => {
      if (index !== otherIndex && cellsShareEdge(cell, otherCell)) {
        neighbors.push(otherIndex);
      }
    });
    
    adjacencyMap.set(index.toString(), neighbors);
  });
  
  return adjacencyMap;
}

function cellsShareEdge(cell1, cell2) {
  const tolerance = 3;
  let sharedVertices = 0;
  
  for (const v1 of cell1.vertices) {
    for (const v2 of cell2.vertices) {
      const distance = Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.y - v2.y, 2));
      if (distance <= tolerance) {
        sharedVertices++;
      }
    }
  }
  
  return sharedVertices >= 2; // Cells share an edge if they have at least 2 shared vertices
}

/* -------------------- GAME LOGIC -------------------- */
function hasPath(startCells, endCells, player, board, adjacencyMap) {
  const visited = new Set();
  const queue = [];
  
  startCells.forEach(cellIndex => {
    if (board[cellIndex] === player) {
      queue.push(cellIndex);
    }
  });
  
  while (queue.length > 0) {
    const current = queue.shift();
    
    if (visited.has(current)) continue;
    visited.add(current);
    
    if (endCells.includes(current)) {
      return true;
    }
    
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
  
  const topXCells = edgeCells.top.filter(i => board[i] === 'X');
  const bottomXCells = edgeCells.bottom.filter(i => board[i] === 'X');
  
  if (topXCells.length > 0 && bottomXCells.length > 0) {
    if (hasPath(topXCells, bottomXCells, 'X', board, adjacencyMap)) {
      return 'X';
    }
  }
  
  const leftOCells = edgeCells.left.filter(i => board[i] === 'O');
  const rightOCells = edgeCells.right.filter(i => board[i] === 'O');
  
  if (leftOCells.length > 0 && rightOCells.length > 0) {
    if (hasPath(leftOCells, rightOCells, 'O', board, adjacencyMap)) {
      return 'O';
    }
  }
  
  if (board.every(cell => cell !== '')) {
    return 'draw';
  }
  
  return null;
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
      // Match found - generate board layout and start game
      const boardLayout = generateGameBoard();
      
      opponentGame.player2 = user._id;
      opponentGame.status = 'in_progress';
      opponentGame.currentPlayer = opponentGame.player1;
      opponentGame.turnStartTime = new Date(); // Start timer for first player
      opponentGame.boardLayout = boardLayout;
      opponentGame.board = Array(boardLayout.cells.length).fill('');
      opponentGame.boardSize = boardLayout.cells.length;
      
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

// Generate proper Voronoi diagram that partitions the board
function generateGameBoard() {
  const seed = Date.now(); // Unique seed per game
  const width = 500;
  const height = 500;
  
  // Seeded random number generator
  let rng = seed;
  function seededRandom() {
    rng = (rng * 1664525 + 1013904223) % Math.pow(2, 32);
    return (rng / Math.pow(2, 32));
  }
  
  // Generate base points for symmetric Voronoi
  const basePoints = [];
  const gridSize = 3; // Create 3x3 grid of base points for one quadrant
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const baseX = (i + 0.5) * (width/2) / gridSize;
      const baseY = (j + 0.5) * (height/2) / gridSize;
      
      // Add random offset for irregular cells
      const offsetX = (seededRandom() - 0.5) * cellSpacing * 0.6;
      const offsetY = (seededRandom() - 0.5) * cellSpacing * 0.6;
      
      basePoints.push([
        Math.max(20, Math.min(width/2 - 20, baseX + offsetX)),
        Math.max(20, Math.min(height/2 - 20, baseY + offsetY))
      ]);
    }
  }
  
  // Mirror points to create 4-way symmetry
  const allPoints = [];
  basePoints.forEach(point => {
    const [x, y] = point;
    allPoints.push([x, y]); // Original (top-left)
    allPoints.push([width - x, y]); // Top-right
    allPoints.push([x, height - y]); // Bottom-left  
    allPoints.push([width - x, height - y]); // Bottom-right
  });
  
  // Add boundary points to ensure edge cells
  const boundaryPoints = [
    [10, 10], [width/2, 10], [width-10, 10],
    [10, height/2], [width-10, height/2],
    [10, height-10], [width/2, height-10], [width-10, height-10]
  ];
  allPoints.push(...boundaryPoints);
  
  // Generate Voronoi cells using simple algorithm
  const cells = [];
  
  for (let i = 0; i < allPoints.length; i++) {
    const center = allPoints[i];
    const cell = computeVoronoiCell(center, allPoints, width, height);
    
    if (cell && cell.length >= 3) {
      cells.push({
        id: i,
        center: { x: center[0], y: center[1] },
        vertices: cell.map(v => ({ x: v[0], y: v[1] }))
      });
    }
  }
  
  // Build adjacency map
  const adjacencyMap = new Map();
  cells.forEach((cell, index) => {
    const neighbors = [];
    cells.forEach((otherCell, otherIndex) => {
      if (index !== otherIndex && cellsShareEdge(cell, otherCell)) {
        neighbors.push(otherIndex);
      }
    });
    adjacencyMap.set(index.toString(), neighbors);
  });
  
  // Determine edge cells
  const edgeCells = {
    top: [],
    bottom: [],
    left: [],
    right: []
  };
  
  const edgeThreshold = 60;
  cells.forEach((cell, index) => {
    if (cell.center.y < edgeThreshold) edgeCells.top.push(index);
    if (cell.center.y > height - edgeThreshold) edgeCells.bottom.push(index);
    if (cell.center.x < edgeThreshold) edgeCells.left.push(index);
    if (cell.center.x > width - edgeThreshold) edgeCells.right.push(index);
  });
  
  console.log(`Generated Voronoi board with ${cells.length} cells`);
  
  return {
    cells: cells,
    edgeCells: edgeCells,
    adjacencyMap: adjacencyMap,
    seed: seed
  };
}

// Compute Voronoi cell for a point (simplified algorithm)
function computeVoronoiCell(center, allPoints, width, height) {
  const [cx, cy] = center;
  const vertices = [];
  
  // Create a grid of test points around the boundary
  const resolution = 20;
  const boundaryPoints = [];
  
  // Top edge
  for (let x = 0; x <= width; x += resolution) {
    boundaryPoints.push([x, 0]);
  }
  // Right edge  
  for (let y = 0; y <= height; y += resolution) {
    boundaryPoints.push([width, y]);
  }
  // Bottom edge
  for (let x = width; x >= 0; x -= resolution) {
    boundaryPoints.push([x, height]);
  }
  // Left edge
  for (let y = height; y >= 0; y -= resolution) {
    boundaryPoints.push([0, y]);
  }
  
  // Find points that are closest to this center
  boundaryPoints.forEach(point => {
    const [x, y] = point;
    let isClosest = true;
    const distToCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    
    // Check if any other point is closer
    for (const otherPoint of allPoints) {
      if (otherPoint[0] === cx && otherPoint[1] === cy) continue;
      const distToOther = Math.sqrt((x - otherPoint[0]) ** 2 + (y - otherPoint[1]) ** 2);
      if (distToOther < distToCenter) {
        isClosest = false;
        break;
      }
    }
    
    if (isClosest) {
      vertices.push(point);
    }
  });
  
  // Sort vertices to form proper polygon
  if (vertices.length >= 3) {
    vertices.sort((a, b) => {
      const angleA = Math.atan2(a[1] - cy, a[0] - cx);
      const angleB = Math.atan2(b[1] - cy, b[0] - cx);
      return angleA - angleB;
    });
  }
  
  return vertices;
}

function cellsShareEdge(cell1, cell2) {
  const tolerance = 5;
  let sharedVertices = 0;
  
  for (const v1 of cell1.vertices) {
    for (const v2 of cell2.vertices) {
      const distance = Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
      if (distance <= tolerance) {
        sharedVertices++;
      }
    }
  }
  
  return sharedVertices >= 2;
}

function cellsAreAdjacent(cell1, cell2) {
  // Simple distance-based adjacency for now
  const distance = Math.sqrt(
    Math.pow(cell1.center.x - cell2.center.x, 2) + 
    Math.pow(cell1.center.y - cell2.center.y, 2)
  );
  return distance < 120; // Adjust this threshold as needed
}

// Get game state - includes timer info
app.get('/api/game/:gameId', authenticateToken, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('player1 player2 winner currentPlayer');
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    
    const userId = req.user.userId;
    if (!game.player1._id.equals(userId) && (!game.player2 || !game.player2._id.equals(userId))) {
      return res.status(403).json({ message: 'You are not part of this game.' });
    }

    // Check for timeout (20 seconds)
    if (game.status === 'in_progress' && game.turnStartTime) {
      const timeElapsed = Date.now() - game.turnStartTime.getTime();
      if (timeElapsed > 20000) { // 20 seconds
        // Current player loses by timeout
        const timeoutPlayer = game.currentPlayer;
        const winnerId = timeoutPlayer.equals(game.player1._id) ? game.player2._id : game.player1._id;
        
        game.status = 'completed';
        game.winner = winnerId;
        
        const winnerUser = await User.findById(winnerId);
        winnerUser.trx_balance += game.stake * 2 * 0.975;
        await winnerUser.save();
        
        await game.save();
        
        console.log(`Game ${game._id} won by timeout - ${game.currentPlayer} took too long`);
      }
    }

    const isPlayer1 = game.player1._id.equals(userId);
    const yourSymbol = isPlayer1 ? game.player1Symbol : game.player2Symbol;
    
    // Calculate remaining time
    let timeRemaining = null;
    if (game.status === 'in_progress' && game.turnStartTime) {
      const timeElapsed = Date.now() - game.turnStartTime.getTime();
      timeRemaining = Math.max(0, 20000 - timeElapsed); // 20 seconds in milliseconds
    }
    
    res.json({
      gameId: game._id,
      status: game.status,
      board: game.board,
      boardSize: game.boardSize,
      boardLayout: game.boardLayout,
      player1: game.player1.username,
      player2: game.player2?.username || null,
      yourSymbol,
      currentPlayer: game.currentPlayer?.username || null,
      winner: game.winner?.username || null,
      isYourTurn: game.currentPlayer && game.currentPlayer._id.equals(userId),
      timeRemaining: timeRemaining
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
    
    // Check for winner using stored board layout
    const winner = checkWinner(game.board, game.boardLayout.edgeCells, game.boardLayout.adjacencyMap);
    if (winner) {
      game.status = 'completed';
      if (winner === 'draw') {
        const loser = game.lastMovePlayer;
        const winnerId = loser.equals(game.player1._id) ? game.player2._id : game.player1._id;
        game.winner = winnerId;
        
        const winnerUser = await User.findById(winnerId);
        winnerUser.trx_balance += game.stake * 2 * 0.975;
        await winnerUser.save();
      } else {
        const winnerId = winner === game.player1Symbol ? game.player1._id : game.player2._id;
        game.winner = winnerId;
        
        const winnerUser = await User.findById(winnerId);
        winnerUser.trx_balance += game.stake * 2 * 0.975;
        await winnerUser.save();
      }
    } else {
      // Switch turns and reset timer
      game.currentPlayer = isPlayer1 ? game.player2._id : game.player1._id;
      game.turnStartTime = new Date(); // Reset timer for next player
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

// Forfeit game
app.post('/api/game/:gameId/forfeit', authenticateToken, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('player1 player2');
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    
    const userId = req.user.userId;
    if (!game.player1._id.equals(userId) && (!game.player2 || !game.player2._id.equals(userId))) {
      return res.status(403).json({ message: 'You are not part of this game.' });
    }
    
    if (game.status !== 'in_progress') {
      return res.status(400).json({ message: 'Game is not in progress.' });
    }
    
    const forfeiterId = userId;
    const winnerId = forfeiterId.equals(game.player1._id) ? game.player2._id : game.player1._id;
    
    game.status = 'completed';
    game.winner = winnerId;
    
    const winnerUser = await User.findById(winnerId);
    winnerUser.trx_balance += game.stake * 2 * 0.975;
    await winnerUser.save();
    
    await game.save();
    
    console.log(`Game ${game._id} forfeited by ${req.user.username}`);
    
    res.json({ success: true, message: 'Game forfeited.' });
  } catch (error) {
    console.error('Forfeit error:', error);
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