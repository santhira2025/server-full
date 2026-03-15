#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
nohup litellm --config ~/litellm/config.yaml --port 4000 --host 127.0.0.1 > ~/litellm/proxy.log 2>&1 &
echo $! > ~/litellm/proxy.pid
echo "LiteLLM proxy started with PID: $(cat ~/litellm/proxy.pid)"
