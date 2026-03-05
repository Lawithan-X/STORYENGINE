#!/bin/bash

# Clear terminal for a clean start
clear

echo "===================================================="
echo "         STORYENGINE: SERVER LAUNCHER           | ד'סב"
echo "===================================================="
echo ""
echo "Initializing local server environment..."
echo ""

# Check if python3 is available
if command -v python3 &>/dev/null; then
    echo "Python 3 detected. Starting server on port 8000..."
    echo "Access the engine at: http://localhost:8000"
    echo ""
    echo "Press Ctrl+C to stop the server."
    python3 -m http.server 8000
else
    echo "Error: Python 3 is required to run the server."
    echo "Please install Python 3 and try again."
    exit 1
fi