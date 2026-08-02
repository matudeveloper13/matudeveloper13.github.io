/**
 * ============================================================================
 * JUST SUPERBLOCKS - COMPLETED CORE GAME ENGINE
 * ============================================================================
 * Contains robust systems for inputs, character construction with rounded parts,
 * face mapping, walk/jump animations, slow precise controls, collision physics,
 * menu navigation, and Firebase real-time multiplayer synchronization.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ============================================================================
   1. CONFIGURATION CONSTANTS
   ============================================================================ */
const GAME_CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyCQD0VDKp94d6mxMyIABT2-JYGdXGpezF0",
        authDomain: "slopblocks.firebaseapp.com",
        projectId: "slopblocks",
        storageBucket: "slopblocks.firebasestorage.app",
        messagingSenderId: "2703874752",
        appId: "1:2703874752:web:3fe1ec186c06c43a386785"
    },
    PHYSICS: {
        GRAVITY: 0.02,
        JUMP_FORCE: 0.38,
        MOVE_SPEED: 0.06, // Slow and easy to control
        FRICTION: 0.82,
        TERMINAL_VELOCITY: -1.2,
        PLAYER_SIZE: { w: 0.8, h: 2.0, d: 0.8 }
    },
    PROFANITY_FILTER: ['shit', 'fuck', 'bitch', 'ass', 'damn', 'crap', 'slut', 'whore', 'dick', 'cock']
};

/* ============================================================================
   2. UTILITY & VALIDATION HELPERS
   ============================================================================ */
class GameUtils {
    static generateID(length = 8) {
        return Math.random().toString(36).substring(2, 2 + length);
    }

    static isNameClean(name) {
        if (!name) return false;
        const lower = name.toLowerCase();
        return !GAME_CONFIG.PROFANITY_FILTER.some(word => lower.includes(word));
    }
}

/* ============================================================================
   3. UI & MENU MANAGER
   ============================================================================ */
class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.menuElement = document.getElementById('main-menu');
        this.hudElement = document.getElementById('hud');
        this.errorMsg = document.getElementById('error-msg');
        this.nameInput = document.getElementById('playerName');
        
        this.statFPS = document.getElementById('stat-fps');
        this.statMode = document.getElementById('stat-mode');
        this.statPos = document.getElementById('stat-pos');

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-obby').addEventListener('click', () => this.handleJoinRequest('obby'));
        document.getElementById('btn-void').addEventListener('click', () => this.handleJoinRequest('void'));
        document.getElementById('btn-lava').addEventListener('click', () => this.handleJoinRequest('lava'));
        document.getElementById('btn-quit').addEventListener('click', () => this.engine.quitToMenu());
    }

    handleJoinRequest(mode) {
        const name = this.nameInput.value.trim();
        if (name.length < 3) {
            this.errorMsg.innerText = "Username must be at least 3 characters!";
            return;
        }
        if (!GameUtils.isNameClean(name)) {
            this.errorMsg.innerText = "Keep it clean! Choose another name.";
            return;
        }

        this.errorMsg.innerText = "";
        this.menuElement.style.display = 'none';
        this.hudElement.style.display = 'block';

        this.engine.startSession(name, mode);
    }

    showMenu() {
        this.hudElement.style.display = 'none';
        this.menuElement.style.display = 'flex';
    }

    updateStats(fps, mode, pos) {
        this.statFPS.innerText = `FPS: ${fps}`;
        this.statMode.innerText = `Mode: ${mode.toUpperCase()}`;
        this.statPos.innerText = `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
    }
}

/* ============================================================================
   4. INPUT SYSTEM MANAGER
   ============================================================================ */
class InputManager {
    constructor() {
        this.keys = { w: false, a: false, s: false, d: false, space: false };
        this.initListeners();
    }

    initListeners() {
        window.addEventListener('keydown', (e) => this.processKey(e.key.toLowerCase(), true));
        window.addEventListener('keyup', (e) => this.processKey(e.key.toLowerCase(), false));
    }

    processKey(key, isDown) {
        if (key === 'w' || key === 'arrowup') this.keys.w = isDown;
        if (key === 'a' || key === 'arrowleft') this.keys.a = isDown;
        if (key === 's' || key === 'arrowdown') this.keys.s = isDown;
        if (key === 'd' || key === 'arrowright') this.keys.d = isDown;
        if (key === ' ') this.keys.space = isDown;
    }

    getMovementVector() {
        let x = 0, z = 0;
        if (this.keys.w) z -= 1;
        if (this.keys.s) z += 1;
        if (this.keys.a) x -= 1;
        if (this.keys.d) x += 1;

        if (x !== 0 && z !== 0) {
            const length = Math.sqrt(x * x + z * z);
            x /= length;
            z /= length;
        }
        return { x, z };
    }
}

/* ============================================================================
   5. AVATAR BUILDER & ANIMATOR
   ============================================================================ */
class AvatarBuilder {
    static create(colorHex, username) {
        const rootGroup = new THREE.Group();
        const primaryMaterial = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 });

        // Helper to construct rounded shapes for body parts
        const createRoundedPart = (width, height, depth, radius) => {
            const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
            const mesh = new THREE.Mesh(geometry, primaryMaterial);
            mesh.castShadow = true;
            return mesh;
        };

        // Torso
        const torso = createRoundedPart(0.8, 1.1, 0.45, 0.12);
        torso.position.y = 1.1;
        rootGroup.add(torso);

        // Head (Squirclish shape with smooth edges)
        const head = createRoundedPart(0.65, 0.65, 0.65, 0.2);
        head.position.y = 0.95;

        // Custom Face Texture Mapping (Eyes and Mouth)
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#000000';
        ctx.fillRect(14, 18, 9, 9);  // Left Eye
        ctx.fillRect(41, 18, 9, 9);  // Right Eye
        ctx.fillRect(20, 44, 24, 6); // Mouth
        
        const faceMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
        const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), faceMaterial);
        facePlane.position.set(0, 0, 0.33);
        head.add(facePlane);
        torso.add(head);

        // Limb Pivots (Shoulders and Hips)
        const leftArmPivot = new THREE.Group(); leftArmPivot.position.set(-0.55, 0.4, 0); torso.add(leftArmPivot);
        const rightArmPivot = new THREE.Group(); rightArmPivot.position.set(0.55, 0.4, 0); torso.add(rightArmPivot);
        const leftLegPivot = new THREE.Group(); leftLegPivot.position.set(-0.2, -0.55, 0); torso.add(leftLegPivot);
        const rightLegPivot = new THREE.Group(); rightLegPivot.position.set(0.2, -0.55, 0); torso.add(rightLegPivot);

        const armMesh = createRoundedPart(0.25, 0.8, 0.25, 0.08); armMesh.position.y = -0.3;
        const legMesh = createRoundedPart(0.3, 0.9, 0.3, 0.08); legMesh.position.y = -0.4;

        leftArmPivot.add(armMesh);
        rightArmPivot.add(armMesh.clone());
        leftLegPivot.add(legMesh);
        rightLegPivot.add(legMesh.clone());

        // Username NameTag Sprite
        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 256; nameCanvas.height = 64;
        const nameCtx = nameCanvas.getContext('2d');
        nameCtx.font = 'bold 34px Arial'; nameCtx.fillStyle = '#ffffff'; nameCtx.textAlign = 'center';
        nameCtx.lineWidth = 4; nameCtx.strokeStyle = '#000000';
        nameCtx.strokeText(username, 128, 40); nameCtx.fillText(username, 128, 40);
        
        const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nameCanvas), depthTest: false }));
        nameSprite.scale.set(3, 0.75, 1);
        nameSprite.position.y = 2.6;
        rootGroup.add(nameSprite);

        return {
            root: rootGroup,
            torso: torso,
            leftArm: leftArmPivot,
            rightArm: rightArmPivot,
            leftLeg: leftLegPivot,
            rightLeg: rightLegPivot,
            walkTimer: 0
        };
    }

    static updateAnimation(avatar, velocity, isGrounded, dt) {
        const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

        if (!isGrounded) {
            // Jump Pose (Arms up, legs split)
            avatar.leftArm.rotation.x = -Math.PI / 1.4;
            avatar.rightArm.rotation.x = -Math.PI / 1.4;
            avatar.leftLeg.rotation.x = -0.4;
            avatar.rightLeg.rotation.x = 0.4;
        } else if (horizontalSpeed > 0.005) {
            // Walking Cycle
            avatar.walkTimer += horizontalSpeed * dt * 75;
            const swing = Math.sin(avatar.walkTimer) * 1.1;
            avatar.leftArm.rotation.x = swing;
            avatar.rightArm.rotation.x = -swing;
            avatar.leftLeg.rotation.x = -swing;
            avatar.rightLeg.rotation.x = swing;
        } else {
            // Idle Position (Reset rotations smoothly)
            avatar.walkTimer = 0;
            avatar.leftArm.rotation.x *= 0.85;
            avatar.rightArm.rotation.x *= 0.85;
            avatar.leftLeg.rotation.x *= 0.85;
            avatar.rightLeg.rotation.x *= 0.85;
        }

        // Slight dynamic momentum tilt on torso
        avatar.torso.rotation.z = -velocity.x * 2.2;
        avatar.torso.rotation.x = velocity.z * 2.2;
    }
}

/* ============================================================================
   6. WORLD BUILDER & PHYSICS COLLISION ENGINE
   ============================================================================ */
class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.blocks = [];
    }

    clear() {
        this.blocks.forEach(b => this.scene.remove(b.mesh));
        this.blocks = [];
    }

    addBlock(x, y, z, width, height, depth, colorHex, isSolid = true) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);

        if (isSolid) {
            mesh.updateMatrixWorld();
            const box = new THREE.Box3().setFromObject(mesh);
            this.blocks.push({ mesh, box });
        }
        return mesh;
    }

    generateMap(mode) {
        this.clear();

        if (mode === 'obby') {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.addBlock(0, 0, 0, 8, 1, 8, 0x44aa44); // Start Pad
            for (let i = 1; i < 25; i++) {
                this.addBlock(0, i * 0.5, -i * 5, 3, 0.5, 3, 0xffaa00);
            }
        } else if (mode === 'void') {
            this.scene.background = new THREE.Color(0x0f0f15);
            this.addBlock(0, 0, 0, 10, 1, 10, 0x333333); // Center Base
            for (let i = 0; i < 35; i++) {
                const h = 5 + Math.random() * 25;
                this.addBlock((Math.random() - 0.5) * 80, h / 2 - 2, (Math.random() - 0.5) * 80, 4, h, 4, 0x666666);
            }
        } else if (mode === 'lava') {
            this.scene.background = new THREE.Color(0x3a0000);
            this.addBlock(0, -2, 0, 200, 1, 200, 0xff2200, false); // Lava Floor (non-solid)
            for (let i = 0; i < 30; i++) {
                this.addBlock((Math.random() - 0.5) * 90, Math.random() * 3, (Math.random() - 0.5) * 90, 5, 2, 5, 0x222222);
            }
        }
    }

    resolveCollisions(playerBox, velocity) {
        let finalVelocity = velocity.clone();
        let grounded = false;

        const checkOverlap = (box, offset) => {
            const testBox = box.clone().translate(offset);
            for (let block of this.blocks) {
                if (testBox.intersectsBox(block.box)) return block.box;
            }
            return null;
        };

        // 1. Resolve Y Axis (Gravity & Jumping)
        const hitY = checkOverlap(playerBox, new THREE.Vector3(0, finalVelocity.y, 0));
        if (hitY) {
            if (finalVelocity.y < 0) {
                finalVelocity.y = (hitY.max.y - playerBox.min.y) + 0.001;
                grounded = true;
            } else if (finalVelocity.y > 0) {
                finalVelocity.y = (hitY.min.y - playerBox.max.y) - 0.001;
            }
        }
        playerBox.translate(new THREE.Vector3(0, finalVelocity.y, 0));

        // 2. Resolve X Axis
        const hitX = checkOverlap(playerBox, new THREE.Vector3(finalVelocity.x, 0, 0));
        if (hitX) {
            if (finalVelocity.x > 0) finalVelocity.x = (hitX.min.x - playerBox.max.x) - 0.001;
            else if (finalVelocity.x < 0) finalVelocity.x = (hitX.max.x - playerBox.min.x) + 0.001;
        }
        playerBox.translate(new THREE.Vector3(finalVelocity.x, 0, 0));

        // 3. Resolve Z Axis
        const hitZ = checkOverlap(playerBox, new THREE.Vector3(0, 0, finalVelocity.z));
        if (hitZ) {
            if (finalVelocity.z > 0) finalVelocity.z = (hitZ.min.z - playerBox.max.z) - 0.001;
            else if (finalVelocity.z < 0) finalVelocity.z = (hitZ.max.z - playerBox.min.z) + 0.001;
        }

        return { velocity: finalVelocity, grounded };
    }
}

/* ============================================================================
   7. MASTER APP ENGINE ORCHESTRATOR
   ============================================================================ */
class AppEngine {
    constructor() {
        this.state = 'MENU';
        this.playerName = '';
        this.currentMode = '';
        this.localId = GameUtils.generateID(8);

        this.firebaseApp = initializeApp(GAME_CONFIG.FIREBASE);
        this.db = getDatabase(this.firebaseApp);
        this.playerRef = ref(this.db, `players/${this.localId}`);

        this.ui = new UIManager(this);
        this.input = new InputManager();

        this.remotePlayers = {};
        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();

        this.initThreeCore();
        this.world = new WorldManager(this.scene);

        window.addEventListener('resize', () => this.onWindowResize());
        requestAnimationFrame(() => this.mainLoop());
    }

    initThreeCore() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(30, 60, 30);
        this.scene.add(dirLight);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    }

    startSession(name, mode) {
        this.playerName = name;
        this.currentMode = mode;
        this.state = 'PLAYING';

        this.world.generateMap(mode);

        // Build Local Player Avatar
        this.localPlayer = {
            avatar: AvatarBuilder.create(0x00aaff, name),
            position: new THREE.Vector3(0, 5, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            grounded: false
        };
        this.scene.add(this.localPlayer.avatar.root);

        // Bind Firebase Disconnect Hook & Listener
        onDisconnect(this.playerRef).remove();
        onValue(ref(this.db, 'players'), (snapshot) => this.handleNetworkSync(snapshot.val() || {}));
    }

    quitToMenu() {
        this.state = 'MENU';
        this.ui.showMenu();

        // Cleanup Local Data
        set(this.playerRef, null);
        if (this.localPlayer) {
            this.scene.remove(this.localPlayer.avatar.root);
            this.localPlayer = null;
        }

        // Cleanup World & Remotes
        this.world.clear();
        Object.values(this.remotePlayers).forEach(p => this.scene.remove(p.avatar.root));
        this.remotePlayers = {};
    }

    handleNetworkSync(data) {
        if (this.state !== 'PLAYING') return;

        Object.keys(data).forEach(id => {
            if (id === this.localId) return;
            const pData = data[id];

            if (pData.mode !== this.currentMode) {
                if (this.remotePlayers[id]) {
                    this.scene.remove(this.remotePlayers[id].avatar.root);
                    delete this.remotePlayers[id];
                }
                return;
            }

            if (!this.remotePlayers[id]) {
                const avatar = AvatarBuilder.create(0xff3355, pData.name || "GUEST");
                avatar.root.position.set(pData.x, pData.y, pData.z);
                this.scene.add(avatar.root);
                this.remotePlayers[id] = {
                    avatar,
                    targetPos: new THREE.Vector3(pData.x, pData.y, pData.z),
                    targetVel: new THREE.Vector3(pData.vx, pData.vy, pData.vz),
                    grounded: pData.grounded
                };
            } else {
                const remote = this.remotePlayers[id];
                remote.targetPos.set(pData.x, pData.y, pData.z);
                remote.targetVel.set(pData.vx, pData.vy, pData.vz);
                remote.grounded = pData.grounded;
            }
        });

        Object.keys(this.remotePlayers).forEach(id => {
            if (!data[id]) {
                this.scene.remove(this.remotePlayers[id].avatar.root);
                delete this.remotePlayers[id];
            }
        });
    }

    mainLoop() {
        requestAnimationFrame(() => this.mainLoop());
        const dt = this.clock.getDelta();

        if (this.state === 'PLAYING' && this.localPlayer) {
            const cfg = GAME_CONFIG.PHYSICS;
            const p = this.localPlayer;

            // Input handling
            const moveInput = this.input.getMovementVector();
            p.velocity.x += moveInput.x * cfg.MOVE_SPEED;
            p.velocity.z += moveInput.z * cfg.MOVE_SPEED;
            p.velocity.x *= cfg.FRICTION;
            p.velocity.z *= cfg.FRICTION;

            // Gravity & Jumping
            p.velocity.y -= cfg.GRAVITY;
            if (p.velocity.y < cfg.TERMINAL_VELOCITY) p.velocity.y = cfg.TERMINAL_VELOCITY;
            if (this.input.keys.space && p.grounded) {
                p.velocity.y = cfg.JUMP_FORCE;
                p.grounded = false;
            }

            // Bounding Box Collision
            const pBox = new THREE.Box3();
            pBox.min.set(p.position.x - cfg.PLAYER_SIZE.w / 2, p.position.y, p.position.z - cfg.PLAYER_SIZE.d / 2);
            pBox.max.set(p.position.x + cfg.PLAYER_SIZE.w / 2, p.position.y + cfg.PLAYER_SIZE.h, p.position.z + cfg.PLAYER_SIZE.d / 2);

            const collision = this.world.resolveCollisions(pBox, p.velocity);
            p.velocity.copy(collision.velocity);
            p.grounded = collision.grounded;

            p.position.add(p.velocity);

            // Out of bounds / Respawn check
            if (p.position.y < -25) {
                p.position.set(0, 8, 0);
                p.velocity.set(0, 0, 0);
            }

            // Update Avatar Transform & Animations
            p.avatar.root.position.copy(p.position);
            AvatarBuilder.updateAnimation(p.avatar, p.velocity, p.grounded, dt);

            // Camera Tracking Follow
            const targetCamPos = new THREE.Vector3(p.position.x, p.position.y + 4, p.position.z + 10);
            this.camera.position.lerp(targetCamPos, 0.15);
            this.camera.lookAt(p.position.x, p.position.y + 1, p.position.z);

            // Throttled Network Sync Update
            if (Math.random() < 0.25) {
                set(this.playerRef, {
                    x: p.position.x, y: p.position.y, z: p.position.z,
                    vx: p.velocity.x, vy: p.velocity.y, vz: p.velocity.z,
                    grounded: p.grounded, mode: this.currentMode, name: this.playerName
                });
            }
        }

        // Interpolate Remote Players
        Object.values(this.remotePlayers).forEach(remote => {
            remote.avatar.root.position.lerp(remote.targetPos, 0.25);
            AvatarBuilder.updateAnimation(remote.avatar, remote.targetVel, remote.grounded, dt);
        });

        // Render Scene
        this.renderer.render(this.scene, this.camera);

        // Update HUD Stats Counter
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 500 && this.state === 'PLAYING') {
            const currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            this.ui.updateStats(currentFps, this.currentMode, this.localPlayer.position);
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Initialize Application Engine Bootstrap
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new AppEngine();
});