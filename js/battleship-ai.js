// ============================================
// HEXTECH WARFARE - AI OPPONENT
// Different difficulty levels with personalities
// ============================================

export class BattleshipAI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.huntMode = false;
        this.targetStack = [];
        this.lastHit = null;
        this.hitStreak = [];
        this.shotHistory = [];
    }

    reset() {
        this.huntMode = false;
        this.targetStack = [];
        this.lastHit = null;
        this.hitStreak = [];
        this.shotHistory = [];
    }

    // ============================================
    // MAIN AI DECISION FUNCTION
    // ============================================

    getNextShot(game) {
        switch (this.difficulty) {
            case 'easy':
                return this.easyAI(game);
            case 'medium':
                return this.mediumAI(game);
            case 'hard':
                return this.hardAI(game);
            case 'chaos':
                return this.chaosAI(game);
            default:
                return this.mediumAI(game);
        }
    }

    // ============================================
    // EASY AI - "POWDER MODE"
    // Random guessing, no strategy
    // ============================================

    easyAI(game) {
        const availableCells = this.getAvailableCells(game);
        
        if (availableCells.length === 0) return null;

        // Pure random selection
        const randomIndex = Math.floor(Math.random() * availableCells.length);
        return availableCells[randomIndex];
    }

    // ============================================
    // MEDIUM AI - "ENFORCER MODE"
    // Hunt/Target pattern + parity
    // ============================================

    mediumAI(game) {
        // If we have a target stack (hit but not sunk), pursue it
        if (this.targetStack.length > 0) {
            const target = this.targetStack.pop();
            
            // Verify target is still valid
            if (this.isValidTarget(game, target.row, target.col)) {
                return target;
            } else {
                // If invalid, try next in stack
                return this.mediumAI(game);
            }
        }

        // Hunt mode: Use parity pattern (checkerboard)
        const availableCells = this.getAvailableCells(game);
        
        // Filter for parity cells (checkerboard pattern)
        const parityCells = availableCells.filter(cell => 
            (cell.row + cell.col) % 2 === 0
        );

        if (parityCells.length > 0) {
            const randomIndex = Math.floor(Math.random() * parityCells.length);
            return parityCells[randomIndex];
        }

        // Fallback to any available cell
        if (availableCells.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableCells.length);
            return availableCells[randomIndex];
        }

        return null;
    }

    // ============================================
    // HARD AI - "SHERIFF MODE"
    // Probability-based targeting
    // ============================================

    hardAI(game) {
        // Target mode: Finish off wounded ships
        if (this.targetStack.length > 0) {
            // Sort by probability
            this.targetStack.sort((a, b) => b.priority - a.priority);
            const target = this.targetStack.pop();
            
            if (this.isValidTarget(game, target.row, target.col)) {
                return target;
            } else {
                return this.hardAI(game);
            }
        }

        // Hunt mode: Calculate probability heatmap
        const probabilities = this.calculateProbabilityMap(game);
        
        // Find cell with highest probability
        let maxProb = 0;
        let bestCells = [];

        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                if (probabilities[row][col] > maxProb) {
                    maxProb = probabilities[row][col];
                    bestCells = [{ row, col }];
                } else if (probabilities[row][col] === maxProb && maxProb > 0) {
                    bestCells.push({ row, col });
                }
            }
        }

        if (bestCells.length > 0) {
            const randomIndex = Math.floor(Math.random() * bestCells.length);
            return bestCells[randomIndex];
        }

        // Fallback
        return this.mediumAI(game);
    }

    // ============================================
    // CHAOS AI - "JINX MODE"
    // Unpredictable mix of genius and madness
    // ============================================

    chaosAI(game) {
        const chaos = Math.random();

        // 30% chance: Brilliant strategic play
        if (chaos < 0.3) {
            return this.hardAI(game);
        }
        // 30% chance: Completely random
        else if (chaos < 0.6) {
            return this.easyAI(game);
        }
        // 40% chance: Medium strategy
        else {
            return this.mediumAI(game);
        }
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    getAvailableCells(game) {
        const available = [];
        
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const cell = game.playerGrid[row][col];
                if (!cell.isHit && !cell.isMiss) {
                    available.push({ row, col });
                }
            }
        }
        
        return available;
    }

    isValidTarget(game, row, col) {
        if (row < 0 || row >= game.gridSize || col < 0 || col >= game.gridSize) {
            return false;
        }
        
        const cell = game.playerGrid[row][col];
        return !cell.isHit && !cell.isMiss;
    }

    // When AI gets a hit, add adjacent cells to target stack
    onHit(game, row, col, wasSunk) {
        this.lastHit = { row, col };
        this.hitStreak.push({ row, col });

        if (wasSunk) {
            // Ship was sunk, clear target stack for that ship
            this.targetStack = [];
            this.hitStreak = [];
        } else {
            // Add adjacent cells to target stack
            const directions = [
                { r: -1, c: 0, priority: 2 },  // North
                { r: 1, c: 0, priority: 2 },   // South
                { r: 0, c: -1, priority: 2 },  // West
                { r: 0, c: 1, priority: 2 }    // East
            ];

            for (const dir of directions) {
                const newRow = row + dir.r;
                const newCol = col + dir.c;

                if (this.isValidTarget(game, newRow, newCol)) {
                    // Higher priority if it aligns with previous hits
                    let priority = dir.priority;
                    
                    if (this.hitStreak.length > 1) {
                        // Check if this direction aligns with hit pattern
                        const lastTwo = this.hitStreak.slice(-2);
                        const deltaRow = lastTwo[1].row - lastTwo[0].row;
                        const deltaCol = lastTwo[1].col - lastTwo[0].col;
                        
                        if (dir.r === deltaRow && dir.c === deltaCol) {
                            priority += 5; // Much higher priority
                        }
                    }

                    this.targetStack.push({
                        row: newRow,
                        col: newCol,
                        priority: priority
                    });
                }
            }
        }
    }

    // Calculate probability map for hard AI
    calculateProbabilityMap(game) {
        const probMap = [];
        
        // Initialize map
        for (let row = 0; row < game.gridSize; row++) {
            probMap[row] = [];
            for (let col = 0; col < game.gridSize; col++) {
                probMap[row][col] = 0;
            }
        }

        // For each remaining enemy ship size
        const remainingShips = game.playerShips.filter(ship => !ship.isSunk);
        
        for (const ship of remainingShips) {
            // Try placing ship in every position/orientation
            for (let row = 0; row < game.gridSize; row++) {
                for (let col = 0; col < game.gridSize; col++) {
                    // Horizontal
                    if (this.canFitShip(game, row, col, ship.size, true)) {
                        for (let i = 0; i < ship.size; i++) {
                            probMap[row][col + i]++;
                        }
                    }
                    
                    // Vertical
                    if (this.canFitShip(game, row, col, ship.size, false)) {
                        for (let i = 0; i < ship.size; i++) {
                            probMap[row + i][col]++;
                        }
                    }
                }
            }
        }

        // Zero out cells we've already shot
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const cell = game.playerGrid[row][col];
                if (cell.isHit || cell.isMiss) {
                    probMap[row][col] = 0;
                }
            }
        }

        return probMap;
    }

    canFitShip(game, row, col, shipSize, isHorizontal) {
        const endRow = isHorizontal ? row : row + shipSize - 1;
        const endCol = isHorizontal ? col + shipSize - 1 : col;

        if (endRow >= game.gridSize || endCol >= game.gridSize) {
            return false;
        }

        for (let i = 0; i < shipSize; i++) {
            const r = isHorizontal ? row : row + i;
            const c = isHorizontal ? col + i : col;
            
            const cell = game.playerGrid[r][c];
            
            // Can't place on misses or known hits
            if (cell.isMiss) return false;
        }

        return true;
    }
}

// ============================================
// INITIALIZE GLOBAL AI INSTANCE
// ============================================

let aiOpponent = new BattleshipAI('medium');

export default BattleshipAI;



console.log('✅ Battleship AI Loaded');