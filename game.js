// ==========================================
// SLOPBLOCKS - GAME.JS ENGINE CORE
// ==========================================

let scene, camera, renderer, player;
let blocks = [];
let keys = { w: false, a: false, s: false, d: false, space: false };
let clock = new THREE.Clock();
let isPlaying = false;

// Roblox Orbit Camera System (Right Click Drag)
let isRightMouseDown = false;
let mouseX = 0, mouseY = 0;
let cameraAngleX = 0;   // Yaw rotation
let cameraAngleY = 0.5; // Pitch elevation
let cameraDistance = 10;

// --- AVATAR BUILDER (ROBLOX STYLE) ---
function createAvatar(colorHex, name) {
    const root = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: colorHex });

    // Torso Block
    const torsoGeo = new THREE.BoxGeometry(0.9, 1.1, 0.5);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.1;
    root.add(torso);

    // Head Block
    const headGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 0.95;

    // Face Texture Generation
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 64; 
    faceCanvas.height = 64;
    const ctx = faceCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#000000';
    ctx.fillRect(14, 18, 9, 9);  // Left Eye
    ctx.fillRect(41, 18, 9, 9);  // Right Eye
    ctx.fillRect(20, 44, 24, 6); // Mouth
    
    const faceMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(faceCanvas) });
    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), faceMat);
    facePlane.position.set(0, 0, 0.36);
    head.add(facePlane);
    torso.add(head);

    // Limbs Pivots
    const laPivot = new THREE.Group(); laPivot.position.set(-0.6, 0.4, 0); torso.add(laPivot);
    const raPivot = new THREE.Group(); raPivot.position.set(0.6, 0.4, 0); torso.add(raPivot);
    const llPivot = new THREE.Group(); llPivot.position.set(-0.25, -0.55, 0); torso.add(llPivot);
    const rlPivot = new THREE.Group(); rlPivot.position.set(0.25, -0.55, 0); torso.add(rlPivot);

    const armGeo = new THREE.BoxGeometry(0.28, 0.85, 0.28);
    const legGeo = new THREE.BoxGeometry(0.32, 0.95, 0.32);

    const armMesh1 = new THREE.Mesh(armGeo, mat); armMesh1.position.y = -0.35; laPivot.add(armMesh1);
    const armMesh2 = new THREE.Mesh(armGeo, mat); armMesh2.position.y = -0.35; raPivot.add(armMesh2);
    const legMesh1 = new THREE.Mesh(legGeo, mat); legMesh1.position.y = -0.4; llPivot.add(legMesh1);
    const legMesh2 = new THREE.Mesh(legGeo, mat); legMesh2.position.y = -0.4; rlPivot.add(legMesh2);

    // Nametag Sprite
    const tagCanvas = document.createElement('canvas');
    tagCanvas.width = 256; 
    tagCanvas.height = 64;
    const tCtx = tagCanvas.getContext('2d');
    tCtx.font = 'bold 34px Arial'; 
    tCtx.fillStyle = '#ffffff'; 
    tCtx.textAlign = 'center';
    tCtx.lineWidth = 4; 
    tCtx.strokeStyle = '#000000';
    tCtx.strokeText(name, 128, 40); 
    tCtx.fillText(name, 128, 40);
    const nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tagCanvas) }));
    nameTag.scale.set(3, 0.75, 1);
    nameTag.position.y = 2.6;
    root.add(nameTag);

    return { root, torso, la: laPivot, ra: raPivot, ll: llPivot, rl: rlPivot, walkTimer: 0 };
}

// --- AVATAR ANIMATION CONTROLLER ---
function animateAvatar(avatar, velocity, isGrounded, dt) {
    const speed = Math.sqrt(velocity.x**2 + velocity.z**2);
    if (!isGrounded) {
        avatar.la.rotation.x = -1.2; 
        avatar.ra.rotation.x = -1.2;
        avatar.ll.rotation.x = -0.4; 
        avatar.rl.rotation.x = 0.4;
    } else if (speed > 0.01) {
        avatar.walkTimer += speed * dt * 70;
        const swing = Math.sin(avatar.walkTimer) * 1.0;
        avatar.la.rotation.x = swing; 
        avatar.ra.rotation.x = -swing;
        avatar.ll.rotation.x = -swing; 
        avatar.rl.rotation.x = swing;
    } else {
        avatar.walkTimer = 0;
        avatar.la.rotation.x *= 0.8; 
        avatar.ra.rotation.x *= 0.8;
        avatar.ll.rotation.x *= 0.8; 
        avatar.rl.rotation.x *= 0.8;
    }
    avatar.torso.rotation.z = -velocity.x * 2.0;
    avatar.torso.rotation.x = velocity.z * 2.0;
}

// --- INITIALIZATION ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(20, 50, 20);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Event Listeners
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    window.addEventListener('resize', onWindowResize);

    // Mouse Right-Click Dragging Camera Orbit
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Menu Buttons
    document.getElementById('btn-obby').addEventListener('click', startGame);
    document.getElementById('btn-quit').addEventListener('click', quitGame);

    loop();
}

function handleKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') keys.w = isDown;
    if (k === 'a' || k === 'arrowleft') keys.a = isDown;
    if (k === 's' || k === 'arrowdown') keys.s = isDown;
    if (k === 'd' || k === 'arrowright') keys.d = isDown;
    if (k === ' ') keys.space = isDown;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseDown(e) {
    if (e.button === 2) { // Right Click
        isRightMouseDown = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
}

function onMouseUp(e) {
    if (e.button === 2) {
        isRightMouseDown = false;
    }
}

function onMouseMove(e) {
    if (!isRightMouseDown || !isPlaying) return;

    const deltaX = e.clientX - mouseX;
    const deltaY = e.clientY - mouseY;

    cameraAngleX -= deltaX * 0.005;
    cameraAngleY -= deltaY * 0.005;
    cameraAngleY = Math.max(0.1, Math.min(1.5, cameraAngleY));

    mouseX = e.clientX;
    mouseY = e.clientY;
}

// --- MAP BUILDER ---
function addBlock(x, y, z, w, h, d, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    mesh.updateMatrixWorld();
    blocks.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
}

function buildObby() {
    addBlock(0, 0, 0, 10, 1, 10, 0x44aa44); // Start platform
    for (let i = 1; i < 30; i++) {
        addBlock(0, i * 0.4, -i * 4.5, 3, 0.5, 3, 0xff9900);
    }
}

// --- GAME STATE ---
function startGame() {
    const name = document.getElementById('playerName').value.trim();
    if (name.length < 3) {
        document.getElementById('error-msg').innerText = "Name needs 3+ characters!";
        return;
    }

    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';

    buildObby();

    player = {
        avatar: createAvatar(0x00aaff, name),
        pos: new THREE.Vector3(0, 4, 0),
        vel: new THREE.Vector3(0, 0, 0),
        grounded: false
    };
    scene.add(player.avatar.root);
    isPlaying = true;
}

function quitGame() {
    isPlaying = false;
    if (player) {
        scene.remove(player.avatar.root);
        player = null;
    }
    blocks.forEach(b => scene.remove(b.mesh));
    blocks = [];
    document.getElementById('hud').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
}

// --- MAIN LOOP ---
function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();

    if (isPlaying && player) {
        const moveSpeed = 0.07;

        // Camera-relative directions
        const forwardDir = new THREE.Vector3(Math.sin(cameraAngleX), 0, Math.cos(cameraAngleX)).normalize();
        const rightDir = new THREE.Vector3(Math.cos(cameraAngleX), 0, -Math.sin(cameraAngleX)).normalize();

        let ix = 0, iz = 0;
        if (keys.w) iz += 1;
        if (keys.s) iz -= 1;
        if (keys.a) ix -= 1;
        if (keys.d) ix += 1;

        if (ix !== 0 || iz !== 0) {
            const moveVec = new THREE.Vector3();
            moveVec.addScaledVector(forwardDir, iz);
            moveVec.addScaledVector(rightDir, ix);
            moveVec.normalize();

            player.vel.x += moveVec.x * moveSpeed;
            player.vel.z += moveVec.z * moveSpeed;

            player.avatar.root.rotation.y = Math.atan2(moveVec.x, moveVec.z);
        }

        player.vel.x *= 0.8;
        player.vel.z *= 0.8;
        player.vel.y -= 0.025; // Gravity

        if (keys.space && player.grounded) {
            player.vel.y = 0.38;
            player.grounded = false;
        }

        // Collision Box
        const pBox = new THREE.Box3();
        pBox.min.set(player.pos.x - 0.4, player.pos.y, player.pos.z - 0.4);
        pBox.max.set(player.pos.x + 0.4, player.pos.y + 2.0, player.pos.z + 0.4);

        player.grounded = false;

        const testY = pBox.clone().translate(new THREE.Vector3(0, player.vel.y, 0));
        for (let b of blocks) {
            if (testY.intersectsBox(b.box)) {
                if (player.vel.y < 0) { 
                    player.vel.y = (b.box.max.y - pBox.min.y) + 0.001; 
                    player.grounded = true; 
                } else if (player.vel.y > 0) { 
                    player.vel.y = (b.box.min.y - pBox.max.y) - 0.001; 
                }
                break;
            }
        }
        pBox.translate(new THREE.Vector3(0, player.vel.y, 0));
        pBox.translate(new THREE.Vector3(player.vel.x, 0, 0));
        pBox.translate(new THREE.Vector3(0, 0, player.vel.z));

        player.pos.add(player.vel);

        if (player.pos.y < -20) {
            player.pos.set(0, 5, 0);
            player.vel.set(0, 0, 0);
        }

        player.avatar.root.position.copy(player.pos);
        animateAvatar(player.avatar, player.vel, player.grounded, dt);

        // Update Orbit Camera Position
        const camX = player.pos.x + cameraDistance * Math.sin(cameraAngleX) * Math.cos(cameraAngleY);
        const camY = player.pos.y + 1 + cameraDistance * Math.sin(cameraAngleY);
        const camZ = player.pos.z + cameraDistance * Math.cos(cameraAngleX) * Math.cos(cameraAngleY);

        camera.position.set(camX, camY, camZ);
        camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);

        document.getElementById('stat-pos').innerText = `Pos: ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}`;
        document.getElementById('stat-fps').innerText = `FPS: ${Math.round(1/dt)}`;
    }

    renderer.render(scene, camera);
}

window.onload = init;