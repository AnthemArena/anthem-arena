// edge-functions/youtube.js
export async function handler(event, context) {
  const API_KEY = process.env.YOUTUBE_API_KEY_SERVER; // server key
  const PLAYLIST_ID = 'PLlU9fZcbJfgtSQuaJlo1BmSjwDVQb2kgY';
  const MAX_RESULTS = 50;

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${PLAYLIST_ID}&maxResults=${MAX_RESULTS}&key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
