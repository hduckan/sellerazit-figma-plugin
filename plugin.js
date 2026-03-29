/**
 * 셀러들의 아지트 디자이너 — Figma 플러그인
 * 웹 빌더에서 만든 상세페이지 HTML을 Figma 편집 가능한 레이아웃으로 변환합니다.
 *
 * 자체 JSON 스키마(SELLERAZIT_IMPORT)를 사용하며,
 * 웹 빌더의 /api/export/figma 엔드포인트에서 생성된 JSON을 처리합니다.
 */

figma.showUI(__html__, { width: 460, height: 580 });

// 이미지 로딩 대기 맵
var pendingImages = {};

// 메시지 핸들러
figma.ui.onmessage = async (msg) => {
  if (msg.type === "import-page") {
    await handleImport(msg.payload);
  }
  if (msg.type === "image-bytes") {
    // UI에서 가져온 이미지 바이트 처리
    var info = pendingImages[msg.nodeId];
    if (info) {
      try {
        var imgData = figma.createImage(new Uint8Array(msg.bytes));
        var rect = figma.createRectangle();
        rect.name = "사진";
        rect.resize(info.w, info.h);
        rect.cornerRadius = 10;
        rect.fills = [{ type: "IMAGE", imageHash: imgData.hash, scaleMode: "FILL" }];
        // 기존 안내 텍스트 제거
        var children = [];
        for (var i = 0; i < info.frame.children.length; i++) children.push(info.frame.children[i]);
        for (var i = 0; i < children.length; i++) children[i].remove();
        info.frame.appendChild(rect);
      } catch (e) {
        // 실패 시 안내 텍스트 유지
      }
      delete pendingImages[msg.nodeId];
    }
  }
  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// 메인 임포트 로직
async function handleImport(payload) {
  try {
    if (!payload) {
      figma.notify("JSON 데이터가 없습니다.", { error: true });
      return;
    }

    // 두 형식 모두 지원: SELLERAZIT_IMPORT (새) + CREATE_LAYOUT (이전)
    var page, sections;
    if (payload.type === "SELLERAZIT_IMPORT" && payload.pages) {
      page = payload.pages[0];
      sections = page && page.sections;
    } else if (payload.type === "CREATE_LAYOUT" && payload.data) {
      // 이전 형식 호환
      var layout = payload.data.layout || payload.data;
      page = { title: layout.name, width: layout.width };
      sections = [];
      if (layout.children) {
        for (var i = 0; i < layout.children.length; i++) {
          var s = layout.children[i];
          var elements = [];
          if (s.children) {
            for (var j = 0; j < s.children.length; j++) {
              var c = s.children[j];
              if (c.type === "TEXT") {
                elements.push({ tag: "text", role: c.name, value: c.content, size: c.fontSize, weight: c.fontWeight, color: c.color, align: c.textAlign, width: c.width });
              } else if (c.type === "IMAGE_AREA") {
                elements.push({ tag: "image", role: c.name, src: c.src, width: c.width, height: c.height });
              }
            }
          }
          sections.push({ id: s.name, bg: s.background, elements: elements });
        }
      }
    } else {
      figma.notify("지원하지 않는 JSON 형식입니다.", { error: true });
      return;
    }

    if (!sections || !sections.length) {
      figma.notify("섹션 데이터가 없습니다.", { error: true });
      return;
    }

    figma.ui.postMessage({ type: "progress", step: "폰트 로딩 중...", percent: 5 });

    // 폰트 로딩
    const fonts = [
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Medium" },
      { family: "Inter", style: "Semi Bold" },
      { family: "Inter", style: "Bold" },
    ];
    for (const f of fonts) {
      try { await figma.loadFontAsync(f); } catch (e) { /* skip */ }
    }

    // 최상위 프레임
    const root = figma.createFrame();
    root.name = page.title || "상세페이지";
    root.resize(page.width || 860, 100);
    root.layoutMode = "VERTICAL";
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "FIXED";
    root.fills = [solid("#FFFFFF")];

    const total = sections.length;

    // 섹션 순회
    for (let i = 0; i < total; i++) {
      const section = sections[i];
      figma.ui.postMessage({
        type: "progress",
        step: `섹션 ${i + 1}/${total} 생성 중...`,
        percent: Math.round(10 + (i / total) * 85),
      });

      const sectionFrame = buildSection(section, page.width || 860);
      root.appendChild(sectionFrame);
    }

    // 캔버스에 배치
    figma.currentPage.appendChild(root);
    figma.viewport.scrollAndZoomIntoView([root]);

    figma.ui.postMessage({ type: "progress", step: "완료!", percent: 100 });
    figma.notify(`${total}개 섹션 생성 완료!`);
    figma.ui.postMessage({ type: "done", count: total });
  } catch (err) {
    figma.notify("생성 실패: " + err.message, { error: true });
    figma.ui.postMessage({ type: "fail", message: err.message });
  }
}

// ── 섹션 빌더 ──

function buildSection(section, canvasWidth) {
  const frame = figma.createFrame();
  frame.name = section.id || "Section";
  frame.resize(canvasWidth, 10);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingTop = 56;
  frame.paddingBottom = 56;
  frame.paddingLeft = 48;
  frame.paddingRight = 48;
  frame.itemSpacing = 20;
  frame.fills = section.bg ? [solid(section.bg)] : [solid("#FFFFFF")];

  if (section.elements) {
    for (const el of section.elements) {
      const node = renderElement(el, canvasWidth - 96);
      if (node) frame.appendChild(node);
    }
  }

  return frame;
}

// ── 요소 렌더러 ──

function renderElement(el, availWidth) {
  switch (el.tag) {
    case "text": return renderText(el, availWidth);
    case "image": return renderImage(el, availWidth);
    case "group": return renderGroup(el, availWidth);
    case "rule": return renderRule(availWidth);
    default: return renderText(el, availWidth);
  }
}

function renderText(el, availWidth) {
  const node = figma.createText();
  node.name = el.role || "텍스트";

  const size = el.size || 16;
  const weight = el.weight || 400;
  node.fontName = { family: "Inter", style: weightToStyle(weight) };
  node.fontSize = size;
  node.characters = el.value || "";
  node.fills = el.color ? [solid(el.color)] : [solid("#111827")];
  node.resize(Math.min(el.width || availWidth, availWidth), node.height);
  node.textAutoResize = "HEIGHT";

  // 정렬
  if (el.align === "center") node.textAlignHorizontal = "CENTER";
  else if (el.align === "right") node.textAlignHorizontal = "RIGHT";

  // 행간
  node.lineHeight = { value: size * (size >= 28 ? 1.25 : 1.65), unit: "PIXELS" };

  return node;
}

function renderImage(el, availWidth) {
  const w = Math.min(el.width || availWidth, availWidth);
  const h = el.height || 360;

  const frame = figma.createFrame();
  frame.name = el.role || "이미지";
  frame.resize(w, h);
  frame.cornerRadius = 10;
  frame.fills = [solid("#F1F3F5")];

  // 안내 텍스트
  const hint = figma.createText();
  hint.fontName = { family: "Inter", style: "Medium" };
  hint.fontSize = 13;
  hint.characters = el.src ? "이미지 로딩 중..." : "사진을 추가하세요";
  hint.fills = [solid("#9CA3AF")];
  hint.textAlignHorizontal = "CENTER";
  hint.resize(w, 18);
  hint.x = 0;
  hint.y = h / 2 - 9;
  frame.appendChild(hint);

  // 이미지 URL이 있으면 UI를 통해 로드 요청
  if (el.src) {
    var nodeId = frame.id;
    pendingImages[nodeId] = { frame: frame, w: w, h: h };
    figma.ui.postMessage({ type: "load-image", url: el.src, nodeId: nodeId });
  }

  return frame;
}

function renderGroup(el, availWidth) {
  const frame = figma.createFrame();
  frame.name = el.role || "그룹";
  frame.resize(availWidth, 10);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 16;
  frame.fills = el.bg ? [solid(el.bg)] : [];

  if (el.children) {
    for (const child of el.children) {
      const node = renderElement(child, availWidth);
      if (node) frame.appendChild(node);
    }
  }

  return frame;
}

function renderRule(availWidth) {
  const rect = figma.createRectangle();
  rect.name = "구분선";
  rect.resize(availWidth, 1);
  rect.fills = [solid("#E5E7EB")];
  return rect;
}

// ── 이미지 비동기 로드 ──


// ── 유틸리티 ──

function solid(hex) {
  return { type: "SOLID", color: hexRgb(hex) };
}

function hexRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

function weightToStyle(w) {
  if (w >= 700) return "Bold";
  if (w >= 600) return "Semi Bold";
  if (w >= 500) return "Medium";
  return "Regular";
}
