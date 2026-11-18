export async function openRearCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("no-camera");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
}

export async function flipCamera(current) {
  const track = current.getVideoTracks()[0];
  const facing = track.getSettings?.().facingMode === "user" ? "environment" : "user";
  current.getTracks().forEach((item) => item.stop());
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1920 } },
  });
}

export async function setTorch(stream, on) {
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  if (!caps.torch) return false;
  await track.applyConstraints({ advanced: [{ torch: on }] });
  return true;
}
