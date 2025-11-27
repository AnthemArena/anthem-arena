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

    // Get a random quote for a character and event
    getQuote(character, eventType) {
        if (!this.loaded) {
            console.warn('⚠️ Quotes not loaded yet');
            return null;
        }

        const characterQuotes = this.quotes[character];
        if (!characterQuotes) {
            console.warn(`⚠️ No quotes found for character: ${character}`);
            return null;
        }

        const eventQuotes = characterQuotes[eventType];
        if (!eventQuotes || eventQuotes.length === 0) {
            console.warn(`⚠️ No quotes found for ${character} - ${eventType}`);
            return null;
        }

        // Return random quote
        return eventQuotes[Math.floor(Math.random() * eventQuotes.length)];
    }

    // Get all quotes for a character and event
    getAllQuotes(character, eventType) {
        return this.quotes[character]?.[eventType] || [];
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
        return Object.keys(this.quotes[character] || {});
    }

    // Fallback quotes if JSON fails to load
    getFallbackQuotes() {
        return {
            caitlyn: {
                welcome: ["The Sheriff is here."],
                hit: ["Direct hit."],
                miss: ["Miss. Recalculating."],
                ship_sunk: ["Target eliminated."],
                victory: ["Case closed."],
                defeat: ["Unacceptable."]
            },
            jinx: {
                welcome: ["Let's PLAY!"],
                hit: ["BOOM!"],
                miss: ["Oops!"],
                ship_sunk: ["Bye bye ship!"],
                victory: ["I WON!"],
                defeat: ["What?! NO!"]
            }
        };
    }
}

// Create singleton instance
const characterQuotes = new CharacterQuotes();

// Export for use in other files
export default characterQuotes;