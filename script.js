"use strict";

const CONFIG = {
  strings: {
    pageTitle: "Selfie with Sammy",
    billboardMessage: "King Library is for EVERYONE",
    insideFrameMessage: "King Library is for YOU",
    helperText: "Take a selfie with Sammy (demo overlay)",
    loadingCamera: "Starting camera...",
    permissionDenied:
      "Camera permission is off. Enable camera access in your browser settings and reload this page.",
    fallbackNoCamera:
      "Camera unavailable on this device. You can still switch frames and preview the layout.",
    genericCameraError:
      "We could not start your camera. Try a different browser or open full screen.",
    iframePermissionHint:
      "If this page is embedded, camera permissions may be blocked. Use Open full screen.",
    arUnavailable:
      "AR mode is not supported on this browser/device yet. Staying in selfie mode.",
    arFallbackNotice:
      "AR mode enabled (beta). Camera fallback is active while Sammy anchors are finalized.",
    shareCaption:
      "King Library is for YOU — selfie with Sammy! #SJSU #KingLibrary",
    shareFallbackMessage:
      "Sharing is not available on this browser. Copy the caption and post with your downloaded PNG."
  },
  links: {
    // HOTSWAP: Replace with public campaign link when ready.
    campaignUrl: "https://library.sjsu.edu/"
  },
  analytics: {
    enabled: true,
    debugConsole: false
  },
  assets: {
    // HOTSWAP: bump this per campaign release.
    campaignVersion: "2026-03-selfie-mvp",
    sammy: {
      // HOTSWAP: replace with production Sammy art.
      path: "assets/sammy.png",
      version: "1",
      enabled: true
    },
    frames: {
      // HOTSWAP: replace frame asset filenames or versions here only.
      polaroid01: { path: "assets/Polaroid Design-01.png", version: "1" },
      polaroid02: { path: "assets/Polaroid Design-02.png", version: "1" }
    }
  },
  camera: {
    defaultFacingMode: "user",
    width: 1080,
    height: 1440,
    frameAssetOverscan: 0.018,
    cropProfiles: {
      default: { biasX: 0, biasY: 0 },
      selfiePortrait: { biasX: 0, biasY: -0.06 }
    }
  },
  sammy: {
    defaultPose: { x: 0.79, y: 0.78, scale: 0.3 }
  },
  frames: [
    {
      id: "polaroid01",
      name: "Polaroid 01",
      assetId: "polaroid01",
      topBanner: { show: false, bg: "rgba(0,0,0,0)", logo: "", message: "" },
      bottomBanner: { show: false, bg: "rgba(0,0,0,0)", logo: "", message: "" },
      overlayTint: "rgba(0,0,0,0)",
      borderColor: "#ffffff",
      borderWidthRatio: 0.012
    },
    {
      id: "polaroid02",
      name: "Polaroid 02",
      assetId: "polaroid02",
      topBanner: { show: false, bg: "rgba(0,0,0,0)", logo: "", message: "" },
      bottomBanner: { show: false, bg: "rgba(0,0,0,0)", logo: "", message: "" },
      overlayTint: "rgba(0,0,0,0)",
      borderColor: "#f2b134",
      borderWidthRatio: 0.01
    },
    {
      id: "classic",
      name: "Classic",
      overlayTint: "rgba(0, 26, 59, 0.12)",
      borderColor: "#f2b134",
      borderWidthRatio: 0.016,
      topBanner: {
        show: true,
        bg: "rgba(0, 63, 135, 0.85)",
        logo: "SJSU / King Library",
        message: "King Library is for YOU"
      },
      bottomBanner: { show: false, bg: "rgba(0,0,0,0)", logo: "", message: "" }
    }
  ],
  qaMatrix: [
    "iOS Safari (camera permission and share)",
    "Android Chrome (camera, frame switch, share)",
    "Iframe embed with restricted permissions",
    "Full-screen fallback path",
    "No camera / denied permission states"
  ]
};

const state = {
  stream: null,
  currentFacingMode: CONFIG.camera.defaultFacingMode,
  selectedFrameId: CONFIG.frames[0].id,
  captureBlob: null,
  captureUrl: "",
  isPreviewMirrored: true,
  frameImageCache: new Map(),
  sammyImage: null,
  sammyPose: { ...CONFIG.sammy.defaultPose },
  activeCropProfile: "default",
  mode: "selfie",
  arSupported: false
};

const el = {};

const ARController = {
  active: false,
  initialized: false,
  async init() {
    this.initialized = true;
  },
  async start() {
    if (!this.initialized) await this.init();
    this.active = true;
  },
  stop() {
    this.active = false;
  }
};

const AnalyticsAdapter = {
  events: [],
  track(eventName, payload = {}) {
    if (!CONFIG.analytics.enabled) return;
    const event = {
      eventName,
      payload,
      campaignVersion: CONFIG.assets.campaignVersion,
      ts: new Date().toISOString()
    };
    this.events.push(event);
    if (typeof window.onSammyAnalyticsEvent === "function") {
      window.onSammyAnalyticsEvent(event);
    }
    if (CONFIG.analytics.debugConsole) {
      console.info("[analytics]", eventName, payload);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  hydrateStaticCopy();
  buildFramePicker();
  wireEvents();
  preloadFrameAssets();
  preloadSammyAsset();
  applySammyPoseToLive();
  updateSammyCalibrationReadout();
  setFrame(state.selectedFrameId);
  updateModeButtons();
  detectARSupport();
  initCamera();
  AnalyticsAdapter.track("app_loaded");
});

function cacheElements() {
  el.billboardMessage = document.getElementById("billboardMessage");
  el.helperText = document.getElementById("helperText");
  el.openFullScreenLink = document.getElementById("openFullScreenLink");
  el.cameraVideo = document.getElementById("cameraVideo");
  el.stageState = document.getElementById("stageState");
  el.framePicker = document.getElementById("framePicker");
  el.liveOverlay = document.getElementById("liveOverlay");
  el.frameAssetLive = document.getElementById("frameAssetLive");
  el.topBanner = document.getElementById("topBanner");
  el.bottomBanner = document.getElementById("bottomBanner");
  el.logoTop = document.getElementById("logoTop");
  el.logoBottom = document.getElementById("logoBottom");
  el.insideFrameMessageTop = document.getElementById("insideFrameMessageTop");
  el.insideFrameMessageBottom = document.getElementById("insideFrameMessageBottom");
  el.sammyWrap = document.getElementById("sammyWrap");
  el.sammyLive = document.getElementById("sammyLive");
  el.sammyImageLive = document.getElementById("sammyImageLive");
  el.modeSelfieBtn = document.getElementById("modeSelfieBtn");
  el.modeArBtn = document.getElementById("modeArBtn");
  el.flipBtn = document.getElementById("flipBtn");
  el.captureBtn = document.getElementById("captureBtn");
  el.shareBtn = document.getElementById("shareBtn");
  el.downloadLink = document.getElementById("downloadLink");
  el.calibrateBtn = document.getElementById("calibrateBtn");
  el.sammyCalibration = document.getElementById("sammyCalibration");
  el.sammyXRange = document.getElementById("sammyXRange");
  el.sammyYRange = document.getElementById("sammyYRange");
  el.sammyScaleRange = document.getElementById("sammyScaleRange");
  el.resetSammyBtn = document.getElementById("resetSammyBtn");
  el.sammyCalibrationReadout = document.getElementById("sammyCalibrationReadout");
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
  el.sammyXRange.value = String(state.sammyPose.x);
  el.sammyYRange.value = String(state.sammyPose.y);
  el.sammyScaleRange.value = String(state.sammyPose.scale);
}

function wireEvents() {
  el.modeSelfieBtn.addEventListener("click", () => {
    setExperienceMode("selfie", "mode_toggle");
  });
  el.modeArBtn.addEventListener("click", () => {
    setExperienceMode("ar", "mode_toggle");
  });

  el.flipBtn.addEventListener("click", async () => {
    state.currentFacingMode = state.currentFacingMode === "user" ? "environment" : "user";
    AnalyticsAdapter.track("camera_flip", { facingMode: state.currentFacingMode });
    await initCamera();
  });

  el.captureBtn.addEventListener("click", capturePhoto);
  el.shareBtn.addEventListener("click", shareCapture);
  el.copyCaptionBtn.addEventListener("click", copyCaptionToClipboard);
  el.closeModalBtn.addEventListener("click", () => el.shareModal.close());

  el.calibrateBtn.addEventListener("click", () => {
    const nextHidden = !el.sammyCalibration.hidden;
    el.sammyCalibration.hidden = nextHidden;
    el.calibrateBtn.setAttribute("aria-expanded", String(!nextHidden));
  });

  el.sammyXRange.addEventListener("input", () => {
    state.sammyPose.x = Number(el.sammyXRange.value);
    onSammyPoseChanged();
  });
  el.sammyYRange.addEventListener("input", () => {
    state.sammyPose.y = Number(el.sammyYRange.value);
    onSammyPoseChanged();
  });
  el.sammyScaleRange.addEventListener("input", () => {
    state.sammyPose.scale = Number(el.sammyScaleRange.value);
    onSammyPoseChanged();
  });
  el.resetSammyBtn.addEventListener("click", () => {
    state.sammyPose = { ...CONFIG.sammy.defaultPose };
    el.sammyXRange.value = String(state.sammyPose.x);
    el.sammyYRange.value = String(state.sammyPose.y);
    el.sammyScaleRange.value = String(state.sammyPose.scale);
    onSammyPoseChanged();
  });

  if (typeof el.shareModal.addEventListener === "function") {
    el.shareModal.addEventListener("click", (event) => {
      const rect = el.shareModal.getBoundingClientRect();
      const clickedOutside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (clickedOutside) el.shareModal.close();
    });
  }
}

function onSammyPoseChanged() {
  applySammyPoseToLive();
  updateSammyCalibrationReadout();
  AnalyticsAdapter.track("sammy_pose_changed", { ...state.sammyPose });
}

function updateSammyCalibrationReadout() {
  const pctX = Math.round(state.sammyPose.x * 100);
  const pctY = Math.round(state.sammyPose.y * 100);
  const pctScale = Math.round(state.sammyPose.scale * 100);
  el.sammyCalibrationReadout.textContent = `X ${pctX}% · Y ${pctY}% · Scale ${pctScale}%`;
}

function applySammyPoseToLive() {
  el.sammyWrap.style.left = `${(state.sammyPose.x * 100).toFixed(1)}%`;
  el.sammyWrap.style.top = `${(state.sammyPose.y * 100).toFixed(1)}%`;
  el.sammyWrap.style.width = `${(state.sammyPose.scale * 100).toFixed(1)}%`;
}

async function detectARSupport() {
  let supported = false;
  if (navigator.xr && typeof navigator.xr.isSessionSupported === "function") {
    try {
      supported = await navigator.xr.isSessionSupported("immersive-ar");
    } catch (_err) {
      supported = false;
    }
  }
  state.arSupported = supported;
  updateModeButtons();
  AnalyticsAdapter.track("ar_capability_checked", { supported });
}

function updateModeButtons() {
  const selfieActive = state.mode === "selfie";
  const arActive = state.mode === "ar";
  el.modeSelfieBtn.classList.toggle("active", selfieActive);
  el.modeSelfieBtn.setAttribute("aria-pressed", String(selfieActive));
  el.modeArBtn.classList.toggle("active", arActive);
  el.modeArBtn.setAttribute("aria-pressed", String(arActive));
  el.modeArBtn.classList.toggle("unavailable", !state.arSupported);
  el.modeArBtn.setAttribute("aria-disabled", String(!state.arSupported));
}

async function setExperienceMode(nextMode, source = "code") {
  if (nextMode === state.mode) return;

  if (nextMode === "ar" && !state.arSupported) {
    showStageState(CONFIG.strings.arUnavailable, "error");
    setTimeout(hideStageState, 1700);
    state.mode = "selfie";
    updateModeButtons();
    AnalyticsAdapter.track("mode_change_blocked", { requested: "ar", source });
    return;
  }

  state.mode = nextMode;
  if (nextMode === "ar") {
    await ARController.start();
    showStageState(CONFIG.strings.arFallbackNotice, "loading");
    setTimeout(() => {
      if (state.stream) hideStageState();
    }, 1600);
  } else {
    ARController.stop();
    if (state.stream) hideStageState();
  }

  updateModeButtons();
  AnalyticsAdapter.track("mode_changed", { mode: nextMode, source });
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
    updatePreviewCropProfile();
    hideStageState();
    AnalyticsAdapter.track("camera_started", { facingMode: state.currentFacingMode });
  } catch (_err) {
    showStageState(CONFIG.strings.genericCameraError, "error");
    AnalyticsAdapter.track("camera_play_failed");
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

function updatePreviewCropProfile() {
  const vW = el.cameraVideo.videoWidth || 0;
  const vH = el.cameraVideo.videoHeight || 1;
  const ratio = vW / vH;
  const useSelfiePortrait = state.currentFacingMode === "user" && ratio < 1;
  state.activeCropProfile = useSelfiePortrait ? "selfiePortrait" : "default";
  const profile = getActiveCropProfile();
  const posY = 50 + profile.biasY * 100;
  el.cameraVideo.style.objectPosition = `50% ${posY}%`;
}

function getActiveCropProfile() {
  return CONFIG.camera.cropProfiles[state.activeCropProfile] || CONFIG.camera.cropProfiles.default;
}

function stopCurrentStream() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
}

function handleCameraError(error) {
  const inIframe = window.self !== window.top;
  const hint = inIframe ? ` ${CONFIG.strings.iframePermissionHint}` : "";
  let message = `${CONFIG.strings.genericCameraError}${hint}`;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    message = `${CONFIG.strings.fallbackNoCamera}${hint}`;
  } else if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    message = `${CONFIG.strings.permissionDenied}${hint}`;
  } else if (error && (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")) {
    message = `${CONFIG.strings.fallbackNoCamera}${hint}`;
  }

  showStageState(message, "error");
  AnalyticsAdapter.track("camera_error", { errorName: error ? error.name : "unknown" });
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
    btn.textContent = frame.name;
    btn.addEventListener("click", () => setFrame(frame.id));
    el.framePicker.appendChild(btn);
  });
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
  AnalyticsAdapter.track("frame_changed", { frameId: frame.id, frameName: frame.name });
}

function applyFrameToLiveOverlay(frame) {
  const frameAssetUrl = resolveFrameAssetUrl(frame);
  const hasAssetFrame = Boolean(frameAssetUrl);

  if (hasAssetFrame) {
    el.frameAssetLive.src = frameAssetUrl;
    el.frameAssetLive.style.display = "block";
    const scale = 1 + CONFIG.camera.frameAssetOverscan * 2;
    el.frameAssetLive.style.transform = `scale(${scale})`;
    el.liveOverlay.style.boxShadow = "none";
    el.liveOverlay.style.background = "transparent";
  } else {
    el.frameAssetLive.removeAttribute("src");
    el.frameAssetLive.style.display = "none";
    el.frameAssetLive.style.transform = "none";
    el.liveOverlay.style.boxShadow = `inset 0 0 0 ${Math.max(
      2,
      Math.floor(el.liveOverlay.clientWidth * frame.borderWidthRatio)
    )}px ${frame.borderColor}`;
    el.liveOverlay.style.background = frame.overlayTint;
  }

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

async function capturePhoto() {
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
  await drawFrameOverlay(ctx, canvas.width, canvas.height, frame);
  drawSammyOverlay(ctx, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (!blob) return;
    setCaptureResult(blob, frame.name);
    AnalyticsAdapter.track("capture_success", { frameId: frame.id });
  }, "image/png");
}

function drawVideoCover(ctx, targetW, targetH, video, mirror) {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;
  const crop = getActiveCropProfile();

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

  const offsetX = crop.biasX * (srcW - sw);
  const offsetY = crop.biasY * (srcH - sh);
  sx = clamp(sx + offsetX, 0, srcW - sw);
  sy = clamp(sy + offsetY, 0, srcH - sh);

  ctx.save();
  if (mirror) {
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
  ctx.restore();
}

async function drawFrameOverlay(ctx, w, h, frame) {
  const frameAssetUrl = resolveFrameAssetUrl(frame);
  if (frameAssetUrl) {
    const img = await getFrameAssetImage(frameAssetUrl);
    if (img) {
      const overX = Math.round(w * CONFIG.camera.frameAssetOverscan);
      const overY = Math.round(h * CONFIG.camera.frameAssetOverscan);
      ctx.drawImage(img, -overX, -overY, w + overX * 2, h + overY * 2);
    }
    return;
  }

  ctx.save();
  ctx.fillStyle = frame.overlayTint;
  ctx.fillRect(0, 0, w, h);
  const border = Math.max(8, Math.floor(w * frame.borderWidthRatio));
  ctx.strokeStyle = frame.borderColor;
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, w - border, h - border);
  drawBannerOnCanvas(ctx, w, h, frame.topBanner, "top");
  drawBannerOnCanvas(ctx, w, h, frame.bottomBanner, "bottom");
  ctx.restore();
}

function drawBannerOnCanvas(ctx, w, h, banner, position) {
  if (!banner.show) return;
  const bannerH = Math.round(h * 0.12);
  const y = position === "top" ? 0 : h - bannerH;
  const padX = Math.round(w * 0.04);

  ctx.fillStyle = banner.bg;
  ctx.fillRect(0, y, w, bannerH);

  if (banner.logo) {
    ctx.font = `700 ${Math.round(h * 0.023)}px sans-serif`;
    const logoWidth = ctx.measureText(banner.logo).width + 30;
    const logoH = Math.round(h * 0.042);
    const logoY = y + (bannerH - logoH) / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    roundRect(ctx, padX, logoY, logoWidth, logoH, logoH / 2, false, true);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(h * 0.02)}px sans-serif`;
    ctx.fillText(banner.logo, padX + 14, logoY + logoH * 0.68);
  }

  const msg = banner.message !== undefined ? banner.message : CONFIG.strings.insideFrameMessage;
  if (msg) {
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(h * 0.035)}px sans-serif`;
    const msgX = padX + (banner.logo ? Math.round(w * 0.24) : 0);
    ctx.fillText(msg, msgX, y + bannerH * 0.64);
  }
}

function drawSammyOverlay(ctx, w, h) {
  const rect = getSammyRect(w, h);
  if (state.sammyImage) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 18;
    ctx.drawImage(state.sammyImage, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    return;
  }

  // HOTSWAP: remove fallback path once final sammy.png is guaranteed available.
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 4;
  const path = new Path2D(
    "M92 20c-12 2-20 15-18 28l3 23c-18 8-28 28-23 47l9 30c-11 8-17 22-15 36l3 27h98l3-27c2-14-4-28-15-36l9-30c5-19-5-39-23-47l3-23c2-13-6-26-18-28l-8-1-8 9-8-9-8 1z"
  );
  ctx.scale(rect.w / 200, rect.h / 240);
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

function getSammyRect(w, h) {
  const baseW = w * state.sammyPose.scale;
  const baseH = baseW * 1.2;
  const centerX = w * state.sammyPose.x;
  const centerY = h * state.sammyPose.y;
  return {
    x: centerX - baseW / 2,
    y: centerY - baseH / 2,
    w: baseW,
    h: baseH
  };
}

function setCaptureResult(blob, frameName) {
  if (state.captureUrl) URL.revokeObjectURL(state.captureUrl);
  state.captureBlob = blob;
  state.captureUrl = URL.createObjectURL(blob);
  el.previewImage.src = state.captureUrl;
  el.previewCard.hidden = false;
  el.downloadLink.href = state.captureUrl;
  el.downloadLink.download = buildCaptureFilename(frameName);
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
  AnalyticsAdapter.track("share_attempt", { hasCapture: Boolean(state.captureBlob) });
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
        await navigator.share({ ...shareData, files: [file] });
        AnalyticsAdapter.track("share_success", { mode: "file_share" });
        return;
      }
      await navigator.share(shareData);
      AnalyticsAdapter.track("share_success", { mode: "text_share" });
      return;
    }
  } catch (_err) {
    // user cancelled or share unavailable
  }

  if (typeof el.shareModal.showModal === "function") {
    el.shareModal.showModal();
  } else {
    alert(`${CONFIG.strings.shareFallbackMessage}\n\n${CONFIG.strings.shareCaption}`);
  }
  AnalyticsAdapter.track("share_fallback_modal");
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

function preloadFrameAssets() {
  CONFIG.frames.forEach((frame) => {
    const url = resolveFrameAssetUrl(frame);
    if (url) getFrameAssetImage(url);
  });
}

function preloadSammyAsset() {
  const sammyUrl = resolveSammyAssetUrl();
  if (!sammyUrl) {
    applySammyLiveAsset(null);
    return;
  }
  loadImage(sammyUrl)
    .then((img) => {
      state.sammyImage = img;
      applySammyLiveAsset(sammyUrl);
    })
    .catch(() => {
      state.sammyImage = null;
      applySammyLiveAsset(null);
    });
}

function applySammyLiveAsset(src) {
  if (src) {
    el.sammyImageLive.src = src;
    el.sammyImageLive.style.display = "block";
    el.sammyLive.style.display = "none";
  } else {
    el.sammyImageLive.removeAttribute("src");
    el.sammyImageLive.style.display = "none";
    el.sammyLive.style.display = "block";
  }
}

function resolveFrameAssetUrl(frame) {
  if (!frame.assetId) return "";
  const manifest = CONFIG.assets.frames[frame.assetId];
  if (!manifest || !manifest.path) return "";
  return getVersionedAssetUrl(manifest.path, manifest.version);
}

function resolveSammyAssetUrl() {
  const entry = CONFIG.assets.sammy;
  if (!entry || !entry.enabled || !entry.path) return "";
  return getVersionedAssetUrl(entry.path, entry.version);
}

function getVersionedAssetUrl(path, version) {
  if (!version) return encodeURI(path);
  return `${encodeURI(path)}?v=${encodeURIComponent(version)}`;
}

function getFrameById(frameId) {
  return CONFIG.frames.find((frame) => frame.id === frameId);
}

async function getFrameAssetImage(url) {
  if (state.frameImageCache.has(url)) return state.frameImageCache.get(url);
  try {
    const img = await loadImage(url);
    state.frameImageCache.set(url, img);
    return img;
  } catch (_err) {
    return null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

window.initCamera = initCamera;
window.setFrame = setFrame;
window.capturePhoto = capturePhoto;
window.shareCapture = shareCapture;
