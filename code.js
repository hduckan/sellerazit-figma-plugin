// 셀러아지트 디자이너 — Figma 플러그인 메인 코드
// HTML 상세페이지의 JSON 구조를 읽어서 Figma 캔버스에 레이아웃을 생성합니다.

figma.showUI(__html__, { width: 480, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "create-layout") {
    try {
      const data = msg.data;
      const layout = data.data ? data.data.layout : data.layout || data;
      if (!layout || !layout.children) {
        figma.notify("JSON 구조가 올바르지 않습니다.", { error: true });
        return;
      }

      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });

      const pageFrame = figma.createFrame();
      pageFrame.name = layout.name || "상세페이지";
      pageFrame.resize(layout.width || 860, 100);
      pageFrame.layoutMode = "VERTICAL";
      pageFrame.primaryAxisSizingMode = "AUTO";
      pageFrame.counterAxisSizingMode = "FIXED";
      pageFrame.fills = [{ type: "SOLID", color: hexToRgb("#FFFFFF") }];

      for (const section of layout.children) {
        const sectionFrame = createSection(section, layout.width || 860);
        pageFrame.appendChild(sectionFrame);
      }

      figma.currentPage.appendChild(pageFrame);
      figma.viewport.scrollAndZoomIntoView([pageFrame]);
      figma.notify(`${layout.children.length}개 섹션이 생성되었습니다!`);
      figma.ui.postMessage({ type: "success", sections: layout.children.length });
    } catch (err) {
      figma.notify("생성 실패: " + err.message, { error: true });
      figma.ui.postMessage({ type: "error", message: err.message });
    }
  }

  if (msg.type === "fetch-image") {
    try {
      const imageData = await figma.createImageAsync(msg.url);
      figma.ui.postMessage({ type: "image-ready", id: msg.id, imageHash: imageData.hash });
    } catch {
      figma.ui.postMessage({ type: "image-error", id: msg.id });
    }
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};

// 섹션 프레임 생성
function createSection(section, canvasWidth) {
  const frame = figma.createFrame();
  frame.name = section.name || "Section";
  frame.resize(canvasWidth, 100);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingTop = 60;
  frame.paddingBottom = 60;
  frame.paddingLeft = 50;
  frame.paddingRight = 50;
  frame.itemSpacing = 24;

  if (section.background) {
    frame.fills = [{ type: "SOLID", color: hexToRgb(section.background) }];
  }

  if (section.children) {
    for (const child of section.children) {
      const node = createNode(child, canvasWidth);
      if (node) frame.appendChild(node);
    }
  }

  return frame;
}

// 노드 생성 (타입별 분기)
function createNode(child, canvasWidth) {
  switch (child.type) {
    case "TEXT":
      return createTextNode(child, canvasWidth);
    case "IMAGE_AREA":
      return createImageNode(child);
    case "FRAME":
      return createFrameNode(child, canvasWidth);
    case "DIVIDER":
      return createDivider(canvasWidth);
    default:
      return createTextNode(child, canvasWidth);
  }
}

// 텍스트 노드
function createTextNode(child, canvasWidth) {
  const text = figma.createText();
  text.name = child.name || "Text";

  const fontSize = child.fontSize || 16;
  const fontWeight = child.fontWeight || 400;
  const fontStyle = getFontStyle(fontWeight);

  text.fontName = { family: "Inter", style: fontStyle };
  text.fontSize = fontSize;
  text.characters = child.content || "";

  if (child.color) {
    text.fills = [{ type: "SOLID", color: hexToRgb(child.color) }];
  }

  // 텍스트 정렬
  if (child.textAlign === "center" || child.textAlign === "CENTER") {
    text.textAlignHorizontal = "CENTER";
  } else if (child.textAlign === "right" || child.textAlign === "RIGHT") {
    text.textAlignHorizontal = "RIGHT";
  }

  // 너비 설정
  const nodeWidth = child.width || (canvasWidth - 100);
  text.resize(nodeWidth, text.height);
  text.textAutoResize = "HEIGHT";

  // 행간
  if (fontSize >= 32) {
    text.lineHeight = { value: fontSize * 1.2, unit: "PIXELS" };
  } else {
    text.lineHeight = { value: fontSize * 1.6, unit: "PIXELS" };
  }

  return text;
}

// 이미지 영역 (회색 자리표시자 + URL 정보)
function createImageNode(child) {
  const frame = figma.createFrame();
  frame.name = child.name || "IMAGE_AREA";
  frame.resize(child.width || 760, child.height || 400);
  frame.fills = [{ type: "SOLID", color: hexToRgb("#E5E7EB") }];
  frame.cornerRadius = 12;

  // 이미지 URL이 있으면 이름에 저장 (나중에 교체 가이드)
  if (child.src) {
    frame.name = `IMAGE: ${child.src.substring(0, 80)}`;

    // 이미지 로드 요청
    figma.ui.postMessage({ type: "load-image", url: child.src, nodeId: frame.id });
  }

  // "사진 교체" 안내 텍스트
  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 14;
  label.characters = child.src ? "이미지 로딩 중..." : "사진을 추가하세요";
  label.fills = [{ type: "SOLID", color: hexToRgb("#9CA3AF") }];
  label.textAlignHorizontal = "CENTER";
  label.resize(child.width || 760, 20);
  label.x = 0;
  label.y = (child.height || 400) / 2 - 10;
  frame.appendChild(label);

  return frame;
}

// 프레임 노드 (컨테이너)
function createFrameNode(child, canvasWidth) {
  const frame = figma.createFrame();
  frame.name = child.name || "Frame";
  frame.resize(child.width || (canvasWidth - 100), 100);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 16;

  if (child.background) {
    frame.fills = [{ type: "SOLID", color: hexToRgb(child.background) }];
  } else {
    frame.fills = [];
  }

  if (child.children) {
    for (const c of child.children) {
      const node = createNode(c, canvasWidth);
      if (node) frame.appendChild(node);
    }
  }

  return frame;
}

// 구분선
function createDivider(canvasWidth) {
  const line = figma.createRectangle();
  line.name = "Divider";
  line.resize(canvasWidth - 100, 1);
  line.fills = [{ type: "SOLID", color: hexToRgb("#E5E7EB") }];
  return line;
}

// font-weight → Figma font style 매핑
function getFontStyle(weight) {
  if (weight >= 700) return "Bold";
  if (weight >= 600) return "Semi Bold";
  if (weight >= 500) return "Medium";
  return "Regular";
}

// hex → Figma RGB (0~1)
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}
