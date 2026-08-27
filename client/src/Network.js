import * as THREE from 'three';
import { io } from 'socket.io-client';
import { createCharacterMesh, createNameTagSprite } from './Player.js';

const SEND_RATE_MS = 1000 / 60;
const PING_INTERVAL_MS = 2000;
const INTERP_LERP = 0.25;

class RemotePlayer {
  constructor(scene, data) {
    this.scene = scene;
    this.id = data.id;
    this.username = data.username;
    this.color = data.color;

    this.mesh = createCharacterMesh(this.color);
    this.mesh.position.set(data.position.x, data.position.y - 0.45, data.position.z);
    this.mesh.rotation.y = data.rotation || 0;
    this.scene.add(this.mesh);

    this.nameTag = createNameTagSprite(this.username, this.color);
    this.nameTag.position.set(0, 2.3, 0);
    this.mesh.add(this.nameTag);

    this.targetPosition = new THREE.Vector3(data.position.x, data.position.y - 0.45, data.position.z);
    this.targetRotation = data.rotation || 0;
    this.animState = data.animState || 'idle';
  }

  setTarget(data) {
    this.targetPosition.set(data.position.x, data.position.y - 0.45, data.position.z);
    this.targetRotation = data.rotation;
    this.animState = data.animState;
  }

  update() {
    this.mesh.position.lerp(this.targetPosition, INTERP_LERP);

    let angleDiff = this.targetRotation - this.mesh.rotation.y;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    this.mesh.rotation.y += angleDiff * INTERP_LERP;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
}

export class NetworkManager {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.socket = null;
    this.remotePlayers = new Map();
    this.localId = null;
    this.username = '';

    callbacks = callbacks || {};
    this.callbacks = {
      onConnected: callbacks.onConnected || function () {},
      onChatMessage: callbacks.onChatMessage || function () {},
      onOnlineCount: callbacks.onOnlineCount || function () {},
      onPing: callbacks.onPing || function () {},
      onError: callbacks.onError || function () {}
    };

    this._lastSendTime = 0;
    this._pingInterval = null;
  }

  connect(username, serverUrl) {
    const self = this;
    serverUrl = serverUrl || 'http://localhost:3000';

    this.username = username;
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10
    });

    this.socket.on('connect', function () {
      self.localId = self.socket.id;
      self.socket.emit('playerJoin', { username: username });
      self._startPingLoop();
    });

    this.socket.on('connect_error', function (err) {
      self.callbacks.onError(err.message || 'Connection failed');
    });

    this.socket.on('currentPlayers', function (players) {
      Object.values(players).forEach(function (p) {
        if (p.id !== self.localId && !self.remotePlayers.has(p.id)) {
          self.remotePlayers.set(p.id, new RemotePlayer(self.scene, p));
        }
      });
      self.callbacks.onConnected();
    });

    this.socket.on('playerJoined', function (data) {
      if (data.id === self.localId) return;
      if (!self.remotePlayers.has(data.id)) {
        self.remotePlayers.set(data.id, new RemotePlayer(self.scene, data));
      }
      self.callbacks.onChatMessage({ system: true, message: data.username + ' joined the world' });
    });

    this.socket.on('playersUpdate', function (players) {
      Object.values(players).forEach(function (p) {
        if (p.id === self.localId) return;
        const remote = self.remotePlayers.get(p.id);
        if (remote) {
          remote.setTarget(p);
        } else {
          self.remotePlayers.set(p.id, new RemotePlayer(self.scene, p));
        }
      });
    });

    this.socket.on('playerLeft', function (id) {
      const remote = self.remotePlayers.get(id);
      if (remote) {
        self.callbacks.onChatMessage({ system: true, message: remote.username + ' left the world' });
        remote.dispose();
        self.remotePlayers.delete(id);
      }
    });

    this.socket.on('chatMessage', function (data) {
      self.callbacks.onChatMessage(data);
    });

    this.socket.on('onlineCount', function (count) {
      self.callbacks.onOnlineCount(count);
    });

    this.socket.on('pong', function (clientTime) {
      const latency = Date.now() - clientTime;
      self.callbacks.onPing(latency);
    });
  }

  _startPingLoop() {
    const self = this;
    if (this._pingInterval) clearInterval(this._pingInterval);
    this._pingInterval = setInterval(function () {
      if (self.socket && self.socket.connected) {
        self.socket.emit('ping', Date.now());
      }
    }, PING_INTERVAL_MS);
  }

  sendUpdate(state, now) {
    if (!this.socket || !this.socket.connected) return;
    if (now - this._lastSendTime < SEND_RATE_MS) return;
    this._lastSendTime = now;
    this.socket.emit('playerUpdate', state);
  }

  sendChat(message) {
    if (!this.socket || !this.socket.connected || !message.trim()) return;
    this.socket.emit('chatMessage', message.trim());
  }

  update() {
    this.remotePlayers.forEach(function (remote) {
      remote.update();
    });
  }

  dispose() {
    if (this._pingInterval) clearInterval(this._pingInterval);
    this.remotePlayers.forEach(function (remote) {
      remote.dispose();
    });
    this.remotePlayers.clear();
    if (this.socket) this.socket.disconnect();
  }
}
