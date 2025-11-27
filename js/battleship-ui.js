// ========================================
// BATTLESHIP UI CONTROLLER
// Manages all UI interactions and screens
// ========================================

// Import dependencies
import characterQuotes from './character-quotes.js';
import game from './battleship-game.js';
import BattleshipAI from './battleship-ai.js';

// Global AI instance
let aiOpponent = null;

class BattleshipUI {
    constructor() {
        this.selectedCharacter = null;
        this.opponentCharacter = null;
        this.difficulty = 'medium';
        
        // Ship placement state
        this.currentShipIndex = 0;
        this.isHorizontal = true;
        this.playerShipsPlaced = [];
        
        // UI elements (will be set in init)
        this.elements = {};
        
        // Data Dragon configuration
        this.dataDragonVersion = '14.23.1';
        this.dataDragonBase = `https://ddragon.leagueoflegends.com/cdn/${this.dataDragonVersion}`;
        
        // Character data
        this.characters = {
            caitlyn: {
                name: 'Caitlyn',
                displayName: 'CAITLYN',
                title: 'The Sheriff of Piltover',
                championKey: 'Caitlyn',
                skinNumber: 0,
                color: '#0397AB',
                emoji: '🎯'
            },
            jinx: {
                name: 'Jinx',
                displayName: 'JINX',
                title: 'The Loose Cannon',
                championKey: 'Jinx',
                skinNumber: 0,
                color: '#FF3366',
                emoji: '💥'
            }
        };
        
        // Track Jinx's hit counter for Fishbones passive
        this.jinxHitCounter = 0;
        
        // Track game start time
        this.gameStartTime = null;
    }

    // ============================================
// DATA DRAGON IMAGE HELPERS
// ============================================

getChampionPortrait(championKey, skinNumber = 0) {
    // Loading screen art - best for vertical banners (308x560)
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championKey}_${skinNumber}.jpg`;
}

getChampionSplash(championKey, skinNumber = 0) {
    // Full splash art - best for backgrounds (1215x717)
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinNumber}.jpg`;
}

getChampionIcon(championKey) {
    // Square icon (120x120)
    return `https://ddragon.leagueoflegends.com/cdn/${this.dataDragonVersion}/img/champion/${championKey}.png`;
}

    // ============================================
    // INITIALIZATION
    // ============================================

 async init() {
    console.log('🎮 Initializing Battleship UI...');
    
    // Load character quotes
    await characterQuotes.load();
    
    this.cacheElements();
    this.bindEvents();
    this.showScreen('characterSelect');
    
    console.log('✅ UI Initialized');
}

    cacheElements() {
        this.elements = {
            // Screens
            characterSelect: document.getElementById('characterSelect'),
            shipPlacement: document.getElementById('shipPlacement'),
            battleScreen: document.getElementById('battleScreen'),
            gameOverScreen: document.getElementById('gameOverScreen'),
            
            // Character selection
            characterCards: document.querySelectorAll('.character-card'),
            selectButtons: document.querySelectorAll('.select-btn'),
            difficultySelect: document.getElementById('difficultySelect'),
            
            // Ship placement
            placementGrid: document.getElementById('placementGrid'),
            shipSelector: document.querySelector('.ship-selector'),
            shipItems: document.querySelectorAll('.ship-item'),
            randomPlacementBtn: document.getElementById('randomPlacement'),
            startGameBtn: document.getElementById('startGame'),
                    currentShipPreview: document.getElementById('currentShipPreview'), // ← ADD

            
            // Battle screen
            playerGrid: document.getElementById('playerGrid'),
            enemyGrid: document.getElementById('enemyGrid'),
            playerBanner: document.getElementById('playerBanner'),
            opponentBanner: document.getElementById('opponentBanner'),
            playerPortrait: document.getElementById('playerPortrait'),
            opponentPortrait: document.getElementById('opponentPortrait'),
            playerName: document.getElementById('playerName'),
            opponentName: document.getElementById('opponentName'),
            turnIndicator: document.getElementById('turnIndicator'),
characterQuote: document.getElementById('characterQuote'),
            
            // Abilities
            ability1: document.getElementById('ability1'),
            ability2: document.getElementById('ability2'),
            
            // Game over
            resultTitle: document.getElementById('resultTitle'),
            resultCharacter: document.getElementById('resultCharacter'),
            resultQuote: document.getElementById('resultQuote'),
            accuracyStat: document.getElementById('accuracyStat'),
            shotsStat: document.getElementById('shotsStat'),
            xpStat: document.getElementById('xpStat'),
            playAgain: document.getElementById('playAgain'),
            changeCharacter: document.getElementById('changeCharacter')
        };
          // ✅ ADD THIS DEBUG
    console.log('✅ Cached:', {
        selectButtons: this.elements.selectButtons.length,
        screens: {
            characterSelect: !!this.elements.characterSelect,
            shipPlacement: !!this.elements.shipPlacement,
            battleScreen: !!this.elements.battleScreen,
            gameOverScreen: !!this.elements.gameOverScreen
        }
    });

    }

bindEvents() {
    console.log('🔌 Binding events...');
    
    // Bind to BOTH buttons AND character cards
    this.elements.selectButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent double-firing
            const character = btn.dataset.character;
            console.log('🎯 Button clicked:', character);
            this.selectCharacter(character);
        });
    });
    
    // ALSO bind to the character cards themselves
    this.elements.characterCards.forEach(card => {
        card.addEventListener('click', () => {
            const character = card.dataset.character;
            console.log('🎯 Card clicked:', character);
            this.selectCharacter(character);
        });
    });
    
    console.log('✅ Bound', this.elements.selectButtons.length, 'character buttons');
    console.log('✅ Bound', this.elements.characterCards.length, 'character cards');

    // Difficulty selection
    if (this.elements.difficultySelect) {
        this.elements.difficultySelect.addEventListener('change', (e) => {
            this.difficulty = e.target.value;
            console.log('🎮 Difficulty:', this.difficulty);
        });
    }

    // Ship placement
    if (this.elements.randomPlacementBtn) {
        this.elements.randomPlacementBtn.addEventListener('click', () => {
            console.log('🎲 Random placement');
            this.randomPlacement();
        });
    }

    if (this.elements.startGameBtn) {
        this.elements.startGameBtn.addEventListener('click', () => {
            console.log('⚔️ Start battle');
            this.startBattle();
        });
    }

    // Right-click to rotate ships
    document.addEventListener('contextmenu', (e) => {
        if (this.elements.shipPlacement && !this.elements.shipPlacement.classList.contains('hidden')) {
            e.preventDefault();
            this.isHorizontal = !this.isHorizontal;
            this.updatePlacementPreview();
                    this.updateShipPreview(); // ← ADD THIS

        }
    });

    // Abilities
    if (this.elements.ability2) {
        this.elements.ability2.addEventListener('click', () => {
            this.useUltimate();
        });
    }

    // Game over
    if (this.elements.playAgain) {
        this.elements.playAgain.addEventListener('click', () => {
            this.resetGame();
        });
    }

    if (this.elements.changeCharacter) {
        this.elements.changeCharacter.addEventListener('click', () => {
            this.resetToCharacterSelect();
        });
    }
    
    console.log('✅ All events bound');
}

    // ============================================
    // SCREEN MANAGEMENT
    // ============================================

    showScreen(screenName) {
        // Hide all screens
        const screens = ['characterSelect', 'shipPlacement', 'battleScreen', 'gameOverScreen'];
        screens.forEach(screen => {
            if (this.elements[screen]) {
                this.elements[screen].classList.add('hidden');
            }
        });

        // Show requested screen
        if (this.elements[screenName]) {
            this.elements[screenName].classList.remove('hidden');
        }
    }

    // ============================================
    // CHARACTER SELECTION
    // ============================================

    selectCharacter(characterId) {
        this.selectedCharacter = characterId;
        
        // Opponent is the other character
        this.opponentCharacter = characterId === 'caitlyn' ? 'jinx' : 'caitlyn';
        
        // Show quote
        this.showQuote(this.selectedCharacter, 'welcome');
        
        // Proceed to ship placement after brief delay
        setTimeout(() => {
            this.showShipPlacement();
        }, 2000);
    }

    // ============================================
    // SHIP PLACEMENT
    // ============================================

    showShipPlacement() {
        this.showScreen('shipPlacement');
        this.currentShipIndex = 0;
        this.playerShipsPlaced = [];
        this.isHorizontal = true;
        
        // Reset game
        game.reset();
        
        // Create placement grid
        this.createPlacementGrid();
        
        // Highlight first ship
        this.updateShipSelector();
    }

    createPlacementGrid() {
        this.elements.placementGrid.innerHTML = '';
        
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Hover preview
                cell.addEventListener('mouseenter', () => {
                    this.showPlacementPreview(row, col);
                });
                
                // Place ship on click
                cell.addEventListener('click', () => {
                    this.placePlayerShip(row, col);
                });
                
                this.elements.placementGrid.appendChild(cell);
            }
        }
    }

    showPlacementPreview(row, col) {
        // Clear previous preview
        this.elements.placementGrid.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('preview', 'invalid-preview');
        });

        if (this.currentShipIndex >= game.ships.length) return;

        const currentShip = game.ships[this.currentShipIndex];
        const canPlace = game.canPlaceShip(game.playerGrid, currentShip, row, col, this.isHorizontal);

        // Show preview
        for (let i = 0; i < currentShip.size; i++) {
            const previewRow = this.isHorizontal ? row : row + i;
            const previewCol = this.isHorizontal ? col + i : col;
            
            if (previewRow < game.gridSize && previewCol < game.gridSize) {
                const previewCell = this.elements.placementGrid.querySelector(
                    `[data-row="${previewRow}"][data-col="${previewCol}"]`
                );
                
                if (previewCell) {
                    previewCell.classList.add(canPlace ? 'preview' : 'invalid-preview');
                }
            }
        }
    }

    placePlayerShip(row, col) {
        if (this.currentShipIndex >= game.ships.length) return;

        const currentShip = game.ships[this.currentShipIndex];
        const placed = game.placeShip(
            game.playerGrid, 
            game.playerShips, 
            currentShip, 
            row, 
            col, 
            this.isHorizontal
        );

        if (placed) {
            // Update visual grid
            this.updatePlacementGrid();
            
            // Mark ship as placed
            this.playerShipsPlaced.push(currentShip.name);
            
            // Move to next ship
            this.currentShipIndex++;
            this.updateShipSelector();
            
            // Check if all ships placed
            if (this.currentShipIndex >= game.ships.length) {
                this.elements.startGameBtn.disabled = false;
                this.showQuote(this.selectedCharacter, 'ships_placed');
            }
        }
    }

    updatePlacementGrid() {
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const cell = this.elements.placementGrid.querySelector(
                    `[data-row="${row}"][data-col="${col}"]`
                );
                
                if (cell && game.playerGrid[row][col].hasShip) {
                    cell.classList.add('ship');
                }
            }
        }
    }

updateShipSelector() {
    this.elements.shipItems.forEach((item, index) => {
        item.classList.remove('active', 'placed');
        
        if (index < this.currentShipIndex) {
            item.classList.add('placed');
        } else if (index === this.currentShipIndex) {
            item.classList.add('active');
        }
    });
    
    // ✅ ADD THIS: Update preview display
    this.updateShipPreview();
}

// ✅ ADD THIS NEW METHOD:
updateShipPreview() {
    const previewContainer = document.getElementById('currentShipPreview');
    if (!previewContainer) return;
    
    if (this.currentShipIndex >= game.ships.length) {
        previewContainer.style.display = 'none';
        return;
    }
    
    previewContainer.style.display = 'block';
    
    const currentShip = game.ships[this.currentShipIndex];
    const previewCells = previewContainer.querySelector('.preview-cells');
    
    // Update orientation class
    previewContainer.className = 'ship-preview ' + (this.isHorizontal ? 'horizontal' : 'vertical');
    
    // Clear and rebuild cells
    previewCells.innerHTML = '';
    for (let i = 0; i < currentShip.size; i++) {
        const cell = document.createElement('div');
        cell.className = 'preview-cell';
        previewCells.appendChild(cell);
    }
    
    // Update label
    const label = document.querySelector('.ship-label');
    if (label) {
        label.textContent = `Now Placing: ${currentShip.name} (${currentShip.size} cells)`;
    }
}

    randomPlacement() {
        // Clear existing placement
        game.playerGrid = game.createEmptyGrid();
        game.playerShips = [];
        
        // Place ships randomly
        const success = game.placeShipsRandomly(game.playerGrid, game.playerShips);
        
        if (success) {
            this.currentShipIndex = game.ships.length;
            this.playerShipsPlaced = game.ships.map(s => s.name);
            this.updatePlacementGrid();
            this.updateShipSelector();
            this.elements.startGameBtn.disabled = false;
            
            this.showQuote(this.selectedCharacter, 'random_placement');
        }
    }

    // ============================================
    // BATTLE SCREEN
    // ============================================

   startBattle() {
    // Place enemy ships randomly
    game.placeShipsRandomly(game.enemyGrid, game.enemyShips);
    
    // Initialize AI (using imported class)
    aiOpponent = new BattleshipAI(this.difficulty);
    
    // Start game
    game.startGame();
    this.gameStartTime = Date.now();
    
    // Setup battle UI
    this.showScreen('battleScreen');
    this.setupBattleScreen();
    this.createBattleGrids();
    
    // Show start quote
    this.showQuote(this.selectedCharacter, 'game_start');
}

    setupBattleScreen() {
    const player = this.characters[this.selectedCharacter];
    const opponent = this.characters[this.opponentCharacter];
    
    // Use splash art instead of loading screen for better framing
    this.elements.playerPortrait.src = this.getChampionSplash(
        player.championKey,
        player.skinNumber
    );
    this.elements.opponentPortrait.src = this.getChampionPortrait(
        opponent.championKey,
        opponent.skinNumber
    );
    
    // Set names
    this.elements.playerName.textContent = player.displayName;
    this.elements.opponentName.textContent = opponent.displayName;
    
    // Style banners
    this.elements.playerBanner.style.borderColor = player.color;
    this.elements.opponentBanner.style.borderColor = opponent.color;
    
    // Setup abilities based on character
    this.setupAbilities();
}

    setupAbilities() {
        const abilityNames = {
            caitlyn: {
                ultimate: 'Ace in the Hole',
                passive: 'Headshot'
            },
            jinx: {
                ultimate: 'Super Mega Death Rocket',
                passive: 'Fishbones'
            }
        };
        
        const abilities = abilityNames[this.selectedCharacter];
        
        if (this.elements.ability1) {
            this.elements.ability1.querySelector('.ability-name').textContent = abilities.passive;
        }
        
        if (this.elements.ability2) {
            this.elements.ability2.querySelector('.ability-name').textContent = abilities.ultimate;
        }
    }

    createBattleGrids() {
        // Create player grid (defensive view)
        this.elements.playerGrid.innerHTML = '';
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Show ships on player grid
                if (game.playerGrid[row][col].hasShip) {
                    cell.classList.add('ship');
                }
                
                this.elements.playerGrid.appendChild(cell);
            }
        }
        
        // Create enemy grid (offensive view)
        this.elements.enemyGrid.innerHTML = '';
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Click to attack
                cell.addEventListener('click', () => {
                    this.playerAttack(row, col);
                });
                
                this.elements.enemyGrid.appendChild(cell);
            }
        }
    }

    // ============================================
    // COMBAT
    // ============================================

    playerAttack(row, col) {
        if (game.currentTurn !== 'player' || !game.gameActive) return;

        const result = game.playerShoot(row, col);
        
        if (!result.valid) return;

        // Update enemy grid visual
        const cell = this.elements.enemyGrid.querySelector(
            `[data-row="${row}"][data-col="${col}"]`
        );
        
        if (result.hit) {
            cell.classList.add('hit');
            this.showQuote(this.selectedCharacter, 'hit');
            
            // Character-specific abilities
            if (this.selectedCharacter === 'caitlyn') {
                // Headshot passive: reveal adjacent
                const revealed = game.caitlynHeadshotPassive(row, col);
                this.visualizeRevealedCells(revealed);
            } else if (this.selectedCharacter === 'jinx') {
                // Fishbones: explosion on every 3rd hit
                this.jinxHitCounter++;
                if (this.jinxHitCounter % 3 === 0) {
                    setTimeout(() => {
                        this.showQuote('jinx', 'fishbones_proc');
                        const explosionResults = game.jinxFishbonesExplosion(row, col);
                        this.visualizeExplosion(explosionResults);
                    }, 1000);
                }
            }
            
            if (result.sunk) {
                this.showQuote(this.selectedCharacter, 'ship_sunk');
                this.updateShipIndicators('opponent');
                this.highlightSunkShip(result.coordinates, 'enemy');
            }
        } else {
            cell.classList.add('miss');
            this.showQuote(this.selectedCharacter, 'miss');
        }

        // Check game over
        if (result.gameOver) {
            setTimeout(() => {
                this.endGame(result.winner);
            }, 2000);
            return;
        }

        // Enemy turn if we missed
        if (!result.hit) {
            setTimeout(() => {
                this.enemyTurn();
            }, 1500);
        }
    }

    enemyTurn() {
        if (game.currentTurn !== 'enemy' || !game.gameActive) return;

        this.updateTurnIndicator('enemy');
        
        // AI decides target
        const target = aiOpponent.getNextShot(game);
        
        if (!target) {
            console.error('AI could not find target');
            return;
        }

        setTimeout(() => {
            const result = game.enemyShoot(target.row, target.col);
            
            if (!result.valid) {
                // Try again if invalid
                this.enemyTurn();
                return;
            }

            // Update player grid visual
            const cell = this.elements.playerGrid.querySelector(
                `[data-row="${target.row}"][data-col="${target.col}"]`
            );
            
            if (result.hit) {
                cell.classList.add('hit');
                this.showQuote(this.opponentCharacter, 'hit');
                
                // Inform AI about hit
                aiOpponent.onHit(game, target.row, target.col, result.sunk);
                
                if (result.sunk) {
                    this.showQuote(this.opponentCharacter, 'ship_sunk');
                    this.updateShipIndicators('player');
                    this.highlightSunkShip(result.coordinates, 'player');
                }
            } else {
                cell.classList.add('miss');
                this.showQuote(this.opponentCharacter, 'miss');
            }

            // Check game over
            if (result.gameOver) {
                setTimeout(() => {
                    this.endGame(result.winner);
                }, 2000);
                return;
            }

            // Continue enemy turn if hit, otherwise player turn
            if (result.hit) {
                setTimeout(() => {
                    this.enemyTurn();
                }, 1500);
            } else {
                this.updateTurnIndicator('player');
            }
        }, 1000);
    }

    // ============================================
    // ABILITIES
    // ============================================

    useUltimate() {
        if (game.playerAbilitiesUsed.ultimate) return;

        if (this.selectedCharacter === 'caitlyn') {
            this.useCaitlynUltimate();
        } else if (this.selectedCharacter === 'jinx') {
            this.useJinxUltimate();
        }
    }

    useCaitlynUltimate() {
        this.showQuote('caitlyn', 'ultimate');
        
        // Get center of grid for demo (you could let player choose)
        const centerRow = Math.floor(game.gridSize / 2);
        const centerCol = Math.floor(game.gridSize / 2);
        
        const result = game.useCaitlynUltimate(centerRow, centerCol);
        
        if (result.success) {
            this.visualizeRevealedCells(result.revealed);
            this.elements.ability2.disabled = true;
            this.elements.ability2.querySelector('.ability-uses').textContent = 'Used';
        }
    }

    useJinxUltimate() {
        this.showQuote('jinx', 'ultimate');
        
        const result = game.useJinxUltimate();
        
        if (result.success) {
            this.visualizeMultipleShots(result.results);
            this.elements.ability2.disabled = true;
            this.elements.ability2.querySelector('.ability-uses').textContent = 'Used';
            
            // Check if any ships sunk
            if (game.enemyShipsRemaining < 5) {
                this.updateShipIndicators('opponent');
            }
        }
    }

    // ============================================
    // VISUAL EFFECTS
    // ============================================

    visualizeRevealedCells(revealed) {
        revealed.forEach((cell, index) => {
            setTimeout(() => {
                const gridCell = this.elements.enemyGrid.querySelector(
                    `[data-row="${cell.row}"][data-col="${cell.col}"]`
                );
                
                if (gridCell && !gridCell.classList.contains('hit') && !gridCell.classList.contains('miss')) {
                    gridCell.style.background = cell.hasShip 
                        ? 'rgba(255, 51, 102, 0.3)' 
                        : 'rgba(3, 151, 171, 0.3)';
                    
                    setTimeout(() => {
                        gridCell.style.background = '';
                    }, 2000);
                }
            }, index * 100);
        });
    }

    visualizeExplosion(results) {
        results.forEach((result, index) => {
            setTimeout(() => {
                const cell = this.elements.enemyGrid.querySelector(
                    `[data-row="${result.row}"][data-col="${result.col}"]`
                );
                
                if (cell) {
                    cell.classList.add(result.hit ? 'hit' : 'miss');
                }
            }, index * 200);
        });
    }

    visualizeMultipleShots(results) {
        results.forEach((result, index) => {
            setTimeout(() => {
                const cell = this.elements.enemyGrid.querySelector(
                    `[data-row="${result.row}"][data-col="${result.col}"]`
                );
                
                if (cell) {
                    cell.classList.add(result.hit ? 'hit' : 'miss');
                }
                
                if (result.sunk) {
                    this.showQuote('jinx', 'ship_sunk');
                }
            }, index * 300);
        });
    }

    highlightSunkShip(coordinates, gridType) {
        const grid = gridType === 'enemy' ? this.elements.enemyGrid : this.elements.playerGrid;
        
        coordinates.forEach(coord => {
            const cell = grid.querySelector(
                `[data-row="${coord.row}"][data-col="${coord.col}"]`
            );
            
            if (cell) {
                cell.classList.add('sunk');
            }
        });
    }

    updateShipIndicators(side) {
        const banner = side === 'player' ? this.elements.playerBanner : this.elements.opponentBanner;
        const remaining = side === 'player' ? game.playerShipsRemaining : game.enemyShipsRemaining;
        const shipIcons = banner.querySelectorAll('.ship-icon');
        
        shipIcons.forEach((icon, index) => {
            if (index >= remaining) {
                icon.classList.add('destroyed');
            }
        });
    }

    updateTurnIndicator(turn) {
        const indicator = this.elements.turnIndicator;
        
        if (turn === 'player') {
            indicator.textContent = 'YOUR TURN - Select target';
            indicator.style.background = 'rgba(196, 161, 91, 0.9)';
        } else {
            indicator.textContent = 'ENEMY TURN - Stand by';
            indicator.style.background = 'rgba(255, 51, 102, 0.9)';
        }
    }

    // ============================================
    // CHARACTER QUOTES
    // ============================================

showQuote(character, eventType) {
    // Get quote from quotes system
    const quote = characterQuotes.getQuote(character, eventType);
    
    if (!quote) {
        console.warn(`No quote available for ${character} - ${eventType}`);
        return;
    }
    
    const quoteElement = this.elements.characterQuote;
    if (!quoteElement) return;
    
    // Update quote text
    quoteElement.textContent = `"${quote}"`;
    
    // Trigger animation
    quoteElement.classList.remove('show');
    setTimeout(() => {
        quoteElement.classList.add('show');
    }, 50);
    
    // Hide after 4 seconds
    setTimeout(() => {
        quoteElement.classList.remove('show');
    }, 4000);
}

    // ============================================
    // GAME OVER
    // ============================================

    endGame(winner) {
        game.gameActive = false;
        
        const stats = game.getGameStats();
        const isVictory = winner === 'player';
        const resultChar = isVictory ? this.selectedCharacter : this.opponentCharacter;
        
        // Update result screen
        this.elements.resultTitle.textContent = isVictory ? 'VICTORY' : 'DEFEAT';
        this.elements.resultTitle.className = isVictory ? '' : 'defeat';
        
const character = this.characters[resultChar];
this.elements.resultCharacter.querySelector('img').src = this.getChampionPortrait(
    character.championKey,
    character.skinNumber
);        
        // Get victory/defeat quote
        this.getResultQuote(resultChar, isVictory);
        
        // Update stats
        this.elements.accuracyStat.textContent = `${stats.accuracy}%`;
        this.elements.shotsStat.textContent = stats.shotsFired;
        
        // Calculate XP
        const xp = this.calculateXP(isVictory, stats);
        this.elements.xpStat.textContent = `+${xp}`;
        
        // Save to Firebase (if you want)
        this.saveGameResult(isVictory, stats, xp);
        
        // Show game over screen
        setTimeout(() => {
            this.showScreen('gameOverScreen');
        }, 1000);
    }

    async getResultQuote(character, isVictory) {
        if (!window.characterQuotes) {
            try {
                const response = await fetch('js/character-quotes.json');
                window.characterQuotes = await response.json();
            } catch (error) {
                console.error('Failed to load character quotes:', error);
                return;
            }
        }

        const situation = isVictory ? 'victory' : 'defeat';
        const quotes = window.characterQuotes[character]?.[situation];
        
        if (quotes && quotes.length > 0) {
            const quote = quotes[Math.floor(Math.random() * quotes.length)];
            this.elements.resultQuote.textContent = quote;
        }
    }

    calculateXP(isVictory, stats) {
        let xp = 0;
        
        // Base XP
        xp += isVictory ? 500 : 200;
        
        // Accuracy bonus
        if (stats.accuracy >= 80) xp += 300;
        else if (stats.accuracy >= 60) xp += 200;
        else if (stats.accuracy >= 40) xp += 100;
        
        // Efficiency bonus (fewer shots = better)
        if (isVictory && stats.shotsFired <= 25) xp += 250;
        else if (isVictory && stats.shotsFired <= 35) xp += 150;
        
        return xp;
    }

    async saveGameResult(isVictory, stats, xp) {
    console.log('💾 Saving game result...');
    
    // Check if user ID exists
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId) {
        console.warn('⚠️ No user ID - game not saved');
        return;
    }
    
    try {
        // Load Firebase dynamically
        const { db } = await import('./firebase-config.js');
        const { doc, setDoc, collection, addDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const duration = Date.now() - (this.gameStartTime || Date.now());
        
        // ============================================
        // 1. SAVE MATCH RECORD
        // ============================================
        
        const matchData = {
            userId: userId,
            character: this.selectedCharacter,
            opponent: this.opponentCharacter,
            difficulty: this.difficulty,
            victory: isVictory,
            accuracy: stats.accuracy,
            shotsFired: stats.shotsFired,
            shotsHit: stats.shotsHit,
            enemyShipsRemaining: stats.enemyShipsRemaining,
            playerShipsRemaining: stats.playerShipsRemaining,
            xpEarned: xp,
            duration: duration,
            timestamp: Date.now()
        };
        
        await addDoc(collection(db, 'battleship_matches'), matchData);
        console.log('✅ Match saved to battleship_matches');
        
        // ============================================
        // 2. UPDATE USER PROFILE STATS
        // ============================================
        
        const profileRef = doc(db, 'profiles', userId);
        
        // Build stats update object
        const statsUpdate = {
            'stats.battleship.gamesPlayed': (await this.getBattleshipStat('gamesPlayed')) + 1,
            'stats.battleship.gamesWon': (await this.getBattleshipStat('gamesWon')) + (isVictory ? 1 : 0),
            'stats.battleship.totalXP': (await this.getBattleshipStat('totalXP')) + xp,
            'stats.battleship.lastPlayed': Date.now(),
            
            // Character-specific
            [`stats.battleship.${this.selectedCharacter}.played`]: (await this.getCharacterStat(this.selectedCharacter, 'played')) + 1,
            [`stats.battleship.${this.selectedCharacter}.won`]: (await this.getCharacterStat(this.selectedCharacter, 'won')) + (isVictory ? 1 : 0),
        };
        
        // Update best accuracy if better
        const currentBest = await this.getBattleshipStat('bestAccuracy');
        if (stats.accuracy > currentBest) {
            statsUpdate['stats.battleship.bestAccuracy'] = stats.accuracy;
        }
        
        // Track flawless victories
        if (isVictory && stats.playerShipsRemaining === 5) {
            statsUpdate['stats.battleship.flawlessVictories'] = (await this.getBattleshipStat('flawlessVictories')) + 1;
        }
        
        // Track character wins for achievements
        if (isVictory && this.selectedCharacter === 'caitlyn') {
            statsUpdate['stats.battleship.caitlynWins'] = (await this.getBattleshipStat('caitlynWins')) + 1;
        } else if (isVictory && this.selectedCharacter === 'jinx') {
            statsUpdate['stats.battleship.jinxWins'] = (await this.getBattleshipStat('jinxWins')) + 1;
        }
        
        await setDoc(profileRef, statsUpdate, { merge: true });
        console.log('✅ Profile stats updated');
        
        // ============================================
        // 3. ADD TO ACTIVITY FEED
        // ============================================
        
        const username = localStorage.getItem('username') || 'Anonymous';
        
        const activityData = {
            userId: userId,
            username: username,
            type: 'battleship_game',
            character: this.selectedCharacter,
            victory: isVictory,
            accuracy: stats.accuracy,
            xpEarned: xp,
            timestamp: Date.now(),
            isPublic: true
        };
        
        await addDoc(collection(db, 'activity'), activityData);
        console.log('✅ Activity posted to feed');
        
        // ============================================
        // 4. CHECK FOR ACHIEVEMENTS
        // ============================================
        
        await this.checkBattleshipAchievements(userId, isVictory, stats);
        
        console.log('✅ Game fully saved to Firebase');
        
    } catch (error) {
        console.error('❌ Error saving game:', error);
    }
}

// Helper methods for getting stats
async getBattleshipStat(statKey) {
    try {
        const { db } = await import('./firebase-config.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const userId = localStorage.getItem('tournamentUserId');
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        
        if (profileDoc.exists()) {
            return profileDoc.data().stats?.battleship?.[statKey] || 0;
        }
        return 0;
    } catch {
        return 0;
    }
}

async getCharacterStat(character, statKey) {
    try {
        const { db } = await import('./firebase-config.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const userId = localStorage.getItem('tournamentUserId');
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        
        if (profileDoc.exists()) {
            return profileDoc.data().stats?.battleship?.[character]?.[statKey] || 0;
        }
        return 0;
    } catch {
        return 0;
    }
}

async checkBattleshipAchievements(userId, isVictory, stats) {
    try {
        const { unlockAchievementInFirebase } = await import('./achievements.js');
        const { db } = await import('./firebase-config.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Get current profile stats
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        const profileStats = profileDoc.exists() ? profileDoc.data().stats : {};
        
        const battleshipStats = profileStats.battleship || {};
        
        // Check achievements
        const achievementsToCheck = [
            { id: 'battleship-first-game', condition: battleshipStats.gamesPlayed >= 1 },
            { id: 'battleship-first-win', condition: isVictory && battleshipStats.gamesWon >= 1 },
            { id: 'battleship-sharpshooter', condition: isVictory && this.selectedCharacter === 'caitlyn' && stats.accuracy >= 90 },
            { id: 'battleship-chaos-master', condition: battleshipStats.jinxWins >= 10 },
            { id: 'battleship-flawless', condition: isVictory && stats.playerShipsRemaining === 5 },
            { id: 'battleship-veteran', condition: battleshipStats.gamesPlayed >= 50 }
        ];
        
        for (const achievement of achievementsToCheck) {
            if (achievement.condition) {
                const unlocked = await unlockAchievementInFirebase(achievement.id, 0);
                if (unlocked && window.showNotification) {
                    window.showNotification(`🏆 Achievement Unlocked: ${achievement.id}!`, 'success');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error checking achievements:', error);
    }
}

    // ============================================
    // RESET
    // ============================================

    resetGame() {
        game.reset();
        aiOpponent.reset();
        this.jinxHitCounter = 0;
        this.showShipPlacement();
    }

    resetToCharacterSelect() {
        game.reset();
        aiOpponent.reset();
        this.jinxHitCounter = 0;
        this.selectedCharacter = null;
        this.opponentCharacter = null;
        this.showScreen('characterSelect');
    }
}

// ============================================
// INITIALIZE ON PAGE LOAD
// ============================================
let battleshipUI;

// Initialize as async IIFE
(async () => {
    console.log('🚀 Starting Battleship UI initialization...');
    battleshipUI = new BattleshipUI();
    await battleshipUI.init();  // ← Now we wait!
    console.log('✅ Battleship UI Loaded and ready');
})();