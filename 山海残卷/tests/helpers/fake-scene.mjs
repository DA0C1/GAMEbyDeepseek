// Minimal rendering substitute for scene action tests. Production scene methods,
// buttons, card pickers and delayed callbacks still execute unchanged.
export function installFakePhaser() {
  globalThis.Phaser = {
    Scene: class {},
    Display: { Color: { HexStringToColor: () => ({ color: 0, red: 0, green: 0, blue: 0 }) } },
    Math: { Between: (a) => a, FloatBetween: (a) => a }
  };
}

export function fakeScene(scene) {
  const objects = [], timers = [], tweens = [], transitions = [];
  const drawing = ['clear', 'fillStyle', 'lineStyle', 'fillRect', 'strokeRect',
    'fillRoundedRect', 'strokeRoundedRect', 'fillCircle', 'strokeCircle',
    'beginPath', 'moveTo', 'lineTo', 'strokePath', 'lineBetween', 'setShadow',
    'setTint', 'setBlendMode', 'explode', 'stop', 'generateTexture'];

  function node(type, args = []) {
    const object = {
      type, x: args[0] || 0, y: args[1] || 0,
      width: 100, height: 100, scaleX: 1, scaleY: 1, depth: 0,
      alpha: 1, active: true, destroyed: false, list: [], listeners: {},
      text: type === 'Text' ? args[2] : undefined,
      on(event, callback) {
        (this.listeners[event] ||= []).push(callback);
        return this;
      },
      once(event, callback) {
        const once = (...values) => { this.off(event, once); callback(...values); };
        return this.on(event, once);
      },
      off(event, callback) {
        this.listeners[event] = (this.listeners[event] || []).filter(fn => fn !== callback);
        return this;
      },
      listenerCount(event) { return (this.listeners[event] || []).length; },
      emit(event, ...values) {
        if (this.destroyed) return this;
        for (const callback of [...(this.listeners[event] || [])]) callback(...values);
        return this;
      },
      add(children) {
        for (const child of Array.isArray(children) ? children : [children]) {
          child.parentContainer = this;
          this.list.push(child);
        }
        return this;
      },
      removeAll(destroy) {
        if (destroy) this.list.forEach(child => child.destroy());
        this.list = [];
        return this;
      },
      destroy() {
        if (this.destroyed) return;
        this.emit('destroy');
        this.removeAll(true);
        this.active = false;
        this.destroyed = true;
        this.input = null;
      },
      setInteractive() { this.input = { enabled: true }; return this; },
      disableInteractive() { if (this.input) this.input.enabled = false; return this; },
      setOrigin() { return this; },
      setScrollFactor() { return this; },
      setDepth(value) { this.depth = value; return this; },
      setAlpha(value) { this.alpha = value; return this; },
      setText(value) { this.text = value; return this; },
      setColor(value) { this.color = value; return this; },
      setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
      setDisplaySize(w, h) { this.width = w; this.height = h; return this; },
      setData(key, value) { (this.data ||= {})[key] = value; return this; }
    };
    for (const method of drawing) object[method] = function () { return this; };
    objects.push(object);
    return object;
  }

  scene.add = {};
  for (const type of ['container', 'graphics', 'text', 'image', 'zone', 'rectangle', 'particles']) {
    scene.add[type] = (...args) => node(type[0].toUpperCase() + type.slice(1), args);
  }
  scene.make = { graphics: () => node('Graphics') };
  // Card textures are treated as cached: these tests exercise actions, not Canvas.
  scene.textures = { exists: () => true };
  scene.input = { enabled: true, keyboard: node('Keyboard'), on() {}, once() {} };
  scene.events = { once() {}, on() {} };
  scene.children = { list: objects, getAll: () => objects.filter(o => !o.destroyed) };
  scene.cameras = { main: { fadeIn() {}, fadeOut() {}, flash() {}, shake() {} } };
  scene.time = {
    now: 1000,
    delayedCall(delay, callback) {
      const timer = { delay, callback, removed: false, remove() { this.removed = true; } };
      timers.push(timer);
      return timer;
    }
  };
  scene.tweens = {
    add(config) {
      tweens.push(config);
      return { stop() { config.canceled = true; }, remove() { config.canceled = true; } };
    },
    killTweensOf(target) {
      const targets = Array.isArray(target) ? target : [target];
      for (const tween of tweens) {
        const animated = Array.isArray(tween.targets) ? tween.targets : [tween.targets];
        if (animated.some(item => targets.includes(item))) tween.canceled = true;
      }
    }
  };
  scene.scene = { start(...args) { transitions.push(args); } };

  return {
    scene, objects, timers, tweens, transitions,
    flushTimers(delay) {
      const ready = timers.filter(t => !t.removed && (delay === undefined || t.delay === delay));
      for (const timer of ready) { timer.removed = true; timer.callback(); }
    },
    completeTweens(duration) {
      const ready = tweens.filter(t => !t.completed && !t.canceled && (duration === undefined || t.duration === duration));
      for (const tween of ready) { tween.completed = true; tween.onComplete?.(); }
    },
    button(label) {
      return objects.find(o => !o.destroyed && o.type === 'Container' && o.zone &&
        o.list.some(child => child.text?.replace(/\s/g, '') === label.replace(/\s/g, '')));
    },
    pickers() {
      return objects.filter(o => !o.destroyed && o.type === 'Container' &&
        o.list.some(child => child.type === 'Container') &&
        o.list.some(child => child.type === 'Text' && ['修　符', '铭　刻', '擦　符'].includes(child.text)));
    },
    pickFirst(layer) {
      const content = layer.list.find(child => child.type === 'Container');
      const zone = content?.list.find(child => child.type === 'Zone' && child.listeners.pointerdown);
      if (!zone) throw new Error('No selectable card in picker');
      zone.emit('pointerdown');
    },
    cancelPicker(layer) {
      const zone = layer.list.filter(child => child.type === 'Zone' && child.listeners.pointerdown).at(-1);
      if (!zone) throw new Error('No cancel button in picker');
      zone.emit('pointerdown', {}, 0, 0, { stopPropagation() {} });
    }
  };
}
