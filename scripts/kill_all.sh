#!/bin/bash
pkill -f "node src/server/server.js" && echo "✅ Backend stopped" || echo "⚠️ Not running"
pkill -f "vite" && echo "✅ Frontend stopped" || echo "⚠️ Not running"
pkill -f "ai_server.py" && echo "✅ AI server stopped" || echo "⚠️ Not running"
