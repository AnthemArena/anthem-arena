export default async (req, context) => {
  const key = process.env.YOUTUBE_API_KEY; // ← pulled securely from Netlify
  const playlistId = "PLlU9fZcbJfgtSQuaJlo1BmSjwDVQb2kgY";
  const maxResults = 50;

  const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}&key=${key}`;

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // so your browser can fetch it
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
