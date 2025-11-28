// ========================================
// CHARACTER QUOTES SYSTEM
// Loads and manages character dialogue
// ========================================

class CharacterQuotes {
    constructor() {
        this.quotes = {};
        this.loaded = false;
    }

    // Load quotes from JSON file
    async load() {
        try {
            const response = await fetch('/js/character-quotes.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.quotes = await response.json();
            this.loaded = true;
            console.log('✅ Character quotes loaded:', Object.keys(this.quotes));
            return true;
        } catch (error) {
            console.error('❌ Error loading character quotes:', error);
            this.quotes = this.getFallbackQuotes();
            this.loaded = true;
            return false;
        }
    }

    // Get a random quote for a character and event with dynamic tag replacement
    getQuote(character, eventType, opponent = null, tags = {}) {
        if (!this.loaded) {
            console.warn('⚠️ Quotes not loaded yet');
            return null;
        }

        const characterQuotes = this.quotes[character];
        if (!characterQuotes) {
            console.warn(`⚠️ No quotes found for character: ${character}`);
            return null;
        }

        let selectedQuote = null;

        // ✅ CHECK FOR RIVAL-SPECIFIC QUOTES FIRST
        if (opponent && characterQuotes.rivals && characterQuotes.rivals[opponent]) {
            const rivalQuotes = characterQuotes.rivals[opponent][eventType];
            if (rivalQuotes && rivalQuotes.length > 0) {
                selectedQuote = rivalQuotes[Math.floor(Math.random() * rivalQuotes.length)];
                console.log(`🎭 Using rival quote: ${character} vs ${opponent} - ${eventType}`);
            }
        }

        // ✅ FALL BACK TO GENERAL QUOTES IF NO RIVAL QUOTE FOUND
        if (!selectedQuote && characterQuotes.general) {
            const generalQuotes = characterQuotes.general[eventType];
            if (generalQuotes && generalQuotes.length > 0) {
                selectedQuote = generalQuotes[Math.floor(Math.random() * generalQuotes.length)];
                console.log(`💬 Using general quote: ${character} - ${eventType}`);
            }
        }

        if (!selectedQuote) {
            console.warn(`⚠️ No quotes found for ${character} - ${eventType}`);
            return null;
        }

        // ✅ REPLACE DYNAMIC TAGS (e.g., {shipName}, {opponentName})
        return this.replaceTags(selectedQuote, tags);
    }

    // Replace dynamic tags in quotes
    replaceTags(quote, tags) {
        let processedQuote = quote;
        
        for (const [key, value] of Object.entries(tags)) {
            const regex = new RegExp(`\\{${key}\\}`, 'g');
            processedQuote = processedQuote.replace(regex, value);
        }
        
        return processedQuote;
    }

    // Get all quotes for a character and event
    getAllQuotes(character, eventType, opponent = null) {
        const characterQuotes = this.quotes[character];
        if (!characterQuotes) return [];

        // Check rival quotes first
        if (opponent && characterQuotes.rivals && characterQuotes.rivals[opponent]) {
            const rivalQuotes = characterQuotes.rivals[opponent][eventType];
            if (rivalQuotes) return rivalQuotes;
        }

        // Fall back to general quotes
        return characterQuotes.general?.[eventType] || [];
    }

    // Check if quotes are loaded
    isLoaded() {
        return this.loaded;
    }

    // Get available characters
    getCharacters() {
        return Object.keys(this.quotes);
    }

    // Get available event types for a character
    getEventTypes(character) {
        const characterQuotes = this.quotes[character];
        if (!characterQuotes) return [];
        
        const generalEvents = Object.keys(characterQuotes.general || {});
        const rivalEvents = Object.keys(characterQuotes.rivals || {});
        
        return [...new Set([...generalEvents, ...rivalEvents])];
    }

    // Get rivals for a character
    getRivals(character) {
        return Object.keys(this.quotes[character]?.rivals || {});
    }

    // Fallback quotes if JSON fails to load
    getFallbackQuotes() {
        return {
            caitlyn: {
                general: {
                    welcome: ["The Sheriff is here."],
                    hit: ["Direct hit."],
                    miss: ["Miss. Recalculating."],
                    ship_sunk: ["Target eliminated."],
                    victory: ["Case closed."],
                    defeat: ["Unacceptable."]
                }
            },
            jinx: {
                general: {
                    welcome: ["Let's PLAY!"],
                    hit: ["BOOM!"],
                    miss: ["Oops!"],
                    ship_sunk: ["Bye bye ship!"],
                    victory: ["I WON!"],
                    defeat: ["What?! NO!"]
                }
            }
        };
    }
}

// Create singleton instance
const characterQuotes = new CharacterQuotes();

// Export for use in other files
export default characterQuotes;