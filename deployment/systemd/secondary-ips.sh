#!/bin/bash
# Add all secondary private IPs of ens5 from EC2 IMDSv2 to the OS interface.
# Runs on boot to persist AWS-assigned secondary IPs.
set -euo pipefail

IFACE=ens5
MAC=$(cat /sys/class/net/$IFACE/address)
TOKEN=$(curl -sS -X PUT 'http://169.254.169.254/latest/api/token' \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
SUBNET_CIDR=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" \
    "http://169.254.169.254/latest/meta-data/network/interfaces/macs/$MAC/subnet-ipv4-cidr-block")
MASK=${SUBNET_CIDR##*/}

PRIMARY=$(ip -o -4 addr show $IFACE | awk '{print $4}' | head -1 | cut -d/ -f1)

IPS=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" \
    "http://169.254.169.254/latest/meta-data/network/interfaces/macs/$MAC/local-ipv4s")

for IP in $IPS; do
    [ "$IP" = "$PRIMARY" ] && continue
    if ! ip -o -4 addr show $IFACE | awk '{print $4}' | cut -d/ -f1 | grep -qx "$IP"; then
        ip addr add "$IP/$MASK" dev $IFACE
        echo "Added $IP/$MASK to $IFACE"
    fi
done
