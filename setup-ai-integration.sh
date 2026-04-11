#!/bin/bash

# Infinity OS AI Integration Setup Script
# =======================================
# Sets up OpenRouter, Hugging Face, and offline AI capabilities

set -e

echo "🚀 Infinity OS AI Integration Setup"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to prompt for API key
prompt_api_key() {
    local provider=$1
    local env_var=$2
    local description=$3
    local url=$4

    echo -e "${BLUE}Setting up $provider${NC}"
    echo "$description"
    echo -e "Get your API key from: ${YELLOW}$url${NC}"
    echo ""

    read -p "Enter your $provider API key (or press Enter to skip): " api_key
    echo ""

    if [ ! -z "$api_key" ]; then
        # Add to .env file
        if grep -q "^$env_var=" .env 2>/dev/null; then
            # Update existing
            sed -i.bak "s|^$env_var=.*|$env_var=$api_key|" .env
        else
            # Add new
            echo "$env_var=$api_key" >> .env
        fi
        echo -e "${GREEN}✓ $provider API key configured${NC}"
    else
        echo -e "${YELLOW}⚠ Skipping $provider setup${NC}"
    fi
    echo ""
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    touch .env
fi

echo "This script will help you configure AI providers for Infinity OS."
echo "You can set up multiple providers for redundancy and cost optimization."
echo ""

# OpenRouter Setup
prompt_api_key \
    "OpenRouter" \
    "OPENROUTER_API_KEY" \
    "OpenRouter provides access to 100+ AI models from 20+ providers with automatic routing." \
    "https://openrouter.ai/keys"

# Hugging Face Setup
prompt_api_key \
    "Hugging Face" \
    "HUGGINGFACE_API_KEY" \
    "Hugging Face provides access to 500,000+ open-source models via their Inference API." \
    "https://huggingface.co/settings/tokens"

# Offline Setup
echo -e "${BLUE}Setting up Offline AI (Transformers.js)${NC}"
echo "Offline AI runs models locally in the browser using Transformers.js."
echo "This provides privacy and works without internet connectivity."
echo ""

read -p "Enable offline AI capabilities? (y/n): " enable_offline
echo ""

if [[ $enable_offline =~ ^[Yy]$ ]]; then
    echo "OFFLINE_AI_ENABLED=true" >> .env
    echo -e "${GREEN}✓ Offline AI enabled${NC}"
    echo ""
    echo "Note: Models will be downloaded on-demand when first used."
    echo "Initial model downloads may take time and use browser storage."
else
    echo "OFFLINE_AI_ENABLED=false" >> .env
    echo -e "${YELLOW}⚠ Offline AI disabled${NC}"
fi
echo ""

# Provider Priority Configuration
echo -e "${BLUE}Configuring AI Provider Priority${NC}"
echo "Set the order in which providers should be tried (comma-separated)."
echo "Available: workers-ai, openai, anthropic, openrouter, huggingface, offline"
echo ""

read -p "Provider priority order (default: workers-ai,openai,anthropic,openrouter,huggingface,offline): " priority
if [ -z "$priority" ]; then
    priority="workers-ai,openai,anthropic,openrouter,huggingface,offline"
fi

echo "AI_PROVIDER_PRIORITY=$priority" >> .env
echo -e "${GREEN}✓ Provider priority configured${NC}"
echo ""

# Cost Limits
echo -e "${BLUE}Setting Cost Limits${NC}"
echo "Configure monthly spending limits for each provider (in USD)."
echo ""

read -p "OpenRouter monthly limit (default: 10): " or_limit
if [ -z "$or_limit" ]; then
    or_limit="10"
fi
echo "OPENROUTER_MONTHLY_LIMIT=$or_limit" >> .env

read -p "Hugging Face monthly limit (default: 5): " hf_limit
if [ -z "$hf_limit" ]; then
    hf_limit="5"
fi
echo "HUGGINGFACE_MONTHLY_LIMIT=$hf_limit" >> .env

echo -e "${GREEN}✓ Cost limits configured${NC}"
echo ""

# Install dependencies
echo -e "${BLUE}Installing Dependencies${NC}"
echo "Installing required packages for AI integration..."
echo ""

if command -v pnpm &> /dev/null; then
    echo "Installing AI gateway dependencies..."
    pnpm add @xenova/transformers@^2.17.0
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠ pnpm not found. Please run: pnpm add @xenova/transformers@^2.17.0${NC}"
fi
echo ""

# Worker deployment
echo -e "${BLUE}Worker Deployment${NC}"
echo "Deploy the updated AI worker with new provider support."
echo ""

read -p "Deploy AI worker now? (y/n): " deploy_worker
if [[ $deploy_worker =~ ^[Yy]$ ]]; then
    if command -v npx &> /dev/null; then
        echo "Deploying AI worker..."
        cd workers/ai
        npx wrangler deploy
        cd ../..
        echo -e "${GREEN}✓ AI worker deployed${NC}"
    else
        echo -e "${YELLOW}⚠ npx not found. Please deploy manually: cd workers/ai && npx wrangler deploy${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping worker deployment${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}🎉 AI Integration Setup Complete!${NC}"
echo ""
echo "Summary of configured providers:"
echo ""

# Check each provider
if grep -q "OPENROUTER_API_KEY=" .env 2>/dev/null; then
    echo -e "${GREEN}✓ OpenRouter${NC} - Access to 100+ models"
else
    echo -e "${RED}✗ OpenRouter${NC} - Not configured"
fi

if grep -q "HUGGINGFACE_API_KEY=" .env 2>/dev/null; then
    echo -e "${GREEN}✓ Hugging Face${NC} - Access to 500,000+ models"
else
    echo -e "${RED}✗ Hugging Face${NC} - Not configured"
fi

if grep -q "OFFLINE_AI_ENABLED=true" .env 2>/dev/null; then
    echo -e "${GREEN}✓ Offline AI${NC} - Local model execution"
else
    echo -e "${RED}✗ Offline AI${NC} - Disabled"
fi

echo ""
echo "Next steps:"
echo "1. Restart your development server"
echo "2. Test AI integrations in the Infinity OS shell"
echo "3. Configure agent factories to use new providers"
echo ""
echo -e "${BLUE}Happy building with AI! 🤖${NC}"</content>
<parameter name="filePath">C:\Development\infinity-adminOS\setup-ai-integration.sh