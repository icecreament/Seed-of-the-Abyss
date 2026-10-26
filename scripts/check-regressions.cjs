'use strict';

// 只读加载工作区当前 TS，在内存转译；不安装依赖、不生成编译产物、不接触真实存档。
// 运行：Node 20 scripts/check-regressions.cjs。每个 PASS 为一个具名用例，采样另行计数。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const source = (name) => require(`phaser/src/${name}`);
const EventEmitter = require('eventemitter3');
// DOM 只供语言/设备判断，不提供 canvas 渲染或浏览器事件模拟。
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Offline Windows', maxTouchPoints: 0, languages: ['zh-CN'], language: 'zh-CN' },
});
globalThis.document = { documentElement: { lang: '' } };
globalThis.window = {
  innerWidth: 1280, innerHeight: 720,
  matchMedia: () => ({ matches: false }),
  dispatchEvent: () => true,
};
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
// Phaser 自带 worker 检测分支跳过浏览器能力探测，不伪造渲染上下文。
globalThis.importScripts = () => { throw new Error('离线脚本禁止外部加载'); };
const Camera = source('cameras/2d/Camera');
const Container = source('gameobjects/container/Container');
const Rectangle = source('gameobjects/shape/rectangle/Rectangle');
const Arc = source('gameobjects/shape/arc/Arc');
const Graphics = source('gameobjects/graphics/Graphics');
const TransformMatrix = source('gameobjects/components/TransformMatrix');
const GetCalcMatrix = source('gameobjects/GetCalcMatrix');
const InputManager = source('input/InputManager');
const InputPlugin = source('input/InputPlugin');
const Vector2 = source('math/Vector2');
const GeomRectangle = source('geom/rectangle/Rectangle');
const RectangleOverlaps = source('geom/rectangle/Overlaps');
const SceneEvents = source('scene/events');
const CameraEvents = source('cameras/2d/events');
delete globalThis.importScripts;
const inputEvents = ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside'];
const scales = [0.75, 1, 1.5, 2];
let passed = 0;
let failed = 0;
let spawnSamples = 0;
let virtualSamples = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    failures.push(name);
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
function near(actual, expected, note = '') {
  assert.ok(Math.abs(actual - expected) < 0.001, `${note}: actual=${actual}, expected=${expected}`);
}
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values, reject: false, writes: 0,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      this.writes++;
      if (this.reject) throw new Error('模拟存储拒写');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
}
globalThis.localStorage = memoryStorage();
class SceneStub { constructor(key) { this.sceneKey = key; } }
const Phaser = {
  AUTO: 0, Scene: SceneStub,
  Scale: { FIT: 3, CENTER_BOTH: 1 },
  GameObjects: { Container, Rectangle, Arc, Graphics },
  Math: {
    Vector2, Between: source('math/Between'), Clamp: source('math/Clamp'),
    Distance: { Between: source('math/distance/DistanceBetween') },
  },
  Scenes: { Events: SceneEvents },
  Cameras: { Scene2D: { Events: CameraEvents } },
  Geom: { Rectangle: GeomRectangle },
  Input: { Keyboard: { JustDown: source('input/keyboard/keys/JustDown'), KeyCodes: source('input/keyboard/keys/KeyCodes') } },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
};
const stubs = new Map();
for (const name of ['BootScene', 'SettingsScene', 'DeathScene']) {
  stubs.set(path.join(ROOT, 'src', 'scenes', `${name}.ts`), { [name]: class extends SceneStub {} });
}
// 本次不覆盖实体构造/物理战斗；若误调用桩，立即失败，而非静默跳过。
for (const name of ['Player', 'Enemy']) {
  stubs.set(path.join(ROOT, 'src', 'entities', `${name}.ts`), {
    [name]: class { constructor() { throw new Error(`未模拟的实体构造：${name}`); } },
  });
}
const modules = new Map();
const hashes = new Map();
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
function loadTs(file) {
  file = path.resolve(ROOT, file);
  if (stubs.has(file)) return stubs.get(file);
  if (modules.has(file)) return modules.get(file).exports;
  const text = fs.readFileSync(file, 'utf8');
  hashes.set(file, digest(text));
  const compiled = ts.transpileModule(text, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
      esModuleInterop: true, useDefineForClassFields: true,
    },
  });
  const errors = (compiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  modules.set(file, module);
  const localRequire = (id) => {
    if (id === 'phaser') return Phaser;
    if (id.startsWith('.')) return loadTs(path.resolve(path.dirname(file), `${id}.ts`));
    return require(id);
  };
  const execute = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){\n${compiled.outputText}\n})`, { filename: file });
  execute(localRequire, module, module.exports, file, path.dirname(file));
  return module.exports;
}
const config = loadTs('src/game/config.ts');
const transitions = loadTs('src/ui/transitions.ts');
const { createTextButton } = loadTs('src/ui/TextButton.ts');
const { VirtualControls } = loadTs('src/input/VirtualControls.ts');
const { RunScene } = loadTs('src/scenes/RunScene.ts');
const { TalentScene } = loadTs('src/scenes/TalentScene.ts');
const { ClassSelectScene } = loadTs('src/scenes/ClassSelectScene.ts');
const { MenuScene } = loadTs('src/scenes/MenuScene.ts');
const { SaveSystem, saveSystem } = loadTs('src/systems/SaveSystem.ts');
const { ALL_TALENT_NODES } = loadTs('src/data/talents.ts');
const { CLASS_LIST } = loadTs('src/data/classes.ts');
const { runState } = loadTs('src/systems/RunState.ts');

// 文本/纹理没有绘制；以真实 Rectangle 承载变换、显示列表与销毁生命周期。
class VisualStub extends Rectangle {
  constructor(scene, x, y, text = '') { super(scene, x, y, 16, 16); this.text = text; }
  setText(text) { assert.ok(this.scene, '销毁后仍刷新旧文本'); this.text = text; return this; }
  setTint() { return this; }
  setColor() { return this; }
  // 绘制仍由浏览器测试覆盖；这里只记录 Phaser Text 描边样式，不替换矩阵/命中测试。
  setStroke(color, thickness = 1) { this.style = { ...this.style, stroke: color, strokeThickness: thickness }; return this; }
  play() { return this; }
}
function setupScene(scene = new SceneStub('Fixture'), scale = 1) {
  scene.events = new EventEmitter();
  scene.active = true;
  scene.sys = {
    events: scene.events, renderer: null, settings: {},
    isActive: () => scene.active, canInput: () => scene.active,
    queueDepthSort() {}, updateList: { remove() {} },
  };
  const children = scene.children = {
    list: [], events: scene.events,
    add(object) { this.list.push(object); object.displayList = this; return object; },
    remove(object) { const i = this.list.indexOf(object); if (i !== -1) this.list.splice(i, 1); return object; },
    exists(object) { return this.list.includes(object); },
    queueDepthSort() {},
    getIndex(object) { return this.list.indexOf(object); },
  };
  scene.sys.displayList = children;
  const manager = Object.create(InputManager.prototype);
  Object.assign(manager, {
    enabled: true, game: { canvas: { style: {} } }, pointers: [],
    _tempPoint: new Vector2(), _tempMatrix: new TransformMatrix(), _tempMatrix2: new TransformMatrix(), _tempHitTest: [],
    resetCursor() {},
  });
  const input = Object.create(InputPlugin.prototype);
  EventEmitter.call(input);
  Object.assign(input, {
    scene, systems: scene.sys, manager, enabled: true, topOnly: true,
    _list: [], _pendingInsertion: [], _pendingRemoval: [], _draggable: [], _drag: {}, _over: {}, _temp: [],
    _eventData: { cancelled: false },
  });
  input._eventContainer = { stopPropagation() { input._eventData.cancelled = true; } };
  scene.input = scene.sys.input = input;
  scene.sys.game = { input: manager };
  scene.cameras = { main: new Camera(0, 0, 1280 * scale, 720 * scale) };
  const pending = [];
  scene.time = {
    pending,
    delayedCall(delay, callback) { const timer = { delay, callback }; pending.push(timer); return timer; },
    flush() { const batch = pending.splice(0); for (const timer of batch) timer.callback(); },
  };
  scene.starts = [];
  scene.scene = { start: (...args) => scene.starts.push(args), restart: () => scene.starts.push(['restart']) };
  scene.scale = {
    width: 1280 * scale, height: 720 * scale, gameSize: { width: 1280 * scale, height: 720 * scale }, calls: 0,
    setGameSize(w, h) { this.calls++; this.width = this.gameSize.width = w; this.height = this.gameSize.height = h; },
  };
  const add = (object) => children.add(object);
  scene.add = {
    container: (x, y) => add(new Container(scene, x, y)),
    rectangle: (...args) => add(new Rectangle(scene, ...args)),
    circle: (x, y, r, color, alpha) => add(new Arc(scene, x, y, r, 0, 360, false, color, alpha)),
    graphics: () => add(new Graphics(scene)),
    text: (x, y, text) => add(new VisualStub(scene, x, y, text)),
    image: (x, y, key) => add(Object.assign(new VisualStub(scene, x, y), { textureKey: key })),
    sprite: (x, y, key) => add(Object.assign(new VisualStub(scene, x, y), { textureKey: key })),
  };
  scene.anims = { exists: () => false };
  // 纹理集合按真实资源建模：四个职业各有一张 128×160 展示肖像，界面占位保持不变。
  const knownTextures = new Set([
    'portrait_warden', 'portrait_reaver', 'portrait_shade', 'portrait_thorn',
    'hero_warden', 'hero_reaver', 'hero_shade', 'hero_thorn',
    'icon_seed', 'icon_essence', 'ui_heart', 'shadow', 'pixel',
    'tile_floor_0', 'tile_floor_1', 'tile_floor_2', 'tile_floor_3', 'tile_wall',
    'fx_slash', 'proj_ember', 'proj_seed', 'ui_panel',
  ]);
  scene.textures = { exists: (key) => knownTextures.has(key) };
  scene.tweens = { add() {}, killTweensOf() {} };
  scene.physics = {
    world: { paused: false, pause() { this.paused = true; }, resume() { this.paused = false; } },
    add: {
      staticGroup() { const list = []; return { add: (o) => list.push(o), getChildren: () => list }; },
      existing(object) {
        object.body = { left: object.x - object.width / 2, right: object.x + object.width / 2,
          top: object.y - object.height / 2, bottom: object.y + object.height / 2, destroy() {} };
      },
    },
  };
  return scene;
}
function applyScale(scene, scale) {
  config.applyRenderScale({ scale: scene.scale, scene: { scenes: [scene] } }, scale);
  scene.cameras.main.preRender();
}
function shutdown(scene) {
  scene.events.emit(SceneEvents.SHUTDOWN);
  for (const object of [...scene.children.list]) object.destroy();
  scene.time.pending.length = 0;
}
function renderedObjects(scene) {
  const out = [];
  const visit = (object) => {
    if (!object.willRender(scene.cameras.main)) return;
    out.push(object);
    if (object instanceof Container) object.list.forEach(visit);
  };
  [...scene.children.list].sort((a, b) => a.depth - b.depth).forEach(visit);
  return out;
}
function pointerAt(scene, x, y, id = 1, wasTouch = true) {
  const scale = scene.scale.width / 1280;
  return { id, x: x * scale, y: y * scale, wasTouch, button: 0, isDown: true,
    downElement: scene.input.manager.game.canvas, upElement: scene.input.manager.game.canvas,
    leftButtonDown() { return this.isDown; } };
}
function hitObjects(scene, pointer) {
  const cam = scene.cameras.main;
  cam.preRender();
  // 没有真实 renderer；仅按真实容器插入顺序构建 renderList，排序/命中仍使用 Phaser 源码。
  cam.renderList = renderedObjects(scene);
  pointer.camera = cam;
  const hits = scene.input.manager.hitTest(pointer, cam.renderList.filter((o) => o.input), cam, []);
  scene.input.sortGameObjects(hits, pointer);
  return hits;
}
function dispatch(scene, type, pointer) {
  const input = scene.input;
  input.manager.activePointer = pointer;
  input._temp = hitObjects(scene, pointer);
  if (input.topOnly) input._temp = input._temp.slice(0, 1);
  const hits = input._temp.slice();
  if (type === 'down') { pointer.isDown = true; input.processDownEvents(pointer); }
  else { pointer.isDown = false; input.processUpEvents(pointer); }
  return { hits, stopped: input._eventData.cancelled };
}
function screenPoint(scene, object, x = 0, y = 0) {
  scene.cameras.main.preRender();
  const parent = object.parentContainer?.getWorldTransformMatrix(new TransformMatrix(), new TransformMatrix());
  return GetCalcMatrix(object, scene.cameras.main, parent).calc.transformPoint(x, y, {});
}
function flags(virtual) { return [virtual.attackHeld, virtual.dashPressed, virtual.skillPressed]; }
function runFixture(scale = 1) {
  const scene = setupScene(new RunScene(), scale);
  // 暂停会暂停玩家/敌人动画，桩必须提供 anims，否则测到的是桩的缺口而非真实行为。
  scene.player = {
    x: 896, y: 608, classId: 'warden', setVelocity() {}, queueAttack() { this.queuedAttacks=(this.queuedAttacks??0)+1; },
    // This fixture exercises HUD/input with a non-pursuing Warden. Real pursuit physics
    // and lifecycle cancellation use an actual Player in the browser suite.
    resumePursuit() { this.pursuitResumes=(this.pursuitResumes??0)+1; },
    stopCombat() { this.combatStopped=true; this.setVelocity(0,0); },
    anims: { pause() {}, resume() {} },
    moveIntent: new Vector2(), aimIntent: new Vector2(1, 0),
  };
  scene.enemies = { getChildren: () => [] };
  scene.cameras.main.setBounds(0, 0, scene.mapW, scene.mapH).setRoundPixels(true);
  scene.hudRoot = scene.add.container(0, 0).setScrollFactor(0).setDepth(490);
  scene.events.on('render-scale-changed', scene.syncHudScale, scene);
  applyScale(scene, scale);
  scene.virtual = new VirtualControls(scene);
  scene.createHud();
  scene.addHudObjects([scene.virtual.root]);
  for (const name of ['keyW', 'keyA', 'keyS', 'keyD', 'keySpace']) scene[name] = { isDown: false, _justDown: false };
  scene.cursors = { left: {}, right: {}, up: {}, down: {} };
  // Keyboard manager is not booted in this fixture; connect the actual production
  // mouse handlers to the real InputPlugin dispatch, rather than fake global hold.
  scene.input.on('pointerdown', scene.onAttackPointer);
  scene.input.on('pointerup', scene.onAttackRelease);
  scene.input.on('pointerupoutside', scene.onAttackRelease);
  return scene;
}

console.log(`离线源码回归 | Node ${process.version} | TypeScript ${ts.version} | Phaser ${require('phaser/package.json').version}`);
test('环境：当前目标源码均真实转译，命中/事件/矩阵未替换', () => {
  for (const file of ['game/config', 'ui/transitions', 'ui/TextButton', 'input/VirtualControls', 'scenes/RunScene', 'scenes/TalentScene', 'scenes/ClassSelectScene', 'systems/SaveSystem']) {
    assert.ok(modules.has(path.join(ROOT, 'src', `${file}.ts`)), file);
  }
  const s = setupScene();
  assert.equal(s.input.manager.hitTest, InputManager.prototype.hitTest);
  assert.equal(s.input.processUpEvents, InputPlugin.prototype.processUpEvents);
  assert.equal(s.input.processDownEvents, InputPlugin.prototype.processDownEvents);
  assert.equal(s.cameras.main.preRender, Camera.prototype.preRender);
  assert.deepEqual(config.VIDEO_SCALE_STEPS, scales);
});

for (const scale of scales) {
  for (const SceneClass of [MenuScene, TalentScene, ClassSelectScene]) {
    test(`倍率 ${scale} ${SceneClass.name}：真实 create/相机中心/设计屏幕映射`, () => {
      const s = setupScene(new SceneClass(), scale);
      applyScale(s, scale);
      s.input.enabled = false;
      s.__leaving = true;
      s.create();
      assert.equal(s.input.enabled, true);
      assert.equal(s.input.topOnly, true);
      assert.equal(s.__leaving, false);
      const point = s.add.rectangle(640, 360, 8, 8);
      const screen = screenPoint(s, point);
      near(screen.x, 640 * scale, '菜单中心x'); near(screen.y, 360 * scale, '菜单中心y');
      const world = s.cameras.main.getWorldPoint(640 * scale, 360 * scale);
      near(world.x, 640); near(world.y, 360);
      assert.equal(s.cameras.main.zoom, scale);
      assert.equal(s.cameras.main.width, 1280 * scale);
      shutdown(s);
    });
  }
  test(`倍率 ${scale} HUD：真实偏移、嵌套子节点固定映射、移动/边界夹紧`, () => {
    const s = runFixture(scale);
    near(s.hudRoot.x, (1280 * scale - 1280) / 2);
    near(s.hudRoot.y, (720 * scale - 720) / 2);
    s.virtual.show();
    const objects = [s.hudText, s.floorText, s.bannerText, s.pauseButton.list[0], s.virtual.attackBtn.list[0]];
    const coordinates = [[304, 57], [1044, 32], [640, 132], [1218, 92], [1190, 630]];
    for (const [px, py] of [[896, 608], [100, 100], [1700, 1100], [1200, 840]]) {
      s.player.x = px; s.player.y = py; s.syncHudScale();
      objects.forEach((object, i) => {
        near(object.scrollFactorX, 0); near(object.scrollFactorY, 0);
        const p = screenPoint(s, object);
        near(p.x, coordinates[i][0] * scale, `HUD ${i} x`);
        near(p.y, coordinates[i][1] * scale, `HUD ${i} y`);
      });
    }
  });
  for (const kind of ['resume', 'quit']) {
    test(`倍率 ${scale} 暂停 ${kind}：真实 hitTest/事件分发/销毁回调`, () => {
      const s = runFixture(scale);
      s.virtual.show(); s.togglePause();
      const [resume, quit] = s.pauseRoot.getData('extra');
      const button = kind === 'resume' ? resume : quit;
      const y = kind === 'resume' ? 370 : 426;
      const p = pointerAt(s, 640, y);
      assert.equal(hitObjects(s, p)[0], button.list[0]);
      const other = kind === 'resume' ? quit : resume;
      assert.ok(!hitObjects(s, p).includes(other.list[0]));
      // 内边角命中，外边角不命中；不是只验证中心点。
      for (const [dx, dy] of [[-109, -20], [109, 20]]) assert.ok(hitObjects(s, pointerAt(s, 640 + dx, y + dy)).includes(button.list[0]));
      for (const [dx, dy] of [[-111, 0], [111, 0], [0, -22], [0, 22]]) assert.ok(!hitObjects(s, pointerAt(s, 640 + dx, y + dy)).includes(button.list[0]));
      const down = dispatch(s, 'down', p);
      assert.equal(down.stopped, true); assert.equal(s.paused, true);
      const bg = button.list[0];
      dispatch(s, 'up', p);
      assert.equal(s.paused, false); assert.equal(s.physics.world.paused, false);
      assert.equal(s.pauseRoot, undefined); assert.equal(bg.scene, undefined);
      s.time.flush();
      if (kind === 'resume') { assert.equal(s.player.pursuitResumes, 1); assert.equal(s.virtual.isVisible, true); assert.equal(s.input.enabled, true); }
      else { assert.equal(s.player.combatStopped, true); assert.equal(s.ended, true); assert.equal(s.input.enabled, false); assert.equal(runState.lastRun.classId, 'warden'); assert.deepEqual(s.starts, [['Death']]); }
    });
  }
  test(`倍率 ${scale} 暂停中触摸和 show 不唤醒，继续恢复可见性`, () => {
    const s = runFixture(scale); s.virtual.show();
    dispatch(s, 'down', pointerAt(s, 1190, 630)); assert.equal(s.virtual.attackHeld, true);
    s.togglePause();
    for (const [x, y] of [[1190, 630], [100, 620], [1105, 580], [1105, 665]]) dispatch(s, 'down', pointerAt(s, x, y));
    s.virtual.show();
    assert.equal(s.virtual.isVisible, false); assert.deepEqual(flags(s.virtual), [false, false, false]);
    s.togglePause(); assert.equal(s.virtual.isVisible, true); assert.equal(s.virtual.attackHeld, false);
  });
  test(`倍率 ${scale} VirtualControls：三个中心独占及1140,625空隙`, () => {
    const s = setupScene(undefined, scale); applyScale(s, scale); const v = new VirtualControls(s);
    const cases = [[1190, 630, [true, false, false]], [1105, 580, [false, true, false]], [1105, 665, [false, false, true]], [1140, 625, [false, false, false]]];
    for (const [x, y, expected] of cases) {
      v.hide(); dispatch(s, 'down', pointerAt(s, x, y)); assert.deepEqual(flags(v), expected, `${x},${y}`);
    }
  });
  test(`倍率 ${scale} VirtualControls：按钮区域网格采样不同时触发`, () => {
    const s = setupScene(undefined, scale); applyScale(s, scale); const v = new VirtualControls(s);
    for (let y = 530; y <= 715; y += 5) for (let x = 1050; x <= 1250; x += 5) {
      v.hide(); dispatch(s, 'down', pointerAt(s, x, y));
      assert.ok(flags(v).filter(Boolean).length <= 1, `多触发 ${x},${y}`); virtualSamples++;
    }
  });
  test(`倍率 ${scale} 多指：抬摇杆/另一个攻击指不取消原attack`, () => {
    const s = setupScene(undefined, scale); applyScale(s, scale); const v = new VirtualControls(s);
    const attack = pointerAt(s, 1190, 630, 1), stick = pointerAt(s, 100, 620, 2), another = pointerAt(s, 1190, 630, 3);
    dispatch(s, 'down', attack); dispatch(s, 'down', stick);
    s.input.emit('pointermove', pointerAt(s, 212, 620, 2)); near(v.moveVector.x, 1);
    dispatch(s, 'up', stick); assert.equal(v.attackHeld, true); near(v.moveVector.lengthSq(), 0);
    dispatch(s, 'down', another); dispatch(s, 'up', another); assert.equal(v.attackHeld, true);
    dispatch(s, 'up', attack); assert.equal(v.attackHeld, false);
  });
  test(`倍率 ${scale} pointerupoutside：真实分发释放攻击与摇杆`, () => {
    const s = setupScene(undefined, scale); applyScale(s, scale); const v = new VirtualControls(s);
    const a = pointerAt(s, 1190, 630, 1), b = pointerAt(s, 100, 620, 2);
    dispatch(s, 'down', a); dispatch(s, 'down', b); s.input.emit('pointermove', pointerAt(s, 145, 645, 2));
    a.x = b.x = -100; a.upElement = b.upElement = {};
    dispatch(s, 'up', b); assert.equal(v.attackHeld, true); near(v.moveVector.lengthSq(), 0);
    dispatch(s, 'up', a); assert.equal(v.attackHeld, false);
  });
  test(`倍率 ${scale} 触摸抬到未按下的TextButton：不阻止传播且不粘attack`, () => {
    const s = runFixture(scale); let clicks = 0;
    const button = createTextButton(s, 640, 150, 'probe', () => clicks++);
    s.addHudObjects([button]);
    const p = pointerAt(s, 1190, 630); dispatch(s, 'down', p); assert.equal(s.virtual.attackHeld, true);
    p.x = 640 * scale; p.y = 150 * scale;
    const up = dispatch(s, 'up', p);
    assert.equal(up.hits[0], button.list[0]); assert.equal(up.stopped, false);
    assert.equal(clicks, 0); assert.equal(s.virtual.attackHeld, false);
  });
}

test('配置：非法倍率回退1，同尺寸不重复setGameSize，未启动场景安全', () => {
  const s = setupScene(); applyScale(s, 2); const before = s.scale.calls;
  applyScale(s, 2); assert.equal(s.scale.calls, before);
  applyScale(s, 7); assert.equal(config.getRenderScale(), 1); assert.equal(s.scale.width, 1280);
  assert.doesNotThrow(() => config.syncSceneRenderScale({}));
});
test('配置：运行中四倍率往返触发真实HUD重定位', () => {
  const s = runFixture();
  for (const scale of [...scales, ...scales.slice().reverse()]) {
    applyScale(s, scale); const p = screenPoint(s, s.pauseButton.list[0]);
    near(p.x, 1218 * scale); near(p.y, 92 * scale);
  }
});
test('过渡：fadeIn清理leaving/输入/旧pointer并恢复重建相机倍率', () => {
  const s = setupScene(); applyScale(s, 1.5);
  s.cameras.main = new Camera(0, 0, 10, 10); s.__leaving = true; s.input.enabled = false;
  let resets = 0; s.input.manager.pointers = [{ reset() { resets++; } }, { reset() { resets++; } }];
  transitions.fadeInScene(s); s.cameras.main.preRender();
  assert.equal(resets, 2); assert.equal(s.__leaving, false); assert.equal(s.input.enabled, true);
  assert.equal(s.cameras.main.zoom, 1.5); near(s.cameras.main.getWorldPoint(960, 540).x, 640);
});
for (const first of ['fade', 'timer', 'exception']) {
  test(`过渡：${first}先完成只跳转一次，输入恢复`, () => {
    const s = setupScene();
    if (first === 'exception') s.cameras.main.fadeOut = () => { throw new Error('模拟fade失败'); };
    transitions.goScene(s, 'Run', { probe: 1 });
    if (first !== 'exception') {
      assert.equal(s.input.enabled, false);
      transitions.goScene(s, 'Wrong');
      if (first === 'fade') s.cameras.main.emit(CameraEvents.FADE_OUT_COMPLETE);
      s.time.flush(); s.cameras.main.emit(CameraEvents.FADE_OUT_COMPLETE);
    }
    assert.deepEqual(s.starts, [['Run', { probe: 1 }]]); assert.equal(s.input.enabled, true); assert.equal(s.__leaving, false);
  });
}

for (const SceneClass of [TalentScene, ClassSelectScene]) {
  const scene = new SceneClass();
  for (let cycle = 0; cycle < 12; cycle++) {
    test(`${SceneClass.name}同实例重入 ${cycle + 1}/12：9/18/${CLASS_LIST.length}且shutdown清空`, () => {
      setupScene(scene, scales[cycle % 4]); applyScale(scene, scales[cycle % 4]); scene.create();
      if (SceneClass === TalentScene) {
        assert.equal(scene.panels.length, 9); assert.equal(scene.cardTexts.length, 18);
        assert.equal(new Set(scene.panels.map((p) => p.id)).size, 9);
        const oldTexts = scene.cardTexts.slice(); shutdown(scene);
        assert.equal(scene.panels.length, 0); assert.equal(scene.cardTexts.length, 0);
        assert.ok(oldTexts.every((t) => !t.scene));
      } else {
        assert.equal(scene.cards.length, CLASS_LIST.length);
        assert.equal(new Set(scene.cards.map((c) => c.id)).size, CLASS_LIST.length);
        const oldCards = scene.cards.slice(); shutdown(scene);
        assert.equal(scene.cards.length, 0); assert.ok(oldCards.every((c) => !c.bg.scene));
      }
    });
  }
}
test('VirtualControls：shutdown解绑全部4类事件，重复绑定不累积', () => {
  const s = setupScene();
  for (let cycle = 0; cycle < 12; cycle++) {
    const v = new VirtualControls(s); v.bind();
    for (const event of inputEvents) assert.equal(s.input.listenerCount(event), 1);
    s.events.emit(SceneEvents.SHUTDOWN);
    for (const event of inputEvents) assert.equal(s.input.listenerCount(event), 0);
  }
});

for (const wasTouch of [false, true]) {
  test(`TextButton ${wasTouch ? 'touch' : 'mouse'}：down不触发、同指up一次、200ms锁`, () => {
    const s = setupScene(); applyScale(s, 1); let count = 0;
    createTextButton(s, 640, 360, 'click', () => count++);
    const p = pointerAt(s, 640, 360, 1, wasTouch);
    dispatch(s, 'down', p); assert.equal(count, 0);
    dispatch(s, 'up', p); assert.equal(count, 1);
    dispatch(s, 'up', p); assert.equal(count, 1);
    dispatch(s, 'down', p); dispatch(s, 'up', p); assert.equal(count, 1);
    s.time.flush(); dispatch(s, 'down', p); dispatch(s, 'up', p); assert.equal(count, 2);
  });
}
test('TextButton：不同指松手不触发/不截获，pointerout取消合法按下', () => {
  const s = setupScene(); applyScale(s, 1); let count = 0;
  const button = createTextButton(s, 640, 360, 'click', () => count++);
  dispatch(s, 'down', pointerAt(s, 640, 360, 1));
  assert.equal(dispatch(s, 'up', pointerAt(s, 640, 360, 2)).stopped, false);
  assert.equal(count, 0);
  dispatch(s, 'down', pointerAt(s, 640, 360, 1)); button.list[0].emit('pointerout');
  assert.equal(dispatch(s, 'up', pointerAt(s, 640, 360, 1)).stopped, false); assert.equal(count, 0);
});
test('TextButton：合法回调同步销毁容器及bg，无销毁后绘制或延迟异常', () => {
  const s = setupScene(); applyScale(s, 1); let count = 0;
  const button = createTextButton(s, 640, 360, 'destroy', () => { count++; button.destroy(true); });
  for (const object of [button.list[0], button.list[1]]) {
    const original = object.setFillStyle;
    object.setFillStyle = function (...args) { assert.ok(this.scene, '销毁之后仍paint'); return original.apply(this, args); };
  }
  const bg = button.list[0], p = pointerAt(s, 640, 360);
  dispatch(s, 'down', p); assert.doesNotThrow(() => dispatch(s, 'up', p));
  assert.equal(count, 1); assert.equal(bg.scene, undefined); assert.doesNotThrow(() => s.time.flush());
});
test('TextButton：非活跃场景不执行回调', () => {
  const s = setupScene(); applyScale(s, 1); let count = 0;
  const button = createTextButton(s, 640, 360, 'inactive', () => count++);
  const p = pointerAt(s, 640, 360); dispatch(s, 'down', p); s.active = false;
  button.list[0].emit('pointerup', p, 0, 0, { stopPropagation() {} }); assert.equal(count, 0);
});

for (const [label, x, y, expected] of [
  ['左摇杆', 100, 620, [false, false, false]], ['空白', 850, 300, [false, false, false]],
  ['攻击', 1190, 630, [true, false, false]], ['冲刺', 1105, 580, [false, true, false]],
  ['技能', 1105, 665, [false, false, true]], ['三按钮间隙', 1140, 625, [false, false, false]],
]) {
  test(`Run.readInput触摸${label}：不借leftButtonDown自动攻击`, () => {
    const s = runFixture(); const p = pointerAt(s, x, y); dispatch(s, 'down', p);
    assert.equal(p.leftButtonDown(), true); s.readInput();
    assert.deepEqual([s.player.wantAttack, s.player.wantDash, s.player.wantSkill], expected);
    assert.equal(s.virtual.dashPressed, false); assert.equal(s.virtual.skillPressed, false);
    if (label === '冲刺' || label === '技能') { s.readInput(); assert.equal(s.player.wantDash, false); assert.equal(s.player.wantSkill, false); }
  });
}
test('Run.readInput：touch移动瞄准、静止保留瞄准、attack可持续', () => {
  const s = runFixture(); dispatch(s, 'down', pointerAt(s, 100, 620, 1));
  s.input.emit('pointermove', pointerAt(s, 100, 564, 1));
  dispatch(s, 'down', pointerAt(s, 1190, 630, 2));
  s.readInput(); near(s.player.aimIntent.x, 0); near(s.player.aimIntent.y, -1);
  assert.equal(s.player.wantAttack, true);
  dispatch(s, 'up', pointerAt(s, 100, 564, 1)); s.readInput();
  near(s.player.aimIntent.y, -1); assert.equal(s.player.wantAttack, true);
});
test('Run.readInput：鼠标攻击与Space有效，冲刺/技能走 keydown 缓冲且只消费一次', () => {
  const s = runFixture(); dispatch(s, 'down', pointerAt(s, 800, 300, 0, false));
  s.readInput(); assert.equal(s.player.wantAttack, true);
  dispatch(s, 'up', pointerAt(s, 800, 300, 0, false)); s.readInput(); assert.equal(s.player.wantAttack, false);
  s.keySpace.isDown = true;
  s.onDashKey({ repeat: false }); s.onSkillKey({ repeat: false });
  s.readInput(); assert.deepEqual([s.player.wantAttack, s.player.wantDash, s.player.wantSkill], [true, true, true]);
  s.readInput(); assert.deepEqual([s.player.wantDash, s.player.wantSkill], [false, false]);
});
// 回归：按下与抬起落在同一帧时（快速点按 / 低帧率），旧实现轮询 JustDown
// 会整帧丢掉这次按键；事件缓冲必须把它记住并只消费一次。
test('Run 输入缓冲：同帧快速点按不丢，长按 repeat 不连发', () => {
  const s = runFixture();
  // 先给 activePointer 一个初始位置（真实游戏里每帧都有指针状态）
  const p = pointerAt(s, 800, 300, 0, false);
  dispatch(s, 'down', p); dispatch(s, 'up', p);
  s.readInput();
  s.onDashKey({ repeat: false }); s.onSkillKey({ repeat: false });
  s.readInput(); assert.deepEqual([s.player.wantDash, s.player.wantSkill], [true, true]);
  s.readInput(); assert.deepEqual([s.player.wantDash, s.player.wantSkill], [false, false]);
  s.onDashKey({ repeat: true }); s.readInput(); assert.equal(s.player.wantDash, false);
});
test('Run 暂停：ESC keydown 直接生效，与帧边界无关且 repeat 不来回切', () => {
  const s = runFixture(); s.virtual.show();
  s.onPauseKey({ repeat: false });
  assert.equal(s.paused, true); assert.ok(s.pauseRoot);
  s.onPauseKey({ repeat: true });
  assert.equal(s.paused, true); assert.ok(s.pauseRoot);
  s.onPauseKey({ repeat: false });
  assert.equal(s.paused, false); assert.equal(s.pauseRoot, undefined);
});

function validSpawn(scene, p, minDist, label) {
  assert.ok(p, `${label}: 返回null`);
  assert.ok(p.x >= 64 && p.x <= scene.mapW - 64 && p.y >= 64 && p.y <= scene.mapH - 64, `${label}: 出界 ${JSON.stringify(p)}`);
  assert.ok(Math.hypot(p.x - scene.player.x, p.y - scene.player.y) >= minDist, `${label}: 距离不足`);
  const area = new GeomRectangle(p.x - 32, p.y - 32, 64, 64);
  for (const wall of scene.walls.getChildren()) {
    const b = wall.body;
    assert.equal(RectangleOverlaps(area, new GeomRectangle(b.left, b.top, b.right - b.left, b.bottom - b.top)), false, `${label}: 32px安全边距碰墙 ${JSON.stringify(p)}`);
  }
}
function withRandom(random, callback) { const old = Math.random; Math.random = random; try { callback(); } finally { Math.random = old; } }
test('spawnPoint：真实buildWalls + 固定种子1000点，墙margin32/距离/地图边界', () => {
  const s = setupScene(new RunScene()); s.player = { x: 896, y: 608 }; s.buildWalls();
  assert.equal(s.walls.getChildren().length, 12);
  let seed = 0x5eedab;
  withRandom(() => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }, () => {
    for (let i = 0; i < 1000; i++) {
      if (i % 250 === 0) [s.player.x, s.player.y] = [[896, 608], [64, 64], [1728, 1152], [1300, 800]][i / 250];
      validSpawn(s, s.spawnPointAwayFromPlayer(220), 220, `采样${i}`); spawnSamples++;
    }
  });
});
test('spawnPoint：minDist不可满足，随机24次后穷尽fallback返回null', () => {
  const s = setupScene(new RunScene()); s.player = { x: 896, y: 608 }; s.buildWalls();
  let randomCalls = 0;
  withRandom(() => { randomCalls++; return 0.5; }, () => assert.equal(s.spawnPointAwayFromPlayer(10000), null));
  assert.equal(randomCalls, 48);
});
test('spawnPoint：24次随机落墙失败，真实fallback返回经验证安全点', () => {
  const s = setupScene(new RunScene()); s.player = { x: 64, y: 64 }; s.buildWalls();
  let calls = 0;
  const wallX = 368, wallY = 352;
  withRandom(() => { const isX = calls++ % 2 === 0; return isX ? (wallX - 64 + 0.25) / (s.mapW - 127) : (wallY - 64 + 0.25) / (s.mapH - 127); }, () => {
    const p = s.spawnPointAwayFromPlayer(220);
    assert.equal(calls, 48); validSpawn(s, p, 220, 'fallback'); assert.deepEqual(p, { x: 288, y: 64 });
  });
});
test('spawnPoint：24次随机距离失败仍走安全fallback', () => {
  const s = setupScene(new RunScene()); s.player = { x: 64, y: 64 }; s.buildWalls(); let calls = 0;
  withRandom(() => { calls++; return 0; }, () => validSpawn(s, s.spawnPointAwayFromPlayer(220), 220, '近玩家fallback'));
  assert.equal(calls, 48);
});
test('spawnPoint：全地图被墙覆盖时返回null，不产生非法保底点', () => {
  const s = new RunScene(); s.player = { x: 896, y: 608 };
  s.walls = { getChildren: () => [{ body: { left: 0, top: 0, right: s.mapW, bottom: s.mapH } }] };
  withRandom(() => 0.5, () => assert.equal(s.spawnPointAwayFromPlayer(0), null));
});
test('spawnWave：没有合法生成点时跳过，绝不构造Enemy', () => {
  const s = new RunScene(); s.player = { x: 896, y: 608 };
  s.enemies = { getChildren: () => [], add() { assert.fail('不应创建敌人'); } };
  s.walls = { getChildren: () => [{ body: { left: 0, top: 0, right: s.mapW, bottom: s.mapH } }] };
  withRandom(() => 0.5, () => assert.doesNotThrow(() => s.spawnWave(6)));
});

const SAVE_KEY = 'seed_of_the_abyss_save_v1';
function withSave(data, callback, reject = false) {
  const old = globalThis.localStorage;
  const store = memoryStorage(data == null ? {} : { [SAVE_KEY]: JSON.stringify(data) });
  store.reject = reject; globalThis.localStorage = store;
  try { callback(new SaveSystem(), store); } finally { globalThis.localStorage = old; }
}
const smallRun = { floor: 1, kills: 0, timeAliveSec: 0, damageDealt: 0 };
test('SaveSystem旧档迁移：余额+已购天赋/lifetime下限、stage不降、重复读档幂等', () => {
  const node = ALL_TALENT_NODES[0];
  withSave({ essence: 3, totalDeaths: 6, seedStage: 12, talentRanks: { [node.id]: 2 }, language: 'zh' }, (s, store) => {
    assert.ok(s.snapshot.lifetimeEssence >= 3 + node.costPerRank * 2);
    assert.ok(s.snapshot.lifetimeEssence >= 360); assert.ok(s.seedStage >= 12);
    s.setSelectedClass('warden'); const snapshot = s.snapshot;
    assert.deepEqual(new SaveSystem().snapshot, snapshot); assert.deepEqual(new SaveSystem().snapshot, snapshot);
    s.settleDeath(smallRun); assert.ok(s.seedStage >= snapshot.seedStage); assert.ok(store.writes >= 2);
  });
});
test('SaveSystem新lifetime：旧stage高于推算值也不降，结算累计只加收益', () => {
  withSave({ essence: 0, lifetimeEssence: 4, totalDeaths: 0, seedStage: 20, language: 'zh' }, (s) => {
    const before = s.snapshot; assert.ok(before.seedStage >= 20); assert.ok(before.lifetimeEssence >= 760);
    const result = s.settleDeath(smallRun);
    assert.equal(s.snapshot.lifetimeEssence, before.lifetimeEssence + result.gained);
    assert.ok(s.seedStage >= before.seedStage); assert.equal(s.totalDeaths, 1);
  });
});
test('SaveSystem消费天赋：不扣lifetime、不降阶段、重新加载不重复计算消费', () => {
  const node = ALL_TALENT_NODES.find((n) => !n.requires);
  withSave({ essence: 100, lifetimeEssence: 100, seedStage: 3, language: 'zh' }, (s) => {
    const before = s.snapshot; assert.equal(s.unlockTalent(node.id), true);
    assert.equal(s.essence, 100 - node.costPerRank); assert.equal(s.snapshot.lifetimeEssence, before.lifetimeEssence);
    assert.equal(s.seedStage, before.seedStage); assert.deepEqual(new SaveSystem().snapshot, s.snapshot);
    const result = s.settleDeath(smallRun); assert.equal(s.snapshot.lifetimeEssence, 100 + result.gained); assert.ok(s.seedStage >= before.seedStage);
  });
});
test('SaveSystem拒写：结算不抛异常、内存收益保留、后续写入恢复', () => {
  withSave({ essence: 10, lifetimeEssence: 100, seedStage: 3, language: 'zh' }, (s, store) => {
    const raw = store.getItem(SAVE_KEY); const before = s.snapshot; let result;
    assert.doesNotThrow(() => { result = s.settleDeath(smallRun); });
    assert.equal(s.essence, before.essence + result.gained); assert.equal(s.totalDeaths, before.totalDeaths + 1);
    assert.equal(s.snapshot.lifetimeEssence, before.lifetimeEssence + result.gained); assert.equal(store.getItem(SAVE_KEY), raw);
    store.reject = false; s.setSelectedClass('shade'); assert.deepEqual(new SaveSystem().snapshot, s.snapshot);
  }, true);
});
test('SaveSystem拒写：首次启动语言保存失败也能初始化', () => {
  withSave(null, (s, store) => { assert.equal(s.seedStage, 1); assert.equal(s.essence, 0); assert.ok(store.writes >= 1); }, true);
});
test('SaveSystem异常计数：负值/非数值不污染累计值或阶段', () => {
  withSave({ essence: -5, lifetimeEssence: 'bad', totalDeaths: null, deepestFloor: -2, seedStage: -3, language: 'zh' }, (s) => {
    assert.equal(s.essence, 0); assert.equal(s.seedStage, 1); assert.equal(s.totalDeaths, 0); assert.equal(s.deepestFloor, 0);
    assert.equal(s.snapshot.lifetimeEssence, 0);
    s.settleDeath({ floor: NaN, kills: Infinity, timeAliveSec: NaN, damageDealt: NaN });
    assert.ok(Number.isFinite(s.snapshot.lifetimeEssence)); assert.ok(Number.isFinite(s.seedStage));
  });
});
test('TalentScene真实点击：touch down不购买，up只消费一阶', () => {
  const before = saveSystem.snapshot;
  try {
    saveSystem.data.essence = 1000; saveSystem.data.talentRanks = {};
    const s = setupScene(new TalentScene()); applyScale(s, 1); s.create();
    const entry = s.panels[0]; const node = ALL_TALENT_NODES.find((n) => n.id === entry.id);
    const p = pointerAt(s, entry.panel.x, entry.panel.y);
    dispatch(s, 'down', p); assert.equal(saveSystem.getTalentRank(entry.id), 0);
    dispatch(s, 'up', p); assert.equal(saveSystem.getTalentRank(entry.id), 1); assert.equal(saveSystem.essence, 1000 - node.costPerRank);
  } finally { saveSystem.data = before; }
});

for (const scale of scales) {
  test(`倍率 ${scale} 重置确认：取消不改存档、遮罩拦截底层、确认只执行一次`, () => {
    const s = setupScene(new MenuScene(), scale);
    applyScale(s, scale); s.create();
    const before = saveSystem.snapshot;
    const raw = localStorage.getItem(SAVE_KEY);
    const original = saveSystem.resetAll;
    let resets = 0;
    saveSystem.resetAll = () => { resets++; };
    const click = (x, y) => {
      const p = pointerAt(s, x, y);
      dispatch(s, 'down', p); dispatch(s, 'up', p);
      return p;
    };
    try {
      click(382, 538);
      assert.ok(s.resetDialog); assert.equal(resets, 0);
      const dim = s.resetDialog.list[0];
      assert.equal(hitObjects(s, pointerAt(s, 276, 472))[0], dim);
      click(276, 472);
      assert.deepEqual(s.starts, []);
      click(520, 430);
      assert.equal(s.resetDialog, undefined); assert.equal(resets, 0);
      assert.deepEqual(saveSystem.snapshot, before);
      assert.equal(localStorage.getItem(SAVE_KEY), raw);
      s.time.flush();
      click(382, 538);
      const p = click(760, 430);
      dispatch(s, 'up', p);
      assert.equal(resets, 1);
      assert.deepEqual(s.starts, [['restart']]);
      assert.deepEqual(saveSystem.snapshot, before);
      assert.equal(localStorage.getItem(SAVE_KEY), raw);
    } finally {
      saveSystem.resetAll = original;
      shutdown(s);
    }
  });
}

for (const scale of scales) {
  test(`倍率 ${scale} 菜单样稿：四个独立肖像与导航命中正确，不写存档`, () => {
    const before = saveSystem.snapshot;
    const raw = localStorage.getItem(SAVE_KEY);
    for (const [x, y, target] of [[276, 402, 'ClassSelect'], [276, 472, 'Talent'], [170, 538, 'Settings']]) {
      const s = setupScene(new MenuScene(), scale);
      applyScale(s, scale); s.create();
      const portraits = s.children.list.filter(o => o.textureKey?.startsWith('portrait_'));
      assert.equal(portraits.length, 4);
      assert.deepEqual(portraits.map(o => o.textureKey), ['portrait_warden', 'portrait_reaver', 'portrait_shade', 'portrait_thorn']);
      assert.ok(portraits.every(o => o.scaleX === 1 && !o.input));
      const p = pointerAt(s, x, y);
      assert.equal(hitObjects(s, p).length, 1);
      dispatch(s, 'down', p); dispatch(s, 'up', p);
      s.time.flush();
      assert.deepEqual(s.starts, [[target, undefined]]);
      shutdown(s);
    }
    assert.deepEqual(saveSystem.snapshot, before);
    assert.equal(localStorage.getItem(SAVE_KEY), raw);
  });
  test(`倍率 ${scale} 职业样稿：卡片选择反馈唯一，返回不改变当前契约`, () => {
    const s = setupScene(new ClassSelectScene(), scale);
    applyScale(s, scale); s.create();
    const before = saveSystem.snapshot;
    const raw = localStorage.getItem(SAVE_KEY);
    const portraits = s.children.list.filter(o => o.textureKey?.startsWith('portrait_'));
    assert.equal(portraits.length, 4);
    assert.ok(portraits.every(o => o.scaleX === 1.5 && !o.input));
    for (const card of s.cards) {
      // 卡宽 272：内边角 120px 命中，158px 已落在卡外。
      for (const [x, y] of [[card.bg.x, 310], [card.bg.x - 120, 490], [card.bg.x + 120, 116]]) {
        const p = pointerAt(s, x, y);
        assert.equal(hitObjects(s, p)[0], card.bg);
        dispatch(s, 'down', p); dispatch(s, 'up', p);
        assert.equal(s.selected, card.id);
        assert.equal(s.cards.filter(c => c.status.text !== '').length, 1);
        assert.ok(card.status.text.startsWith('◆'));
      }
    }
    const p = pointerAt(s, 480, 658);
    dispatch(s, 'down', p); dispatch(s, 'up', p); s.time.flush();
    assert.deepEqual(s.starts, [['Menu', undefined]]);
    assert.deepEqual(saveSystem.snapshot, before);
    assert.equal(localStorage.getItem(SAVE_KEY), raw);
    shutdown(s);
  });
}

test('Run.shutdown：解绑倍率监听，销毁HUD后切换倍率不会访问旧对象', () => {
  const s = runFixture();
  assert.equal(s.events.listenerCount('render-scale-changed'), 1);
  s.virtual.show(); s.togglePause();
  s.shutdown();
  assert.equal(s.events.listenerCount('render-scale-changed'), 0);
  assert.equal(s.pauseRoot, undefined);
  s.hudRoot.destroy(true);
  assert.doesNotThrow(() => applyScale(s, 2));
});

// Pure pixel raster checks use the production drawers, not snapshots of their source text.
const { drawParasiticWarden, drawParasiticWardenPortrait } = loadTs('src/assets/ParasiticWarden.ts');
function raster(width, height) {
  const pixels = Array(width * height).fill(null);
  return {
    w: width, h: height, pixels,
    p(x, y, color) { if (x >= 0 && y >= 0 && x < width && y < height) pixels[(y|0)*width+(x|0)] = color; },
    rect(x, y, w, h, color) { for (let yy=y|0; yy<(y|0)+(h|0); yy++) for (let xx=x|0; xx<(x|0)+(w|0); xx++) this.p(xx,yy,color); },
    blit(x, y, rows, palette) { rows.forEach((row, yy) => [...row].forEach((key, xx) => { if (palette[key]) this.p(x+xx,y+yy,palette[key]); })); },
  };
}
test('守望者像素：14个生产姿态有效，四帧呼吸脚底锚点相同', () => {
  const frames = Array.from({length:14}, (_,i) => { const r=raster(32,32); drawParasiticWarden(r,i); return r; });
  for (const frame of frames) {
    assert.ok(frame.pixels.filter(Boolean).length > 230);
    assert.ok(frame.pixels.includes('#e8e0c9'), '骨白面甲不能丢失');
    assert.ok(frame.pixels.includes('#245a55'), '种子核心不能丢失');
  }
  const soles = frames[4].pixels.slice(27*32,29*32);
  for (let i=5;i<=7;i++) assert.deepEqual(frames[i].pixels.slice(27*32,29*32),soles);
  assert.notDeepEqual(frames[4].pixels,frames[5].pixels,'呼吸不是重复同一静态帧');
});
test('守望者像素：挥剑四帧各异，冲刺与受击不复用待机', () => {
  const frames = Array.from({length:14}, (_,i) => { const r=raster(32,32); drawParasiticWarden(r,i); return r.pixels; });
  for (let i=8;i<11;i++) assert.notDeepEqual(frames[i],frames[i+1]);
  assert.notDeepEqual(frames[12],frames[4]);
  assert.notDeepEqual(frames[13],frames[4]);
});
test('守望者展示肖像：透明底，骨白面甲／木肩／胸核与战斗素材一致', () => {
  const r=raster(128,160); drawParasiticWardenPortrait(r);
  assert.ok(r.pixels.filter(Boolean).length > 1300);
  for (const color of ['#e8e0c9','#414337','#3ecfbf','#b6f0d5']) assert.ok(r.pixels.includes(color),color);
  assert.equal(r.pixels[0],null);
  assert.equal(r.pixels[159*128+127],null);
});
const heroArt = loadTs('src/assets/AbyssHeroes.ts');
for (const [name, drawer, portrait, colors] of [
  ['掠夺者', heroArt.drawReaver, heroArt.drawReaverPortrait, ['#10131c','#ac3b43','#50555b','#e36959']],
  ['影行者', heroArt.drawShade, heroArt.drawShadePortrait, ['#10131c','#383052','#55456e','#7bbbbd']],
  ['棘语者', heroArt.drawThorn, heroArt.drawThornPortrait, ['#10131c','#4d6e4a','#c7aa63','#e8dfb1']],
]) {
  test(`${name}像素：14帧非空、保留职业标记且不越出32×32单元`, () => {
    for (let i=0;i<14;i++) {
      // A larger target exposes right/bottom overflow that the production cell would clip.
      const r=raster(64,64); drawer(r,i);
      assert.ok(r.pixels.filter(Boolean).length > 180, `帧${i}`);
      colors.forEach(color => assert.ok(r.pixels.includes(color),`帧${i}: ${color}`));
      for (let y=0;y<64;y++) for (let x=0;x<64;x++) {
        if (x>=32 || y>=32) assert.equal(r.pixels[y*64+x],null,`帧${i}越界(${x},${y})`);
      }
      assert.equal(r.pixels[0],null);
    }
  });
  test(`${name}像素：呼吸不滑脚、四段攻击不同、冲刺与受击独立`, () => {
    const frames=Array.from({length:14},(_,i)=>{const r=raster(32,32);drawer(r,i);return r;});
    const soles = frame => frame.pixels.slice(27*32,29*32).filter((_,i)=>i%32>=8 && i%32<24);
    for (let i=5;i<=7;i++) assert.deepEqual(soles(frames[i]),soles(frames[4]));
    for (const [a,b] of [[4,5],[5,6],[6,7],[8,9],[9,10],[10,11],[12,4],[13,4]]) {
      assert.notDeepEqual(frames[a].pixels,frames[b].pixels,`帧${a}不能复用帧${b}`);
    }
  });
  test(`${name}肖像：128×160透明底、同职业配色、靴底对齐`, () => {
    const r=raster(128,160); portrait(r);
    assert.ok(r.pixels.filter(Boolean).length>1000);
    assert.equal(r.pixels[0],null);
    assert.equal(r.pixels[159*128+127],null);
    colors.forEach(color=>assert.ok(r.pixels.includes(color),color));
    assert.ok(r.pixels.slice(148*128,150*128).some(Boolean),'鞋底位于y148–149');
  });
}
const portraitArt = loadTs('src/assets/HeroPortraits.ts');
test('展示肖像分辨率翻倍，菜单／职业卡尺寸和脚底世界坐标不变', () => {
  const {PORTRAIT_WIDTH:w,PORTRAIT_HEIGHT:h,PORTRAIT_MENU_SCALE:menu,PORTRAIT_CARD_SCALE:card}=portraitArt;
  assert.deepEqual([w,h],[128,160]);
  near(w*menu,128);near(h*menu,160);near(w*card,192);near(h*card,240);
  near((150-h/2)*menu,(75-80/2)*2);
  near((150-h/2)*card,(75-80/2)*3);
});
for (const [name,draw] of [
  ['守望者',portraitArt.drawWardenPortrait],['掠夺者',portraitArt.drawReaverPortrait],
  ['影行者',portraitArt.drawShadePortrait],['棘语者',portraitArt.drawThornPortrait],
]) {
  test(`${name}新肖像：原生细节非简单放大、无裁边、透明边距、绘制确定性`,()=>{
    const a=raster(128,160),b=raster(128,160);draw(a);draw(b);
    assert.deepEqual(a.pixels,b.pixels);
    const wide=raster(192,224);draw(wide);
    let detail=0,visible=0;
    for(let y=0;y<224;y++)for(let x=0;x<192;x++){
      if(wide.pixels[y*192+x]){
        visible++;assert.ok(x>=2&&x<126&&y>=2&&y<150,`越过肖像透明边界(${x},${y})`);
      }
    }
    assert.ok(visible>6000,'完整全身构图，不能只有局部叠加');
    for(let y=0;y<160;y+=2)for(let x=0;x<128;x+=2){
      if(new Set([a.pixels[y*128+x],a.pixels[y*128+x+1],a.pixels[(y+1)*128+x],a.pixels[(y+1)*128+x+1]]).size>1)detail++;
    }
    assert.ok(detail>200,`必须包含原生单像素细节，实际${detail}`);
    assert.ok(a.pixels.slice(148*128,150*128).some(Boolean));
  });
}

test('四职业动画：统一14帧、完整五种姿态、快速攻击不截断第四帧、重复注册安全', () => {
  const { registerPixelAnimations }=loadTs('src/assets/PixelFactory.ts');
  const { HERO_TEXTURES }=loadTs('src/data/classes.ts');
  const textures=new Map(), animations=new Map();
  const scene={
    textures:{get(key){
      if(!textures.has(key)) textures.set(key,{frameTotal:1,frames:[],getSourceImage:()=>({width:key.startsWith('hero_')?448:96}),add(i,_s,x,y,w,h){this.frames.push({i,x,y,w,h});this.frameTotal++;}});
      return textures.get(key);
    }},
    anims:{exists:key=>animations.has(key),create:config=>animations.set(config.key,config)},
  };
  registerPixelAnimations(scene);
  const count=animations.size;
  for(const cls of CLASS_LIST){
    for (const key of [HERO_TEXTURES[cls.id], `${HERO_TEXTURES[cls.id]}_awakened`]) {
    assert.equal(textures.get(key).frames.length,14);
    for(const [pose,frames] of Object.entries({idle:[4,5,6,7],walk:[0,1,2,3],attack:[8,9,10,11],dash:[12],hurt:[13]})){
      const anim=animations.get(`${key}_${pose}`);
      assert.deepEqual(anim.frames.map(f=>f.frame),frames);
      assert.equal(anim.repeat,['idle','walk'].includes(pose)?-1:0);
    }
    near(4000/animations.get(`${key}_attack`).frameRate,Math.min(250,cls.attackCooldown));
    }
  }
  registerPixelAnimations(scene);
  assert.equal(animations.size,count);
  assert.ok([...textures.values()].filter(t=>t.frames.length===14).length===8);
});

test('四职业觉醒：只由各自代表突变激活，名称双语且新局不继承', () => {
  const {AWAKENINGS,isAwakened,portraitKey,awakenedHeroKey}=loadTs('src/data/awakenings.ts');
  const {MUTATIONS,RunBuild}=loadTs('src/systems/RunBuild.ts');
  const triggers=new Set();
  for(const {id} of CLASS_LIST){
    const a=AWAKENINGS[id],build=new RunBuild(id);triggers.add(a.mutation);
    assert.equal(MUTATIONS.find(m=>m.id===a.mutation).owner,id);
    assert.equal(a.name.length,2);assert.ok(a.name.every(n=>n.length>1));
    assert.equal(isAwakened(id,build.owned),false);
    build.acquire('shared_feast');assert.equal(isAwakened(id,build.owned),false);
    build.acquire(a.mutation);assert.equal(isAwakened(id,build.owned),true);
    for(const other of CLASS_LIST.filter(c=>c.id!==id))assert.equal(isAwakened(other.id,build.owned),false);
    assert.equal(awakenedHeroKey(id),`hero_${id}_awakened`);
    assert.equal(portraitKey(id,true),`portrait_${id}_awakened`);
    assert.equal(portraitKey(id),`portrait_${id}`);
    assert.equal(isAwakened(id,new RunBuild(id).owned),false);
  }
  assert.equal(triggers.size,4);
});
test('四职业觉醒绘制：确定性、14帧无越界、脚底不变、肖像保持透明边距', () => {
  const {drawAwakenedHero,drawAwakenedPortrait}=loadTs('src/assets/HeroAwakening.ts');
  for(const {id} of CLASS_LIST){
    for(let frame=0;frame<14;frame++){
      const draw=()=>{const r=raster(32,32),p=r.p;r.p=function(x,y,c){assert.ok(x>=0&&x<32&&y>=0&&y<32,`${id} ${frame} ${x},${y}`);p.call(r,x,y,c);};drawAwakenedHero(r,id,frame,false);drawAwakenedHero(r,id,frame,true);return r;};
      const a=draw(),b=draw();assert.deepEqual(a.pixels,b.pixels);assert.ok(a.pixels.filter(Boolean).length>30);assert.ok(a.pixels.slice(26*32).every(p=>!p));
    }
    const a=raster(128,160),b=raster(128,160);
    for(const r of [a,b]){drawAwakenedPortrait(r,id,false);drawAwakenedPortrait(r,id,true);}
    assert.deepEqual(a.pixels,b.pixels);assert.ok(a.pixels.filter(Boolean).length>200);
    for(let y=0;y<160;y++){assert.equal(a.pixels[y*128],null);assert.equal(a.pixels[y*128+127],null);}
    assert.ok(a.pixels.slice(150*128).every(p=>!p));
  }
});

test('新版HUD：真实生命／冷却／楼层进度／计时映射，移动端隐藏重复卡片', () => {
  const s=runFixture();
  s.player.stats={hp:35,maxHp:140,attackCooldown:300,dashCooldown:900,skillCooldown:7000};
  const timers={attack:0,dash:450,skill:3200};
  s.player.cooldownRemaining=action=>timers[action];
  s.floor=3; s.floorKills=18; s.kills=23; s.floorTimer=9000; s.timeAlive=65;
  s.updateHud(200);
  assert.equal(s.hudText.text,'35 / 140');
  assert.equal(s.killsText.text,'击杀  23');
  assert.equal(s.elapsedText.text,'01:05');
  assert.equal(s.floorProgressText.text,'50%');
  assert.deepEqual(s.abilityTexts.map(text=>text.text),['就绪','0.5s','3.2s']);
  assert.equal(s.abilityRoot.parentContainer,s.hudRoot);
  assert.ok(s.abilityTexts.every(text=>text.parentContainer===s.abilityRoot));
  assert.equal(s.abilityRoot.visible,true);
  s.virtual.show(); s.updateHud();
  assert.equal(s.abilityRoot.visible,false);
  assert.equal(s.identityRoot.visible,false);
  assert.deepEqual(s.virtual.cooldownSteps,[100,50,54]);
  s.virtual.hide(); s.updateHud();
  assert.equal(s.abilityRoot.visible,true);
  shutdown(s);
});

test('依赖锁：Electron和electron-builder声明、根锁与安装锁版本一致', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  for (const name of ['electron', 'electron-builder']) {
    const version = pkg.devDependencies[name];
    assert.equal(lock.packages[''].devDependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
});

test('完整性：运行期间所有转译源码内容未改变', () => {
  for (const [file, hash] of hashes) assert.equal(digest(fs.readFileSync(file, 'utf8')), hash, `源码在执行中变化：${file}`);
});
const limitations = [
  '无浏览器/设备：不验证Canvas/WebGL像素、字体、CSS FIT/黑边与真实DOM坐标换算。',
  '使用真实Phaser相机/容器/形状/命中/按下抬起分发；renderList与场景/计时器生命周期由桩驱动，未跑完整Game循环。',
  '不模拟系统touchcancel/手势捕获/后台切换；pointerupoutside通过真实InputPlugin分支与合成pointer验证。',
  '未执行Run.create实体构造/Arcade碰撞步进；墙由真实buildWalls布局+几何body桩生成，不验证实体碰撞解算。',
  '存储拒写为内存桩，不代表浏览器实际配额/磁盘持久化；未执行Death场景防重复结算生命周期。',
];
console.log(`\n结果：通过 ${passed}，失败 ${failed}，总用例 ${passed + failed}；刷怪随机点 ${spawnSamples}；按钮网格点 ${virtualSamples}。`);
console.log(`无法完整模拟的边界：${limitations.length}类（不计入通过数）`);
limitations.forEach((line, i) => console.log(`${i + 1}. ${line}`));
console.log('目标源码 SHA256（前12位）：');
for (const [file, hash] of hashes) {
  if (/config\.ts$|transitions\.ts$|TextButton\.ts$|VirtualControls\.ts$|RunScene\.ts$|TalentScene\.ts$|ClassSelectScene\.ts$|SaveSystem\.ts$/.test(file)) console.log(`${path.relative(ROOT, file)} ${hash.slice(0, 12)}`);
}
if (failures.length) console.error(`失败用例：${failures.join('；')}`);
process.exitCode = failed ? 1 : 0;
