#!/bin/bash

set -e

echo "=== ELK Stack Installation Script ==="
echo "Installing on Ubuntu 22.04"
echo ""

# Update system
echo "[1/10] Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "[2/10] Installing required packages..."
apt install -y curl wget gnupg2 apt-transport-https unzip

# Install Java (required for Elasticsearch and Logstash)
echo "[3/10] Installing Java..."
apt install -y openjdk-11-jdk
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64

# Add Elasticsearch repository
echo "[4/10] Adding Elasticsearch repository..."
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | apt-key add -
echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | tee /etc/apt/sources.list.d/elastic-8.x.list
apt update

# Install Elasticsearch
echo "[5/10] Installing Elasticsearch..."
apt install -y elasticsearch

# Install Logstash
echo "[6/10] Installing Logstash..."
apt install -y logstash

# Install Kibana
echo "[7/10] Installing Kibana..."
apt install -y kibana

# Copy configuration files
echo "[8/10] Applying configuration files..."

# Elasticsearch configuration
cp elasticsearch.yml /etc/elasticsearch/elasticsearch.yml

# Logstash configuration
cp logstash.conf /etc/logstash/conf.d/logstash.conf

# Kibana configuration
cp kibana.yml /etc/kibana/kibana.yml

# Reload systemd
systemctl daemon-reload

# Enable and start services
echo "[9/10] Enabling and starting services..."

# Start Elasticsearch first and wait for it to be ready
systemctl enable elasticsearch
systemctl start elasticsearch
echo "Waiting for Elasticsearch to start..."
sleep 15

# Generate elastic password if not exists
if [ ! -f /etc/elasticsearch/elasticsearch.keystore ]; then
    echo "Elasticsearch keystore will be created on first run"
fi

# Start Logstash
systemctl enable logstash
systemctl start logstash

# Start Kibana
systemctl enable kibana
systemctl start kibana

# Configure firewall
echo "[10/10] Configuring firewall..."
ufw allow 9200/tcp comment 'Elasticsearch'
ufw allow 5601/tcp comment 'Kibana'
ufw reload

# Create apilogs index
echo ""
echo "Creating apilogs index..."
sleep 10
curl -X PUT "http://localhost:9200/apilogs" -H 'Content-Type: application/json' -d'
{
  "mappings": {
    "properties": {
      "timestamp": {"type": "date"},
      "message": {"type": "text"},
      "level": {"type": "keyword"},
      "source": {"type": "keyword"}
    }
  }
}
' 2>/dev/null || echo "Index creation may require authentication"

echo ""
echo "=== ELK Stack Installation Complete ==="
echo ""
echo "Services:"
echo "  - Elasticsearch: http://localhost:9200"
echo "  - Kibana:        http://localhost:5601"
echo ""
echo "To check service status:"
echo "  systemctl status elasticsearch"
echo "  systemctl status logstash"
echo "  systemctl status kibana"
echo ""
echo "To view logs:"
echo "  journalctl -u elasticsearch -f"
echo "  journalctl -u logstash -f"
echo "  journalctl -u kibana -f"
