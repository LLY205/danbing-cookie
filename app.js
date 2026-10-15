(() => {
  const canvas = document.getElementById('cookieCanvas');
  const canvasWrap = document.getElementById('canvasWrap');
  const ctx = canvas.getContext('2d');
  const bakeButton = document.getElementById('bakeButton');
  const exportButton = document.getElementById('exportButton');
  const undoButton = document.getElementById('undoButton');
  const clearButton = document.getElementById('clearButton');
  const icingButton = document.getElementById('icingButton');
  const icingDoneButton = document.getElementById('icingDoneButton');
  const icingPanel = document.getElementById('icingPanel');
  const icingColorInput = document.getElementById('icingColor');
  const icingColorPreview = document.getElementById('icingColorPreview');
  const icingColorValue = document.getElementById('icingColorValue');
  const newIcingLayerButton = document.getElementById('newIcingLayerButton');
  const icingLayerList = document.getElementById('icingLayerList');
  const pipingBagCursor = document.getElementById('pipingBagCursor');
  const bakeOverlay = document.getElementById('bakeOverlay');

  const palette = {
    original: { batter: '#f4b92d', shadow: '#c87f16', highlight: '#fff1aa', bakedCenter: '#f5c957', baked: '#dda02c', crumb: '#a96318' },
    cocoa: { batter: '#875039', shadow: '#542d22', highlight: '#d4a27b', bakedCenter: '#986349', baked: '#6b3d2b', crumb: '#3b211a' },
  };
  // The batter is intentionally thinner than a normal paint brush: it should spread a little after leaving the nozzle.
  const brushSizes = { small: 8, medium: 15, large: 24 };
  const icingBrushSizes = { small: 7, medium: 14, large: 23 };
  let flavor = 'original';
  let brushSize = 'medium';
  let icingSize = 'medium';
  let icingColor = icingColorInput.value;
  let strokes = [];
  let icingLayers = [];
  let activeIcingLayerIndex = 0;
  let activeStroke = null;
  let activeIcingStroke = null;
  let isDrawing = false;
  let isBaked = false;
  let isBaking = false;
  let isIcingMode = false;
  let seed = 282;
  let fluidFrame = null;
  let fluidTime = 0;

  function seededRandom() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
      ? normalized.split('').map((part) => part + part).join('')
      : normalized;
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function shiftColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const target = amount >= 0 ? 255 : 0;
    const strength = Math.abs(amount);
    const channel = (value) => Math.round(value + (target - value) * strength);
    return `rgb(${channel(rgb.r)}, ${channel(rgb.g)}, ${channel(rgb.b)})`;
  }

  function makeIcingLayer() {
    return {
      name: `糖霜 ${icingLayers.length + 1}`,
      visible: true,
      strokes: [],
    };
  }

  function ensureIcingLayer() {
    if (!icingLayers.length) icingLayers.push(makeIcingLayer());
    activeIcingLayerIndex = Math.min(activeIcingLayerIndex, icingLayers.length - 1);
    return icingLayers[activeIcingLayerIndex];
  }

  function hasIcingArtwork() {
    return icingLayers.some((layer) => layer.strokes.length);
  }

  function renderIcingLayerList() {
    icingLayerList.replaceChildren();
    icingLayers.forEach((layer, index) => {
      const row = document.createElement('div');
      row.className = `icing-layer-row${index === activeIcingLayerIndex ? ' is-active' : ''}`;
      row.setAttribute('role', 'listitem');

      const selectButton = document.createElement('button');
      selectButton.className = 'icing-layer-select';
      selectButton.type = 'button';
      selectButton.textContent = layer.name;
      selectButton.addEventListener('click', () => {
        activeIcingLayerIndex = index;
        renderIcingLayerList();
      });

      const visibilityButton = document.createElement('button');
      visibilityButton.className = 'icing-layer-visibility';
      visibilityButton.type = 'button';
      visibilityButton.textContent = layer.visible ? '显示' : '隐藏';
      visibilityButton.setAttribute('aria-label', `${layer.name}${layer.visible ? '隐藏' : '显示'}`);
      visibilityButton.addEventListener('click', () => {
        layer.visible = !layer.visible;
        renderIcingLayerList();
        render();
      });

      row.append(selectButton, visibilityButton);
      icingLayerList.append(row);
    });
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function getSurfaceGeometry(width = canvas.width, height = canvas.height) {
    return {
      tray: { x: 18, y: 18, width: width - 36, height: height - 36, radius: 38 },
      paper: { x: 58, y: 47, width: width - 116, height: height - 94, radius: 25 },
    };
  }

  function drawTray(context) {
    const { tray, paper } = getSurfaceGeometry(context.canvas.width, context.canvas.height);
    const width = context.canvas.width;
    const height = context.canvas.height;

    context.fillStyle = '#111212';
    context.fillRect(0, 0, width, height);

    context.save();
    context.shadowColor = 'rgba(0, 0, 0, .34)';
    context.shadowBlur = 18;
    context.shadowOffsetY = 7;
    roundedRect(context, tray.x, tray.y, tray.width, tray.height, tray.radius);
    const metal = context.createLinearGradient(0, tray.y, 0, tray.y + tray.height);
    metal.addColorStop(0, '#343636');
    metal.addColorStop(.12, '#1d1f1f');
    metal.addColorStop(.78, '#111212');
    metal.addColorStop(1, '#080909');
    context.fillStyle = metal;
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, tray.x + 9, tray.y + 9, tray.width - 18, tray.height - 18, tray.radius - 8);
    context.strokeStyle = 'rgba(121, 126, 123, .48)';
    context.lineWidth = 2;
    context.stroke();
    roundedRect(context, tray.x + 18, tray.y + 18, tray.width - 36, tray.height - 36, tray.radius - 15);
    context.strokeStyle = 'rgba(0, 0, 0, .62)';
    context.lineWidth = 4;
    context.stroke();
    context.restore();

    context.save();
    context.shadowColor = 'rgba(0, 0, 0, .42)';
    context.shadowBlur = 13;
    context.shadowOffsetY = 4;
    roundedRect(context, paper.x, paper.y, paper.width, paper.height, paper.radius);
    const paperFill = context.createLinearGradient(paper.x, paper.y, paper.x, paper.y + paper.height);
    paperFill.addColorStop(0, '#eeeae1');
    paperFill.addColorStop(.55, '#e3e0d8');
    paperFill.addColorStop(1, '#d8d5cd');
    context.fillStyle = paperFill;
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, paper.x, paper.y, paper.width, paper.height, paper.radius);
    context.clip();
    context.globalAlpha = .16;
    for (let i = 0; i < 70; i += 1) {
      const px = paper.x - 30 + seededRandom() * (paper.width + 60);
      const py = paper.y - 20 + seededRandom() * (paper.height + 40);
      context.strokeStyle = i % 3 ? '#b7b3aa' : '#faf8f1';
      context.lineWidth = .6 + seededRandom() * .8;
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(px + 28 + seededRandom() * 75, py + (seededRandom() - .5) * 8);
      context.stroke();
    }
    context.globalAlpha = .13;
    for (let i = 0; i < 120; i += 1) {
      const px = paper.x + seededRandom() * paper.width;
      const py = paper.y + seededRandom() * paper.height;
      context.fillStyle = i % 2 ? '#aaa69c' : '#fffdf6';
      context.beginPath();
      context.arc(px, py, .45 + seededRandom() * .75, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.save();
    roundedRect(context, paper.x, paper.y, paper.width, paper.height, paper.radius);
    context.strokeStyle = 'rgba(255, 255, 255, .48)';
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  function drawStage(context, baked = false) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    context.clearRect(0, 0, width, height);
    drawTray(context);
    if (baked) drawBakedEdge(context);
    if (!baked && strokes.length) drawBatterVolume(context);
    drawStrokeLayers(context, baked);
    if (!baked && strokes.length) drawFluidBeads(context);
    if (baked) drawBakedTexture(context);
    if (baked && hasIcingArtwork()) drawIcingLayers(context);
  }

  function traceStroke(context, points, offsetX = 0, offsetY = 0) {
    context.beginPath();
    points.forEach((point, index) => index
      ? context.lineTo(point.x + offsetX, point.y + offsetY)
      : context.moveTo(point.x + offsetX, point.y + offsetY));
    if (points.length === 1) context.lineTo(points[0].x + .1 + offsetX, points[0].y + .1 + offsetY);
  }

  function pointTangent(points, index) {
    if (points.length < 2) return { x: 1, y: 0 };
    const current = points[index];
    const other = points[index === 0 ? 1 : index - 1];
    const dx = current.x - other.x;
    const dy = current.y - other.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  function fillEllipse(context, point, radiusX, radiusY, angle, fillStyle, alpha = 1) {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = fillStyle;
    context.beginPath();
    context.ellipse(point.x, point.y, radiusX, radiusY, angle, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawLiquidLobes(context, stroke, colors, radius) {
    if (stroke.points.length < 5) return;
    const step = Math.max(6, Math.floor(stroke.points.length / 3));
    for (let i = step; i < stroke.points.length - 1; i += step) {
      const tangent = pointTangent(stroke.points, i);
      const normal = { x: -tangent.y, y: tangent.x };
      const point = stroke.points[i];
      const wobble = Math.sin(i * 1.7 + stroke.points.length) * radius * .12;
      fillEllipse(context, {
        x: point.x + normal.x * (radius * .12 + wobble),
        y: point.y + normal.y * (radius * .12 + wobble),
      }, radius * .24, radius * .13, Math.atan2(tangent.y, tangent.x), colors.batter, .2);
    }
  }

  function drawSurfaceGleams(context, stroke, colors, radius) {
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    const points = [first];
    if (stroke.points.length > 8) points.push(stroke.points[Math.floor(stroke.points.length * .55)]);
    points.push(last);
    points.forEach((point, index) => {
      const tangent = pointTangent(stroke.points, index === points.length - 1 ? stroke.points.length - 1 : 0);
      fillEllipse(context, {
        x: point.x - tangent.x * radius * .18,
        y: point.y - tangent.y * radius * .18,
      }, radius * .42, Math.max(1, radius * .105), Math.atan2(tangent.y, tangent.x), colors.highlight, .22);
    });
  }

  function createStrokeMask(context, extraWidth = 0) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = context.canvas.width;
    maskCanvas.height = context.canvas.height;
    const maskContext = maskCanvas.getContext('2d');
    maskContext.lineCap = 'round';
    maskContext.lineJoin = 'round';
    maskContext.strokeStyle = '#fff';
    strokes.forEach((stroke) => {
      if (!stroke.points.length) return;
      const radius = brushSizes[stroke.size] / 2;
      maskContext.lineWidth = radius * 2 + extraWidth;
      traceStroke(maskContext, stroke.points);
      maskContext.stroke();
    });
    return maskCanvas;
  }

  function paintTintedMask(context, maskCanvas, color, alpha, blur = 0, offsetX = 0, offsetY = 0) {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = context.canvas.width;
    layerCanvas.height = context.canvas.height;
    const layerContext = layerCanvas.getContext('2d');
    layerContext.save();
    layerContext.filter = blur ? `blur(${blur}px)` : 'none';
    layerContext.drawImage(maskCanvas, offsetX, offsetY);
    layerContext.restore();
    layerContext.globalCompositeOperation = 'source-in';
    layerContext.globalAlpha = alpha;
    layerContext.fillStyle = color;
    layerContext.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
    context.drawImage(layerCanvas, 0, 0);
  }

  function drawBatterVolume(context) {
    // A single union mask keeps the shadow around the outside of the whole
    // puddle. It avoids turning touching squeezes into separate dark strokes.
    const mask = createStrokeMask(context, 3);
    paintTintedMask(context, mask, '#6d4527', .19, 4.8, 0, 2.2);
  }

  function drawBakedEdge(context) {
    // Build a soft, shared toasted halo for the whole cookie union. Layered
    // masks let the colour fade from the outside inward instead of leaving a
    // sharp dark contour or seams between touching flavours.
    const outerMask = createStrokeMask(context, 11);
    const middleMask = createStrokeMask(context, 6);
    const innerMask = createStrokeMask(context, 2.5);
    paintTintedMask(context, outerMask, '#b17942', .22, 5.8);
    paintTintedMask(context, middleMask, '#a56331', .25, 3.1);
    paintTintedMask(context, innerMask, '#985528', .24, 1.4);
  }

  function createBakedPaint(context, stroke, colors) {
    const bounds = getStrokeBounds(stroke, 0);
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const radius = Math.max(12, Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) * .62);
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, colors.bakedCenter);
    gradient.addColorStop(.58, colors.baked);
    gradient.addColorStop(1, colors.baked);
    return gradient;
  }

  function drawStrokeLayers(context, baked) {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    strokes.forEach((stroke, strokeIndex) => {
      if (!stroke.points.length) return;
      const colors = palette[stroke.flavor];
      const radius = brushSizes[stroke.size] / 2;
      // Every squeeze is painted directly in its batter colour. A per-stroke
      // dark rim makes touching squeezes look like separate brush marks and
      // leaves an unwanted dark seam when cocoa is laid over original batter.
      context.shadowColor = 'transparent';
      context.strokeStyle = baked ? createBakedPaint(context, stroke, colors) : colors.batter;
      context.lineWidth = radius * 2;
      traceStroke(context, stroke.points);
      context.stroke();

      // Keep the liquid swell and gloss on the newest squeeze only, so two
      // consecutive strokes of one flavour read as one continuous puddle.
      if (!baked && strokeIndex === strokes.length - 1) {
        drawLiquidLobes(context, stroke, colors, radius);
        drawSurfaceGleams(context, stroke, colors, radius);
      }
    });
    context.restore();
  }

  function drawFluidBeads(context) {
    const stroke = activeStroke || strokes[strokes.length - 1];
    if (!stroke || !stroke.points.length) return;
    const colors = palette[stroke.flavor];
    const radius = brushSizes[stroke.size] / 2;
    const point = stroke.points[stroke.points.length - 1];
    const tangent = pointTangent(stroke.points, stroke.points.length - 1);
    const normal = { x: -tangent.y, y: tangent.x };
    const wobble = Math.sin(fluidTime / 180) * radius * .16;
    const bead = {
      x: point.x - tangent.x * radius * .72 + normal.x * wobble,
      y: point.y - tangent.y * radius * .72 + normal.y * wobble,
    };
    const beadRadius = Math.max(2.2, radius * .29);
    const gradient = context.createRadialGradient(
      bead.x - beadRadius * .35,
      bead.y - beadRadius * .5,
      0,
      bead.x,
      bead.y,
      beadRadius * 2.1,
    );
    gradient.addColorStop(0, colors.highlight);
    gradient.addColorStop(.5, colors.batter);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.save();
    context.globalAlpha = .54;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(bead.x, bead.y, beadRadius * 2.1, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const drip = {
      x: bead.x - tangent.x * radius * .95 + normal.x * (radius * .32 + wobble),
      y: bead.y - tangent.y * radius * .95 + normal.y * (radius * .32 + wobble),
    };
    fillEllipse(context, drip, Math.max(1.2, radius * .18), Math.max(1.2, radius * .32), Math.atan2(tangent.y, tangent.x), colors.batter, .35);
  }

  function getIcingBounds(stroke, padding = 4) {
    const radius = icingBrushSizes[stroke.size] / 2 + padding;
    const xs = stroke.points.map((point) => point.x);
    const ys = stroke.points.map((point) => point.y);
    return {
      left: Math.max(0, Math.min(...xs) - radius),
      top: Math.max(0, Math.min(...ys) - radius),
      right: Math.min(canvas.width, Math.max(...xs) + radius),
      bottom: Math.min(canvas.height, Math.max(...ys) + radius),
    };
  }

  function createIcingMask(context, layer, extraWidth = 0) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = context.canvas.width;
    maskCanvas.height = context.canvas.height;
    const maskContext = maskCanvas.getContext('2d');
    maskContext.lineCap = 'round';
    maskContext.lineJoin = 'round';
    maskContext.strokeStyle = '#fff';
    layer.strokes.forEach((stroke) => {
      if (!stroke.points.length) return;
      maskContext.lineWidth = icingBrushSizes[stroke.size] + extraWidth;
      traceStroke(maskContext, stroke.points);
      maskContext.stroke();
    });
    return maskCanvas;
  }

  function createIcingEdgeMask(context, layer, thickness = 2.2) {
    const outer = createIcingMask(context, layer);
    const eroded = document.createElement('canvas');
    eroded.width = context.canvas.width;
    eroded.height = context.canvas.height;
    const erodedContext = eroded.getContext('2d');
    erodedContext.drawImage(outer, 0, 0);
    [
      [thickness, 0],
      [-thickness, 0],
      [0, thickness],
      [0, -thickness],
    ].forEach(([offsetX, offsetY]) => {
      erodedContext.globalCompositeOperation = 'destination-in';
      erodedContext.drawImage(outer, offsetX, offsetY);
    });

    const edge = document.createElement('canvas');
    edge.width = context.canvas.width;
    edge.height = context.canvas.height;
    const edgeContext = edge.getContext('2d');
    edgeContext.drawImage(outer, 0, 0);
    edgeContext.globalCompositeOperation = 'destination-out';
    edgeContext.drawImage(eroded, 0, 0);
    return edge;
  }

  function paintIcingBody(context, mask, color) {
    const bodyCanvas = document.createElement('canvas');
    bodyCanvas.width = context.canvas.width;
    bodyCanvas.height = context.canvas.height;
    const bodyContext = bodyCanvas.getContext('2d');
    const light = shiftColor(color, .3);
    const highlight = shiftColor(color, .76);
    const deep = shiftColor(color, -.2);
    const body = bodyContext.createLinearGradient(0, 0, bodyCanvas.width, bodyCanvas.height);
    body.addColorStop(0, highlight);
    body.addColorStop(.2, light);
    body.addColorStop(.62, color);
    body.addColorStop(1, deep);
    bodyContext.fillStyle = body;
    bodyContext.fillRect(0, 0, bodyCanvas.width, bodyCanvas.height);
    bodyContext.globalCompositeOperation = 'destination-in';
    bodyContext.globalAlpha = .98;
    bodyContext.drawImage(mask, 0, 0);
    context.globalAlpha = .98;
    context.drawImage(bodyCanvas, 0, 0);
    context.globalAlpha = 1;
  }

  function drawIcingLayer(context, layer, layerIndex) {
    const strokesInLayer = layer.strokes.filter((stroke) => stroke.points.length);
    if (!strokesInLayer.length) return;
    const layerMask = createIcingMask(context, layer);
    const rimMask = createIcingMask(context, layer, 3.5);
    const edgeMask = createIcingEdgeMask(context, layer);
    const baseColor = strokesInLayer[0].color || icingColor;
    const underside = shiftColor(baseColor, -.3);

    // One shadow for the union of the layer makes touching strokes fuse into
    // one icing mass instead of producing a dark outline around every stroke.
    paintTintedMask(context, rimMask, underside, .19 + layerIndex * .035, 2.6, 0, 1.8 + layerIndex * 1.35);
    paintTintedMask(context, layerMask, underside, .27 + layerIndex * .035, 3.7, 0, 2.6 + layerIndex * 1.5);

    // Merge all strokes of the same colour into one mask before painting the
    // body. Different nozzle sizes can then overlap without leaving a seam or
    // reading as two independent lines.
    const colorGroups = new Map();
    strokesInLayer.forEach((stroke) => {
      const color = stroke.color || icingColor;
      if (!colorGroups.has(color)) colorGroups.set(color, []);
      colorGroups.get(color).push(stroke);
    });
    colorGroups.forEach((group, color) => {
      paintIcingBody(context, createIcingMask(context, { strokes: group }), color);
    });

    // A soft inner rim catches the light around the entire perimeter. The
    // upper-left edge therefore also has a gentle shadow instead of fading
    // into a flat bright border.
    paintTintedMask(context, edgeMask, underside, .32 + layerIndex * .025, .8);
  }

  function drawIcingLayers(context) {
    const icingCanvas = document.createElement('canvas');
    icingCanvas.width = context.canvas.width;
    icingCanvas.height = context.canvas.height;
    const icingContext = icingCanvas.getContext('2d');
    let visibleLayerIndex = 0;
    icingLayers.forEach((layer) => {
      if (!layer.visible) return;
      drawIcingLayer(icingContext, layer, visibleLayerIndex);
      visibleLayerIndex += 1;
    });

    // Keep the entire composed frosting stack inside the baked cookie, not
    // only the pointer path. This also clips soft shadows and highlights at
    // the cookie edge.
    icingContext.globalCompositeOperation = 'destination-in';
    icingContext.globalAlpha = 1;
    icingContext.drawImage(createStrokeMask(context), 0, 0);
    context.drawImage(icingCanvas, 0, 0);
  }

  function getStrokeBounds(stroke, padding = 4) {
    const radius = brushSizes[stroke.size] / 2 + padding;
    const xs = stroke.points.map((point) => point.x);
    const ys = stroke.points.map((point) => point.y);
    return {
      left: Math.max(0, Math.min(...xs) - radius),
      top: Math.max(0, Math.min(...ys) - radius),
      right: Math.min(canvas.width, Math.max(...xs) + radius),
      bottom: Math.min(canvas.height, Math.max(...ys) + radius),
    };
  }

  function drawBakedTexture(context) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = width;
    textureCanvas.height = height;
    const textureContext = textureCanvas.getContext('2d');

    strokes.forEach((stroke) => {
      if (!stroke.points.length) return;
      const colors = palette[stroke.flavor];
      const radius = brushSizes[stroke.size] / 2;
      const bounds = getStrokeBounds(stroke, 5);
      textureContext.clearRect(0, 0, width, height);
      textureContext.save();
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      const sheenRadius = Math.max(14, Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) * .7);
      const sheen = textureContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, sheenRadius);
      sheen.addColorStop(0, colors.highlight);
      sheen.addColorStop(.55, 'rgba(255, 232, 145, .28)');
      sheen.addColorStop(1, 'rgba(109, 55, 20, .18)');
      textureContext.globalAlpha = .16;
      textureContext.fillStyle = sheen;
      textureContext.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

      textureContext.globalAlpha = .34;
      const count = Math.max(24, Math.min(150, Math.floor(stroke.points.length / 1.3) + 24));
      for (let i = 0; i < count; i += 1) {
        const px = bounds.left + seededRandom() * (bounds.right - bounds.left);
        const py = bounds.top + seededRandom() * (bounds.bottom - bounds.top);
        const r = .28 + seededRandom() * Math.max(.85, radius * .16);
        textureContext.fillStyle = i % 5 === 0 ? colors.crumb : colors.highlight;
        textureContext.beginPath();
        textureContext.ellipse(px, py, r * (1.1 + seededRandom() * .75), r * .58, seededRandom() * Math.PI, 0, Math.PI * 2);
        textureContext.fill();
      }
      textureContext.globalAlpha = .2;
      for (let i = 0; i < 4; i += 1) {
        const px = bounds.left + seededRandom() * (bounds.right - bounds.left);
        const py = bounds.top + seededRandom() * (bounds.bottom - bounds.top);
        textureContext.strokeStyle = colors.crumb;
        textureContext.lineWidth = .7 + seededRandom() * 1.1;
        textureContext.beginPath();
        textureContext.arc(px, py, 3 + seededRandom() * 6, seededRandom() * Math.PI, seededRandom() * Math.PI + 1.8);
        textureContext.stroke();
      }
      textureContext.restore();

      textureContext.save();
      textureContext.globalCompositeOperation = 'destination-in';
      textureContext.globalAlpha = 1;
      textureContext.lineCap = 'round';
      textureContext.lineJoin = 'round';
      textureContext.lineWidth = radius * 2;
      textureContext.strokeStyle = '#fff';
      traceStroke(textureContext, stroke.points);
      textureContext.stroke();
      textureContext.restore();

      context.drawImage(textureCanvas, 0, 0);
    });
  }

  function render() {
    seed = 282;
    drawStage(ctx, isBaked);
    canvasWrap.classList.toggle('has-strokes', strokes.length > 0);
  }

  function startFluidAnimation() {
    const hasFluidArtwork = !isBaked && strokes.length;
    if (fluidFrame || !hasFluidArtwork) return;
    const tick = (now) => {
      fluidTime = now;
      render();
      const shouldContinue = !isBaked && strokes.length;
      if (shouldContinue) fluidFrame = requestAnimationFrame(tick);
      else fluidFrame = null;
    };
    fluidFrame = requestAnimationFrame(tick);
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function isInsideCookie(point) {
    const { paper } = getSurfaceGeometry();
    const inset = 12;
    return point.x >= paper.x + inset
      && point.x <= paper.x + paper.width - inset
      && point.y >= paper.y + inset
      && point.y <= paper.y + paper.height - inset;
  }

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + progress * dx), point.y - (start.y + progress * dy));
  }

  function isPointOnCookie(point) {
    return strokes.some((stroke) => {
      const radius = brushSizes[stroke.size] / 2 + 7;
      if (stroke.points.length === 1) return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= radius;
      return stroke.points.some((current, index) => {
        if (index === 0) return false;
        return distanceToSegment(point, stroke.points[index - 1], current) <= radius;
      });
    });
  }

  function updateCursor(event) {
    const rect = canvasWrap.getBoundingClientRect();
    pipingBagCursor.style.left = `${event.clientX - rect.left}px`;
    pipingBagCursor.style.top = `${event.clientY - rect.top}px`;
  }

  function startDrawing(event) {
    if (isBaking) return;
    const point = getPoint(event);
    const drawingIcing = isBaked && isIcingMode;
    if (drawingIcing ? !isPointOnCookie(point) : (isBaked || !isInsideCookie(point))) return;
    isDrawing = true;
    activeStroke = drawingIcing ? null : { flavor, size: brushSize, points: [point] };
    activeIcingStroke = drawingIcing ? { color: icingColor, size: icingSize, points: [point] } : null;
    if (drawingIcing) ensureIcingLayer().strokes.push(activeIcingStroke);
    else strokes.push(activeStroke);
    canvas.setPointerCapture?.(event.pointerId);
    render();
    startFluidAnimation();
  }

  function draw(event) {
    updateCursor(event);
    if (!isDrawing || (!activeStroke && !activeIcingStroke)) return;
    const point = getPoint(event);
    const drawingIcing = Boolean(activeIcingStroke);
    if (drawingIcing ? !isPointOnCookie(point) : !isInsideCookie(point)) return;
    const currentStroke = activeIcingStroke || activeStroke;
    const previous = currentStroke.points[currentStroke.points.length - 1];
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (distance < 2) return;
    currentStroke.points.push(point);
    render();
  }

  function stopDrawing() {
    isDrawing = false;
    activeStroke = null;
    activeIcingStroke = null;
  }

  function selectFlavor(nextFlavor) {
    flavor = nextFlavor;
    document.querySelectorAll('.flavor-button').forEach((button) => button.classList.toggle('is-active', button.dataset.flavor === flavor));
  }

  function selectSize(nextSize) {
    brushSize = nextSize;
    document.querySelectorAll('.size-button[data-size]').forEach((button) => button.classList.toggle('is-active', button.dataset.size === brushSize));
  }

  function selectIcingSize(nextSize) {
    icingSize = nextSize;
    document.querySelectorAll('.icing-size-button').forEach((button) => button.classList.toggle('is-active', button.dataset.icingSize === icingSize));
  }

  function updateIcingColor(nextColor) {
    icingColor = nextColor;
    icingColorInput.value = nextColor;
    icingColorPreview.style.background = nextColor;
    icingColorValue.textContent = nextColor.toUpperCase();
  }

  function setIcingControls(visible) {
    icingPanel.hidden = !visible;
    icingButton.hidden = visible || !isBaked;
    icingDoneButton.hidden = !visible;
    icingPanel.setAttribute('aria-hidden', String(!visible));
  }

  function enterIcingMode() {
    if (!isBaked) return;
    isIcingMode = true;
    ensureIcingLayer();
    bakeButton.hidden = true;
    setIcingControls(true);
    renderIcingLayerList();
    pipingBagCursor.classList.add('is-visible');
    render();
  }

  function exitIcingMode() {
    isIcingMode = false;
    setIcingControls(false);
    pipingBagCursor.classList.remove('is-visible');
    render();
  }

  function createNewIcingLayer() {
    if (!isBaked) return;
    icingLayers.push(makeIcingLayer());
    activeIcingLayerIndex = icingLayers.length - 1;
    renderIcingLayerList();
    render();
  }

  function clearArtwork() {
    strokes = [];
    icingLayers = [];
    activeIcingLayerIndex = 0;
    activeStroke = null;
    activeIcingStroke = null;
    isBaked = false;
    isBaking = false;
    isIcingMode = false;
    bakeButton.disabled = false;
    bakeButton.hidden = false;
    icingButton.hidden = true;
    icingDoneButton.hidden = true;
    icingPanel.hidden = true;
    exportButton.hidden = true;
    exportButton.disabled = true;
    icingLayerList.replaceChildren();
    render();
  }

  function undoArtwork() {
    if (isBaked) {
      const layer = icingLayers[activeIcingLayerIndex];
      if (!layer || !layer.strokes.length) return;
      layer.strokes.pop();
      render();
      startFluidAnimation();
      return;
    }
    if (!strokes.length) return;
    strokes.pop();
    bakeButton.disabled = false;
    exportButton.hidden = true;
    exportButton.disabled = true;
    render();
    startFluidAnimation();
  }

  function bakeArtwork() {
    if (isBaking) return;
    if (!strokes.length) return;
    isIcingMode = false;
    isBaking = true;
    bakeButton.disabled = true;
    icingButton.hidden = true;
    icingDoneButton.hidden = true;
    icingPanel.hidden = true;
    exportButton.hidden = true;
    exportButton.disabled = true;
    pipingBagCursor.classList.remove('is-visible');
    bakeOverlay.classList.add('is-visible');
    bakeOverlay.setAttribute('aria-hidden', 'false');
    const started = performance.now();
    const duration = 2200;
    function tick(now) {
      const progress = Math.min(1, (now - started) / duration);
      if (progress < 1) return requestAnimationFrame(tick);
      setTimeout(finishBaking, 180);
    }
    requestAnimationFrame(tick);
  }

  function finishBaking() {
    isBaking = false;
    isBaked = true;
    bakeOverlay.classList.remove('is-visible');
    bakeOverlay.setAttribute('aria-hidden', 'true');
    bakeButton.hidden = true;
    icingButton.hidden = false;
    icingDoneButton.hidden = true;
    icingPanel.hidden = true;
    exportButton.hidden = false;
    exportButton.disabled = false;
    render();
  }

  function exportTransparentPng() {
    if (!isBaked || !strokes.length) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportContext = exportCanvas.getContext('2d');
    seed = 282;
    drawBakedEdge(exportContext);
    drawStrokeLayers(exportContext, true);
    drawBakedTexture(exportContext);
    if (hasIcingArtwork()) drawIcingLayers(exportContext);
    const link = document.createElement('a');
    link.download = '鸡蛋饼干-透明底.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('pointerenter', (event) => { updateCursor(event); pipingBagCursor.classList.add('is-visible'); });
  canvas.addEventListener('pointerleave', () => { stopDrawing(); pipingBagCursor.classList.remove('is-visible'); });
  document.querySelectorAll('.flavor-button').forEach((button) => button.addEventListener('click', () => selectFlavor(button.dataset.flavor)));
  document.querySelectorAll('.size-button[data-size]').forEach((button) => button.addEventListener('click', () => selectSize(button.dataset.size)));
  document.querySelectorAll('.icing-size-button').forEach((button) => button.addEventListener('click', () => selectIcingSize(button.dataset.icingSize)));
  icingColorInput.addEventListener('input', (event) => updateIcingColor(event.target.value));
  bakeButton.addEventListener('click', bakeArtwork);
  icingButton.addEventListener('click', enterIcingMode);
  icingDoneButton.addEventListener('click', exitIcingMode);
  newIcingLayerButton.addEventListener('click', createNewIcingLayer);
  exportButton.addEventListener('click', exportTransparentPng);
  clearButton.addEventListener('click', clearArtwork);
  undoButton.addEventListener('click', undoArtwork);

  exportButton.disabled = true;
  updateIcingColor(icingColor);
  setIcingControls(false);
  renderIcingLayerList();
  render();
})();
