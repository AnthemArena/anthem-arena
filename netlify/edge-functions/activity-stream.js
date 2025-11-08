import { getStore } from "@netlify/blobs";

export default async (request, context) => {
    const activityStore = getStore("activity");
    
    const stream = new ReadableStream({
        async start(controller) {
            // Send initial data immediately
            const sendUpdate = async () => {
                try {
                    const cached = await activityStore.get("current-activity");
                    
                    if (cached) {
                        const data = `data: ${cached}\n\n`;
                        controller.enqueue(new TextEncoder().encode(data));
                    }
                } catch (error) {
                    console.error('SSE error:', error);
                }
            };
            
            // Send immediately
            await sendUpdate();
            
            // Then send updates every 30 seconds
            const interval = setInterval(sendUpdate, 30000);
            
            // Cleanup on close
            request.signal.addEventListener('abort', () => {
                clearInterval(interval);
                controller.close();
            });
        }
    });
    
    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
};

export const config = { 
    path: "/api/activity-stream"
};