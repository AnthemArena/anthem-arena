// ============================================
// HEXTECH WARFARE - CORE GAME LOGIC
// Pure game state management (no UI)
// ============================================

class BattleshipGame {
    constructor() {
        this.gridSize = 10;
        this.ships = [
            { name: 'carrier', size: 5, icon: '🚢' },
            { name: 'battleship', size: 4, icon: '⛴️' },
            { name: 'cruiser', size: 3, icon: '🚤' },
            { name: 'submarine', size: 3, icon: '🛥️' },
            { name: 'destroyer', size: 2, icon: '⚓' }
        ];
        
        this.reset();
    }

    reset() {
        // Player grids
        this.playerGrid = this.createEmptyGrid();
        this.playerShips = [];
        this.playerShipsRemaining = this.ships.length;
        
        // Enemy grids
        this.enemyGrid = this.createEmptyGrid();
        this.enemyShips = [];
        this.enemyShipsRemaining = this.ships.length;
        
        // Tracking grids (what each player can see)
        this.playerTargetGrid = this.createEmptyGrid(); // Player's view of enemy
        this.enemyTargetGrid = this.createEmptyGrid();  // Enemy's view of player
        
        // Game state
        this.gameActive = false;
        this.currentTurn = 'player';
        this.shotsFired = 0;
        this.shotsHit = 0;
        this.winner = null;
        
        // Ability tracking
        this.playerAbilitiesUsed = {
            ultimate: false,
            special: 0
        };
    }

    // Create empty 10x10 grid
    createEmptyGrid() {
        const grid = [];
        for (let row = 0; row < this.gridSize; row++) {
            grid[row] = [];
            for (let col = 0; col < this.gridSize; col++) {
                grid[row][col] = {
                    hasShip: false,
                    shipId: null,
                    isHit: false,
                    isMiss: false
                };
            }
        }
        return grid;
    }

    // ============================================
    // SHIP PLACEMENT
    // ============================================

    canPlaceShip(grid, ship, startRow, startCol, isHorizontal) {
        const endRow = isHorizontal ? startRow : startRow + ship.size - 1;
        const endCol = isHorizontal ? startCol + ship.size - 1 : startCol;

        // Check bounds
        if (endRow >= this.gridSize || endCol >= this.gridSize) {
            return false;
        }

        // Check for overlapping ships
        for (let i = 0; i < ship.size; i++) {
            const row = isHorizontal ? startRow : startRow + i;
            const col = isHorizontal ? startCol + i : startCol;
            
            if (grid[row][col].hasShip) {
                return false;
            }
        }

        return true;
    }

    placeShip(grid, ships, ship, startRow, startCol, isHorizontal) {
        if (!this.canPlaceShip(grid, ship, startRow, startCol, isHorizontal)) {
            return false;
        }

        const shipId = ships.length;
        const coordinates = [];

        for (let i = 0; i < ship.size; i++) {
            const row = isHorizontal ? startRow : startRow + i;
            const col = isHorizontal ? startCol + i : startCol;
            
            grid[row][col].hasShip = true;
            grid[row][col].shipId = shipId;
            
            coordinates.push({ row, col });
        }

        ships.push({
            id: shipId,
            name: ship.name,
            size: ship.size,
            icon: ship.icon,
            coordinates: coordinates,
            hits: 0,
            isSunk: false
        });

        return true;
    }

    // Random ship placement (for AI or quick setup)
    placeShipsRandomly(grid, ships) {
        ships.length = 0; // Clear existing ships

        for (const shipTemplate of this.ships) {
            let placed = false;
            let attempts = 0;
            const maxAttempts = 100;

            while (!placed && attempts < maxAttempts) {
                const startRow = Math.floor(Math.random() * this.gridSize);
                const startCol = Math.floor(Math.random() * this.gridSize);
                const isHorizontal = Math.random() < 0.5;

                placed = this.placeShip(grid, ships, shipTemplate, startRow, startCol, isHorizontal);
                attempts++;
            }

            if (!placed) {
                console.error(`Failed to place ${shipTemplate.name}`);
                return false;
            }
        }

        return true;
    }

    // ============================================
    // SHOOTING MECHANICS
    // ============================================

    shoot(targetGrid, targetShips, row, col) {
        // Validate shot
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
            return { valid: false, reason: 'out_of_bounds' };
        }

        const cell = targetGrid[row][col];

        if (cell.isHit || cell.isMiss) {
            return { valid: false, reason: 'already_shot' };
        }

        this.shotsFired++;

        // Check if hit
        if (cell.hasShip) {
            cell.isHit = true;
            this.shotsHit++;

            const ship = targetShips[cell.shipId];
            ship.hits++;

            // Check if ship is sunk
            if (ship.hits >= ship.size) {
                ship.isSunk = true;
                
                // Update remaining ships
                if (targetGrid === this.enemyGrid) {
                    this.enemyShipsRemaining--;
                } else {
                    this.playerShipsRemaining--;
                }

                return {
                    valid: true,
                    hit: true,
                    sunk: true,
                    shipName: ship.name,
                    shipIcon: ship.icon,
                    coordinates: ship.coordinates
                };
            }

            return {
                valid: true,
                hit: true,
                sunk: false
            };
        } else {
            cell.isMiss = true;
            return {
                valid: true,
                hit: false
            };
        }
    }

    // Player shoots at enemy
    playerShoot(row, col) {
        if (this.currentTurn !== 'player' || !this.gameActive) {
            return { valid: false, reason: 'not_your_turn' };
        }

        const result = this.shoot(this.enemyGrid, this.enemyShips, row, col);
        
        if (result.valid) {
            // Update player's target grid (what player can see)
            if (result.hit) {
                this.playerTargetGrid[row][col].isHit = true;
            } else {
                this.playerTargetGrid[row][col].isMiss = true;
            }

            // Check for game over
            if (this.enemyShipsRemaining === 0) {
                this.gameActive = false;
                this.winner = 'player';
                return { ...result, gameOver: true, winner: 'player' };
            }

            // Switch turn if miss (hit gets another turn in some variants)
            if (!result.hit) {
                this.currentTurn = 'enemy';
            }
        }

        return result;
    }

    // Enemy shoots at player
    enemyShoot(row, col) {
        if (this.currentTurn !== 'enemy' || !this.gameActive) {
            return { valid: false, reason: 'not_enemy_turn' };
        }

        const result = this.shoot(this.playerGrid, this.playerShips, row, col);
        
        if (result.valid) {
            // Update enemy's target grid
            if (result.hit) {
                this.enemyTargetGrid[row][col].isHit = true;
            } else {
                this.enemyTargetGrid[row][col].isMiss = true;
            }

            // Check for game over
            if (this.playerShipsRemaining === 0) {
                this.gameActive = false;
                this.winner = 'enemy';
                return { ...result, gameOver: true, winner: 'enemy' };
            }

            // Switch turn if miss
            if (!result.hit) {
                this.currentTurn = 'player';
            }
        }

        return result;
    }

    // ============================================
    // CHARACTER ABILITIES
    // ============================================

    // Caitlyn's "Ace in the Hole" - Reveal 3x3 area
    useCaitlynUltimate(centerRow, centerCol) {
        if (this.playerAbilitiesUsed.ultimate) {
            return { success: false, reason: 'already_used' };
        }

        const revealed = [];

        for (let r = centerRow - 1; r <= centerRow + 1; r++) {
            for (let c = centerCol - 1; c <= centerCol + 1; c++) {
                if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
                    const cell = this.enemyGrid[r][c];
                    revealed.push({
                        row: r,
                        col: c,
                        hasShip: cell.hasShip
                    });
                }
            }
        }

        this.playerAbilitiesUsed.ultimate = true;

        return {
            success: true,
            revealed: revealed
        };
    }

    // Caitlyn's "Headshot" passive - Reveal adjacent on hit
    caitlynHeadshotPassive(row, col) {
        const revealed = [];
        const directions = [
            { r: -1, c: 0 },  // North
            { r: 1, c: 0 },   // South
            { r: 0, c: -1 },  // West
            { r: 0, c: 1 }    // East
        ];

        for (const dir of directions) {
            const r = row + dir.r;
            const c = col + dir.c;

            if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
                const cell = this.enemyGrid[r][c];
                if (!cell.isHit && !cell.isMiss) {
                    revealed.push({
                        row: r,
                        col: c,
                        hasShip: cell.hasShip
                    });
                }
            }
        }

        return revealed;
    }

    // Jinx's "Super Mega Death Rocket" - 5 random shots
    useJinxUltimate() {
        if (this.playerAbilitiesUsed.ultimate) {
            return { success: false, reason: 'already_used' };
        }

        const results = [];
        const attempts = 5;
        let shotsSuccess = 0;

        for (let i = 0; i < attempts; i++) {
            // Find random unshot cell
            const availableCells = [];
            for (let r = 0; r < this.gridSize; r++) {
                for (let c = 0; c < this.gridSize; c++) {
                    const cell = this.enemyGrid[r][c];
                    if (!cell.isHit && !cell.isMiss) {
                        availableCells.push({ row: r, col: c });
                    }
                }
            }

            if (availableCells.length === 0) break;

            const target = availableCells[Math.floor(Math.random() * availableCells.length)];
            
            // Temporarily switch to player turn to shoot
            const originalTurn = this.currentTurn;
            this.currentTurn = 'player';
            
            const result = this.playerShoot(target.row, target.col);
            
            this.currentTurn = originalTurn;

            if (result.valid) {
                results.push({
                    row: target.row,
                    col: target.col,
                    hit: result.hit,
                    sunk: result.sunk
                });
                
                if (result.hit) shotsSuccess++;
            }
        }

        this.playerAbilitiesUsed.ultimate = true;

        return {
            success: true,
            results: results,
            totalHits: shotsSuccess
        };
    }

    // Jinx's "Fishbones" passive - 2x2 explosion on every 3rd hit
    jinxFishbonesExplosion(row, col) {
        const explosionCells = [
            { r: row, c: col + 1 },
            { r: row + 1, c: col },
            { r: row + 1, c: col + 1 }
        ];

        const results = [];

        for (const cell of explosionCells) {
            if (cell.r >= 0 && cell.r < this.gridSize && 
                cell.c >= 0 && cell.c < this.gridSize) {
                
                const target = this.enemyGrid[cell.r][cell.c];
                
                if (!target.isHit && !target.isMiss) {
                    const originalTurn = this.currentTurn;
                    this.currentTurn = 'player';
                    
                    const result = this.playerShoot(cell.r, cell.c);
                    
                    this.currentTurn = originalTurn;

                    if (result.valid) {
                        results.push({
                            row: cell.r,
                            col: cell.c,
                            hit: result.hit
                        });
                    }
                }
            }
        }

        return results;
    }

    // ============================================
    // GAME STATE
    // ============================================

    startGame() {
        this.gameActive = true;
        this.currentTurn = 'player';
    }

    getAccuracy() {
        if (this.shotsFired === 0) return 0;
        return Math.round((this.shotsHit / this.shotsFired) * 100);
    }

    getGameStats() {
        return {
            shotsFired: this.shotsFired,
            shotsHit: this.shotsHit,
            accuracy: this.getAccuracy(),
            playerShipsRemaining: this.playerShipsRemaining,
            enemyShipsRemaining: this.enemyShipsRemaining,
            winner: this.winner
        };
    }

    // Get cell state for rendering
    getCellState(grid, targetGrid, row, col, isPlayerView = true) {
        const cell = grid[row][col];
        const targetCell = targetGrid ? targetGrid[row][col] : null;

        if (isPlayerView) {
            // Player can see their own ships
            if (cell.hasShip && cell.isHit) return 'hit';
            if (cell.hasShip) return 'ship';
            if (cell.isMiss) return 'miss';
            return 'empty';
        } else {
            // Player can only see hits/misses on enemy grid
            if (targetCell && targetCell.isHit) return 'hit';
            if (targetCell && targetCell.isMiss) return 'miss';
            return 'unknown';
        }
    }
}

// ============================================
// INITIALIZE GLOBAL GAME INSTANCE
// ============================================

// This will be used by UI and AI files
let game = new BattleshipGame();

console.log('✅ Battleship Game Logic Loaded');