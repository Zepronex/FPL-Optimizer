#!/bin/bash

echo "🚀 Setting up FPL Optimizer ML Service..."
echo "========================================"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip3 first."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"

# Create virtual environment
echo "📦 Creating virtual environment..."
cd apps/ml
python3 -m venv venv

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing ML dependencies..."
pip install -r requirements.txt

echo "✅ ML service setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Train the model: pnpm run train:ml"
echo "2. Start the ML service: pnpm run dev:ml"
echo "3. Start the full app: pnpm run dev"
echo ""
echo "🧠 The AI Strategy will be available in the team generation page!"
