/* 方块工坊 - 3D 正方体组合与三视图 */
(function () {
  'use strict';

  // ================= 基础 =================
  var BASE_COLOR = 0x4c9aff;
  var SEL_COLOR = 0xffb84d;
  var EDGE_COLOR = 0x173a5e;
  var GROUND_AREA = 9;

  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8eef5);

  var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);

  // 光照
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd2e4, 0.85));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(10, 16, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -14;
  dirLight.shadow.camera.right = 14;
  dirLight.shadow.camera.top = 14;
  dirLight.shadow.camera.bottom = -14;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 50;
  scene.add(dirLight);

  // 地面与网格
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0xf7fafc, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  var grid = new THREE.GridHelper(40, 40, 0x9fb6cc, 0xd3dfe9);
  grid.position.y = 0.005;
  scene.add(grid);

  // ================= 相机轨道 =================
  var orbit = {
    target: new THREE.Vector3(0, 1.5, 0),
    theta: 0.85,
    phi: 1.05,
    radius: 22,
    minPhi: 0.08,
    maxPhi: 1.48,
    minR: 5,
    maxR: 60
  };

  function applyCamera() {
    var sp = Math.sin(orbit.phi);
    camera.position.set(
      orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
    camera.updateMatrixWorld(true);
  }
  applyCamera();

  function resetCamera() {
    orbit.target.set(0, 1.5, 0);
    orbit.theta = 0.85;
    orbit.phi = 1.05;
    orbit.radius = 22;
  }

  // ================= 方块管理 =================
  var sharedBox = new THREE.BoxGeometry(1, 1, 1);
  var sharedBoxEdges = new THREE.EdgesGeometry(sharedBox);
  var cubes = [];
  var cubeById = new Map();
  var meshToCube = new Map();
  var nextCubeId = 1;

  function makeCube(cell) {
    // 6 个面各自一个材质：0=+x 1=-x 2=+y 3=-y 4=+z 5=-z（用于单独点亮某个方向的面）
    var mats = [];
    for (var mi = 0; mi < 6; mi++) {
      mats.push(new THREE.MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.4, metalness: 0.05 }));
    }
    var mesh = new THREE.Mesh(sharedBox, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    var edges = new THREE.LineSegments(sharedBoxEdges, new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.6 }));
    mesh.add(edges);
    var cube = {
      id: nextCubeId++,
      cell: new THREE.Vector3(cell.x, cell.y, cell.z),
      mesh: mesh, mat: mats[0], mats: mats, edges: edges,
      groupId: 0
    };
    cubeById.set(cube.id, cube);
    meshToCube.set(mesh, cube);
    cubes.push(cube);
    setCubePos(cube);
    scene.add(mesh);
    return cube;
  }

  function setCubePos(cube) {
    cube.mesh.position.set(cube.cell.x + 0.5, cube.cell.y + 0.5, cube.cell.z + 0.5);
  }

  function removeCube(cube) {
    scene.remove(cube.mesh);
    meshToCube.delete(cube.mesh);
    cubeById.delete(cube.id);
    var i = cubes.indexOf(cube);
    if (i >= 0) cubes.splice(i, 1);
  }

  // ================= 连通块分组（并查集） =================
  function rebuildGroups() {
    var par = new Map();
    function find(a) {
      while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); }
      return a;
    }
    var byKey = new Map();
    cubes.forEach(function (c) { par.set(c.id, c.id); byKey.set(c.cell.x + ',' + c.cell.y + ',' + c.cell.z, c); });
    var dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (var i = 0; i < cubes.length; i++) {
      var c = cubes[i];
      for (var d = 0; d < dirs.length; d++) {
        var n = byKey.get((c.cell.x + dirs[d][0]) + ',' + (c.cell.y + dirs[d][1]) + ',' + (c.cell.z + dirs[d][2]));
        if (n) {
          var ra = find(c.id), rb = find(n.id);
          if (ra !== rb) par.set(ra, rb);
        }
      }
    }
    var gidMap = new Map();
    var nextG = 1;
    for (var j = 0; j < cubes.length; j++) {
      var cc = cubes[j];
      var r = find(cc.id);
      if (!gidMap.has(r)) gidMap.set(r, nextG++);
      cc.groupId = gidMap.get(r);
    }
    refreshSelection();
    updateStats();
  }

  // ================= 选中 =================
  var selectedIds = new Set();
  var selectedGroupId = 0;

  function selectGroup(groupId) {
    selectedIds.clear();
    selectedGroupId = groupId;
    if (groupId) {
      for (var i = 0; i < cubes.length; i++) {
        if (cubes[i].groupId === groupId) selectedIds.add(cubes[i].id);
      }
    }
    applyHighlight();
    updateStats();
    markViewsDirty();
  }

  function refreshSelection() {
    if (selectedIds.size === 0) return;
    var it = selectedIds.values().next();
    var rep = cubeById.get(it.value);
    if (!rep) {
      selectedIds.clear();
      selectedGroupId = 0;
      applyHighlight();
      updateStats();
      return;
    }
    selectGroup(rep.groupId);
  }

  function applyHighlight() {
    for (var i = 0; i < cubes.length; i++) {
      var c = cubes[i];
      var sel = selectedIds.has(c.id);
      for (var m = 0; m < 6; m++) {
        c.mats[m].color.set(sel ? SEL_COLOR : BASE_COLOR);
        if (sel) { c.mats[m].emissive.setHex(0x7a3d00); c.mats[m].emissiveIntensity = 0.25; }
        else { c.mats[m].emissive.setHex(0x000000); c.mats[m].emissiveIntensity = 0; }
      }
    }
  }

  // ================= 统计 =================
  function updateStats() {
    var gs = new Set();
    for (var i = 0; i < cubes.length; i++) gs.add(cubes[i].groupId);
    document.getElementById('stat-cubes').textContent = cubes.length;
    document.getElementById('stat-groups').textContent = gs.size;
    document.getElementById('stat-selected').textContent = selectedIds.size ? selectedIds.size : '—';
  }

  // ================= 生成 =================
  function stackHeight(x, z, excludeId) {
    var h = 0;
    for (var i = 0; i < cubes.length; i++) {
      var c = cubes[i];
      if (c.id === excludeId) continue;
      if (c.cell.x === x && c.cell.z === z) h = Math.max(h, c.cell.y + 1);
    }
    return h;
  }

  function genFree(n) {
    for (var i = 0; i < n; i++) {
      var x = Math.floor(Math.random() * 7) - 3;
      var z = Math.floor(Math.random() * 7) - 3;
      var y = stackHeight(x, z, -1);
      makeCube(new THREE.Vector3(x, y, z));
    }
    rebuildGroups();
    markViewsDirty();
  }

  function genBigCube(n) {
    var off = -Math.floor(n / 2);
    for (var x = 0; x < n; x++) {
      for (var y = 0; y < n; y++) {
        for (var z = 0; z < n; z++) {
          makeCube(new THREE.Vector3(off + x, y, off + z));
        }
      }
    }
    rebuildGroups();
    markViewsDirty();
  }

  function clearAll() {
    while (cubes.length) removeCube(cubes[cubes.length - 1]);
    selectedIds.clear();
    selectedGroupId = 0;
    rebuildGroups();
    markViewsDirty();
  }

  function removeSelected() {
    var ids = [];
    selectedIds.forEach(function (id) { ids.push(id); });
    for (var i = 0; i < ids.length; i++) {
      var c = cubeById.get(ids[i]);
      if (c) removeCube(c);
    }
    selectedIds.clear();
    selectedGroupId = 0;
    rebuildGroups();
    markViewsDirty();
  }

  // ================= 三视图（2D Canvas 正交投影） =================
  var VIEWS = {
    front: { label: '主视图', u: 'x', v: 'y', w: 'z', dir: 1, anchor: { fx: 0.5, fy: 0.80 } },
    top: { label: '俯视图', u: 'x', v: 'z', w: 'y', dir: 1, anchor: { fx: 0.5, fy: 0.58 } },
    left: { label: '左视图', u: 'z', v: 'y', w: 'x', dir: -1, anchor: { fx: 0.70, fy: 0.80 } }
  };
  var VIEW_NORMAL = {
    front: new THREE.Vector3(0, 0, 1),
    top: new THREE.Vector3(0, 1, 0),
    left: new THREE.Vector3(-1, 0, 0)
  };
  var VIEW_UP = {
    front: new THREE.Vector3(0, 1, 0),
    top: new THREE.Vector3(0, 0, -1),
    left: new THREE.Vector3(0, 1, 0)
  };
  var viewBBox = null;
  var viewPanels = {};
  var viewDirty = false;

  function getViewTargetCubes() {
    if (selectedIds.size) {
      var arr = [];
      for (var i = 0; i < cubes.length; i++) {
        if (selectedIds.has(cubes[i].id)) arr.push(cubes[i]);
      }
      if (arr.length) return arr;
    }
    return cubes;
  }

  function computeViewBBox(target) {
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (var i = 0; i < target.length; i++) {
      var p = target[i].mesh.position;
      if (p.x - 0.5 < minX) minX = p.x - 0.5;
      if (p.x + 0.5 > maxX) maxX = p.x + 0.5;
      if (p.y - 0.5 < minY) minY = p.y - 0.5;
      if (p.y + 0.5 > maxY) maxY = p.y + 0.5;
      if (p.z - 0.5 < minZ) minZ = p.z - 0.5;
      if (p.z + 0.5 > maxZ) maxZ = p.z + 0.5;
    }
    return { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ) };
  }

  // 绘制某个视图到 2D canvas
  function drawView(key) {
    var p = viewPanels[key];
    if (!p) return;
    var target = getViewTargetCubes();
    if (!target.length) {
      if (p.canvas) {
        var _c0 = p.canvas.getContext('2d');
        _c0.clearRect(0, 0, p.canvas.width, p.canvas.height);
        p.texture.needsUpdate = true;
      }
      return;
    }
    var b = computeViewBBox(target);
    viewBBox = b;
    var def = VIEWS[key];
    var pad = 0.7;
    var wWorld, hWorld, left, topW, bottomW;
    var pyUp = true; // 屏幕 y 随 v 增大而减小（顶对齐）
    if (key === 'front') { left = b.min.x - pad; topW = b.max.y + pad; wWorld = (b.max.x - b.min.x) + 2 * pad; hWorld = (b.max.y - b.min.y) + 2 * pad; }
    else if (key === 'top') { left = b.min.x - pad; bottomW = b.min.z - pad; wWorld = (b.max.x - b.min.x) + 2 * pad; hWorld = (b.max.z - b.min.z) + 2 * pad; pyUp = false; }
    else { left = b.min.z - pad; topW = b.max.y + pad; wWorld = (b.max.z - b.min.z) + 2 * pad; hWorld = (b.max.y - b.min.y) + 2 * pad; }
    var maxDim = Math.max(wWorld, hWorld);
    var CW = Math.max(64, Math.round(512 * wWorld / maxDim));
    var CH = Math.max(64, Math.round(512 * hWorld / maxDim));
    if (p.canvas.width !== CW || p.canvas.height !== CH) {
      p.canvas.width = CW;
      p.canvas.height = CH;
    }
    var ctx = p.canvas.getContext('2d');
    ctx.clearRect(0, 0, CW, CH); // 透明背景，只画几个面组成的图形

    // 深度排序（画家算法）：从远到近
    var order = target.slice().sort(function (a, cc) {
      var da = a.mesh.position[def.w] * def.dir;
      var db = cc.mesh.position[def.w] * def.dir;
      return da - db;
    });

    function toPx(wu, wv) {
      var px = (wu - left) / wWorld * CW;
      var py = pyUp ? (topW - wv) / hWorld * CH : (wv - bottomW) / hWorld * CH;
      return [px, py];
    }

    // 先填充后描边，避免描边被遮挡；分两遍
    ctx.lineWidth = Math.max(1.5, 512 / maxDim * 0.06);
    ctx.strokeStyle = '#24344a';
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < order.length; i++) {
        var pos = order[i].mesh.position;
        var u0 = pos[def.u] - 0.5, u1 = pos[def.u] + 0.5;
        var v0 = pos[def.v] - 0.5, v1 = pos[def.v] + 0.5;
        var a = toPx(u0, v1);
        var bb = toPx(u1, v0);
        if (pass === 0) {
          ctx.fillStyle = '#' + (selectedIds.has(order[i].id) ? SEL_COLOR : BASE_COLOR).toString(16).padStart(6, '0');
          ctx.fillRect(a[0], a[1], bb[0] - a[0], bb[1] - a[1]);
        } else {
          ctx.strokeRect(a[0], a[1], bb[0] - a[0], bb[1] - a[1]);
        }
      }
    }
    p.texture.needsUpdate = true;

    // 面板世界尺寸 = 对应面的大小（1:1，大小和几何体面一样）
    var faceW, faceH;
    if (key === 'front') { faceW = b.max.x - b.min.x + 1; faceH = b.max.y - b.min.y + 1; }
    else if (key === 'top') { faceW = b.max.x - b.min.x + 1; faceH = b.max.z - b.min.z + 1; }
    else { faceW = b.max.z - b.min.z + 1; faceH = b.max.y - b.min.y + 1; }
    p.mesh.scale.set(faceW, faceH, 1);
  }

  function refreshViewContent() {
    var keys = Object.keys(viewPanels);
    for (var i = 0; i < keys.length; i++) drawView(keys[i]);
  }

  function createViewPanel(key) {
    var def = VIEWS[key];
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var texture = new THREE.CanvasTexture(canvas);
    var mat = new THREE.MeshBasicMaterial({ map: texture, color: 0xffd43b, transparent: true });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    scene.add(mesh);
    var label = document.createElement('div');
    label.className = 'view-label';
    label.textContent = def.label;
    document.body.appendChild(label);
    viewPanels[key] = { canvas: canvas, texture: texture, mat: mat, mesh: mesh, label: label, tween: null, static: false, out: false };
    drawView(key);
    mesh.visible = false; // 先隐藏，等镜头转到对应视角再显示
  }

  function removeViewPanel(key) {
    var p = viewPanels[key];
    if (!p) return;
    scene.remove(p.mesh);
    if (p.texture) p.texture.dispose();
    if (p.label && p.label.parentNode) p.label.parentNode.removeChild(p.label);
    delete viewPanels[key];
  }

  function viewStartPose(key) {
    var b = viewBBox;
    var cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
    var eps = 0.04;
    var pos;
    if (key === 'front') pos = new THREE.Vector3(cx, cy, b.max.z + eps);
    else if (key === 'top') pos = new THREE.Vector3(cx, b.max.y + eps, cz);
    else pos = new THREE.Vector3(b.min.x - eps, cy, cz);
    var normal = VIEW_NORMAL[key].clone();
    var up = VIEW_UP[key].clone();
    var dummy = new THREE.Object3D();
    dummy.position.copy(pos);
    dummy.up.copy(up);
    dummy.lookAt(pos.clone().add(normal));
    return { pos: pos, quat: dummy.quaternion.clone() };
  }

  // 面板的最终落点：固定在几何体周围的世界坐标（永远在地面以上、几何体以外）
  // 三个视图面板：贴在几何体右侧、与几何体间隔 1 个单元格，自下而上堆叠
  function viewSlotPos(key) {
    var b = viewBBox;
    if (!b) return null;
    var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); // 屏幕右方向（世界）
    var center = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    // 几何体沿屏幕右方向的外缘距离
    var ext = -Infinity;
    var corners = [
      new THREE.Vector3(b.min.x, b.min.y, b.min.z), new THREE.Vector3(b.max.x, b.min.y, b.min.z),
      new THREE.Vector3(b.min.x, b.max.y, b.min.z), new THREE.Vector3(b.max.x, b.max.y, b.min.z),
      new THREE.Vector3(b.min.x, b.min.y, b.max.z), new THREE.Vector3(b.max.x, b.min.y, b.max.z),
      new THREE.Vector3(b.min.x, b.max.y, b.max.z), new THREE.Vector3(b.max.x, b.max.y, b.max.z)
    ];
    for (var ci = 0; ci < 8; ci++) {
      var d = corners[ci].dot(right) - center.dot(right);
      if (d > ext) ext = d;
    }
    var faceW, faceH;
    if (key === 'front') { faceW = b.max.x - b.min.x + 1; faceH = b.max.y - b.min.y + 1; }
    else if (key === 'top') { faceW = b.max.x - b.min.x + 1; faceH = b.max.z - b.min.z + 1; }
    else { faceW = b.max.z - b.min.z + 1; faceH = b.max.y - b.min.y + 1; }
    var hh = Math.max(faceH, 2);
    var step = hh + 0.6;
    var y0 = hh / 2 + 0.3;
    var idx = { front: 2, top: 1, left: 0 }[key]; // 主视图上、俯视图中、左视图下
    // 右侧偏移 = 几何体外缘 + 1 个单元格 + 面板半宽
    var pos = center.clone().addScaledVector(right, ext + 1 + faceW / 2);
    pos.y = y0 + idx * step;
    return { pos: pos, quat: faceCameraQuat(pos) };
  }

  function viewAnchorPos(key) {
    var def = VIEWS[key];
    var ndcX = def.anchor.fx * 2 - 1;
    var ndcY = -(def.anchor.fy * 2 - 1);
    var dist = orbit.radius * 0.55;
    var v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
    var dir = v.sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(dir, dist);
  }

  function faceCameraQuat(pos) {
    var dir = camera.position.clone().sub(pos).normalize();
    var up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(up)) > 0.97) up.set(0, 0, -1); // 相机几乎垂直时换一个上方向，避免万向锁
    var dummy = new THREE.Object3D();
    dummy.position.copy(pos);
    dummy.up.copy(up);
    dummy.lookAt(camera.position);
    return dummy.quaternion.clone();
  }

  // ---- 三视图展示流程：镜头转到对应视角 → 对应面变黄 → 该面平移移出 ----
  var VIEW_ANGLES = {
    front: { theta: 0, phi: Math.PI / 2 },        // 正前方
    top: { theta: 0, phi: 0.12 },                 // 正上方
    left: { theta: -Math.PI / 2, phi: Math.PI / 2 } // 正左方
  };

  // ---- 相机平滑转到目标视角 ----
  var camTween = null;
  function animateCameraTo(theta, phi, radius, target, dur) {
    var toTheta = theta;
    while (toTheta - orbit.theta > Math.PI) toTheta -= Math.PI * 2;
    while (toTheta - orbit.theta < -Math.PI) toTheta += Math.PI * 2;
    camTween = {
      t0: performance.now(), dur: dur || 800,
      from: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, tx: orbit.target.x, ty: orbit.target.y, tz: orbit.target.z },
      to: { theta: toTheta, phi: phi, radius: radius, tx: target.x, ty: target.y, tz: target.z }
    };
  }
  function updateCamTween(now) {
    if (!camTween) return;
    var e = Math.min(1, (now - camTween.t0) / camTween.dur);
    var k = easeInOutCubic(e);
    var f = camTween.from, to = camTween.to;
    orbit.theta = f.theta + (to.theta - f.theta) * k;
    orbit.phi = f.phi + (to.phi - f.phi) * k;
    orbit.radius = f.radius + (to.radius - f.radius) * k;
    orbit.target.set(f.tx + (to.tx - f.tx) * k, f.ty + (to.ty - f.ty) * k, f.tz + (to.tz - f.tz) * k);
    if (e >= 1) camTween = null;
  }

  // ---- 视角流程状态机 ----
  var viewFlows = {};

  // 面闪烁：让几何体上“对应方向的面”变黄（不显示任何画框）
  var VIEW_FACE_IDX = { front: 4, top: 2, left: 1 }; // +z / +y / -x
  var activeFlashes = { front: false, top: false, left: false };
  function applyFaceHighlights() {
    var pulse = 0.35 + 0.35 * Math.sin(performance.now() / 180);
    for (var i = 0; i < cubes.length; i++) {
      var c = cubes[i];
      var sel = selectedIds.has(c.id);
      for (var idx = 0; idx < 6; idx++) {
        var flashing = (activeFlashes.front && idx === 4) || (activeFlashes.top && idx === 2) || (activeFlashes.left && idx === 1);
        var m = c.mats[idx];
        if (flashing) {
          m.color.set(0xffd43b);
          m.emissive.setHex(0xffa500);
          m.emissiveIntensity = pulse;
        } else {
          m.color.set(sel ? SEL_COLOR : BASE_COLOR);
          if (sel) { m.emissive.setHex(0x7a3d00); m.emissiveIntensity = 0.25; }
          else { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
        }
      }
    }
  }

  function enableView(key) {
    if (viewPanels[key]) return;
    var target = getViewTargetCubes();
    if (!target.length) {
      document.getElementById('view-' + key).checked = false;
      return;
    }
    var b = computeViewBBox(target);
    viewBBox = b;
    var cx2 = (b.min.x + b.max.x) / 2, cy2 = (b.min.y + b.max.y) / 2, cz2 = (b.min.z + b.max.z) / 2;
    var diag = new THREE.Vector3(cx2, cy2, cz2).distanceTo(new THREE.Vector3(b.min.x, b.min.y, b.min.z));
    // 镜头目标抬高到“几何体 + 右侧面板堆叠”的中间，保证都能看到
    var maxFaceH = Math.max(b.max.y - b.min.y, b.max.z - b.min.z) + 1;
    var step = Math.max(maxFaceH, 2) + 0.6;
    var topY = (Math.max(maxFaceH, 2) / 2 + 0.3) + 2 * step + Math.max(maxFaceH, 2) / 2;
    var frameY = (0 + topY) / 2;
    var frameH = topY + 2;
    var center = new THREE.Vector3(cx2, frameY, cz2);
    var radius = Math.max(24, diag * 4.0, frameH * 1.25);
    var ang = VIEW_ANGLES[key];
    animateCameraTo(ang.theta, ang.phi, radius, center, 2500); // 几何体正对对应视角
    createViewPanel(key); // 创建面板（黄色、放在面上、先隐藏）
    viewFlows[key] = { stage: 'camera', key: key, t0: performance.now(), camDur: 2500, hlDur: 1400, moveDur: 3000 };
  }

  function disableView(key) {
    var p = viewPanels[key];
    if (!p) return;
    if (viewFlows[key]) {
      activeFlashes[key] = false;
      delete viewFlows[key];
      removeViewPanel(key);
      return;
    }
    var start = viewStartPose(key);
    viewFlows[key] = {
      stage: 'back', key: key, t0: performance.now(), dur: 2400,
      fromPos: p.mesh.position.clone(), fromQuat: p.mesh.quaternion.clone(),
      toPos: start.pos, toQuat: start.quat
    };
    p.static = false;
  }

  function updateViewFlows(now) {
    var keys = Object.keys(viewFlows);
    for (var i = 0; i < keys.length; i++) {
      var f = viewFlows[keys[i]];
      var p = viewPanels[f.key];
      if (!p) continue;
      var n = VIEW_NORMAL[f.key];
      if (f.stage === 'camera') {
        if (now - f.t0 >= f.camDur) {
          // 镜头到位 → 几何体上对应的那几个面开始闪黄（不显示任何面板/画框）
          f.stage = 'highlight';
          f.t0 = now;
          f.baseScale = p.mesh.scale.clone();
          activeFlashes[f.key] = true;
        }
      } else if (f.stage === 'highlight') {
        var tH = Math.min(1, (now - f.t0) / f.hlDur);
        if (tH >= 1) {
          activeFlashes[f.key] = false; // 闪烁结束，面恢复原色
          f.stage = 'move';
          f.t0 = now;
          var sp = viewStartPose(f.key);
          p.mesh.position.copy(sp.pos);
          p.mesh.quaternion.copy(sp.quat);
          p.mesh.visible = true;  // 平移时才显示面板
          p.mat.opacity = 1;
          p.mat.color.set(0xffd43b); // 从黄色开始，随移动变白露出内容
          f.fromPos = sp.pos.clone();
          f.fromQuat = sp.quat.clone();
        }
      } else if (f.stage === 'move') {
        var tM = Math.min(1, (now - f.t0) / f.moveDur);
        var eM = easeInOutCubic(tM);
        var slotNow = viewSlotPos(f.key); // 每帧取屏幕右侧落点（统一向右平移）
        p.mesh.position.copy(f.fromPos).lerp(slotNow.pos, eM);
        p.mesh.quaternion.copy(f.fromQuat).slerp(slotNow.quat, eM); // 边平移边转向相机
        // 前半段保持放大，后半段（生成视图）缩回正常大小
        var growK;
        if (tM < 0.65) growK = 0.28;
        else growK = 0.28 * (1 - (tM - 0.65) / 0.35);
        p.mesh.scale.copy(f.baseScale).multiplyScalar(1 + growK);
        p.mat.color.setHex(Math.round(0xffd43b + (0xffffff - 0xffd43b) * eM)); // 黄→白，露出视图内容
        if (tM >= 1) {
          p.mat.color.set(0xffffff);
          p.mesh.scale.copy(f.baseScale); // 确保正常大小
          p.static = true;
          delete viewFlows[f.key];
        }
      } else if (f.stage === 'back') {
        var tB = Math.min(1, (now - f.t0) / f.dur);
        var eB = easeInOutCubic(tB);
        p.mesh.position.copy(f.fromPos).lerp(f.toPos, eB);
        p.mesh.quaternion.copy(f.fromQuat).slerp(f.toQuat, eB);
        p.mat.color.setHex(Math.round(0xffffff + (0xffd43b - 0xffffff) * eB));
        if (tB >= 1) {
          removeViewPanel(f.key);
          delete viewFlows[f.key];
        }
      }
    }
  }

  function updateView(key, now) {
    var p = viewPanels[key];
    if (!p) return;
    if (viewFlows[key]) { p.label.style.display = 'none'; return; }
    if (p.static) {
      var slot = viewSlotPos(key);
      p.mesh.position.copy(slot.pos);
      p.mesh.quaternion.copy(slot.quat);
    }
    var v = p.mesh.position.clone().project(camera);
    if (v.z < 1 && p.mesh.visible) {
      p.label.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
      p.label.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight - 22) + 'px';
      p.label.style.display = 'block';
    } else {
      p.label.style.display = 'none';
    }
  }

  function updateViews(now) {
    if (viewDirty) {
      refreshViewContent();
      viewDirty = false;
    }
    updateViewFlows(now);
    applyFaceHighlights();
    var keys = Object.keys(viewPanels);
    for (var i = 0; i < keys.length; i++) updateView(keys[i], now);
  }

  function markViewsDirty() { viewDirty = true; }

  // ================= 交互 =================
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var mode = 'move';
  var gesture = null;
  var hoveredCube = null;
  var tweens = [];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function getNDC(e) {
    var r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return ndc;
  }

  function pickCube(e) {
    var nd = getNDC(e);
    raycaster.setFromCamera(nd, camera);
    var meshes = [];
    for (var i = 0; i < cubes.length; i++) meshes.push(cubes[i].mesh);
    var hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return meshToCube.get(hits[0].object) || null;
  }

  function rayPlaneY(nd, y) {
    raycaster.setFromCamera(nd, camera);
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    var hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  function setMode(m) {
    mode = m;
    document.getElementById('mode-move').classList.toggle('active', m === 'move');
    document.getElementById('mode-rotate').classList.toggle('active', m === 'rotate');
    canvas.classList.toggle('mode-rotate', m === 'rotate');
  }

  function startOrbit(e) {
    gesture = { type: 'orbit', x: e.clientX, y: e.clientY, moved: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    canvas.classList.add('grabbing');
  }

  function startPan(e) {
    gesture = { type: 'pan', x: e.clientX, y: e.clientY, moved: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    canvas.classList.add('grabbing');
  }

  function startDragCube(cube, e) {
    var nd = getNDC(e);
    var planeY = cube.mesh.position.y;
    gesture = {
      type: 'drag', cube: cube,
      g0: rayPlaneY(nd, planeY),
      orig: cube.cell.clone(),
      moved: 0, startX: e.clientX, startY: e.clientY
    };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    canvas.classList.add('grabbing');
  }

  function startRotateGroup(cube, e) {
    selectGroup(cube.groupId);
    var group = [];
    for (var i = 0; i < cubes.length; i++) {
      if (selectedIds.has(cubes[i].id)) group.push(cubes[i]);
    }
    if (!group.length) { startOrbit(e); return; }
    var min = new THREE.Vector3(Infinity, Infinity, Infinity);
    var max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (var j = 0; j < group.length; j++) {
      var p = group[j].mesh.position;
      min.min(p);
      max.max(p);
    }
    var pivot = min.clone().add(max).multiplyScalar(0.5);
    var entries = [];
    for (var k = 0; k < group.length; k++) {
      entries.push({
        cube: group[k],
        origPos: group[k].mesh.position.clone(),
        origQuat: group[k].mesh.quaternion.clone()
      });
    }
    gesture = {
      type: 'rotate', entries: entries, pivot: pivot,
      angleX: 0, angleY: 0, x: e.clientX, y: e.clientY, moved: 0
    };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    canvas.classList.add('grabbing');
  }

  function applyRotation(g) {
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(g.angleX, g.angleY, 0, 'XYZ'));
    for (var i = 0; i < g.entries.length; i++) {
      var en = g.entries[i];
      en.cube.mesh.position.copy(en.origPos).sub(g.pivot).applyQuaternion(q).add(g.pivot);
      en.cube.mesh.quaternion.copy(en.origQuat).premultiply(q);
    }
  }

  function bakeRotation(g) {
    for (var i = 0; i < g.entries.length; i++) {
      var en = g.entries[i];
      var pos = en.cube.mesh.position;
      en.cube.cell.set(Math.round(pos.x - 0.5), Math.round(pos.y - 0.5), Math.round(pos.z - 0.5));
      en.cube.mesh.quaternion.identity();
      setCubePos(en.cube);
    }
    // 抬升避免低于地面
    var minY = Infinity;
    for (var j = 0; j < g.entries.length; j++) minY = Math.min(minY, g.entries[j].cube.cell.y);
    if (minY < 0) {
      for (var k = 0; k < g.entries.length; k++) {
        g.entries[k].cube.cell.y -= minY;
        setCubePos(g.entries[k].cube);
      }
    }
    rebuildGroups();
    refreshSelection();
    markViewsDirty();
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button === 1 || e.button === 2) { startPan(e); return; }
    if (e.button !== 0) return;
    var cube = pickCube(e);
    if (mode === 'move') {
      if (cube) startDragCube(cube, e);
      else startOrbit(e);
    } else {
      if (cube) startRotateGroup(cube, e);
      else startOrbit(e);
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!gesture) {
      // 悬停高亮
      var hc = pickCube(e);
      if (hc !== hoveredCube) {
        if (hoveredCube) hoveredCube.edges.material.color.set(EDGE_COLOR);
        hoveredCube = hc;
        if (hoveredCube) hoveredCube.edges.material.color.set(0xffe08a);
      }
      canvas.style.cursor = hc ? (mode === 'rotate' ? 'grab' : 'move') : 'default';
      return;
    }
    if (gesture.type === 'orbit') {
      if (camTween) return;
      var dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
      gesture.x = e.clientX; gesture.y = e.clientY;
      gesture.moved += Math.abs(dx) + Math.abs(dy);
      orbit.theta -= dx * 0.0055;
      orbit.phi = clamp(orbit.phi - dy * 0.0055, orbit.minPhi, orbit.maxPhi);
      return;
    }
    if (gesture.type === 'pan') {
      if (camTween) return;
      var pdx = e.clientX - gesture.x, pdy = e.clientY - gesture.y;
      gesture.x = e.clientX; gesture.y = e.clientY;
      gesture.moved += Math.abs(pdx) + Math.abs(pdy);
      var s = orbit.radius * 0.0016;
      var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-pdx * s);
      var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(pdy * s);
      orbit.target.add(right).add(up);
      return;
    }
    if (gesture.type === 'drag') {
      gesture.moved += Math.abs(e.clientX - gesture.startX) + Math.abs(e.clientY - gesture.startY);
      var g = rayPlaneY(getNDC(e), gesture.g0 ? gesture.g0.y : 0.5);
      if (!g || !gesture.g0) return;
      var d = g.clone().sub(gesture.g0);
      var nx = clamp(Math.round(gesture.orig.x + d.x), -GROUND_AREA, GROUND_AREA);
      var nz = clamp(Math.round(gesture.orig.z + d.z), -GROUND_AREA, GROUND_AREA);
      var ny = stackHeight(nx, nz, gesture.cube.id);
      gesture.cube.cell.set(nx, ny, nz);
      setCubePos(gesture.cube);
      rebuildGroups();
      markViewsDirty();
      return;
    }
    if (gesture.type === 'rotate') {
      gesture.moved += Math.abs(e.clientX - gesture.x) + Math.abs(e.clientY - gesture.y);
      gesture.angleY += (e.clientX - gesture.x) * 0.012;
      gesture.angleX += (e.clientY - gesture.y) * 0.012;
      gesture.x = e.clientX; gesture.y = e.clientY;
      applyRotation(gesture);
      markViewsDirty();
      return;
    }
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!gesture) return;
    var g = gesture;
    gesture = null;
    canvas.classList.remove('grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    if (g.type === 'drag') {
      if (g.moved < 5) selectGroup(g.cube.groupId);
      markViewsDirty();
    } else if (g.type === 'rotate') {
      var toX = Math.round(g.angleX / (Math.PI / 2)) * (Math.PI / 2);
      var toY = Math.round(g.angleY / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(toX - g.angleX) > 1e-4 || Math.abs(toY - g.angleY) > 1e-4) {
        tweens.push({
          type: 'rotSnap', t0: performance.now(), dur: 260, g: g,
          fromX: g.angleX, fromY: g.angleY, toX: toX, toY: toY
        });
      } else {
        bakeRotation(g);
      }
    } else if (g.type === 'orbit') {
      if (g.moved < 5) selectGroup(0); // 点击空白处取消选中
    }
  });

  canvas.addEventListener('pointercancel', function () {
    gesture = null;
    canvas.classList.remove('grabbing');
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    orbit.radius = clamp(orbit.radius * (1 + e.deltaY * 0.001), orbit.minR, orbit.maxR);
  }, { passive: false });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('pointerleave', function () {
    if (hoveredCube) { hoveredCube.edges.material.color.set(EDGE_COLOR); hoveredCube = null; }
  });

  // 键盘：Delete 删除选中，1/2 切换模式
  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    } else if (e.key === '1') {
      setMode('move');
    } else if (e.key === '2') {
      setMode('rotate');
    }
  });

  // ================= 更新循环 =================
  function updateTweens(now) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      var t = Math.min(1, (now - tw.t0) / tw.dur);
      var e = easeInOutCubic(t);
      if (tw.type === 'rotSnap') {
        tw.g.angleX = lerp(tw.fromX, tw.toX, e);
        tw.g.angleY = lerp(tw.fromY, tw.toY, e);
        applyRotation(tw.g);
        if (t >= 1) {
          bakeRotation(tw.g);
          tweens.splice(i, 1);
        }
      } else {
        tweens.splice(i, 1);
      }
    }
  }

  function animate(now) {
    requestAnimationFrame(animate);
    updateTweens(now);
    updateCamTween(now);
    applyCamera();
    updateViews(now);
    renderer.render(scene, camera);
  }

  // ================= UI 绑定 =================
  document.getElementById('btn-gen-free').addEventListener('click', function () {
    var n = parseInt(document.getElementById('input-count').value, 10);
    if (!isFinite(n) || n < 1) n = 10;
    n = clamp(n, 1, 200);
    genFree(n);
  });

  var cubeBtns = document.querySelectorAll('[data-cube]');
  for (var bi = 0; bi < cubeBtns.length; bi++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var n = parseInt(btn.getAttribute('data-cube'), 10);
        genBigCube(n);
        var total = n * n * n;
        if (cubes.length >= total) {
          selectGroup(cubes[cubes.length - total].groupId);
        }
      });
    })(cubeBtns[bi]);
  }

  document.getElementById('mode-move').addEventListener('click', function () { setMode('move'); });
  document.getElementById('mode-rotate').addEventListener('click', function () { setMode('rotate'); });
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-del').addEventListener('click', removeSelected);
  document.getElementById('btn-reset').addEventListener('click', resetCamera);
  document.getElementById('btn-panel-toggle').addEventListener('click', function () {
    document.getElementById('panel').classList.toggle('collapsed');
  });

  var viewKeys = ['front', 'top', 'left'];
  for (var vi = 0; vi < viewKeys.length; vi++) {
    (function (key) {
      var cb = document.getElementById('view-' + key);
      cb.addEventListener('change', function () {
        if (cb.checked) { enableView(key); } else { disableView(key); }
      });
    })(viewKeys[vi]);
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ================= 调试 / 测试 API =================
  window.__cubeApp = {
    cubes: function () {
      return cubes.map(function (c) {
        return { id: c.id, cell: [c.cell.x, c.cell.y, c.cell.z], groupId: c.groupId };
      });
    },
    genFree: genFree,
    genBigCube: genBigCube,
    clearAll: clearAll,
    removeSelected: removeSelected,
    selectGroup: selectGroup,
    setMode: setMode,
    selectedCount: function () { return selectedIds.size; },
    screenPosOfCube: function (id) {
      var c = cubeById.get(id);
      if (!c) return null;
      var v = c.mesh.position.clone().project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight
      };
    },
    viewPanels: function () { return Object.keys(viewPanels); },
    orbit: function () {
      return { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.toArray() };
    }
  };

  // ================= 调试状态（隐藏，供自动化测试与排错） =================
  var debugEl = document.createElement('div');
  debugEl.id = 'debug-state';
  debugEl.style.display = 'none';
  document.body.appendChild(debugEl);
  var __errors = [];
  window.addEventListener('error', function (e) { __errors.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { __errors.push('rejection: ' + String(e.reason)); });
  function updateDebug() {
    var first = cubes[0] || null;
    var proj = null;
    if (first) {
      var v = first.mesh.position.clone().project(camera);
      proj = [Math.round((v.x * 0.5 + 0.5) * window.innerWidth), Math.round((-v.y * 0.5 + 0.5) * window.innerHeight)];
    }
    var panels = {};
    for (var dk in viewPanels) panels[dk] = viewPanels[dk].static ? 'static' : (viewPanels[dk].tween ? 'tween' : 'new');
    var gs = new Set();
    for (var gi = 0; gi < cubes.length; gi++) gs.add(cubes[gi].groupId);
    debugEl.textContent = JSON.stringify({
      webgl: true,
      errors: __errors.slice(-10),
      cubes: cubes.length,
      groups: gs.size,
      selected: selectedIds.size,
      mode: mode,
      firstCell: first ? [first.cell.x, first.cell.y, first.cell.z] : null,
      firstProj: proj,
      viewPanels: panels
    });
  }

  setInterval(updateDebug, 200);

  // 启动
  updateStats();
  setMode('move');
  requestAnimationFrame(animate);
})();
