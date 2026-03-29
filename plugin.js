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

    var fonts = [
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Medium" },
      { family: "Inter", style: "Semi Bold" },
      { family: "Inter", style: "Bold" },
    ];
    for (var i = 0; i < fonts.length; i++) {
      try { await figma.loadFontAsync(fonts[i]); } catch (e) { /* skip */ }
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

    // 텍스트가 있고 자식도 있는 노드 → 프레임 + 텍스트
    // 자식이 있는 노드 → 프레임
    if (n.children && n.children.length > 0) {
      var frame = createFrameNode(n, parent, offsetX, offsetY);
      // 자식 노드 생성 (부모의 위치를 offset으로 전달)
      await createNodes(n.children, frame, n.x, n.y, created, total);

      // 이 프레임에 직접 텍스트가 있으면 텍스트 노드도 추가
      if (n.text) {
        var textNode = figma.createText();
        textNode.fontName = { family: "Inter", style: wts(n.fontWeight || 400) };
        textNode.fontSize = n.fontSize || 16;
        textNode.characters = n.text;
        if (n.color) textNode.fills = [solid(n.color)];
        textNode.resize(n.w - n.paddingLeft - n.paddingRight, textNode.height);
        textNode.textAutoResize = "HEIGHT";
        frame.appendChild(textNode);
      }
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

// 텍스트 노드 생성
function createTextNode(n, parent, offsetX, offsetY) {
  if (!n.text) return;

  var node = figma.createText();
  node.name = n.tag || "text";
  node.fontName = { family: "Inter", style: wts(n.fontWeight || 400) };
  node.fontSize = n.fontSize || 16;
  node.characters = n.text;

  if (n.color) node.fills = [solid(n.color)];

  var w = Math.max(n.w, 20);
  node.resize(w, node.height);
  node.textAutoResize = "HEIGHT";

  node.x = n.x - offsetX;
  node.y = n.y - offsetY;

  // 정렬
  if (n.textAlign === "center") node.textAlignHorizontal = "CENTER";
  else if (n.textAlign === "right" || n.textAlign === "end") node.textAlignHorizontal = "RIGHT";

  // 행간
  if (n.lineHeight && n.lineHeight > 0) {
    node.lineHeight = { value: n.lineHeight, unit: "PIXELS" };
  }

  // 자간
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
  frame.x = n.x - offsetX;
  frame.y = n.y - offsetY;

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

  // 클리핑 (overflow hidden 효과)
  frame.clipsContent = true;

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
  if (w >= 700) return "Bold";
  if (w >= 600) return "Semi Bold";
  if (w >= 500) return "Medium";
  return "Regular";
}
