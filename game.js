/**
 * ============================================================================
 * JUST SUPERBLOCKS - PRO MULTIPLAYER ENGINE
 * ============================================================================
 * A highly robust, over-engineered 3D multiplayer block game engine.
 * Includes: Physics, 3-Axis Collision, Network Interpolation, Chat System,
 * Procedural Map Generation, Particle Systems, Day/Night Cycles, and UI Mgmt.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ============================================================================
   1. CORE CONFIGURATION & CONSTANTS
   ============================================================================ */
const GAME_CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyCQD0VDKp94d6mxMyIABT2-JYGdXGpezF0",
        authDomain: "slopblocks.firebaseapp.com",
        projectId: "slopblocks",
        storageBucket: "slopblocks.firebasestorage.app",
        messagingSenderId: "2703874752",
        appId: "1:2703874752:web:3fe1ec186c06c43a386785",
        measurementId: "G-GGT5W0NXW"
    },
    PHYSICS: {
        GRAVITY: 0.025,
        JUMP_FORCE: 0.45,
        MOVE_SPEED: 0.2,
        FRICTION: 0.85,
        AIR_RESISTANCE: 0.98,
        TERMINAL_VELOCITY: -1.5,
        PLAYER_SIZE: { w: 0.8, h: 1.8, d: 0.8 }, // Humanoid proportions
        STEP_OFFSET: 0.1
    },
    NETWORK: {
        TICK_RATE_MS: 50, // 20 updates per second
        LERP_FACTOR: 0.35 // Smoothing for remote players
    },
    WORLD: {
        CHUNK_SIZE: 16,
        DEATH_Y_LIMIT: -30
    },
    PROFANITY: ['shit', 'fuck', 'bitch', 'ass', 'damn', 'crap', 'slut', 'whore', 'dick', 'cock']
};

/* ============================================================================
   2. UTILITY CLASSES (Math, Strings, Logging)
   ============================================================================ */
class Utils {
    static generateID(length = 10) {
        return Math.random().toString(36).substring(2, 2 + length);
    }

    static isClean(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return !GAME_CONFIG.PROFANITY.some(word => lower.includes(word));
    }

    static filterChat(text) {
        let cleanText = text;
        GAME_CONFIG.PROFANITY.forEach(word => {
            const regex = new RegExp(word, 'gi');
            cleanText = cleanText.replace(regex, '*'.repeat(word.length));
        });
        return cleanText;
    }

    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }
}

class Logger {
    static info(msg) { console.log(`[INFO] ${msg}`); }
    static warn(msg) { console.warn(`[WARN] ${msg}`); }
    static error(msg) { console.error(`[ERROR] ${msg}`); }
}

/* ============================================================================
   3. UI & CHAT MANAGER
   ============================================================================ */
class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.menuDOM = document.getElementById('main-menu');
        this.hudDOM = document.getElementById('hud');
        this.errorDOM = document.getElementById('error-msg');
        this.nameInput = document.getElementById('playerName');
        
        // Stats
        this.statFPS = document.getElementById('stat-fps');
        this.statPing = document.getElementById('stat-ping');
        this.statPos = document.getElementById('stat-pos');
        this.statMode = document.getElementById('stat-mode');

        // Chat
        this.chatInput = document.getElementById('chat-input');
        this.chatMessages = document.getElementById('chat-messages');
        this.isChatActive = false;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-obby').addEventListener('click', () => this.tryJoin('obby'));
        document.getElementById('btn-void').addEventListener('click', () => this.tryJoin('void'));
        document.getElementById('btn-lava').addEventListener('click', () => this.tryJoin('lava'));

        // Chat input toggle
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.engine.state !== 'PLAYING') return;
                
                if (this.isChatActive) {
                    this.sendChatMessage();
                    this.chatInput.blur();
                    this.isChatActive = false;
                } else {
                    this.chatInput.focus();
                    this.isChatActive = true;
                }
            }
        });

        this.chatInput.addEventListener('blur', () => { this.isChatActive = false; });
        this.chatInput.addEventListener('focus', () => { this.isChatActive = true; });
    }

    tryJoin(mode) {
        const name = this.nameInput.value.trim();
        if (name.length < 3) return this.showError("USERNAME MUST BE 3+ CHARACTERS!");
        if (name.length > 12) return this.showError("USERNAME TOO LONG! (MAX 12)");
        if (!Utils.isClean(name)) return this.showError("NO PROFANITY ALLOWED!");

        this.menuDOM.style.opacity = '0';
        setTimeout(() => {
            this.menuDOM.style.display = 'none';
            this.hudDOM.style.display = 'block';
            this.engine.startGame(name, mode);
        }, 500);
    }

    showError(msg) {
        this.errorDOM.innerText = msg;
        this.errorDOM.style.animation = 'none';
        void this.errorDOM.offsetWidth; // Trigger reflow
        this.errorDOM.style.animation = 'floatLogo 0.5s ease';
    }

    appendChatMessage(author, text, isSystem = false) {
        const div = document.createElement('div');
        div.className = `chat-line ${isSystem ? 'chat-system' : ''}`;
        
        if (isSystem) {
            div.innerText = text;
        } else {
            const spanAuthor = document.createElement('span');
            spanAuthor.className = 'chat-author';
            spanAuthor.innerText = `[${author}]: `;
            
            const spanText = document.createElement('span');
            spanText.innerText = Utils.filterChat(text);
            
            div.appendChild(spanAuthor);
            div.appendChild(spanText);
        }

        this.chatMessages.appendChild(div);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        // Keep chat history clean (max 50 messages)
        if (this.chatMessages.children.length > 50) {
            this.chatMessages.removeChild(this.chatMessages.firstChild);
        }
    }

    sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (text.length > 0) {
            this.engine.network.broadcastChat(text);
        }
        this.chatInput.value = '';
    }

    updateStats(fps, pos) {
        this.statFPS.innerText = `FPS: ${fps}`;
        this.statPos.innerText = `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
        this.statMode.innerText = `Mode: ${this.engine.currentMode.toUpperCase()}`;
    }
}

/* ============================================================================
   4. NETWORK MANAGER (Firebase wrapper)
   ============================================================================ */
class NetworkManager {
    constructor(engine) {
        this.engine = engine;
        this.app = initializeApp(GAME_CONFIG.FIREBASE);
        this.db = getDatabase(this.app);
        
        this.localId = Utils.generateID(8);
        this.playerRef = ref(this.db, `players/${this.localId}`);
        this.chatRef = ref(this.db, 'chat');
        
        // Remove player on disconnect
        onDisconnect(this.playerRef).remove();
        
        this.lastSync = 0;
        this.remotePlayersData = {};
    }

    initListeners() {
        // Listen to all players
        onValue(ref(this.db, 'players'), (snapshot) => {
            this.remotePlayersData = snapshot.val() || {};
            this.engine.playerManager.syncRemotes(this.remotePlayersData);
        });

        // Listen to chat
        let isInitialLoad = true;
        onValue(this.chatRef, (snapshot) => {
            if (isInitialLoad) { isInitialLoad = false; return; } // Skip old messages
            const chats = snapshot.val() || {};
            const keys = Object.keys(chats);
            if (keys.length > 0) {
                const latest = chats[keys[keys.length - 1]];
                // Only show chat if they are in the same mode
                if (latest.mode === this.engine.currentMode) {
                    this.engine.ui.appendChatMessage(latest.name, latest.text);
                }
            }
        });
    }

    syncLocalPlayer(pos, vel, isGrounded) {
        const now = performance.now();
        if (now - this.lastSync > GAME_CONFIG.NETWORK.TICK_RATE_MS) {
            set(this.playerRef, {
                name: this.engine.playerName,
                mode: this.engine.currentMode,
                x: pos.x, y: pos.y, z: pos.z,
                vx: vel.x, vy: vel.y, vz: vel.z,
                grounded: isGrounded,
                timestamp: serverTimestamp()
            });
            this.lastSync = now;
        }
    }

    broadcastChat(text) {
        push(this.chatRef, {
            name: this.engine.playerName,
            text: text,
            mode: this.engine.currentMode,
            timestamp: serverTimestamp()
        });
    }

    cleanup() {
        set(this.playerRef, null);
    }
}

/* ============================================================================
   5. INPUT SYSTEM
   ============================================================================ */
class InputManager {
    constructor(engine) {
        this.engine = engine;
        this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
        
        window.addEventListener('keydown', (e) => this.onKey(e, true));
        window.addEventListener('keyup', (e) => this.onKey(e, false));
    }

    onKey(event, isDown) {
        if (this.engine.ui.isChatActive) return; // Disable movement while chatting
        
        const key = event.key.toLowerCase();
        if (key === 'w') this.keys.w = isDown;
        if (key === 'a') this.keys.a = isDown;
        if (key === 's') this.keys.s = isDown;
        if (key === 'd') this.keys.d = isDown;
        if (key === ' ') this.keys.space = isDown;
        if (key === 'shift') this.keys.shift = isDown;
    }

    getMovementVector() {
        let x = 0, z = 0;
        if (this.keys.w) z -= 1;
        if (this.keys.s) z += 1;
        if (this.keys.a) x -= 1;
        if (this.keys.d) x += 1;

        // Normalize for diagonal movement
        if (x !== 0 && z !== 0) {
            const length = Math.sqrt(x*x + z*z);
            x /= length;
            z /= length;
        }
        return { x, z };
    }
}

/* ============================================================================
   6. GRAPHICS & VISUALS (Particles, NameTags)
   ============================================================================ */
class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.baseMesh = new THREE.Mesh(geometry, material);
    }

    spawn(position, colorHex, count = 5) {
        for (let i = 0; i < count; i++) {
            const p = this.baseMesh.clone();
            p.material = p.material.clone();
            p.material.color.setHex(colorHex);
            p.position.copy(position);
            
            // Random scatter
            p.position.x += (Math.random() - 0.5) * 0.5;
            p.position.z += (Math.random() - 0.5) * 0.5;

            this.scene.add(p);
            this.particles.push({
                mesh: p,
                life: 1.0,
                vx: (Math.random() - 0.5) * 0.2,
                vy: Math.random() * 0.3 + 0.1,
                vz: (Math.random() - 0.5) * 0.2
            });
        }
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt * 2.0; // Decay rate
            
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }

            p.vy -= GAME_CONFIG.PHYSICS.GRAVITY; // Apply gravity
            p.mesh.position.x += p.vx;
            p.mesh.position.y += p.vy;
            p.mesh.position.z += p.vz;
            
            p.mesh.scale.setScalar(p.life);
            p.mesh.rotation.x += 0.1;
            p.mesh.rotation.y += 0.1;
        }
    }
}

class SpriteGenerator {
    static createNameTag(text, color = 'white') {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.font = 'bold 48px "Arial Black", sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(text, 256, 64);
        ctx.fillText(text, 256, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(4, 1, 1);
        sprite.position.set(0, 1.8, 0); // Above player head
        return sprite;
    }
}

/* ============================================================================
   7. WORLD GENERATION & PHYSICS COLLISION
   ============================================================================ */
class WorldManager {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.blocks = []; // Array of THREE.Box3 bounding boxes for collision
        this.meshes = []; // Visual meshes
        
        // Materials cache
        this.mats = {
            stone: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }),
            grass: new THREE.MeshStandardMaterial({ color: 0x22cc22, roughness: 1.0 }),
            wood: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }),
            lava: new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0x880000, roughness: 0.1 }),
            glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, opacity: 1, transparent: true })
        };
    }

    clearWorld() {
        this.meshes.forEach(m => this.scene.remove(m));
        this.meshes = [];
        this.blocks = [];
    }

    addBlock(x, y, z, w, h, d, matType, isSolid = true) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, this.mats[matType] || this.mats.stone);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);

        if (isSolid) {
            mesh.updateMatrixWorld();
            const box = new THREE.Box3().setFromObject(mesh);
            this.blocks.push(box);
        }
        return mesh;
    }

    generate(mode) {
        this.clearWorld();
        
        if (mode === 'obby') {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.scene.fog = new THREE.Fog(0x87CEEB, 20, 100);
            
            // Start Platform
            this.addBlock(0, 0, 0, 8, 1, 8, 'grass');
            
            // Generate linear obstacle course
            let cx = 0, cz = -10, cy = 0;
            for(let i = 0; i < 30; i++) {
                const type = Math.random();
                if (type < 0.3) {
                    // Small jump
                    this.addBlock(cx, cy, cz, 3, 0.5, 3, 'wood');
                    cz -= 6; cy += 1;
                } else if (type < 0.6) {
                    // Long thin beam
                    this.addBlock(cx, cy, cz, 1, 0.5, 8, 'stone');
                    cz -= 10;
                } else {
                    // Zig zag
                    cx += (Math.random() > 0.5 ? 5 : -5);
                    this.addBlock(cx, cy, cz, 4, 1, 4, 'glass');
                    cz -= 5; cy += 2;
                }
            }
        } 
        else if (mode === 'void') {
            this.scene.background = new THREE.Color(0x0a0a0f);
            this.scene.fog = new THREE.Fog(0x0a0a0f, 10, 60);
            
            this.addBlock(0, 0, 0, 10, 1, 10, 'stone'); // Spawn
            
            // Procedural city ruins
            for(let i = 0; i < 100; i++) {
                const rx = (Math.random() - 0.5) * 150;
                const rz = (Math.random() - 0.5) * 150;
                if (Math.abs(rx) < 10 && Math.abs(rz) < 10) continue; // Don't block spawn
                
                const w = 2 + Math.random() * 6;
                const d = 2 + Math.random() * 6;
                const h = 5 + Math.random() * 40;
                
                this.addBlock(rx, h/2 - 2, rz, w, h, d, 'stone');
            }
        }
        else if (mode === 'lava') {
            this.scene.background = new THREE.Color(0x3a0000);
            this.scene.fog = new THREE.Fog(0x3a0000, 10, 80);
            
            // Giant lava ocean (Non solid)
            const lavaMesh = this.addBlock(0, -2, 0, 200, 2, 200, 'lava', false);
            
            // Islands
            for(let i = 0; i < 40; i++) {
                const rx = (Math.random() - 0.5) * 100;
                const rz = (Math.random() - 0.5) * 100;
                this.addBlock(rx, Math.random() * 3, rz, 6, 2, 6, 'stone');
            }
        }
    }

    // Advanced 3-Axis Sweeping Collision
    // Returns modified velocity vector that slides along walls
    resolveCollision(playerBox, velocity) {
        let finalVel = velocity.clone();
        
        // Helper to check overlap
        const checkOverlap = (box, offset) => {
            const testBox = box.clone().translate(offset);
            for (let block of this.blocks) {
                if (testBox.intersectsBox(block)) return block; // Return the block we hit
            }
            return null;
        };

        // 1. Check Y (Vertical) - Gravity & Jumping
        const hitY = checkOverlap(playerBox, new THREE.Vector3(0, finalVel.y, 0));
        let isGrounded = false;
        if (hitY) {
            if (finalVel.y < 0) {
                // Falling down, hit floor
                finalVel.y = (hitY.max.y - playerBox.min.y) + 0.001; 
                isGrounded = true;
            } else if (finalVel.y > 0) {
                // Jumping up, hit ceiling
                finalVel.y = (hitY.min.y - playerBox.max.y) - 0.001;
            }
        }

        // Apply Y so X and Z checks happen at the new height
        playerBox.translate(new THREE.Vector3(0, finalVel.y, 0));

        // 2. Check X (Horizontal)
        const hitX = checkOverlap(playerBox, new THREE.Vector3(finalVel.x, 0, 0));
        if (hitX) {
            if (finalVel.x > 0) finalVel.x = (hitX.min.x - playerBox.max.x) - 0.001;
            else if (finalVel.x < 0) finalVel.x = (hitX.max.x - playerBox.min.x) + 0.001;
        }
        playerBox.translate(new THREE.Vector3(finalVel.x, 0, 0));

        // 3. Check Z (Depth)
        const hitZ = checkOverlap(playerBox, new THREE.Vector3(0, 0, finalVel.z));
        if (hitZ) {
            if (finalVel.z > 0) finalVel.z = (hitZ.min.z - playerBox.max.z) - 0.001;
            else if (finalVel.z < 0) finalVel.z = (hitZ.max.z - playerBox.min.z) + 0.001;
        }

        return { velocity: finalVel, grounded: isGrounded };
    }
}

/* ============================================================================
   8. PLAYER & ENTITY MANAGEMENT
   ============================================================================ */
class LocalPlayer {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        
        // Physics state
        this.position = new THREE.Vector3(0, 10, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.isGrounded = false;
        
        // Avatar Mesh (Humanoid structure)
        this.mesh = new THREE.Group();
        
        const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
        const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.5 });
        
        this.body = new THREE.Mesh(bodyGeo, mat);
        this.body.position.y = 0.6; // Shift up so bottom is at 0
        this.mesh.add(this.body);

        this.head = new THREE.Mesh(headGeo, mat);
        this.head.position.y = 1.5;
        this.mesh.add(this.head);

        // Name tag
        this.nameTag = SpriteGenerator.createNameTag(engine.playerName, '#00ff88');
        this.nameTag.position.y = 2.2;
        this.mesh.add(this.nameTag);

        this.scene.add(this.mesh);
        
        // Bounding box for collisions
        this.size = GAME_CONFIG.PHYSICS.PLAYER_SIZE;
    }

    update(dt) {
        // 1. Gather Input
        const input = this.engine.input.getMovementVector();
        const cfg = GAME_CONFIG.PHYSICS;
        
        // Acceleration
        this.velocity.x += input.x * cfg.MOVE_SPEED;
        this.velocity.z += input.z * cfg.MOVE_SPEED;
        
        // Friction / Drag
        this.velocity.x *= cfg.FRICTION;
        this.velocity.z *= cfg.FRICTION;

        // Gravity
        this.velocity.y -= cfg.GRAVITY;
        if (this.velocity.y < cfg.TERMINAL_VELOCITY) this.velocity.y = cfg.TERMINAL_VELOCITY;

        // Jump
        if (this.engine.input.keys.space && this.isGrounded) {
            this.velocity.y = cfg.JUMP_FORCE;
            this.isGrounded = false;
            this.engine.particles.spawn(this.position.clone(), 0xffffff, 10); // Jump dust
        }

        // 2. Build Bounding Box at current position
        const pBox = new THREE.Box3();
        pBox.min.set(
            this.position.x - this.size.w / 2, 
            this.position.y, 
            this.position.z - this.size.d / 2
        );
        pBox.max.set(
            this.position.x + this.size.w / 2, 
            this.position.y + this.size.h, 
            this.position.z + this.size.d / 2
        );

        // 3. Collision Resolution
        const collisionResult = this.engine.world.resolveCollision(pBox, this.velocity);
        this.velocity.copy(collisionResult.velocity);
        
        // Landing particles
        if (collisionResult.grounded && !this.isGrounded && this.velocity.y < -0.2) {
            this.engine.particles.spawn(this.position.clone(), 0xaaaaaa, 5);
        }
        this.isGrounded = collisionResult.grounded;

        // 4. Apply Final Velocity
        this.position.add(this.velocity);

        // Death Plane
        if (this.position.y < GAME_CONFIG.WORLD.DEATH_Y_LIMIT) {
            this.respawn();
        }

        // Update Mesh visually
        this.mesh.position.copy(this.position);
        
        // Visual Tilt based on velocity
        this.body.rotation.z = -this.velocity.x * 0.5;
        this.body.rotation.x = this.velocity.z * 0.5;

        // Sync to Network
        this.engine.network.syncLocalPlayer(this.position, this.velocity, this.isGrounded);
    }

    respawn() {
        this.position.set(0, 15, 0);
        this.velocity.set(0, 0, 0);
        this.engine.ui.appendChatMessage('SYSTEM', 'You fell into the abyss.', true);
    }
}

class PlayerManager {
    constructor(engine) {
        this.engine = engine;
        this.remoteMeshes = {};
    }

    syncRemotes(data) {
        const localId = this.engine.network.localId;
        const currentMode = this.engine.currentMode;

        Object.keys(data).forEach(id => {
            if (id === localId) return;

            const pData = data[id];

            // Mode isolation
            if (pData.mode !== currentMode) {
                this.removeRemote(id);
                return;
            }

            if (!this.remoteMeshes[id]) {
                this.createRemote(id, pData);
            } else {
                // Update target data for Lerp interpolation
                const remote = this.remoteMeshes[id];
                remote.targetPos.set(pData.x, pData.y, pData.z);
                remote.targetVel.set(pData.vx, pData.vy, pData.vz);
                remote.grounded = pData.grounded;
            }
        });

        // Cleanup disconnected
        Object.keys(this.remoteMeshes).forEach(id => {
            if (!data[id]) this.removeRemote(id);
        });
    }

    createRemote(id, data) {
        const group = new THREE.Group();
        
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.5 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), mat);
        body.position.y = 0.6;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat);
        head.position.y = 1.5;
        
        group.add(body);
        group.add(head);

        const nameTag = SpriteGenerator.createNameTag(data.name || "GUEST", '#ff3366');
        nameTag.position.y = 2.2;
        group.add(nameTag);

        // Set initial position instantly to avoid flying in from 0,0,0
        group.position.set(data.x, data.y, data.z);

        this.engine.scene.add(group);
        this.engine.ui.appendChatMessage('SYSTEM', `${data.name} joined the game.`, true);

        this.remoteMeshes[id] = {
            mesh: group,
            bodyMesh: body,
            targetPos: new THREE.Vector3(data.x, data.y, data.z),
            targetVel: new THREE.Vector3(data.vx || 0, data.vy || 0, data.vz || 0)
        };
    }

    removeRemote(id) {
        if (this.remoteMeshes[id]) {
            this.engine.scene.remove(this.remoteMeshes[id].mesh);
            delete this.remoteMeshes[id];
        }
    }

    updateInterpolation(dt) {
        const factor = GAME_CONFIG.NETWORK.LERP_FACTOR;
        Object.values(this.remoteMeshes).forEach(remote => {
            // Smoothly interpolate position
            remote.mesh.position.lerp(remote.targetPos, factor);
            
            // Visual tilt based on target velocity
            remote.bodyMesh.rotation.z = -remote.targetVel.x * 0.5;
            remote.bodyMesh.rotation.x = remote.targetVel.z * 0.5;
        });
    }
}

/* ============================================================================
   9. MAIN ENGINE APPLICATION
   ============================================================================ */
class AppEngine {
    constructor() {
        this.state = 'MENU'; // MENU, PLAYING
        this.playerName = '';
        this.currentMode = '';
        
        // Time tracking
        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.lastFpsTime = performance.now();

        this.initCore();
        this.initManagers();
        
        // Handle resizing
        window.addEventListener('resize', () => this.onWindowResize());
    }

    initCore() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Lighting setup
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(50, 100, 50);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 500;
        const d = 100;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.scene.add(this.dirLight);
    }

    initManagers() {
        this.ui = new UIManager(this);
        this.network = new NetworkManager(this);
        this.input = new InputManager(this);
        this.world = new WorldManager(this);
        this.particles = new ParticleSystem(this.scene);
        this.playerManager = new PlayerManager(this);
    }

    startGame(name, mode) {
        this.playerName = name;
        this.currentMode = mode;
        this.state = 'PLAYING';

        // Init level
        this.world.generate(mode);
        
        // Init local player
        this.localPlayer = new LocalPlayer(this);

        // Start networking
        this.network.initListeners();

        // Start Loop
        this.clock.start();
        this.animate();
    }

    updateCamera() {
        // Third-person smooth follow camera
        const target = this.localPlayer.mesh.position.clone();
        target.y += 1.5; // Look at head height
        
        // Camera offset behind and up
        const offset = new THREE.Vector3(0, 5, 12);
        
        // In a full game we'd use mouse to rotate this offset. Here it is fixed.
        const idealPos = target.clone().add(offset);
        
        // Smooth camera movement
        this.camera.position.lerp(idealPos, 0.15);
        this.camera.lookAt(target);
    }

    updateDayNightCycle() {
        // Slowly rotate light to simulate sun moving
        const time = performance.now() * 0.0001;
        this.dirLight.position.x = Math.sin(time) * 100;
        this.dirLight.position.z = Math.cos(time) * 100;
    }

    animate() {
        if (this.state !== 'PLAYING') return;

        requestAnimationFrame(() => this.animate());

        const dt = this.clock.getDelta();

        // Update Logic
        this.localPlayer.update(dt);
        this.playerManager.updateInterpolation(dt);
        this.particles.update(dt);
        this.updateCamera();
        
        // Environment
        if (this.currentMode === 'obby') this.updateDayNightCycle();

        // Render
        this.renderer.render(this.scene, this.camera);

        // UI Stats update (every ~0.5s to prevent DOM thrashing)
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 500) {
            const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
            this.ui.updateStats(fps, this.localPlayer.position);
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Bootstrap Engine
window.onload = () => {
    Logger.info("Starting SUPERBLOCKS Engine...");
    window.gameEngine = new AppEngine();
};