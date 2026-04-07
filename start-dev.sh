#!/bin/bash

# Ops Command Center Development Server Startup Script
# Starts both the backend (port 5001) and frontend (port 3001) servers

echo "Starting Ops Command Center Development Environment"
echo "==================================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Creating a basic one..."
    cat > .env << EOF
# Required
JWT_SECRET=local-dev-jwt-secret-change-me
DATABASE_URL=postgres://localhost:5432/ops_command_center
NODE_ENV=development
PORT=5001
EOF
    echo "Created .env file with minimum required configuration"
fi

echo ""
echo "Configuration:"
echo "   Backend:  http://localhost:5001"
echo "   Frontend: http://localhost:3001"
echo ""

# Kill existing processes on ports 5001 and 3001
lsof -ti:5001 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null

# Start backend server in background
echo "Starting backend server (port 5001)..."
npx nodemon server.js &
BACKEND_PID=$!

sleep 3

# Start frontend server (Vite dev server)
echo "Starting frontend server (port 3001)..."
npx vite &
FRONTEND_PID=$!

echo ""
echo "Both servers are starting up!"
echo ""
echo "Access your application at:"
echo "   Frontend: http://localhost:3001"
echo "   Backend:  http://localhost:5001"
echo ""
echo "To stop both servers, press Ctrl+C"

wait
