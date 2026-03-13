"use strict";

const CONFIG = {
  strings: {
    pageTitle: "Selfie with Sammy",
    billboardMessage: "King Library is for EVERYONE",
    insideFrameMessage: "King Library is for YOU",
    helperText: "Take a selfie with Sammy (demo overlay)",
    fallbackNoCamera:
      "Camera unavailable on this device. You can still switch frames and preview the layout.",
    loadingCamera: "Starting camera...",
    permissionDenied:
      "Camera permission is off. Enable camera access in your browser settings and reload this page.",
    genericCameraError:
      "We could not start your camera. Try a different browser or open full screen.",
    iframePermissionHint:
      "If this page is embedded, camera permissions may be blocked. Use Open full screen.",
    shareCaption:
      "King Library is for YOU — selfie with Sammy! #SJSU #KingLibrary",
    shareFallbackMessage:
      "Sharing is not available on this browser. Copy the caption and post with your downloaded PNG."
  },
  links: {
    // HOTSWAP: Replace with public campaign link when ready.
    campaignUrl: "https://library.sjsu.edu/"
  },
  camera: {
    defaultFacingMode: "user",
    width: 1080,
    height: 1440
  },
  sammy: {
    // HOTSWAP: Replace placeholder drawing with sammy.png data URL or hosted path.
    placeholderScale: 0.3,
    anchorX: 0.79,
    anchorY: 0.78
  },
  frames: [
    {
      id: "classic",
      name: "Classic",
      borderColor: "#f2b134",
      borderWidthRatio: 0.016,
      overlayTint: "rgba(0, 26, 59, 0.12)",
      topBanner: {
        show: true,
        bg: "rgba(0, 63, 135, 0.85)",
        logo: "SJSU / King Library",
        message: "King Library is for YOU"
      },
      bottomBanner: {
        show: false,
        bg: "rgba(0, 0, 0, 0.0)",
        logo: "",
        message: ""
      },
      cornerStyle: "brackets"
    },
    {
      id: "bold",
      name: "Bold",
      borderColor: "#ffffff",
      borderWidthRatio: 0.012,
      overlayTint: "rgba(0, 28, 70, 0.18)",
      topBanner: {
        show: false,
        bg: "rgba(0, 0, 0, 0)",
        logo: "",
        message: ""
      },
      bottomBanner: {
        show: true,
        bg: "rgba(0, 43, 92, 0.9)",
        logo: "SJSU",
        message: "King Library is for YOU"
      },
      cornerStyle: "slants"
    },
    {
      id: "spartan",
      name: "Spartan",
      borderColor: "#f2b134",
      borderWidthRatio: 0.01,
      overlayTint: "rgba(0, 20, 52, 0.08)",
      topBanner: {
        show: true,
        bg: "rgba(242, 177, 52, 0.88)",
        logo: "King Library",
        message: ""
      },
      bottomBanner: {
        show: true,
        bg: "rgba(0, 43, 92, 0.84)",
        logo: "",
        message: "King Library is for YOU"
      },
      cornerStyle: "lines"
    }
  ]
};

const state = {
  stream: null,
  currentFacingMode: CONFIG.camera.defaultFacingMode,
  selectedFrameId: CONFIG.frames[0].id,
  captureBlob: null,
  captureUrl: "",
  isPreviewMirrored: true
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  hydrateStaticCopy();
  buildFramePicker();
  setFrame(state.selectedFrameId);
  wireEvents();
  initCamera();
});

function cacheElements() {
  el.billboardMessage = document.getElementById("billboardMessage");
  el.helperText = document.getElementById("helperText");
  el.openFullScreenLink = document.getElementById("openFullScreenLink");
  el.cameraVideo = document.getElementById("cameraVideo");
  el.stageState = document.getElementById("stageState");
  el.framePicker = document.getElementById("framePicker");
  el.liveOverlay = document.getElementById("liveOverlay");
  el.topBanner = document.getElementById("topBanner");
  el.bottomBanner = document.getElementById("bottomBanner");
  el.logoTop = document.getElementById("logoTop");
  el.logoBottom = document.getElementById("logoBottom");
  el.insideFrameMessageTop = document.getElementById("insideFrameMessageTop");
  el.insideFrameMessageBottom = document.getElementById("insideFrameMessageBottom");
  el.flipBtn = document.getElementById("flipBtn");
  el.captureBtn = document.getElementById("captureBtn");
  el.shareBtn = document.getElementById("shareBtn");
  el.downloadLink = document.getElementById("downloadLink");
  el.previewCard = document.getElementById("previewCard");
  el.previewImage = document.getElementById("previewImage");
  el.shareModal = document.getElementById("shareModal");
  el.shareModalMessage = document.getElementById("shareModalMessage");
  el.copyCaptionBtn = document.getElementById("copyCaptionBtn");
  el.closeModalBtn = document.getElementById("closeModalBtn");
}

function hydrateStaticCopy() {
  document.title = CONFIG.strings.pageTitle;
  el.billboardMessage.textContent = CONFIG.strings.billboardMessage;
  el.helperText.textContent = CONFIG.strings.helperText;
  el.shareModalMessage.textContent = CONFIG.strings.shareFallbackMessage;
  el.openFullScreenLink.href = window.location.href;
}

function buildFramePicker() {
  el.framePicker.innerHTML = "";
  CONFIG.frames.forEach((frame) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "frame-btn";
    btn.dataset.frameId = frame.id;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", `Select ${frame.name} frame`);
    btn.innerHTML = `${frame.name}`;
    btn.addEventListener("click", () => setFrame(frame.id));
    el.framePicker.appendChild(btn);
  });
}

function wireEvents() {
  el.flipBtn.addEventListener("click", async () => {
    state.currentFacingMode = state.currentFacingMode === "user" ? "environment" : "user";
    await initCamera();
  });

  el.captureBtn.addEventListener("click", capturePhoto);
  el.shareBtn.addEventListener("click", shareCapture);
  el.copyCaptionBtn.addEventListener("click", copyCaptionToClipboard);
  el.closeModalBtn.addEventListener("click", () => el.shareModal.close());

  if (typeof el.shareModal.addEventListener === "function") {
    el.shareModal.addEventListener("click", (event) => {
      const dialogDimensions = el.shareModal.getBoundingClientRect();
      const clickedOutside =
        event.clientX < dialogDimensions.left ||
        event.clientX > dialogDimensions.right ||
        event.clientY < dialogDimensions.top ||
        event.clientY > dialogDimensions.bottom;
      if (clickedOutside) el.shareModal.close();
    });
  }
}

async function initCamera() {
  stopCurrentStream();
  showStageState(CONFIG.strings.loadingCamera, "loading");

  let stream;
  try {
    stream = await requestCameraStream(state.currentFacingMode);
  } catch (error) {
    handleCameraError(error);
    return;
  }

  state.stream = stream;
  el.cameraVideo.srcObject = stream;

  state.isPreviewMirrored = state.currentFacingMode === "user";
  el.cameraVideo.style.transform = state.isPreviewMirrored ? "scaleX(-1)" : "scaleX(1)";

  try {
    await el.cameraVideo.play();
    hideStageState();
  } catch (_err) {
    showStageState(CONFIG.strings.genericCameraError, "error");
  }
}

async function requestCameraStream(facingMode) {
  const preferred = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (firstError) {
    if (
      firstError &&
      (firstError.name === "OverconstrainedError" ||
        firstError.name === "NotFoundError" ||
        firstError.name === "ConstraintNotSatisfiedError")
    ) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
    throw firstError;
  }
}

function stopCurrentStream() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
}

function handleCameraError(error) {
  const inIframe = window.self !== window.top;
  const hint = inIframe ? ` ${CONFIG.strings.iframePermissionHint}` : "";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStageState(`${CONFIG.strings.fallbackNoCamera}${hint}`, "error");
    return;
  }

  if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    showStageState(`${CONFIG.strings.permissionDenied}${hint}`, "error");
    return;
  }

  if (error && (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")) {
    showStageState(`${CONFIG.strings.fallbackNoCamera}${hint}`, "error");
    return;
  }

  showStageState(`${CONFIG.strings.genericCameraError}${hint}`, "error");
}

function setFrame(frameId) {
  const frame = getFrameById(frameId);
  if (!frame) return;
  state.selectedFrameId = frame.id;

  const buttons = el.framePicker.querySelectorAll(".frame-btn");
  buttons.forEach((btn) => {
    const active = btn.dataset.frameId === frame.id;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  applyFrameToLiveOverlay(frame);
  updateDownloadMetadata();
}

function applyFrameToLiveOverlay(frame) {
  el.liveOverlay.style.boxShadow = `inset 0 0 0 ${Math.max(
    2,
    Math.floor(el.liveOverlay.clientWidth * frame.borderWidthRatio)
  )}px ${frame.borderColor}`;
  el.liveOverlay.style.background = frame.overlayTint;

  el.topBanner.style.display = frame.topBanner.show ? "flex" : "none";
  el.topBanner.style.background = frame.topBanner.bg;
  el.logoTop.textContent = frame.topBanner.logo;
  el.logoTop.style.display = frame.topBanner.logo ? "inline-flex" : "none";
  el.insideFrameMessageTop.textContent =
    frame.topBanner.message !== undefined
      ? frame.topBanner.message
      : CONFIG.strings.insideFrameMessage;

  el.bottomBanner.style.display = frame.bottomBanner.show ? "flex" : "none";
  el.bottomBanner.style.background = frame.bottomBanner.bg;
  el.logoBottom.textContent = frame.bottomBanner.logo;
  el.logoBottom.style.display = frame.bottomBanner.logo ? "inline-flex" : "none";
  el.insideFrameMessageBottom.textContent =
    frame.bottomBanner.message !== undefined
      ? frame.bottomBanner.message
      : CONFIG.strings.insideFrameMessage;
}

function capturePhoto() {
  if (!state.stream || !el.cameraVideo.videoWidth || !el.cameraVideo.videoHeight) {
    showStageState("Camera preview is not ready yet.", "error");
    return;
  }

  const frame = getFrameById(state.selectedFrameId);
  const canvas = document.createElement("canvas");
  canvas.width = CONFIG.camera.width;
  canvas.height = CONFIG.camera.height;
  const ctx = canvas.getContext("2d");

  drawVideoCover(ctx, canvas.width, canvas.height, el.cameraVideo, state.isPreviewMirrored);
  drawFrameOverlay(ctx, canvas.width, canvas.height, frame);
  drawSammyOverlay(ctx, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (!blob) return;
    setCaptureResult(blob, frame.name);
  }, "image/png");
}

function drawVideoCover(ctx, targetW, targetH, video, mirror) {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcRatio > targetRatio) {
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / targetRatio;
    sy = (srcH - sh) / 2;
  }

  ctx.save();
  if (mirror) {
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
  ctx.restore();
}

function drawFrameOverlay(ctx, w, h, frame) {
  ctx.save();
  ctx.fillStyle = frame.overlayTint;
  ctx.fillRect(0, 0, w, h);

  const border = Math.max(8, Math.floor(w * frame.borderWidthRatio));
  ctx.strokeStyle = frame.borderColor;
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, w - border, h - border);

  drawFrameCorners(ctx, w, h, frame, border);
  drawBannerOnCanvas(ctx, w, h, frame.topBanner, "top");
  drawBannerOnCanvas(ctx, w, h, frame.bottomBanner, "bottom");
  ctx.restore();
}

function drawFrameCorners(ctx, w, h, frame, border) {
  const c = frame.borderColor;
  const size = Math.floor(Math.min(w, h) * 0.1);
  ctx.save();
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = Math.max(4, border / 1.6);

  if (frame.cornerStyle === "brackets") {
    drawBracket(ctx, border, border, size, "tl");
    drawBracket(ctx, w - border, border, size, "tr");
    drawBracket(ctx, border, h - border, size, "bl");
    drawBracket(ctx, w - border, h - border, size, "br");
  } else if (frame.cornerStyle === "slants") {
    drawSlant(ctx, border, border, size, "tl");
    drawSlant(ctx, w - border, border, size, "tr");
    drawSlant(ctx, border, h - border, size, "bl");
    drawSlant(ctx, w - border, h - border, size, "br");
  } else {
    drawLineCorner(ctx, border, border, size, "tl");
    drawLineCorner(ctx, w - border, border, size, "tr");
    drawLineCorner(ctx, border, h - border, size, "bl");
    drawLineCorner(ctx, w - border, h - border, size, "br");
  }
  ctx.restore();
}

function drawBracket(ctx, x, y, size, pos) {
  ctx.beginPath();
  if (pos === "tl") {
    ctx.moveTo(x + size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + size);
  } else if (pos === "tr") {
    ctx.moveTo(x - size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + size);
  } else if (pos === "bl") {
    ctx.moveTo(x + size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - size);
  } else {
    ctx.moveTo(x - size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - size);
  }
  ctx.stroke();
}

function drawSlant(ctx, x, y, size, pos) {
  ctx.beginPath();
  if (pos === "tl") {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x + size, y);
  } else if (pos === "tr") {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x - size, y);
  } else if (pos === "bl") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
  } else {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y);
  }
  ctx.stroke();
}

function drawLineCorner(ctx, x, y, size, pos) {
  ctx.beginPath();
  if (pos === "tl") {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
  } else if (pos === "tr") {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y);
    ctx.lineTo(x - size, y);
  } else if (pos === "bl") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
  } else {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y);
    ctx.lineTo(x - size, y);
  }
  ctx.stroke();
}

function drawBannerOnCanvas(ctx, w, h, banner, position) {
  if (!banner.show) return;

  const bannerH = Math.round(h * 0.12);
  const y = position === "top" ? 0 : h - bannerH;
  const padX = Math.round(w * 0.04);

  ctx.fillStyle = banner.bg;
  ctx.fillRect(0, y, w, bannerH);

  const logoText = banner.logo;
  if (logoText) {
    ctx.font = `700 ${Math.round(h * 0.023)}px sans-serif`;
    const logoWidth = ctx.measureText(logoText).width + 30;
    const logoH = Math.round(h * 0.042);
    const logoY = y + (bannerH - logoH) / 2;

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    roundRect(ctx, padX, logoY, logoWidth, logoH, logoH / 2, false, true);

    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(h * 0.02)}px sans-serif`;
    ctx.fillText(logoText, padX + 14, logoY + logoH * 0.68);
  }

  const msg =
    banner.message !== undefined ? banner.message : CONFIG.strings.insideFrameMessage;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(h * 0.035)}px sans-serif`;
  const msgX = padX + (logoText ? Math.round(w * 0.24) : 0);
  if (msg) ctx.fillText(msg, msgX, y + bannerH * 0.64);
}

function drawSammyOverlay(ctx, w, h) {
  const scale = CONFIG.sammy.placeholderScale;
  const baseW = w * scale;
  const baseH = baseW * 1.2;
  const x = w * CONFIG.sammy.anchorX - baseW / 2;
  const y = h * CONFIG.sammy.anchorY - baseH / 2;

  // HOTSWAP: Draw actual sammy.png via Image() and ctx.drawImage(...) here.
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 4;

  const path = new Path2D(
    "M92 20c-12 2-20 15-18 28l3 23c-18 8-28 28-23 47l9 30c-11 8-17 22-15 36l3 27h98l3-27c2-14-4-28-15-36l9-30c5-19-5-39-23-47l3-23c2-13-6-26-18-28l-8-1-8 9-8-9-8 1z"
  );
  ctx.scale(baseW / 200, baseH / 240);
  ctx.fill(path);
  ctx.stroke(path);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(75, 102, 6, 0, Math.PI * 2);
  ctx.arc(125, 102, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(84, 128);
  ctx.quadraticCurveTo(100, 142, 116, 128);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function setCaptureResult(blob, frameName) {
  if (state.captureUrl) URL.revokeObjectURL(state.captureUrl);

  state.captureBlob = blob;
  state.captureUrl = URL.createObjectURL(blob);
  el.previewImage.src = state.captureUrl;
  el.previewCard.hidden = false;

  const fileName = buildCaptureFilename(frameName);
  el.downloadLink.href = state.captureUrl;
  el.downloadLink.download = fileName;
  el.downloadLink.classList.remove("disabled");

  el.shareBtn.disabled = false;
}

function updateDownloadMetadata() {
  if (!state.captureBlob) return;
  const frame = getFrameById(state.selectedFrameId);
  el.downloadLink.download = buildCaptureFilename(frame.name);
}

function buildCaptureFilename(frameName) {
  const cleanFrame = frameName.toLowerCase().replace(/\s+/g, "-");
  const stamp = new Date().toISOString().slice(0, 10);
  return `king-library-selfie-${cleanFrame}-${stamp}.png`;
}

async function shareCapture() {
  if (!state.captureBlob) {
    await copyCaptionToClipboard();
    showStageState("Take a capture first. Caption copied for convenience.", "error");
    return;
  }

  const shareData = {
    title: CONFIG.strings.insideFrameMessage,
    text: CONFIG.strings.shareCaption,
    url: CONFIG.links.campaignUrl
  };

  try {
    if (navigator.share) {
      const frame = getFrameById(state.selectedFrameId);
      const fileName = buildCaptureFilename(frame.name);
      const file = new File([state.captureBlob], fileName, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          ...shareData,
          files: [file]
        });
        return;
      }

      await navigator.share(shareData);
      return;
    }
  } catch (_err) {
    // Ignore user-cancel and continue to fallback modal if needed.
  }

  if (typeof el.shareModal.showModal === "function") {
    el.shareModal.showModal();
  } else {
    alert(`${CONFIG.strings.shareFallbackMessage}\n\n${CONFIG.strings.shareCaption}`);
  }
}

async function copyCaptionToClipboard() {
  try {
    await navigator.clipboard.writeText(CONFIG.strings.shareCaption);
    showStageState("Caption copied to clipboard.", "ok");
    setTimeout(hideStageState, 1400);
  } catch (_err) {
    const temp = document.createElement("textarea");
    temp.value = CONFIG.strings.shareCaption;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }
}

function showStageState(message, type) {
  el.stageState.hidden = false;
  el.stageState.textContent = message;
  el.stageState.classList.remove("error");
  if (type === "error") el.stageState.classList.add("error");
}

function hideStageState() {
  el.stageState.hidden = true;
  el.stageState.textContent = "";
  el.stageState.classList.remove("error");
}

function getFrameById(frameId) {
  return CONFIG.frames.find((frame) => frame.id === frameId);
}

window.initCamera = initCamera;
window.setFrame = setFrame;
window.capturePhoto = capturePhoto;
window.shareCapture = shareCapture;
