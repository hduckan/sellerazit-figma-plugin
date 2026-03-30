/**
 * 셀러들의 아지트 디자이너 — HTML to Figma 플러그인 v4
 *
 * 핵심 원리 (html.to.design과 동일):
 * 1. UI iframe에서 HTML을 실제 브라우저로 렌더링
 * 2. getComputedStyle + getBoundingClientRect로 정확한 값 읽기
 * 3. 읽은 값을 그대로 Figma 노드로 생성
 *
 * CSS 파싱 불필요 — 브라우저가 계산한 값을 그대로 사용
 */

figma.showUI(__html__, { width: 480, height: 560 });

var hasPretendard = false;

figma.ui.onmessage = async function(msg) {
  if (msg.type === "import-rendered") {
    await buildFromRendered(msg.nodes, msg.title);
  }
  if (msg.type === "close") {
    figma.closePlugin();
  }
};

async function buildFromRendered(nodes, title) {
  try {
    figma.ui.postMessage({ type: "progress", step: "폰트 로딩 중...", percent: 5 });

    // Pretendard 우선, 실패 시 Inter 폴백
    var fonts = [
      { family: "Pretendard", style: "Regular" },
      { family: "Pretendard", style: "Medium" },
      { family: "Pretendard", style: "SemiBold" },
      { family: "Pretendard", style: "Bold" },
      { family: "Pretendard", style: "ExtraBold" },
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Medium" },
      { family: "Inter", style: "Semi Bold" },
      { family: "Inter", style: "Bold" },
    ];
    for (var i = 0; i < fonts.length; i++) {
      try {
        await figma.loadFontAsync(fonts[i]);
        if (fonts[i].family === "Pretendard") hasPretendard = true;
      } catch (e) { /* skip */ }
    }

    figma.ui.postMessage({ type: "progress", step: "Figma 레이아웃 생성 중...", percent: 15 });

    // 최상위 프레임
    var root = figma.createFrame();
    root.name = title || "상세페이지";

    // 전체 크기 계산
    var maxW = 860, maxH = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.w > maxW) maxW = n.w;
      var bottom = n.y + n.h;
      if (bottom > maxH) maxH = bottom;
    }

    root.resize(maxW, Math.max(maxH, 100));
    root.fills = [solid("#FFFFFF")];

    // 노드 생성
    var total = countNodes(nodes);
    var created = { count: 0 };

    await createNodes(nodes, root, 0, 0, created, total);

    figma.currentPage.appendChild(root);
    figma.viewport.scrollAndZoomIntoView([root]);

    figma.ui.postMessage({ type: "progress", step: "완료!", percent: 100 });
    figma.notify(created.count + "개 노드 생성 완료!");
    figma.ui.postMessage({ type: "done", count: created.count });
  } catch (err) {
    figma.notify("생성 실패: " + err.message, { error: true });
    figma.ui.postMessage({ type: "fail", message: err.message });
  }
}

// 재귀적으로 노드 생성
async function createNodes(nodes, parent, offsetX, offsetY, created, total) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    created.count++;

    if (created.count % 10 === 0) {
      figma.ui.postMessage({
        type: "progress",
        step: "노드 " + created.count + "/" + total + " 생성 중...",
        percent: Math.round(15 + (created.count / total) * 80)
      });
    }

    // 이미지 노드
    if (n.tag === "img" && n.src) {
      await createImageNode(n, parent, offsetX, offsetY);
      continue;
    }

    // 텍스트가 있고 자식이 없는 노드 → 텍스트 노드
    if (n.text && (!n.children || n.children.length === 0)) {
      createTextNode(n, parent, offsetX, offsetY);
      continue;
    }

    // 자식이 있는 노드 → 프레임 (부모 직접 텍스트는 무시 — 자식이 이미 포함)
    if (n.children && n.children.length > 0) {
      var frame = createFrameNode(n, parent, offsetX, offsetY);
      await createNodes(n.children, frame, n.x, n.y, created, total);
      continue;
    }

    // 자식도 텍스트도 없지만 배경색이 있는 노드 → 사각형 (장식용)
    if (n.bg && n.w > 0 && n.h > 0) {
      var rect = figma.createRectangle();
      rect.name = n.tag;
      rect.resize(n.w, Math.max(n.h, 1));
      rect.x = n.x - offsetX;
      rect.y = n.y - offsetY;
      rect.fills = [solid(n.bg)];
      if (n.borderRadius) rect.cornerRadius = n.borderRadius;
      parent.appendChild(rect);
    }
  }
}

// 이미지 노드 생성
async function createImageNode(n, parent, offsetX, offsetY) {
  var w = Math.max(n.w, 10);
  var h = Math.max(n.h, 10);

  try {
    var image = await figma.createImageAsync(n.src);
    var rect = figma.createRectangle();
    rect.name = n.alt || "사진";
    rect.resize(w, h);
    rect.x = n.x - offsetX;
    rect.y = n.y - offsetY;
    if (n.borderRadius) rect.cornerRadius = n.borderRadius;
    rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    parent.appendChild(rect);
  } catch (e) {
    // 이미지 로드 실패 → 자리표시자
    var ph = figma.createRectangle();
    ph.name = n.alt || "이미지";
    ph.resize(w, h);
    ph.x = n.x - offsetX;
    ph.y = n.y - offsetY;
    ph.fills = [solid("#F1F3F5")];
    parent.appendChild(ph);
  }
}

// 텍스트 노드 생성 (segments 지원 — 부분별 다른 스타일)
function createTextNode(n, parent, offsetX, offsetY) {
  if (!n.text) return;

  var node = figma.createText();
  node.name = n.tag || "text";

  // 기본 스타일 먼저 적용
  var baseFontSize = n.fontSize || 16;
  var baseWeight = n.fontWeight || 400;
  node.fontName = { family: fontFamily(), style: wts(baseWeight) };
  node.fontSize = baseFontSize;
  node.characters = n.text;
  if (n.color) node.fills = [solid(n.color)];

  // segments가 있으면 부분별 스타일 적용
  if (n.segments && n.segments.length > 1) {
    var pos = 0;
    for (var si = 0; si < n.segments.length; si++) {
      var seg = n.segments[si];
      var segText = seg.text;
      // 텍스트에서 이 segment의 위치 찾기
      var idx = n.text.indexOf(segText, pos);
      if (idx === -1) continue;
      var start = idx;
      var end = idx + segText.length;
      if (start >= end || end > n.text.length) continue;

      try {
        // 해당 범위에 폰트 로드 + 적용
        var segStyle = wts(seg.fontWeight || baseWeight);
        node.setRangeFontName(start, end, { family: fontFamily(), style: segStyle });
        if (seg.fontSize && seg.fontSize !== baseFontSize) {
          node.setRangeFontSize(start, end, seg.fontSize);
        }
        if (seg.color && seg.color !== n.color) {
          node.setRangeFills(start, end, [solid(seg.color)]);
        }
      } catch (e) { /* skip range errors */ }

      pos = end;
    }
  }

  var w = Math.max(n.w, 20);
  node.resize(w, Math.max(n.h, node.height));
  node.textAutoResize = "HEIGHT";

  node.x = Math.round((n.x - offsetX) * 10) / 10;
  node.y = Math.round((n.y - offsetY) * 10) / 10;

  if (n.textAlign === "center") node.textAlignHorizontal = "CENTER";
  else if (n.textAlign === "right" || n.textAlign === "end") node.textAlignHorizontal = "RIGHT";

  if (n.lineHeight && n.lineHeight > 0) {
    node.lineHeight = { value: n.lineHeight, unit: "PIXELS" };
  }
  if (n.letterSpacing && n.letterSpacing !== 0) {
    node.letterSpacing = { value: n.letterSpacing, unit: "PIXELS" };
  }

  parent.appendChild(node);
}

// 프레임 노드 생성
function createFrameNode(n, parent, offsetX, offsetY) {
  var frame = figma.createFrame();
  frame.name = n.tag || "frame";
  frame.resize(Math.max(n.w, 1), Math.max(n.h, 1));
  frame.x = Math.round((n.x - offsetX) * 10) / 10;
  frame.y = Math.round((n.y - offsetY) * 10) / 10;

  // 배경색
  if (n.bg) {
    frame.fills = [solid(n.bg)];
  } else {
    frame.fills = [];
  }

  // border-radius
  if (n.borderRadius) frame.cornerRadius = n.borderRadius;

  // 투명도
  if (n.opacity !== undefined && n.opacity < 1) {
    frame.opacity = n.opacity;
  }

  // 클리핑
  frame.clipsContent = false;

  // box-shadow → Figma dropShadow
  if (n.boxShadow && n.boxShadow !== "none") {
    try {
      var shadowMatch = n.boxShadow.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)\s+(\d+)px\s+(\d+)px\s+(\d+)px/);
      if (shadowMatch) {
        frame.effects = [{
          type: "DROP_SHADOW",
          visible: true,
          blendMode: "NORMAL",
          color: {
            r: parseInt(shadowMatch[1]) / 255,
            g: parseInt(shadowMatch[2]) / 255,
            b: parseInt(shadowMatch[3]) / 255,
            a: parseFloat(shadowMatch[4] || "1"),
          },
          offset: { x: parseInt(shadowMatch[5]), y: parseInt(shadowMatch[6]) },
          radius: parseInt(shadowMatch[7]),
        }];
      }
    } catch (e) { /* skip */ }
  }

  parent.appendChild(frame);
  return frame;
}

// 노드 총 개수 카운트
function countNodes(nodes) {
  var count = 0;
  for (var i = 0; i < nodes.length; i++) {
    count++;
    if (nodes[i].children) count += countNodes(nodes[i].children);
  }
  return count;
}

// 유틸리티
function solid(hex) {
  if (!hex) return { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
  return { type: "SOLID", color: hexRgb(hex) };
}

function hexRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length < 6) hex = "111827";
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

function wts(w) {
  if (w >= 800) return hasPretendard ? "ExtraBold" : "Bold";
  if (w >= 700) return "Bold";
  if (w >= 600) return hasPretendard ? "SemiBold" : "Semi Bold";
  if (w >= 500) return "Medium";
  return "Regular";
}

function fontFamily() {
  return hasPretendard ? "Pretendard" : "Inter";
}
