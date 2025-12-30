#!/bin/bash

# Load NVM and run LLM scoring
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 23.3.0 > /dev/null 2>&1

node llm-score-documents.js
