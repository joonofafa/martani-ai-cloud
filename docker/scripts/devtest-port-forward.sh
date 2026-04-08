#!/bin/bash
# Port forwarding from Host LAN (192.168.0.x) to DevTest VM (192.168.122.200)
# Run on the HOST server with sudo.
#
# Usage: sudo ./devtest-port-forward.sh [add|remove]

set -euo pipefail

VM_IP="192.168.122.200"
HOST_LAN_IP="192.168.0.123"
HOST_IF="enp11s0"  # LAN interface

# Ports to forward: host_port -> VM:vm_port
PORTS=(
    "3000:3000"   # Frontend (dev)
    "8000:8000"   # Backend API (dev)
)

ACTION="${1:-add}"

if [ "$ACTION" = "add" ]; then
    echo "=== Adding port forwarding to VM ($VM_IP) ==="

    # Enable IP forwarding (likely already on for Docker/libvirt)
    sysctl -w net.ipv4.ip_forward=1 > /dev/null

    for mapping in "${PORTS[@]}"; do
        HOST_PORT="${mapping%%:*}"
        VM_PORT="${mapping##*:}"

        # PREROUTING: incoming LAN traffic -> VM
        iptables -t nat -C PREROUTING -p tcp --dport "$HOST_PORT" -j DNAT --to-destination "$VM_IP:$VM_PORT" 2>/dev/null \
            || iptables -t nat -A PREROUTING -p tcp --dport "$HOST_PORT" -j DNAT --to-destination "$VM_IP:$VM_PORT"

        # OUTPUT: hairpin NAT (host accessing own LAN IP)
        iptables -t nat -C OUTPUT -p tcp --dport "$HOST_PORT" -d "$HOST_LAN_IP" -j DNAT --to-destination "$VM_IP:$VM_PORT" 2>/dev/null \
            || iptables -t nat -A OUTPUT -p tcp --dport "$HOST_PORT" -d "$HOST_LAN_IP" -j DNAT --to-destination "$VM_IP:$VM_PORT"

        # FORWARD: allow forwarded packets (insert before libvirt chains)
        iptables -C FORWARD -p tcp -d "$VM_IP" --dport "$VM_PORT" -j ACCEPT 2>/dev/null \
            || iptables -I FORWARD 1 -p tcp -d "$VM_IP" --dport "$VM_PORT" -j ACCEPT

        # POSTROUTING: masquerade so VM sees host as source
        iptables -t nat -C POSTROUTING -p tcp -d "$VM_IP" --dport "$VM_PORT" -j MASQUERADE 2>/dev/null \
            || iptables -t nat -A POSTROUTING -p tcp -d "$VM_IP" --dport "$VM_PORT" -j MASQUERADE

        echo "  :$HOST_PORT -> $VM_IP:$VM_PORT  OK"
    done

    echo ""
    echo "LAN access:"
    echo "  Frontend: http://$HOST_LAN_IP:3000"
    echo "  Backend:  http://$HOST_LAN_IP:8000"

elif [ "$ACTION" = "remove" ]; then
    echo "=== Removing port forwarding ==="

    for mapping in "${PORTS[@]}"; do
        HOST_PORT="${mapping%%:*}"
        VM_PORT="${mapping##*:}"

        iptables -t nat -D PREROUTING -p tcp --dport "$HOST_PORT" -j DNAT --to-destination "$VM_IP:$VM_PORT" 2>/dev/null || true
        iptables -t nat -D OUTPUT -p tcp --dport "$HOST_PORT" -d "$HOST_LAN_IP" -j DNAT --to-destination "$VM_IP:$VM_PORT" 2>/dev/null || true
        iptables -D FORWARD -p tcp -d "$VM_IP" --dport "$VM_PORT" -j ACCEPT 2>/dev/null || true
        iptables -t nat -D POSTROUTING -p tcp -d "$VM_IP" --dport "$VM_PORT" -j MASQUERADE 2>/dev/null || true

        echo "  :$HOST_PORT removed"
    done
else
    echo "Usage: $0 [add|remove]"
    exit 1
fi
