#!/bin/bash
cd ~/dong-tang-purchase-system
echo "[$(date)] Starting docker compose build..." > /tmp/docker-build.log
sudo docker compose down >> /tmp/docker-build.log 2>&1
sudo docker compose up -d --build >> /tmp/docker-build.log 2>&1
echo "[$(date)] Build process finished with exit code: $?" >> /tmp/docker-build.log
sudo docker ps >> /tmp/docker-build.log 2>&1
