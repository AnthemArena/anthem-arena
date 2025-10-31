// ========================================
// BOOK AFFILIATE MAPPINGS - LEAGUE MUSIC TOURNAMENT
// ========================================

/**
 * Centralized book definitions
 * Song → Book mapping is now in music-videos.json via "recommendedBook" field
 */

export const bookMappings = {
  
  // ============================================
  // BOOK DEFINITIONS
  // ============================================
  
  books: {
    
    // Realms of Runeterra - World-building guide
    realmsOfRuneterra: {
      id: "realmsOfRuneterra",
      title: "League of Legends: Realms of Runeterra",
      subtitle: "Official Companion",
      amazonLink: "https://amzn.to/48TfGzo",
      description: "Explore the world and lore of Runeterra",
      fullDescription: "Unlock the mysteries and magic within League of Legends, one of the world's most popular video games, in this encyclopedic and collectible companion book that explores the game's epic lore.",
      price: "$39.99",
      category: "world-building"
    },
    
    // Ambessa Novel
    ambesaNovel: {
      id: "ambesaNovel",
      title: "Ambessa: Chosen of the Wolf",
      subtitle: "A League of Legends Novel",
      amazonLink: "https://amzn.to/435C5pn",
      description: "Discover Ambessa's origin story",
      fullDescription: "Before she was a powerful warlord, Ambessa Medarda was a young woman fighting for survival in the brutal lands of Noxus.",
      price: "$17.99",
      category: "character-story"
    },
    
    // Arcane Artbook
    arcaneArtbook: {
      id: "arcaneArtbook",
      title: "Arcane: Art & Making Of",
      subtitle: "The Official Companion",
      amazonLink: "https://amzn.to/3ZQxYzK",
      description: "Behind the scenes of the hit Netflix series",
      fullDescription: "Immerse yourself in the award-winning series with this official companion book featuring exclusive concept art, storyboards, and commentary from the creators.",
      price: "$45.00",
      category: "artbook"
    },
    
    // Ruination Novel
    ruinationNovel: {
      id: "ruinationNovel",
      title: "Ruination: A League of Legends Novel",
      subtitle: "",
      amazonLink: "https://amzn.to/3DCvZJm",
      description: "The story of the Ruined King",
      fullDescription: "Discover the origins of the Ruined King and the fall of the Blessed Isles in this epic tale of love, betrayal, and dark magic.",
      price: "$18.99",
      category: "character-story"
    }
    
  }
  
};

/**
 * Get book data by ID
 * @param {string} bookId - Book identifier
 * @returns {object|null} Book object or null
 */
export function getBookById(bookId) {
  return bookMappings.books[bookId] || null;
}

/**
 * Get book recommendation for a song from JSON data
 * @param {object} songData - Song object from music-videos.json
 * @returns {object|null} Book object or null
 */
export function getBookForSong(songData) {
  if (!songData || !songData.recommendedBook) {
    return null;
  }
  return getBookById(songData.recommendedBook);
}